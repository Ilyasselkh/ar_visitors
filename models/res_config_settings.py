from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ResConfigSettings(models.TransientModel):
    _inherit = "res.config.settings"

    @api.constrains('ar_visitors_validity_months', 'ar_visitors_kiosk_token_minutes')
    def _check_visitor_settings(self):
        for record in self:
            if record.ar_visitors_validity_months < 1 or record.ar_visitors_kiosk_token_minutes < 1:
                raise ValidationError(_('Les durees doivent etre strictement positives.'))

    ar_visitors_validity_months = fields.Integer(
        string="Validité du quiz (mois)", default=3,
        config_parameter="ar_visitors.validity_months",
    )
    ar_visitors_update_person_from_facial = fields.Boolean(
        string="Mettre à jour l'identité depuis le système facial",
        config_parameter="ar_visitors.update_person_from_facial",
    )
    ar_visitors_kiosk_token_minutes = fields.Integer(
        string="Durée d'une session borne (minutes)", default=15,
        config_parameter="ar_visitors.kiosk_token_minutes",
    )
