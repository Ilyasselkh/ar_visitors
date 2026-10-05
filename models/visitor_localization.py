from lxml import etree

from odoo import api, models

from ..visitor_i18n import visitor_language, visitor_text


class VisitorLocalization(models.AbstractModel):
    _name = "ar.visitor.localization"
    _description = "Visitor journey translations"

    def _visitor_text(self, source):
        return visitor_text(source, self.env.context.get("lang"))

    @api.model
    def get_view(self, view_id=None, view_type="form", **options):
        # Only lang affects this result: Odoo's view service caches by lang and
        # strips other context keys. Translate a fresh, access-checked source
        # architecture, never the shared cached tree or another visitor's view.
        language = visitor_language(self.env.context.get("lang"))
        source_model = self.with_context(lang="en_US")
        result = super(VisitorLocalization, source_model).get_view(view_id, view_type, **options)
        root = etree.fromstring(result["arch"])
        for node in root.iter():
            if not isinstance(node.tag, str):
                continue
            for attribute in ("string", "placeholder", "title", "aria-label", "confirm", "help"):
                if node.get(attribute):
                    node.set(attribute, visitor_text(node.get(attribute), language))
            for attribute in ("text", "tail"):
                value = getattr(node, attribute)
                if value and value.strip():
                    setattr(node, attribute, value.replace(value.strip(), visitor_text(value.strip(), language)))
        if view_type == "form":
            root.set("dir", "rtl" if language == "ar" else "ltr")
            root.set("lang", language)
        result["arch"] = etree.tostring(root, encoding="unicode")
        return result

    @api.model
    def fields_get(self, allfields=None, attributes=None):
        language = visitor_language(self.env.context.get("lang"))
        source_model = self.with_context(lang="en_US")
        result = super(VisitorLocalization, source_model).fields_get(allfields, attributes)
        labels = {"language": "Langue", "state": "État", "department_id": "Département",
                  "quiz_completed_at": "Date de fin du quiz", "company_id": "Société",
                  "notification_state": "Notification"}
        for name, field in result.items():
            if name in labels and "string" in field:
                field["string"] = labels[name]
            for attribute in ("string", "help"):
                if field.get(attribute):
                    field[attribute] = visitor_text(field[attribute], language)
            if field.get("selection"):
                field["selection"] = [(value, visitor_text(label, language)) for value, label in field["selection"]]
        return result
