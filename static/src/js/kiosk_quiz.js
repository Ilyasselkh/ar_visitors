(() => {
    const languageDialog = document.getElementById('ar-language-dialog');
    if (languageDialog) {
        languageDialog.addEventListener('cancel', (event) => event.preventDefault());
        if (typeof languageDialog.showModal === 'function') {
            // Server-rendered open state keeps the choices available without JS.
            languageDialog.close();
            languageDialog.showModal();
        }
    }
    const dialog = document.getElementById('ar-quiz-dialog');
    if (!dialog) return;
    const frame = dialog.querySelector('iframe');
    const open = document.getElementById('ar-open-quiz');
    const close = document.getElementById('ar-close-quiz');
    let timer;
    const poll = async () => {
        try {
            const response = await fetch(dialog.dataset.statusUrl, {cache: 'no-store'});
            if (!response.ok) { clearInterval(timer); return; }
            const data = await response.json();
            if (data.state !== 'quiz_pending') window.location.reload();
        } catch (_) { /* Retry after a temporary network interruption. */ }
    };
    open.addEventListener('click', () => {
        if (!frame.getAttribute('src')) frame.src = open.dataset.quizUrl;
        dialog.showModal();
        clearInterval(timer);
        timer = setInterval(poll, 3000);
    });
    close.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { clearInterval(timer); open.focus(); });
    window.addEventListener('message', (event) => {
        if (event.origin === window.location.origin && event.source === frame.contentWindow
            && event.data === 'ar-visitors-quiz-completed') poll();
    });
    open.click();
})();
