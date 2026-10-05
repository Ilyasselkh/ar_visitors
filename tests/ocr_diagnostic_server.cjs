// Local-only OCR integration probe. No uploads, no camera, no image copies or OCR logs.
// node tests/ocr_diagnostic_server.cjs <screenshot.png> '[x,y,width,height]'
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const sample = process.argv[2];
if (!sample || !fs.existsSync(sample)) throw new Error('Specify an existing local screenshot.');
const region = process.argv[3] ? JSON.parse(process.argv[3]) : null;
if (region && (!Array.isArray(region) || region.length !== 4 || !region.every(Number.isFinite)
    || region.some(value => value < 0) || !region[2] || !region[3])) throw new Error('Invalid crop rectangle.');
const html = `<!doctype html><meta charset="utf-8"><title>Diagnostic OCR local</title>
<h1>Diagnostic OCR local</h1><p>Aucune image envoyée à un service externe.</p><pre id="output">Chargement…</pre>
<script src="/ar_visitors/static/lib/ocr/tesseract/tesseract.min.js"></script>
<script type="module">
import { parseDocument, enhanceDocumentCanvas, readPassportMrz } from '/parser.js';
const output = document.getElementById('output');
const image = new Image(); image.src = '/sample'; await image.decode();
output.textContent = 'Image chargée : ' + image.width + ' × ' + image.height + '\\n';
const region = ${JSON.stringify(region)} || [0, 0, image.width, image.height];
for (const languages of ['fra+eng+ara']) {
  const worker = await Tesseract.createWorker(languages, 1, {
    workerPath: '/ar_visitors/static/lib/ocr/tesseract/worker.min.js',
    corePath: '/ar_visitors/static/lib/ocr/core', langPath: '/ar_visitors/static/lib/ocr/lang',
    workerBlobURL: false, cacheMethod: 'none',
  });
  for (const [name, x, y, width, height, psm, threshold] of [
      ['original', ...region, '11', '0'],
      ['normalisé', ...region, '11', '0'],
      ['synthetic', 0, 0, 800, 200, '11', '0']]) {
    await worker.setParameters({ tessedit_pageseg_mode: psm, thresholding_method: threshold });
    const canvas = document.createElement('canvas'); canvas.width = width * 2; canvas.height = height * 2;
    const context = canvas.getContext('2d'); context.filter = 'grayscale(1)';
    context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height);
    if (name === 'synthetic') {
      context.filter = 'none'; context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = 'black'; context.font = '64px Arial'; context.fillText('CIN: AB123456', 30, 100);
      context.fillText('Nom: TEST', 30, 200);
    }
    if (name !== 'original') enhanceDocumentCanvas(canvas);
    const { data } = await worker.recognize(canvas);
    const parsed = parseDocument(data.text, data.confidence, data.lines || []);
    const rows = (data.lines || []).map(line => ({
      score: Math.round(line.confidence),
      shape: line.text.replace(/[A-Za-zÀ-ž]/g, 'x').replace(/[0-9]/g, '0').replace(/[\u0600-\u06ff]/g, 'ع'),
      words: (line.words || []).map(word => ({ score: Math.round(word.confidence),
        shape: word.text.replace(/[A-Za-zÀ-ž]/g, 'x').replace(/[0-9]/g, '0').replace(/[\u0600-\u06ff]/g, 'ع') })),
    }));
    output.textContent += JSON.stringify({ languages, region: name, score: data.confidence,
      textLength: data.text.length, fields: Object.keys(parsed).filter(key => parsed[key]),
      lineCount: rows.length, reliableLineCount: rows.filter(row => row.score >= 70).length }, null, 2) + '\\n';
    canvas.width = canvas.height = 0;
  }
  await worker.reinitialize('eng', 1);
  await worker.setParameters({ tessedit_pageseg_mode: '6', tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' });
  const [rx, ry, rw, rh] = region;
  const mrz = document.createElement('canvas'); mrz.width = rw * 3; mrz.height = rh * .35 * 3;
  const mc = mrz.getContext('2d');
  mc.drawImage(image, rx, ry + rh * .6, rw, rh * .35, 0, 0, mrz.width, mrz.height);
  enhanceDocumentCanvas(mrz);
  const { data: mrzData } = await worker.recognize(mrz);
  output.textContent += JSON.stringify({ region: 'MRZ ciblée', score: mrzData.confidence,
    fields: Object.keys(parseDocument(mrzData.text, mrzData.confidence, mrzData.lines || [])).filter(key => parseDocument(mrzData.text, mrzData.confidence, mrzData.lines || [])[key]),
    rows: (mrzData.lines || []).map(line => ({ confidence: line.confidence,
      length: line.text.replace(/\\s/g, '').length,
      shape: line.text.replace(/[A-Z]/g, 'X').replace(/[0-9]/g, '0') })) }, null, 2) + '\\n';
  mrz.width = mrz.height = 0;
  const frame = document.createElement('canvas'); frame.width = rw * 3; frame.height = rh * 3;
  frame.getContext('2d').drawImage(image, rx, ry, rw, rh, 0, 0, frame.width, frame.height);
  const result = await readPassportMrz(worker, frame);
  output.textContent += JSON.stringify({ region: 'Passe MRZ de production',
    fields: Object.keys(result).filter(key => result[key]) }) + '\\n';
  frame.width = frame.height = 0;
  await worker.terminate();
}
output.textContent += 'TERMINÉ';
</script>`;
const server = http.createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  let file;
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); return res.end(html); }
  if (req.url === '/sample') { res.setHeader('Content-Type', 'image/png'); return fs.createReadStream(sample).pipe(res); }
  if (req.url === '/parser.js') {
    res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
    return res.end(fs.readFileSync(path.join(root, 'static/src/js/document_ocr.js'), 'utf8').replace(/^import .*;\r?\n/gm, ''));
  }
  if (req.url.startsWith('/ar_visitors/static/lib/ocr/')) {
    file = path.resolve(root, req.url.replace('/ar_visitors/', ''));
    if (!file.startsWith(path.join(root, 'static/lib/ocr') + path.sep)) { res.statusCode = 403; return res.end(); }
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream');
    return fs.createReadStream(file).on('error', () => { res.statusCode = 404; res.end(); }).pipe(res);
  }
  res.statusCode = 404; res.end();
});
server.listen(8766, '127.0.0.1', () => console.log('Diagnostic: http://127.0.0.1:8766'));
