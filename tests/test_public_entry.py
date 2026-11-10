"""Check the global gateway without loading visitor dependencies or a database."""
import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import Mock


ROOT = Path(__file__).resolve().parents[1]
ENTRY = ROOT / 'deployment/ar_visitors_entry'


class PublicEntryTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((ENTRY / 'controllers/entry.py').read_text(encoding='utf8'))
        controller = next(node for node in tree.body if isinstance(node, ast.ClassDef))
        self.ensure_db = Mock()
        self.http = SimpleNamespace(Controller=object, db_filter=lambda names: names,
                                    route=lambda *args, **kwargs: lambda method: method)
        namespace = dict(http=self.http, ensure_db=self.ensure_db, NotFound=LookupError)
        exec(compile(ast.Module(body=[controller], type_ignores=[]), '<gateway>', 'exec'), namespace)
        self.entry = namespace['VisitorEntry']()

    def test_both_links_select_target_before_fallback(self):
        for method in (self.entry.page, self.entry.shared_invitation):
            self.ensure_db.reset_mock()
            with self.assertRaises(LookupError):
                method('a' * 43, db='another_database')
            self.ensure_db.assert_called_once_with(db='1051_PROD')

    def test_session_redirect_is_propagated(self):
        self.ensure_db.side_effect = RuntimeError('redirect')
        with self.assertRaisesRegex(RuntimeError, 'redirect'):
            self.entry.page('a' * 43)

    def test_excluded_database_is_not_selected(self):
        self.http.db_filter = lambda names: []
        with self.assertRaises(LookupError):
            self.entry.page('a' * 43)
        self.ensure_db.assert_not_called()

    def test_malformed_link_is_rejected_before_selection(self):
        with self.assertRaises(LookupError):
            self.entry.shared_invitation('invalid')
        self.ensure_db.assert_not_called()

    def test_gateway_has_no_visitor_dependencies_or_assets(self):
        manifest = ast.literal_eval((ENTRY / '__manifest__.py').read_text(encoding='utf8'))
        self.assertEqual(manifest['depends'], ['web'])
        self.assertFalse(manifest.get('assets'))
        self.assertFalse(manifest.get('data'))
        main = ast.literal_eval((ROOT / '__manifest__.py').read_text(encoding='utf8'))
        self.assertIn('ar_visitors_entry', main['depends'])
        tree = ast.parse((ROOT / 'controllers/preregistration.py').read_text(encoding='utf8'))
        controller = next(node for node in tree.body if isinstance(node, ast.ClassDef))
        self.assertEqual(controller.bases[0].id, 'VisitorEntry')


if __name__ == '__main__':
    unittest.main()
