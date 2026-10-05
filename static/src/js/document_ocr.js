/** @odoo-module **/
import { loadJS } from "@web/core/assets";

export function documentCaptureRect(width, height, type = 'card') {
    // Fit a standard identity-card ratio in the video, instead of cutting off its lower edge.
    const ratio = type === 'passport' ? 125 / 88 : 85.6 / 53.98;
    const cropWidth = Math.min(width * .9, height * .9 * ratio);
    const cropHeight = cropWidth / ratio;
    return { x: (width - cropWidth) / 2, y: (height - cropHeight) / 2,
        width: cropWidth, height: cropHeight };
}

export function documentLines(data) {
    return data.lines || (data.blocks || []).flatMap(block =>
        (block.paragraphs || []).flatMap(paragraph => paragraph.lines || []));
}

export function documentComplete(identity) {
    return ['cin', 'first_name', 'last_name', 'nationality'].every(key => Boolean(identity[key]?.trim()));
}

export function mergeDocumentReadings(previous, next, sameFrame = false) {
    const number = value => (value || '').toUpperCase().replace(/[\s-]/g, '');
    const before = number(previous.cin), after = number(next.cin);
    // Across frames, a matching number is required to associate the readings.
    if ((before && after && before !== after) || (!sameFrame && (!before || !after))) {
        return { ...(before && !after ? previous : next) };
    }
    const merged = {};
    for (const key of ['cin', 'first_name', 'last_name', 'nationality']) {
        merged[key] = next[key] || previous[key] || '';
    }
    return merged;
}

// Remove slowly varying shadows before Tesseract's thresholding step.
export function enhanceDocumentCanvas(canvas) {
    const context = canvas.getContext('2d', { willReadFrequently: true });
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { width, height, data } = image;
    const stride = width + 1;
    const integral = new Float64Array(stride * (height + 1));
    const grey = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) {
        let row = 0;
        for (let x = 0; x < width; x++) {
            const i = y * width + x, p = i * 4;
            grey[i] = Math.round(data[p] * .299 + data[p + 1] * .587 + data[p + 2] * .114);
            row += grey[i];
            integral[(y + 1) * stride + x + 1] = integral[y * stride + x + 1] + row;
        }
    }
    const radius = Math.max(12, Math.round(width / 70));
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const left = Math.max(0, x - radius), right = Math.min(width, x + radius + 1);
            const top = Math.max(0, y - radius), bottom = Math.min(height, y + radius + 1);
            const mean = (integral[bottom * stride + right] - integral[top * stride + right]
                - integral[bottom * stride + left] + integral[top * stride + left]) / ((right - left) * (bottom - top));
            const i = y * width + x, p = i * 4;
            const value = Math.max(0, Math.min(255, 220 + (grey[i] - mean) * 4));
            data[p] = data[p + 1] = data[p + 2] = value;
        }
    }
    context.putImageData(image, 0, 0);
}

function mrzCheck(value, digit) {
    if (!/^[A-Z0-9<]+$/.test(value) || !/^[0-9]$/.test(digit)) return false;
    return String([...value].reduce((sum, c, i) => sum + (c === '<' ? 0 : parseInt(c, 36)) * [7, 3, 1][i % 3], 0) % 10) === digit;
}

export function parsePassportMrz(text, confidence = 0, ocrLines = []) {
    const result = { first_name: '', last_name: '', cin: '', nationality: '' };
    const lines = (ocrLines.length ? ocrLines : text.split(/\r?\n/).map(text => ({ text, confidence })))
        .flatMap(line => (line.text || '').split(/\r?\n/).map(text => ({
            text: text.normalize('NFKC').toUpperCase().replace(/\s/g, ''), confidence: Number(line.confidence) || 0,
        }))).filter(line => line.text);
    const candidates = [];
    for (let i = 0; i + 1 < lines.length; i++) {
        const a = lines[i], b = lines[i + 1], value = b.text;
        // No OCR substitutions, fabricated characters or guessed check digits.
        // Missing trailing name fillers do not change the encoded names.
        if (!/^P[A-Z<][A-Z<]{3}[A-Z<]+<<[A-Z<]+$/.test(a.text) || a.text.length > 44 || a.text.length < 15) continue;
        if (!/^[A-Z0-9<]{9}[0-9][A-Z<]{3}[0-9]{6}[0-9][MFX<][0-9]{6}[0-9][A-Z0-9<]*$/.test(value)
            || value.length > 44) continue;
        if (!mrzCheck(value.slice(0, 9), value[9])
            || !mrzCheck(value.slice(13, 19), value[19])
            || !mrzCheck(value.slice(21, 27), value[27])) continue;
        if (value.length === 44 && !mrzCheck(value.slice(0, 10) + value.slice(13, 20) + value.slice(21, 43), value[43])) continue;
        const candidate = { ...result, cin: value.slice(0, 9).replace(/<+$/, '') };
        // Names and nationality are not protected by the check digits.
        if (a.confidence >= 70) {
            const [last, first] = a.text.slice(5).split('<<');
            candidate.last_name = last.replace(/</g, ' ').trim();
            candidate.first_name = (first || '').replace(/</g, ' ').trim();
        }
        if (b.confidence >= 70 && /^[A-Z]{3}$/.test(value.slice(10, 13))) candidate.nationality = value.slice(10, 13);
        candidates.push(candidate);
    }
    return candidates.length === 1 ? candidates[0] : result;
}

export async function readPassportMrz(worker, source) {
    // A separate Latin-only pass preserves the '<' separators that multilingual OCR loses.
    const crop = document.createElement('canvas');
    const sourceY = Math.round(source.height * .55);
    const sourceHeight = source.height - sourceY;
    const scale = Math.min(3, Math.max(1, 2200 / source.width));
    crop.width = Math.round(source.width * scale);
    crop.height = Math.round(sourceHeight * scale);
    crop.getContext('2d').drawImage(source, 0, sourceY, source.width, sourceHeight, 0, 0, crop.width, crop.height);
    try {
        await worker.reinitialize('eng', 1);
        await worker.setParameters({ tessedit_pageseg_mode: '6',
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<' });
        let { data } = await worker.recognize(crop, {}, { text: true, blocks: true });
        let parsed = parsePassportMrz(data.text, data.confidence, documentLines(data));
        if (!documentComplete(parsed)) {
            enhanceDocumentCanvas(crop);
            ({ data } = await worker.recognize(crop, {}, { text: true, blocks: true }));
            parsed = mergeDocumentReadings(parsed, parsePassportMrz(data.text, data.confidence, documentLines(data)), true);
        }
        return parsed;
    } finally { crop.width = crop.height = 0; }
}

// Names require labels or a passport MRZ; a CIN number can be printed on its own.
export function parseDocument(text, confidence = 0, ocrLines = []) {
    const result = { first_name: "", last_name: "", cin: "", nationality: "" };
    const passport = parsePassportMrz(text, confidence, ocrLines);
    // A bilingual card may have a poor overall score despite readable individual fields.
    // Preserve line boundaries: never join a label across an unreadable value.
    const lines = ocrLines.length
        ? ocrLines.map(line => Number(line.confidence) >= 70 ? (line.text || '').normalize('NFKC').trim() : '')
        : confidence >= 70 ? text.normalize("NFKC").split(/\r?\n/).map(line => line.trim()) : [];
    const labels = {
        first_name: /^(?:pr[ée]noms?|given names?|first name|الاسم الشخصي)(?:\s*[:：]\s*|\s+)(.+)$/i,
        last_name: /^(?:nom(?: de famille)?|surname|last name|الاسم العائلي)(?:\s*[:：]\s*|\s+)(.+)$/i,
        cin: /^(?:cin|cnie|n[°ºo]\s*(?:de\s*)?(?:cin|passeport)|passport(?: no\.?| number)?|رقم البطاقة)(?:\s*[:：]\s*|\s+)([A-Z0-9 -]+)$/i,
        nationality: /^(?:nationalit[ée]|nationality|الجنسية)(?:\s*[:：]\s*|\s+)(.+)$/i,
    };
    const standalone = /^(pr[ée]noms?|given names?|first name|nom(?: de famille)?|surname|last name|cin|cnie|nationalit[ée]|nationality|الاسم الشخصي|الاسم العائلي|الجنسية)\s*[:：]?$/i;
    const labelledLines = lines.flatMap((line, index) => {
        const label = line.match(standalone);
        const next = lines[index + 1];
        return label && next && !standalone.test(next) && !next.includes(':')
            ? [line, `${label[1]}: ${next}`] : [line];
    });
    for (const [key, pattern] of Object.entries(labels)) {
        const matches = labelledLines.filter(line => !standalone.test(line))
            .map(line => line.match(pattern)).filter(Boolean);
        if (matches.length === 1) result[key] = matches[0][1].trim();
    }
    // Moroccan CIN numbers are often printed alone, without a CIN label.
    // Accept only a unique whole-line candidate, never a guessed correction (O -> 0, etc.).
    if (!result.cin) {
        const numbers = [...new Set(lines.filter(line => /^[A-Z]{1,2}\s?\d{4,8}$/.test(line))
            .map(line => line.replace(/\s/g, '')))];
        if (numbers.length === 1) result.cin = numbers[0];
    }
    return passport.cin ? mergeDocumentReadings(result, passport, true) : result;
}

// All coordinates are relative to the document frame, not to the browser viewport.
export const CARD_ZONES = [
    { key: 'latin', x: 0, y: .12, width: .56, height: .58, language: 'fra+eng', psm: '11' },
    { key: 'arabic', x: .43, y: .12, width: .27, height: .58, language: 'ara', psm: '11' },
    { key: 'number', x: .58, y: .62, width: .42, height: .27, language: 'eng', psm: '6' },
];

export function parseCardNumberZone(data) {
    const candidates = new Set();
    for (const line of documentLines(data)) {
        if (Number(line.confidence) < 80) continue;
        const value = (line.text || '').normalize('NFKC').trim().toUpperCase();
        // Keep the printed order. A separate suffix/stamp must never become a CIN prefix.
        // Never substitute a letter for a digit, even when the resulting shape looks plausible.
        const direct = value.match(/^([A-Z]{1,2})\s*(\d{4,8})$/);
        if (direct) candidates.add(direct[1] + direct[2]);
        for (const word of line.words || []) {
            const text = (word.text || '').trim().toUpperCase();
            if (Number(word.confidence) >= 80 && /^[A-Z]{1,2}\d{4,8}$/.test(text)) candidates.add(text);
        }
    }
    return candidates.size === 1 ? [...candidates][0] : '';
}

export function parseCardNameRows(data, height) {
    // Enabled only for the explicitly selected photo-on-right template.
    // Two adjacent, high-confidence Latin rows are required; headings/dates/places are excluded.
    const rows = documentLines(data).filter(line => {
        const text = (line.text || '').normalize('NFKC').trim();
        return Number(line.confidence) >= 85 && line.bbox
            && /^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý '\u2019-]{1,59}$/.test(text)
            && !/\b(ROYAUME|MAROC|CARTE|NATIONALE|IDENTITE|NOM|PRENOM|NE|NEE|NAISSANCE|VALABLE|EXPIRATION)\b/.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
            && line.bbox.y0 / height >= .15 && line.bbox.y1 / height <= .70;
    }).sort((a, b) => a.bbox.y0 - b.bbox.y0);
    if (rows.length !== 2 || rows[1].bbox.y0 - rows[0].bbox.y1 > height * .16) return {};
    return { last_name: rows[0].text.trim(), first_name: rows[1].text.trim() };
}

export async function refineCardNameLines(worker, source, data, isCurrent = () => true) {
    // Use detected line boxes, not hard-coded name coordinates or the OCR's guesses.
    const lines = documentLines(data);
    const candidates = lines.filter(line => line.bbox && Number(line.confidence) >= 20
        && /^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý '\u2019-]{1,59}$/.test((line.text || '').trim())
        && line.bbox.y0 / source.height >= .15 && line.bbox.y1 / source.height <= .70);
    // More rows could include a place of birth or another field: do not assign roles.
    if (candidates.length !== 2) return data;
    const replacements = new Map();
    try {
        await worker.setParameters({ tessedit_pageseg_mode: '7' });
        for (const line of candidates) {
            if (!isCurrent()) return data;
            const { x0, y0, x1, y1 } = line.bbox;
            const padding = Math.max(4, Math.round((y1 - y0) * .2));
            const left = Math.max(0, x0 - padding), top = Math.max(0, y0 - padding);
            const width = Math.min(source.width, x1 + padding) - left;
            const height = Math.min(source.height, y1 + padding) - top;
            if (width <= 0 || height <= 0) continue;
            const crop = document.createElement('canvas');
            crop.width = Math.round(width); crop.height = Math.round(height);
            try {
                crop.getContext('2d').drawImage(source, left, top, width, height, 0, 0, crop.width, crop.height);
                const first = (await worker.recognize(crop, {}, { text: true, blocks: true })).data;
                if (!isCurrent()) return data;
                enhanceDocumentCanvas(crop);
                const second = (await worker.recognize(crop, {}, { text: true, blocks: true })).data;
                const text = (first.text || '').trim();
                if (first.confidence >= 85 && second.confidence >= 85 && text === (second.text || '').trim()) {
                    replacements.set(line, { ...line, text, confidence: Math.min(first.confidence, second.confidence) });
                }
            } finally { crop.width = crop.height = 0; }
        }
    } finally { await worker.setParameters({ tessedit_pageseg_mode: '11' }); }
    return { ...data, lines: lines.map(line => replacements.get(line) || line) };
}

export async function readCardZones(worker, source, { template = false, isCurrent = () => true, onZone = () => {} } = {}) {
    let result = { cin: '', first_name: '', last_name: '', nationality: '' };
    let templateNames = {};
    for (const zone of CARD_ZONES) {
        if (!isCurrent()) break;
        onZone(zone.key);
        await worker.reinitialize(zone.language, 1);
        await worker.setParameters({ tessedit_pageseg_mode: zone.psm, tessedit_char_whitelist: '' });
        const crop = document.createElement('canvas');
        const width = source.width * zone.width, height = source.height * zone.height;
        const scale = Math.min(3, 1600 / width);
        crop.width = Math.round(width * scale); crop.height = Math.round(height * scale);
        crop.getContext('2d').drawImage(source, source.width * zone.x, source.height * zone.y,
            width, height, 0, 0, crop.width, crop.height);
        try {
            const { data: original } = await worker.recognize(crop, {}, { text: true, blocks: true });
            if (!isCurrent()) break;
            let parsed = parseDocument(original.text || '', original.confidence, documentLines(original));
            // Keep labelled fields even if the special template cannot be established.
            if (zone.key !== 'number') result = mergeDocumentReadings(result, parsed, true);
            let refined;
            if (template && zone.key === 'latin') {
                refined = await refineCardNameLines(worker, crop, original, isCurrent);
                if (!isCurrent()) break;
            }
            if (zone.key === 'number' || (template && zone.key === 'latin')) {
                enhanceDocumentCanvas(crop);
                const { data: enhanced } = await worker.recognize(crop, {}, { text: true, blocks: true });
                if (!isCurrent()) break;
                if (zone.key === 'number') {
                    const number = parseCardNumberZone(original);
                    if (number && number === parseCardNumberZone(enhanced)) {
                        result = mergeDocumentReadings(result, { cin: number }, true);
                    }
                } else {
                    const first = parseCardNameRows(refined || original, crop.height);
                    const second = parseCardNameRows(enhanced, crop.height);
                    for (const key of ['first_name', 'last_name']) {
                        if (first[key] && (first[key] === second[key] ||
                            refined?.lines?.some(line => line.text.trim() === first[key] && !documentLines(original).includes(line)))) {
                            templateNames[key] = first[key];
                        }
                    }
                }
            }
        } finally { crop.width = crop.height = 0; }
    }
    // Explicit layout selection and concordant reads establish name roles independently of the number.
    if (template) {
        for (const key of ['first_name', 'last_name']) result[key] ||= templateNames[key] || '';
    }
    return result;
}

export async function createDocumentWorker() {
    if (!window.Tesseract) await loadJS('/ar_visitors/static/lib/ocr/tesseract/tesseract.min.js');
    return window.Tesseract.createWorker('fra+eng+ara', 1, {
        workerPath: '/ar_visitors/static/lib/ocr/tesseract/worker.min.js',
        corePath: '/ar_visitors/static/lib/ocr/core',
        langPath: '/ar_visitors/static/lib/ocr/lang_best',
        workerBlobURL: false,
        cacheMethod: 'none',
    });
}
