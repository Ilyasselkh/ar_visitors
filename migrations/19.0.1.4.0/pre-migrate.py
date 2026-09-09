def migrate(cr, version):
    cr.execute("""
        UPDATE ar_visitor_visit
           SET state = CASE WHEN survey_id IS NOT NULL THEN 'quiz_pending' ELSE 'identity_check' END
         WHERE state = 'document_pending'
    """)
