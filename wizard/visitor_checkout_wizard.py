from odoo import fields, models, _
from odoo.exceptions import UserError


class ArVisitorCheckoutWizard(models.TransientModel):
    _name = "ar.visitor.checkout.wizard"
    _description = "Signature de sortie du visiteur"

    visit_id = fields.Many2one("ar.visitor.visit", string="Visite", required=True, readonly=True)
    visitor_name = fields.Char(related="visit_id.person_id.name", string="Visiteur", readonly=True)
    signature = fields.Binary(string="Signature du visiteur", required=True)

    def action_confirm(self):
        self.ensure_one()
        if not self.signature:
            raise UserError(_("La signature du visiteur est obligatoire pour valider la sortie."))
        self.visit_id._finalize_check_out(self.signature)
        return {"type": "ir.actions.act_window_close"}

