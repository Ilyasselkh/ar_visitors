import ast
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace as NS
import unittest


tree = ast.parse((Path(__file__).parents[1] / 'wizard/visitor_checkout_wizard.py').read_text(encoding='utf8'))
method = next(n for cls in tree.body if isinstance(cls, ast.ClassDef)
              for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'action_confirm')
today = datetime(2026, 10, 12).date()
ns = {'fields': NS(
    Date=NS(context_today=lambda _: today),
    Datetime=NS(context_timestamp=lambda _, dt: dt.replace(tzinfo=timezone.utc).astimezone(timezone(timedelta(hours=1))))),
    'UserError': ValueError}
exec(compile(ast.Module(body=[method], type_ignores=[]), '<checkout>', 'exec'), ns)


class CheckoutTests(unittest.TestCase):
    def wizard(self, entered, from_arrival=True, signature='signed'):
        finalized = []
        visit = NS(check_in_at=entered, _finalize_check_out=lambda value: finalized.append(value))
        wizard = NS(ensure_one=lambda: None, visit_id=visit,
                    env=NS(context={'visitor_checkout_from_arrival': from_arrival}),
                    signature=signature, language='fr', _visitor_text=lambda text: text)
        return wizard, finalized

    def confirm(self, entered, from_arrival=True):
        wizard, finalized = self.wizard(entered, from_arrival)
        result = ns['action_confirm'](wizard)['params']
        self.assertEqual(finalized, ['signed'])
        return result

    def test_old_visit_prompts_new_entry(self):
        result = self.confirm(datetime(2026, 10, 11, 10))
        self.assertIn('enregistrement d’entrée', result['message'])
        self.assertEqual(result['delay'], 8000)

    def test_today_only_confirms_exit(self):
        self.assertEqual(self.confirm(datetime(2026, 10, 12, 10))['message'], 'Merci pour votre visite')

    def test_local_midnight_uses_operator_timezone(self):
        self.assertEqual(self.confirm(datetime(2026, 10, 11, 23, 30))['message'], 'Merci pour votre visite')

    def test_normal_checkout_keeps_thank_you(self):
        self.assertEqual(self.confirm(datetime(2026, 10, 11, 10), False)['message'], 'Merci pour votre visite')

    def test_missing_signature_never_closes_visit(self):
        wizard, finalized = self.wizard(datetime(2026, 10, 11), signature=False)
        with self.assertRaises(ValueError):
            ns['action_confirm'](wizard)
        self.assertEqual(finalized, [])


if __name__ == '__main__':
    unittest.main()
