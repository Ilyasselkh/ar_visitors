"""Shared links create independent registrations without sending mail."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
from unittest import TestCase
from unittest.mock import Mock


tree = ast.parse((Path(__file__).parents[1] / 'controllers/preregistration.py').read_text(encoding='utf8'))
route = next(n for cls in tree.body if isinstance(cls, ast.ClassDef)
             for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == 'shared_invitation')
route.decorator_list = []


class SharedInvitationTests(TestCase):
    def setUp(self):
        self.created = []
        def create(values):
            self.created.append(values)
            return NS(_url=lambda: '/personal/' + values['token'])
        model = NS(create=create)
        model.sudo = lambda: model
        self.parent = NS(id=4, is_shared=True, _lock=Mock(), _live=lambda: True,
                         planned_date='2026-10-12', expires_at='2026-10-13',
                         company_id=NS(id=2), language='fr')
        self.response = NS(headers={})
        self.request = NS(httprequest=NS(method='GET'), csrf_token=lambda: 'csrf',
                          env={'ar.visitor.invitation': model,
                               'ir.http': NS(_authenticate_explicit=Mock())},
                          render=Mock(return_value=self.response))
        self.ns = dict(request=self.request, ensure_db=Mock(),
                       http=NS(db_filter=lambda values: values), NotFound=LookupError,
                       labels=lambda language: {}, new_token=lambda: str(len(self.created)),
                       open_invitation=Mock(), redirect=lambda url, code: (url, code))
        exec(compile(ast.Module(body=[route], type_ignores=[]), '<shared invitation>', 'exec'), self.ns)
        self.controller = NS(_record=lambda token: self.parent)

    def call(self):
        return self.ns['shared_invitation'](self.controller, 'a' * 43)

    def test_opening_link_does_not_create_registration(self):
        self.assertIs(self.call(), self.response)
        self.assertEqual(self.created, [])
        self.assertEqual(self.response.headers['Cache-Control'], 'no-store')

    def test_two_starts_create_separate_personal_links(self):
        self.request.httprequest.method = 'POST'
        first, second = self.call(), self.call()
        self.assertNotEqual(first, second)
        self.assertEqual(len(self.created), 2)
        for values in self.created:
            self.assertEqual(values['parent_id'], self.parent.id)
            self.assertFalse(values['is_shared'])
            self.assertEqual(values['state'], 'sent')
            self.assertEqual(values['company_id'], 2)
            self.assertEqual(values['expires_at'], self.parent.expires_at)

    def test_closed_link_cannot_create_registration(self):
        self.request.httprequest.method = 'POST'
        self.parent._live = lambda: False
        self.call()
        self.assertEqual(self.created, [])

    def test_personal_link_cannot_be_used_as_shared_link(self):
        self.parent.is_shared = False
        with self.assertRaises(LookupError):
            self.call()
