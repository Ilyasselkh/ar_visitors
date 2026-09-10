import logging

from odoo import fields, http, _
from odoo.http import request
from odoo.exceptions import UserError, ValidationError
from ..models.recognition_provider import RecognitionNotConfigured

_logger = logging.getLogger(__name__)


class ArVisitorsFacialApi(http.Controller):

    def _response(self, data, status=200):
        return request.make_json_response(data, status=status)

    @http.route("/api/ar_visitors/v1/facial/check", type="http", auth="public", methods=["POST"], csrf=False)
    def facial_check(self, **kwargs):
        payload = request.httprequest.get_json(silent=True) or {}
        if not isinstance(payload, dict):
            return self._response({"success": False, "error": "invalid_payload"}, 400)
        terminal_code = request.httprequest.headers.get("X-AR-Terminal") or payload.get("terminal_id")
        secret = request.httprequest.headers.get("X-AR-Secret")
        Terminal = request.env["ar.visitor.facial.terminal"].sudo()
        terminal = Terminal.search([("code", "=", terminal_code), ("active", "=", True)], limit=1)
        if not terminal or not terminal.verify_secret(secret):
            return self._response({"success": False, "error": "unauthorized"}, 401)

        terminal.last_seen_at = fields.Datetime.now()
        try:
            with request.env.cr.savepoint():
                return self._process_event(payload, terminal)
        except RecognitionNotConfigured as exc:
            return self._response({'success': False, 'error': 'recognition_not_configured', 'message': str(exc)}, 503)
        except (UserError, ValidationError) as exc:
            return self._response({"success": False, "error": str(exc)}, 422)
        except Exception as exc:
            _logger.exception("Facial API error for terminal %s", terminal.code)
            terminal.last_error = str(exc)[:1000]
            return self._response({"success": False, "error": "processing_error"}, 500)

    def _process_event(self, payload, terminal):
        event_id = str(payload.get("event_id") or "").strip()
        if not event_id:
            return self._response({"success": False, "error": "missing_event_id"}, 400)
        existing = request.env["ar.visitor.visit"].sudo().search([("facial_event_id", "=", event_id)], limit=1)
        if existing and existing.terminal_id != terminal:
            return self._response({"success": False, "error": "event_conflict"}, 409)
        if existing:
            return self._visit_response(existing)
        photo = payload.get("photo")
        if not isinstance(photo, str) or not photo or len(photo) > 12 * 1024 * 1024:
            return self._response({"success": False, "error": "invalid_photo"}, 400)
        person = request.env['ar.visitor.recognition.provider'].sudo()._recognize(photo, terminal)
        first_name = last_name = ''
        cin = person.cin if person else ''
        result = 'recognized' if person else 'unknown'
        validation_valid = bool(person and person.recent_visit)
        state = ('host_pending' if validation_valid else 'identity_check') if person else 'identity_input'
        if person and person.status != 'active':
            state = 'refused'

        visit = request.env["ar.visitor.visit"].sudo().create({
            "person_id": person.id if person else False,
            "nationality_id": person.nationality_id.id if person else False,
            "first_name": person.first_name if person else first_name,
            "last_name": person.last_name if person else last_name,
            "cin": cin,
            "photo": photo,
            "facial_reference": payload.get("facial_reference"),
            "facial_event_id": event_id,
            "facial_result": result,
            "terminal_id": terminal.id,
            "company_id": terminal.company_id.id,
            "validation_was_valid": validation_valid,
            "check_in_at": fields.Datetime.now() if state == "host_pending" else False,
            "language": person.preferred_language if person else "fr",
            "state": state,
        })
        return self._visit_response(visit)

    def _visit_response(self, visit):
        step_by_state = {
            "identity_input": "identity_input",
            "identity_check": "language_selection",
            "host_pending": "host_selection",
            "approval_pending": "manual_identity_check",
            "refused": "access_refused",
            "checked_in": "already_checked_in",
        }
        base_url = request.env["ir.config_parameter"].sudo().get_param("web.base.url")
        return self._response({
            "success": True,
            "visit_reference": visit.name,
            "person_found": bool(visit.person_id),
            "validation_valid": visit.validation_was_valid,
            "recent_visit": visit.validation_was_valid,
            "next_step": step_by_state.get(visit.state, visit.state),
            "kiosk_url": "%s/ar-visitors/kiosk/%s" % (base_url, visit.kiosk_token) if visit.kiosk_token else False,
        })
