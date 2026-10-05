const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '../static/src/js/kiosk_dialog.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '');

function harness() {
    let cleanup;
    const timers = new Map(), calls = [];
    const context = vm.createContext({
        Component: class {}, Dialog: class {}, xml: () => '',
        registry: { category: () => ({ add() {} }) },
        useRef: () => ({ el: { contentDocument: { querySelector: () => null } } }),
        onWillUnmount: fn => { cleanup = fn; },
        setTimeout: (fn, delay) => { timers.set(1, { fn, delay }); return 1; },
        clearTimeout: id => timers.delete(id),
        window: { location: { reload: () => calls.push('reload') } },
    });
    vm.runInContext(source + '\nglobalThis.Screen = VisitorKioskDialog;', context);
    const screen = new context.Screen();
    screen.props = { close: () => calls.push('close') };
    screen.setup();
    return { screen, timers, calls, cleanup: () => cleanup() };
}

test('only the success page closes after three seconds and reloads the parent', () => {
    const { screen, timers, calls } = harness();
    screen.onJourneyLoad();
    assert.equal(timers.size, 0);
    screen.journey.el.contentDocument.querySelector = selector => {
        assert.equal(selector, '[data-visitor-registration-complete="true"]');
        return {};
    };
    screen.onJourneyLoad();
    assert.deepEqual(calls, []);
    assert.equal(timers.get(1).delay, 3000);
    timers.get(1).fn();
    assert.deepEqual(calls, ['close', 'reload']);
});

test('navigation away or closing the dialog cancels the pending reload', () => {
    const { screen, timers, cleanup } = harness();
    screen.journey.el.contentDocument.querySelector = () => ({});
    screen.onJourneyLoad();
    cleanup();
    assert.equal(timers.size, 0);
    screen.onJourneyLoad();
    screen.journey.el.contentDocument = null;
    screen.onJourneyLoad();
    assert.equal(timers.size, 0);
});
