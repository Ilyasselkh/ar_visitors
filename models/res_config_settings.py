from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    @api.constrains('ar_visitors_validity_months', 'ar_visitors_kiosk_token_minutes', 'ar_visitors_face_recognition_attempts', 'ar_visitors_face_recognition_retry_delay')
    def _check_visitor_settings(self):
        for record in self:
            if (record.ar_visitors_validity_months < 1
                    or record.ar_visitors_kiosk_token_minutes < 1
                    or record.ar_visitors_face_recognition_attempts < 1
                    or record.ar_visitors_face_recognition_retry_delay <= 0):
                raise ValidationError(_('Les durees doivent etre strictement positives.'))

    ar_visitors_validity_months = fields.Integer(
        string="Validité du quiz (mois)", default=3,
        config_parameter="ar_visitors.validity_months",
    )
    ar_visitors_kiosk_token_minutes = fields.Integer(
        string="Durée d'une session borne (minutes)", default=15,
        config_parameter="ar_visitors.kiosk_token_minutes",
    )
    ar_visitors_face_recognition_attempts = fields.Integer(
        string="Nombre de tentatives de reconnaissance faciale", default=3,
        config_parameter="ar_visitors.face_recognition_attempts",
        help="Nombre total de captures automatiques avant de proposer le parcours manuel.",
    )
    ar_visitors_face_recognition_retry_delay = fields.Float(
        string="Délai entre les tentatives (secondes)", default=1.5,
        config_parameter="ar_visitors.face_recognition_retry_delay",
        help="Délai d'attente avant chaque nouvelle tentative automatique.",
    )


class VisitorSettings(models.TransientModel):
    _name = 'ar.visitor.settings'
    _description = 'Paramètres visiteurs'

    validity_months = fields.Integer(string='Validité du quiz (mois)', required=True)
    kiosk_minutes = fields.Integer(string='Durée de session (minutes)', required=True)
    face_recognition_attempts = fields.Integer(string='Tentatives de reconnaissance faciale', required=True)
    face_recognition_retry_delay = fields.Float(string='Délai entre les tentatives (secondes)', required=True)

    @api.model
    def default_get(self, names):
        values = super().default_get(names)
        params = self.env['ir.config_parameter'].sudo()
        defaults = {'validity_months': int(params.get_param('ar_visitors.validity_months', 3)),
                    'kiosk_minutes': int(params.get_param('ar_visitors.kiosk_token_minutes', 15)),
                    'face_recognition_attempts': int(params.get_param('ar_visitors.face_recognition_attempts', 3)),
                    'face_recognition_retry_delay': float(params.get_param('ar_visitors.face_recognition_retry_delay', 1.5))}
        values.update({key: val for key, val in defaults.items() if key in names})
        return values

    def action_save(self):
        self.ensure_one()
        self.check_access('write')
        if (self.validity_months < 1 or self.kiosk_minutes < 1
                or self.face_recognition_attempts < 1 or self.face_recognition_retry_delay <= 0):
            raise ValidationError(_('Les durées doivent être positives.'))
        params = self.env['ir.config_parameter'].sudo()
        for key, value in [('validity_months', self.validity_months), ('kiosk_token_minutes', self.kiosk_minutes), ('face_recognition_attempts', self.face_recognition_attempts), ('face_recognition_retry_delay', self.face_recognition_retry_delay)]:
            params.set_param('ar_visitors.' + key, value)
        return {'type': 'ir.actions.act_window_close'}
