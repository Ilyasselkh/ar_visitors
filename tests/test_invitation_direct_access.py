"""Exercise the real entry route and session boundary without an Odoo database."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest

tree = ast.parse((Path(__file__).parents[1] / 'controllers/preregistration.py').read_text(encoding='utf8'))
functions = [n for n in tree.body if isinstance(n, ast.FunctionDef)]
page = next(n for c in tree.body if isinstance(c, ast.ClassDef) for n in c.body
            if isinstance(n, ast.FunctionDef) and n.name == '_page')
page.decorator_list = []
namespace = {'time': NS(time=lambda: 100), 'redirect': lambda url, code=302: (url, code)}
exec(compile(ast.Module(body=functions + [page], type_ignores=[]), '<direct access>', 'exec'), namespace)
namespace['page'] = namespace['_page']


class DirectAccessTests(unittest.TestCase):
    def setUp(self):
        self.request = NS(session={}, httprequest=NS(method='GET'))
        namespace['request'] = self.request
        self.record = NS(id=1, token='personal-token', is_shared=False, _live=lambda: True,
                         _lock=lambda: None, _url=lambda: '/personal', state='sent')
        self.controller = NS(_record=lambda token: self.record,
                             _render=lambda record, *args: namespace['authenticated'](record))

    def test_opening_valid_link_grants_access_without_code(self):
        self.assertTrue(namespace['page'](self.controller, self.record.token))
        self.assertEqual(self.request.session['ar_visitor_invitation']['until'], 7300)

    def test_expired_or_cancelled_link_does_not_grant_access(self):
        self.record._live = lambda: False
        self.assertFalse(namespace['page'](self.controller, self.record.token))
        self.assertEqual(self.request.session, {})

    def test_replaced_token_invalidates_previous_session(self):
        namespace['open_invitation'](self.record)
        self.record.token = 'replacement'
        self.assertFalse(namespace['authenticated'](self.record))

    def test_expired_session_requires_reopening_link_before_post(self):
        self.request.httprequest.method = 'POST'
        self.assertEqual(namespace['page'](self.controller, self.record.token, action='identity'), ('/personal', 303))

    def test_old_code_actions_do_not_send_or_verify_codes(self):
        namespace['open_invitation'](self.record)
        self.request.httprequest.method = 'POST'
        for action in ('send', 'verify'):
            self.assertTrue(namespace['page'](self.controller, self.record.token, action=action))
        # The record has no OTP methods: any accidental invocation fails the test.


if __name__ == '__main__':
    unittest.main()
