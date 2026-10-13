const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('illustrated kiosk questions fit three answers on one row and shrink images to available height', () => {
    let loaded, fit, imageHeight;
    const choices = {children: [{}, {}, {}], style: {}};
    const background = {scrollHeight: 820, clientHeight: 600, scrollTop: 180};
    const quizDocument = {
        body: {classList: {add() {}}, style: {setProperty: (_, value) => imageHeight = value}},
        scrollingElement: {scrollTop: 180}, addEventListener() {},
        querySelector: selector => selector === '.o_survey_page_per_question'
            ? {querySelector: () => choices} : background,
    };
    const quizWindow = {innerWidth: 1000, innerHeight: 600,
        cancelAnimationFrame() {}, requestAnimationFrame: fn => { fn(); },
        MutationObserver: class {constructor(fn) { fit = fn; } observe() {}}, addEventListener() {},
    };
    const frame = {contentDocument: quizDocument, contentWindow: quizWindow,
        addEventListener: (_, fn) => loaded = fn, getAttribute: () => 'loaded'};
    const button = {addEventListener() {}, click() {}};
    let openings = 0;
    const dialog = {querySelector: () => frame, addEventListener() {}, showModal() { openings++; }};
    const context = vm.createContext({document: {getElementById: id => id === 'ar-quiz-dialog' ? dialog : button},
        window: {addEventListener() {}}, clearInterval() {}, setInterval() {}});
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/src/js/kiosk_quiz.js'), 'utf8'), context);
    assert.equal(openings, 0, 'The empty quiz must not be shown before load');
    loaded();
    assert.equal(openings, 1, 'The quiz is shown once the iframe is loaded');
    assert.equal(choices.style.gridTemplateColumns, 'repeat(3, minmax(0, 1fr))');
    assert.equal(imageHeight, '132px');
    assert.equal(background.scrollTop, 0);
    assert.equal(quizDocument.scrollingElement.scrollTop, 0);
    quizWindow.innerWidth = 500;
    fit();
    assert.equal(choices.style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
    assert.equal(imageHeight, '62px');
});

function harness() {
    const messages = [], screens = [], dialogs = [];
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.events = {}; }
        append(...nodes) { this.children.push(...nodes); }
        setAttribute() {}
        addEventListener(event, fn) { this.events[event] = fn; }
        showModal() { dialogs.push(this); }
        close() {}
        remove() { this.removed = true; }
        focus() {}
    }
    class SurveyForm {
        onChoiceImageClick(ev) { ev.preventDefault(); this.imageZoomOpened = true; }
        async submitForm() {
            this.submitting = true;
            try { return await this.nextScreen(Promise.resolve(this.response), {}); }
            finally { this.submitting = false; }
        }
        async nextScreen(promise) { screens.push(await promise); }
    }
    const context = vm.createContext({ SurveyForm, document: { createElement: tag => new Element(tag), body: new Element('body') },
        window: { parent: {postMessage: msg => messages.push(msg)}, location: {origin: 'https://example.test'} },
        patch(target, extension) {
            const previous = Object.create(Object.getPrototypeOf(target), Object.getOwnPropertyDescriptors(target));
            Object.setPrototypeOf(extension, previous);
            Object.defineProperties(target, Object.getOwnPropertyDescriptors(extension));
        },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/src/js/survey_feedback.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace('export function', 'function'), context);
    const form = new SurveyForm();
    form.options = {questionsLayout: 'page_per_question'};
    form.listenOnKeydown = true;
    return {form, messages, screens, dialogs};
}

test('visitor quiz image clicks keep native answer selection and do not open zoom', () => {
    const {form} = harness();
    let prevented = false;
    form.onChoiceImageClick({currentTarget: {closest: () => ({})},
        preventDefault() { prevented = true; }});
    assert.equal(prevented, false);
    assert.equal(form.imageZoomOpened, undefined);
});

test('ordinary survey image clicks retain the Odoo zoom behavior', () => {
    const {form} = harness();
    let prevented = false;
    form.onChoiceImageClick({currentTarget: {closest: () => null},
        preventDefault() { prevented = true; }});
    assert.equal(prevented, true);
    assert.equal(form.imageZoomOpened, true);
});

test('wrong last answer waits for acknowledgement before rendering completion and resuming polling', async () => {
    const h = harness();
    h.form.response = [{}, {visitor_feedback: [{question: '<script>unsafe</script>', answers: ['Wear PPE']}], visitor_feedback_language: 'fr', html: 'done'}];
    const pending = h.form.submitForm();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(h.screens.length, 0);
    assert.equal(h.form.listenOnKeydown, false);
    assert.deepEqual(h.messages, ['ar-visitors-quiz-submitting']);
    assert.equal(h.dialogs[0].children[1].children[0].textContent, '<script>unsafe</script>');
    h.dialogs[0].children.at(-1).events.click();
    await pending;
    assert.equal(h.screens.length, 1);
    assert.equal(h.form.listenOnKeydown, true);
    assert.deepEqual(h.messages, ['ar-visitors-quiz-submitting', 'ar-visitors-quiz-ready']);
});

test('correct answers and ordinary surveys advance without a correction dialog', async () => {
    for (const page of [{visitor_feedback: []}, {html: 'ordinary'}]) {
        const h = harness(); h.form.response = [{}, page];
        await h.form.submitForm();
        assert.equal(h.dialogs.length, 0);
        assert.equal(h.screens.length, 1);
    }
});

test('kiosk does not close a correction when an already pending status request finishes', async () => {
    let message, poll, resolveFetch, reloads = 0;
    const frame = {contentWindow: {}, getAttribute: () => 'loaded', addEventListener() {}};
    const open = {addEventListener() {}, click() {}, focus() {}};
    const close = {addEventListener() {}};
    const dialog = {dataset: {statusUrl: '/status'}, querySelector: () => frame, addEventListener() {}};
    const context = vm.createContext({
        document: {getElementById: id => id === 'ar-quiz-dialog' ? dialog : id === 'ar-open-quiz' ? open : close},
        window: {location: {origin: 'https://example.test', reload: () => reloads++}, addEventListener: (_, fn) => message = fn},
        fetch: () => new Promise(resolve => resolveFetch = resolve),
        setInterval: fn => { poll = fn; }, clearInterval() {},
    });
    open.addEventListener = (_, fn) => { open.click = fn; };
    dialog.showModal = () => {};
    vm.runInContext(fs.readFileSync(path.join(__dirname, '../static/src/js/kiosk_quiz.js'), 'utf8'), context);
    const pending = poll();
    message({origin: 'https://example.test', source: frame.contentWindow, data: 'ar-visitors-quiz-submitting'});
    resolveFetch({ok: true, json: async () => ({state: 'host_pending'})});
    await pending;
    assert.equal(reloads, 0);
    message({origin: 'https://example.test', source: frame.contentWindow, data: 'ar-visitors-quiz-ready'});
    resolveFetch({ok: true, json: async () => ({state: 'host_pending'})});
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(reloads, 1);
});
