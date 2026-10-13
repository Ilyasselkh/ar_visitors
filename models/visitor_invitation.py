from datetime import datetime, time, timedelta
from urllib.parse import urlsplit

from dateutil.relativedelta import relativedelta
from markupsafe import Markup
from odoo import api, fields, models, _
from odoo.exceptions import AccessError, ValidationError
from odoo.tools import email_normalize
from odoo.tools.misc import format_date

from ..prereg_security import new_token, new_code, code_digest, code_matches
from ..invitation_mail import invitation_body
from ..visitor_i18n import LANG_CODES


class VisitorInvitation(models.Model):
    _name = 'ar.visitor.invitation'
    _description = 'Pré-enregistrement visiteur'
    _order = 'planned_date desc, id desc'
    _rec_name = 'email'

    email = fields.Char()
    safety_pending = fields.Boolean(readonly=True, copy=False)
    safety_understanding = fields.Selection([('yes', 'Consignes comprises'), ('no', 'Explications à demander à l’accueil')], string="Compréhension des consignes", readonly=True, copy=False)
    safety_acknowledged_at = fields.Datetime(string="Consignes consultées le", readonly=True, copy=False)
    is_shared = fields.Boolean(string="Lien partagé", default=False, copy=True)
    parent_id = fields.Many2one('ar.visitor.invitation', string="Invitation partagée", readonly=True, copy=False, ondelete='restrict')
    registration_ids = fields.One2many('ar.visitor.invitation', 'parent_id', string="Inscriptions", readonly=True)
    share_url = fields.Char(string="Lien à partager", compute='_compute_share_url')

    @api.depends('token', 'is_shared')
    def _compute_share_url(self):
        for record in self:
            secured = record.sudo()
            record.share_url = secured._public_base_url() + secured._url() if secured.is_shared and secured.token else False

    @api.depends('is_shared', 'email', 'first_name', 'last_name', 'planned_date')
    def _compute_display_name(self):
        for record in self:
            record.display_name = (_('Invitation partagée — %s', record.planned_date) if record.is_shared
                                   else ' '.join(filter(None, [record.first_name, record.last_name]))
                                   or record.email or _('Inscription — %s', record.id))
    planned_date = fields.Date(string="Date d’arrivée prévue", required=True)
    company_id = fields.Many2one('res.company', required=True, default=lambda s: s.env.company)
    language = fields.Selection([('fr', 'Français'), ('en', 'English'), ('es', 'Español'), ('ar', 'العربية')], default='fr', required=True)
    state = fields.Selection([('draft', 'Brouillon'), ('sent', 'Invitation envoyée'),
                              ('quiz_pending', 'Quiz en cours'), ('ready', 'Pré-enregistré — en attente d’arrivée'),
                              ('on_site', 'Parcours sur place'), ('arrived', 'Arrivé'), ('cancelled', 'Annulé'), ('expired', 'Expiré')], default='draft', readonly=True, copy=False, index=True)
    expires_at = fields.Datetime(readonly=True, copy=False)
    token = fields.Char(readonly=True, copy=False, index=True, groups='base.group_system')
    otp_hash = fields.Char(readonly=True, copy=False, groups='base.group_system')
    otp_expires_at = fields.Datetime(readonly=True, copy=False, groups='base.group_system')
    otp_sent_at = fields.Datetime(readonly=True, copy=False, groups='base.group_system')
    otp_attempts = fields.Integer(readonly=True, copy=False, groups='base.group_system')
    otp_window_at = fields.Datetime(readonly=True, copy=False, groups='base.group_system')
    otp_sends = fields.Integer(readonly=True, copy=False, groups='base.group_system')
    first_name = fields.Char(readonly=True, copy=False)
    last_name = fields.Char(readonly=True, copy=False)
    cin = fields.Char(readonly=True, copy=False, index=True)
    phone = fields.Char(readonly=True, copy=False)
    visitor_company = fields.Char(readonly=True, copy=False)
    nationality_id = fields.Many2one('res.country', readonly=True, copy=False)
    photo = fields.Image(max_width=1920, max_height=1920, attachment=True, readonly=True, copy=False)
    consent_at = fields.Datetime(readonly=True, copy=False)
    person_id = fields.Many2one('ar.visitor.person', readonly=True, copy=False, ondelete='set null')
    visit_id = fields.Many2one('ar.visitor.visit', readonly=True, copy=False, ondelete='set null')
    document_id = fields.Many2one('ar.visitor.document', readonly=True, copy=False)
    survey_id = fields.Many2one(related='document_id.survey_id')
    survey_user_input_id = fields.Many2one('survey.user_input', readonly=True, copy=False, ondelete='set null', groups='base.group_system')
    quiz_completed_at = fields.Datetime(readonly=True, copy=False)

    @api.model_create_multi
    def create(self, vals_list):
        allowed = {'email', 'planned_date', 'company_id', 'language', 'is_shared'}
        if not self.env.su and any(set(vals) - allowed for vals in vals_list):
            raise AccessError(_('Les données du parcours sont renseignées par le système.'))
        return super().create(vals_list)

    def write(self, vals):
        if not self.env.su:
            if set(vals) - {'email', 'planned_date', 'language', 'is_shared'} or any(r.state != 'draft' for r in self):
                raise AccessError(_('Annulez puis dupliquez une invitation pour modifier sa date ou son destinataire.'))
        return super().write(vals)

    @api.constrains('email', 'planned_date', 'is_shared', 'parent_id')
    def _check_details(self):
        for record in self:
            if (record.email or not (record.is_shared or record.parent_id)) and not email_normalize(record.email):
                raise ValidationError(_('Adresse e-mail invalide.'))

    def _lock(self):
        self.ensure_one()
        self.env.cr.execute('SELECT id FROM ar_visitor_invitation WHERE id = %s FOR UPDATE', [self.id])
        self.invalidate_recordset()

    def _live(self):
        return (self.state in ('sent', 'quiz_pending', 'ready') and self.token
                and (not self.parent_id or self.parent_id._live())
                and self.expires_at and self.expires_at >= fields.Datetime.now())

    def _url(self):
        if self.is_shared:
            return '/ar-visitors/invite/%s' % self.token
        return '/ar-visitors/pre-register/%s' % self.token

    def _mail(self, subject, body):
        self.env['mail.mail'].sudo().create({
            'subject': subject, 'body_html': body, 'email_to': email_normalize(self.email),
            'email_from': self.company_id.email_formatted or self.env.user.email_formatted,
            'auto_delete': True,
        })
        # Wake the standard queue after this transaction commits: its normal
        # hourly interval is longer than the login code's ten-minute lifetime.
        self.env.ref('mail.ir_cron_mail_scheduler_action').sudo()._trigger()

    def _public_base_url(self):
        configured = self.env['ir.config_parameter'].sudo().get_param('ar_visitors.public_base_url', '')
        base = (configured or '').strip() or (self.get_base_url() or '').strip()
        try:
            parsed = urlsplit(base)
            valid = (parsed.scheme == 'https' and parsed.hostname and not parsed.username
                     and not parsed.password and not parsed.query and not parsed.fragment
                     and parsed.path in ('', '/') and not any(c.isspace() for c in base))
            parsed.port  # Validate an optional port before generating the link.
        except ValueError:
            valid = False
        if not valid:
            raise ValidationError(_(
                'Configurez ar_visitors.public_base_url avec l’adresse publique HTTPS de cette base Odoo '
                '(exemple : https://odoo.entreprise.com), sans chemin ni paramètres. '
                'Si ce paramètre est vide, web.base.url est utilisé.'))
        return base.rstrip('/')

    def action_send(self):
        self.check_access('write')
        for invitation in self:
            record = invitation.sudo()
            record._lock()
            if record.state not in ('draft', 'sent', 'quiz_pending', 'ready'):
                raise ValidationError(_('Dupliquez cette invitation pour en créer une nouvelle.'))
            if record.planned_date < fields.Date.context_today(record):
                raise ValidationError(_('La date prévue doit être aujourd’hui ou dans le futur.'))
            base = record._public_base_url()
            if record.is_shared:
                if not record.token:
                    record.write({'token': new_token(), 'state': 'sent',
                                  'expires_at': datetime.combine(record.planned_date + timedelta(days=1), time.min)})
                continue
            record.write({'token': new_token(), 'otp_hash': False, 'otp_attempts': 0,
                          'expires_at': datetime.combine(record.planned_date + timedelta(days=1), time.min),
                          'state': 'sent' if record.state == 'draft' else record.state})
            from ..prereg_labels import labels
            text = labels(record.language)
            record._mail(text['invite_subject'], invitation_body(
                text, record.company_id.name,
                format_date(record.env, record.planned_date, lang_code=LANG_CODES[record.language], date_format='long'),
                base + record._url(), record.language))
        return True

    def action_cancel(self):
        self.check_access('write')
        for invitation in self:
            record = invitation.sudo()
            record._lock()
            if record.state == 'arrived' or record.visit_id:
                raise ValidationError(_('Cette invitation est déjà liée à un parcours sur place.'))
            record.write({'state': 'cancelled', 'token': False, 'otp_hash': False})
        return True

    def _send_code(self):
        self._lock()
        now = fields.Datetime.now()
        if not self._live():
            return False
        if self.otp_sent_at and now - self.otp_sent_at < timedelta(seconds=60):
            return False
        count = self.otp_sends if self.otp_window_at and now - self.otp_window_at < timedelta(hours=1) else 0
        if count >= 5:
            return False
        code = new_code()
        self.write({'otp_hash': code_digest(self.token, code), 'otp_expires_at': now + timedelta(minutes=10),
                    'otp_sent_at': now, 'otp_attempts': 0, 'otp_sends': count + 1,
                    'otp_window_at': self.otp_window_at if count else now})
        from ..prereg_labels import labels
        text = labels(self.language)
        self._mail(text['code_subject'], Markup('<p>%s</p><p><strong>%s</strong></p>') % (text['code_body'], code))
        return True

    def _verify_code(self, code):
        self._lock()
        if not self._live() or not self.otp_expires_at or self.otp_expires_at < fields.Datetime.now() or self.otp_attempts >= 5:
            return False
        self.otp_attempts += 1
        if not code_matches(self.token, code, self.otp_hash):
            return False
        self.otp_hash = False
        return True

    def _quiz_unavailable_reason(self):
        self.ensure_one()
        document = self.env['ar.visitor.document'].sudo().get_current_document(self.language, self.company_id)
        if not document:
            return 'quiz_missing'
        survey = document.survey_id
        if not survey.active:
            return 'quiz_archived'
        if survey.session_state:
            return 'quiz_session'
        if survey.users_login_required:
            return 'quiz_login'
        if not survey.question_ids:
            return 'quiz_empty'
        if survey.scoring_type == 'no_scoring' or survey.scoring_max_obtainable <= 0:
            return 'quiz_scoring'
        return False

    def _start_quiz(self):
        return self._complete_registration()

    def _legacy_start_quiz(self):
        self.ensure_one()
        if self._quiz_unavailable_reason():
            return False
        document = self.env['ar.visitor.document'].sudo().get_current_document(self.language, self.company_id)
        answer = document.survey_id._create_answer(check_attempts=False)
        answer.visitor_invitation_id = self.id
        self.write({'document_id': document.id, 'survey_user_input_id': answer.id, 'state': 'quiz_pending'})
        return True

    def _finish_quiz(self):
        return self._complete_registration()

    def _complete_registration(self):
        for record in self:
            record._lock()
            if (record.is_shared or record.state not in ('sent', 'quiz_pending') or not record._live()
                    or not record.safety_understanding
                    or not all([record.first_name, record.last_name, record.cin, record.photo, record.consent_at])):
                continue
            Person = self.env['ar.visitor.person'].sudo().with_context(active_test=False)
            self.env.cr.execute('SELECT pg_advisory_xact_lock(hashtext(%s))', ['ar_visitors:identity:' + record.cin])
            person = Person.search([('cin', '=', record.cin)], limit=1)
            if person and (not person.active or person.status != 'active'):
                record.write({'state': 'cancelled', 'otp_hash': False})
                continue
            if not person:
                person = Person.create({'first_name': record.first_name, 'last_name': record.last_name,
                                        'cin': record.cin, 'email': record.email, 'phone': record.phone,
                                        'company_name': record.visitor_company, 'nationality_id': record.nationality_id.id,
                                        'image_1920': record.photo, 'preferred_language': record.language,
                                        'consent': True, 'consent_at': record.consent_at})
            # Never overwrite a known person's identity/photo with remote self-declared data.
            record.write({'person_id': person.id, 'state': 'ready'})
        return all(record.state == 'ready' for record in self)

    def _quiz_valid(self):
        self.ensure_one()
        months = int(self.env['ir.config_parameter'].sudo().get_param('ar_visitors.validity_months', 3))
        document = self.env['ar.visitor.document'].sudo().get_current_document(self.language, self.company_id)
        return bool(self.quiz_completed_at and self.quiz_completed_at + relativedelta(months=months) >= fields.Datetime.now()
                    and document == self.document_id and self.survey_user_input_id.scoring_success)

    def _arrival_values(self, person):
        self._lock()
        today = fields.Date.context_today(self)
        if (self.state != 'ready' or self.planned_date != today or not self._live() or self.visit_id
                or person != self.person_id or not person.active or person.status != 'active'):
            return {}
        valid = bool(self.quiz_completed_at and self._quiz_valid())
        return {'invitation_id': self.id, 'person_id': person.id, 'first_name': person.first_name,
                'last_name': person.last_name, 'cin': person.cin, 'photo': person.image_1920,
                'nationality_id': person.nationality_id.id, 'visitor_company': person.company_name,
                'state': 'host_pending', 'validation_was_valid': valid,
                'quiz_completed': valid, 'quiz_completed_at': self.quiz_completed_at if valid else False,
                'survey_id': self.survey_id.id if valid else False,
                'survey_user_input_id': self.survey_user_input_id.id if valid else False,
                'check_in_at': False}

    @api.model
    def _cron_expire_invitations(self):
        records = self.sudo().search([('state', 'in', ['sent', 'quiz_pending', 'ready']), ('expires_at', '<', fields.Datetime.now())], limit=500)
        for record in records:
            record._lock()
            if not record._live() and record.state in ('sent', 'quiz_pending', 'ready'):
                record.write({'state': 'expired', 'token': False, 'otp_hash': False})
