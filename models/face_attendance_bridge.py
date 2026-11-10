import base64
import io
from PIL import Image
from odoo import api, fields, models
from odoo.exceptions import AccessError, ValidationError


class VisitorFaceAttendanceBridge(models.AbstractModel):
    _name = "ar.visitor.face.bridge"
    _inherit = "ar.visitor.localization"
    _description = "Reconnaissance visiteurs avec Face Recognition for HR Attendance"

    def _check_operator(self):
        if not self.env.user.has_group("ar_visitors.group_ar_visitors_user"):
            raise AccessError(self._visitor_text("L’accès au module est nécessaire pour utiliser la reconnaissance faciale."))

    @api.model
    def recognition_attempt_limit(self):
        """Configuration exposed to the facial screen without granting settings access."""
        self._check_operator()
        value = self.env['ir.config_parameter'].sudo().get_param(
            'ar_visitors.face_recognition_attempts', '3')
        try:
            return max(1, int(value))
        except (TypeError, ValueError):
            return 3

    @api.model
    def recognition_retry_delay(self):
        """Return the delay in seconds between automatic camera captures."""
        self._check_operator()
        value = self.env['ir.config_parameter'].sudo().get_param(
            'ar_visitors.face_recognition_retry_delay', '1.5')
        try:
            return max(0.1, float(value))
        except (TypeError, ValueError):
            return 1.5

    def _people_domain(self):
        """Keep face matching within the operator's permitted companies.

        The face screen intentionally works without the separate People-menu
        permission, so this narrowly scoped bridge reads the needed references.
        """
        return ['|', '|', ('visit_ids.company_id', 'in', self.env.companies.ids),
                ('invitation_ids.company_id', 'in', self.env.companies.ids),
                '&', ('visit_ids', '=', False), ('invitation_ids', '=', False)]

    @api.model
    def reference_photos(self, after_id=0):
        self._check_operator()
        people = self.env["ar.visitor.person"].sudo().with_context(active_test=False).search(
            self._people_domain() + [("id", ">", int(after_id))], order="id", limit=40)
        return {
            "people": [{
                "id": p.id,
                "images": [image.decode() if isinstance(image, bytes) else image
                           for image in [p.image_1920] + p.secondary_photo_ids.mapped("image") if image],
            } for p in people],
            "next_id": people[-1].id if len(people) == 40 else False,
        }

    @api.model
    def recognition_person(self, person_id):
        """Return only the details needed for the on-screen recognition check."""
        self._check_operator()
        person = self.env["ar.visitor.person"].sudo().with_context(active_test=False).search(
            self._people_domain() + [("id", "=", int(person_id))], limit=1)
        if not person:
            raise ValidationError(self._visitor_text("Personne introuvable."))
        image = person.image_1920
        if isinstance(image, bytes):
            image = image.decode()
        return {
            "id": person.id,
            "first_name": person.first_name or "",
            "last_name": person.last_name or "",
            "nationality": person.nationality_id.name or "",
            "image": image or False,
            "has_open_visit": bool(self.env["ar.visitor.visit"].search_count([("person_id", "=", person.id), ("company_id", "=", self.env.company.id), ("state", "in", ["checked_in", "signature_pending"])])),
        }

    @api.model
    def start_visit(self, photo, person_id=False, language="fr", purpose="arrival", consent=False):
        self._check_operator()
        languages = {"fr": "fr_FR", "en": "en_US", "es": "es_ES", "ar": "ar_001"}
        if language not in languages:
            raise ValidationError(self._visitor_text("Langue invalide."))
        self = self.with_context(lang=languages[language], visitor_language_selected=True)
        self.env["ar.visitor.visit"].check_access("create")
        try:
            if not isinstance(photo, str) or len(photo) > 12 * 1024 * 1024:
                raise ValueError()
            binary = base64.b64decode(photo, validate=True)
            with Image.open(io.BytesIO(binary)) as image:
                if image.format not in ("PNG", "JPEG", "WEBP") or image.width * image.height > 20000000:
                    raise ValueError()
                image.verify()
        except (ValueError, OSError, Image.DecompressionBombError):
            raise ValidationError(self._visitor_text("Photo invalide."))
        if purpose not in ('arrival', 'profile'):
            raise ValidationError("Parcours invalide.")
        person = self.env['ar.visitor.person'].sudo().with_context(active_test=False).search(
            self._people_domain() + [('id', '=', int(person_id))], limit=1) if person_id else False
        if person_id and not person:
            raise ValidationError(self._visitor_text("Personne introuvable."))
        if person and (not person.active or person.status != 'active'):
            raise ValidationError("Accès non autorisé. Veuillez contacter l’accueil.")
        if person and purpose == 'profile':
            return {'type': 'ir.actions.client', 'tag': 'ar_visitors.kiosk_done', 'params': {'message': 'Votre fiche existe déjà', 'delay': 1000}}
        if not person and not consent:
            raise ValidationError("Le consentement est obligatoire pour créer une fiche visiteur.")
        Visit = self.env['ar.visitor.visit']
        if person:
            self.env.cr.execute("SELECT pg_advisory_xact_lock(hashtext(%s))",
                                ['ar_visitors:%s:%s' % (self.env.company.id, person.cin)])
            if Visit.search_count([('person_id', '=', person.id), ('company_id', '=', self.env.company.id),
                                   ('state', 'in', ['checked_in', 'signature_pending'])]):
                raise ValidationError("Ce visiteur possède déjà une visite en cours.")
        valid = bool(person and person.recent_visit)
        values = {'photo': photo, 'language': language, 'kiosk_purpose': purpose,
                  'kiosk_consent': bool(consent), 'facial_result': 'recognized' if person else 'manual',
                  'state': 'host_pending' if valid else 'identity_check' if person else 'identity_input'}
        if person:
            values.update(person_id=person.id, cin=person.cin, first_name=person.first_name,
                          last_name=person.last_name, visitor_company=person.company_name,
                          nationality_id=person.nationality_id.id, validation_was_valid=valid)
            Invitation = self.env['ar.visitor.invitation'].sudo()
            today = fields.Date.context_today(self)
            resumed = Invitation.search([
                ('person_id', '=', person.id), ('company_id', '=', self.env.company.id),
                ('planned_date', '=', today), ('state', '=', 'on_site'),
                ('visit_id.state', 'in', ['identity_check', 'quiz_pending', 'host_pending']),
            ], limit=1)
            if resumed:
                visit = Visit.browse(resumed.visit_id.id)
                visit.check_access('write')
                visit.write({'photo': photo, 'language': language})
                return visit.action_open_kiosk()
            invitation = Invitation.search([
                ('person_id', '=', person.id), ('company_id', '=', self.env.company.id),
                ('planned_date', '=', today), ('state', '=', 'ready'), ('visit_id', '=', False),
                ('token', '!=', False), ('expires_at', '>=', fields.Datetime.now()),
            ], order='id desc', limit=1)
            if invitation:
                values.update(invitation._arrival_values(person))
                values['photo'] = photo
        answer_id = values.pop('survey_user_input_id', False)
        visit = Visit.create(values)
        if visit.invitation_id:
            if answer_id:
                visit.sudo().write({'survey_user_input_id': answer_id})
            visit.invitation_id.sudo().write({
                'visit_id': visit.id, 'state': 'on_site', 'token': False, 'otp_hash': False,
            })
        return visit.action_open_kiosk()

    @api.model
    def safety_instructions(self, language='fr'):
        self._check_operator()
        languages = {'fr': 'fr_FR', 'en': 'en_US', 'es': 'es_ES', 'ar': 'ar_001'}
        if language not in languages:
            raise ValidationError(self._visitor_text('Langue invalide.'))
        instructions = self.env['ar.visitor.safety.instruction'].with_context(lang=languages[language]).search([])
        images = self.env['ar.visitor.safety.image'].search([
            ('instruction_id', 'in', instructions.ids), ('language', '=', language),
        ])
        grouped = {}
        for image in images:
            grouped.setdefault(image.instruction_id.id, []).append({
                'id': image.id, 'name': image.name,
                'url': '/web/image/ar.visitor.safety.image/%s/image' % image.id,
            })
        return [{'id': instruction.id, 'emoji': instruction.emoji, 'name': instruction._localized_text(language),
                 'images': grouped.get(instruction.id, [])} for instruction in instructions]

    @api.model
    def checkout_for_person(self, person_id, language=False, from_arrival=False):
        """Open the signature dialog only for an active visit of this person."""
        self._check_operator()
        person = self.env["ar.visitor.person"].sudo().with_context(active_test=False).search(
            self._people_domain() + [("id", "=", int(person_id))], limit=1)
        if not person:
            raise ValidationError(self._visitor_text("Personne introuvable."))
        Visit = self.env["ar.visitor.visit"]
        Visit.check_access("read")
        visit = Visit.search([
            ("person_id", "=", person.id),
            ("company_id", "=", self.env.company.id),
            ("state", "in", ("checked_in", "signature_pending")),
        ], order="check_in_at desc, id desc", limit=1)
        if not visit:
            raise ValidationError(self._visitor_text("Aucune visite en cours n'a été trouvée pour cette personne."))
        selected_language = language if language in ("fr", "en", "es", "ar") else visit.language
        wizard = self.env["ar.visitor.checkout.wizard"].create({
            "visit_id": visit.id, "language": selected_language,
        })
        language = {"fr": "fr_FR", "en": "en_US", "es": "es_ES", "ar": "ar_001"}[selected_language]
        titles = {"fr": "Signature de sortie", "en": "Check-out signature", "es": "Firma de salida", "ar": "توقيع المغادرة"}
        return {
            "type": "ir.actions.act_window",
            "name": titles[selected_language],
            "res_model": wizard._name,
            "res_id": wizard.id,
            "views": [(False, "form")],
            "target": "new",
            "context": dict(self.env.context, lang=language, default_language=selected_language,
                            visitor_language_selected=True, visitor_checkout_from_arrival=bool(from_arrival)),
        }
