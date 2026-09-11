(() => {
    const input = document.getElementById("ar-photo-upload");
    const preview = document.getElementById("ar-photo-preview");
    if (!input || !preview) return;
    let url;
    input.addEventListener("change", () => {
        if (url) URL.revokeObjectURL(url);
        const file = input.files[0];
        preview.hidden = !file;
        if (file) { url = URL.createObjectURL(file); preview.src = url; }
        else preview.removeAttribute("src");
    });
})();
