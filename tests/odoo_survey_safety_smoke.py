"""Integration checks for survey introduction; all sample data are rolled back."""
from datetime import timedelta
import base64
import io
from PIL import Image
from odoo import fields
from unittest.mock import patch
from types import SimpleNamespace
from werkzeug.exceptions import NotFound
from werkzeug.test import EnvironBuilder
from odoo.addons.ar_visitors.controllers.survey import VisitorSurvey

try:
    survey = env['survey.survey'].create({'title': 'Visitor safety intro test', 'description': '<p>Original survey description</p>'})
    env['survey.question'].create({'survey_id': survey.id, 'title': 'Test question', 'question_type': 'text_box'})
    answer = survey._create_answer(check_attempts=False)
    assert answer._visitor_safety_instructions() == []
    instruction = env['ar.visitor.safety.instruction'].create({'name': 'Dynamic safety text', 'emoji': '⚠️'})
    buffer = io.BytesIO(); Image.new('RGB', (20, 20), 'blue').save(buffer, 'PNG')
    images = {}
    for language in ['fr', 'en', 'es', 'ar']:
        images[language] = env['ar.visitor.safety.image'].create({'instruction_id': instruction.id, 'language': language,
                            'name': language + ' safety image', 'image': base64.b64encode(buffer.getvalue())})
    visit = env['ar.visitor.visit'].create({'survey_id': survey.id, 'survey_user_input_id': answer.id,
             'language': 'fr', 'state': 'quiz_pending', 'kiosk_token_expires_at': fields.Datetime.now() + timedelta(minutes=15)})
    for language in ['fr', 'en', 'es', 'ar']:
        visit.language = language
        row = next(row for row in answer._visitor_safety_instructions() if row['name'] == 'Dynamic safety text')
        assert len(row['images']) == 1 and row['images'][0]['name'] == language + ' safety image'
        assert '/safety-image/' in row['images'][0]['url']
    visit.language = 'fr'
    rendered = str(env['ir.qweb']._render('survey.survey_fill_form_start', {'survey': survey, 'answer': answer}))
    assert 'Original survey description' in rendered and 'Dynamic safety text' in rendered
    assert 'fr safety image' in rendered and 'en safety image' not in rendered
    assert rendered.index('Original survey description') < rendered.index('Dynamic safety text')
    controller = VisitorSurvey()
    fake_request = SimpleNamespace(env=env, db=env.cr.dbname, update_context=lambda **kwargs: None, httprequest=SimpleNamespace(environ=EnvironBuilder().get_environ()))
    with patch('odoo.addons.survey.controllers.main.request', fake_request), patch('odoo.addons.ar_visitors.controllers.survey.request', fake_request), patch('odoo.addons.base.models.ir_attachment.request', fake_request), patch('odoo.http.request', fake_request):
        assert controller._get_access_data(survey.access_token, answer.access_token)['validity_code'] is True
        response = controller.visitor_safety_image(survey.access_token, answer.access_token, images['fr'].id)
        assert response.headers['Cache-Control'] == 'private, no-store'
        try:
            controller.visitor_safety_image(survey.access_token, answer.access_token, images['en'].id)
            raise AssertionError('Wrong-language image is accessible')
        except NotFound:
            pass
        try:
            controller.visitor_safety_image(survey.access_token, 'invalid-answer-token', images['fr'].id)
            raise AssertionError('Image is accessible with an invalid token')
        except NotFound:
            pass
    instruction.name = 'Updated safety text'
    assert any(row['name'] == 'Updated safety text' for row in answer._visitor_safety_instructions())
    visit.kiosk_token_expires_at = fields.Datetime.now() - timedelta(minutes=1)
    assert not answer._visitor_safety_instructions()
    invitation = env['ar.visitor.invitation'].create({'email': 'safety@example.invalid', 'planned_date': fields.Date.today(),
                 'language': 'en', 'state': 'quiz_pending', 'token': 'safety-test', 'expires_at': fields.Datetime.now() + timedelta(hours=1)})
    answer.visitor_invitation_id = invitation
    row = next(row for row in answer._visitor_safety_instructions() if any(image['name'] == 'en safety image' for image in row['images']))
    assert [image['name'] for image in row['images']] == ['en safety image']
    invitation.expires_at = fields.Datetime.now() - timedelta(minutes=1)
    assert not answer._visitor_safety_instructions()
    print('SURVEY SAFETY OK: original description preserved, dynamic instructions, four languages, protected images, remote invitation, expiry')
finally:
    env.cr.rollback()
