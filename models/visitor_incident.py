from odoo import fields, models


class ArVisitorIncident(models.Model):
    _name = "ar.visitor.incident"
    _description = "Incident visiteur"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "create_date desc"

    name = fields.Char(required=True, default="Incident", tracking=True)
    incident_type = fields.Selection(
        [
            ("missing_cin", "CIN absente"),
            ("identity_mismatch", "Identité incohérente"),
            ("low_confidence", "Confiance insuffisante"),
            ("blocked", "Personne bloquée"),
            ("email_failed", "Échec e-mail"),
            ("api_error", "Erreur API"),
            ("other", "Autre"),
        ],
        required=True,
        default="other",
        tracking=True,
    )
    visit_id = fields.Many2one("ar.visitor.visit", ondelete="cascade", index=True)
    person_id = fields.Many2one("ar.visitor.person", ondelete="set null")
    terminal_id = fields.Many2one("ar.visitor.facial.terminal", ondelete="set null")
    details = fields.Text(required=True)
    resolved = fields.Boolean(tracking=True)
    resolved_by_id = fields.Many2one("res.users", readonly=True)
    resolved_at = fields.Datetime(readonly=True)

    def action_resolve(self):
        self.write({"resolved": True, "resolved_by_id": self.env.user.id, "resolved_at": fields.Datetime.now()})
