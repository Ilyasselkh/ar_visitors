const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const { test } = require('node:test');
const root = path.join(__dirname, '../static/src/js');
const parserContext = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'document_ocr.js'), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\nglobalThis.parse = parseDocument;', parserContext);
const parse = parserContext.parse;
const captureRect = vm.runInContext('documentCaptureRect', parserContext);
const parseMrz = vm.runInContext('parsePassportMrz', parserContext);

test('passport number checks survive low name confidence without inventing names', () => {
    const first = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
    const second = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    const result = parseMrz(first + '\n' + second, 35);
    assert.equal(result.cin, 'L898902C3');
    assert.equal(result.first_name, '');
    assert.equal(result.nationality, '');
    assert.equal(parseMrz(first.replace(/<+$/, '') + '\n' + second, 90).first_name, 'ANNA MARIA');
    assert.equal(parseMrz(first + '\n' + second.replace('7408122', '7408123'), 95).cin, '');
    assert.equal(parseMrz(first + '\n' + second.slice(0, 43) + '9', 95).cin, '');
});

test('labelled identity is extracted; uncertain text never invents missing fields', () => {
    const text = 'Nom: AMRANI\nPrénom: Salma\nCIN: AB123456\nNationalité: Maroc';
    assert.equal(parse(text, 95).cin, 'AB123456');
    assert.equal(parse(text, 95).first_name, 'Salma');
    assert.equal(parse(text, 40).cin, '');
    assert.equal(parse('AMRANI Salma AB123456', 99).first_name, '');
    assert.equal(parse('Nom: ONE\nNom: TWO', 99).last_name, '');
});

test('passport number requires the MRZ check digit', () => {
    const first = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
    const second = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';
    const result = parse(first + '\n' + second, 95);
    assert.equal(result.cin, 'L898902C3');
    assert.equal(result.first_name, 'ANNA MARIA');
    assert.equal(parse(first + '\n' + second.replace('C36', 'C37'), 95).cin, '');
});

test('readable CIN lines survive a low bilingual page confidence', () => {
    const result = parse('', 35, [
        { text: 'Royaume du Maroc', confidence: 38 },
        { text: 'AB123456', confidence: 93 },
        { text: 'Prénom Salma', confidence: 88 },
    ]);
    assert.equal(result.cin, 'AB123456');
    assert.equal(result.first_name, 'Salma');
    assert.equal(parse('', 95, [{ text: 'AB123456', confidence: 35 }]).cin, '');
});

test('unlabelled CIN must be unique and never corrected speculatively', () => {
    assert.equal(parse('AB123456', 90).cin, 'AB123456');
    assert.equal(parse('AB123456\nCD654321', 90).cin, '');
    assert.equal(parse('AB12O456', 90).cin, '');
    assert.equal(parse('20.01.2000', 90).cin, '');
});

test('unreadable values cannot shift the next label into a name', () => {
    const result = parse('', 20, [
        { text: 'Prénom', confidence: 95 },
        { text: 'UNREADABLE', confidence: 10 },
        { text: 'Nom: AMRANI', confidence: 95 },
    ]);
    assert.equal(result.first_name, '');
    assert.equal(result.last_name, 'AMRANI');
    assert.equal(parse('Nom de famille\nAMRANI', 90).last_name, 'AMRANI');
    assert.equal(parse('Nom de famille', 90).last_name, '');
});

function screenHarness(globals = {}) {
    const calls = [];
    const source = fs.readFileSync(path.join(root, 'face_attendance_bridge.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '')
        .replace(/registry.category\("actions"\).add\([^;]+;/, 'globalThis.Screen = VisitorFaceAttendance;');
    const context = vm.createContext({ Component: class {}, xml: () => '', clearTimeout, setTimeout,
        documentCaptureRect: captureRect,
        documentComplete: parserContext.documentComplete, mergeDocumentReadings: parserContext.mergeDocumentReadings,
        documentLines: data => data.lines || [],
        navigator: { mediaDevices: { getUserMedia: async () => { calls.push('camera'); return { getTracks: () => [] }; } } }, ...globals });
    vm.runInContext(source, context);
    const screen = new context.Screen();
    screen.alive = true;
    screen.state = { busy: false, identity: {}, camera: false, mode: 'arrival', language: 'fr' };
    screen.video = { el: { play: async () => {} } };
    screen.orm = { call: async (_model, method) => {
        calls.push(method);
        return method === 'consent_policy' ? { text: 'Policy', version: 'v1' } : 'token';
    } };
    screen.openCamera = async () => { calls.push('camera'); screen.state.camera = true; };
    screen.capture = async () => calls.push('recognition');
    return { screen, calls };
}

test('camera opens before consent and confirmation starts recognition', async () => {
    const { screen, calls } = screenHarness();
    screen.watchForFace = async () => {};
    await screen.startCamera();
    assert.deepEqual(calls, ['camera']);
    assert.equal(screen.state.camera, true);
    await screen.confirmCameraConsent();
    assert.deepEqual(calls, ['camera']);
    assert.equal(screen.cameraConsentGranted, false);
    screen.state.consentOpen = true;
    await screen.confirmCameraConsent();
    assert.deepEqual(calls, ['camera', 'recognition']);
    assert.equal(screen.state.camera, true);
});

test('document confirmation sends extracted fields and the separate face photo only', async () => {
    const { screen } = screenHarness();
    screen.state.captured = 'face-photo';
    screen.state.identity = { first_name: 'Salma', last_name: 'Amrani', cin: 'AB1234', confirmed: true };
    let submitted;
    screen.orm.call = async (_model, method, args) => { submitted = { method, args }; return {}; };
    screen.action = { doAction: async () => {} };
    await screen.submitDocument();
    assert.equal(submitted.method, 'start_visit');
    assert.equal(submitted.args[0], 'face-photo');
    assert.equal(submitted.args[2], 'fr');
    assert.equal(submitted.args[3].cin, 'AB1234');
    assert.equal(screen.state.captured, '');
});

test('unconfirmed or incomplete identity cannot be submitted', async () => {
    const { screen, calls } = screenHarness();
    screen.state.identity = { first_name: '', last_name: 'Amrani', cin: 'AB1234', confirmed: false };
    await screen.submitDocument();
    screen.state.identity.confirmed = true;
    await screen.submitDocument();
    assert.deepEqual(calls, []);
});

function scannerHarness(data, recognizeHook = () => {}) {
    const timers = new Map();
    let sequence = 0, terminated = 0;
    const canvas = { getContext: () => ({ drawImage() {} }) };
    const { screen } = screenHarness({
        readCardZones: async () => ({ cin: '', first_name: '', last_name: '', nationality: '' }),
        parseDocument: parse,
        enhanceDocumentCanvas: () => {},
        readPassportMrz: async () => ({ cin: '', first_name: '', last_name: '', nationality: '' }),
        document: { createElement: () => canvas },
        createDocumentWorker: async () => ({
            setParameters: async () => {},
            recognize: async () => { recognizeHook(screen); return { data }; },
            terminate: async () => { terminated++; },
        }),
        setTimeout: callback => { timers.set(++sequence, callback); return sequence; },
        clearTimeout: id => timers.delete(id),
    });
    screen.video = { el: { videoWidth: 1920, videoHeight: 1080 } };
    Object.assign(screen.state, { documentMode: true, camera: true,
        identity: { first_name: '', last_name: '', cin: '', nationality: '', confirmed: false } });
    return { screen, timers, canvas, terminated: () => terminated };
}

test('empty OCR retries automatically and never announces successful extraction', async () => {
    const { screen, timers, canvas, terminated } = scannerHarness({ text: '', confidence: 0 });
    await screen.scanDocument();
    assert.match(screen.state.message, /aucun texte détecté/);
    assert.equal(timers.size, 1);
    assert.equal(screen.state.busy, false);
    assert.equal(canvas.width, 0);
    assert.equal(terminated(), 1);
    screen.pauseDocumentScan();
    assert.equal(timers.size, 0);
});

test('successful extraction pauses automatic capture for visitor review', async () => {
    const { screen, timers } = scannerHarness({ text: 'CIN: AB123456\nPrénom: Salma\nNom: Amrani\nNationalité: MAR', confidence: 90 });
    await screen.scanDocument();
    assert.equal(screen.state.identity.cin, 'AB123456');
    assert.equal(screen.state.documentScanning, false);
    assert.equal(timers.size, 0);
    assert.equal(screen.state.identity.confirmed, false);
});

test('manual edits and pausing during OCR are preserved', async () => {
    const { screen, timers } = scannerHarness({ text: 'CIN: AB123456', confidence: 90 }, screen => {
        screen.state.identity.cin = 'CD654321';
    });
    await screen.scanDocument();
    assert.equal(screen.state.identity.cin, 'CD654321');
    assert.equal(timers.size, 0);
    const paused = scannerHarness({ text: 'CIN: AB123456', confidence: 90 }, screen => screen.pauseDocumentScan());
    await paused.screen.scanDocument();
    assert.equal(paused.screen.state.identity.cin, '');
    assert.equal(paused.timers.size, 0);
});

test('a busy recognition does not lose the pending document capture', async () => {
    const { screen, timers } = scannerHarness({ text: '', confidence: 0 });
    screen.state.busy = true;
    await screen.openNewVisitorJourney();
    [...timers.values()][0]();
    assert.equal(timers.size, 1);
    assert.equal(screen.state.documentScanning, true);
    screen.state.busy = false;
    screen.cancelDocument();
    assert.equal(timers.size, 0);
});

test('capture frame matches card ratio without cutting its lower edge on widescreen video', () => {
    for (const [width, height] of [[1920, 1080], [640, 480], [480, 640]]) {
        const rect = captureRect(width, height);
        assert.ok(rect.x >= 0 && rect.y >= 0);
        assert.ok(rect.x + rect.width <= width && rect.y + rect.height <= height);
        assert.ok(Math.abs(rect.width / rect.height - 85.6 / 53.98) < .001);
        assert.ok(Math.abs(rect.x * 2 + rect.width - width) < .001);
    }
});

test('three unreadable captures stop rather than looping forever', async () => {
    const { screen, timers } = scannerHarness({ text: '', confidence: 0 });
    await screen.scanDocument();
    await screen.scanDocument();
    await screen.scanDocument();
    assert.equal(screen.state.documentScanning, false);
    assert.equal(timers.size, 0);
    assert.match(screen.state.message, /Trois captures/);
});

test('rescanning another document never retains names from the previous document', async () => {
    const { screen } = scannerHarness({ text: 'CD654321', confidence: 90 });
    screen.state.identity = { cin: 'AB123456', first_name: 'Previous', last_name: 'Visitor', nationality: 'MAR', confirmed: true };
    await screen.scanDocument();
    assert.equal(screen.state.identity.cin, 'CD654321');
    assert.equal(screen.state.identity.first_name, '');
    assert.equal(screen.state.identity.last_name, '');
    assert.equal(screen.state.identity.confirmed, false);
});

test('document workers are cleaned up after errors and no retry loop is started', async () => {
    const { screen, timers, terminated } = scannerHarness({ text: '', confidence: 0 }, () => { throw new Error('worker failed'); });
    await screen.scanDocument();
    assert.equal(screen.state.busy, false);
    assert.equal(screen.state.documentScanning, false);
    assert.equal(terminated(), 1);
    assert.equal(timers.size, 0);
});

test('failed submission preserves face and reviewed fields for retry', async () => {
    const { screen } = screenHarness();
    screen.state.captured = 'face-photo';
    screen.state.identity = { first_name: 'Salma', last_name: 'Amrani', cin: 'AB1234', confirmed: true };
    screen.orm.call = async () => { throw new Error('Connection lost'); };
    await screen.submitDocument();
    assert.equal(screen.state.captured, 'face-photo');
    assert.equal(screen.state.identity.cin, 'AB1234');
    assert.equal(screen.state.busy, false);
});

test('number-only extraction continues and accumulates fields only for the same document', async () => {
    const data = { text: 'CIN: AB123456', confidence: 90 };
    const { screen, timers } = scannerHarness(data);
    await screen.scanDocument();
    assert.equal(screen.state.identity.cin, 'AB123456');
    assert.equal(screen.state.documentScanning, true);
    assert.equal(timers.size, 1);
    data.text = 'CIN: AB123456\nNom: AMRANI';
    await screen.scanDocument();
    assert.equal(screen.state.identity.last_name, 'AMRANI');
    assert.equal(screen.state.documentScanning, true);
    data.text = 'CIN: AB123456\nPrénom: Salma\nNationalité: MAR';
    await screen.scanDocument();
    assert.equal(screen.state.identity.last_name, 'AMRANI');
    assert.equal(screen.state.identity.first_name, 'Salma');
    assert.equal(screen.state.documentScanning, false);
    assert.equal(timers.size, 0);
});

test('partial results are retained after the third attempt and a frame without an ID cannot add names', async () => {
    const data = { text: 'CIN: AB123456', confidence: 90 };
    const { screen, timers } = scannerHarness(data);
    await screen.scanDocument();
    data.text = 'Nom: OTHER\nPrénom: PERSON';
    await screen.scanDocument();
    assert.equal(screen.state.identity.last_name, '');
    data.text = '';
    await screen.scanDocument();
    assert.equal(screen.state.identity.cin, 'AB123456');
    assert.equal(screen.state.documentScanning, false);
    assert.equal(timers.size, 0);
});

test('partial MRZ keeps reliably labelled names from the same frame', () => {
    const result = parse('', 20, [
        { text: 'Nom: ERIKSSON', confidence: 95 },
        { text: 'Prénom: ANNA MARIA', confidence: 95 },
        { text: 'Nationalité: UTO', confidence: 95 },
        { text: 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', confidence: 35 },
        { text: 'L898902C36UTO7408122F1204159ZE184226B<<<<<10', confidence: 35 },
    ]);
    assert.equal(result.cin, 'L898902C3');
    assert.equal(result.first_name, 'ANNA MARIA');
    assert.equal(result.last_name, 'ERIKSSON');
    assert.equal(result.nationality, 'UTO');
});

test('readings with conflicting numbers are never merged even on the same frame', () => {
    const result = parserContext.mergeDocumentReadings(
        { cin: 'AB123456', first_name: 'Other', last_name: 'Visitor' },
        { cin: 'CD654321', first_name: '', last_name: '' }, true);
    assert.equal(result.cin, 'CD654321');
    assert.equal(result.first_name, '');
});

test('MRZ number-only first pass triggers the enhanced pass to recover names', async () => {
    const context = vm.createContext({ document: { createElement: () => ({ getContext: () => ({ drawImage() {} }) }) } });
    vm.runInContext(fs.readFileSync(path.join(root, 'document_ocr.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\nenhanceDocumentCanvas = () => {};', context);
    let reads = 0;
    const worker = {
        reinitialize: async () => {}, setParameters: async () => {},
        recognize: async () => ({ data: {
            text: 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<\nL898902C36UTO7408122F1204159ZE184226B<<<<<10',
            confidence: ++reads === 1 ? 35 : 95,
        } }),
    };
    const result = await context.readPassportMrz(worker, { width: 1600, height: 1000 });
    assert.equal(reads, 2);
    assert.equal(result.first_name, 'ANNA MARIA');
});

test('card number zone rejects digit-only serials, dates and detached suffixes', () => {
    const parseZone = parserContext.parseCardNumberZone;
    for (const text of ['1234567', '1234567 MD', '20.01.2030', 'AB12O456']) {
        assert.equal(parseZone({ lines: [{ text, confidence: 99 }] }), '');
    }
    assert.equal(parseZone({ lines: [{ text: 'AB123456', confidence: 95 }] }), 'AB123456');
    assert.equal(parseZone({ lines: [{ text: 'AB123456', confidence: 60 }] }), '');
    assert.equal(parseZone({ lines: [{ text: 'AB123456', confidence: 95 }, { text: 'CD654321', confidence: 95 }] }), '');
});

test('position-based names require exactly two reliable adjacent rows in the template region', () => {
    const row = (text, y, confidence = 95) => ({ text, confidence, bbox: { y0: y, y1: y + 30 } });
    const parseRows = parserContext.parseCardNameRows;
    assert.equal(parseRows({ lines: [row('AMRANI', 200), row('SALMA', 290)] }, 600).first_name, 'SALMA');
    for (const lines of [
        [row('AMRANI', 200), row('SALMA', 290, 60)],
        [row('AMRANI', 200), row('SALMA', 290), row('CASABLANCA', 360)],
        [row('CARTE NATIONALE', 200), row('SALMA', 290)],
        [row('AMRANI', 20), row('SALMA', 80)],
    ]) assert.equal(Object.keys(parseRows({ lines }, 600)).length, 0);
});

test('zoned OCR rejects unstable readings and frees every temporary crop on cancellation', async () => {
    const canvases = [];
    const context = vm.createContext({ document: { createElement: () => {
        const canvas = { getContext: () => ({ drawImage() {} }) }; canvases.push(canvas); return canvas;
    } } });
    vm.runInContext(fs.readFileSync(path.join(root, 'document_ocr.js'), 'utf8')
        .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\nenhanceDocumentCanvas = () => {};', context);
    let reads = 0;
    const worker = { reinitialize: async () => {}, setParameters: async () => {},
        recognize: async () => { reads++; return { data: { text: '', lines: reads < 3 ? [] : [{ text: reads === 3 ? 'AB123456' : 'CD654321', confidence: 95 }] } }; } };
    const result = await context.readCardZones(worker, { width: 1600, height: 1000 });
    // Number-zone reads 3 and 4 disagree: neither is accepted.
    assert.equal(result.cin, '');
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
    let current = true;
    worker.recognize = async () => { current = false; return { data: { text: '', lines: [] } }; };
    await context.readCardZones(worker, { width: 1600, height: 1000 }, { isCurrent: () => current });
    assert.ok(canvases.every(canvas => canvas.width === 0 && canvas.height === 0));
});

test('line refinement requires two concordant high-confidence readings and frees crops', async () => {
    for (const disagree of [false, true]) {
        const crops = [];
        const context = vm.createContext({ document: { createElement: () => {
            const canvas = { getContext: () => ({ drawImage() {} }) }; crops.push(canvas); return canvas;
        } } });
        vm.runInContext(fs.readFileSync(path.join(root, 'document_ocr.js'), 'utf8')
            .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\nenhanceDocumentCanvas = () => {};', context);
        const lines = ['AMRANI', 'SALMA'].map((text, i) => ({ text, confidence: 35, bbox: { x0: 20, x1: 200, y0: 200 + i * 90, y1: 230 + i * 90 } }));
        let reads = 0;
        const settings = [];
        const worker = { setParameters: async p => settings.push(p.tessedit_pageseg_mode), recognize: async () => {
            const index = reads++;
            return { data: { text: disagree && index % 2 ? 'DIFFERENT' : lines[Math.floor(index / 2)].text, confidence: 95 } };
        } };
        const result = await context.refineCardNameLines(worker, { width: 600, height: 600 }, { lines });
        assert.equal(result.lines[0].confidence, disagree ? 35 : 95);
        assert.equal(context.parseCardNameRows(result, 600).first_name, disagree ? undefined : 'SALMA');
        assert.equal(lines[0].confidence, 35);
        assert.equal(settings.at(-1), '11');
        assert.ok(crops.every(crop => crop.width === 0 && crop.height === 0));
    }
});
