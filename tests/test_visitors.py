import base64
from unittest.mock import patch

from dateutil.relativedelta import relativedelta

from odoo import fields
from odoo.exceptions import UserError, ValidationError
from odoo.tests.common import TransactionCase


class TestArVisitors(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.person = cls.env["ar.visitor.person"].create({
            "first_name": "Jean", "last_name": "Dupont", "cin": "AB 123-456"
        })
        cls.language_surveys = {}
        for language in ("fr", "en", "es"):
            survey = cls.env["survey.survey"].create({"title": "Quiz %s" % language.upper()})
            cls.env["ar.visitor.document"].create({
                "name": "Accueil %s" % language.upper(),
                "language": language,
                "version": "1.0",
                "survey_id": survey.id,
            })
            cls.language_surveys[language] = survey

    def test_cin_is_normalized(self):
        self.assertEqual(self.person.cin, "AB123456")

    def test_recent_visit_period(self):
        self.env["ar.visitor.visit"].create({
            "person_id": self.person.id,
            "first_name": self.person.first_name,
            "last_name": self.person.last_name,
            "cin": self.person.cin,
            "check_in_at": fields.Datetime.now(),
            "quiz_completed": True, "quiz_completed_at": fields.Datetime.now(),
            "state": "checked_out",
        })
        self.assertTrue(self.person.recent_visit)
        self.assertGreater(self.person.visit_valid_until, fields.Datetime.now() + relativedelta(months=2))

    def test_checkout_requires_signature_and_closes_visit(self):
        visit = self.env["ar.visitor.visit"].create({
            "person_id": self.person.id,
            "first_name": self.person.first_name,
            "last_name": self.person.last_name,
            "cin": self.person.cin,
            "check_in_at": fields.Datetime.now(),
            "state": "signature_pending",
        })
        visit._finalize_check_out(b"c2lnbmF0dXJl")
        self.assertEqual(visit.state, "checked_out")
        self.assertTrue(visit.signature)
        self.assertTrue(visit.check_out_at)

    def test_facial_event_is_unique(self):
        values = {
            "first_name": "Jean", "last_name": "Dupont", "cin": "AB123456",
            "facial_event_id": "EVENT-001",
        }
        self.env["ar.visitor.visit"].create(values)
        with self.assertRaises(ValidationError):
            self.env["ar.visitor.visit"].create(values)

    def test_recent_expired_and_unknown_business_paths(self):
        now = fields.Datetime.now()
        self.env["ar.visitor.visit"].create({
            "person_id": self.person.id,
            "first_name": self.person.first_name,
            "last_name": self.person.last_name,
            "cin": self.person.cin,
            "check_in_at": now,
            "quiz_completed": True, "quiz_completed_at": now,
            "state": "checked_out",
        })
        recent = self.env["ar.visitor.visit"].create({"cin": self.person.cin})
        recent.action_start_manual()
        self.assertEqual(recent.state, "host_pending")
        self.assertTrue(recent.check_in_at)

        expired_person = self.env["ar.visitor.person"].create({
            "first_name": "Maria", "last_name": "Lopez", "cin": "ES987654"
        })
        self.env["ar.visitor.visit"].create({
            "person_id": expired_person.id,
            "first_name": expired_person.first_name,
            "last_name": expired_person.last_name,
            "cin": expired_person.cin,
            "check_in_at": now - relativedelta(months=4),
            "state": "checked_out",
        })
        expired = self.env["ar.visitor.visit"].create({"cin": expired_person.cin})
        expired.action_start_manual()
        self.assertEqual(expired.state, "identity_check")
        self.assertFalse(expired.check_in_at)

        unknown = self.env["ar.visitor.visit"].create({
            "first_name": "New", "last_name": "Visitor", "cin": "NEW001"
        })
        unknown.action_confirm_identity()
        self.assertEqual(unknown.state, "identity_check")
        self.assertTrue(unknown.person_id)

        for language, survey in self.language_surveys.items():
            unknown.write({"language": language, "state": "identity_check"})
            unknown.action_select_language()
            self.assertEqual(unknown.survey_id, survey)

    def test_quiz_must_be_done_before_check_in(self):
        visit = self.env["ar.visitor.visit"].create({
            "first_name": "Quiz", "last_name": "Visitor", "cin": "QUIZ001", "language": "en"
        })
        visit.action_select_language()
        with self.assertRaises(UserError):
            visit.action_check_quiz()
        visit.survey_user_input_id.state = "done"
        visit.action_check_quiz()
        self.assertTrue(visit.quiz_completed)
        self.assertTrue(visit.check_in_at)
        self.assertEqual(visit.state, "host_pending")
        self.assertTrue(visit.person_id)

    def test_visit_does_not_extend_quiz_validity(self):
        self.env['ar.visitor.visit'].create({
            'person_id': self.person.id, 'quiz_completed': True,
            'quiz_completed_at': fields.Datetime.now() - relativedelta(months=4),
            'check_in_at': fields.Datetime.now(), 'state': 'checked_out',
        })
        self.assertFalse(self.person.recent_visit)

    def test_zero_score_automatically_continues_and_is_idempotent(self):
        visit = self.env['ar.visitor.visit'].create({
            'first_name': 'Zero', 'last_name': 'Score', 'cin': 'ZERO001',
        })
        visit.action_select_language()
        visit.survey_user_input_id._mark_done()
        self.assertEqual(visit.state, 'host_pending')
        self.assertEqual(visit.quiz_score, 0)
        timestamp = visit.check_in_at
        visit.action_check_quiz()
        self.assertEqual(visit.check_in_at, timestamp)
        self.assertTrue(visit.person_id.last_quiz_at)

    def test_empty_signature_rejected(self):
        visit = self.env['ar.visitor.visit'].create({'state': 'signature_pending'})
        with self.assertRaises(UserError):
            visit._finalize_check_out(False)

    def test_language_opens_quiz_directly(self):
        visit = self.env['ar.visitor.visit'].create({'first_name': 'No', 'last_name': 'PDF', 'cin': 'NOPDF01'})
        visit.action_select_language()
        self.assertEqual(visit.state, 'quiz_pending')

    def test_unknown_face_cannot_reuse_cin_to_skip_quiz(self):
        visit = self.env['ar.visitor.visit'].create({
            'first_name': 'Jean', 'last_name': 'Dupont', 'cin': self.person.cin,
            'facial_result': 'unknown', 'state': 'identity_input',
        })
        visit.action_confirm_identity()
        self.assertEqual(visit.state, 'approval_pending')
        self.assertFalse(visit.check_in_at)

    def test_finished_quiz_renders_return_to_visit(self):
        visit = self.env['ar.visitor.visit'].create({
            'first_name': 'Render', 'last_name': 'Quiz', 'cin': 'RENDER01',
        })
        visit.action_select_language()
        answer = visit.survey_user_input_id
        answer._mark_done()
        rendered = self.env['ir.qweb']._render('survey.survey_fill_form_done', {
            'answer': answer, 'survey': visit.survey_id,
        })
        self.assertIn('data-visitor-return', str(rendered))

    def test_provider_is_explicitly_unavailable(self):
        from ..models.recognition_provider import RecognitionNotConfigured
        with self.assertRaises(RecognitionNotConfigured):
            self.env['ar.visitor.recognition.provider']._recognize('photo', self.env['ar.visitor.facial.terminal'])

    def test_manual_kiosk_new_visitor(self):
        visit = self.env['ar.visitor.visit'].create({})
        action = visit.action_open_kiosk()
        self.assertEqual(visit.state, 'identity_input')
        self.assertEqual(action['type'], 'ir.actions.client')
        self.assertEqual(action['tag'], 'ar_visitors.open_kiosk')
        self.assertIn('/ar-visitors/kiosk/', action['params']['url'])

    def test_incomplete_quiz_cannot_check_in(self):
        visit = self.env['ar.visitor.visit'].create({'state': 'host_pending'})
        with self.assertRaises(UserError):
            visit.action_check_in()

    def test_entry_notification_and_signed_exit(self):
        visit = self.env['ar.visitor.visit'].create({
            'first_name': 'Flow', 'last_name': 'Test', 'cin': 'FLOW001',
        })
        visit.action_select_language()
        visit.survey_user_input_id._mark_done()
        entry = visit.check_in_at
        host = self.env['hr.employee'].create({'name': 'Test Host', 'work_email': 'host@example.test'})
        visit.host_employee_id = host
        template = self.env.ref('ar_visitors.mail_template_visitor_arrival')
        with patch.object(type(template), 'send_mail', return_value=1) as send:
            visit.action_check_in()
            send.assert_called_once()
        self.assertEqual(visit.notification_state, 'sent')
        self.assertEqual(visit.check_in_at, entry)
        visit.action_check_out()
        self.assertFalse(visit.check_out_at)
        visit._finalize_check_out(b'c2lnbmF0dXJl')
        self.assertTrue(visit.check_out_at)

    def test_language_dialog_rendered(self):
        visit = self.env['ar.visitor.visit'].create({'state': 'identity_check'})
        html = self.env['ir.qweb']._render('ar_visitors.kiosk_page', {
            'visit': visit, 'error': None, 'employees': self.env['hr.employee'],
        })
        self.assertIn('ar-language-dialog', str(html))
