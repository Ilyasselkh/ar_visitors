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
function harness({ live = [face()], captured = [face()], mode = 'arrival', limit = 3 } = {}) {
    const timers = new Map();
    let timerId = 0;
    const video = { videoWidth: 640, videoHeight: 480 };
    const canvas = { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,photo' };
    const api = {
        nets: Object.fromEntries(['tinyFaceDetector', 'faceLandmark68Net', 'faceRecognitionNet'].map(key => [key, { loadFromUri: async () => {} }])),
        TinyFaceDetectorOptions: class {},
        detectAllFaces(input) {
            return { withFaceLandmarks() {
                const result = Promise.resolve(input === video ? live : captured);
                result.withFaceDescriptors = () => result;
                return result;
            } };
        },
        bufferToImage: async () => ({}), euclideanDistance: () => 0.1,
    };
    const context = vm.createContext({ Component: class {}, xml: () => '', window: { faceapi: api }, faceapi: api,
        document: { createElement: () => canvas }, Blob, Uint8Array, atob,
        setTimeout: (fn, delay) => { timers.set(++timerId, { fn, delay }); return timerId; },
        clearTimeout: id => timers.delete(id),
    });
    vm.runInContext(source, context);
    const screen = new context.Screen();
    screen.alive = true;
    screen.video = { el: video };
    screen.state = { camera: true, attempt: 0, attemptLimit: limit, retryDelay: 1.5, mode };
    const calls = [];
    screen.orm = { async call(model, method) {
        calls.push(method);
        if (method === 'reference_photos') return { people: [{ id: 7, images: ['YQ=='] }], next_id: false };
        if (method === 'recognition_person') return { id: 7 };
    } };
    screen.openCheckout = async () => calls.push('checkout');
    return { screen, video, timers, calls };
}

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
test('the last attempt rejects a turned face without scheduling another retry, including checkout', async () => {
    for (const mode of ['arrival', 'checkout']) {
        const { screen, video, timers, calls } = harness({ live: [face(-40)], mode, limit: 1 });
        await screen.recognize(video, true);
        assert.equal(timers.size, 0);
        assert.equal(screen.state.match, false);
        assert.equal(screen.state.checkoutError, mode === 'checkout');
        assert.equal(calls.includes('checkout'), false);
    }
});
test('frontal faces still match and release the monitoring timer', async () => {
    const { screen, video, timers } = harness();
    await screen.recognize(video, true);
    assert.equal(screen.state.match, 7);
    assert.equal(screen.state.person.id, 7);
    assert.equal(timers.size, 0);
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
