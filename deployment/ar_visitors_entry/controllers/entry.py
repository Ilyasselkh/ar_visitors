"""Database selection only: no visitor models, templates or assets."""
from odoo import http
from odoo.addons.web.controllers.utils import ensure_db
from werkzeug.exceptions import NotFound


class VisitorEntry(http.Controller):
    def _select_visitor_database(self, token):
        if len(token) != 43 or '1051_PROD' not in http.db_filter(['1051_PROD']):
            raise NotFound()
        # Redirects with the selected session, including from another database.
        # On the next request the installed ar_visitors controller takes over.
        ensure_db(db='1051_PROD')

    @http.route('/ar-visitors/invite/<string:token>', type='http', auth='none', methods=['GET', 'POST'])
    def shared_invitation(self, token, **post):
        self._select_visitor_database(token)
        # Reached only if the full visitors module is unavailable on the target.
        raise NotFound()

    @http.route('/ar-visitors/pre-register/<string:token>', type='http', auth='none', methods=['GET', 'POST'])
    def page(self, token, **post):
        self._select_visitor_database(token)
        raise NotFound()
