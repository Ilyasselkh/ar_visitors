from odoo import fields, models
from ..safety_translations import safety_text


class VisitorSafetyInstruction(models.Model):
    _name = 'ar.visitor.safety.instruction'
    _description = 'Consigne de sécurité visiteurs'
    _order = 'sequence, id'

    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    emoji = fields.Char(string='Emoji / pictogramme', required=True, default='⚠️')
    name = fields.Text(string='Consigne', required=True, translate=True)
    image_ids = fields.One2many('ar.visitor.safety.image', 'instruction_id', string='Images par langue')

    def _localized_text(self, language):
        self.ensure_one()
        lang = {'fr': 'fr_FR', 'en': 'en_US', 'es': 'es_ES', 'ar': 'ar_001'}[language]
        return safety_text(self.with_context(lang=lang).name, language)


class VisitorSafetyImage(models.Model):
    _name = 'ar.visitor.safety.image'
    _description = 'Image de consigne de sécurité par langue'
    _order = 'sequence, id'

    instruction_id = fields.Many2one('ar.visitor.safety.instruction', required=True, ondelete='cascade')
    sequence = fields.Integer(default=10)
    active = fields.Boolean(default=True)
    name = fields.Char(string='Titre', required=True, default='Consigne de sécurité')
    language = fields.Selection([
        ('fr', 'Français'), ('en', 'English'), ('es', 'Español'), ('ar', 'العربية'),
    ], string='Langue', required=True, default='fr')
    image = fields.Image(string='Image', required=True, max_width=3840, max_height=3840, attachment=True)
    filename = fields.Char(string='Nom du fichier')

