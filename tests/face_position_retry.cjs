const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');

const source = fs.readFileSync(require('node:path').join(__dirname, '../static/src/js/face_attendance_bridge.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/registry.category\("actions"\).add\([^;]+;/, 'globalThis.Screen = VisitorFaceAttendance;');
function face(offset = 0) {
    return { descriptor: [0], landmarks: {
        getLeftEye: () => [{ x: 0, y: 0 }],
        getRightEye: () => [{ x: 100, y: 0 }],
        getNose: () => [null, null, null, { x: 50 + offset, y: 60 }],
        getJawOutline: () => Array.from({ length: 17 }, (_, i) => ({ x: -50 + i * 12.5, y: 60 })),
    } };
}

test('camera frame fits native proportions inside the available area on resize', () => {
    const { screen, video } = harness();
    const area = { clientWidth: 1200, clientHeight: 600 };
    screen.cameraArea = { el: area };
    screen.cameraFrame = { el: { style: {} } };
    for (const [w, h] of [[640, 480], [1920, 1080], [480, 640]]) {
        video.videoWidth = w; video.videoHeight = h;
        for (const available of [1200, 350]) {
            area.clientWidth = available;
            screen.fitCameraFrame();
            const width = parseFloat(screen.cameraFrame.el.style.width);
            const height = parseFloat(screen.cameraFrame.el.style.height);
            assert.ok(width <= available && height <= area.clientHeight);
            assert.ok(Math.abs(width / height - w / h) < 0.000001);
        }
    }
});
function harness({ live = [face()], captured = [face()], mode = 'arrival', limit = 3 } = {}) {
    const timers = new Map();
    let timerId = 0;
    const video = { videoWidth: 640, videoHeight: 480 };
    const canvas = { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,photo' };
    const api = {
        nets: Object.fromEntries(['tinyFaceDetector', 'faceLandmark68Net', 'faceRecognitionNet'].map(key => [key, { loadFromUri: async () => {} }])),
        TinyFaceDetectorOptions: class {},
        detectAllFaces(input) {
            return { then: (resolve, reject) => Promise.resolve(input === video ? live : captured).then(resolve, reject), withFaceLandmarks() {
                const result = Promise.resolve(input === video ? live : captured);
                result.withFaceDescriptors = () => result;
                return result;
            } };
        },
        bufferToImage: async () => ({}), euclideanDistance: () => 0.1,
    };
    const reloads = [];
    const clock = { now: 200000 };
    const listeners = new Map();
    const page = { createElement: () => canvas, querySelector: () => null,
        addEventListener: (name, fn) => listeners.set(name, fn),
        removeEventListener: name => listeners.delete(name) };
    const context = vm.createContext({ Component: class {}, xml: () => '', window: { faceapi: api, location: { reload: () => reloads.push(true) } }, faceapi: api,
        document: page, Date: { now: () => clock.now }, Blob, Uint8Array, atob,
        setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
        clearTimeout: id => timers.delete(id),
    });
    vm.runInContext(source, context);
    const screen = new context.Screen();
    screen.alive = true;
    screen.cameraConsentGranted = true;
    screen.video = { el: video };
    screen.state = { camera: true, attempt: 0, attemptLimit: limit, retryDelay: 1.5, mode };
    const calls = [];
    screen.orm = { async call(model, method) {
        calls.push(method);
        if (method === 'reference_photos') return { people: [{ id: 7, images: ['YQ=='] }], next_id: false };
        if (method === 'recognition_person') return { id: 7 };
    } };
    screen.openCheckout = async () => calls.push('checkout');
    return { screen, video, timers, calls, reloads, clock, page, listeners, api };
}

test('idle home reloads only after ten complete minutes without a face', async () => {
    const { screen, clock, reloads } = harness({ live: [] });
    screen.cameraConsentGranted = false;
    screen.idleSince = clock.now;
    clock.now += 599999;
    await screen.checkIdleRefresh();
    assert.equal(reloads.length, 0);
    clock.now++;
    await screen.checkIdleRefresh();
    assert.equal(reloads.length, 1);
});

test('any face resets the full idle period and no visitor lookup runs', async () => {
    const live = [face(), face()];
    const { screen, clock, reloads, calls } = harness({ live });
    screen.cameraConsentGranted = false;
    screen.idleSince = 0;
    await screen.checkIdleRefresh();
    assert.equal(screen.idleSince, clock.now);
    live.length = 0;
    clock.now += 599999;
    await screen.checkIdleRefresh();
    assert.equal(reloads.length, 0);
    assert.deepEqual(calls, []);
});

test('dialogs, recognition and unavailable presence suspend refresh', async () => {
    for (const block of [h => h.page.querySelector = () => ({}),
        h => h.screen.state.consentOpen = true, h => h.screen.state.busy = true,
        h => h.screen.state.captured = 'photo', h => h.screen.state.camera = false,
        h => h.page.hidden = true, h => h.api.detectAllFaces = () => { throw Error('camera'); }]) {
        const h = harness({ live: [] });
        h.screen.cameraConsentGranted = false;
        h.screen.idleSince = 0;
        block(h);
        await h.screen.checkIdleRefresh();
        assert.equal(h.reloads.length, 0);
        assert.equal(h.screen.idleSince, h.clock.now);
    }
});

test('interaction resets idle time and unmount removes listeners and timer', async () => {
    const { screen, clock, listeners, timers, reloads } = harness({ live: [] });
    screen.cameraConsentGranted = false;
    screen.startIdleRefresh();
    await new Promise(resolve => setImmediate(resolve));
    clock.now += 600000;
    listeners.get('pointerdown')();
    await screen.checkIdleRefresh();
    assert.equal(reloads.length, 0);
    screen.alive = false;
    screen.stopIdleRefresh();
    assert.equal(listeners.size, 0);
    // Earlier manually invoked checks can leave fake timers; the latest is cancelled.
    assert.equal(timers.has(screen.idleRefreshTimer), false);
});

test('a dialog opening during face detection prevents reload', async () => {
    const { screen, page, api, reloads } = harness({ live: [] });
    screen.cameraConsentGranted = false;
    screen.idleSince = 0;
    api.detectAllFaces = async () => { page.querySelector = () => ({}); return []; };
    await screen.checkIdleRefresh();
    assert.equal(reloads.length, 0);
});

test('recognition starts on click without asking an existing visitor for consent', async () => {
    const { screen, calls } = harness();
    screen.cameraConsentGranted = false;
    screen.selectLanguage('ar');
    await screen.capture();
    assert.deepEqual(calls, []);
    await screen.beginRecognition();
    assert.equal(screen.state.consentOpen, false);
    assert.equal(screen.state.language, 'ar');
    assert.ok(calls.includes('recognition_person'));
});

test('new visitors give consent before any registration call; refusal discards the capture', async () => {
    const { screen, calls, timers, reloads } = harness();
    screen.state.captured = 'validated-photo';
    await screen.openNewVisitorJourney();
    assert.equal(screen.state.consentOpen, true);
    assert.deepEqual(calls, []);
    screen.cancelCameraConsent();
    await screen.capture();
    assert.deepEqual(calls, []);
    assert.equal(timers.size, 0);
    screen.cancelCameraConsent();
    await screen.beginRecognition();
    assert.equal(screen.cameraConsentGranted, false);
    assert.equal(reloads.length, 1);
});

test('checkout and arrival buttons select their own mode without closing the preview', async () => {
    const { screen } = harness();
    let captures = 0;
    screen.capture = async () => { captures++; };
    await screen.beginCheckout();
    assert.equal(screen.state.mode, 'checkout');
    assert.equal(screen.state.consentOpen, false);
    assert.equal(screen.cameraConsentGranted, true);
    assert.equal(captures, 1);
    assert.equal(screen.state.camera, true);
    screen.state.consentOpen = false;
    await screen.beginRecognition();
    assert.equal(screen.state.mode, 'arrival');
    assert.equal(screen.state.consentOpen, false);
    assert.equal(screen.cameraConsentGranted, true);
    assert.equal(captures, 2);
    assert.equal(screen.state.camera, true);
});

test('selected languages reach both new and recognized visitor journeys', async () => {
    for (const language of ['fr', 'en', 'es', 'ar']) {
        for (const recognized of [false, true]) {
            const { screen } = harness();
            screen.selectLanguage(language);
            screen.state.captured = 'validated-photo';
            screen.state.match = recognized ? 7 : false;
            let request;
            screen.orm.call = async (...args) => { request = args; return {}; };
            screen.action = { doAction: async () => {} };
            if (recognized) await screen.continueVisit();
            else {
                await screen.openNewVisitorJourney();
                assert.equal(request, undefined);
                await screen.confirmCameraConsent();
            }
            assert.equal(request[1], 'start_visit');
            assert.equal(request[2][2], language);
            assert.equal(request[3].context.default_language, language);
            assert.equal(request[3].context.lang, { fr: 'fr_FR', en: 'en_US', es: 'es_ES', ar: 'ar_001' }[language]);
            assert.equal(request[3].context.visitor_language_selected, true);
        }
    }
});

test('manual identification inherits Arabic and skips the second language choice', async () => {
    const { screen } = harness();
    screen.selectLanguage('ar');
    let options;
    screen.action = { doAction: async (action, values) => { options = values; } };
    await screen.manual();
    assert.equal(options.additionalContext.lang, 'ar_001');
    assert.equal(options.additionalContext.default_language, 'ar');
    assert.equal(options.additionalContext.visitor_language_selected, true);
    assert.equal(screen.isRtl, true);
    assert.equal(screen.t('title'), 'التعرّف على الوجه');
});

test('a turned live face invalidates a matching capture and uses the existing retry delay', async () => {
    const { screen, video, timers, calls } = harness({ live: [face(40)] });
    await screen.recognize(video, true);
    assert.equal(screen.state.match, false);
    assert.equal(screen.state.captured, '');
    assert.equal(screen.state.busy, false);
    assert.equal(calls.includes('recognition_person'), false);
    assert.equal(timers.size, 1);
    const retry = [...timers.values()][0];
    assert.equal(retry.delay, 1500);
    assert.match(screen.state.retryMessage, /2\/3/);
    retry.fn();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(screen.state.attempt, 2);
});
test('the last failed attempt reloads once without scheduling another retry, including checkout', async () => {
    for (const mode of ['arrival', 'checkout']) {
        const { screen, video, timers, calls, reloads } = harness({ live: [face(-40)], mode, limit: 1 });
        await screen.recognize(video, true);
        assert.equal(timers.size, 0);
        assert.equal(screen.state.match, false);
        assert.equal(screen.state.redirecting, true);
        assert.equal(screen.state.camera, false);
        assert.equal(reloads.length, 1);
        screen.scheduleRetry('failed again');
        assert.equal(reloads.length, 1);
        assert.equal(calls.includes('checkout'), false);
    }
});
test('frontal faces still match and release the monitoring timer', async () => {
    const { screen, video, timers } = harness();
    await screen.recognize(video, true);
    assert.equal(screen.state.match, 7);
    assert.equal(screen.state.person.id, 7);
    assert.equal(screen.state.camera, true);
    assert.equal(timers.size, 0);
});
test('missing faces, recognition errors and unmatched checkout reload only after attempts are exhausted', async () => {
    for (const failure of ['missing', 'error', 'unmatched']) {
        const { screen, video, api, reloads } = harness({
            captured: failure === 'missing' ? [] : [face()], mode: 'checkout', limit: 2,
        });
        if (failure === 'error') api.detectAllFaces = () => { throw new Error('Detection failed'); };
        if (failure === 'unmatched') api.euclideanDistance = () => 0.9;
        await screen.recognize(video, true);
        assert.equal(reloads.length, 0);
        assert.match(screen.state.retryMessage, /2\/2/);
        await screen.recognize(video, true);
        assert.equal(reloads.length, 1);
        assert.equal(screen.state.redirecting, true);
    }
});
test('a turned initial capture is retried before fetching references', async () => {
    const { screen, video, calls } = harness({ captured: [face(40)] });
    await screen.recognize(video, true);
    assert.equal(calls.length, 0);
    assert.match(screen.state.retryMessage, /2\/3/);
});
test('losing the face or adding another face also invalidates comparison', async () => {
    for (const live of [[], [face(), face()]]) {
        const { screen, video } = harness({ live });
        await screen.recognize(video, true);
        assert.equal(screen.state.match, false);
        assert.match(screen.state.retryMessage, /2\/3/);
    }
});

test('moderate turns in the saved frame are rejected even when the live face is frontal', async () => {
    for (const offset of [-22, 22]) {
        const { screen, video, calls, timers } = harness({ captured: [face(offset)], limit: 1 });
        await screen.recognize(video, true);
        assert.equal(screen.state.captured, '');
        assert.equal(screen.state.match, false);
        assert.equal(calls.length, 0);
        assert.equal(timers.size, 0);
    }
});

test('asymmetric cheeks reject a profile even if its estimated nose is centered', async () => {
    const profile = face();
    profile.landmarks.getJawOutline = () => Array.from({ length: 17 }, (_, i) => ({ x: 10 + i * 8.75, y: 60 }));
    const { screen, video, calls } = harness({ captured: [profile] });
    await screen.recognize(video, true);
    assert.equal(screen.state.captured, '');
    assert.equal(calls.length, 0);
    assert.match(screen.state.retryMessage, /2\/3/);
});

test('the validated frozen capture is passed to the visitor journey', async () => {
    const { screen, video } = harness();
    await screen.recognize(video, true);
    let submitted;
    screen.orm.call = async (model, method, args) => {
        assert.equal(method, 'start_visit');
        submitted = args;
        return {};
    };
    screen.action = { doAction: async () => {} };
    await screen.continueVisit();
    assert.equal(submitted[0], 'photo');
    assert.equal(submitted[1], 7);
});

test('closing a recognized active visit opens checkout and preserves identity on cancellation', async () => {
    const { screen } = harness();
    delete screen.openCheckout;
    const person = { id: 42, has_open_visit: true };
    screen.state.person = person;
    screen.state.language = 'fr';
    const calls = [];
    screen.orm.call = async (model, method, args) => {
        calls.push({ method, args: Array.from(args) });
        return { type: 'ir.actions.act_window' };
    };
    screen.action = { doAction: async () => {} };
    await screen.closeRecognizedVisit();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, 'checkout_for_person');
    assert.deepEqual(calls[0].args, [42, 'fr', true]);
    assert.equal(screen.state.person, person);
    assert.equal(screen.state.busy, false);
});

test('checkout preparation failure remains visible on the recognized identity card', async () => {
    const { screen } = harness();
    delete screen.openCheckout;
    screen.state.person = { id: 42, has_open_visit: true };
    screen.orm.call = async () => { throw { data: { name: 'odoo.exceptions.ValidationError', message: 'Visite déjà clôturée' } }; };
    await screen.closeRecognizedVisit();
    assert.equal(screen.state.journeyError, 'Visite déjà clôturée');
    assert.equal(screen.state.busy, false);
});

test('identity confirmation disappears while the arrival request is pending', async () => {
    const { screen } = harness();
    screen.state.person = {id: 7};
    screen.state.match = 7;
    screen.state.captured = 'validated-photo';
    let finish;
    screen.orm.call = () => new Promise(resolve => { finish = resolve; });
    screen.action = {doAction: async () => {}};
    const pending = screen.confirmIdentity();
    assert.equal(screen.state.person, false);
    assert.equal(screen.state.busy, true);
    finish({type: 'ir.actions.client', tag: 'ar_visitors.kiosk_done'});
    await pending;
    assert.equal(screen.state.person, false);
    assert.equal(screen.state.busy, false);
});

test('arrival rejection is visible inside the restored confirmation dialog', async () => {
    const { screen } = harness();
    const person = {id: 7};
    screen.state.person = person;
    screen.state.match = 7;
    screen.state.captured = 'validated-photo';
    const message = 'Ce visiteur possède déjà une visite en cours.';
    screen.orm.call = async () => { throw {data: {name: 'odoo.exceptions.ValidationError', message}}; };
    await screen.confirmIdentity();
    assert.equal(screen.state.person, person);
    assert.equal(screen.state.journeyError, message);
    assert.equal(screen.state.busy, false);
    assert.equal(screen.openingJourney, false);
});

test('safety instructions request the language selected at reception', async () => {
    for (const language of ['fr', 'en', 'es', 'ar']) {
        const { screen } = harness();
        screen.selectLanguage(language);
        let request;
        const instructions = [{id: 4, name: 'Safety', images: [{id: 8, name: 'Image', url: '/web/image/8'}]}];
        screen.orm.call = async (...args) => { request = args; return instructions; };
        await screen.openSafety();
        assert.equal(request[1], 'safety_instructions');
        assert.equal(request[2][0], language);
        assert.equal(screen.state.instructions, instructions);
        assert.equal(screen.state.safetyOpen, true);
    }
});

test('returning home closes safety instructions and images without reloading or stopping the camera', () => {
    const { screen, reloads } = harness();
    screen.state.safetyOpen = true;
    screen.state.safetyImage = {id: 8};
    screen.safetyImageTrigger = {};
    let stops = 0;
    screen.stopCamera = () => { stops++; };
    screen.returnHome();
    assert.equal(screen.state.safetyOpen, false);
    assert.equal(screen.state.safetyImage, false);
    assert.equal(screen.state.camera, true);
    assert.equal(stops, 0);
    assert.equal(reloads.length, 0);
});

test('safety guidance requires every instruction before returning home and resets on reopening', async () => {
    const { screen, reloads } = harness();
    const instructions = [{id:1}, {id:2}, {id:3}];
    screen.orm.call = async () => instructions;
    await screen.openSafety();
    assert.equal(screen.activeSafetyInstruction.id, 1);
    assert.equal(screen.safetyComplete, false);
    screen.returnHome();
    assert.equal(screen.state.safetyOpen, true);
    screen.nextSafetyInstruction();
    assert.equal(screen.activeSafetyInstruction.id, 2);
    screen.returnHome();
    assert.equal(screen.state.safetyOpen, true);
    screen.nextSafetyInstruction();
    assert.equal(screen.activeSafetyInstruction.id, 3);
    assert.equal(screen.safetyComplete, true);
    screen.nextSafetyInstruction();
    assert.equal(screen.state.safetyIndex, 2);
    screen.returnHome();
    assert.equal(screen.state.safetyOpen, false);
    assert.equal(reloads.length, 0);
    assert.equal(screen.state.camera, true);
    await screen.openSafety();
    assert.equal(screen.state.safetyIndex, 0);
    assert.equal(screen.safetyComplete, false);
});

