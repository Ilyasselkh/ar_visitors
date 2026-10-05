"""Isolated tests for server-side document input validation (no Odoo database required)."""
import ast
from pathlib import Path
import re
from types import SimpleNamespace
import unittest

source = ast.parse((Path(__file__).parents[1] / 'wizard/visitor_identify_wizard.py').read_text(encoding='utf-8'))
method = next(node for cls in source.body if isinstance(cls, ast.ClassDef)
              for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == '_document_values')
namespace = {'ValidationError': ValueError, '_': lambda text: text,
             'get_global': lambda _: {'MAR': ['MA'], 'FRA': ['FR']}}
exec(compile(ast.Module(body=[method], type_ignores=[]), '<document validation>', 'exec'), namespace)

class Countries:
    def browse(self):
        return False
    def with_context(self, **kwargs):
        return self
    def search(self, domain, **kwargs):
        field, _, value = domain[0]
        return SimpleNamespace(id=1) if (field == 'code' and value == 'MA') or (field == 'name' and value.lower() == 'maroc') else False

class Environment(dict):
    context = {'lang': 'fr_FR'}

class DocumentValidation(unittest.TestCase):
    def setUp(self):
        env = Environment({'res.country': Countries(), 'ar.visitor.person': SimpleNamespace(
            normalize_cin=lambda value: re.sub('[^A-Z0-9]', '', value.upper()))})
        self.wizard = SimpleNamespace(env=env, cin='AB123456')
        self.identity = {'cin': 'AB123456', 'first_name': 'Salma', 'last_name': 'Amrani', 'nationality': 'MAR'}
    def validate(self, values):
        return namespace['_document_values'](self.wizard, values)
    def test_verified_fields_and_mrz_country(self):
        self.assertEqual(self.validate(self.identity), {'first_name': 'Salma', 'last_name': 'Amrani', 'nationality_id': 1})
    def test_no_arbitrary_field_or_document_image(self):
        for key in ['photo', 'company_id', 'state', 'person_id', 'confirmed']:
            with self.assertRaises(ValueError): self.validate(dict(self.identity, **{key: 'unexpected'}))
    def test_wrong_identity_and_oversized_fields(self):
        for values in [dict(self.identity, cin='OTHER123'), dict(self.identity, first_name=''),
                       dict(self.identity, first_name=123), dict(self.identity, last_name='x' * 101), []]:
            with self.assertRaises(ValueError): self.validate(values)
    def test_unknown_country_is_not_silently_mapped(self):
        for nationality in ['UNKNOWN', '%', 'M_']:
            with self.assertRaises(ValueError): self.validate(dict(self.identity, nationality=nationality))
    def test_optional_nationality_and_exact_name(self):
        self.assertNotIn('nationality_id', self.validate(dict(self.identity, nationality='')))
        self.assertEqual(self.validate(dict(self.identity, nationality='Maroc'))['nationality_id'], 1)

if __name__ == '__main__': unittest.main()
