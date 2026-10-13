"""Exercise the real controller override without requiring an Odoo database."""
import ast
from pathlib import Path
from types import SimpleNamespace as NS
import unittest
from urllib.parse import quote


class Records(list):
    def filtered(self, predicate):
        return Records(x for x in self if (getattr(x, predicate) if isinstance(predicate, str) else predicate(x)))

    def __sub__(self, other):
        return Records(x for x in self if x not in other)

    def mapped(self, name):
        return [getattr(x, name) for x in self]

    @property
    def suggested_answer_id(self):
        return NS(ids=[x.choice for x in self if x.choice])


class Base:
    def survey_submit(self, *args, **kwargs):
        self.saved = True
        return self.response


tree = ast.parse((Path(__file__).parents[1] / 'controllers/survey.py').read_text(encoding='utf8'))
cls = next(x for x in tree.body if isinstance(x, ast.ClassDef))
ns = {'Survey': Base, 'http': NS(route=lambda: lambda fn: fn), 'quote': quote,
      'fields': NS(Datetime=NS(now=lambda: 0)), 'html2plaintext': lambda x: x}
exec(compile(ast.Module(body=[cls], type_ignores=[]), '<survey feedback>', 'exec'), ns)


class FeedbackTests(unittest.TestCase):
    def run_case(self, choices, expected=(1, 2), kind='multiple_choice', error=None, linked=True, images=(), **post):
        q = NS(id=7, title='Safety', question_type=kind, is_scored_question=True,
               suggested_answer_ids=Records([NS(id=i, value=f'Answer {i}', value_image=i in images) for i in expected]),
               _get_correct_answers=lambda: {7: list(expected)})
        lines = Records(NS(question_id=q, choice=i, skipped=not i, answer_is_correct=i in expected) for i in choices)
        answer = NS(id=9, is_session_answer=False, user_input_line_ids=lines,
                    _get_inactive_conditional_questions=lambda: Records())
        survey = NS(id=2, _get_survey_questions=lambda **kwargs: (Records([q]), 7))
        visits = NS(sudo=lambda: visits, search=lambda *args, **kwargs: NS(language='fr') if linked else False)
        ns['request'] = NS(env={'ar.visitor.visit': visits})
        controller = ns['VisitorSurvey']()
        controller._invitation = lambda answer: False
        controller.response = ({7: list(expected)}, {'error': error} if error else {'html': 'next'})
        controller._fetch_from_access_token = lambda *args: (survey, answer)
        result = controller.survey_submit('survey-token', 'answer-token', question_id=7, **post)
        self.assertTrue(controller.saved)
        self.assertEqual([x.choice for x in lines], choices)  # original score inputs untouched
        return result

    def test_correct_multiple_choice_skips_correction(self):
        self.assertEqual(self.run_case([1, 2])[1]['visitor_feedback'], [])

    def test_missing_extra_and_skipped_choices_show_all_correct_answers(self):
        for selected in ([1], [1, 2, 3], [0]):
            with self.subTest(selected=selected):
                feedback = self.run_case(selected)[1]['visitor_feedback']
                self.assertEqual(feedback, [{'question': 'Safety', 'answers': ['Answer 1', 'Answer 2']}])

    def test_simple_choice_accepts_a_correct_alternative(self):
        self.assertEqual(self.run_case([2], kind='simple_choice')[1]['visitor_feedback'], [])

    def test_unlinked_surveys_and_validation_errors_are_unchanged(self):
        self.assertNotIn('visitor_feedback', self.run_case([3], linked=False)[1])
        self.assertEqual(self.run_case([3], error='validation')[1], {'error': 'validation'})

    def test_back_navigation_does_not_reveal_correction(self):
        self.assertEqual(self.run_case([3], previous_page_id=5), ({}, {'html': 'next'}))

    def test_images_use_the_protected_survey_route_and_match_answer_order(self):
        feedback = self.run_case([3], images=(2,))[1]['visitor_feedback'][0]
        self.assertEqual(feedback['answer_images'], {'1': '/survey/get_question_image/survey-token/answer-token/7/2'})
        self.assertEqual(feedback['answers'], ['Answer 1', 'Answer 2'])


if __name__ == '__main__':
    unittest.main()
