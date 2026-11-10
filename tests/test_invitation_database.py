"""Verify the database-free invitation entry before any ORM access."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
from unittest.mock import Mock


tree = ast.parse((Path(__file__).parents[1] / 'controllers/preregistration.py').read_text(encoding='utf8'))
page = next(n for cls in tree.body if isinstance(cls, ast.ClassDef)
            for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'page')
route = page.decorator_list[0]
page.decorator_list = []


class DatabaseEntryTests(unittest.TestCase):
    def setUp(self):
        self.ensure_db = Mock()
        self.authenticate = Mock()
        self.request = NS(env={'ir.http': NS(_authenticate_explicit=self.authenticate)})
        self.namespace = {
            'request': self.request, 'ensure_db': self.ensure_db,
            'http': NS(db_filter=lambda dbs: dbs), 'NotFound': LookupError,
        }
        exec(compile(ast.Module(body=[page], type_ignores=[]), '<database entry>', 'exec'), self.namespace)
        self.controller = NS(_page=Mock(return_value='welcome'))
        self.token = 'a' * 43

    def test_route_available_without_database(self):
        self.assertEqual(next(k.value.value for k in route.keywords if k.arg == 'auth'), 'none')

    def test_fixed_database_ignores_query_database(self):
        self.assertEqual(self.namespace['page'](self.controller, self.token, db='other'), 'welcome')
        self.ensure_db.assert_called_once_with(db='1051_PROD')
        self.authenticate.assert_called_once_with('public')
        self.controller._page.assert_called_once_with(self.token, db='other')

    def test_database_switch_redirects_before_orm_or_token_lookup(self):
        self.ensure_db.side_effect = RuntimeError('redirect with selected database cookie')
        self.request.env = None
        with self.assertRaises(RuntimeError):
            self.namespace['page'](self.controller, self.token)
        self.controller._page.assert_not_called()

    def test_excluded_target_does_not_fall_back_to_other_database(self):
        self.namespace['http'].db_filter = lambda dbs: []
        with self.assertRaises(LookupError):
            self.namespace['page'](self.controller, self.token)
        self.ensure_db.assert_not_called()
        self.controller._page.assert_not_called()

    def test_malformed_token_does_not_select_database(self):
        with self.assertRaises(LookupError):
            self.namespace['page'](self.controller, 'invalid')
        self.ensure_db.assert_not_called()


if __name__ == '__main__':
    unittest.main()
