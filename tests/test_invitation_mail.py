"""The shared invitation/OTP helper must wake the mail queue after creating mail."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

tree = ast.parse((Path(__file__).parents[1] / 'models/visitor_invitation.py').read_text(encoding='utf8'))
method = next(n for c in tree.body if isinstance(c, ast.ClassDef)
              for n in c.body if isinstance(n, ast.FunctionDef) and n.name == '_mail')
namespace = {'email_normalize': lambda value: value.strip().lower()}
exec(compile(ast.Module(body=[method], type_ignores=[]), '<invitation mail>', 'exec'), namespace)


class MailTests(unittest.TestCase):
    def test_invitation_and_code_create_mail_before_waking_queue(self):
        for subject in ('Invitation', 'Code de connexion'):
            with self.subTest(subject=subject):
                events = []
                queue = NS(create=lambda values: events.append(('created', values)))
                queue.sudo = lambda: queue
                cron = NS(_trigger=lambda: events.append(('triggered',)))
                cron.sudo = lambda: cron
                class Env(dict):
                    user = NS(email_formatted='fallback@example.invalid')
                    def ref(self, xmlid):
                        self_xmlid = 'mail.ir_cron_mail_scheduler_action'
                        assert xmlid == self_xmlid
                        return cron
                record = NS(env=Env({'mail.mail': queue}), email='Visitor@example.invalid',
                            company_id=NS(email_formatted='reception@example.invalid'))
                namespace['_mail'](record, subject, '<p>Test</p>')
                self.assertEqual([event[0] for event in events], ['created', 'triggered'])
                self.assertEqual(events[0][1]['email_to'], 'visitor@example.invalid')


if __name__ == '__main__':
    unittest.main()
