"""Check configured safety text in kiosk and remote surveys; roll back test records."""
from datetime import timedelta
from odoo import fields
from odoo.addons.ar_visitors.safety_translations import safety_text

try:
    env.user.group_ids = [(4, env.ref('ar_visitors.group_ar_visitors_admin').id)]
    Bridge = env['ar.visitor.face.bridge']
    baseline = {row['id']: row for row in Bridge.safety_instructions('fr')}
    assert baseline
    for language in ['en', 'es', 'ar']:
        untranslated = [row['name'] for row in Bridge.safety_instructions(language) if row['name'] == baseline[row['id']]['name']]
        assert not untranslated, (language, untranslated)
        phone = '00 11 22 33 44'
        assert safety_text('EN CAS D’URGENCE\nUrgence interne / HSE : ' + phone, language).endswith(phone)
    survey = env['survey.survey'].create({'title': 'Safety translation test', 'description': '<p>Existing description</p>'})
    answer = survey._create_answer(check_attempts=False)
    visit = env['ar.visitor.visit'].create({'survey_id': survey.id, 'survey_user_input_id': answer.id,
            'state': 'quiz_pending', 'language': 'fr', 'kiosk_token_expires_at': fields.Datetime.now() + timedelta(minutes=15)})
    for language in ['fr', 'en', 'es', 'ar']:
        visit.language = language
        assert [row['name'] for row in answer._visitor_safety_instructions()] == [row['name'] for row in Bridge.safety_instructions(language)]
        rendered = str(env['ir.qweb']._render('survey.survey_fill_form_start', {'survey': survey, 'answer': answer}))
        assert 'Existing description' in rendered
        assert answer._visitor_safety_instructions()[0]['name'] in rendered
    invitation = env['ar.visitor.invitation'].create({'email': 'translations@example.invalid', 'planned_date': fields.Date.today(),
                  'state': 'quiz_pending', 'token': 'translation-test', 'expires_at': fields.Datetime.now() + timedelta(hours=1)})
    answer.visitor_invitation_id = invitation
    for language in ['fr', 'en', 'es', 'ar']:
        invitation.language = language
        assert [row['name'] for row in answer._visitor_safety_instructions()] == [row['name'] for row in Bridge.safety_instructions(language)]
    instruction = env['ar.visitor.safety.instruction'].browse(next(iter(baseline)))
    instruction.with_context(lang='en_US').name = 'Custom English translation'
    assert instruction._localized_text('en') == 'Custom English translation'
    print('SAFETY TRANSLATIONS OK: all configured text, four languages, kiosk, remote quiz, original description, phone number, custom translations')
finally:
    env.cr.rollback()
