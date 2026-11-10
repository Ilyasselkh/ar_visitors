"""Run through Odoo shell; rolls back all sample images and users."""
import base64
import io
import uuid
from PIL import Image
from odoo.exceptions import AccessError, ValidationError

try:
    instruction = env['ar.visitor.safety.instruction'].create({'name': 'Safety image test', 'emoji': '⚠️'})
    buffer = io.BytesIO()
    Image.new('RGB', (64, 40), 'blue').save(buffer, 'PNG')
    encoded = base64.b64encode(buffer.getvalue())
    ImageModel = env['ar.visitor.safety.image']
    for language, sequence, name, active in [
        ('fr', 20, 'FR second', True), ('fr', 10, 'FR first', True),
        ('en', 10, 'EN only', True), ('es', 10, 'ES only', True),
        ('ar', 10, 'AR only', True), ('fr', 0, 'FR archived', False),
    ]:
        ImageModel.create({'instruction_id': instruction.id, 'name': name, 'language': language,
                           'sequence': sequence, 'active': active, 'image': encoded})
    operator = env['res.users'].create({'name': 'Safety image test operator', 'login': 'safety-test-' + uuid.uuid4().hex,
                                       'group_ids': [(6, 0, [env.ref('ar_visitors.group_ar_visitors_user').id])]})
    bridge = env['ar.visitor.face.bridge'].with_user(operator)
    expected = {'fr': ['FR first', 'FR second'], 'en': ['EN only'], 'es': ['ES only'], 'ar': ['AR only']}
    for language, names in expected.items():
        row = next(row for row in bridge.safety_instructions(language) if row['id'] == instruction.id)
        assert row['name'] == 'Safety image test'
        assert [image['name'] for image in row['images']] == names
        assert all(image['url'].startswith('/web/image/ar.visitor.safety.image/') for image in row['images'])
        ids = [image['id'] for image in row['images']]
        assert all(record.image for record in ImageModel.with_user(operator).browse(ids))
    try:
        bridge.safety_instructions('invalid')
        raise AssertionError('Invalid language was accepted')
    except ValidationError:
        pass
    try:
        ImageModel.with_user(operator).check_access('write')
        raise AssertionError('Reception operator can modify images')
    except AccessError:
        pass
    instruction.image_ids.filtered(lambda record: record.language == 'en').write({'active': False})
    row = next(row for row in bridge.safety_instructions('en') if row['id'] == instruction.id)
    assert row['images'] == []
    assert not any('FR' in image['name'] for image in row['images'])
    print('SAFETY IMAGES OK: four languages, multiple images, order, archive, read permissions, no fallback')
finally:
    env.cr.rollback()
