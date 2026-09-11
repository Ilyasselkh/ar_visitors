(() => {
    const canvas = document.getElementById("ar-entry-signature");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const value = document.getElementById("ar-entry-signature-value");
    const error = document.getElementById("ar-signature-error");
    let drawing = false, signed = false;
    ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.strokeStyle = "#172338";
    const point = (e) => {
        const r = canvas.getBoundingClientRect();
        return [(e.clientX-r.left)*canvas.width/r.width, (e.clientY-r.top)*canvas.height/r.height];
    };
    canvas.addEventListener("pointerdown", (e) => {
        drawing = true; canvas.setPointerCapture(e.pointerId);
        ctx.beginPath(); ctx.moveTo(...point(e));
    });
    canvas.addEventListener("pointermove", (e) => {
        if (!drawing) return;
        ctx.lineTo(...point(e)); ctx.stroke(); signed = true; error.hidden = true;
    });
    const end = () => { drawing = false; if (signed) value.value = canvas.toDataURL("image/png").split(",")[1]; };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    document.getElementById("ar-clear-signature").addEventListener("click", () => {
        ctx.clearRect(0,0,canvas.width,canvas.height); value.value = ""; signed = false;
    });
    canvas.closest("form").addEventListener("submit", (e) => {
        if (!signed) { e.preventDefault(); error.hidden = false; canvas.scrollIntoView({block:"center"}); }
    });
})();
