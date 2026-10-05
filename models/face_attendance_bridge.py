import base64
import io
from PIL import Image
from odoo import api, models
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
        return ["|", ("visit_ids.company_id", "in", self.env.companies.ids), ("visit_ids", "=", False)]

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
        }

    @api.model
    def start_visit(self, photo, person_id=False, language="fr"):
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
        values = {"captured_photo": photo, "language": language}
        if person_id:
            person = self.env["ar.visitor.person"].sudo().with_context(active_test=False).search(
                self._people_domain() + [("id", "=", int(person_id))], limit=1)
            if not person:
                raise ValidationError(self._visitor_text("Personne introuvable."))
            values.update(cin=person.cin)
            wizard = self.env["ar.visitor.identify.wizard"].create(values)
            return wizard.action_identify()
        # Unknown faces follow the existing CIN identification flow; no fake identity.
        return {"type": "ir.actions.act_window", "name": self._visitor_text("Identifier le visiteur"),
                "res_model": "ar.visitor.identify.wizard", "views": [(False, "form")],
                "target": "new", "context": dict(self.env.context,
                    default_captured_photo=photo, default_language=language)}

    @api.model
    def checkout_for_person(self, person_id, language=False):
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
            ("state", "in", ("checked_in", "signature_pending")),
        ], order="check_in_at desc, id desc", limit=1)
        if not visit:
            raise ValidationError(self._visitor_text("Aucune visite en cours n'a été trouvée pour cette personne."))
        selected_language = language if language in ("fr", "en", "es", "ar") else visit.language
        wizard = self.env["ar.visitor.checkout.wizard"].create({"visit_id": visit.id, "language": selected_language})
        language = {"fr": "fr_FR", "en": "en_US", "es": "es_ES", "ar": "ar_001"}[selected_language]
        titles = {"fr": "Signature de sortie", "en": "Check-out signature", "es": "Firma de salida", "ar": "توقيع المغادرة"}
        return {
            "type": "ir.actions.act_window",
            "name": titles[selected_language],
            "res_model": wizard._name,
            "res_id": wizard.id,
            "views": [(False, "form")],
            "target": "new",
            "context": dict(self.env.context, lang=language, default_language=selected_language, visitor_language_selected=True),
        }
