"""Verify invitation URL selection without an Odoo database."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
from urllib.parse import urlsplit
import unittest

tree = ast.parse((Path(__file__).parents[1] / 'models/visitor_invitation.py').read_text(encoding='utf8'))
method = next(n for cls in tree.body if isinstance(cls, ast.ClassDef)
              for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '_public_base_url')
ns = {'urlsplit': urlsplit, 'ValidationError': ValueError, '_': lambda text: text}
exec(compile(ast.Module(body=[method], type_ignores=[]), '<invitation URL>', 'exec'), ns)


class InvitationURLTests(unittest.TestCase):
    def resolve(self, configured, default='http://internal:8069'):
        params = NS(get_param=lambda key, fallback: configured)
        params.sudo = lambda: params
        return ns['_public_base_url'](NS(env={'ir.config_parameter': params}, get_base_url=lambda: default))

    def test_public_url_overrides_internal_http(self):
        self.assertEqual(self.resolve('https://visitors.example.org'), 'https://visitors.example.org')

    def test_blank_uses_existing_https_base(self):
        for value in (None, False, '', '   '):
            self.assertEqual(self.resolve(value, 'https://odoo.example.org/'), 'https://odoo.example.org')

    def test_whitespace_trailing_slash_and_valid_port(self):
        self.assertEqual(self.resolve(' https://visitors.example.org:8443/ '), 'https://visitors.example.org:8443')

    def test_rejects_invalid_override_even_with_valid_default(self):
        for value in ('http://internal:8069', 'https://', 'https://host/odoo', 'https://host?db=x',
                      'https://host#x', 'https://user:pass@host', 'https://host:bad', 'https://ho st'):
            with self.subTest(value=value), self.assertRaisesRegex(ValueError, 'ar_visitors.public_base_url'):
                self.resolve(value, 'https://valid.example.org')

    def test_empty_parameter_with_http_default_is_rejected(self):
        with self.assertRaises(ValueError):
            self.resolve('')


if __name__ == '__main__':
    unittest.main()
