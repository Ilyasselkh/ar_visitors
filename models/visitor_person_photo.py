from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class VisitorPersonPhoto(models.Model):
    _name = "ar.visitor.person.photo"
    _description = "Photo secondaire du visiteur"
    _order = "sequence, id"

    name = fields.Char(string="Description")
    sequence = fields.Integer(default=10)
    person_id = fields.Many2one("ar.visitor.person", required=True, ondelete="cascade", index=True)
    image = fields.Image(string="Photo", required=True, max_width=1920, max_height=1920, attachment=True)

    @api.constrains("person_id")
    def _check_photo_limit(self):
        for person in self.mapped("person_id").sorted("id"):
            self.env.cr.execute("SELECT id FROM ar_visitor_person WHERE id = %s FOR NO KEY UPDATE", [person.id])
            if self.sudo().search_count([("person_id", "=", person.id)]) > 5:
                raise ValidationError(_("Vous pouvez ajouter au maximum cinq photos secondaires par personne."))
