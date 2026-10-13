from odoo import fields, models
from odoo.exceptions import UserError


class ArVisitorCheckoutWizard(models.TransientModel):
    _name = "ar.visitor.checkout.wizard"
    _inherit = "ar.visitor.localization"
    _description = "Signature de sortie du visiteur"

    visit_id = fields.Many2one("ar.visitor.visit", string="Visite", required=True, readonly=True)
    visitor_name = fields.Char(related="visit_id.person_id.name", string="Visiteur", readonly=True)
    language = fields.Selection(
        [("fr", "Français"), ("en", "English"), ("es", "Español"), ("ar", "العربية")],
        required=True, default="fr", readonly=True,
    )
    signature = fields.Binary(string="Signature du visiteur", required=True)

    def action_confirm(self):
        self.ensure_one()
        if not self.signature:
            raise UserError(self._visitor_text("La signature du visiteur est obligatoire pour valider la sortie."))
        self.visit_id._finalize_check_out(self.signature)
        previous_day = bool(
            self.env.context.get("visitor_checkout_from_arrival") and self.visit_id.check_in_at
            and fields.Datetime.context_timestamp(self, self.visit_id.check_in_at).date()
            < fields.Date.context_today(self)
        )
        if previous_day:
            message = {
                "fr": "Merci de refaire l’enregistrement d’entrée pour votre visite d’aujourd’hui.",
                "en": "Please register your entry again for today’s visit.",
                "es": "Vuelva a registrar su entrada para la visita de hoy.",
                "ar": "يرجى إعادة تسجيل الدخول لزيارتك اليوم.",
            }[self.language]
        else:
            message = {"fr": "Merci pour votre visite", "en": "Thank you for your visit",
                       "es": "Gracias por su visita", "ar": "شكراً لزيارتكم"}[self.language]
        return {"type": "ir.actions.client", "tag": "ar_visitors.kiosk_done",
                "params": {"message": message, "delay": 8000 if previous_day else 3000}}

