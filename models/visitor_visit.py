import logging
import uuid

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

_logger = logging.getLogger(__name__)


class ArVisitorVisit(models.Model):
    _name = "ar.visitor.visit"
    _description = "Visite visiteur"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "check_in_at desc, id desc"

    name = fields.Char(string="Référence", default="Nouveau", readonly=True, copy=False, index=True)
    active = fields.Boolean(default=True)
    person_id = fields.Many2one("ar.visitor.person", string="Visiteur", ondelete="restrict", tracking=True)
    nationality_id = fields.Many2one("res.country", string="Nationalité", tracking=True)
    first_name = fields.Char(string="Prénom", tracking=True)
    last_name = fields.Char(string="Nom", tracking=True)
    cin = fields.Char(string="CIN", index=True, tracking=True)
    photo = fields.Image(string="Photo", max_width=1920, max_height=1920, attachment=True)
    visitor_company = fields.Char(string="Société")
    host_employee_id = fields.Many2one(
        "hr.employee", string="Personne à visiter", tracking=True,
        domain=[("work_email", "!=", False)],
    )
    department_id = fields.Many2one(related="host_employee_id.department_id", store=True, readonly=True)
    purpose = fields.Char(string="Motif de la visite", tracking=True)
    check_in_at = fields.Datetime(string="Date et heure d'entrée", readonly=True, copy=False, tracking=True)
    check_out_at = fields.Datetime(string="Date et heure de sortie", readonly=True, copy=False, tracking=True)
    duration_hours = fields.Float(string="Durée (heures)", compute="_compute_duration", store=True)
    state = fields.Selection(
        [
            ("draft", "Brouillon"),
            ("identity_input", "Identité à compléter"),
            ("identity_check", "Identité à vérifier"),
            ("quiz_pending", "Quiz à effectuer"),
            ("host_pending", "Personne à visiter"),
            ("approval_pending", "Validation manuelle"),
            ("checked_in", "Visiteur entré"),
            ("signature_pending", "Signature en attente"),
            ("checked_out", "Visiteur sorti"),
            ("refused", "Refusé"),
            ("cancelled", "Annulé"),
        ],
        default="draft",
        required=True,
        index=True,
        tracking=True,
    )

    language = fields.Selection(
        [("fr", "Français"), ("en", "English"), ("es", "Español")], default="fr", required=True
    )
    terminal_id = fields.Many2one("ar.visitor.facial.terminal", ondelete="set null", tracking=True)
    facial_event_id = fields.Char(string="Événement facial", index=True, copy=False)
    facial_reference = fields.Char(string="Référence faciale", copy=False)
    facial_result = fields.Selection(
        [("recognized", "Reconnu"), ("unknown", "Inconnu"), ("low_confidence", "Confiance faible"),
         ("mismatch", "Incohérent"), ("manual", "Saisie manuelle")],
        copy=False,
    )
    validation_was_valid = fields.Boolean(string="Quiz encore valide", readonly=True, copy=False)
    survey_id = fields.Many2one("survey.survey", string="Quiz", readonly=True, copy=False)
    survey_user_input_id = fields.Many2one("survey.user_input", string="Participation", readonly=True, copy=False, groups="ar_visitors.group_ar_visitors_manager")
    quiz_completed = fields.Boolean(string="Quiz terminé", readonly=True, copy=False)
    quiz_completed_at = fields.Datetime(readonly=True, copy=False)
    quiz_score = fields.Float(string="Score du quiz (%)", related="survey_user_input_id.scoring_percentage", store=True, groups="ar_visitors.group_ar_visitors_manager")
    signature = fields.Binary(string="Signature", attachment=True, copy=False)
    signature_at = fields.Datetime(string="Date de signature", readonly=True, copy=False)
    notification_state = fields.Selection(
        [("pending", "À envoyer"), ("sent", "Envoyée"), ("failed", "Échec"), ("not_required", "Non requise")],
        default="pending", required=True, readonly=True, copy=False, tracking=True,
    )
    notification_at = fields.Datetime(readonly=True, copy=False)
    notification_error = fields.Text(readonly=True, copy=False)
    kiosk_token = fields.Char(default=lambda self: uuid.uuid4().hex, readonly=True, copy=False, index=True, groups="ar_visitors.group_ar_visitors_user")
    kiosk_token_expires_at = fields.Datetime(readonly=True, copy=False)
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)

    _event_unique = models.Constraint(
        "unique(facial_event_id)", "Cet événement facial a déjà été traité."
    )

    def init(self):
        self.env.cr.execute(
            """
            UPDATE ir_sequence
               SET prefix = 'VIS - ',
                   padding = 4
             WHERE code = 'ar.visitor.visit'
               AND (prefix IS DISTINCT FROM 'VIS - ' OR padding IS DISTINCT FROM 4)
            """
        )
        self.env.cr.execute(
            """
            WITH visits_to_update AS (
                SELECT id,
                       substring(name from '^VIS/[0-9]{4}/([0-9]+)$')::integer AS sequence_number
                  FROM ar_visitor_visit
                 WHERE name ~ '^VIS/[0-9]{4}/[0-9]+$'
            )
            UPDATE ar_visitor_visit AS visit
               SET name = 'VIS - ' ||
                   CASE
                       WHEN length(visits_to_update.sequence_number::text) < 4
                       THEN lpad(visits_to_update.sequence_number::text, 4, '0')
                       ELSE visits_to_update.sequence_number::text
                   END
              FROM visits_to_update
             WHERE visit.id = visits_to_update.id
            """
        )

    @api.depends("check_in_at", "check_out_at")
    def _compute_duration(self):
        for record in self:
            record.duration_hours = (
                (record.check_out_at - record.check_in_at).total_seconds() / 3600.0
                if record.check_in_at and record.check_out_at else 0.0
            )

    @api.model_create_multi
    def create(self, vals_list):
        sequence = self.env["ir.sequence"]
        expiry_minutes = int(self.env["ir.config_parameter"].sudo().get_param("ar_visitors.kiosk_token_minutes", 15))
        facial_event_ids = [
            vals.get("facial_event_id") for vals in vals_list if vals.get("facial_event_id")
        ]
        if len(facial_event_ids) != len(set(facial_event_ids)) or self.search_count([
            ("facial_event_id", "in", facial_event_ids)
        ]):
            raise ValidationError(_("Cet événement facial a déjà été traité."))
        for vals in vals_list:
            if vals.get("name", "Nouveau") == "Nouveau":
                vals["name"] = sequence.next_by_code("ar.visitor.visit") or _("Nouveau")
            vals["cin"] = self.env["ar.visitor.person"].normalize_cin(vals.get("cin"))
            vals.setdefault("kiosk_token_expires_at", fields.Datetime.now() + relativedelta(minutes=expiry_minutes))
        return super().create(vals_list)

    @api.constrains("check_in_at", "check_out_at")
    def _check_dates(self):
        for record in self:
            if record.check_in_at and record.check_out_at and record.check_out_at < record.check_in_at:
                raise ValidationError(_("La sortie ne peut pas précéder l'entrée."))

    def action_select_language(self):
        for record in self:
            if record.state not in ('draft', 'identity_check'):
                raise UserError(_("Le choix de langue n'est pas disponible à cette étape."))
            record._validate_identity_values()
            configuration = self.env["ar.visitor.document"].sudo().get_current_document(record.language, record.company_id)
            if not configuration:
                raise UserError(_("Aucun quiz actif n'est configuré pour cette langue."))
            record.write({"survey_id": configuration.survey_id.id, "state": "quiz_pending"})
            record._ensure_survey_answer()
        return True

    def action_start_manual(self):
        for record in self:
            if record.state != 'draft':
                raise UserError(_("Le parcours a déjà été démarré."))
            if record.person_id and not record.cin:
                record.cin = record.person_id.cin
            if not record.cin:
                record.write({"facial_result": "manual", "state": "identity_input"})
                continue
            person = self.env["ar.visitor.person"].sudo().search([("cin", "=", record.cin)], limit=1)
            if person:
                if person.status != "active":
                    record.write({"person_id": person.id, "facial_result": "manual", "state": "refused"})
                    continue
                record.write({
                    "person_id": person.id,
                    "nationality_id": record.nationality_id.id or person.nationality_id.id,
                    "first_name": person.first_name,
                    "last_name": person.last_name,
                    "photo": person.image_1920,
                    "facial_result": "manual",
                    "validation_was_valid": person.recent_visit,
                    "check_in_at": fields.Datetime.now() if person.recent_visit else False,
                    "state": "host_pending" if person.recent_visit else "identity_check",
                })
            else:
                record.write({"facial_result": "manual", "state": "identity_input"})
        return True

    def action_open_kiosk(self):
        self.ensure_one()
        self.check_access('write')
        if self.state == 'draft':
            self.action_start_manual()
        if self.state not in ('identity_input', 'identity_check', 'quiz_pending', 'host_pending'):
            raise UserError(_("Cette visite ne peut pas être ouverte sur la borne."))
        session = self.sudo()
        if not session.kiosk_token or not session.kiosk_token_expires_at or session.kiosk_token_expires_at < fields.Datetime.now():
            session.write({'kiosk_token': uuid.uuid4().hex,
                        'kiosk_token_expires_at': fields.Datetime.now() + relativedelta(minutes=int(
                            self.env['ir.config_parameter'].sudo().get_param('ar_visitors.kiosk_token_minutes', 15)))})
        return {'type': 'ir.actions.client', 'tag': 'ar_visitors.open_kiosk',
                'params': {'url': '/ar-visitors/kiosk/%s' % session.kiosk_token}}

    def _validate_identity_values(self):
        for record in self:
            cin = self.env["ar.visitor.person"].normalize_cin(record.cin)
            if not record.first_name or not record.last_name or len(cin) < 4:
                raise UserError(_("Le nom, le prénom et une CIN valide sont obligatoires."))
            if record.cin != cin:
                record.cin = cin

    def action_confirm_identity(self):
        for record in self:
            record._validate_identity_values()
            person = self.env["ar.visitor.person"].sudo().with_context(active_test=False).search([("cin", "=", record.cin)], limit=1)
            if person:
                if person.status != "active" or not person.active:
                    record.write({"person_id": person.id, "state": "refused"})
                    continue
                if record.facial_result == 'unknown':
                    record.write({'person_id': person.id, 'state': 'approval_pending'})
                    continue
                record.write({
                    "person_id": person.id,
                    "nationality_id": record.nationality_id.id or person.nationality_id.id,
                    "first_name": person.first_name,
                    "last_name": person.last_name,
                    "photo": record.photo or person.image_1920,
                    "validation_was_valid": person.recent_visit,
                    "check_in_at": fields.Datetime.now() if person.recent_visit else False,
                    "state": "host_pending" if person.recent_visit else "identity_check",
                })
            else:
                record._create_or_update_person()
                record.state = "identity_check"
        return True

    def _ensure_survey_answer(self):
        self.ensure_one()
        self.check_access('write')
        self = self.sudo()
        if self.survey_user_input_id:
            return self.survey_user_input_id
        if not self.survey_id:
            raise UserError(_("Aucun quiz n'est configuré."))
        survey = self.survey_id.sudo()
        answer = survey._create_answer(check_attempts=False)
        self.survey_user_input_id = answer.id
        return answer

    def action_open_quiz(self):
        self.ensure_one()
        if self.state != 'quiz_pending':
            raise UserError(_("Le quiz n'est pas disponible à cette étape."))
        answer = self._ensure_survey_answer()
        url = answer.get_start_url()
        if not url and answer.access_token:
            url = "/survey/start/%s?answer_token=%s" % (self.survey_id.access_token, answer.access_token)
        if not url:
            raise UserError(_("Impossible de générer le lien du quiz."))
        return {"type": "ir.actions.act_url", "url": url, "target": "new"}

    def action_check_quiz(self):
        for record in self:
            if record.quiz_completed:
                continue
            if record.state != 'quiz_pending':
                raise UserError(_("Cette visite n'attend pas de quiz."))
            answer = record.sudo().survey_user_input_id
            if not answer or answer.state != "done":
                raise UserError(_("Le quiz n'est pas encore terminé."))
            record.write({
                "quiz_completed": True,
                "quiz_completed_at": answer.end_datetime or fields.Datetime.now(),
                "check_in_at": answer.end_datetime or fields.Datetime.now(),
                "state": "host_pending",
                "kiosk_token_expires_at": fields.Datetime.now() + relativedelta(minutes=int(self.env['ir.config_parameter'].sudo().get_param('ar_visitors.kiosk_token_minutes', 15))),
            })
            record._create_or_update_person()
        return True

    def _create_or_update_person(self):
        self.ensure_one()
        self._validate_identity_values()
        Person = self.env["ar.visitor.person"].sudo()
        person = self.person_id or Person.search([("cin", "=", self.cin)], limit=1)
        vals = {
            "nationality_id": self.nationality_id.id,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "cin": self.cin,
            "preferred_language": self.language,
            "facial_reference": self.facial_reference,
        }
        if self.photo:
            vals["image_1920"] = self.photo
        if person:
            if self.env["ir.config_parameter"].sudo().get_param("ar_visitors.update_person_from_facial", "False") == "True":
                person.write(vals)
        else:
            person = Person.create(vals)
        self.person_id = person.id
        return person

    def action_check_in(self):
        for record in self:
            if record.state != 'host_pending' or not (record.quiz_completed or record.validation_was_valid):
                raise UserError(_("Cette visite n'est pas prête pour l'entrée."))
            if not record.host_employee_id:
                raise UserError(_("La personne à visiter est obligatoire."))
            if record.state == "approval_pending" and not self.env.user.has_group("ar_visitors.group_ar_visitors_user"):
                raise UserError(_("Une validation du responsable est nécessaire."))
            if not record.person_id:
                record._create_or_update_person()
            if self.search_count([("person_id", "=", record.person_id.id), ("state", "in", ['checked_in', 'signature_pending']), ("id", "!=", record.id)]):
                raise UserError(_("Ce visiteur possède déjà une visite en cours."))
            record.write({
                "check_in_at": record.check_in_at or fields.Datetime.now(),
                "state": "checked_in",
                "kiosk_token": False,
                "kiosk_token_expires_at": False,
            })
            record._send_host_notification()
        return True

    def _get_host_email(self):
        self.ensure_one()
        employee = self.host_employee_id.sudo()
        return employee.work_email or (employee.user_id and employee.user_id.partner_id.email)

    def _send_host_notification(self):
        template = self.env.ref("ar_visitors.mail_template_visitor_arrival", raise_if_not_found=False)
        for record in self:
            email_to = record._get_host_email()
            if not template or not email_to:
                message = _("La personne à visiter ne possède pas d'adresse e-mail.")
                record.write({"notification_state": "failed", "notification_error": message})
                continue
            try:
                template.sudo().send_mail(record.id, force_send=True, raise_exception=True, email_values={"email_to": email_to})
                record.write({"notification_state": "sent", "notification_at": fields.Datetime.now(), "notification_error": False})
                record.message_post(body=_("Notification envoyée à %s.") % record.host_employee_id.name)
            except Exception as exc:
                _logger.exception("Visitor host notification failed for visit %s", record.id)
                message = str(exc)[:1000]
                record.write({"notification_state": "failed", "notification_error": message})

    def action_retry_notification(self):
        self.write({"notification_state": "pending", "notification_error": False})
        self._send_host_notification()

    def action_check_out(self):
        self.ensure_one()
        if self.state not in ("checked_in", "signature_pending"):
            raise UserError(_("Seule une visite en cours peut être clôturée."))
        self.state = "signature_pending"
        return {
            "type": "ir.actions.act_window",
            "name": _("Signature de sortie"),
            "res_model": "ar.visitor.checkout.wizard",
            "view_mode": "form",
            "target": "new",
            "context": {"default_visit_id": self.id},
        }

    def _finalize_check_out(self, signature):
        if not signature:
            raise UserError(_("La signature est obligatoire pour enregistrer la sortie."))
        for record in self:
            if record.state != "signature_pending":
                raise UserError(_("La visite n'est pas en attente de signature."))
            record.write({
                "signature": signature,
                "signature_at": fields.Datetime.now(),
                "check_out_at": fields.Datetime.now(),
                "state": "checked_out",
            })

    def action_approve(self):
        if not self.env.user.has_group("ar_visitors.group_ar_visitors_user"):
            raise UserError(_("Seul un responsable peut accorder une dérogation."))
        for record in self:
            if record.person_id:
                next_state = "host_pending" if record.person_id.recent_visit else "identity_check"
                record.write({
                    "state": next_state,
                    "validation_was_valid": record.person_id.recent_visit,
                    "check_in_at": fields.Datetime.now() if next_state == "host_pending" else False,
                })
            else:
                record.state = "identity_input"
            record.message_post(body=_("Contrôle manuel validé par %s.") % self.env.user.display_name)

    def action_refuse(self):
        self.write({"state": "refused", "kiosk_token": False, "kiosk_token_expires_at": False})

    def action_cancel(self):
        self.write({"state": "cancelled", "kiosk_token": False, "kiosk_token_expires_at": False})

    @api.model
    def _cron_cancel_expired_kiosk_visits(self):
        expired = self.search([
            ("state", "in", ["draft", "identity_input", "identity_check", "quiz_pending", "host_pending"]),
            ("kiosk_token_expires_at", "!=", False),
            ("kiosk_token_expires_at", "<", fields.Datetime.now()),
        ])
        expired.write({"state": "cancelled", "kiosk_token": False, "kiosk_token_expires_at": False})
