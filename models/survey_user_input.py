from odoo import models


class SurveyUserInput(models.Model):
    _inherit = 'survey.user_input'

    def _visitor_return_url(self):
        self.ensure_one()
        visit = self.env['ar.visitor.visit'].sudo().search([
            ('survey_user_input_id', '=', self.id), ('state', '=', 'host_pending'),
        ], limit=1)
        return '/ar-visitors/kiosk/%s' % visit.kiosk_token if visit.kiosk_token else False

    def _mark_done(self):
        result = super()._mark_done()
        self.env['ar.visitor.visit'].sudo().search([
            ('survey_user_input_id', 'in', self.ids),
            ('state', '=', 'quiz_pending'),
            ('quiz_completed', '=', False),
        ]).action_check_quiz()
        return result
