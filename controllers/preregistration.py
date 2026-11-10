import base64
import io
import time

from PIL import Image
from odoo import fields, http
from odoo.http import request
from odoo.addons.web.controllers.utils import ensure_db
from odoo.addons.ar_visitors_entry.controllers.entry import VisitorEntry
from werkzeug.exceptions import NotFound
from werkzeug.utils import redirect

from ..prereg_labels import labels
from ..visitor_i18n import LANG_CODES
from ..prereg_security import new_token


def authenticated(invitation):
    grant = request.session.get('ar_visitor_invitation', {})
    return bool(invitation._live() and grant.get('id') == invitation.id
                and grant.get('token') == invitation.token and grant.get('until', 0) > time.time())


def open_invitation(invitation):
    """A live personal invitation link grants a session for the protected quiz."""
    if not invitation._live():
        return False
    request.session['ar_visitor_invitation'] = {
        'id': invitation.id, 'token': invitation.token, 'until': time.time() + 7200,
    }
    return True


class VisitorPreregistration(VisitorEntry):
    @http.route('/ar-visitors/invite/<string:token>', type='http', auth='none', methods=['GET', 'POST'])
    def shared_invitation(self, token, **post):
        if len(token) != 43 or '1051_PROD' not in http.db_filter(['1051_PROD']):
            raise NotFound()
        ensure_db(db='1051_PROD')
        request.env['ir.http']._authenticate_explicit('public')
        parent = self._record(token)
        if not parent.is_shared:
            raise NotFound()
        if request.httprequest.method == 'POST':
            parent._lock()
            if parent._live():
                child = request.env['ar.visitor.invitation'].sudo().create({
                    'is_shared': False, 'parent_id': parent.id,
                    'planned_date': parent.planned_date, 'company_id': parent.company_id.id,
                    'language': parent.language, 'state': 'sent',
                    'token': new_token(), 'expires_at': parent.expires_at,
                })
                open_invitation(child)
                return redirect(child._url(), code=303)
        response = request.render('ar_visitors.shared_invitation_page', {
            'invitation': parent, 'live': parent._live(), 'labels': labels(parent.language),
        })
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        return response

    def _record(self, token):
        if len(token) != 43:
            raise NotFound()
        record = request.env['ar.visitor.invitation'].sudo().search([('token', '=', token)], limit=1)
        if not record:
            raise NotFound()
        request.update_context(lang=LANG_CODES[record.language])
        return record.with_context(lang=LANG_CODES[record.language])

    def _render(self, record, message=None):
        logged = authenticated(record)
        safety = []
        if logged and record._live() and (record.safety_pending or record.state == 'sent'):
            instructions = request.env['ar.visitor.safety.instruction'].sudo().search([])
            images = request.env['ar.visitor.safety.image'].sudo().search([
                ('instruction_id', 'in', instructions.ids), ('language', '=', record.language)])
            for instruction in instructions:
                safety.append({'text': instruction._localized_text(record.language), 'emoji': instruction.emoji,
                               'images': [image.image.decode() for image in images
                                          if image.instruction_id == instruction and image.image]})
        response = request.render('ar_visitors.preregistration_page', {
            'safety_instructions': safety,
            'invitation': record, 'logged': logged, 'live': record._live(),
            'labels': labels(record.language), 'message': message,
            'failed': logged and record.state == 'quiz_pending' and record.survey_user_input_id.state == 'done',
            'countries': request.env['res.country'].sudo().search([]) if logged else [],
        })
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Referrer-Policy'] = 'no-referrer'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
        return response

    @http.route('/ar-visitors/pre-register/<string:token>', type='http', auth='none', methods=['GET', 'POST'])
    def page(self, token, **post):
        # The lightweight ar_visitors_entry controller handles database-free entry.
        # Never let a query parameter or an existing session choose the target.
        if len(token) != 43 or '1051_PROD' not in http.db_filter(['1051_PROD']):
            raise NotFound()
        ensure_db(db='1051_PROD')
        request.env['ir.http']._authenticate_explicit('public')
        return self._page(token, **post)

    def _page(self, token, **post):
        record = self._record(token)
        if record.is_shared:
            return redirect(record._url(), code=303)
        message = None
        if request.httprequest.method == 'GET':
            open_invitation(record)
            if authenticated(record) and record.state == 'quiz_pending':
                record.write({'state': 'sent', 'safety_pending': True})
        if request.httprequest.method == 'POST':
            record._lock()
            if not record._live():
                return self._render(record)
            action = post.get('action')
            if not authenticated(record):
                return redirect(record._url(), code=303)
            if authenticated(record):
                if action == 'language' and record.state == 'sent' and post.get('language') in LANG_CODES:
                    record.language = post['language']
                    return redirect(record._url(), code=303)
                if action == 'safety' and record.state == 'sent' and record.safety_pending:
                    if post.get('understanding') in ('yes', 'no'):
                        record.write({'safety_understanding': post['understanding'],
                                      'safety_acknowledged_at': fields.Datetime.now()})
                        if record._complete_registration():
                            record.safety_pending = False
                        return redirect(record._url(), code=303)
                if action == 'identity' and record.state == 'sent' and not record.safety_pending:
                    values = self._identity(post)
                    if values:
                        # Save only after consent and validation, and do not create an arrival.
                        record.write(dict(values, safety_pending=True))
                        return redirect(record._url(), code=303)
                    else:
                        message = 'required'
                elif action == 'retry' and record.state == 'quiz_pending' and record.survey_user_input_id.state == 'done':
                    if record._start_quiz():
                        return redirect(record._url(), code=303)
                    message = record._quiz_unavailable_reason() or 'unavailable'
        return self._render(record, message)

    def _identity(self, post):
        values = {key: (post.get(key) or '').strip()[:200] for key in ('first_name', 'last_name', 'phone', 'visitor_company')}
        cin = request.env['ar.visitor.person'].sudo().normalize_cin(post.get('cin', ''))
        photo = post.get('photo', '')
        if not post.get('consent') or not values['first_name'] or not values['last_name'] or not 4 <= len(cin) <= 64 or len(photo) > 4000000:
            return False
        try:
            data = base64.b64decode(photo, validate=True)
            with Image.open(io.BytesIO(data)) as img:
                if img.format not in ('JPEG', 'PNG', 'WEBP') or img.width * img.height > 12000000:
                    return False
                img.verify()
            country = request.env['res.country'].sudo().browse(int(post.get('nationality_id', 0))).exists()
        except (ValueError, OSError, Image.DecompressionBombError):
            return False
        values.update(cin=cin, photo=photo, nationality_id=country.id, consent_at=fields.Datetime.now())
        return values

    @http.route('/ar-visitors/pre-register/<string:token>/quiz', type='http', auth='public', methods=['GET'])
    def quiz(self, token, **kwargs):
        record = self._record(token)
        return redirect(record._url())

    @http.route('/ar-visitors/pre-register/<string:token>/status', type='http', auth='public', methods=['GET'])
    def status(self, token, **kwargs):
        record = self._record(token)
        if not authenticated(record):
            return request.make_json_response({'state': 'login'}, headers=[('Cache-Control', 'no-store')])
        state = record.state
        if state == 'quiz_pending' and record.survey_user_input_id.state == 'done':
            state = 'failed'
        return request.make_json_response({'state': state}, headers=[('Cache-Control', 'no-store')])

    @http.route('/ar-visitors/pre-register/<string:token>/csrf', type='http', auth='public', methods=['GET'])
    def csrf(self, token, **kwargs):
        # A stale tab may have a cookie from a different DB or an expired grant.
        # Do not issue a token until the personal link has reopened its session.
        headers = [('Cache-Control', 'no-store')]
        if request.db != '1051_PROD':
            return request.make_json_response({'reopen': True}, status=409, headers=headers)
        record = self._record(token)
        if not authenticated(record):
            return request.make_json_response({'reopen': True}, status=409, headers=headers)
        return request.make_json_response({'csrf_token': request.csrf_token()}, headers=headers)
