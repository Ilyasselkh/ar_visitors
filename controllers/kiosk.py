import base64
import io
from PIL import Image, UnidentifiedImageError

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
        lang = {"fr": "fr_FR", "en": "en_GB", "es": "es_ES"}[visit.language]
        request.update_context(lang=lang)
        return visit.with_context(lang=lang)

    def _render(self, visit, error=None, success=None):
        employees = request.env["hr.employee"].sudo().search([
            ("company_id", "=", visit.company_id.id), ("work_email", "!=", False)
        ], order="name")
        return request.render("ar_visitors.kiosk_page", {
            "visit": visit,
            "employees": employees,
            "countries": request.env["res.country"].sudo().search([], order="name"),
            "error": error,
            "success": success,
        })

    @http.route("/ar-visitors/kiosk/<string:token>", type="http", auth="public", website=False, csrf=False)
    def kiosk(self, token, **kwargs):
        visit = self._visit(token)
        if visit.state == "identity_check":
            try:
                visit.action_select_language()
            except UserError as exc:
                return self._render(visit, error=str(exc))
        return self._render(visit)

    @http.route("/ar-visitors/kiosk/<string:token>/identity", type="http", auth="public", methods=["POST"], csrf=False)
    def identity(self, token, **post):
        visit = self._visit(token)
        if visit.state != "identity_input":
            return redirect("/ar-visitors/kiosk/%s" % token)
        try:
            nationality_id = int(post.get("nationality_id") or 0)
        except (ValueError, TypeError):
            nationality_id = 0
        country = request.env["res.country"].sudo().browse(nationality_id).exists()
        if post.get("nationality_id") and not country:
            return self._render(visit, error=_("Nationalité invalide."))
        photo_values = {}
        upload = request.httprequest.files.get("photo")
        if upload and upload.filename:
            content = upload.read(8 * 1024 * 1024 + 1)
            try:
                if len(content) > 8 * 1024 * 1024:
                    raise ValueError()
                with Image.open(io.BytesIO(content)) as image:
                    if image.format not in ("JPEG", "PNG", "WEBP") or image.width * image.height > 20000000:
                        raise ValueError()
                    image.verify()
            except (ValueError, OSError, UnidentifiedImageError, Image.DecompressionBombError):
                return self._render(visit, error=_("Photo invalide : utilisez une image JPG, PNG ou WEBP de 8 Mo maximum."))
            photo_values["photo"] = base64.b64encode(content)
        visit.write({
            **photo_values,
            "nationality_id": country.id or False,
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

    @http.route("/ar-visitors/kiosk/<string:token>/quiz", type="http", auth="public", methods=["GET"], csrf=False)
    def quiz(self, token, **kwargs):
        visit = self._visit(token)
        if visit.survey_id.users_login_required:
            return request.make_response("Ce quiz exige une connexion. L’accueil doit configurer un quiz accessible aux visiteurs.", headers=[('Content-Type', 'text/plain; charset=utf-8')])
        action = visit.action_open_quiz()
        return redirect(action["url"] + ("&" if "?" in action["url"] else "?") + "lang=" + visit.env.context["lang"])

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
        signature = post.get("entry_signature") or ""
        if not signature or len(signature) > 2 * 1024 * 1024:
            return self._render(visit, error=_("La signature du visiteur est obligatoire avant de valider la visite."))
        try:
            image = base64.b64decode(signature, validate=True)
            if not image.startswith(b"\x89PNG\r\n\x1a\n"):
                raise ValueError()
        except (ValueError, TypeError):
            return self._render(visit, error=_("Signature invalide. Veuillez signer à nouveau."))
        visit.write({
            "entry_signature": signature,
            "host_employee_id": host.id,
            "purpose": (post.get("purpose") or "").strip(),
            "state": "host_pending",
        })
        try:
            visit.action_check_in()
        except (UserError, ValidationError) as exc:
            return self._render(visit, error=str(exc))
        return request.render("ar_visitors.kiosk_success", {"visit": visit})
