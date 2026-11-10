import ast
import importlib.util
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

ROOT = Path(__file__).parents[1]
tree = ast.parse((ROOT / 'models/visitor_invitation.py').read_text(encoding='utf8'))
method = next(n for cls in tree.body if isinstance(cls, ast.ClassDef)
              for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '_quiz_unavailable_reason')
namespace = {}
exec(compile(ast.Module(body=[method], type_ignores=[]), '<quiz availability>', 'exec'), namespace)
spec = importlib.util.spec_from_file_location('prereg_labels', ROOT / 'prereg_labels.py')
wording = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wording)


class AvailabilityTests(unittest.TestCase):
    def reason(self, missing=False, **values):
        survey = NS(active=True, session_state=False, users_login_required=False,
                    question_ids=[1], scoring_type='scoring_with_answers', scoring_max_obtainable=10)
        survey.__dict__.update(values)
        document = False if missing else NS(survey_id=survey)
        config = NS(get_current_document=lambda language, company: document)
        config.sudo = lambda: config
        record = NS(ensure_one=lambda: None, language='fr', company_id=1,
                    env={'ar.visitor.document': config})
        return namespace['_quiz_unavailable_reason'](record)

    def test_available_quiz(self):
        self.assertFalse(self.reason())

    def test_each_blocking_configuration_has_translated_message(self):
        cases = [('quiz_missing', {'missing': True}), ('quiz_archived', {'active': False}),
                 ('quiz_session', {'session_state': 'ready'}),
                 ('quiz_login', {'users_login_required': True}), ('quiz_empty', {'question_ids': []}),
                 ('quiz_scoring', {'scoring_type': 'no_scoring'}),
                 ('quiz_scoring', {'scoring_max_obtainable': 0})]
        for expected, values in cases:
            with self.subTest(values=values):
                self.assertEqual(self.reason(**values), expected)
                for language in ('fr', 'en', 'es', 'ar'):
                    self.assertTrue(wording.labels(language)[expected])

    def test_complete_consent_in_every_language(self):
        for language in ('fr', 'en', 'es', 'ar'):
            paragraphs = wording.labels(language)['consent_paragraphs']
            self.assertEqual(len(paragraphs), 6)
            self.assertTrue(all(len(paragraph) > 60 for paragraph in paragraphs))
        self.assertEqual(wording.labels('fr')['consent_paragraphs'], wording.CONSENT_FR)
