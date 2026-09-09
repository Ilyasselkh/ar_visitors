from odoo import api, SUPERUSER_ID


def migrate(cr, version):
    env = api.Environment(cr, SUPERUSER_ID, {})
    visits = env['ar.visitor.visit'].search([
        ('state', '=', 'quiz_pending'), ('survey_id', '!=', False),
        ('survey_user_input_id', '=', False),
    ])
    for visit in visits:
        visit._ensure_survey_answer()
