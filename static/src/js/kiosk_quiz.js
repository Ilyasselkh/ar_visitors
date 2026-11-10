(() => {
    const dialog = document.getElementById('ar-quiz-dialog');
    if (!dialog) return;
    const frame = dialog.querySelector('iframe');
    const open = document.getElementById('ar-open-quiz');
    const close = document.getElementById('ar-close-quiz');
    let quizLoaded = false;
    frame.addEventListener('load', () => {
        quizLoaded = true;
        if (!dialog.open) dialog.showModal();
        try {
            const quizDocument = frame.contentDocument;
            const quizWindow = frame.contentWindow;
            quizDocument.body.classList.add('ar_visitor_quiz');
            let pending;
            const fit = () => {
                quizWindow.cancelAnimationFrame(pending);
                pending = quizWindow.requestAnimationFrame(() => {
                    const page = quizDocument.querySelector('.o_survey_page_per_question');
                    if (!page) return;
                    const choices = page.querySelector('.o_survey_form_choice:has(.o_survey_choice_img)');
                    if (!choices) return;
                    const count = choices.children.length;
                    const columns = Math.min(count, quizWindow.innerWidth < 600 ? 2 : 4);
                    choices.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
                    const rows = Math.ceil(count / columns);
                    const reserved = quizWindow.innerHeight < 400 ? 150 : 240;
                    let height = Math.max(60, Math.floor((quizWindow.innerHeight - reserved) / rows));
                    quizDocument.body.style.setProperty('--ar-quiz-image-height', `${height}px`);
                    const background = quizDocument.querySelector('.o_survey_background');
                    if (background) {
                        const overflow = background.scrollHeight - background.clientHeight;
                        if (overflow > 0) {
                            height = Math.max(40, height - Math.ceil(overflow / rows) - 8);
                            quizDocument.body.style.setProperty('--ar-quiz-image-height', `${height}px`);
                        }
                        background.scrollTop = 0;
                    }
                    quizDocument.scrollingElement.scrollTop = 0;
                });
            };
            const observer = new quizWindow.MutationObserver(fit);
            observer.observe(quizDocument.body, { childList: true, subtree: true });
            quizWindow.addEventListener('resize', fit);
            quizDocument.addEventListener('load', fit, true);
            fit();
        } catch (_) { /* Same-origin quiz only. */ }
    });
    let timer;
    let submitting = false;
    const poll = async () => {
        if (submitting) return;
        try {
            const response = await fetch(dialog.dataset.statusUrl, {cache: 'no-store'});
            if (!response.ok) { clearInterval(timer); return; }
            const data = await response.json();
            if (!submitting && data.state !== 'quiz_pending') window.location.reload();
        } catch (_) { /* Retry after a temporary network interruption. */ }
    };
    open.addEventListener('click', () => {
        if (!frame.getAttribute('src')) frame.src = open.dataset.quizUrl;
        if (quizLoaded && !dialog.open) dialog.showModal();
        clearInterval(timer);
        timer = setInterval(poll, 3000);
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { clearInterval(timer); open.focus(); });
    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin || event.source !== frame.contentWindow) return;
        if (event.data === 'ar-visitors-quiz-submitting') submitting = true;
        if (event.data === 'ar-visitors-quiz-ready') { submitting = false; poll(); }
        if (event.origin === window.location.origin && event.source === frame.contentWindow
            && event.data === 'ar-visitors-quiz-completed') poll();
    });
    open.click();
})();
