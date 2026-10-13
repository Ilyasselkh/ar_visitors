import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

tree = ast.parse((Path(__file__).parents[1] / 'models/visitor_visit.py').read_text(encoding='utf8'))
methods = [n for cls in tree.body if isinstance(cls, ast.ClassDef) for n in cls.body
           if isinstance(n, ast.FunctionDef) and n.name in ('action_check_in', '_cron_send_visitor_notifications')]
for method in methods:
    method.decorator_list = []
ns = {'fields': NS(Datetime=NS(now=lambda: 'now')), 'UserError': ValueError}
exec(compile(ast.Module(body=methods, type_ignores=[]), '<notifications>', 'exec'), ns)


class Visit:
    invitation_id = False
    state = 'host_pending'
    quiz_completed = True
    entry_signature = 'signature'
    host_employee_id = 3
    person_id = NS(id=4)
    check_in_at = False
    id = 8

    def __init__(self, deferred):
        self.sent = self.triggered = 0
        cron = NS(sudo=lambda: cron, _trigger=self.trigger)
        self.env = NS(context={'visitor_defer_notification': deferred}, ref=lambda _: cron)

    def trigger(self):
        self.triggered += 1

    def __iter__(self):
        return iter([self])

    def write(self, values):
        self.__dict__.update(values)

    def search_count(self, domain):
        return 0

    def _send_host_notification(self):
        self.sent += 1

    def _visitor_text(self, text):
        return text


class NotificationTests(unittest.TestCase):
    def test_kiosk_saves_and_triggers_without_smtp(self):
        visit = Visit(True)
        ns['action_check_in'](visit)
        self.assertEqual(visit.state, 'checked_in')
        self.assertEqual(visit.notification_state, 'pending')
        self.assertEqual((visit.sent, visit.triggered), (0, 1))

    def test_other_entry_paths_keep_existing_behavior(self):
        visit = Visit(False)
        ns['action_check_in'](visit)
        self.assertEqual((visit.sent, visit.triggered), (1, 0))

    def test_invalid_signature_does_not_schedule_email(self):
        visit = Visit(True)
        visit.entry_signature = False
        with self.assertRaises(ValueError):
            ns['action_check_in'](visit)
        self.assertEqual((visit.sent, visit.triggered), (0, 0))

    def test_worker_only_selects_pending_registered_visits(self):
        visit = Visit(True)
        def search(domain, **kwargs):
            self.assertIn(('notification_state', '=', 'pending'), domain)
            self.assertIn(('check_in_at', '!=', False), domain)
            self.assertEqual(kwargs['limit'], 30)
            return visit
        ns['_cron_send_visitor_notifications'](NS(search=search))
        self.assertEqual(visit.sent, 1)


if __name__ == '__main__':
    unittest.main()
