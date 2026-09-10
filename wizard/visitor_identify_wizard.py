from odoo import fields, models, _
from odoo.exceptions import ValidationError


class VisitorIdentifyWizard(models.TransientModel):
    _name = "ar.visitor.identify.wizard"
    _description = "Identifier le visiteur"

    cin = fields.Char(string="CIN", required=True)

    def action_continue(self):
        self.ensure_one()
        Visit = self.env["ar.visitor.visit"]
        Visit.check_access("create")
        Person = self.env["ar.visitor.person"].sudo().with_context(active_test=False)
        cin = Person.normalize_cin(self.cin)
        if len(cin) < 4:
            raise ValidationError(_("Veuillez saisir une CIN valide (au moins 4 caractères)."))
        # Serialize simultaneous requests for the same CIN within this company.
        self.env.cr.execute("SELECT pg_advisory_xact_lock(hashtext(%s))",
                            ["ar_visitors:%s:%s" % (self.env.company.id, cin)])
        visit = Visit.search([
            ("cin", "=", cin), ("company_id", "=", self.env.company.id),
            ("state", "not in", ["checked_out", "refused", "cancelled"]),
        ], limit=1)
        if not visit:
            person = Person.search([("cin", "=", cin)], limit=1)
            valid = bool(person and person.active and person.recent_visit)
            vals = {"cin": cin, "facial_result": "manual", "state": "identity_input"}
            if person:
                vals.update({
                    "person_id": person.id, "first_name": person.first_name,
                    "last_name": person.last_name, "photo": person.image_1920,
                    "visitor_company": person.company_name,
                    "nationality_id": person.nationality_id.id,
                    "language": person.preferred_language or "fr",
                    "validation_was_valid": valid,
                    "check_in_at": fields.Datetime.now() if valid else False,
                    "state": "host_pending" if valid else "identity_check",
                })
                if not person.active or person.status != "active":
                    vals["state"] = "refused"
            visit = Visit.create(vals)
        return {
            "type": "ir.actions.act_window", "name": _("Visite"),
            "res_model": "ar.visitor.visit", "res_id": visit.id,
            "views": [(False, "form")], "target": "current",
        }
