import hashlib
import uuid
from datetime import timedelta

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class VisitorConsent(models.Model):
    _name = 'ar.visitor.consent'
    _description = 'Consentement à la reconnaissance faciale'
    _order = 'accepted_at desc'

    token = fields.Char(required=True, default=lambda self: uuid.uuid4().hex, index=True, copy=False)
    accepted_at = fields.Datetime(required=True, default=fields.Datetime.now)
    version = fields.Char(required=True)
    text = fields.Text(required=True)
    operator_id = fields.Many2one('res.users', required=True)
    company_id = fields.Many2one('res.company', required=True)
    person_id = fields.Many2one('ar.visitor.person', ondelete='set null')

    @api.model
    def _policy(self):
        params = self.env['ir.config_parameter'].sudo()
        days = max(1, int(params.get_param('ar_visitors.photo_retention_days', 365)))
        retention = (params.get_param('ar_visitors.retention_policy', '') or '').strip()
        text = (
            "Vos informations et vos photos sont utilisées pour gérer vos visites et faciliter "
            "votre identification lors de vos prochains passages par reconnaissance faciale. "
            "Leur accès est réservé au personnel habilité dans Odoo. La lecture de votre CIN ou "
            "passeport et la comparaison des visages sont effectuées dans ce navigateur, sans "
            "service OCR externe. L’image du document n’est pas enregistrée dans Odoo. "
            "Les photos du visage sont supprimées de la base active après %s jours, "
            "lors du nettoyage quotidien. "
        ) % days
        if retention:
            text += (
                "Les identités, historiques de visites, preuves de consentement et sauvegardes suivent "
                "la politique de conservation de l’établissement : %s "
            ) % retention
        text += (
            "\n\n"
            "J’accepte l’enregistrement de mes informations et de mes photos ainsi que leur "
            "utilisation pour la reconnaissance faciale."
        )
        return {'text': text, 'version': '1-' + hashlib.sha256(text.encode()).hexdigest()[:16]}

    @api.model
    def _from_token(self, token):
        receipt = self.sudo().search([
            ('token', '=', token or ''), ('operator_id', '=', self.env.uid),
            ('company_id', '=', self.env.company.id),
            ('accepted_at', '>=', fields.Datetime.now() - timedelta(minutes=30)),
        ], limit=1)
        if not receipt:
            raise ValidationError(_("Le consentement est absent ou expiré. Veuillez l’accepter à nouveau."))
        return receipt

    def _attach_person(self, person):
        self.ensure_one()
        if self.person_id and self.person_id != person:
            raise ValidationError(_("Ce consentement est déjà associé à une autre personne."))
        self.sudo().person_id = person
        person.sudo().write({'consent': True, 'consent_at': self.accepted_at,
                             'consent_version': self.version, 'consent_text': self.text})

    @api.model
    def _cron_purge_photos(self):
        days = max(1, int(self.env['ir.config_parameter'].sudo().get_param('ar_visitors.photo_retention_days', 365)))
        cutoff = fields.Datetime.now() - timedelta(days=days)
        people = self.env['ar.visitor.person'].sudo().with_context(active_test=False).search([
            '|', ('photo_saved_at', '<', cutoff),
            '&', ('photo_saved_at', '=', False), ('create_date', '<', cutoff),
        ])
        people.write({'image_1920': False})
        self.env['ar.visitor.person.photo'].sudo().search([('write_date', '<', cutoff)]).unlink()
        self.env['ar.visitor.visit'].sudo().with_context(active_test=False).search([
            ('create_date', '<', cutoff),
        ]).write({'photo': False})
