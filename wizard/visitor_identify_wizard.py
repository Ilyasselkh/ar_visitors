from odoo import fields, models, _
from odoo.exceptions import ValidationError


class VisitorIdentifyWizard(models.TransientModel):
    _name = "ar.visitor.identify.wizard"
    _description = "Identifier le visiteur"

    cin = fields.Char(string="CIN / passeport", required=True)

    step = fields.Selection([("cin", "CIN / passeport"), ("language", "Langue")], default="cin", required=True)
    language = fields.Selection([("fr", "Français"), ("en", "English"), ("es", "Español")], required=True, default="fr")

    def action_continue(self):
        self.ensure_one()
        cin = self.env["ar.visitor.person"].normalize_cin(self.cin)
        if len(cin) < 4:
            raise ValidationError(_("Veuillez saisir une CIN / passeport valide (au moins 4 caractères)."))
        self.write({"cin": cin, "step": "language"})
        return {"type": "ir.actions.act_window", "res_model": self._name,
                "res_id": self.id, "views": [(False, "form")], "target": "new",
                "name": "Français · English · Español"}

    def action_choose_fr(self):
        self.language = "fr"
        return self.action_identify()

    def action_choose_en(self):
        self.language = "en"
        return self.action_identify()

    def action_choose_es(self):
        self.language = "es"
        return self.action_identify()

    def action_identify(self):
        self.ensure_one()
        Visit = self.env["ar.visitor.visit"]
        Visit.check_access("create")
        Person = self.env["ar.visitor.person"].sudo().with_context(active_test=False)
        cin = Person.normalize_cin(self.cin)
        if len(cin) < 4:
            raise ValidationError(_("Veuillez saisir une CIN / passeport valide (au moins 4 caractères)."))
        # Serialize simultaneous requests for the same CIN / passeport within this company.
        self.env.cr.execute("SELECT pg_advisory_xact_lock(hashtext(%s))",
                            ["ar_visitors:%s:%s" % (self.env.company.id, cin)])
        visit = Visit.search([
            ("cin", "=", cin), ("company_id", "=", self.env.company.id),
            ("state", "not in", ["checked_out", "refused", "cancelled"]),
        ], limit=1)
        if not visit:
            person = Person.search([("cin", "=", cin)], limit=1)
            valid = bool(person and person.active and person.recent_visit)
            vals = {"cin": cin, "facial_result": "manual", "state": "identity_input", "language": self.language}
            if person:
                vals.update({
                    "person_id": person.id, "first_name": person.first_name,
                    "last_name": person.last_name, "photo": person.image_1920,
                    "visitor_company": person.company_name,
                    "nationality_id": person.nationality_id.id,
                    "language": self.language,
                    "validation_was_valid": valid,
                    "check_in_at": fields.Datetime.now() if valid else False,
                    "state": "host_pending" if valid else "identity_check",
                })
                if not person.active or person.status != "active":
                    vals["state"] = "refused"
            visit = Visit.create(vals)
        # A running quiz keeps its original language and answer.
        if visit.state not in ("quiz_pending", "checked_out"):
            visit.language = self.language
        lang = {"fr": "fr_FR", "en": "en_GB", "es": "es_ES"}[visit.language]
        form_action = {
            "context": dict(self.env.context, lang=lang),
            "type": "ir.actions.act_window", "name": {"fr": "Visite", "en": "Visit", "es": "Visita"}[visit.language],
            "res_model": "ar.visitor.visit", "res_id": visit.id,
            "views": [(False, "form")], "target": "current",
        }
        if visit.state in ("identity_input", "identity_check", "quiz_pending", "host_pending"):
            return {"type": "ir.actions.client", "tag": "ar_visitors.start_journey",
                    "params": {"form_action": form_action, "visit_id": visit.id}}
        return form_action
