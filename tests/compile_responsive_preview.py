"""Compile current visitor styles over the Odoo preview fixtures.

First export base styles/HTML using responsive_preview.py in an Odoo shell.
Run this file with the Odoo Python environment (libsass), then run
responsive_browser.cjs with PLAYWRIGHT_MODULE set if needed.
"""
from pathlib import Path

import sass


root = Path(__file__).resolve().parents[1]
output = root / 'tests/responsive_preview'
output.mkdir(exist_ok=True)
styles = root / 'static/src/scss'
compiled = []
for source in sorted(styles.glob('*.scss')):
    if source.name == 'responsive.scss':
        continue
    # Protect native CSS math functions from libsass evaluation.
    content = source.read_text(encoding='utf8').replace('min(', 'Min(').replace('max(', 'Max(')
    compiled.append(sass.compile(string=content))
(output / 'current.css').write_text('\n'.join(compiled), encoding='utf8')
(output / 'responsive.css').write_text(
    sass.compile(filename=str(styles / 'responsive.scss')), encoding='utf8')
print('Current visitor styles compiled:', output)
