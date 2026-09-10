import re

from dateutil.relativedelta import relativedelta

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ArVisitorPerson(models.Model):
    _name = "ar.visitor.person"
    _description = "Personne visiteur"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "last_name, first_name, id"

    name = fields.Char(compute="_compute_name", store=True)
    active = fields.Boolean(default=True, tracking=True)
    nationality_id = fields.Many2one("res.country", string="Nationalité", tracking=True)
    first_name = fields.Char(string="Prénom", required=True, tracking=True)
    last_name = fields.Char(string="Nom", required=True, tracking=True)
    cin = fields.Char(string="CIN", required=True, index=True, tracking=True, copy=False)
    image_1920 = fields.Image(string="Photo", max_width=1920, max_height=1920, attachment=True)
    last_quiz_at = fields.Datetime(string="Dernier quiz terminé", compute="_compute_last_quiz_at", store=True)

    @api.depends('visit_ids.quiz_completed', 'visit_ids.quiz_completed_at')
    def _compute_last_quiz_at(self):
        for person in self:
            person.last_quiz_at = max(person.visit_ids.filtered('quiz_completed').mapped('quiz_completed_at'), default=False)
    email = fields.Char(string="E-mail")
    phone = fields.Char(string="Téléphone")
    company_name = fields.Char(string="Société")
    facial_reference = fields.Char(string="Référence faciale", index=True, copy=False)
    preferred_language = fields.Selection(
        [("fr", "Français"), ("en", "English"), ("es", "Español")],
        string="Langue préférée",
        default="fr",
    )
    last_visit_at = fields.Datetime(string="Dernière visite", compute="_compute_last_visit_at", store=True)
    visit_valid_until = fields.Datetime(string="Parcours rapide jusqu'au", compute="_compute_visit_valid_until")
    recent_visit = fields.Boolean(string="Quiz encore valide", compute="_compute_recent_visit", search="_search_recent_visit")
    status = fields.Selection(
        [("active", "Actif"), ("inactive", "Inactif"), ("blocked", "Bloqué")],
        default="active",
        required=True,
        tracking=True,
    )
    blocked_reason = fields.Text(string="Motif de blocage", tracking=True)
    consent = fields.Boolean(string="Consentement", tracking=True)
    consent_at = fields.Datetime(string="Date du consentement", readonly=True)
    visit_ids = fields.One2many("ar.visitor.visit", "person_id", string="Visites")
    visit_count = fields.Integer(compute="_compute_visit_count")

    _cin_unique = models.Constraint("unique(cin)", "La CIN doit être unique.")

    @api.depends("first_name", "last_name")
    def _compute_name(self):
        for record in self:
            record.name = " ".join(filter(None, [record.first_name, record.last_name]))

    @api.depends("visit_ids.check_in_at", "visit_ids.state")
    def _compute_last_visit_at(self):
        for record in self:
            visits = record.visit_ids.filtered(
                lambda visit: visit.check_in_at and visit.state in ("checked_in", "checked_out")
            )
            record.last_visit_at = max(visits.mapped("check_in_at"), default=False)

    @api.depends("last_quiz_at")
    def _compute_visit_valid_until(self):
        validity_months = int(self.env["ir.config_parameter"].sudo().get_param("ar_visitors.validity_months", 3))
        for record in self:
            record.visit_valid_until = (
                record.last_quiz_at + relativedelta(months=validity_months) if record.last_quiz_at else False
            )

    @api.depends("visit_valid_until", "status")
    def _compute_recent_visit(self):
        now = fields.Datetime.now()
        for record in self:
            record.recent_visit = bool(
                record.status == "active"
                and record.visit_valid_until
                and record.visit_valid_until >= now
            )

    def _search_recent_visit(self, operator, value):
        validity_months = int(self.env["ir.config_parameter"].sudo().get_param("ar_visitors.validity_months", 3))
        limit = fields.Datetime.now() - relativedelta(months=validity_months)
        valid_domain = [("status", "=", "active"), ("last_quiz_at", ">=", limit)]
        if (operator in ("=", "==") and value) or (operator == "!=" and not value):
            return valid_domain
        return ["|", "|", ("status", "!=", "active"), ("last_quiz_at", "=", False),
                ("last_quiz_at", "<", limit)]

    @api.depends("visit_ids")
    def _compute_visit_count(self):
        counts = self.env["ar.visitor.visit"]._read_group(
            [("person_id", "in", self.ids)], ["person_id"], ["__count"]
        )
        mapped = {person.id: count for person, count in counts}
        for record in self:
            record.visit_count = mapped.get(record.id, 0)

    @api.model
    def normalize_cin(self, value):
        return re.sub(r"[^A-Z0-9]", "", (value or "").upper())

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            vals["cin"] = self.normalize_cin(vals.get("cin"))
            if vals.get("consent") and not vals.get("consent_at"):
                vals["consent_at"] = fields.Datetime.now()
        return super().create(vals_list)

    def write(self, vals):
        if "cin" in vals:
            vals["cin"] = self.normalize_cin(vals["cin"])
        if vals.get("consent") and not self.consent:
            vals["consent_at"] = fields.Datetime.now()
        return super().write(vals)

    @api.constrains("cin")
    def _check_cin(self):
        for record in self:
            if not record.cin or len(record.cin) < 4:
                raise ValidationError(_("La CIN doit contenir au moins quatre caractères."))

    @api.constrains("status", "blocked_reason")
    def _check_blocked_reason(self):
        for record in self:
            if record.status == "blocked" and not record.blocked_reason:
                raise ValidationError(_("Le motif de blocage est obligatoire."))

    def action_view_visits(self):
        self.ensure_one()
        return {
            "type": "ir.actions.act_window",
            "name": _("Visites"),
            "res_model": "ar.visitor.visit",
            "view_mode": "list,form",
            "domain": [("person_id", "=", self.id)],
            "context": {"default_person_id": self.id},
        }
