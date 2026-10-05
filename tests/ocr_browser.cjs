const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
const owlPath = process.env.ODOO_OWL_PATH || path.resolve(root, '../../../addons/web/static/lib/owl/owl.js');
const js = file => fs.readFileSync(path.join(root, 'static/src/js', file), 'utf8').replace(/^import .*;\r?\n/gm, '');
const html = `<!doctype html><html><head><meta charset="utf-8"><script src="/owl.js"></script></head><body><div id="app"></div><script type="module">
import * as ocr from '/parser.js';
window.ocr = ocr;
const { Component, onWillUnmount, useRef, useState, xml } = owl;
const { createDocumentWorker, parseDocument, readPassportMrz, enhanceDocumentCanvas, documentCaptureRect, documentLines, documentComplete, mergeDocumentReadings, readCardZones } = ocr;
const useService = () => ({ call: async () => ({}), doAction: async () => {} });
const registry = { category: () => ({ add: (_, Component) => { window.Screen = Component; } }) };
const loadJS = url => new Promise((resolve, reject) => { const s = document.createElement('script'); s.src = url; s.onload = resolve; s.onerror = reject; document.head.append(s); });
${js('face_attendance_bridge.js')}
window.screenInstance = await owl.mount(window.Screen, document.getElementById('app'));
window.ready = true;
</script></body></html>`;
const server = http.createServer((req, res) => {
    let file;
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
    if (req.url === '/parser.js') {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
        return res.end(`const loadJS = url => new Promise((resolve,reject) => { const s=document.createElement('script'); s.src=url; s.onload=resolve; s.onerror=reject; document.head.append(s); });\n` + js('document_ocr.js'));
    }
    if (req.url === '/owl.js') file = owlPath;
    else if (req.url.startsWith('/ar_visitors/static/')) {
        file = path.resolve(root, req.url.slice('/ar_visitors/'.length));
        if (!file.startsWith(path.join(root, 'static') + path.sep)) { res.writeHead(403); return res.end(); }
    }
    if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript; charset=utf-8' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
});
(async () => {
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
        browser = await chromium.launch({ channel: 'msedge', headless: true });
        const page = await browser.newPage();
        const errors = [];
        await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
        page.on('pageerror', error => errors.push(error.message));
        await page.goto(`http://127.0.0.1:${server.address().port}`);
        await page.waitForFunction(() => window.ready, { timeout: 20000 });
        await page.evaluate(async () => {
            const screen = window.screenInstance;
            screen.state.captured = 'face';
            await screen.openNewVisitorJourney();
            screen.pauseDocumentScan();
        });
        await page.getByRole('heading', { name: 'Scanner la CIN / le passeport' }).waitFor();
        assert.equal(await page.locator('.ar_document_fields input').count(), 4);
        await page.locator('.ar_document_toolbar select').selectOption('card_right');
        await page.getByText('Pour ce modèle :', { exact: false }).waitFor();
        await page.locator('.ar_face_language_button').filter({ hasText: 'العربية' }).click();
        assert.equal(await page.locator('.ar_face_screen').getAttribute('dir'), 'rtl');
        const result = await page.evaluate(async () => {
            const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1000;
            const ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1600, 1000);
            ctx.fillStyle = 'black'; ctx.font = '48px Arial';
            ['CIN: AB123456', 'Nom: AMRANI', 'Prenom: SALMA', 'Nationalite: MAR'].forEach((line, i) => ctx.fillText(line, 100, 180 + i * 160));
            const screen = window.screenInstance;
            const stream = canvas.captureStream(1);
            screen.stream = stream;
            screen.video.el.srcObject = stream;
            await screen.video.el.play();
            screen.state.camera = true;
            await screen.scanDocument();
            const prefilled = { ...screen.state.identity };
            screen.stopCamera();
            const worker = await window.ocr.createDocumentWorker();
            try {
                await worker.setParameters({ tessedit_pageseg_mode: '11' });
                const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
                const card = window.ocr.parseDocument(data.text, data.confidence, window.ocr.documentLines(data));
                ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1600, 1000);
                ctx.fillStyle = 'black'; ctx.font = '48px Arial';
                ctx.fillText('AMRANI', 60, 340);
                ctx.fillText('SALMA', 60, 440);
                ctx.fillText('AB123456', 1060, 760);
                const zoned = await window.ocr.readCardZones(worker, canvas, { template: true });
                ctx.fillStyle = 'white'; ctx.fillRect(1000, 650, 600, 300);
                const namesOnly = await window.ocr.readCardZones(worker, canvas, { template: true });
                ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 1600, 1000);
                ctx.fillStyle = 'black'; ctx.font = '48px "OCR A Extended"';
                ctx.fillText('P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 30, 780);
                ctx.fillText('L898902C36UTO7408122F1204159ZE184226B<<<<<10', 30, 880);
                const mrzReads = [];
                const originalRecognize = worker.recognize.bind(worker);
                worker.recognize = async (...args) => { const result = await originalRecognize(...args); mrzReads.push(result.data.text); return result; };
                const passport = await window.ocr.readPassportMrz(worker, canvas);
                return { card, prefilled, zoned, namesOnly, passport, mrzReads, lineCount: window.ocr.documentLines(data).length };
            } finally { await worker.terminate(); }
        });
        assert.equal(result.prefilled.cin, 'AB123456');
        assert.equal(result.prefilled.first_name, 'SALMA');
        assert.equal(result.prefilled.last_name, 'AMRANI');
        assert.equal(result.prefilled.confirmed, false);
        assert.equal(result.namesOnly.cin, '');
        assert.equal(result.namesOnly.last_name, 'AMRANI');
        assert.equal(result.namesOnly.first_name, 'SALMA');
        assert.equal(result.zoned.cin, 'AB123456');
        assert.equal(result.zoned.last_name, 'AMRANI');
        assert.equal(result.zoned.first_name, 'SALMA');
        assert.equal(result.card.cin, 'AB123456');
        assert.equal(result.card.last_name, 'AMRANI');
        assert.equal(result.card.first_name, 'SALMA');
        assert.equal(result.passport.cin, 'L898902C3', JSON.stringify(result.mrzReads));
        assert.ok(result.lineCount >= 4);
        assert.deepEqual(errors, []);
        console.log('PASS: OWL document screen, Arabic RTL, local best models, synthetic CIN and passport MRZ.');
    } finally { if (browser) await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

