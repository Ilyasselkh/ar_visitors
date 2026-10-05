"""Exercise the real localization methods with source XML, without a database."""
import ast
import copy
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("visitor_i18n", ROOT / "visitor_i18n.py")
i18n = importlib.util.module_from_spec(spec)
spec.loader.exec_module(i18n)


def load_class(path, class_name, namespace):
    tree = ast.parse((ROOT / path).read_text(encoding="utf-8"))
    cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == class_name)
    exec(compile(ast.Module(body=[cls], type_ignores=[]), path, "exec"), namespace)
    return namespace[class_name]


class SourceModel:
    def __init__(self, arch, language):
        self.arch = arch
        self.env = SimpleNamespace(context={"lang": language})

    def with_context(self, **values):
        other = copy.copy(self)
        other.env = SimpleNamespace(context=dict(self.env.context, **values))
        return other

    def get_view(self, *args, **kwargs):
        assert self.env.context["lang"] == "en_US"
        return {"arch": self.arch, "models": {"test": {"cin"}}}

    def fields_get(self, *args):
        return {"cin": {"string": "CIN / passeport"},
                "language": {"string": "Language", "selection": [("ar", "العربية"), ("en", "English")]},
                "state": {"string": "State", "selection": [("checked_in", "Visiteur entré")]}}


Localization = load_class("models/visitor_localization.py", "VisitorLocalization", {
    "models": SimpleNamespace(AbstractModel=SourceModel),
    "api": SimpleNamespace(model=lambda fn: fn), "etree": etree,
    "visitor_language": i18n.visitor_language, "visitor_text": i18n.visitor_text,
})


class VisitorLocalizationTests(unittest.TestCase):
    def form(self, path):
        return etree.tostring(etree.parse(str(ROOT / path)).find(".//form"), encoding="unicode")

    def test_identification_is_fully_translated_in_all_four_languages(self):
        source = self.form("wizard/visitor_identify_wizard_views.xml")
        for language, code in i18n.LANG_CODES.items():
            with self.subTest(language=language):
                result = Localization(source, code).get_view()
                root = etree.fromstring(result["arch"])
                self.assertEqual(root.get("dir"), "rtl" if language == "ar" else "ltr")
                for original in etree.fromstring(source).iter():
                    if original.text and original.text.strip() in i18n.MESSAGES:
                        self.assertIn(i18n.visitor_text(original.text.strip(), language), result["arch"])
                self.assertEqual(root.find(".//field[@name='cin']").get("placeholder"),
                                 i18n.visitor_text("Saisissez la CIN / passeport du visiteur", language))
                self.assertEqual(root.find(".//button[@name='action_continue']").get("string"),
                                 i18n.visitor_text("Continuer", language))
                # Modifiers and object actions must survive localization unchanged.
                self.assertEqual(root.find(".//button[@name='action_continue']").get("invisible"), "step != 'cin'")

    def test_already_english_footer_follows_visitor_language(self):
        source = self.form("wizard/visitor_identify_wizard_views.xml")
        source = source.replace('string="Continuer"', 'string="Continue"').replace('string="Annuler"', 'string="Cancel"')
        for language, code in i18n.LANG_CODES.items():
            with self.subTest(language=language):
                root = etree.fromstring(Localization(source, code).get_view()["arch"])
                self.assertEqual(root.find(".//button[@name='action_continue']").get("string"),
                                 i18n.visitor_text("Continuer", language))
                self.assertEqual(root.find(".//button[@special='cancel']").get("string"),
                                 i18n.visitor_text("Annuler", language))

    def test_exit_and_visit_form_text_has_complete_translation_coverage(self):
        for path in ("wizard/visitor_checkout_wizard_views.xml", "views/visitor_visit_views.xml"):
            source = self.form(path)
            for node in etree.fromstring(source).iter():
                terms = [node.get("string"), node.text.strip() if node.text else None]
                for term in filter(None, terms):
                    self.assertIn(term, i18n.MESSAGES, (path, term))
            for language, code in i18n.LANG_CODES.items():
                root = etree.fromstring(Localization(source, code).get_view()["arch"])
                self.assertEqual(root.get("lang"), language)

    def test_language_switch_does_not_mutate_source_or_leak_arabic(self):
        source = self.form("wizard/visitor_identify_wizard_views.xml")
        model = Localization(source, "ar_001")
        model.get_view()
        french = model.with_context(lang="fr_FR").get_view()["arch"]
        self.assertIn("Accueillir un visiteur", french)
        self.assertNotIn("استقبال زائر", french)
        self.assertEqual(model.arch, source)

    def test_field_labels_and_statuses_follow_language_without_changing_values(self):
        for language, code in i18n.LANG_CODES.items():
            fields = Localization("<form/>", code).fields_get()
            self.assertEqual(fields["cin"]["string"], i18n.visitor_text("CIN / passeport", language))
            self.assertEqual(fields["language"]["string"], i18n.visitor_text("Langue", language))
            self.assertEqual(fields["state"]["selection"], [("checked_in", i18n.visitor_text("Visiteur entré", language))])
            self.assertEqual(fields["language"]["selection"], [("ar", "العربية"), ("en", "English")])

    def test_server_messages_have_all_translations(self):
        for path in ("models/visitor_visit.py", "models/face_attendance_bridge.py",
                     "wizard/visitor_identify_wizard.py", "wizard/visitor_checkout_wizard.py"):
            for node in ast.walk(ast.parse((ROOT / path).read_text(encoding="utf-8"))):
                if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "_visitor_text":
                    term = node.args[0].value
                    self.assertIn(term, i18n.MESSAGES)
                    self.assertTrue(all(i18n.MESSAGES[term]))
                    for translation in i18n.MESSAGES[term]:
                        self.assertEqual(translation.count("%s"), term.count("%s"))

    def test_checkout_language_follows_current_choice_not_old_visit(self):
        tree = ast.parse((ROOT / "models/face_attendance_bridge.py").read_text(encoding="utf-8"))
        method = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "checkout_for_person")
        method.decorator_list = []
        scope = {"ValidationError": ValueError}
        exec(compile(ast.Module(body=[method], type_ignores=[]), "checkout", "exec"), scope)
        for selected, code in i18n.LANG_CODES.items():
            created = []
            visit = SimpleNamespace(id=12, language="fr")
            person = SimpleNamespace(sudo=lambda: person, with_context=lambda **kw: person,
                                     search=lambda *a, **kw: SimpleNamespace(id=7))
            wizard = SimpleNamespace(create=lambda values: created.append(values) or SimpleNamespace(id=8, _name="ar.visitor.checkout.wizard"))
            class Env(dict):
                context = {"lang": code}
            env = Env({"ar.visitor.person": person, "ar.visitor.visit": SimpleNamespace(
                check_access=lambda *a: None, search=lambda *a, **kw: visit), "ar.visitor.checkout.wizard": wizard})
            bridge = SimpleNamespace(env=env, _check_operator=lambda: None, _people_domain=lambda: [])
            result = scope["checkout_for_person"](bridge, 7, selected)
            self.assertEqual(created[0]["language"], selected)
            self.assertEqual(result["context"]["lang"], code)
            self.assertEqual(visit.language, "fr")

    def test_resumed_quiz_uses_new_language_but_same_language_keeps_answers(self):
        tree = ast.parse((ROOT / "wizard/visitor_identify_wizard.py").read_text(encoding="utf-8"))
        method = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "action_identify")
        scope = {"LANG_CODES": i18n.LANG_CODES, "ValidationError": ValueError}
        exec(compile(ast.Module(body=[method], type_ignores=[]), "identify", "exec"), scope)
        for selected in i18n.LANG_CODES:
            class Visit:
                id = 12
                state = "quiz_pending"
                language = "fr"
                survey_user_input_id = 42
                restarted = False

                def write(self, values):
                    self.__dict__.update(values)

                def action_select_language(self):
                    self.restarted = True
                    self.state = "quiz_pending"
                    self.survey_user_input_id = 43

            visit = Visit()
            person = SimpleNamespace(sudo=lambda: person, with_context=lambda **kw: person, normalize_cin=lambda v: v)
            class Env(dict):
                context = {"lang": "fr_FR", "visitor_language_selected": True}
                company = SimpleNamespace(id=1)
                cr = SimpleNamespace(execute=lambda *args: None)
            env = Env({"ar.visitor.person": person, "ar.visitor.visit": SimpleNamespace(
                check_access=lambda *a: None, search=lambda *a, **kw: visit)})
            def with_context(**kwargs):
                env.context = dict(env.context, **kwargs)
                return wizard
            wizard = SimpleNamespace(env=env, ensure_one=lambda: None, with_context=with_context,
                                     language=selected, cin="AB1234", captured_photo=False)
            result = scope["action_identify"](wizard)
            self.assertEqual(visit.language, selected)
            self.assertEqual(visit.restarted, selected != "fr")
            self.assertEqual(visit.survey_user_input_id, 42 if selected == "fr" else 43)
            self.assertEqual(result["params"]["form_action"]["context"]["lang"], i18n.LANG_CODES[selected])


if __name__ == "__main__":
    unittest.main()
