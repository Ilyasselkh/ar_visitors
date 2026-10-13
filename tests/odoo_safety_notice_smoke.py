"""Render the actual notice fragments in both journeys and four languages; no writes."""
from copy import deepcopy
from pathlib import Path
from types import SimpleNamespace
from lxml import etree
from odoo.addons.ar_visitors.prereg_labels import labels

root = Path(__file__).parents[1] if '__file__' in globals() else Path('C:/Odoo/odoo/odoo/addons/ar_visitors')
for filename, key, record_key in [('kiosk_templates.xml', 'safety_labels', 'visit'),
                                  ('preregistration_templates.xml', 'labels', 'invitation')]:
    tree = etree.parse(str(root / 'views' / filename))
    notice = tree.xpath("//div[@class='ar-safety-notice']")[0]
    heading = tree.xpath("//*[@t-out=\"%s['safety']\"]" % key)[0]
    for language in ['fr', 'en', 'es', 'ar']:
        words = labels(language)
        for answer in ['no', 'yes', False]:
            template = etree.Element('t')
            template.append(deepcopy(heading))
            template.append(deepcopy(notice))
            rendered = str(env['ir.qweb']._render(template, {
                key: words, record_key: SimpleNamespace(safety_understanding=answer),
            }, minimal_qcontext=True))
            text = ''.join(etree.HTML(rendered).itertext())
            assert words['safety'] in text
            assert (words['safety_help'] in text) == (answer == 'no')
            assert (words['safety_continue'] in text) == (answer == 'no' and record_key == 'visit')
print('SAFETY NOTICE OK: both actual QWeb fragments, four languages, No/Validate visibility')
