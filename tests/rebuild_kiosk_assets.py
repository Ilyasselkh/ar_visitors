"""Rebuild the visitor UI's compiled JS and CSS together, and verify served content."""
names = ['web.assets_web', 'web.assets_backend', 'web.assets_frontend', 'ar_visitors.public_reception', 'survey.survey_assets']
try:
    cached = env['ir.attachment'].sudo().search([('url', '=like', '/web/assets/%'), ('mimetype', 'in', ['text/css', 'text/javascript', 'application/javascript'])])
    affected = cached.filtered(lambda item: any(name + '.' in (item.url or '') for name in names))
    affected.unlink()
    env.registry.clear_cache()
    for name in names:
        bundle = env['ir.qweb']._get_asset_bundle(name, css=True, js=True)
        css = bundle.css()
        assert not bundle.css_errors, (name, bundle.css_errors)
        js = bundle.js()
        if name == 'survey.survey_assets':
            assert b'ar_survey_safety' in b'\n'.join(item.raw for item in css), name
        if name in ['web.assets_web', 'web.assets_backend']:
            code = b'\n'.join(item.raw for item in js)
            styles = b'\n'.join(item.raw for item in css)
            assert b'ar_safety_header' in code and b'ar_safety_instruction' in code, name
            assert b'ar_safety_gallery' in code and b'ar_safety_image_viewer' in code, name
            assert b'state.camera || state.safetyOpen' not in code, name
            assert b'ar_safety_header' in styles and b'ar_safety_instruction' in styles, name
            assert b'ar_safety_gallery' in styles and b'ar_safety_image_viewer' in styles, name
        print('JS + CSS verified:', name)
    env.cr.commit()
except Exception:
    env.cr.rollback()
    raise
