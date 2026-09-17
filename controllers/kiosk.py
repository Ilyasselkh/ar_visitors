import base64

from odoo import fields, http, _
from odoo.exceptions import UserError, ValidationError
from odoo.http import request
from werkzeug.exceptions import NotFound
from werkzeug.utils import redirect


class ArVisitorsKiosk(http.Controller):

    def _labels(self, language):
        labels = {
            "fr": {"brand": "Visiteurs", "identity_title": "Compléter l'identité", "identity_intro": "La photo capturée a été conservée. Renseignez les informations de la pièce d'identité.", "first_name": "Prénom", "last_name": "Nom", "document": "CIN / passeport", "company": "Société", "nationality": "Nationalité", "continue": "Continuer", "quiz_unavailable": "Le quiz dans la langue choisie ne peut pas être chargé. Veuillez contacter l’accueil pour vérifier sa configuration, puis réessayer.", "retry": "Réessayer", "quiz_title": "Quiz de sécurité", "quiz_intro": "Le quiz s’ouvre dans cette page.", "open_quiz": "Ouvrir le quiz", "visit_title": "Votre visite", "host": "Personne à visiter", "purpose": "Motif", "signature": "Signature du visiteur", "clear_signature": "Effacer la signature", "signature_required": "Veuillez signer avant de continuer.", "save": "Enregistrer et notifier", "approval_title": "Contrôle de l'accueil requis", "approval_text": "Veuillez contacter l'agent d'accueil.", "refused_title": "Accès non autorisé", "refused_text": "Veuillez contacter l'accueil.", "success_title": "Visite enregistrée", "success_sent": "Votre contact a été informé.", "success_pending": "La visite est enregistrée. Veuillez contacter l'accueil."},
            "en": {"brand": "Visitors", "identity_title": "Complete identity", "identity_intro": "The captured photo has been saved. Enter the identity document details.", "first_name": "First name", "last_name": "Last name", "document": "CIN / passport", "company": "Company", "nationality": "Nationality", "continue": "Continue", "quiz_unavailable": "The quiz in your selected language could not be loaded. Please ask reception to check its configuration, then try again.", "retry": "Try again", "quiz_title": "Safety quiz", "quiz_intro": "The quiz opens on this page.", "open_quiz": "Open quiz", "visit_title": "Your visit", "host": "Person to visit", "purpose": "Purpose", "signature": "Visitor signature", "clear_signature": "Clear signature", "signature_required": "Please sign before continuing.", "save": "Save and notify", "approval_title": "Reception review required", "approval_text": "Please contact reception.", "refused_title": "Access denied", "refused_text": "Please contact reception.", "success_title": "Visit registered", "success_sent": "Your contact has been notified.", "success_pending": "The visit has been registered. Please contact reception."},
            "es": {"brand": "Visitantes", "identity_title": "Completar la identidad", "identity_intro": "La foto capturada se ha guardado. Introduzca los datos del documento de identidad.", "first_name": "Nombre", "last_name": "Apellido", "document": "CIN / pasaporte", "company": "Empresa", "nationality": "Nacionalidad", "continue": "Continuar", "quiz_unavailable": "No se ha podido cargar el cuestionario en el idioma seleccionado. Pida a recepción que compruebe la configuración y vuelva a intentarlo.", "retry": "Reintentar", "quiz_title": "Cuestionario de seguridad", "quiz_intro": "El cuestionario se abre en esta página.", "open_quiz": "Abrir cuestionario", "visit_title": "Su visita", "host": "Persona a visitar", "purpose": "Motivo", "signature": "Firma del visitante", "clear_signature": "Borrar firma", "signature_required": "Firme antes de continuar.", "save": "Guardar y notificar", "approval_title": "Se requiere control de recepción", "approval_text": "Póngase en contacto con recepción.", "refused_title": "Acceso no autorizado", "refused_text": "Póngase en contacto con recepción.", "success_title": "Visita registrada", "success_sent": "Su contacto ha sido informado.", "success_pending": "La visita se ha registrado. Póngase en contacto con recepción."},
            "ar": {"brand": "الزوار", "identity_title": "استكمال الهوية", "identity_intro": "تم حفظ الصورة الملتقطة. يرجى إدخال بيانات وثيقة الهوية.", "first_name": "الاسم الشخصي", "last_name": "اسم العائلة", "document": "بطاقة الهوية / جواز السفر", "company": "الشركة", "nationality": "الجنسية", "continue": "متابعة", "quiz_unavailable": "تعذر تحميل الاختبار باللغة المختارة. يرجى طلب المساعدة من الاستقبال للتحقق من الإعدادات، ثم المحاولة مرة أخرى.", "retry": "إعادة المحاولة", "quiz_title": "اختبار السلامة", "quiz_intro": "سيتم فتح الاختبار في هذه الصفحة.", "open_quiz": "فتح الاختبار", "visit_title": "زيارتك", "host": "الشخص المراد زيارته", "purpose": "سبب الزيارة", "signature": "توقيع الزائر", "clear_signature": "مسح التوقيع", "signature_required": "يرجى التوقيع قبل المتابعة.", "save": "تسجيل وإشعار المضيف", "approval_title": "يلزم التحقق من الاستقبال", "approval_text": "يرجى التواصل مع الاستقبال.", "refused_title": "تم رفض الدخول", "refused_text": "يرجى التواصل مع الاستقبال.", "success_title": "تم تسجيل الزيارة", "success_sent": "تم إشعار الشخص الذي ستزوره.", "success_pending": "تم تسجيل الزيارة. يرجى التواصل مع الاستقبال."},
        }
        return labels.get(language, labels["fr"])

    def _visit(self, token):
        visit = request.env["ar.visitor.visit"].sudo().search([("kiosk_token", "=", token)], limit=1)
        if not visit or not visit.kiosk_token_expires_at or visit.kiosk_token_expires_at < fields.Datetime.now():
            raise NotFound()
        lang = {"fr": "fr_FR", "en": "en_GB", "es": "es_ES", "ar": "ar_001"}[visit.language]
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
            "labels": self._labels(visit.language),
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
        visit.write({
            "visitor_company": (post.get("visitor_company") or "").strip()[:200],
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
        return request.render("ar_visitors.kiosk_success", {"visit": visit, "labels": self._labels(visit.language)})
