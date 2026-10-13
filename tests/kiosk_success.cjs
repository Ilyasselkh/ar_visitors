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

for (const delay of [1000, 3000]) test(`success stays visible for ${delay}ms then reloads once`, () => {
    const { screen, timers, calls } = harness();
    screen.onJourneyLoad();
    assert.equal(timers.size, 0);
    screen.journey.el.contentDocument.querySelector = selector => selector.includes('data-visitor-registration-complete') ? {dataset: {returnDelay: String(delay)}} : null;
    screen.onJourneyLoad();
    assert.equal(timers.get(1).delay, delay);
    assert.deepEqual(calls, []);
    screen.onJourneyLoad();
    assert.equal(timers.size, 1);
    timers.get(1).fn();
    assert.deepEqual(calls, ['close', 'reload']);
});
test('closing the dialog cancels the pending return', () => {
    const { screen, timers, cleanup } = harness();
    screen.journey.el.contentDocument.querySelector = selector => selector.includes('data-visitor-registration-complete') ? {dataset: {returnDelay: '1000'}} : null;
    screen.onJourneyLoad();
    cleanup();
    assert.equal(timers.size, 0);
});

test('visit details explicitly clear the iframe root and body backgrounds', () => {
    const {screen} = harness();
    const styles = [];
    const classes = [];
    screen.journey.el.closest = () => ({classList: {toggle: (name, value) => classes.push([name, value])}});
    screen.journey.el.contentDocument = {
        documentElement: {style: {setProperty: (...args) => styles.push(['html', ...args])}},
        body: {style: {setProperty: (...args) => styles.push(['body', ...args])}},
        querySelector: selector => selector === '#ar-entry-signature' ? {} : null,
    };
    screen.onJourneyLoad();
    assert.deepEqual(styles, [
        ['html', 'background', 'transparent', 'important'],
        ['body', 'background', 'transparent', 'important'],
    ]);
    assert.ok(classes.some(([name, value]) => name === 'ar_visit_details_dialog' && value));
});

test('validation pages and unavailable frame documents never close or reload', () => {
    const { screen, timers, calls } = harness();
    screen.onJourneyLoad();
    screen.journey.el.contentDocument = null;
    screen.onJourneyLoad();
    assert.equal(timers.size, 0);
    assert.deepEqual(calls, []);
});
