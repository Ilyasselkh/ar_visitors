{
    "name": "AR - Visitors",
    "version": "19.0.1.10.0",
    "summary": "Gestion sécurisée des visiteurs et intégration faciale",
    "description": """
AR - Visitors
===============
Gestion des visiteurs avec contrôle de CIN, validité du parcours de sécurité,
quiz multilingues Odoo Survey, signature et notification de l'hôte.
Le module expose également une API sécurisée pour un système facial externe.
    """,
    "author": "AR IT Department",
    "category": "Operations/Visitors",
    "license": "LGPL-3",
    "depends": ["base", "mail", "hr", "survey", "web", "sttl_face_attendance"],
    "data": [
        "security/security.xml",
        "security/ir.model.access.csv",
        "data/sequence.xml",
        "data/mail_templates.xml",
        "data/cron.xml",
        "views/visitor_person_views.xml",
        "views/visitor_visit_views.xml",
        "views/quiz_result_views.xml",
        "views/visitor_quiz_config_views.xml",
        "views/res_config_settings_views.xml",
        "wizard/visitor_checkout_wizard_views.xml",
        "wizard/visitor_identify_wizard_views.xml",
        "views/kiosk_templates.xml",
        "views/survey_templates.xml",
        "views/menus.xml",
    ],
    "assets": {
        "web.assets_backend": ["ar_visitors/static/src/js/face_attendance_bridge.js", "ar_visitors/static/src/scss/face_attendance_bridge.scss", "ar_visitors/static/src/js/kiosk_dialog.js", "ar_visitors/static/src/js/visitor_identify.js", "ar_visitors/static/src/js/signature_pad.js", "ar_visitors/static/src/scss/visitor_form.scss"],
        "web.assets_frontend": ["ar_visitors/static/src/scss/kiosk.scss"],
    },
    "application": True,
    "installable": True,
}
