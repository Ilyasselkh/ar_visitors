import base64

from odoo import fields, http, _
from odoo.exceptions import UserError, ValidationError
from odoo.http import request
from werkzeug.exceptions import NotFound
from werkzeug.utils import redirect


class ArVisitorsKiosk(http.Controller):

    def _visit(self, token):
        visit = request.env["ar.visitor.visit"].sudo().search([("kiosk_token", "=", token)], limit=1)
        if not visit or not visit.kiosk_token_expires_at or visit.kiosk_token_expires_at < fields.Datetime.now():
            raise NotFound()
        return visit

    def _render(self, visit, error=None, success=None):
        employees = request.env["hr.employee"].sudo().search([
            ("company_id", "=", visit.company_id.id), ("work_email", "!=", False)
        ], order="name")
        return request.render("ar_visitors.kiosk_page", {
            "visit": visit,
            "employees": employees,
            "error": error,
            "success": success,
        })

    @http.route("/ar-visitors/kiosk/<string:token>", type="http", auth="public", website=False, csrf=False)
    def kiosk(self, token, **kwargs):
        return self._render(self._visit(token))

    @http.route("/ar-visitors/kiosk/<string:token>/identity", type="http", auth="public", methods=["POST"], csrf=False)
    def identity(self, token, **post):
        visit = self._visit(token)
        if visit.state != "identity_input":
            return redirect("/ar-visitors/kiosk/%s" % token)
        visit.write({
            "first_name": (post.get("first_name") or "").strip(),
            "last_name": (post.get("last_name") or "").strip(),
            "cin": (post.get("cin") or "").strip(),
        })
        try:
            visit.action_confirm_identity()
        except (UserError, ValidationError) as exc:
            return self._render(visit, error=str(exc))
        return redirect("/ar-visitors/kiosk/%s" % token)

    @http.route("/ar-visitors/kiosk/<string:token>/photo", type="http", auth="public", csrf=False)
    def photo(self, token, **kwargs):
        visit = self._visit(token)
        if not visit.photo:
            raise NotFound()
        return request.make_response(base64.b64decode(visit.photo), headers=[
            ("Content-Type", "image/jpeg"), ("Cache-Control", "no-store")
        ])

    @http.route("/ar-visitors/kiosk/<string:token>/language", type="http", auth="public", methods=["POST"], csrf=False)
    def language(self, token, **post):
        visit = self._visit(token)
        if visit.state != "identity_check":
            return redirect("/ar-visitors/kiosk/%s" % token)
        language = post.get("language")
        if language not in ("fr", "en", "es"):
            return self._render(visit, error=_("Langue incorrecte."))
        visit.write({"language": language})
        try:
            visit.action_select_language()
        except UserError as exc:
            return self._render(visit, error=str(exc))
        return redirect("/ar-visitors/kiosk/%s" % token)

    @http.route("/ar-visitors/kiosk/<string:token>/quiz", type="http", auth="public", methods=["GET"], csrf=False)
    def quiz(self, token, **kwargs):
        visit = self._visit(token)
        if visit.survey_id.users_login_required:
            return request.make_response("Ce quiz exige une connexion. L’accueil doit configurer un quiz accessible aux visiteurs.", headers=[('Content-Type', 'text/plain; charset=utf-8')])
        action = visit.action_open_quiz()
        return redirect(action["url"])

    @http.route('/ar-visitors/kiosk/<string:token>/quiz-status', type='http', auth='public', methods=['GET'])
    def quiz_status(self, token, **kwargs):
        visit = self._visit(token)
        return request.make_json_response({'state': visit.state}, headers=[('Cache-Control', 'no-store')])

    @http.route("/ar-visitors/kiosk/<string:token>/quiz-check", type="http", auth="public", methods=["POST"], csrf=False)
    def quiz_check(self, token, **post):
        visit = self._visit(token)
        try:
            visit.action_check_quiz()
        except UserError as exc:
            return self._render(visit, error=str(exc))
        return redirect("/ar-visitors/kiosk/%s" % token)

    @http.route("/ar-visitors/kiosk/<string:token>/details", type="http", auth="public", methods=["POST"], csrf=False)
    def details(self, token, **post):
        visit = self._visit(token)
        if visit.state != "host_pending":
            return redirect("/ar-visitors/kiosk/%s" % token)
        try:
            host_id = int(post.get("host_employee_id") or 0)
        except ValueError:
            host_id = 0
        host = request.env["hr.employee"].sudo().search([
            ("id", "=", host_id), ("company_id", "=", visit.company_id.id), ("work_email", "!=", False)
        ], limit=1)
        if not host:
            return self._render(visit, error=_("Sélectionnez une personne à visiter."))
        visit.write({
            "host_employee_id": host.id,
            "purpose": (post.get("purpose") or "").strip(),
            "state": "host_pending",
        })
        try:
            visit.action_check_in()
        except (UserError, ValidationError) as exc:
            return self._render(visit, error=str(exc))
        return request.render("ar_visitors.kiosk_success", {"visit": visit})
