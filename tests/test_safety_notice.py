import ast
import importlib.util
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
from lxml import etree

ROOT = Path(__file__).parents[1]
spec = importlib.util.spec_from_file_location('labels', ROOT / 'prereg_labels.py')
wording = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wording)


class Record:
    state = 'sent'
    safety_pending = True
    safety_understanding = False
    completed = 0

    def write(self, values):
        self.__dict__.update(values)

    def _complete_registration(self):
        self.completed += 1
        return True

    def _url(self):
        return '/invitation'


class SafetyNoticeTests(unittest.TestCase):
    def test_four_languages_and_button_wording(self):
        expected = ['Consignes de Sécurité', 'Safety Instructions', 'Instrucciones de Seguridad', 'تعليمات السلامة']
        for language, title in zip(['fr', 'en', 'es', 'ar'], expected):
            labels = wording.labels(language)
            self.assertEqual(labels['safety'], title)
            self.assertIn(labels['safety_validate'], labels['safety_continue'])
            self.assertTrue(labels['safety_help'])

    def test_both_pages_show_two_messages_only_after_no(self):
        for file in ['kiosk_templates.xml', 'preregistration_templates.xml']:
            root = etree.parse(str(ROOT / 'views' / file))
            notice = root.xpath("//div[@class='ar-safety-notice']")[0]
            self.assertIn("safety_understanding == 'no'", notice.get('t-if'))
            self.assertEqual(notice.get('role'), 'alert')
            texts = notice.xpath('.//*[@t-out]/@t-out')
            self.assertTrue(any("['safety_help']" in value for value in texts))
            self.assertEqual(any("['safety_continue']" in value for value in texts), file == 'kiosk_templates.xml')
            self.assertTrue(root.xpath("//link[contains(@href, 'safety_notice.css')]"))
            self.assertTrue(root.xpath("//button[@name='understanding' and @value='yes']"))

    def test_remote_no_completes_registration_as_before(self):
        tree = ast.parse((ROOT / 'controllers/preregistration.py').read_text(encoding='utf8'))
        branch = next(n for n in ast.walk(tree) if isinstance(n, ast.If)
                      and "action == 'safety'" in ast.unparse(n.test))
        fn = ast.FunctionDef(name='submit', args=ast.arguments(posonlyargs=[], args=[ast.arg(arg='record'), ast.arg(arg='post')],
                              kwonlyargs=[], kw_defaults=[], defaults=[]), body=branch.body, decorator_list=[])
        ns = {'fields': NS(Datetime=NS(now=lambda: 'now')), 'redirect': lambda url, code: (url, code)}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[fn], type_ignores=[])), '<remote safety>', 'exec'), ns)
        record = Record()
        self.assertEqual(ns['submit'](record, {'understanding': 'no'}), ('/invitation', 303))
        self.assertEqual(record.safety_understanding, 'no')
        self.assertFalse(record.safety_pending)
        self.assertEqual(record.completed, 1)
        record = Record()
        ns['submit'](record, {'understanding': 'yes'})
        self.assertFalse(record.safety_pending)
        self.assertEqual(record.completed, 1)

    def test_kiosk_no_then_validate_and_invalid_submission(self):
        tree = ast.parse((ROOT / 'controllers/kiosk.py').read_text(encoding='utf8'))
        fn = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == 'safety')
        fn.decorator_list = []
        ns = {'fields': NS(Datetime=NS(now=lambda: 'now')), 'redirect': lambda url, code: (url, code)}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), '<kiosk safety>', 'exec'), ns)
        record = Record()
        record.state = 'host_pending'
        controller = NS(_visit=lambda token: record)
        for value in ['no', 'yes', 'invalid']:
            ns['safety'](controller, 'token', understanding=value)
            self.assertEqual(record.safety_understanding, 'yes' if value == 'invalid' else value)
            self.assertEqual(record.state, 'host_pending')
            self.assertFalse(record.check_in_at)


if __name__ == '__main__':
    unittest.main()
