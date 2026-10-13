"""Verify cascade deletion and authorization; sample data are rolled back."""
import uuid
from odoo import fields
from odoo.exceptions import AccessError

try:
    suffix = uuid.uuid4().hex[:12]
    person = env['ar.visitor.person'].sudo().create({
        'first_name': 'Deletion', 'last_name': 'Test', 'cin': 'DEL' + suffix,
    })
    other = env['ar.visitor.person'].sudo().create({
        'first_name': 'Keep', 'last_name': 'Test', 'cin': 'KEEP' + suffix,
    })
    visits = env['ar.visitor.visit'].sudo().create([
        {'person_id': person.id, 'state': 'draft'},
        {'person_id': person.id, 'state': 'checked_out', 'active': False},
    ])
    kept_visit = env['ar.visitor.visit'].sudo().create({'person_id': other.id})
    invitation = env['ar.visitor.invitation'].sudo().create({
        'email': 'delete-test@example.invalid', 'planned_date': fields.Date.today(),
        'person_id': person.id, 'visit_id': visits[0].id,
    })
    user = env['res.users'].sudo().create({
        'name': 'Deletion permission test', 'login': 'deletion-' + suffix,
        'group_ids': [(6, 0, [env.ref('base.group_user').id,
                              env.ref('ar_visitors.group_ar_visitors_user').id])],
    })
    try:
        person.with_user(user).unlink()
        raise AssertionError('An unauthorized user deleted a person')
    except AccessError:
        pass
    assert visits.exists() == visits
    person.unlink()
    assert not person.exists()
    assert not visits.exists(), 'Archived and active visits must both be removed'
    invitation.invalidate_recordset(['person_id', 'visit_id'])
    assert not invitation.person_id and not invitation.visit_id
    assert other.exists() and kept_visit.exists()
    print('PERSON DELETION OK: active and archived visits removed, other persons preserved, permissions enforced')
finally:
    env.cr.rollback()
