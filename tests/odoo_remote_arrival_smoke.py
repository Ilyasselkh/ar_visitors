"""Remote registration to facial arrival integration; test data are rolled back."""
import base64
import io
import uuid
from datetime import timedelta
from PIL import Image
from odoo import fields
from odoo.exceptions import ValidationError

try:
    env.user.group_ids = [(4, env.ref('ar_visitors.group_ar_visitors_admin').id)]
    env['ar.visitor.document'].search([('company_id', '=', env.company.id), ('language', '=', 'fr')]).write({'active': False})
    survey = env['survey.survey'].create({'title': 'Remote arrival test', 'scoring_type': 'scoring_without_answers', 'scoring_success_min': 80})
    question = env['survey.question'].create({'survey_id': survey.id, 'title': 'Safe?', 'question_type': 'simple_choice', 'is_scored_question': True})
    correct = env['survey.question.answer'].create({'question_id': question.id, 'value': 'Yes', 'answer_score': 1})
    env['survey.question.answer'].create({'question_id': question.id, 'value': 'No', 'answer_score': 0})
    env['ar.visitor.document'].create({'name': 'Remote arrival test', 'survey_id': survey.id, 'language': 'fr', 'version': uuid.uuid4().hex})
    buffer = io.BytesIO(); Image.new('RGB', (32, 32), 'blue').save(buffer, 'PNG')
    photo = base64.b64encode(buffer.getvalue()).decode()
    def preregister(date):
        invitation = env['ar.visitor.invitation'].create({'email': 'arrival@example.invalid', 'planned_date': date,
            'language': 'fr', 'state': 'sent', 'token': uuid.uuid4().hex, 'expires_at': fields.Datetime.now() + timedelta(days=30),
            'cin': 'REMOTE' + uuid.uuid4().hex[:15], 'first_name': 'Remote', 'last_name': 'Visitor',
            'photo': photo, 'consent_at': fields.Datetime.now()})
        assert invitation._start_quiz()
        invitation.survey_user_input_id._save_lines(question, correct.id)
        invitation.survey_user_input_id._mark_done()
        assert invitation.state == 'ready' and invitation.person_id
        return invitation
    Bridge = env['ar.visitor.face.bridge']
    Visit = env['ar.visitor.visit']
    invitation = preregister(fields.Date.context_today(env.user))
    assert not invitation.person_id.recent_visit
    answer = invitation.survey_user_input_id
    before = Visit.search_count([])
    action = Bridge.start_visit(photo, invitation.person_id.id, 'en', 'arrival')
    visit = invitation.visit_id
    assert visit.state == 'host_pending' and not visit.check_in_at
    assert visit.quiz_completed and visit.validation_was_valid and visit.survey_user_input_id == answer
    assert visit.invitation_id == invitation and invitation.state == 'on_site' and not invitation.token
    assert visit.language == 'en'
    assert Visit.search_count([]) == before + 1
    again = Bridge.start_visit(photo, invitation.person_id.id, 'en', 'arrival')
    assert again['params']['url'] == action['params']['url']
    assert Visit.search_count([]) == before + 1
    host = env['hr.employee'].create({'name': 'Remote Arrival Host', 'company_id': env.company.id, 'work_email': 'host@example.invalid'})
    visit.write({'host_employee_id': host.id, 'entry_signature': photo})
    visit.with_context(visitor_defer_notification=True).action_check_in()
    assert invitation.state == 'arrived' and visit.check_in_at
    try:
        Bridge.start_visit(photo, invitation.person_id.id, 'fr', 'arrival')
        raise AssertionError('Duplicate arrival accepted')
    except ValidationError:
        pass
    expired_quiz = preregister(fields.Date.context_today(env.user))
    expired_quiz.quiz_completed_at = fields.Datetime.now() - timedelta(days=1000)
    Bridge.start_visit(photo, expired_quiz.person_id.id, 'fr', 'arrival')
    assert expired_quiz.visit_id.state == 'identity_check'
    assert not expired_quiz.visit_id.quiz_completed
    expired_quiz.visit_id.action_select_language()
    assert expired_quiz.visit_id.state == 'quiz_pending'
    tomorrow = preregister(fields.Date.context_today(env.user) + timedelta(days=1))
    action = Bridge.start_visit(photo, tomorrow.person_id.id, 'fr', 'arrival')
    assert tomorrow.state == 'ready' and not tomorrow.visit_id
    print('REMOTE ARRIVAL OK: valid remote quiz reused, language choice, host/signature, resume, duplicate prevention, expired quiz, planned date')
finally:
    env.cr.rollback()
