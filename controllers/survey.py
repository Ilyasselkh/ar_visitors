from odoo import fields
from odoo.http import request
from odoo.addons.survey.controllers.main import Survey


class VisitorSurvey(Survey):
    def _check_validity(self, survey_sudo, answer_sudo, answer_token, ensure_token=True, check_partner=True):
        # Anonymous visitor answers also work on a reception PC already logged in.
        # Keep every other Survey access check, and scope this to a live kiosk visit.
        if answer_sudo and not answer_sudo.partner_id:
            visit = request.env['ar.visitor.visit'].sudo().search([
                ('survey_user_input_id', '=', answer_sudo.id),
                ('survey_id', '=', survey_sudo.id),
                ('state', 'in', ['quiz_pending', 'host_pending']),
                ('kiosk_token_expires_at', '>=', fields.Datetime.now()),
                ('kiosk_token', '!=', False),
            ], limit=1)
            if visit:
                check_partner = False
        return super()._check_validity(survey_sudo, answer_sudo, answer_token,
                                       ensure_token=ensure_token, check_partner=check_partner)
