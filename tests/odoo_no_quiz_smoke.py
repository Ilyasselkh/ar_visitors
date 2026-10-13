"""No-quiz integration checks; disposable database only, always rolled back."""
import base64
import io
import os
from datetime import timedelta
from unittest.mock import patch
from PIL import Image
from odoo import api, fields, SUPERUSER_ID
from odoo.exceptions import UserError
from odoo.tools import config
from odoo.orm.registry import Registry

database = 'codex_ar_prereg_20261008'
assert database.startswith('codex_ar_prereg_')
config.parse_config(['-c', '/etc/odoo/odoo.conf', '--db_host', os.environ['HOST'],
                     '--db_user', os.environ['USER'], '--db_password', os.environ['PASSWORD'],
                     '-d', database, '--log-level', 'error'])
with Registry(database).cursor() as cr:
    env = api.Environment(cr, SUPERUSER_ID, {})
    image = io.BytesIO()
    Image.new('RGB', (20, 20), 'black').save(image, format='PNG')
    photo = base64.b64encode(image.getvalue())
    invitation = env['ar.visitor.invitation'].create({
        'email': 'no-quiz@example.invalid', 'planned_date': fields.Date.today(),
        'state': 'sent', 'token': 'no-quiz-test-token',
        'expires_at': fields.Datetime.now() + timedelta(days=1),
        'first_name': 'No', 'last_name': 'Quiz', 'cin': 'NOQUIZTEST2026',
        'photo': photo, 'consent_at': fields.Datetime.now(),
    })
    with patch.object(type(invitation), '_quiz_unavailable_reason', side_effect=AssertionError('Quiz must not be consulted')):
        assert not invitation._complete_registration()
        invitation.write({'safety_understanding': 'no', 'safety_acknowledged_at': fields.Datetime.now()})
        assert invitation._complete_registration()
    assert invitation.safety_understanding == 'no'
    confirmed = env['ar.visitor.invitation'].create({
        'email': 'confirmed@example.invalid', 'planned_date': fields.Date.today(),
        'state': 'sent', 'token': 'confirmed-test-token',
        'expires_at': fields.Datetime.now() + timedelta(days=1),
        'first_name': 'Confirmed', 'last_name': 'Safety', 'cin': 'SAFETYYESTEST2026',
        'photo': photo, 'consent_at': fields.Datetime.now(),
        'safety_understanding': 'yes', 'safety_acknowledged_at': fields.Datetime.now(),
    })
    assert confirmed._complete_registration() and confirmed.state == 'ready'
    assert not confirmed.survey_user_input_id and not confirmed.visit_id
    assert invitation.state == 'ready' and invitation.person_id
    assert not invitation.quiz_completed_at and not invitation.survey_user_input_id and not invitation.visit_id
    vals = invitation._arrival_values(invitation.person_id)
    assert vals['state'] == 'host_pending' and not vals['quiz_completed']
    visit = env['ar.visitor.visit'].create(vals)
    for values in ({}, {'entry_signature': photo}):
        visit.write(values)
        try:
            visit.action_check_in()
        except UserError:
            pass
        else:
            raise AssertionError('Host and signature must still be required')
    host = env['hr.employee'].create({'name': 'No Quiz Host', 'work_email': 'host@example.invalid'})
    visit.host_employee_id = host
    for choice in (False, 'no'):
        visit.safety_understanding = choice
        try:
            visit.with_context(visitor_defer_notification=True).action_check_in()
        except UserError:
            pass
        else:
            raise AssertionError('Unconfirmed or declined safety must block entry even with host and signature')
        assert visit.state == 'host_pending' and not visit.check_in_at
    visit.safety_understanding = 'yes'
    visit.with_context(visitor_defer_notification=True).action_check_in()
    assert visit.state == 'checked_in' and visit.check_in_at
    assert visit.notification_state == 'pending'
    for purpose, expected in [('arrival', 'host_pending'), ('profile', 'profile_done')]:
        pending = env['ar.visitor.visit'].create({
            'first_name': 'Pending', 'last_name': purpose, 'cin': 'NOQUIZ' + purpose.upper(),
            'photo': photo, 'state': 'quiz_pending', 'kiosk_purpose': purpose,
        })
        pending._continue_without_quiz()
        assert pending.state == expected and not pending.check_in_at
        assert not pending.quiz_completed and not pending.survey_user_input_id
    cr.rollback()
print('PASS: remote registration, arrival, required host/signature, notification, pending journeys; rollback complete')
