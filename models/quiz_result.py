from markupsafe import Markup, escape
from odoo import fields, models, tools


class VisitorQuizResult(models.Model):
    _name = 'ar.visitor.quiz.result'
    _description = 'Résultat de quiz visiteur'
    _auto = False
    _rec_name = 'person_name'
    _order = 'quiz_completed_at desc'

    person_name = fields.Char(readonly=True)
    cin = fields.Char(readonly=True)
    quiz_name = fields.Char(readonly=True)
    language = fields.Selection([('fr', 'Français'), ('en', 'English'), ('es', 'Español')], readonly=True)
    quiz_completed_at = fields.Datetime(readonly=True)
    quiz_score = fields.Float(readonly=True)
    name = fields.Char(readonly=True)
    company_id = fields.Many2one('res.company', readonly=True)
    answers_html = fields.Html(string='Questions et réponses', compute='_compute_answers', sanitize=True)

    def init(self):
        tools.drop_view_if_exists(self.env.cr, self._table)
        self.env.cr.execute('''CREATE VIEW ar_visitor_quiz_result AS
            SELECT v.id, concat_ws(' ',v.first_name,v.last_name) AS person_name,
                   v.cin, COALESCE(s.title->>'fr_FR',s.title->>'en_US',s.title::text) AS quiz_name,
                   v.language,v.quiz_completed_at,v.quiz_score,v.name,v.company_id
            FROM ar_visitor_visit v JOIN survey_survey s ON s.id=v.survey_id
            WHERE v.quiz_completed AND v.survey_user_input_id IS NOT NULL''')

    def _compute_answers(self):
        self.check_access('read')
        for result in self:
            visit = self.env['ar.visitor.visit'].sudo().browse(result.id)
            rows = []
            for line in visit.survey_user_input_id.user_input_line_ids:
                values = []
                for field in ('matrix_row_id', 'suggested_answer_id'):
                    if field in line._fields and line[field]:
                        values.append(line[field].value)
                if line.skipped:
                    values = ['Sans réponse']
                elif not values:
                    field = 'value_' + (line.answer_type or '')
                    if field in line._fields:
                        values = [str(line[field]) if line[field] is not False else '']
                rows.append(Markup('<tr><td>{}</td><td>{}</td><td>{}</td></tr>').format(
                    escape(line.question_id.title), escape(' / '.join(values)), escape(str(line.answer_score))))
            result.answers_html = Markup('<table class="table table-bordered"><thead><tr><th>Question</th><th>Réponse du visiteur</th><th>Points</th></tr></thead><tbody>{}</tbody></table>').format(Markup('').join(rows))
