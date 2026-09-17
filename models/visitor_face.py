import json
import math

from odoo import api, fields, models, _
from odoo.exceptions import AccessError, ValidationError
from odoo.addons.eh_hr_face_kiosk.controllers.face_match import _cosine_distance


def parse_samples(value):
    if not isinstance(value, str) or len(value) > 40000:
        raise ValidationError(_("Capture faciale invalide."))
    try:
        samples = json.loads(value)
        if not isinstance(samples, list) or not 3 <= len(samples) <= 5:
            raise ValueError()
        vectors = []
        for sample in samples:
            vector = sample['embedding']
            if not isinstance(vector, list) or len(vector) != 128:
                raise ValueError()
            if any(type(v) not in (int, float) or not math.isfinite(v) for v in vector):
                raise ValueError()
            norm = math.hypot(*vector)
            if not math.isfinite(norm) or norm < 1e-8:
                raise ValueError()
            vectors.append([v / norm for v in vector])
        return vectors
    except (ValueError, TypeError, KeyError, OverflowError):
        raise ValidationError(_("Capturez entre trois et cinq échantillons valides du visage.")) from None


class VisitorFace(models.Model):
    _inherit = 'ar.visitor.person'

    face_samples = fields.Text(copy=False, groups='ar_visitors.group_ar_visitors_api_admin')
    face_company_id = fields.Many2one('res.company', copy=False,
                                     groups='ar_visitors.group_ar_visitors_api_admin')
    face_enrolled = fields.Boolean(compute='_compute_face_enrolled')

    @api.depends('face_samples', 'consent')
    def _compute_face_enrolled(self):
        for person in self:
            person.face_enrolled = bool(person.sudo().face_samples and person.consent)

    @api.constrains('face_samples', 'face_company_id', 'consent')
    def _check_face_samples(self):
        for person in self:
            if person.sudo().face_samples:
                if not person.consent or not person.sudo().face_company_id:
                    raise ValidationError(_("Le consentement et la société sont obligatoires pour enregistrer le visage."))
                parse_samples(person.sudo().face_samples)

    def write(self, vals):
        if 'consent' in vals and not vals['consent']:
            # Erase biometric samples when consent is withdrawn.
            vals = dict(vals, face_samples=False, face_company_id=False)
        return super().write(vals)

    def action_enrol_face(self):
        self.ensure_one()
        self.check_access('write')
        if not self.env.user.has_group('ar_visitors.group_ar_visitors_api_admin'):
            raise AccessError(_("Le droit Accès Personnes est nécessaire."))
        if not self.consent:
            raise ValidationError(_("Enregistrez le consentement du visiteur avant la capture."))
        return {'type': 'ir.actions.act_window', 'name': _('Enregistrer le visage'),
                'res_model': 'ar.visitor.face.wizard', 'views': [(False, 'form')],
                'target': 'new', 'context': dict(self.env.context, default_person_id=self.id)}


class VisitorFaceWizard(models.TransientModel):
    _name = 'ar.visitor.face.wizard'
    _description = 'Caméra visiteurs'

    person_id = fields.Many2one('ar.visitor.person', readonly=True)
    samples_json = fields.Text()

    def action_process(self):
        self.ensure_one()
        self.check_access('write')
        if not self.env.user.has_group('ar_visitors.group_ar_visitors_user'):
            raise AccessError(_("Le droit Accès au module est nécessaire."))
        vectors = parse_samples(self.samples_json)
        if self.person_id:
            if not self.env.user.has_group('ar_visitors.group_ar_visitors_api_admin'):
                raise AccessError(_("Le droit Accès Personnes est nécessaire pour enregistrer un visage."))
            self.person_id.check_access('write')
            self.person_id.write({'face_samples': self.samples_json,
                                  'face_company_id': self.env.company.id})
            self.samples_json = False
            return {'type': 'ir.actions.act_window_close'}
        # Reception can match but cannot read or export the biometric gallery.
        people = self.env['ar.visitor.person'].sudo().with_context(active_test=False).search([
            ('face_company_id', '=', self.env.company.id),
            ('consent', '=', True), ('face_samples', '!=', False),
        ])
        matches = []
        for person in people:
            enrolled = parse_samples(person.face_samples)
            distance = sum(min(_cosine_distance(v, ref) for ref in enrolled) for v in vectors) / len(vectors)
            matches.append((distance, person.id))
        matches.sort()
        # Conservative threshold and ambiguity rejection; manual CIN remains available.
        if not matches or matches[0][0] > 0.15:
            raise ValidationError(_("Visage non reconnu. Réessayez ou utilisez la CIN / passeport."))
        if len(matches) > 1 and matches[1][0] - matches[0][0] < 0.03:
            raise ValidationError(_("Reconnaissance ambiguë. Utilisez la CIN / passeport."))
        person = people.browse(matches[0][1])
        if not person.active or person.status != 'active':
            raise ValidationError(_("Ce visiteur n'est pas autorisé. Contactez le responsable de l'accueil."))
        wizard = self.env['ar.visitor.identify.wizard'].create({'cin': person.cin, 'step': 'language'})
        self.samples_json = False
        return {'type': 'ir.actions.act_window', 'name': _('Choisissez votre langue'),
                'res_model': wizard._name, 'res_id': wizard.id,
                'views': [(False, 'form')], 'target': 'new'}
