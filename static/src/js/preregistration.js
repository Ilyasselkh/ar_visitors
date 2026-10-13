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
    let stream, opening, leaving = false;
    const fit = () => {
        const area = get('camera-area'), frame = get('camera-frame');
        if (!area || !frame) return;
        const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 0;
        const width = ratio ? Math.min(area.clientWidth, area.clientHeight * ratio) : area.clientWidth;
        frame.style.width = `${width}px`;
        frame.style.height = `${ratio ? width / ratio : area.clientHeight}px`;
    };
    const status = active => {
        const badge = get('camera-status');
        if (badge) {
            badge.classList.toggle('is-active', active);
            badge.querySelector('b').textContent = active ? badge.dataset.active : badge.dataset.inactive;
            get('corners').hidden = !active;
        }
        get('camera').hidden = active;
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
    const capture = async () => {
        if (consent.value !== 'yes' || !(await camera())) {
            error.textContent = form.dataset.cameraError;
            return false;
        }
        if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
            error.textContent = form.dataset.captureError;
            return false;
        }
        if (leaving || consent.value !== 'yes') return false;
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
        if (!details.open) details.showModal();
        return true;
    };
    get('camera').addEventListener('click', camera);
    get('start').addEventListener('click', () => consentDialog.showModal());
    get('refuse').addEventListener('click', () => {
        consent.value = ''; photo.value = ''; preview.removeAttribute('src'); consentDialog.close();
    });
    get('accept').addEventListener('click', async () => {
        consent.value = 'yes'; consentDialog.close();
        get('start').disabled = true;
        try { await capture(); } finally { get('start').disabled = false; }
    });
    get('close-details').addEventListener('click', () => details.close());
    get('retake').addEventListener('click', () => { details.close(); consentDialog.showModal(); });
    form.addEventListener('submit', event => {
        if (!photo.value || consent.value !== 'yes') {
            event.preventDefault(); get('form-error').textContent = form.dataset.required; return;
        }
        // The shared submit handler refreshes CSRF before the browser submits.
    });
    window.addEventListener('pagehide', () => { leaving = true; stop(); });
    window.addEventListener('pageshow', event => {
        if (event.persisted) { leaving = false; form.querySelector('[type=submit]').disabled = false; camera(); }
    });
    video.addEventListener('loadedmetadata', fit);
    video.addEventListener('resize', fit);
    if (typeof ResizeObserver !== 'undefined' && get('camera-area')) {
        const observer = new ResizeObserver(fit);
        observer.observe(get('camera-area'));
        window.addEventListener('pagehide', () => observer.disconnect());
        window.addEventListener('pageshow', event => { if (event.persisted) observer.observe(get('camera-area')); });
    }
    // Local preview only; no photo is captured or submitted before acceptance.
    camera();
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
