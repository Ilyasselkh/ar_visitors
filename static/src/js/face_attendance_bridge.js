/** @odoo-module **/
import { Component, onMounted, onWillUnmount, useRef, useState, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadJS } from "@web/core/assets";

let modelsReady;
const TRANSLATIONS = {
    fr: { language: "Langue", title: "Reconnaissance faciale", intro: "Présentez un seul visage face à la caméra pour rechercher un visiteur.", enable: "Activer la caméra", recognize: "Reconnaître le visiteur", cin: "Saisir CIN / passeport", checkout: "Marquer une sortie", consentTitle: "Consentement requis", consentPhoto: "En activant la caméra, vous acceptez la capture de votre photo pour la reconnaissance faciale.", consentData: "Votre photo et les données nécessaires à votre visite pourront être enregistrées dans Odoo, conformément à la politique de confidentialité de l'entreprise.", consentCheck: "Je confirme avoir lu et j'accepte l'enregistrement de ma photo et de mes données de visite.", refuse: "Refuser", accept: "J'accepte et continue", recognized: "VISITEUR RECONNU", nationality: "Nationalité :", isYou: "Est-ce bien vous ?", yes: "Oui, c'est moi", no: "Non, ce n'est pas moi", continue: "Continuer", retry: "Refaire la reconnaissance faciale", matched: "Une correspondance a été trouvée. Continuez pour ouvrir le parcours visiteur.", unmatched: "Aucune correspondance fiable. Continuez pour identifier le visiteur par CIN / passeport." },
    en: { language: "Language", title: "Facial recognition", intro: "Present one face to the camera to find a visitor.", enable: "Enable camera", recognize: "Recognize visitor", cin: "Enter ID / passport", checkout: "Check out visitor", consentTitle: "Consent required", consentPhoto: "By enabling the camera, you agree to the capture of your photo for facial recognition.", consentData: "Your photo and the data needed for your visit may be recorded in Odoo, in accordance with the company's privacy policy.", consentCheck: "I confirm that I have read and accept the recording of my photo and visit data.", refuse: "Refuse", accept: "I accept and continue", recognized: "RECOGNIZED VISITOR", nationality: "Nationality:", isYou: "Is this you?", yes: "Yes, this is me", no: "No, this isn't me", continue: "Continue", retry: "Retry facial recognition", matched: "A match was found. Continue to open the visitor journey.", unmatched: "No reliable match. Continue to identify the visitor by ID / passport." },
    es: { language: "Idioma", title: "Reconocimiento facial", intro: "Presente un solo rostro ante la cámara para buscar un visitante.", enable: "Activar cámara", recognize: "Reconocer visitante", cin: "Introducir DNI / pasaporte", checkout: "Registrar salida", consentTitle: "Consentimiento obligatorio", consentPhoto: "Al activar la cámara, acepta la captura de su foto para el reconocimiento facial.", consentData: "Su foto y los datos necesarios para su visita podrán registrarse en Odoo, conforme a la política de privacidad de la empresa.", consentCheck: "Confirmo que he leído y acepto el registro de mi foto y de los datos de mi visita.", refuse: "Rechazar", accept: "Acepto y continúo", recognized: "VISITANTE RECONOCIDO", nationality: "Nacionalidad:", isYou: "¿Es usted?", yes: "Sí, soy yo", no: "No, no soy yo", continue: "Continuar", retry: "Reintentar reconocimiento facial", matched: "Se encontró una coincidencia. Continúe para abrir el recorrido del visitante.", unmatched: "No hay una coincidencia fiable. Continúe para identificar al visitante con DNI / pasaporte." },
    ar: { language: "اللغة", title: "التعرّف على الوجه", intro: "ضع وجهاً واحداً أمام الكاميرا للبحث عن زائر.", enable: "تشغيل الكاميرا", recognize: "التعرّف على الزائر", cin: "إدخال البطاقة / جواز السفر", checkout: "تسجيل المغادرة", consentTitle: "الموافقة مطلوبة", consentPhoto: "بتشغيل الكاميرا، توافق على التقاط صورتك للتعرّف على الوجه.", consentData: "قد تُسجّل صورتك والبيانات اللازمة لزيارتك في أودو وفقاً لسياسة خصوصية الشركة.", consentCheck: "أؤكد أنني قرأت وأوافق على تسجيل صورتي وبيانات زيارتي.", refuse: "رفض", accept: "أوافق وأتابع", recognized: "تم التعرّف على الزائر", nationality: "الجنسية:", isYou: "هل هذا أنت؟", yes: "نعم، هذا أنا", no: "لا، لست أنا", continue: "متابعة", retry: "إعادة التعرّف على الوجه", matched: "تم العثور على تطابق. تابع لفتح مسار الزائر.", unmatched: "لا يوجد تطابق موثوق. تابع لتعريف الزائر بالبطاقة / جواز السفر." },
};
const STATUS_TRANSLATIONS = {
    "fr": {
        "La caméra nécessite HTTPS ou localhost.": "La caméra nécessite HTTPS ou localhost.",
        "Impossible d’accéder à la caméra.": "Impossible d’accéder à la caméra.",
        "La caméra n'a pas été activée : consentement non donné.": "La caméra n'a pas été activée : consentement non donné.",
        "Attendez que la caméra soit prête.": "Attendez que la caméra soit prête.",
        "Présentez le visage du visiteur pour enregistrer sa sortie.": "Présentez le visage du visiteur pour enregistrer sa sortie.",
        "Chargement du moteur facial…": "Chargement du moteur facial…",
        "Plusieurs visages détectés. Présentez une seule personne.": "Plusieurs visages détectés. Présentez une seule personne.",
        "Aucun visage détecté. Regardez la caméra et restez immobile.": "Aucun visage détecté. Regardez la caméra et restez immobile.",
        "Visiteur non reconnu. Vérifiez qu'une visite est en cours, puis réessayez.": "Visiteur non reconnu. Vérifiez qu'une visite est en cours, puis réessayez.",
        "Nouveau visiteur détecté. Ouverture de l'enregistrement…": "Nouveau visiteur détecté. Ouverture de l'enregistrement…",
        "La reconnaissance faciale a échoué. Veuillez réessayer.": "La reconnaissance faciale a échoué. Veuillez réessayer.",
        "Visage tourné. Replacez votre visage face à la caméra.": "Visage tourné. Replacez votre visage face à la caméra.",
        "Enregistrement du nouveau visiteur ouvert.": "Enregistrement du nouveau visiteur ouvert.",
        "Impossible de préparer la sortie pour le moment. Vérifiez qu'une visite est en cours, puis réessayez.": "Impossible de préparer la sortie pour le moment. Vérifiez qu'une visite est en cours, puis réessayez.",
        "Identity not confirmed. Please try again or enter your CIN / passport.": "Identité non confirmée. Réessayez ou saisissez votre CIN / passeport.",
        "Parcours ouvert.": "Parcours ouvert.",
        "Impossible d’ouvrir le parcours. Réessayez avec Continuer.": "Impossible d’ouvrir le parcours. Réessayez avec Continuer."
    },
    "en": {
        "La caméra nécessite HTTPS ou localhost.": "The camera requires HTTPS or localhost.",
        "Impossible d’accéder à la caméra.": "Unable to access the camera.",
        "La caméra n'a pas été activée : consentement non donné.": "The camera was not enabled: consent was not given.",
        "Attendez que la caméra soit prête.": "Wait for the camera to be ready.",
        "Présentez le visage du visiteur pour enregistrer sa sortie.": "Show the visitor’s face to check out.",
        "Chargement du moteur facial…": "Loading facial recognition…",
        "Plusieurs visages détectés. Présentez une seule personne.": "Multiple faces detected. Present one person only.",
        "Aucun visage détecté. Regardez la caméra et restez immobile.": "No face detected. Look at the camera and stay still.",
        "Visiteur non reconnu. Vérifiez qu'une visite est en cours, puis réessayez.": "Visitor not recognized. Check for an active visit, then try again.",
        "Nouveau visiteur détecté. Ouverture de l'enregistrement…": "New visitor detected. Opening registration…",
        "La reconnaissance faciale a échoué. Veuillez réessayer.": "Facial recognition failed. Please try again.",
        "Visage tourné. Replacez votre visage face à la caméra.": "Face turned. Face the camera again.",
        "Enregistrement du nouveau visiteur ouvert.": "New visitor registration opened.",
        "Impossible de préparer la sortie pour le moment. Vérifiez qu'une visite est en cours, puis réessayez.": "Unable to prepare check-out. Check for an active visit, then try again.",
        "Identity not confirmed. Please try again or enter your CIN / passport.": "Identity not confirmed. Please try again or enter your ID / passport.",
        "Parcours ouvert.": "Visitor journey opened.",
        "Impossible d’ouvrir le parcours. Réessayez avec Continuer.": "Unable to open the journey. Try Continue again."
    },
    "es": {
        "La caméra nécessite HTTPS ou localhost.": "La cámara requiere HTTPS o localhost.",
        "Impossible d’accéder à la caméra.": "No se puede acceder a la cámara.",
        "La caméra n'a pas été activée : consentement non donné.": "Cámara desactivada: no se ha dado el consentimiento.",
        "Attendez que la caméra soit prête.": "Espere a que la cámara esté lista.",
        "Présentez le visage du visiteur pour enregistrer sa sortie.": "Muestre el rostro del visitante para registrar su salida.",
        "Chargement du moteur facial…": "Cargando reconocimiento facial…",
        "Plusieurs visages détectés. Présentez une seule personne.": "Se detectaron varios rostros. Presente una sola persona.",
        "Aucun visage détecté. Regardez la caméra et restez immobile.": "No se detectó ningún rostro. Mire a la cámara y permanezca inmóvil.",
        "Visiteur non reconnu. Vérifiez qu'une visite est en cours, puis réessayez.": "Visitante no reconocido. Compruebe que hay una visita activa y reintente.",
        "Nouveau visiteur détecté. Ouverture de l'enregistrement…": "Nuevo visitante detectado. Abriendo registro…",
        "La reconnaissance faciale a échoué. Veuillez réessayer.": "Falló el reconocimiento facial. Inténtelo de nuevo.",
        "Visage tourné. Replacez votre visage face à la caméra.": "Rostro girado. Vuelva a mirar de frente a la cámara.",
        "Enregistrement du nouveau visiteur ouvert.": "Registro del nuevo visitante abierto.",
        "Impossible de préparer la sortie pour le moment. Vérifiez qu'une visite est en cours, puis réessayez.": "No se puede preparar la salida. Compruebe que hay una visita activa y reintente.",
        "Identity not confirmed. Please try again or enter your CIN / passport.": "Identidad no confirmada. Reintente o introduzca su DNI / pasaporte.",
        "Parcours ouvert.": "Recorrido del visitante abierto.",
        "Impossible d’ouvrir le parcours. Réessayez avec Continuer.": "No se puede abrir el recorrido. Pulse Continuar de nuevo."
    },
    "ar": {
        "La caméra nécessite HTTPS ou localhost.": "تتطلب الكاميرا HTTPS أو localhost.",
        "Impossible d’accéder à la caméra.": "تعذر الوصول إلى الكاميرا.",
        "La caméra n'a pas été activée : consentement non donné.": "لم يتم تشغيل الكاميرا لعدم الموافقة.",
        "Attendez que la caméra soit prête.": "انتظر حتى تصبح الكاميرا جاهزة.",
        "Présentez le visage du visiteur pour enregistrer sa sortie.": "ضع وجه الزائر أمام الكاميرا لتسجيل المغادرة.",
        "Chargement du moteur facial…": "جار تحميل التعرف على الوجه…",
        "Plusieurs visages détectés. Présentez une seule personne.": "تم اكتشاف عدة وجوه. يجب وجود شخص واحد فقط.",
        "Aucun visage détecté. Regardez la caméra et restez immobile.": "لم يتم اكتشاف وجه. انظر إلى الكاميرا وابق ثابتاً.",
        "Visiteur non reconnu. Vérifiez qu'une visite est en cours, puis réessayez.": "لم يتم التعرف على الزائر. تحقق من وجود زيارة جارية ثم أعد المحاولة.",
        "Nouveau visiteur détecté. Ouverture de l'enregistrement…": "تم اكتشاف زائر جديد. جار فتح التسجيل…",
        "La reconnaissance faciale a échoué. Veuillez réessayer.": "فشل التعرف على الوجه. يرجى إعادة المحاولة.",
        "Visage tourné. Replacez votre visage face à la caméra.": "الوجه ملتفت. انظر مباشرة إلى الكاميرا.",
        "Enregistrement du nouveau visiteur ouvert.": "تم فتح تسجيل الزائر الجديد.",
        "Impossible de préparer la sortie pour le moment. Vérifiez qu'une visite est en cours, puis réessayez.": "تعذر تجهيز المغادرة. تحقق من وجود زيارة جارية ثم أعد المحاولة.",
        "Identity not confirmed. Please try again or enter your CIN / passport.": "لم يتم تأكيد الهوية. أعد المحاولة أو أدخل رقم البطاقة / جواز السفر.",
        "Parcours ouvert.": "تم فتح مسار الزائر.",
        "Impossible d’ouvrir le parcours. Réessayez avec Continuer.": "تعذر فتح المسار. أعد المحاولة بالضغط على متابعة."
    }
};
for (const language of Object.keys(STATUS_TRANSLATIONS)) Object.assign(TRANSLATIONS[language], STATUS_TRANSLATIONS[language]);
Object.assign(TRANSLATIONS.fr, { consentPhoto: "Après votre confirmation, votre photo sera capturée pour lancer automatiquement la reconnaissance faciale.", consentRefused: "Consentement refusé : aucune reconnaissance ni aucun enregistrement effectué." });
Object.assign(TRANSLATIONS.en, { consentPhoto: "After your confirmation, your photo will be captured to start facial recognition automatically.", consentRefused: "Consent refused: no recognition or recording performed." });
Object.assign(TRANSLATIONS.es, { consentPhoto: "Tras su confirmación, se capturará su foto para iniciar automáticamente el reconocimiento facial.", consentRefused: "Consentimiento rechazado: no se ha realizado reconocimiento ni registro." });
Object.assign(TRANSLATIONS.ar, { consentPhoto: "بعد موافقتك، سيتم التقاط صورتك لبدء التعرّف على الوجه تلقائياً.", consentRefused: "تم رفض الموافقة: لم يتم إجراء التعرّف أو التسجيل." });
Object.assign(TRANSLATIONS.fr, { comparison: "Comparaison des photos :", automaticRetry: "Nouvelle tentative automatique" });
Object.assign(TRANSLATIONS.en, { comparison: "Comparing photos:", automaticRetry: "Automatic retry" });
Object.assign(TRANSLATIONS.es, { comparison: "Comparando fotos:", automaticRetry: "Reintento automático" });
Object.assign(TRANSLATIONS.ar, { comparison: "مقارنة الصور:", automaticRetry: "إعادة المحاولة تلقائياً" });
function loadModels() {
    if (!modelsReady) {
        modelsReady = (async () => {
            if (!window.faceapi) {
                await loadJS("/sttl_face_attendance/static/face-api/dist/face-api.js");
            }
            const root = "/sttl_face_attendance/static/face-api/weights/";
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(root),
                faceapi.nets.faceLandmark68Net.loadFromUri(root),
                faceapi.nets.faceRecognitionNet.loadFromUri(root),
            ]);
        })().catch((error) => { modelsReady = null; throw error; });
    }
    return modelsReady;
}

class VisitorFaceAttendance extends Component {
    static template = xml`
        <div class="ar_face_screen" t-att-dir="isRtl ? 'rtl' : 'ltr'">
            <div class="ar_face_panel">
                <div class="ar_face_heading"><div><span class="ar_face_badge">AR VISITORS</span><h1 t-esc="t('title')"/></div>
                    <div class="ar_face_language"><span t-esc="t('language')"/>
                        <div class="ar_face_language_buttons" role="group" t-att-aria-label="t('language')" dir="ltr">
                            <button t-foreach="languages" t-as="language" t-key="language.code" type="button"
                                class="ar_face_language_button" t-att-class="{ 'active': state.language === language.code }"
                                t-att-aria-pressed="state.language === language.code ? 'true' : 'false'"
                                t-att-disabled="state.busy || state.redirecting" t-on-click="() => this.selectLanguage(language.code)">
                                <img t-att-src="'/ar_visitors/static/src/img/flags/' + language.code + '.svg'" alt=""/>
                                <span t-att-lang="language.code" t-esc="language.label"/>
                            </button>
                        </div>
                    </div>
                </div>
                <p t-esc="t('intro')"/>
                <div class="ar_face_camera">
                    <video t-ref="video" autoplay="autoplay" playsinline="playsinline" muted="muted"/>
                    <div t-if="state.retryMessage" class="ar_face_retry_overlay" role="status" aria-live="polite">
                        <t t-esc="state.retryMessage"/>
                    </div>
                </div>
                <div class="ar_face_controls">
                    <button class="btn btn-primary" t-on-click="beginRecognition" t-att-disabled="state.busy || state.redirecting || state.consentOpen" t-esc="t('recognize')"/>
                    <button class="btn btn-outline-primary" t-on-click="beginCheckout" t-att-disabled="state.busy || state.redirecting || state.consentOpen" t-esc="t('checkout')"/>
                </div>
                <p class="ar_face_status" role="status" t-esc="state.message"/>
                <div t-if="state.consentOpen" class="ar_face_consent_overlay" role="dialog" aria-modal="true" aria-labelledby="ar-face-consent-title">
                    <div class="ar_face_consent_card">
                        <h2 id="ar-face-consent-title" t-esc="t('consentTitle')"/>
                        <p t-esc="t('consentPhoto')"/><p t-esc="t('consentData')"/>
                        <div class="ar_face_consent_actions">
                            <button class="btn btn-danger" t-on-click="cancelCameraConsent" t-esc="t('refuse')"/>
                            <button class="btn btn-success" t-on-click="confirmCameraConsent" t-esc="t('accept')"/>
                        </div>
                    </div>
                </div>
                <div t-if="state.person &amp;&amp; state.mode === 'arrival'" class="ar_face_identity_overlay">
                    <div class="ar_face_identity_card" role="dialog" aria-modal="true" aria-live="polite" aria-label="Identity confirmation">
                        <img t-if="state.person.image" t-att-src="'data:image/jpeg;base64,' + state.person.image" alt="Recognized visitor"/>
                        <div t-else="" class="ar_face_avatar" aria-hidden="true"><t t-esc="initials"/></div>
                        <div class="ar_face_identity_details">
                            <span class="ar_face_identity_label" t-esc="t('recognized')"/>
                            <h2><t t-esc="state.person.first_name"/> <t t-esc="state.person.last_name"/></h2>
                            <p t-if="state.person.nationality"><strong t-esc="t('nationality')"/> <t t-esc="state.person.nationality"/></p>
                            <p class="ar_face_identity_question" t-esc="t('isYou')"/>
                            <div class="ar_face_identity_actions">
                                <button class="btn btn-primary" t-on-click="confirmIdentity" t-att-disabled="state.busy" t-esc="t('yes')"/>
                                <button class="btn btn-outline-secondary" t-on-click="rejectIdentity" t-att-disabled="state.busy" t-esc="t('no')"/>
                            </div>
                        </div>
                    </div>
                </div>
                <div t-if="state.captured &amp;&amp; !state.busy &amp;&amp; !state.person &amp;&amp; state.mode === 'arrival'" class="ar_face_result">
                    <img t-att-src="'data:image/jpeg;base64,' + state.captured" alt="Photo capturée"/>
                    <p t-if="state.match" t-esc="t('matched')"/><p t-else="" t-esc="t('unmatched')"/>
                    <button class="btn btn-primary" t-on-click="continueVisit" t-esc="t('continue')"/>
                </div>
                <div t-if="state.mode === 'checkout' &amp;&amp; state.checkoutError &amp;&amp; !state.busy" class="ar_face_result">
                    <p t-esc="state.message"/>
                    <button class="btn btn-primary" t-on-click="retryCheckoutRecognition" t-esc="t('retry')"/>
                </div>
            </div>
        </div>`;
    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.video = useRef("video");
        this.state = useState({ busy: false, camera: false, redirecting: false, message: "", retryMessage: "", captured: "", match: false, person: false, mode: "arrival", checkoutError: false, consentOpen: false, consentAccepted: false, language: "fr", attempt: 0, attemptLimit: 3, retryDelay: 1.5 });
        this.alive = true;
        onMounted(() => {
            this.startCamera();
            this.startIdleRefresh();
        });
        onWillUnmount(() => {
            this.alive = false;
            this.stopIdleRefresh();
            clearTimeout(this.retryTimer);
            this.stopCamera();
        });
    }
    startIdleRefresh() {
        this.resetIdleRefresh = () => { this.idleSince = Date.now(); };
        this.resetIdleRefresh();
        this.idleEvents = ["pointerdown", "pointermove", "keydown", "input", "touchstart", "wheel"];
        for (const event of this.idleEvents) document.addEventListener(event, this.resetIdleRefresh, true);
        this.checkIdleRefresh();
    }
    stopIdleRefresh() {
        clearTimeout(this.idleRefreshTimer);
        for (const event of this.idleEvents || []) document.removeEventListener(event, this.resetIdleRefresh, true);
    }
    idleRefreshBlocked() {
        return !this.alive || document.hidden || !this.state.camera || this.startingCamera ||
            this.state.busy || this.state.redirecting || this.state.consentOpen ||
            this.cameraConsentGranted || this.state.captured || this.state.person ||
            this.state.checkoutError || this.openingJourney ||
            Boolean(document.querySelector('.modal, [role="dialog"], dialog[open]'));
    }
    async checkIdleRefresh() {
        try {
            if (this.idleRefreshBlocked()) {
                this.idleSince = Date.now();
                return;
            }
            const generation = this.cameraGeneration;
            await loadModels();
            if (this.idleRefreshBlocked() || generation !== this.cameraGeneration || !this.video.el?.videoWidth) {
                this.idleSince = Date.now();
                return;
            }
            // Detect presence only; do not capture a photo or compute descriptors.
            const faces = await faceapi.detectAllFaces(this.video.el, new faceapi.TinyFaceDetectorOptions());
            if (this.idleRefreshBlocked() || generation !== this.cameraGeneration || faces.length) {
                this.idleSince = Date.now();
                return;
            }
            if (Date.now() - this.idleSince >= 180000) {
                this.state.redirecting = true;
                window.location.reload();
            }
        } catch (_) {
            // Unknown presence must never interrupt a visitor.
            this.idleSince = Date.now();
        } finally {
            if (this.alive && !this.state.redirecting) {
                this.idleRefreshTimer = setTimeout(() => this.checkIdleRefresh(), 1000);
            }
        }
    }
    stopCamera() {
        clearTimeout(this.retryTimer);
        this.cameraGeneration = (this.cameraGeneration || 0) + 1;
        this.cameraConsentGranted = false;
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.state.camera = false;
    }
    async startCamera() {
        if (this.state.busy || this.state.redirecting || this.startingCamera || this.state.camera) return;
        this.startingCamera = true;
        this.state.consentAccepted = false;
        this.state.consentOpen = false;
        this.state.message = "";
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error(this.t("La caméra nécessite HTTPS ou localhost."));
            }
            this.stopCamera();
            const generation = this.cameraGeneration;
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
            if (!this.alive || generation !== this.cameraGeneration) { stream.getTracks().forEach((t) => t.stop()); return; }
            this.stream = stream;
            this.video.el.srcObject = stream;
            await this.video.el.play();
            if (!this.alive || generation !== this.cameraGeneration) return;
            this.state.camera = true;
        } catch (error) {
            this.stopCamera();
            this.state.message = error.message || this.t("Impossible d’accéder à la caméra.");
        } finally {
            this.startingCamera = false;
        }
    }
    t(key) { return TRANSLATIONS[this.state.language]?.[key] || TRANSLATIONS.fr[key] || key; }
    get languages() {
        return [{ code: "fr", label: "Français" }, { code: "en", label: "English" },
            { code: "es", label: "Español" }, { code: "ar", label: "العربية" }];
    }
    selectLanguage(language) {
        if (this.state.busy || this.state.redirecting || !TRANSLATIONS[language]) return;
        this.state.language = language;
        this.state.message = "";
        this.state.retryMessage = "";
    }
    get languageContext() {
        return { lang: { fr: "fr_FR", en: "en_US", es: "es_ES", ar: "ar_001" }[this.state.language || "fr"],
            default_language: this.state.language || "fr", visitor_language_selected: true };
    }
    get isRtl() { return this.state.language === "ar"; }
    async confirmCameraConsent() {
        if (!this.alive || this.state.redirecting || this.state.busy || !this.state.camera || !this.state.consentOpen) return;
        this.state.consentOpen = false;
        this.cameraConsentGranted = true;
        await this.capture();
    }
    cancelCameraConsent() {
        if (this.state.redirecting) return;
        this.state.redirecting = true;
        this.state.consentOpen = false;
        this.state.consentAccepted = false;
        this.stopCamera();
        this.state.message = this.t('consentRefused');
        window.location.reload();
    }
    async capture() {
        if (!this.alive || this.state.busy || this.state.redirecting || !this.state.camera || !this.cameraConsentGranted) return;
        const video = this.video.el;
        if (!video.videoWidth) { this.state.message = this.t("Attendez que la caméra soit prête."); return; }
        clearTimeout(this.retryTimer);
        this.state.attempt = 0;
        try {
            this.state.attemptLimit = await this.orm.call("ar.visitor.face.bridge", "recognition_attempt_limit", []);
        } catch (_) { this.state.attemptLimit = 3; }
        try {
            this.state.retryDelay = await this.orm.call("ar.visitor.face.bridge", "recognition_retry_delay", []);
        } catch (_) { this.state.retryDelay = 1.5; }
        await this.recognize(video, true);
    }
    async beginRecognition() {
        await this.requestRecognition("arrival");
    }
    async beginCheckout() {
        await this.requestRecognition("checkout");
    }
    async requestRecognition(mode) {
        if (!this.alive || this.state.busy || this.state.redirecting || this.state.consentOpen) return;
        clearTimeout(this.retryTimer);
        if (!this.state.camera) await this.startCamera();
        if (!this.alive || !this.state.camera) return;
        this.state.mode = mode;
        this.state.captured = "";
        this.state.match = false;
        this.state.person = false;
        this.state.checkoutError = false;
        this.state.retryMessage = "";
        this.state.attempt = 0;
        this.cameraConsentGranted = false;
        this.state.consentAccepted = false;
        this.state.consentOpen = true;
        this.state.message = "";
    }
    async recognize(source, fromCamera = false) {
        let monitor;
        if (!this.cameraConsentGranted || this.state.busy || this.state.redirecting) return;
        this.state.busy = true; this.state.captured = ""; this.state.match = false; this.state.person = false; this.state.checkoutError = false;
        this.state.retryMessage = "";
        this.state.attempt += 1;
        this.state.message = this.t("Chargement du moteur facial…");
        try {
            await loadModels();
            if (!this.alive) return;
            const options = new faceapi.TinyFaceDetectorOptions();
            // Freeze the frame so recognition and the saved photo refer to the same image.
            const canvas = document.createElement("canvas");
            const width = source.videoWidth || source.naturalWidth;
            const height = source.videoHeight || source.naturalHeight;
            const scale = Math.min(1, 1280 / Math.max(width, height));
            canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
            canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
            const detected = await faceapi.detectAllFaces(canvas, options).withFaceLandmarks().withFaceDescriptors();
            if (detected.length !== 1) {
                const reason = detected.length ? this.t("Plusieurs visages détectés. Présentez une seule personne.") : this.t("Aucun visage détecté. Regardez la caméra et restez immobile.");
                if (this.scheduleRetry(reason)) return;
                this.state.message = reason;
                this.state.checkoutError = this.state.mode === "checkout";
                return;
            }
            const distances = [];
            if (!this.alive) return;
            const reason = this.facePositionReason(detected);
            if (reason) throw Object.assign(new Error(reason), { retryReason: reason });
            if (fromCamera) monitor = this.monitorFacePosition(source, options);
            let after = 0, count = 0;
            do {
                const batch = await this.orm.call("ar.visitor.face.bridge", "reference_photos", [after]);
                monitor?.assertValid();
                for (const person of batch.people) {
                    if (!this.alive) return;
                    let best = Infinity;
                    for (const data of person.images) {
                        monitor?.assertValid();
                        try {
                            const image = await faceapi.bufferToImage(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))]));
                            const refs = await faceapi.detectAllFaces(image, options).withFaceLandmarks().withFaceDescriptors();
                            if (refs.length === 1) best = Math.min(best, faceapi.euclideanDistance(detected[0].descriptor, refs[0].descriptor));
                        } catch (_) { /* An unusable reference must not prevent checking the other photos. */ }
                    }
                    monitor?.assertValid();
                    if (Number.isFinite(best)) distances.push({ id: person.id, distance: best });
                    this.state.message = this.t("comparison") + " " + (++count) + "…";
                }
                after = batch.next_id;
            } while (after && this.alive);
            if (!this.alive) return;
            await monitor?.stop();
            monitor?.assertValid();
            if (!this.alive) return;
            if (fromCamera) {
                const currentFaces = await faceapi.detectAllFaces(source, options).withFaceLandmarks();
                if (!this.alive) return;
                const currentReason = this.facePositionReason(currentFaces);
                if (currentReason) throw Object.assign(new Error(currentReason), { retryReason: currentReason });
            }
            distances.sort((a,b) => a.distance-b.distance);
            const first = distances[0], second = distances[1];
            // Same threshold as the installed module, with an ambiguity margin.
            this.state.match = first && first.distance < 0.45 && (!second || second.distance-first.distance >= 0.05) ? first.id : false;
            this.state.captured = canvas.toDataURL("image/jpeg", .9).split(",")[1];
            if (this.state.match) {
                if (this.state.mode === "checkout") {
                    await this.openCheckout(this.state.match);
                    return;
                }
                this.state.message = "";
                this.state.person = await this.orm.call("ar.visitor.face.bridge", "recognition_person", [this.state.match], { context: this.languageContext });
            } else {
                if (this.state.mode === "checkout") {
                    this.state.message = this.t("Visiteur non reconnu. Vérifiez qu'une visite est en cours, puis réessayez.");
                    this.state.checkoutError = true;
                    this.state.captured = "";
                    return;
                }
                // A valid, front-facing face without a match is a new visitor.
                // Retries are deliberately reserved for capture/detection issues.
                this.state.message = this.t("Nouveau visiteur détecté. Ouverture de l'enregistrement…");
                await this.openNewVisitorJourney();
                return;
            }
        } catch (error) {
            await monitor?.stop();
            if (!this.alive) return;
            if (error.retryReason) {
                this.state.captured = "";
                this.state.match = false;
                if (this.scheduleRetry(error.retryReason)) return;
            }
            this.state.message = this.safeErrorMessage(error, this.t("La reconnaissance faciale a échoué. Veuillez réessayer."));
            this.state.checkoutError = this.state.mode === "checkout";
        } finally {
            await monitor?.stop();
            this.state.busy = false;
        }
    }
    facePositionReason(faces) {
        if (faces.length !== 1) {
            return faces.length ? this.t("Plusieurs visages détectés. Présentez une seule personne.") : this.t("Aucun visage détecté. Regardez la caméra et restez immobile.");
        }
        const landmarks = faces[0].landmarks;
        const center = (points) => points.reduce((sum, p) => ({ x: sum.x + p.x / points.length, y: sum.y + p.y / points.length }), { x: 0, y: 0 });
        const left = center(landmarks.getLeftEye()), right = center(landmarks.getRightEye());
        const nose = landmarks.getNose()[3];
        const dx = right.x - left.x, dy = right.y - left.y;
        const eyeDistanceSquared = dx * dx + dy * dy;
        // Project onto the eye line, independently of image size and head tilt.
        const noseOffset = ((nose.x - (left.x + right.x) / 2) * dx + (nose.y - (left.y + right.y) / 2) * dy) / eyeDistanceSquared;
        // Also check the visible cheeks: the nose alone can remain nearly centered
        // when landmarks are estimated on a partially turned face.
        const jaw = landmarks.getJawOutline();
        const project = (point) => ((point.x - nose.x) * dx + (point.y - nose.y) * dy) / eyeDistanceSquared;
        const leftCheek = -project(jaw[0]), rightCheek = project(jaw[16]);
        const cheekAsymmetry = Math.abs(leftCheek - rightCheek) / (leftCheek + rightCheek);
        if (!Number.isFinite(noseOffset) || Math.abs(noseOffset) > 0.18
            || !Number.isFinite(cheekAsymmetry) || leftCheek <= 0 || rightCheek <= 0 || cheekAsymmetry > 0.2) {
            return this.t("Visage tourné. Replacez votre visage face à la caméra.");
        }
        return "";
    }
    monitorFacePosition(source, options) {
        let stopped = false, timer, pending, failure;
        const check = async () => {
            try {
                const faces = await faceapi.detectAllFaces(source, options).withFaceLandmarks();
                const reason = this.facePositionReason(faces);
                if (reason) failure = Object.assign(new Error(reason), { retryReason: reason });
            } catch (error) {
                failure = error;
            }
            // Keep the attempt invalid even if the visitor faces the camera again.
            if (!stopped && !failure && this.alive && this.state.camera) {
                timer = setTimeout(() => { pending = check(); }, 250);
            }
        };
        pending = check();
        return {
            assertValid() { if (failure) throw failure; },
            async stop() {
                stopped = true;
                clearTimeout(timer);
                await pending;
            },
        };
    }
    scheduleRetry(reason) {
        if (!this.alive || !this.state.camera || this.state.attempt >= this.state.attemptLimit) return false;
        this.state.retryMessage = `${this.t("automaticRetry")} (${this.state.attempt + 1}/${this.state.attemptLimit})…`;
        this.state.message = reason;
        this.retryTimer = setTimeout(() => {
            if (this.alive && this.state.camera && !this.state.busy) this.recognize(this.video.el, true);
        }, this.state.retryDelay * 1000);
        return true;
    }
    get initials() {
        const person = this.state.person;
        return person ? `${person.first_name?.[0] || ""}${person.last_name?.[0] || ""}`.toUpperCase() : "";
    }
    async confirmIdentity() {
        await this.continueVisit();
    }
    async openNewVisitorJourney() {
        const action = await this.orm.call("ar.visitor.face.bridge", "start_visit", [this.state.captured, false, this.state.language || "fr"], { context: this.languageContext });
        if (!this.alive) return;
        await this.action.doAction(action);
        if (this.alive) {
            this.state.captured = "";
            this.state.message = this.t("Enregistrement du nouveau visiteur ouvert.");
        }
    }
    async openCheckout(personId) {
        try {
            const action = await this.orm.call("ar.visitor.face.bridge", "checkout_for_person", [personId, this.state.language || "fr"], { context: this.languageContext });
            if (!this.alive) return;
            await this.action.doAction(action);
        } catch (error) {
            if (!this.alive) return;
            this.state.captured = "";
            this.state.match = false;
            this.state.message = this.checkoutErrorMessage(error);
            this.state.checkoutError = true;
        }
    }
    checkoutErrorMessage(error) {
        return this.safeErrorMessage(
            error,
            this.t("Impossible de préparer la sortie pour le moment. Vérifiez qu'une visite est en cours, puis réessayez.")
        );
    }
    safeErrorMessage(error, fallback) {
        if (["odoo.exceptions.UserError", "odoo.exceptions.ValidationError", "odoo.exceptions.AccessError"].includes(error?.data?.name)) {
            return error.data.message || fallback;
        }
        const message = error?.message || "";
        return message && !/odoo server error/i.test(message) ? message : fallback;
    }
    async retryCheckoutRecognition() {
        if (this.state.busy) return;
        this.state.captured = "";
        this.state.match = false;
        this.state.person = false;
        this.state.checkoutError = false;
        this.state.attempt = 0;
        await this.requestRecognition("checkout");
    }
    rejectIdentity() {
        if (this.state.busy) return;
        this.state.person = false;
        this.state.match = false;
        this.state.captured = "";
        this.state.message = this.t("Identity not confirmed. Please try again or enter your CIN / passport.");
    }
    async continueVisit() {
        if (!this.alive || this.state.busy || this.openingJourney || !this.state.captured) return;
        this.openingJourney = true;
        this.state.busy = true;
        try {
            const action = await this.orm.call("ar.visitor.face.bridge", "start_visit", [this.state.captured, this.state.match || false, this.state.language || "fr"], { context: this.languageContext });
            if (!this.alive) return;
            await this.action.doAction(action);
            if (this.alive) {
                this.state.captured = "";
                this.state.person = false;
                this.state.message = this.t("Parcours ouvert.");
            }
        } catch (error) {
            if (this.alive) this.state.message = this.safeErrorMessage(error, this.t("Impossible d’ouvrir le parcours. Réessayez avec Continuer."));
        } finally {
            this.openingJourney = false;
            if (this.alive) { this.state.busy = false; this.state.redirecting = false; }
        }
    }
    async manual() {
        if (this.state.busy || this.state.redirecting) return;
        await this.action.doAction("ar_visitors.action_ar_visitor_identify", { additionalContext: this.languageContext });
    }
}
registry.category("actions").add("ar_visitors.face_attendance", VisitorFaceAttendance);
