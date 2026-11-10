const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const context = vm.createContext({
    Component: class {}, standardFieldProps: {}, xml: () => '',
    registry: { category: () => ({ add() {} }) },
});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/src/js/signature_pad.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '') + '\nglobalThis.Pad = VisitorSignaturePad;', context);

test('pointer follows a resized signature canvas without clearing existing strokes', () => {
    const pad = new context.Pad();
    pad.canvasRatio = 2;
    pad.canvas = { el: { width: 1200, height: 400,
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 300, height: 100 }) } };
    const point = pad.point({ clientX: 160, clientY: 70 });
    assert.equal(point.x, 300);
    assert.equal(point.y, 100);
    assert.equal(pad.canvas.el.width, 1200);
    assert.equal(pad.canvas.el.height, 400);
});

test('normal canvas coordinates remain unchanged', () => {
    const pad = new context.Pad();
    pad.canvasRatio = 2;
    pad.canvas = { el: { width: 1200, height: 400,
        getBoundingClientRect: () => ({ left: 10, top: 20, width: 600, height: 200 }) } };
    const point = pad.point({ clientX: 160, clientY: 70 });
    assert.equal(point.x, 150);
    assert.equal(point.y, 50);
});
