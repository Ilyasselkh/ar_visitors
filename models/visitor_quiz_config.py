from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ArVisitorDocument(models.Model):
    _name = "ar.visitor.document"
    _description = "Configuration des quiz par langue"
    _inherit = ["mail.thread", "mail.activity.mixin"]
    _order = "language, sequence, version desc"

    name = fields.Char(string="Titre", required=True, tracking=True)
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True, tracking=True)
    language = fields.Selection(
        [("fr", "Français"), ("en", "English"), ("es", "Español"), ("ar", "العربية")],
        required=True,
        tracking=True,
    )
    version = fields.Char(required=True, default="1.0", tracking=True)
    survey_id = fields.Many2one(
        "survey.survey", string="Quiz associé", required=True, domain=[("active", "=", True)]
    )
    company_id = fields.Many2one("res.company", default=lambda self: self.env.company, required=True)

    _language_company_unique = models.Constraint(
        "unique(language, company_id, version)",
        "Une seule version de quiz par langue et société est autorisée.",
    )

    @api.constrains("active", "language", "company_id")
    def _check_one_active_document_per_language(self):
        for record in self.filtered("active"):
            duplicate = self.search_count([
                ("id", "!=", record.id),
                ("active", "=", True),
                ("language", "=", record.language),
                ("company_id", "=", record.company_id.id),
            ])
            if duplicate:
                raise ValidationError(_(
                    "Un seul quiz actif est autorisé par langue et par société."
                ))

    @api.model
    def get_current_document(self, language, company=None):
        company = company or self.env.company
        return self.search(
            [
                ("active", "=", True),
                ("language", "=", language),
                ("company_id", "=", company.id),
            ],
            order="sequence, id desc",
            limit=1,
        )
