const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const registrations = { fields: {}, views: {} };
const context = {
    Component: class {}, ListRenderer: class {}, KanbanRenderer: class {},
    standardFieldProps: {}, listView: {}, kanbanView: {}, _t: text => text,
    registry: { category: name => ({ add: (key, value) => registrations[name][key] = value }) },
};
const code = fs.readFileSync(path.join(__dirname, '../static/src/js/invitation_badges.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function');
vm.runInNewContext(code + '\nglobalThis.kind = invitationKind;', context);

test('email, shared link and individual registration are classified from existing records', () => {
    for (const [record, expected] of [
        [{ is_shared: false, parent_id: false }, 'email'],
        [{ is_shared: true, parent_id: false }, 'shared'],
        [{ is_shared: false, parent_id: [42, 'Shared invitation'] }, 'registration'],
    ]) {
        assert.equal(context.kind(record), expected);
        const badge = new registrations.fields.ar_invitation_type.component();
        badge.props = { record: { data: record } };
        assert.equal(badge.kind, expected);
        assert.ok(badge.label);
        assert.ok(badge.icon);
    }
});

test('both invitation views use dedicated renderers with a legend', () => {
    assert.equal(registrations.views.ar_invitation_list.Renderer.template, 'ar_visitors.InvitationListRenderer');
    assert.equal(registrations.views.ar_invitation_kanban.Renderer.template, 'ar_visitors.InvitationKanbanRenderer');
});
