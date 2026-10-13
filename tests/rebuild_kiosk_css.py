"""Regenerate compiled CSS only for bundles used by the visitor module."""
names = ['web.assets_web', 'web.assets_backend', 'web.assets_frontend', 'ar_visitors.public_reception']
try:
    cached = env['ir.attachment'].sudo().search([('url', '=like', '/web/assets/%'), ('mimetype', '=', 'text/css')])
    affected = cached.filtered(lambda item: any(name + '.' in (item.url or '') for name in names))
    print('CSS cache removed:', len(affected))
    affected.unlink()
    env.registry.clear_cache()
    for name in names:
        bundle = env['ir.qweb']._get_asset_bundle(name, css=True, js=False)
        attachments = bundle.css()
        assert not bundle.css_errors, (name, bundle.css_errors)
        assert all(b'## CSS error message ##' not in attachment.raw for attachment in attachments), name
        print('CSS bundle OK:', name)
    env.cr.commit()
except Exception:
    env.cr.rollback()
    raise
