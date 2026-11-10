"""Integration smoke checks on a disposable Odoo database; rolls back all test data.

Run inside the Odoo container with AR_PREREG_TEST_DB set to a codex_ar_prereg_* DB.
Never run this against a production database. No email is sent by this script.
"""
import os
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import odoo
from odoo import api, fields, SUPERUSER_ID
from odoo.tools import config
from odoo.orm.registry import Registry

database = os.environ.get('AR_PREREG_TEST_DB', 'codex_ar_prereg_20261008')
assert database.startswith('codex_ar_prereg_'), 'A disposable test database is required'
config.parse_config(['-c', '/etc/odoo/odoo.conf', '--db_host', os.environ['HOST'],
                     '--db_user', os.environ['USER'], '--db_password', os.environ['PASSWORD'],
                     '-d', database, '--log-level', 'error'])

with Registry(database).cursor() as cr:
    env = api.Environment(cr, SUPERUSER_ID, {})
    env['res.lang'].with_context(active_test=False).search([('code', 'in', ['fr_FR', 'en_US', 'es_ES', 'ar_001'])]).write({'active': True})
    Invitation = env['ar.visitor.invitation']
    today = fields.Date.today()
    invitation = Invitation.create({'email': 'visitor@example.invalid', 'planned_date': today})
    env['ir.config_parameter'].set_param('web.base.url', 'https://example.invalid')
    with patch.object(type(invitation), '_mail') as mail:
        invitation.action_send()
        assert invitation.state == 'sent' and len(invitation.token) == 43
        assert mail.call_count == 1
        old_token = invitation.token
        invitation.action_send()
        assert old_token != invitation.token
        from odoo.addons.ar_visitors.prereg_security import code_digest
        invitation.write({'otp_hash': code_digest(invitation.token, '012345'),
                          'otp_expires_at': fields.Datetime.now() + timedelta(minutes=10)})
        assert not invitation._verify_code('000000')
        assert invitation._verify_code('012345')
        assert not invitation._verify_code('012345')
        assert invitation._send_code()
        assert not invitation._send_code()

    survey = env['survey.survey'].create({'title': 'Safety test', 'scoring_type': 'scoring_without_answers',
                                         'scoring_success_min': 80, 'users_login_required': False})
    question = env['survey.question'].create({'survey_id': survey.id, 'title': 'Safe?',
                                             'question_type': 'simple_choice', 'is_scored_question': True})
    correct = env['survey.question.answer'].create({'question_id': question.id, 'value': 'Yes', 'answer_score': 1})
    env['survey.question.answer'].create({'question_id': question.id, 'value': 'No', 'answer_score': 0})
    env['ar.visitor.document'].create({'name': 'Safety test', 'language': 'fr', 'survey_id': survey.id, 'version': 'test'})
    invitation.write({'first_name': 'Test', 'last_name': 'Visitor', 'cin': 'TESTINV1234', 'consent_at': fields.Datetime.now()})
    before_visits = env['ar.visitor.visit'].search_count([])
    assert invitation._start_quiz()
    answer = invitation.survey_user_input_id
    assert answer.visitor_invitation_id == invitation and not answer.partner_id
    answer._save_lines(question, correct.id)
    answer._mark_done()
    assert answer.scoring_success
    assert invitation.state == 'ready' and invitation.person_id
    assert env['ar.visitor.visit'].search_count([]) == before_visits
    assert not invitation.visit_id
    assert invitation._quiz_valid()
    values = invitation._arrival_values(invitation.person_id)
    assert values['state'] == 'host_pending' and not values['check_in_at']
    invitation.planned_date = today + timedelta(days=30)
    assert not invitation._arrival_values(invitation.person_id)
    invitation.planned_date = today

    from odoo.addons.ar_visitors.prereg_labels import labels
    for language in ('fr', 'en', 'es', 'ar'):
        invitation.language = language
        for state, logged, failed in [('sent', False, False), ('sent', True, False),
                                       ('quiz_pending', True, False), ('quiz_pending', True, True), ('ready', True, False)]:
            invitation.state = state
            rendered = env['ir.qweb']._render('ar_visitors.preregistration_page', {
                'invitation': invitation, 'logged': logged, 'live': True, 'message': None,
                'labels': labels(language), 'failed': failed, 'countries': env['res.country'],
                'request': SimpleNamespace(csrf_token=lambda: 'test'),
            }, minimal_qcontext=True)
            assert labels(language)['title'] in str(rendered)
            if os.environ.get('AR_PREREG_EXPORT_PREVIEW') and language == 'fr' and state == 'sent' and logged:
                from pathlib import Path
                import re
                import sass
                root = Path('/mnt/extra-addons/ar_visitors')
                css = (root / 'static/src/css/preregistration.css').read_text()
                css += sass.compile(string=(root / 'static/src/scss/face_attendance_bridge.scss').read_text())
                css += (root / 'static/src/css/public_reception.css').read_text()
                html = re.sub(r'<link\b[^>]*>', '', str(rendered))
                html = html.replace('</head>', '<style>' + css + '</style></head>')
                Path('/tmp/ar-visitors-preview.html').write_text(html)
    invitation.language = 'fr'
    invitation.state = 'ready'
    group_field = 'group_ids' if 'group_ids' in env['res.users']._fields else 'groups_id'
    operator = env['res.users'].with_context(no_reset_password=True).create({
        'name': 'Test Reception', 'login': 'prereg-reception-test',
        group_field: [(6, 0, [env.ref('base.group_user').id, env.ref('ar_visitors.group_ar_visitors_user').id])],
    })
    operator_invitation = invitation.with_user(operator)
    operator_copy = operator_invitation.copy()
    assert operator_copy.state == 'draft' and not operator_copy.cin
    wizard = env['ar.visitor.identify.wizard'].with_user(operator).create({'cin': invitation.cin, 'language': 'fr'})
    wizard.action_identify()
    invitation.invalidate_recordset()
    visit = invitation.visit_id
    assert visit.state == 'host_pending' and not visit.check_in_at and invitation.state == 'on_site'
    assert visit.survey_user_input_id == answer
    host = env['hr.employee'].create({'name': 'Test Host', 'work_email': 'host@example.invalid'})
    visit.write({'host_employee_id': host.id, 'entry_signature': False})
    from odoo.exceptions import UserError
    try:
        visit.with_context(visitor_defer_notification=True).action_check_in()
        raise AssertionError('Missing signature must be rejected')
    except UserError:
        pass
    # A tiny valid PNG signature keeps image validation active in this smoke test.
    import base64, io
    from PIL import Image
    output = io.BytesIO()
    Image.new('RGB', (20, 20), 'black').save(output, format='PNG')
    visit.entry_signature = base64.b64encode(output.getvalue())
    with patch.object(type(visit), '_send_host_notification') as host_mail:
        visit.with_context(visitor_defer_notification=True).action_check_in()
        assert not host_mail.called
    assert visit.check_in_at and visit.state == 'checked_in' and invitation.state == 'arrived'
    assert visit.notification_state == 'pending'
    copy = invitation.copy()
    assert copy.state == 'draft' and not copy.token and not copy.cin
    copy.action_cancel()
    assert not copy._live() and not copy.token
    shared = Invitation.with_user(operator).create({'is_shared': True, 'planned_date': today})
    with patch.object(type(invitation), '_mail') as mail:
        shared.action_send()
        url = shared.share_url
        shared.action_send()
        assert shared.share_url == url and '/invite/' in url
        assert not mail.called
    children = Invitation.create([{
        'is_shared': False, 'parent_id': shared.id, 'planned_date': today,
        'state': 'sent', 'token': 'shared-test-child-' + str(index),
        'expires_at': shared.expires_at,
    } for index in range(2)])
    assert len(shared.registration_ids) == 2
    assert all(child._live() for child in children)
    assert children[0].token != children[1].token
    shared.action_cancel()
    assert not any(child._live() for child in children)
    cr.rollback()
print('PASS: Odoo invitation, OTP, quiz success, no remote check-in, arrival/date gates, QWeb in 4 languages, copy and cancellation; all test data rolled back.')
