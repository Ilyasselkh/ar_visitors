(() => {
    const safetyNotice = document.getElementById('prereg-safety-notice-dialog');
    if (safetyNotice) {
        document.getElementById('prereg-safety-notice-confirm').addEventListener('click', () => safetyNotice.close());
        safetyNotice.showModal();
    }
    const form = document.getElementById('prereg-identity');
    if (!form) return;
    const get = id => document.getElementById(`prereg-${id}`);
    const video = get('video'), photo = get('photo'), preview = get('preview');
    const consent = get('consent'), consentDialog = get('consent-dialog'), details = get('details-dialog');
    const error = get('error');
    const gallery = get('gallery'), oval = get('oval');
    let expanded = false, captureRun = 0;
    let stream, opening, leaving = false;
    if (gallery) {
        const cards = Array.from(gallery.querySelectorAll('.ar_hse_card'));
        const pause = get('gallery-pause');
        let index = 0, timer;
        let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const show = next => {
            index = next;
            cards.forEach((card, i) => {
                const offset = (i - index + cards.length) % cards.length;
                const position = offset === 0 ? 'center' : offset === 1 ? 'next' : offset === cards.length - 1 ? 'previous' : '';
                card.hidden = !position;
                card.disabled = offset === 0;
                card.dataset.position = position;
            });
            if (pause) {
                pause.textContent = paused ? '▶' : 'Ⅱ';
                pause.setAttribute('aria-pressed', String(paused));
            }
        };
        const select = next => { paused = true; show((next + cards.length) % cards.length); };
        cards.forEach((card, i) => card.addEventListener('click', () => select(i)));
        gallery.querySelectorAll('[data-step]').forEach(button => button.addEventListener('click', () => select(index + Number(button.dataset.step))));
        pause?.addEventListener('click', () => { paused = !paused; show(index); });
        const startSlides = () => {
            clearInterval(timer);
            if (cards.length > 1) timer = setInterval(() => {
                if (!paused && !gallery.hidden && !document.hidden && !consentDialog.open) show((index + 1) % cards.length);
            }, 3000);
        };
        show(0);
        startSlides();
        window.addEventListener('pagehide', () => clearInterval(timer));
        window.addEventListener('pageshow', e => { if (e.persisted) startSlides(); });
    }
    const cameraView = active => {
        if (gallery) gallery.hidden = active;
        if (get('camera-area')) get('camera-area').hidden = !active;
    };
    const fit = () => {
        const area = get('camera-area'), frame = get('camera-frame');
        if (!area || !frame) return;
        const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 0;
        const width = ratio ? Math.min(area.clientWidth, area.clientHeight * ratio) : area.clientWidth;
        frame.style.width = `${width}px`;
        const height = ratio ? width / ratio : area.clientHeight;
        frame.style.height = `${height}px`;
        const ovalHeight = Math.min(height * (expanded ? .72 : .56), width * .8 / .75);
        for (const [key, size] of Object.entries({'frame-width': width, 'frame-height': height, 'oval-height': ovalHeight, 'oval-width': ovalHeight * .75})) {
            frame.style.setProperty('--face-' + key, size + 'px');
        }
    };
    const status = active => {
        const badge = get('camera-status');
        if (badge) {
            badge.classList.toggle('is-active', active);
            badge.querySelector('b').textContent = active ? badge.dataset.active : badge.dataset.inactive;
        }
        get('camera').hidden = active || !gallery?.hidden;
        fit();
    };
    const stop = () => { stream?.getTracks().forEach(track => track.stop()); stream = null; video.srcObject = null; status(false); };
    const camera = async () => {
        if (stream?.getVideoTracks().some(track => track.readyState === 'live')) return true;
        if (opening) return opening;
        opening = (async () => {
            try {
                stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: 'user'}, audio: false});
                if (leaving) { stop(); return false; }
                video.srcObject = stream;
                await video.play();
                status(true);
                error.textContent = '';
                return true;
            } catch (_) { stop(); error.textContent = form.dataset.cameraError; return false; }
            finally { opening = null; }
        })();
        return opening;
    };
    let detector;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    async function waitForFace(run) {
        if (!detector) detector = (async () => {
            if (!window.faceapi) await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = '/sttl_face_attendance/static/face-api/dist/face-api.js';
                script.onload = resolve;
                script.onerror = reject;
                document.head.appendChild(script);
            });
            await window.faceapi.nets.tinyFaceDetector.loadFromUri('/sttl_face_attendance/static/face-api/weights/');
            return window.faceapi;
        })().catch(error => { detector = null; throw error; });
        const api = await detector;
        const deadline = Date.now() + 25000;
        let stableAt = 0, anchor;
        while (run === captureRun && !leaving && Date.now() < deadline) {
            const faces = await api.detectAllFaces(video, new api.TinyFaceDetectorOptions());
            const box = faces.length === 1 && faces[0].box;
            const h = Math.min(video.videoHeight * .56, video.videoWidth * .8 / .75), w = h * .75;
            if (box && !document.hidden && box.height >= h * .45 && box.height <= h * 1.1 &&
                box.width >= w * .4 && box.width <= w * 1.1 &&
                Math.abs(box.x + box.width / 2 - video.videoWidth / 2) <= w * .2 &&
                Math.abs(box.y + box.height / 2 - video.videoHeight / 2) <= h * .2) {
                if (!anchor || Math.abs(anchor.x - box.x) > w * .1 || Math.abs(anchor.y - box.y) > h * .1) {
                    anchor = box;
                    stableAt = Date.now();
                }
                if (Date.now() - stableAt >= 2000) return true;
            } else anchor = null;
            await delay(180);
        }
        return false;
    }
    const capture = async () => {
        const run = ++captureRun;
        cameraView(true);
        expanded = false;
        oval?.classList.remove('is-ready');
        fit();
        if (consent.value !== 'yes' || !(await camera())) {
            error.textContent = form.dataset.cameraError;
            return false;
        }
        if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
            error.textContent = form.dataset.captureError;
            return false;
        }
        if (oval) {
            try {
                if (!await waitForFace(run)) throw Error('alignment');
            } catch (_) {
                error.textContent = form.dataset.captureError;
                return false;
            }
        }
        if (leaving || run !== captureRun || consent.value !== 'yes') return false;
        expanded = true;
        oval?.classList.add('is-ready');
        fit();
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 1280 / video.videoWidth);
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        try {
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
            const image = canvas.toDataURL('image/jpeg', .88);
            if (!image.startsWith('data:image/jpeg;base64,') || !image.split(',')[1]) throw Error('empty capture');
            preview.src = image;
            photo.value = image.split(',')[1];
        } catch (_) {
            error.textContent = form.dataset.captureError;
            return false;
        }
        error.textContent = '';
        if (oval) await delay(600);
        if (leaving || run !== captureRun) return false;
        if (!details.open) details.showModal();
        return true;
    };
    get('camera').addEventListener('click', () => get('start').click());
    get('start').addEventListener('click', () => consentDialog.showModal());
    get('refuse').addEventListener('click', () => {
        consent.value = ''; photo.value = ''; preview.removeAttribute('src'); consentDialog.close();
        stop(); cameraView(false);
    });
    get('accept').addEventListener('click', async () => {
        consent.value = 'yes'; consentDialog.close();
        get('start').disabled = true;
        try { await capture(); } finally { get('start').disabled = false; }
    });
    get('close-details').addEventListener('click', () => { details.close(); stop(); cameraView(false); });
    get('retake').addEventListener('click', () => { details.close(); consentDialog.showModal(); });
    form.addEventListener('submit', event => {
        if (!photo.value || consent.value !== 'yes') {
            event.preventDefault(); get('form-error').textContent = form.dataset.required; return;
        }
        // The shared submit handler refreshes CSRF before the browser submits.
    });
    window.addEventListener('pagehide', () => { leaving = true; captureRun++; stop(); });
    window.addEventListener('pageshow', event => {
        if (event.persisted) { leaving = false; form.querySelector('[type=submit]').disabled = false; cameraView(false); }
    });
    video.addEventListener('loadedmetadata', fit);
    video.addEventListener('resize', fit);
    if (typeof ResizeObserver !== 'undefined' && get('camera-area')) {
        const observer = new ResizeObserver(fit);
        observer.observe(get('camera-area'));
        window.addEventListener('pagehide', () => observer.disconnect());
        window.addEventListener('pageshow', event => { if (event.persisted) observer.observe(get('camera-area')); });
    }

})();

(() => {
    const root = document.querySelector('[data-csrf-url]');
    if (!root) return;
    for (const form of root.querySelectorAll('form[method="post"]')) {
        let pending = false, ready = false;
        form.addEventListener('submit', async event => {
            if (event.defaultPrevented || ready) return;
            event.preventDefault();
            if (pending) return;
            pending = true;
            const button = event.submitter;
            if (button) button.disabled = true;
            try {
                const response = await fetch(root.dataset.csrfUrl, {
                    credentials: 'same-origin', cache: 'no-store',
                    headers: {'Accept': 'application/json'},
                });
                if (response.status === 409) { window.location.reload(); return; }
                if (!response.ok) throw Error('session refresh failed');
                const data = await response.json();
                if (!data.csrf_token) throw Error('missing CSRF token');
                form.querySelector('[name="csrf_token"]').value = data.csrf_token;
                ready = true;
                if (button) button.disabled = false;
                form.requestSubmit(button || undefined);
                ready = false;
            } catch (_) {
                // Keep the entered details/photo and allow the user to retry.
                const error = document.getElementById('prereg-form-error') || document.getElementById('prereg-error');
                if (error) error.textContent = root.dataset.sessionError;
            } finally {
                pending = false;
                if (button) button.disabled = false;
            }
        });
    }
})();
