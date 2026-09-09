import hashlib
import secrets

from odoo import fields, models, _


class ArVisitorFacialTerminal(models.Model):
    _name = "ar.visitor.facial.terminal"
    _description = "Terminal facial"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "name"

    name = fields.Char(required=True, tracking=True)
    code = fields.Char(required=True, index=True, copy=False, tracking=True)
    active = fields.Boolean(default=True, tracking=True)
    location = fields.Char(string="Emplacement")
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)
    secret_hash = fields.Char(copy=False, groups="ar_visitors.group_ar_visitors_api_admin")
    last_seen_at = fields.Datetime(string="Dernier appel", readonly=True)
    last_error = fields.Text(string="Dernière erreur", readonly=True)
    minimum_confidence = fields.Float(string="Confiance minimale", default=0.80)

    _code_unique = models.Constraint("unique(code)", "Le code du terminal doit être unique.")

    def action_generate_secret(self):
        self.ensure_one()
        secret = secrets.token_urlsafe(32)
        self.secret_hash = hashlib.sha256(secret.encode()).hexdigest()
        return {
            "type": "ir.actions.client",
            "tag": "display_notification",
            "params": {
                "title": _("Nouveau secret API"),
                "message": secret,
                "type": "warning",
                "sticky": True,
            },
        }

    def verify_secret(self, secret):
        self.ensure_one()
        if not self.secret_hash or not secret:
            return False
        return secrets.compare_digest(self.secret_hash, hashlib.sha256(secret.encode()).hexdigest())

