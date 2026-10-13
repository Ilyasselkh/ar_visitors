"""Run invitation security/state methods in isolation when no Odoo database is available."""
import ast
import importlib.util
from datetime import datetime, timedelta
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('prereg_security', ROOT / 'prereg_security.py')
security = importlib.util.module_from_spec(spec)
spec.loader.exec_module(security)
NOW = datetime(2026, 10, 8, 12)


def methods(path, names, namespace):
    tree = ast.parse((ROOT / path).read_text(encoding='utf8'))
    selected = [n for c in tree.body if isinstance(c, ast.ClassDef) for n in c.body if isinstance(n, ast.FunctionDef) and n.name in names]
    for method in selected:
        method.decorator_list = []
    exec(compile(ast.Module(body=selected, type_ignores=[]), str(path), 'exec'), namespace)
    return namespace


ns = methods('models/visitor_invitation.py', ['_live', '_verify_code', '_arrival_values', '_finish_quiz'], {
    'fields': NS(Datetime=NS(now=lambda: NOW), Date=NS(context_today=lambda _: NOW.date())),
    'code_matches': security.code_matches,
})


class Record:
    def __init__(self, **values):
        self.__dict__.update(state='sent', token=security.new_token(), expires_at=NOW + timedelta(days=1),
                             otp_expires_at=NOW + timedelta(minutes=10), otp_attempts=0,
                             otp_hash=False, visit_id=False, id=1, planned_date=NOW.date())
        self.__dict__.update(values)

    def _lock(self):
        pass

    def _live(self):
        return ns['_live'](self)

    def write(self, values):
        self.__dict__.update(values)

    def __iter__(self):
        return iter([self])


class InvitationSecurity(unittest.TestCase):
    def test_random_tokens_and_codes(self):
        self.assertNotEqual(security.new_token(), security.new_token())
        self.assertEqual(len(security.new_token()), 43)
        self.assertRegex(security.new_code(), r'^\d{6}$')

    def test_digest_is_bound_to_invitation(self):
        digest = security.code_digest('one', '001234')
        self.assertTrue(security.code_matches('one', '001234', digest))
        self.assertFalse(security.code_matches('two', '001234', digest))
        self.assertFalse(security.code_matches('one', '1234', digest))
        self.assertFalse(security.code_matches('one', '٠٠١٢٣٤', digest))

    def test_code_is_single_use(self):
        record = Record()
        record.otp_hash = security.code_digest(record.token, '001234')
        self.assertTrue(ns['_verify_code'](record, '001234'))
        self.assertFalse(ns['_verify_code'](record, '001234'))

    def test_five_failed_attempts_lock_even_correct_code(self):
        record = Record()
        record.otp_hash = security.code_digest(record.token, '001234')
        for _ in range(5):
            self.assertFalse(ns['_verify_code'](record, '999999'))
        self.assertFalse(ns['_verify_code'](record, '001234'))
        self.assertEqual(record.otp_attempts, 5)

    def test_expired_cancelled_used_invitations_cannot_authenticate(self):
        for values in ({'expires_at': NOW - timedelta(seconds=1)}, {'otp_expires_at': NOW - timedelta(seconds=1)},
                       {'state': 'cancelled'}, {'state': 'on_site'}, {'state': 'arrived'}, {'token': False}):
            record = Record(**values)
            record.otp_hash = security.code_digest(record.token or 'old', '001234')
            self.assertFalse(ns['_verify_code'](record, '001234'))

    def test_ready_does_not_mean_arrived(self):
        self.assertTrue(Record(state='ready')._live())
        self.assertFalse(Record(state='arrived')._live())


class ArrivalTests(unittest.TestCase):
    def setUp(self):
        self.person = NS(id=4, active=True, status='active', first_name='A', last_name='B', cin='AA123',
                         image_1920='photo', nationality_id=NS(id=1), company_name='C')
        self.record = Record(state='ready', person_id=self.person, quiz_completed_at=NOW - timedelta(days=30),
                             survey_id=NS(id=2), survey_user_input_id=NS(id=3))
        self.record._quiz_valid = lambda: True

    def values(self):
        return ns['_arrival_values'](self.record, self.person)

    def test_ready_invitation_skips_quiz_without_checking_in(self):
        values = self.values()
        self.assertEqual(values['state'], 'host_pending')
        self.assertTrue(values['quiz_completed'])
        self.assertFalse(values['check_in_at'])
        self.assertEqual(values['quiz_completed_at'], NOW - timedelta(days=30))

    def test_expired_quiz_requires_full_quiz_again(self):
        self.record._quiz_valid = lambda: False
        values = self.values()
        self.assertEqual(values['state'], 'identity_check')
        self.assertFalse(values['quiz_completed'])
        self.assertFalse(values['survey_user_input_id'])

    def test_future_or_past_planned_date_is_not_consumed(self):
        for days in (-1, 1, 30):
            self.record.planned_date = (NOW + timedelta(days=days)).date()
            self.assertEqual(self.values(), {})

    def test_blocked_or_used_invitation_cannot_skip_quiz(self):
        self.person.status = 'blocked'
        self.assertEqual(self.values(), {})
        self.person.status = 'active'
        self.record.visit_id = NS(id=9)
        self.assertEqual(self.values(), {})


class QuizCompletion(unittest.TestCase):
    def test_failed_quiz_does_not_create_person_or_visit(self):
        record = Record(state='quiz_pending', survey_user_input_id=NS(state='done', scoring_success=False))
        ns['_finish_quiz'](record)
        self.assertEqual(record.state, 'quiz_pending')
        # No environment is provided: any attempt to create a person/visit would fail.

    def test_success_reuses_person_without_overwriting_identity(self):
        person = NS(id=5, active=True, status='active')
        people = NS(sudo=lambda: people, with_context=lambda **kw: people, search=lambda *a, **kw: person)
        env = type('Environment', (dict,), {})({'ar.visitor.person': people})
        env.cr = NS(execute=lambda *a: None)
        record = Record(state='quiz_pending', cin='AA123', env=env,
                        survey_user_input_id=NS(state='done', scoring_success=True, end_datetime=NOW))
        ns['_finish_quiz'](record)
        self.assertEqual(record.state, 'ready')
        self.assertEqual(record.person_id, 5)
        self.assertFalse(record.visit_id)
        self.assertFalse(hasattr(record, 'check_in_at'))


class SessionTests(unittest.TestCase):
    def test_session_bound_to_invitation_token_and_expiry(self):
        import time
        tree = ast.parse((ROOT / 'controllers/preregistration.py').read_text(encoding='utf8'))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'authenticated')
        request = NS(session={})
        ctx = {'request': request, 'time': time}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), '<session>', 'exec'), ctx)
        record = Record()
        grant = {'id': record.id, 'token': record.token, 'until': time.time() + 60}
        request.session['ar_visitor_invitation'] = grant
        self.assertTrue(ctx['authenticated'](record))
        record.token = security.new_token()
        self.assertFalse(ctx['authenticated'](record))
        grant['token'] = record.token
        grant['until'] = 0
        self.assertFalse(ctx['authenticated'](record))


if __name__ == '__main__':
    unittest.main()
