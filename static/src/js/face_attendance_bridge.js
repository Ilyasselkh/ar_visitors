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
Object.assign(TRANSLATIONS.fr, { closeVisit: "Clôturer", openVisit: "Ce visiteur possède déjà une visite en cours." });
Object.assign(TRANSLATIONS.en, { closeVisit: "Close visit", openVisit: "This visitor already has an active visit." });
Object.assign(TRANSLATIONS.es, { closeVisit: "Cerrar visita", openVisit: "Este visitante ya tiene una visita en curso." });
Object.assign(TRANSLATIONS.ar, { closeVisit: "إنهاء الزيارة", openVisit: "لدى هذا الزائر زيارة جارية بالفعل." });
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
Object.assign(TRANSLATIONS.fr, {startVisit: "Enregistrer une entrée", finishVisit: "Enregistrer une sortie", profile: "Renseigner votre fiche visiteur", safety: "Prendre connaissance des consignes de sécurité", home: "Retour à l’accueil", confirmExit: "Valider ma sortie"});
Object.assign(TRANSLATIONS.en, {startVisit: "Check in", finishVisit: "Check out", profile: "Complete your visitor profile", safety: "Read the safety instructions", home: "Return to reception", confirmExit: "Confirm check-out"});
Object.assign(TRANSLATIONS.es, {startVisit: "Registrar entrada", finishVisit: "Registrar salida", profile: "Completar su ficha de visitante", safety: "Consultar las instrucciones de seguridad", home: "Volver al inicio", confirmExit: "Confirmar salida"});
Object.assign(TRANSLATIONS.ar, {startVisit: "تسجيل الدخول", finishVisit: "تسجيل المغادرة", profile: "استكمال بطاقة الزائر", safety: "الاطلاع على تعليمات السلامة", home: "العودة للرئيسية", confirmExit: "تأكيد المغادرة"});
Object.assign(TRANSLATIONS.fr, {viewImage: "Agrandir l’image", closeImage: "Fermer l’image"});
Object.assign(TRANSLATIONS.en, {viewImage: "Enlarge image", closeImage: "Close image"});
Object.assign(TRANSLATIONS.es, {viewImage: "Ampliar imagen", closeImage: "Cerrar imagen"});
Object.assign(TRANSLATIONS.ar, {viewImage: "تكبير الصورة", closeImage: "إغلاق الصورة"});
Object.assign(TRANSLATIONS.fr, {nextSafety: "Consigne suivante", safetyStep: "Consigne", safetyRequired: "Parcourez toutes les consignes pour revenir à l’accueil."});
Object.assign(TRANSLATIONS.en, {nextSafety: "Next instruction", safetyStep: "Instruction", safetyRequired: "View all instructions before returning to reception."});
Object.assign(TRANSLATIONS.es, {nextSafety: "Siguiente instrucción", safetyStep: "Instrucción", safetyRequired: "Consulte todas las instrucciones antes de volver al inicio."});
Object.assign(TRANSLATIONS.ar, {nextSafety: "التعليمة التالية", safetyStep: "التعليمة", safetyRequired: "اطّلع على جميع التعليمات قبل العودة إلى الصفحة الرئيسية."});
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

Object.assign(TRANSLATIONS.fr, {
    welcome: "Bienvenue chez ARaymond",
    welcomeIntro: "Nous sommes heureux de vous accueillir sur notre site. Pour préparer votre visite dans les meilleures conditions, laissez-vous guider par notre système d’accueil des visiteurs.",
    welcomeSteps: "Identifiez-vous, renseignez les informations nécessaires et prenez connaissance de nos consignes de sécurité. Votre contact sera informé de votre arrivée une fois votre enregistrement terminé.",
    welcomeClosing: "Merci de votre coopération et bonne visite !",
});
Object.assign(TRANSLATIONS.en, {
    welcome: "Welcome to ARaymond",
    welcomeIntro: "We are pleased to welcome you to our site. To help you prepare for your visit, let our visitor reception system guide you through each step.",
    welcomeSteps: "Identify yourself, provide the required information and read our safety instructions. Your host will be notified of your arrival once your registration is complete.",
    welcomeClosing: "Thank you for your cooperation. Enjoy your visit!",
});
Object.assign(TRANSLATIONS.es, {
    welcome: "Bienvenido a ARaymond",
    welcomeIntro: "Nos complace darle la bienvenida a nuestras instalaciones. Para preparar su visita en las mejores condiciones, déjese guiar por nuestro sistema de recepción de visitantes.",
    welcomeSteps: "Identifíquese, facilite la información necesaria y consulte nuestras instrucciones de seguridad. Su contacto será informado de su llegada una vez completado el registro.",
    welcomeClosing: "¡Gracias por su colaboración y disfrute de su visita!",
});
Object.assign(TRANSLATIONS.ar, {
    welcome: "مرحباً بكم في ARaymond",
    welcomeIntro: "يسعدنا استقبالكم في موقعنا. لتحضير زيارتكم في أفضل الظروف، سيرشدكم نظام استقبال الزوار خلال جميع الخطوات.",
    welcomeSteps: "يرجى التعريف بأنفسكم وإدخال المعلومات المطلوبة والاطلاع على تعليمات السلامة. سيتم إبلاغ الشخص الذي ستزورونه بوصولكم بعد إتمام التسجيل.",
    welcomeClosing: "شكراً لتعاونكم، ونتمنى لكم زيارة موفقة!",
});

const WELCOME_UI = {
    fr: ["Accueil visiteurs", "Votre visite, en toute simplicité.", "Un parcours en trois étapes", "Identification", "Présentez-vous à la caméra.", "Sécurité", "Découvrez nos consignes de sécurité.", "Enregistrement", "Enregistrez votre entrée ou votre sortie.", "Enregistrer une entrée", "Enregistrer une sortie", "Caméra active", "Caméra inactive", "Placez votre visage au centre du cadre", "01 / IDENTIFICATION"],
    en: ["Visitor reception", "Your visit, made simple.", "A journey in three steps", "Identification", "Face the camera to begin.", "Safety", "Read our safety guidelines.", "Registration", "Complete your registration and notify your host.", "Start my visit", "Check out", "Camera active", "Camera inactive", "Position your face in the centre of the frame", "01 / IDENTIFICATION"],
    es: ["Recepción de visitantes", "Su visita, con total sencillez.", "Un recorrido en tres pasos", "Identificación", "Sitúese frente a la cámara.", "Seguridad", "Consulte las instrucciones de seguridad.", "Registro", "Finalice el registro y avise a su contacto.", "Comenzar mi visita", "Registrar mi salida", "Cámara activa", "Cámara inactiva", "Coloque su rostro en el centro del encuadre", "01 / IDENTIFICACIÓN"],
    ar: ["استقبال الزوار", "زيارتكم، بكل سهولة.", "مسار من ثلاث خطوات", "التعريف بالهوية", "قف أمام الكاميرا للبدء.", "السلامة", "اطلع على تعليمات السلامة.", "التسجيل", "أكمل تسجيل زيارتك وأبلغ الشخص الذي ستزوره.", "بدء زيارتي", "تسجيل مغادرتي", "الكاميرا مفعّلة", "الكاميرا غير مفعّلة", "ضع وجهك في وسط الإطار", "01 / التعريف بالهوية"],
};
for (const [language, values] of Object.entries(WELCOME_UI)) {
    ["reception", "welcomeTagline", "journeyTitle", "stepIdentity", "stepIdentityText", "stepSafety", "stepSafetyText", "stepRegistration", "stepRegistrationText", "startVisit", "finishVisit", "cameraActive", "cameraInactive", "cameraGuide", "identificationStep"].forEach((key, index) => {
        TRANSLATIONS[language][key] = values[index];
    });
}

Object.assign(TRANSLATIONS.fr, {
    consentCaptureHint: "Si l’image n’est pas captée, relancez la reconnaissance et reculez légèrement votre visage.",
});
Object.assign(TRANSLATIONS.en, {
    consentParagraphs: [
        "To make access to our site easier and faster during your visits, we have introduced a facial recognition system dedicated to managing visitor access.",
        "After your confirmation, your captured photo and the information needed to identify you as a visitor will be recorded in our system in accordance with the company's privacy policy.",
        "This data will be retained to simplify your future visits and enable automatic recognition when you arrive at the site. It will be used exclusively to manage access to the site and will not be used for any other purpose.",
        "Access to this information is strictly limited to authorized persons according to defined access levels. The data is protected by appropriate security measures ensuring its confidentiality, integrity and protection against unauthorized access.",
        "By clicking “I accept and continue”, you consent to the recording and use of your photo and data under the conditions described above.",
        "If you do not wish to give your consent, please select “Refuse”. You can then access the site by following the alternative manual procedure provided for visitors.",
    ],
    consentCaptureHint: "If the image is not captured, restart recognition and move your face slightly farther back.",
});
Object.assign(TRANSLATIONS.es, {
    consentParagraphs: [
        "Para facilitar y agilizar su acceso a nuestras instalaciones durante sus visitas, hemos implementado un sistema de reconocimiento facial dedicado a la gestión del acceso de visitantes.",
        "Tras su confirmación, se capturará su foto y la información necesaria para identificarle como visitante se registrará en nuestro sistema de acuerdo con la política de privacidad de la empresa.",
        "Estos datos se conservarán para simplificar sus futuras visitas y permitir el reconocimiento automático a su llegada a las instalaciones. Se utilizarán exclusivamente para gestionar el acceso a las instalaciones y no se destinarán a ningún otro uso.",
        "El acceso a esta información está estrictamente limitado a las personas autorizadas según los niveles de acceso definidos. Los datos están protegidos mediante medidas de seguridad adecuadas que garantizan su confidencialidad, su integridad y su protección frente a cualquier acceso no autorizado.",
        "Al hacer clic en «Acepto y continúo», da su consentimiento para el registro y el uso de su foto y sus datos en las condiciones descritas anteriormente.",
        "Si no desea dar su consentimiento, seleccione «Rechazar». Podrá entonces acceder a las instalaciones siguiendo el procedimiento manual alternativo previsto para los visitantes.",
    ],
    consentCaptureHint: "Si no se captura la imagen, reinicie el reconocimiento y aleje ligeramente el rostro.",
});
Object.assign(TRANSLATIONS.ar, {
    consentParagraphs: [
        "لتسهيل وتسريع دخولكم إلى موقعنا أثناء زياراتكم، اعتمدنا نظاماً للتعرّف على الوجه مخصصاً لإدارة دخول الزوار.",
        "بعد تأكيد موافقتكم، سيتم التقاط صورتكم وتسجيل المعلومات اللازمة للتعرّف عليكم بصفتكم زائراً في نظامنا، وفقاً لسياسة الخصوصية الخاصة بالشركة.",
        "سيتم الاحتفاظ بهذه البيانات لتسهيل زياراتكم المستقبلية وإتاحة التعرّف التلقائي عليكم عند وصولكم إلى الموقع. وستُستخدم حصرياً لإدارة الدخول إلى الموقع، ولن تُستخدم لأي غرض آخر.",
        "يقتصر الوصول إلى هذه المعلومات بشكل صارم على الأشخاص المصرّح لهم وفقاً لمستويات الصلاحيات المحددة. وتُحمى البيانات بتدابير أمنية مناسبة تضمن سريتها وسلامتها وحمايتها من أي وصول غير مصرّح به.",
        "بالنقر على «أوافق وأتابع»، فإنكم توافقون على تسجيل صورتكم وبياناتكم واستخدامها وفقاً للشروط الموضحة أعلاه.",
        "إذا كنتم لا ترغبون في منح موافقتكم، يُرجى اختيار «رفض». ويمكنكم حينئذٍ الدخول إلى الموقع باتباع الإجراء اليدوي البديل المخصص للزوار.",
    ],
    consentCaptureHint: "إذا لم تُلتقط الصورة، أعيدوا تشغيل التعرّف على الوجه وأبعدوا وجوهكم قليلاً عن الكاميرا.",
});

for (const [language, values] of Object.entries({
    fr: ['Merci de valider la bonne compréhension des consignes.', 'Valider', 'Non', 'Merci de le signaler à l’accueil afin que les consignes vous soient expliquées.'],
    en: ['Please confirm that you understand the safety instructions.', 'Confirm', 'No', 'Please let reception know so that the safety instructions can be explained to you.'],
    es: ['Confirme que ha comprendido las instrucciones de seguridad.', 'Validar', 'No', 'Comuníquelo a recepción para que le expliquen las instrucciones de seguridad.'],
    ar: ['يرجى تأكيد فهم تعليمات السلامة.', 'تأكيد', 'لا', 'يرجى إبلاغ الاستقبال حتى يتم شرح تعليمات السلامة لك.'],
})) {
    ['safetyConfirm', 'safetyValidate', 'safetyNo', 'safetyHelp'].forEach((key, index) => {
        TRANSLATIONS[language][key] = values[index];
    });
}

class VisitorFaceAttendance extends Component {
    static template = xml`
        <div class="ar_face_screen" t-att-dir="isRtl ? 'rtl' : 'ltr'">
            <header class="ar_face_topbar">
                <div class="ar_face_brand"><img src="/ar_visitors/static/src/img/araymond-logo.png" alt="ARaymond"/><span t-esc="t('reception')"/></div>
            </header>
            <aside class="ar_face_welcome" t-att-dir="isRtl ? 'rtl' : 'ltr'">
                <span class="ar_face_eyebrow" t-esc="t('welcome')"/>
                <h2 t-esc="t('welcomeTagline')"/>

                <h3 t-esc="t('journeyTitle')"/>
                <ol class="ar_face_steps">
                    <li><span class="ar_face_step_icon"><i class="fa fa-user-o" aria-hidden="true"/></span><div><strong t-esc="t('stepIdentity')"/><p t-esc="t('stepIdentityText')"/></div><span class="ar_face_step_number">01</span></li>
                    <li><span class="ar_face_step_icon"><i class="fa fa-shield" aria-hidden="true"/></span><div><strong t-esc="t('stepSafety')"/><p t-esc="t('stepSafetyText')"/></div><span class="ar_face_step_number">02</span></li>
                    <li><span class="ar_face_step_icon"><i class="fa fa-check-square-o" aria-hidden="true"/></span><div><strong t-esc="t('stepRegistration')"/><p t-esc="t('stepRegistrationText')"/></div><span class="ar_face_step_number">03</span></li>
                </ol>


                <div class="ar_face_controls ar_face_welcome_controls">
                    <button class="btn btn-primary" t-on-click="beginRecognition" t-att-disabled="state.busy || state.redirecting || state.consentOpen"><i class="fa fa-arrow-right" aria-hidden="true"/><span t-esc="t('startVisit')"/></button>
                    <button class="btn btn-outline-primary" t-on-click="beginCheckout" t-att-disabled="state.busy || state.redirecting || state.consentOpen"><i class="fa fa-sign-out" aria-hidden="true"/><span t-esc="t('finishVisit')"/></button>
                </div>
                <div class="ar_face_controls ar_face_welcome_controls">
                    <button class="btn ar_face_profile_button" t-on-click="beginProfile" t-att-disabled="state.busy || state.redirecting || state.consentOpen"><i class="fa fa-id-card-o" aria-hidden="true"/><span t-esc="t('profile')"/></button>
                    <button class="btn ar_face_safety_button" t-on-click="openSafety" t-att-disabled="state.busy || state.redirecting || state.consentOpen"><i class="fa fa-shield" aria-hidden="true"/><span t-esc="t('safety')"/></button>
                </div>
                <div class="ar_face_welcome_footer"><i class="fa fa-handshake-o" aria-hidden="true"/><span t-esc="t('welcomeClosing')"/></div>
            </aside>
            <div class="ar_face_panel">
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

                <div class="ar_face_camera_area" t-ref="cameraArea">
                <div class="ar_face_camera" t-ref="cameraFrame">
                    <video t-ref="video" t-on-loadedmetadata="fitCameraFrame" t-on-resize="fitCameraFrame" autoplay="autoplay" playsinline="playsinline" muted="muted"/>
                    <div class="ar_face_camera_status" t-att-class="{ 'is-active': state.camera }"><span/><t t-esc="t(state.camera ? 'cameraActive' : 'cameraInactive')"/></div>
                    <div t-if="state.camera" class="ar_face_camera_corners" aria-hidden="true"><span/><span/><span/><span/></div>
                    <div t-if="!state.retryMessage" class="ar_face_camera_guide"><i class="fa fa-camera" aria-hidden="true"/><span t-esc="t('cameraGuide')"/></div>
                    <div t-if="state.retryMessage" class="ar_face_retry_overlay" role="status" aria-live="polite">
                        <t t-esc="state.retryMessage"/>
                    </div>
                </div>
                </div>
                <div t-if="state.safetyOpen" class="ar_face_safety_overlay" role="dialog" aria-modal="true" aria-labelledby="ar-safety-title">
                    <div class="ar_face_safety_card">
                        <header class="ar_safety_header"><span class="ar_safety_header_icon" aria-hidden="true"><i class="fa fa-shield"/></span><h2 id="ar-safety-title" t-esc="t('safety')"/></header>
                        <ol class="ar_safety_summary">
                            <li t-foreach="state.instructions" t-as="item" t-key="item.id" t-att-title="item.name" t-att-class="{'is-current': item_index === state.safetyIndex, 'is-seen': item_index &lt; state.safetyIndex}" t-att-aria-current="item_index === state.safetyIndex ? 'step' : undefined">
                                <span class="ar_safety_summary_number" t-esc="item_index + 1"/><span class="ar_safety_summary_emoji" aria-hidden="true" t-esc="item.emoji"/><span class="ar_safety_summary_text visually-hidden" t-esc="item.name"/>
                            </li>
                        </ol>
                        <div class="ar_safety_list" tabindex="0">
                            <t t-set="instruction" t-value="activeSafetyInstruction"/>
                            <article t-if="instruction" class="ar_safety_instruction ar_safety_slide" t-key="instruction.id" t-att-class="{'ar_safety_emergency': ['🚨', '☎️', '📞'].includes(instruction.emoji)}">
                                <div class="ar_safety_instruction_content">
                                    <span class="ar_safety_emoji" t-esc="instruction.emoji"/>
                                    <div class="ar_safety_step_label"><t t-esc="t('safetyStep')"/> <t t-esc="state.safetyIndex + 1"/> / <t t-esc="state.instructions.length"/></div>
                                    <p class="ar_safety_text" t-esc="instruction.name"/>
                                </div>
                                <div t-if="instruction.images &amp;&amp; instruction.images.length" class="ar_safety_gallery ar_safety_readable_images">
                                    <img t-foreach="instruction.images" t-as="safetyImage" t-key="safetyImage.id" t-att-src="safetyImage.url" t-att-alt="safetyImage.name" loading="lazy"/>
                                </div>
                            </article>
                        </div>
                        <footer class="ar_safety_footer ar_safety_guided_footer">
                            <div class="ar_safety_progress" role="status" aria-live="polite"><strong><t t-esc="t('safetyStep')"/> <t t-esc="state.instructions.length ? state.safetyIndex + 1 : 0"/> / <t t-esc="state.instructions.length"/></strong><small t-if="!safetyComplete" t-esc="t('safetyRequired')"/></div>
                            <button t-if="!safetyComplete" type="button" class="btn ar_face_home_button ar_safety_next_button" t-on-click="nextSafetyInstruction"><span t-esc="t('nextSafety')"/><i t-att-class="isRtl ? 'fa fa-arrow-left' : 'fa fa-arrow-right'" aria-hidden="true"/></button>
                            <button type="button" class="btn ar_face_home_button" t-att-disabled="!safetyComplete" t-on-click="returnHome"><i class="fa fa-home" aria-hidden="true"/><span t-esc="t('home')"/></button>
                        </footer>
                    </div>
                </div>
                <div t-if="state.safetyImage" class="ar_safety_image_viewer" role="dialog" aria-modal="true" t-att-aria-label="state.safetyImage.name" t-ref="imageViewer" tabindex="-1" t-on-keydown="onSafetyImageKeydown">
                    <div class="ar_safety_image_viewer_card">
                        <header><h3 t-esc="state.safetyImage.name"/><button type="button" t-on-click="closeSafetyImage" t-att-aria-label="t('closeImage')"><i class="fa fa-times" aria-hidden="true"/></button></header>
                        <img t-att-src="state.safetyImage.url" t-att-alt="state.safetyImage.name"/>
                    </div>
                </div>
                <p class="ar_face_status" role="status" t-esc="state.message"/>
                <div t-if="state.consentOpen" class="ar_face_consent_overlay" role="dialog" aria-modal="true" aria-labelledby="ar-face-consent-title">
                    <div class="ar_face_consent_card">
                        <div class="ar_face_consent_icon"><i class="fa fa-shield" aria-hidden="true"/></div>
                        <h2 id="ar-face-consent-title" t-esc="t('consentTitle')"/>
                        <t t-foreach="consentParagraphs" t-as="paragraph" t-key="paragraph_index">
                            <p t-esc="paragraph"/>
                        </t>
                        <p class="ar_face_consent_capture_hint" t-esc="t('consentCaptureHint')"/>
                        <div class="ar_face_consent_actions">
                            <button class="btn btn-danger" t-on-click="cancelCameraConsent" t-esc="t('refuse')"/>
                            <button class="btn btn-success" t-on-click="confirmCameraConsent" t-esc="t('accept')"/>
                        </div>
                    </div>
                </div>
                <div t-if="state.person &amp;&amp; state.mode !== 'checkout'" class="ar_face_identity_overlay">
                    <div class="ar_face_identity_card" role="dialog" aria-modal="true" aria-live="polite" aria-label="Identity confirmation">
                        <img t-if="state.person.image" t-att-src="'data:image/jpeg;base64,' + state.person.image" alt="Recognized visitor"/>
                        <div t-else="" class="ar_face_avatar" aria-hidden="true"><t t-esc="initials"/></div>
                        <div class="ar_face_identity_details">
                            <span class="ar_face_identity_label" t-esc="t('recognized')"/>
                            <h2><t t-esc="state.person.first_name"/> <t t-esc="state.person.last_name"/></h2>
                            <p t-if="state.person.nationality"><strong t-esc="t('nationality')"/> <t t-esc="state.person.nationality"/></p>
                            <p class="ar_face_identity_question" t-esc="t('isYou')"/>
                            <p t-if="state.person.has_open_visit &amp;&amp; state.mode === 'arrival' &amp;&amp; !state.journeyError" class="alert alert-warning" role="alert" t-esc="t('openVisit')"/>
                            <p t-if="state.journeyError" class="alert alert-danger" role="alert" t-esc="state.journeyError"/>
                            <div class="ar_face_identity_actions">
                                <button t-if="state.person.has_open_visit &amp;&amp; state.mode === 'arrival'" class="btn btn-primary" t-on-click="closeRecognizedVisit" t-att-disabled="state.busy" t-esc="t('closeVisit')"/>
                                <button t-else="" class="btn btn-primary" t-on-click="confirmIdentity" t-att-disabled="state.busy" t-esc="t('yes')"/>
                                <button class="btn btn-outline-secondary" t-on-click="rejectIdentity" t-att-disabled="state.busy" t-esc="t('no')"/>
                            </div>
                        </div>
                    </div>
                </div>
                <div t-if="state.captured &amp;&amp; !state.busy &amp;&amp; !state.person &amp;&amp; state.mode !== 'checkout'" class="ar_face_result">
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
        this.cameraArea = useRef("cameraArea");
        this.cameraFrame = useRef("cameraFrame");
        this.imageViewer = useRef("imageViewer");
        this.state = useState({ safetyIndex: 0, safetyImage: false, safetyOpen: false, instructions: [], checkoutPerson: false, busy: false, camera: false, redirecting: false, message: "", retryMessage: "", captured: "", match: false, person: false, mode: "arrival", checkoutError: false, consentOpen: false, consentAccepted: false, language: "fr", attempt: 0, attemptLimit: 3, retryDelay: 1.5 });
        this.alive = true;
        onMounted(() => {
            this.cameraLayoutObserver = new ResizeObserver(() => this.fitCameraFrame());
            this.cameraLayoutObserver.observe(this.cameraArea.el);
            this.fitCameraFrame();
            this.startCamera();
            this.startIdleRefresh();
        });
        onWillUnmount(() => {
            this.cameraLayoutObserver?.disconnect();
            this.alive = false;
            this.stopIdleRefresh();
            clearTimeout(this.retryTimer);
            this.stopCamera();
        });
    }
    fitCameraFrame() {
        const area = this.cameraArea?.el;
        const frame = this.cameraFrame?.el;
        const video = this.video.el;
        if (!this.alive || !area || !frame) return;
        const ratio = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 4 / 3;
        const width = Math.min(area.clientWidth, area.clientHeight * ratio);
        if (width <= 0) return;
        frame.style.width = `${width}px`;
        frame.style.height = `${width / ratio}px`;
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
            if (Date.now() - this.idleSince >= 600000) {
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
            this.fitCameraFrame();
        } catch (error) {
            this.stopCamera();
            this.state.message = error.message || this.t("Impossible d’accéder à la caméra.");
        } finally {
            this.startingCamera = false;
        }
    }
    t(key) { return TRANSLATIONS[this.state.language]?.[key] || TRANSLATIONS.fr[key] || key; }
    get consentParagraphs() {
        const paragraphs = TRANSLATIONS[this.state.language]?.consentParagraphs;
        if (paragraphs) return paragraphs;
        return [
            "Afin de faciliter et d'accélérer votre accès à notre site lors de vos visites, nous avons mis en place un système de reconnaissance faciale dédié à la gestion des accès visiteurs.",
            "Après votre confirmation, votre photo capturée et les informations nécessaires à votre identification en tant que visiteur seront enregistrées dans notre système conformément à la politique de confidentialité de l'entreprise.",
            "Ces données seront conservées afin de simplifier vos futures visites et de permettre une reconnaissance automatique lors de votre arrivée sur le site. Elles seront utilisées exclusivement pour la gestion des accès au site et ne feront l'objet d'aucune autre utilisation.",
            "L'accès à ces informations est strictement limité aux personnes autorisées selon des niveaux d'habilitation définis. Les données sont protégées par des mesures de sécurité appropriées garantissant leur confidentialité, leur intégrité et leur protection contre tout accès non autorisé.",
            "En cliquant sur « J'accepte et continue », vous donnez votre consentement à l'enregistrement et à l'utilisation de votre photo et de vos données dans les conditions décrites ci-dessus.",
            "Si vous ne souhaitez pas donner votre consentement, veuillez sélectionner « Refuser ». Vous pourrez alors accéder au site en suivant la procédure alternative manuelle prévue pour les visiteurs.",
        ];
    }
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
        if (!this.alive || this.state.busy || !this.state.consentOpen) return;
        this.state.consentOpen = false;
        this.state.consentAccepted = true;
        await this.continueVisit();
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
    async beginProfile() { await this.requestRecognition("profile"); }
    returnHome() {
        if (this.state.safetyOpen && !this.safetyComplete) return;
        this.state.safetyImage = false;
        this.state.safetyOpen = false;
        this.safetyImageTrigger = null;
    }
    async openSafety() {
        this.state.instructions = await this.orm.call("ar.visitor.face.bridge", "safety_instructions", [this.state.language || "fr"], {context: this.languageContext});
        this.state.safetyIndex = 0;
        this.state.safetyOpen = true;
    }
    get activeSafetyInstruction() { return this.state.instructions?.[this.state.safetyIndex || 0]; }
    get safetyComplete() { return !this.state.instructions?.length || (this.state.safetyIndex || 0) === this.state.instructions.length - 1; }
    nextSafetyInstruction() {
        if (!this.state.safetyOpen || this.safetyComplete) return;
        this.state.safetyIndex = (this.state.safetyIndex || 0) + 1;
        this.state.safetyImage = false;
    }
    showSafetyImage(image, event) {
        this.safetyImageTrigger = event.currentTarget;
        this.state.safetyImage = image;
        requestAnimationFrame(() => { if (this.alive) this.imageViewer.el?.focus(); });
    }
    closeSafetyImage() {
        this.state.safetyImage = false;
        this.safetyImageTrigger?.focus();
    }
    onSafetyImageKeydown(event) {
        if (event.key === "Escape") { event.stopPropagation(); this.closeSafetyImage(); }
        if (event.key === "Tab") {
            event.preventDefault();
            this.imageViewer.el?.querySelector("button")?.focus();
        }
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
        this.cameraConsentGranted = true;
        this.state.consentAccepted = false;
        this.state.consentOpen = false;
        this.state.message = "";
        await this.capture();
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
                    const reason = this.t("Visiteur non reconnu. Vérifiez qu'une visite est en cours, puis réessayez.");
                    if (this.scheduleRetry(reason)) return;
                    this.state.message = reason;
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
            const reason = this.safeErrorMessage(error, this.t("La reconnaissance faciale a échoué. Veuillez réessayer."));
            if (this.scheduleRetry(reason)) return;
            this.state.message = reason;
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
        if (!this.alive || !this.state.camera || this.state.redirecting) return false;
        if (this.state.attempt >= this.state.attemptLimit) {
            this.state.redirecting = true;
            this.state.consentOpen = false;
            this.state.message = reason;
            clearTimeout(this.retryTimer);
            this.stopCamera();
            window.location.reload();
            return true;
        }
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
        if (this.state.busy || this.openingJourney) return;
        await this.continueVisit();
    }
    async closeRecognizedVisit() {
        if (this.state.busy || this.openingJourney || !this.state.person?.has_open_visit) return;
        this.state.busy = true;
        this.state.journeyError = "";
        try {
            await this.openCheckout(this.state.person.id, true);
        } finally {
            if (this.alive) this.state.busy = false;
        }
    }
    async openNewVisitorJourney() {
        this.state.consentOpen = true;
        this.state.message = "";
    }
    async openCheckout(personId, fromArrival = false) {
        try {
            const action = await this.orm.call("ar.visitor.face.bridge", "checkout_for_person", [personId, this.state.language || "fr", fromArrival], { context: this.languageContext });
            if (!this.alive) return;
            await this.action.doAction(action);
            this.state.captured = "";
            this.state.message = "";
        } catch (error) {
            this.state.captured = "";
            this.state.message = this.checkoutErrorMessage(error);
            if (fromArrival) this.state.journeyError = this.state.message;
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
        if (this.state.busy || this.state.redirecting) return;
        this.state.redirecting = true;
        this.state.person = false;
        this.state.match = false;
        this.state.captured = "";
        this.stopCamera();
        window.location.reload();
    }
    async continueVisit() {
        if (!this.alive || this.state.busy || this.openingJourney || !this.state.captured) return;
        const confirmedPerson = this.state.person;
        this.state.person = false;
        this.state.journeyError = "";
        this.openingJourney = true;
        this.state.busy = true;
        try {
            const action = await this.orm.call("ar.visitor.face.bridge", "start_visit", [this.state.captured, this.state.match || false, this.state.language || "fr", this.state.mode === "profile" ? "profile" : "arrival", this.state.consentAccepted], { context: this.languageContext });
            if (!this.alive) return;
            await this.action.doAction(action);
            if (this.alive) {
                this.state.captured = "";
                this.state.person = false;
                this.state.message = this.t("Parcours ouvert.");
            }
        } catch (error) {
            if (this.alive) {
                this.state.person = confirmedPerson;
                this.state.journeyError = this.safeErrorMessage(error, this.t("Impossible d’ouvrir le parcours. Réessayez avec Continuer."));
                this.state.message = this.state.journeyError;
            }
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
