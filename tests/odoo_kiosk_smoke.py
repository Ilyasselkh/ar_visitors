"""Run with Odoo shell; all sample data are rolled back, no email is sent."""
import base64
import io
import uuid
from PIL import Image
from odoo import fields
from odoo.exceptions import UserError, ValidationError

try:
    env.user.group_ids = [(4, env.ref('ar_visitors.group_ar_visitors_admin').id)]
    Bridge = env['ar.visitor.face.bridge']
    Visit = env['ar.visitor.visit']
    instructions = Bridge.safety_instructions()
    assert len(instructions) >= 13
    assert any('HSE' in row['name'] for row in instructions)
    output = io.BytesIO()
    Image.new('RGB', (20, 20), 'white').save(output, format='PNG')
    photo = base64.b64encode(output.getvalue()).decode()
    before = Visit.search_count([])
    try:
        Bridge.start_visit(photo, False, 'fr', 'profile', False)
        raise AssertionError('Creation without consent must be refused')
    except ValidationError:
        pass
    assert Visit.search_count([]) == before
    action = Bridge.start_visit(photo, False, 'fr', 'profile', True)
    token = action['params']['url'].rsplit('/', 1)[1]
    profile = Visit.search([('kiosk_token', '=', token)], limit=1)
    assert profile.kiosk_purpose == 'profile' and not profile.check_in_at
    profile.write({'first_name': 'Test', 'last_name': 'Borne', 'cin': 'KIOSK' + uuid.uuid4().hex[:15]})
    profile.action_confirm_identity()
    assert profile.state == 'quiz_pending'
    assert profile.person_id.consent
    profile.survey_user_input_id.write({'state': 'done', 'end_datetime': fields.Datetime.now()})
    profile.action_check_quiz()
    assert profile.profile_completed and profile.state == 'profile_done'
    assert not profile.profile_already_exists
    assert not profile.check_in_at
    assert profile.person_id.recent_visit
    assert profile.survey_user_input_id._visitor_return_url().endswith(token)
    before = Visit.search_count([])
    action = Bridge.start_visit(photo, profile.person_id.id, 'fr', 'profile')
    assert action['params']['delay'] == 1000
    assert action['params']['message'] == 'Votre fiche existe déjà'
    assert Visit.search_count([]) == before
    duplicate_profile = Visit.create({'kiosk_purpose': 'profile', 'kiosk_consent': True, 'state': 'identity_input',
                                      'cin': profile.cin, 'first_name': 'Test', 'last_name': 'Borne', 'language': 'fr'})
    duplicate_profile.action_confirm_identity()
    assert duplicate_profile.profile_completed and duplicate_profile.state == 'profile_done'
    assert duplicate_profile.profile_already_exists
    assert not duplicate_profile.check_in_at
    try:
        duplicate_profile.action_check_in()
        raise AssertionError('Profile-only session must never check in')
    except UserError:
        pass
    action = Bridge.start_visit(photo, profile.person_id.id, 'fr', 'arrival')
    arrival = Visit.search([('kiosk_token', '=', action['params']['url'].rsplit('/', 1)[1])], limit=1)
    assert arrival.kiosk_purpose == 'arrival' and arrival.state == 'host_pending'
    assert not arrival.check_in_at
    host = env['hr.employee'].create({'name': 'Kiosk Test Host', 'work_email': 'kiosk@example.invalid', 'company_id': env.company.id})
    arrival.write({'host_employee_id': host.id, 'entry_signature': photo})
    arrival.with_context(visitor_defer_notification=True).action_check_in()
    assert arrival.state == 'checked_in' 
    assert Bridge.recognition_person(profile.person_id.id)['has_open_visit']
    try:
        Bridge.start_visit(photo, profile.person_id.id, 'fr', 'arrival')
        raise AssertionError('Duplicate arrival must be refused')
    except ValidationError:
        pass
    checkout_action = Bridge.checkout_for_person(profile.person_id.id, 'fr')
    checkout = env['ar.visitor.checkout.wizard'].browse(checkout_action['res_id'])
    assert checkout.visit_id == arrival
    try:
        checkout.action_confirm()
        raise AssertionError('Unsigned checkout must be refused')
    except UserError:
        pass
    assert arrival.state == 'checked_in'
    checkout.signature = photo
    done = checkout.action_confirm()
    assert done['tag'] == 'ar_visitors.kiosk_done'
    assert done['params']['message'] == 'Merci pour votre visite'
    assert arrival.state == 'checked_out' and arrival.check_out_at and arrival.signature
    try:
        Bridge.checkout_for_person(profile.person_id.id, 'fr')
        raise AssertionError('Second checkout must be refused')
    except ValidationError:
        pass
    profile.write({'quiz_completed_at': fields.Datetime.from_string('2020-01-01 00:00:00')})
    assert not profile.person_id.recent_visit
    action = Bridge.start_visit(photo, profile.person_id.id, 'fr', 'arrival')
    expired = Visit.search([('kiosk_token', '=', action['params']['url'].rsplit('/', 1)[1])], limit=1)
    assert expired.state == 'identity_check'
    expired.action_select_language()
    assert expired.state == 'quiz_pending'
    assert not expired.check_in_at
    print('KIOSK SMOKE OK: profile only, arrival host and signature, signed checkout, quiz validity')
finally:
    env.cr.rollback()
