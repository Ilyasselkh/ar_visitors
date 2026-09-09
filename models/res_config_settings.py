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


class VisitorSettings(models.TransientModel):
    _name = 'ar.visitor.settings'
    _description = 'Paramètres visiteurs'

    validity_months = fields.Integer(string='Validité du quiz (mois)', required=True)
    kiosk_minutes = fields.Integer(string='Durée de session (minutes)', required=True)
    update_person = fields.Boolean(string='Mettre à jour les fiches existantes')

    @api.model
    def default_get(self, names):
        values = super().default_get(names)
        params = self.env['ir.config_parameter'].sudo()
        defaults = {'validity_months': int(params.get_param('ar_visitors.validity_months', 3)),
                    'kiosk_minutes': int(params.get_param('ar_visitors.kiosk_token_minutes', 15)),
                    'update_person': params.get_param('ar_visitors.update_person_from_facial') == 'True'}
        values.update({key: val for key, val in defaults.items() if key in names})
        return values

    def action_save(self):
        self.ensure_one()
        self.check_access('write')
        if self.validity_months < 1 or self.kiosk_minutes < 1:
            raise ValidationError(_('Les durées doivent être positives.'))
        params = self.env['ir.config_parameter'].sudo()
        for key, value in [('validity_months', self.validity_months), ('kiosk_token_minutes', self.kiosk_minutes), ('update_person_from_facial', self.update_person)]:
            params.set_param('ar_visitors.' + key, value)
        return {'type': 'ir.actions.act_window_close'}
