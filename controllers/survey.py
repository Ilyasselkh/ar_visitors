from urllib.parse import quote

from odoo import fields, http
from odoo.tools import html2plaintext
from odoo.http import request
from odoo.addons.survey.controllers.main import Survey
from werkzeug.exceptions import NotFound
from werkzeug.utils import redirect
from .preregistration import authenticated


class VisitorSurvey(Survey):
    @http.route('/ar-visitors/survey/<string:survey_token>/<string:answer_token>/safety-image/<int:image_id>',
                type='http', auth='public', methods=['GET'])
    def visitor_safety_image(self, survey_token, answer_token, image_id, **kwargs):
        access = self._get_access_data(survey_token, answer_token)
        if access['validity_code'] is not True or not access['answer_sudo']:
            raise NotFound()
        language = access['answer_sudo']._visitor_safety_language()
        image = request.env['ar.visitor.safety.image'].sudo().search([
            ('id', '=', image_id), ('language', '=', language), ('instruction_id.active', '=', True),
        ], limit=1) if language else False
        if not image:
            raise NotFound()
        response = request.env['ir.binary'].sudo()._get_stream_from(image, 'image').get_response()
        response.headers['Cache-Control'] = 'private, no-store'
        return response

    @http.route()
    def survey_retry(self, survey_token, answer_token, **post):
        survey, answer = self._fetch_from_access_token(survey_token, answer_token)
        invitation = self._invitation(answer)
        if invitation:
            return redirect(invitation._url())
        return super().survey_retry(survey_token, answer_token, **post)

    @http.route()
    def survey_submit(self, survey_token, answer_token, **post):
        survey, answer = self._fetch_from_access_token(survey_token, answer_token)
        # Let Survey validate access, validate inputs and save the original answers.
        result = super().survey_submit(survey_token, answer_token, **post)
        correct_answers, page = result
        if page.get('error'):
            return result
        visit = request.env['ar.visitor.visit'].sudo().search([
            ('survey_user_input_id', '=', answer.id), ('survey_id', '=', survey.id),
            ('kiosk_token_expires_at', '>=', fields.Datetime.now()),
            ('kiosk_token', '!=', False),
        ], limit=1)
        if not visit:
            visit = self._invitation(answer)
        if not visit or answer.is_session_answer:
            return result
        if 'previous_page_id' in post:
            return {}, page
        questions, _page_id = survey._get_survey_questions(
            answer=answer, page_id=post.get('page_id'), question_id=post.get('question_id'))
        questions = (questions - answer._get_inactive_conditional_questions()).filtered('is_scored_question')
        feedback = []
        for question in questions:
            images = {}
            lines = answer.user_input_line_ids.filtered(lambda line: line.question_id == question)
            if not lines:
                continue
            expected = question._get_correct_answers().get(question.id)
            if expected is None:
                continue
            if question.question_type in ('simple_choice', 'multiple_choice'):
                selected = set(lines.filtered(lambda line: not line.skipped).suggested_answer_id.ids)
                valid = (bool(selected) and selected <= set(expected)) if question.question_type == 'simple_choice' else selected == set(expected)
                choices = question.suggested_answer_ids.filtered(lambda choice: choice.id in expected)
                labels = choices.mapped('value')
                if not valid:
                    for index, choice in enumerate(choices):
                        if choice.value_image:
                            images[str(index)] = '/survey/get_question_image/%s/%s/%s/%s' % (
                                quote(survey_token, safe=''), quote(answer_token, safe=''), question.id, choice.id)
            else:
                valid = all(not line.skipped and line.answer_is_correct for line in lines)
                labels = [str(expected)]
            if not valid:
                item = {'question': html2plaintext(question.title),
                        'answers': [html2plaintext(label or '') for label in labels]}
                if images:
                    item['answer_images'] = images
                feedback.append(item)
        # No native correction for correct answers; the visitor UI handles mistakes.
        page['visitor_feedback'] = feedback
        page['visitor_feedback_language'] = visit.language
        return {}, page

    def _fetch_from_access_token(self, survey_token, answer_token):
        survey, answer = super()._fetch_from_access_token(survey_token, answer_token)
        if survey and answer:
            invitation = self._invitation(answer)
            if invitation and not authenticated(invitation):
                raise NotFound()
            visit = request.env["ar.visitor.visit"].sudo().search([
                ("survey_user_input_id", "=", answer.id),
                ("survey_id", "=", survey.id),
                ("kiosk_token_expires_at", ">=", fields.Datetime.now()),
                ("kiosk_token", "!=", False),
            ], limit=1)
            visit = visit or invitation
            if visit:
                lang = {"fr": "fr_FR", "en": "en_US", "es": "es_ES", "ar": "ar_001"}[visit.language]
                request.update_context(lang=lang)
                survey, answer = survey.with_context(lang=lang), answer.with_context(lang=lang)
        return survey, answer

    def _invitation(self, answer):
        return answer.sudo().visitor_invitation_id if answer else request.env['ar.visitor.invitation']


    def _check_validity(self, survey_sudo, answer_sudo, answer_token, ensure_token=True, check_partner=True):
        invitation = self._invitation(answer_sudo)
        if invitation:
            if not authenticated(invitation):
                return 'answer_wrong_user'
            check_partner = False
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
