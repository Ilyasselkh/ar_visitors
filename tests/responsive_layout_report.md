# Responsive verification — 2026-11-03

The shared responsive layer now covers reception, HSE slides, consent, recognized
identity, camera layout, public identity forms, kiosk visit/signature, Survey
questions/corrections/safety, completion, and scoped administration views.
Administrative form/list/kanban definitions carry `ar_visitor_admin`; native Odoo
list scrolling and form behavior remain in place.

Current check: **187 component layout cases passed**, no page JavaScript errors,
in headless Edge. Viewports: 320×568, 360×640, 390×844, 600×960, 768×1024,
1024×600, 1280×720, 1366×768, 1920×1080, 844×390, 667×375. Each size covers
the actual current OWL reception component in French and Arabic, with home,
HSE, camera, consent, identity, and safety states, plus five public/kiosk/Survey
fixtures. Checks detect document/reception horizontal overflow. The phone home
screen was also inspected visually. Existing exported Odoo CSS provides the
baseline; current module SCSS is compiled over it. Font assets and live ORM,
camera streams, email links and authenticated administration are not exercised
by these fixtures. All module SCSS compiled and all view XML parsed.

23 targeted JavaScript tests pass, including pointer alignment after signature
canvas resizing. No service restart, module upgrade or production deployment
was performed. An authenticated Odoo check is still required after deployment,
especially for administration forms, embedded lists and real camera capture.

Reproduce after exporting the fixtures using `responsive_preview.py` in an Odoo
shell: run `python tests/compile_responsive_preview.py` with libsass available,
then `node tests/responsive_browser.cjs` with Playwright available.

## Earlier verification — 2026-10-11

Rendered representative components with fictitious content and the actual compiled Odoo frontend, backend and Survey styles. Browser viewport checks measured content overflow and button visibility; this is a component layout check, not a full camera or authenticated end-to-end session.

| Viewport | Safety guide | Signature form | Illustrated question | Correction |
| --- | --- | --- | --- | --- |
| 1920 × 1080 | Pass | Pass | Pass | Pass |
| 1366 × 768 | Pass | Pass | Pass | Pass |
| 1280 × 720 | Pass | Pass | Pass | Pass |
| 1024 × 600 | Pass | Pass | Pass | Pass |
| 1024 × 768 | Pass | Pass | Pass | Pass |
| 768 × 1024 | Pass | Pass | Pass | Pass |
| 390 × 844 | Pass | Pass | Pass | Pass |
| 360 × 640 | Pass | Pass | Pass | Pass |
| 844 × 390 | Pass | Pass | Pass | Pass |

Pass: no overflow in the tested guide panels, question viewport or correction dialog; signature action buttons fit in the iframe viewport. Survey instruction introduction has no horizontal overflow on these formats, with two columns on wide screens and a vertical layout on phones. Its complete list remains vertically scrollable.

Corrections: compact safety navigation on phones and short screens; shorter form spacing and responsive signature height; two correction images remain side by side on narrow screens; illustrated questions reserve less space for chrome in landscape. Larger screens retain the larger images and signature area.

34 JavaScript behavior tests passed. Five Odoo asset bundles compiled without style errors. The module was updated to 19.0.1.26.0 and the stopped local Odoo server was restarted.

Arbitrary configured text lengths, unusually many images, browser zoom, software keyboards and other browsers can require additional checks; no claim is made to have tested every possible resolution or content combination.
