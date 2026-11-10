from odoo import fields, models
from ..visitor_i18n import visitor_text


class SurveyUserInput(models.Model):
    _inherit = 'survey.user_input'
    visitor_invitation_id = fields.Many2one('ar.visitor.invitation', copy=False, ondelete='restrict', groups='base.group_system')

    def _visitor_safety_language(self):
        self.ensure_one()
        invitation = self.sudo().visitor_invitation_id
        if invitation and invitation._live():
            return invitation.language
        visit = self.env['ar.visitor.visit'].sudo().search([
            ('survey_user_input_id', '=', self.id), ('survey_id', '=', self.survey_id.id),
            ('kiosk_token', '!=', False), ('kiosk_token_expires_at', '>=', fields.Datetime.now()),
        ], limit=1)
        return visit.language if visit else False

    def _visitor_safety_instructions(self):
        if not self:
            return []
        self.ensure_one()
        language = self._visitor_safety_language()
        if not language:
            return []
        lang = {'fr': 'fr_FR', 'en': 'en_US', 'es': 'es_ES', 'ar': 'ar_001'}[language]
        instructions = self.env['ar.visitor.safety.instruction'].sudo().with_context(lang=lang).search([])
        images = self.env['ar.visitor.safety.image'].sudo().search([
            ('instruction_id', 'in', instructions.ids), ('language', '=', language),
        ])
        grouped = {}
        for image in images:
            grouped.setdefault(image.instruction_id.id, []).append({
                'name': image.name,
                'url': '/ar-visitors/survey/%s/%s/safety-image/%s' % (
                    self.survey_id.access_token, self.access_token, image.id),
            })
        return [{'emoji': instruction.emoji, 'name': instruction._localized_text(language),
                 'images': grouped.get(instruction.id, [])} for instruction in instructions]

    def _visitor_return_url(self):
        self.ensure_one()
        invitation = self.env['ar.visitor.invitation'].sudo().search([
            ('survey_user_input_id', '=', self.id), ('token', '!=', False),
        ], limit=1)
        if invitation and invitation._live():
            return invitation._url()
        visit = self.env['ar.visitor.visit'].sudo().search([
            ('survey_user_input_id', '=', self.id), ('state', 'in', ['host_pending', 'profile_done']),
        ], limit=1)
        return '/ar-visitors/kiosk/%s' % visit.kiosk_token if visit.kiosk_token else False

    def _visitor_continue_label(self):
        self.ensure_one()
        return visitor_text("Continuer", self.env.context.get("lang"))

    def _mark_done(self):
        result = super()._mark_done()
        self.env['ar.visitor.invitation'].sudo().search([
            ('survey_user_input_id', 'in', self.ids), ('state', '=', 'quiz_pending'),
        ])._finish_quiz()
        self.env['ar.visitor.visit'].sudo().search([
            ('survey_user_input_id', 'in', self.ids),
            ('state', '=', 'quiz_pending'),
            ('quiz_completed', '=', False),
        ]).action_check_quiz()
        return result
