"""Visitor-facing text, independent of the reception user's UI language.

French is the module's source language, including when Odoo uses en_US.
Keep these translations explicit so an unimported PO cannot mix languages.
"""

LANG_CODES = {"fr": "fr_FR", "en": "en_US", "es": "es_ES", "ar": "ar_001"}

# Source: English, Spanish, Arabic.
MESSAGES = {
    "Veuillez confirmer la compréhension des consignes avant d’enregistrer l’entrée.": ("Please confirm that you understand the safety instructions before checking in.", "Confirme que comprende las instrucciones de seguridad antes de registrar la entrada.", "يرجى تأكيد فهم تعليمات السلامة قبل تسجيل الدخول."),
    "Veuillez remplir tous les champs avant de continuer.": ("Please fill in all fields before continuing.", "Complete todos los campos antes de continuar.", "يرجى ملء جميع الحقول قبل المتابعة."),
    "Langue": ("Language", "Idioma", "اللغة"),
    "État": ("Status", "Estado", "الحالة"),
    "Département": ("Department", "Departamento", "القسم"),
    "Date de fin du quiz": ("Quiz completion date", "Fecha de finalización del cuestionario", "تاريخ إكمال الاختبار"),
    "Notification": ("Notification", "Notificación", "الإشعار"),
    "Identifier le visiteur": ("Identify the visitor", "Identificar al visitante", "التعريف بالزائر"),
    "NOUVELLE VISITE": ("NEW VISIT", "NUEVA VISITA", "زيارة جديدة"),
    "Accueillir un visiteur": ("Welcome a visitor", "Recibir a un visitante", "استقبال زائر"),
    "Retrouvez son identité et préparez son parcours en quelques instants.": ("Find their identity and prepare their visit in a few moments.", "Busque su identidad y prepare su visita en unos instantes.", "ابحث عن هوية الزائر وجهّز زيارته في لحظات."),
    "Numéro de CIN / passeport": ("ID / passport number", "Número de DNI / pasaporte", "رقم بطاقة الهوية / جواز السفر"),
    "Saisissez la CIN / passeport du visiteur": ("Enter the visitor's ID / passport number", "Introduzca el DNI / pasaporte del visitante", "أدخل رقم بطاقة هوية الزائر / جواز سفره"),
    "La CIN / passeport permet de retrouver le visiteur et de vérifier la validité de son dernier quiz.": ("The ID / passport number identifies the visitor and checks whether their last quiz is still valid.", "El DNI / pasaporte permite identificar al visitante y comprobar la validez de su último cuestionario.", "يسمح رقم بطاقة الهوية / جواز السفر بالتعرف على الزائر والتحقق من صلاحية آخر اختبار له."),
    "Première visite ? Vous pourrez compléter son identité à l’étape suivante.": ("First visit? You can complete their identity in the next step.", "¿Primera visita? Podrá completar su identidad en el siguiente paso.", "هل هذه أول زيارة؟ يمكنك استكمال بيانات الهوية في الخطوة التالية."),
    "Continuer": ("Continue", "Continuar", "متابعة"),
    "Annuler": ("Cancel", "Cancelar", "إلغاء"),
    "Fermer": ("Close", "Cerrar", "إغلاق"),
    "Choisissez votre langue": ("Choose your language", "Elija su idioma", "اختر لغتك"),
    "FICHE VISITEUR": ("VISITOR RECORD", "FICHA DEL VISITANTE", "ملف الزائر"),
    "Accueil et suivi de la visite": ("Visitor reception and tracking", "Recepción y seguimiento de la visita", "استقبال الزائر ومتابعة الزيارة"),
    "Identité du visiteur": ("Visitor identity", "Identidad del visitante", "هوية الزائر"),
    "Détails de la visite": ("Visit details", "Detalles de la visita", "تفاصيل الزيارة"),
    "Visite": ("Visit", "Visita", "زيارة"),
    "Visiteur": ("Visitor", "Visitante", "الزائر"),
    "Référence": ("Reference", "Referencia", "المرجع"),
    "Prénom": ("First name", "Nombre", "الاسم الشخصي"),
    "Nom": ("Last name", "Apellido", "اسم العائلة"),
    "CIN / passeport": ("ID / passport", "DNI / pasaporte", "بطاقة الهوية / جواز السفر"),
    "Nationalité": ("Nationality", "Nacionalidad", "الجنسية"),
    "Société": ("Company", "Empresa", "الشركة"),
    "Personne à visiter": ("Person to visit", "Persona a visitar", "الشخص المراد زيارته"),
    "Motif de la visite": ("Purpose of visit", "Motivo de la visita", "سبب الزيارة"),
    "Photo": ("Photo", "Foto", "الصورة"),
    "Photo capturée": ("Captured photo", "Foto capturada", "الصورة الملتقطة"),
    "Ouvrir le parcours visiteur": ("Open visitor journey", "Abrir el recorrido del visitante", "فتح مسار الزائر"),
    "Démarrer le parcours": ("Start the journey", "Iniciar el recorrido", "بدء المسار"),
    "Valider l'identité": ("Confirm identity", "Confirmar la identidad", "تأكيد الهوية"),
    "Charger le quiz": ("Load quiz", "Cargar cuestionario", "تحميل الاختبار"),
    "Ouvrir le quiz": ("Open quiz", "Abrir cuestionario", "فتح الاختبار"),
    "Vérifier le quiz": ("Check quiz", "Verificar cuestionario", "التحقق من الاختبار"),
    "Enregistrer et notifier": ("Save and notify", "Guardar y notificar", "تسجيل وإشعار المضيف"),
    "Enregistrer la sortie": ("Check out", "Registrar salida", "تسجيل المغادرة"),
    "Valider le contrôle": ("Approve review", "Validar el control", "اعتماد التحقق"),
    "Refuser": ("Refuse", "Rechazar", "رفض"),
    "Date et heure d'entrée": ("Check-in date and time", "Fecha y hora de entrada", "تاريخ ووقت الدخول"),
    "Date et heure de sortie": ("Check-out date and time", "Fecha y hora de salida", "تاريخ ووقت المغادرة"),
    "Durée (heures)": ("Duration (hours)", "Duración (horas)", "المدة (بالساعات)"),
    "Quiz": ("Quiz", "Cuestionario", "الاختبار"),
    "Participation": ("Quiz attempt", "Participación", "المشاركة في الاختبار"),
    "Quiz encore valide": ("Quiz still valid", "Cuestionario aún válido", "الاختبار لا يزال صالحاً"),
    "Quiz terminé": ("Quiz completed", "Cuestionario completado", "اكتمل الاختبار"),
    "Score du quiz (%)": ("Quiz score (%)", "Puntuación del cuestionario (%)", "نتيجة الاختبار (%)"),
    "Signature du visiteur": ("Visitor signature", "Firma del visitante", "توقيع الزائر"),
    "Signature à l'entrée": ("Entry signature", "Firma de entrada", "توقيع الدخول"),
    "Date de signature à l'entrée": ("Entry signature date", "Fecha de firma de entrada", "تاريخ توقيع الدخول"),
    "Ancienne signature de sortie": ("Previous check-out signature", "Firma de salida anterior", "توقيع المغادرة السابق"),
    "Signature": ("Signature", "Firma", "التوقيع"),
    "Date de signature": ("Signature date", "Fecha de firma", "تاريخ التوقيع"),
    "Signature de sortie": ("Check-out signature", "Firma de salida", "توقيع المغادرة"),
    "SORTIE VISITEUR": ("VISITOR CHECK-OUT", "SALIDA DEL VISITANTE", "مغادرة الزائر"),
    "Finalisez votre sortie": ("Complete your departure", "Complete su salida", "أكمل إجراءات المغادرة"),
    "Veuillez signer ci-dessous pour confirmer votre sortie.": ("Please sign below to confirm your check-out.", "Firme a continuación para confirmar su salida.", "يرجى التوقيع أدناه لتأكيد مغادرتك."),
    "RÉFÉRENCE DE VISITE": ("VISIT REFERENCE", "REFERENCIA DE VISITA", "مرجع الزيارة"),
    "VISITEUR": ("VISITOR", "VISITANTE", "الزائر"),
    "SIGNATURE REQUISE": ("SIGNATURE REQUIRED", "FIRMA OBLIGATORIA", "التوقيع مطلوب"),
    "Signez dans la zone ci-dessous": ("Sign in the area below", "Firme en el área de abajo", "وقّع في المنطقة أدناه"),
    "Enregistrer ma signature": ("Save my signature", "Guardar mi firma", "حفظ توقيعي"),
    "Brouillon": ("Draft", "Borrador", "مسودة"),
    "Identité à compléter": ("Identity incomplete", "Identidad por completar", "الهوية غير مكتملة"),
    "Identité à vérifier": ("Identity to verify", "Identidad por verificar", "الهوية قيد التحقق"),
    "Quiz à effectuer": ("Quiz pending", "Cuestionario pendiente", "الاختبار مطلوب"),
    "Validation manuelle": ("Manual approval", "Validación manual", "موافقة يدوية"),
    "Visiteur entré": ("Checked in", "Entrada registrada", "تم تسجيل الدخول"),
    "Signature en attente": ("Signature pending", "Firma pendiente", "في انتظار التوقيع"),
    "Visiteur sorti": ("Checked out", "Salida registrada", "تم تسجيل المغادرة"),
    "Refusé": ("Refused", "Rechazado", "مرفوض"),
    "Annulé": ("Cancelled", "Cancelado", "ملغى"),
    "À envoyer": ("Pending", "Pendiente", "في انتظار الإرسال"),
    "Envoyée": ("Sent", "Enviada", "تم الإرسال"),
    "Échec": ("Failed", "Error", "فشل"),
    "Non requise": ("Not required", "No requerida", "غير مطلوب"),
    "Veuillez saisir une CIN / passeport valide (au moins 4 caractères).": ("Enter a valid ID / passport number (at least 4 characters).", "Introduzca un DNI / pasaporte válido (al menos 4 caracteres).", "أدخل رقم بطاقة هوية / جواز سفر صالحاً (4 أحرف على الأقل)."),
    "La CIN / passeport doit contenir au moins quatre caractères.": ("The ID / passport number must contain at least four characters.", "El DNI / pasaporte debe contener al menos cuatro caracteres.", "يجب أن يحتوي رقم بطاقة الهوية / جواز السفر على أربعة أحرف على الأقل."),
    "Le nom, le prénom et une CIN / passeport valide sont obligatoires.": ("First name, last name and a valid ID / passport number are required.", "El nombre, el apellido y un DNI / pasaporte válido son obligatorios.", "الاسم الشخصي واسم العائلة ورقم بطاقة هوية / جواز سفر صالح مطلوبة."),
    "Aucun quiz actif n'est configuré pour cette langue.": ("No active quiz is configured for this language.", "No hay ningún cuestionario activo configurado para este idioma.", "لا يوجد اختبار نشط مُعدّ لهذه اللغة."),
    "Aucun quiz n'est configuré.": ("No quiz is configured.", "No hay ningún cuestionario configurado.", "لم يتم إعداد أي اختبار."),
    "Le quiz n'est pas encore terminé.": ("The quiz is not yet completed.", "El cuestionario aún no ha terminado.", "لم يكتمل الاختبار بعد."),
    "Le quiz n'est pas disponible à cette étape.": ("The quiz is not available at this stage.", "El cuestionario no está disponible en esta etapa.", "الاختبار غير متاح في هذه المرحلة."),
    "Cette visite n'attend pas de quiz.": ("This visit is not awaiting a quiz.", "Esta visita no tiene un cuestionario pendiente.", "هذه الزيارة لا تنتظر اختباراً."),
    "Impossible de générer le lien du quiz.": ("Unable to generate the quiz link.", "No se puede generar el enlace del cuestionario.", "تعذر إنشاء رابط الاختبار."),
    "Ce quiz exige une connexion. L’accueil doit configurer un quiz accessible aux visiteurs.": ("This quiz requires a login. Reception must configure a quiz accessible to visitors.", "Este cuestionario requiere iniciar sesión. Recepción debe configurar uno accesible a los visitantes.", "يتطلب هذا الاختبار تسجيل الدخول. يجب على الاستقبال إعداد اختبار متاح للزوار."),
    "Nationalité invalide.": ("Invalid nationality.", "Nacionalidad no válida.", "الجنسية غير صالحة."),
    "Sélectionnez une personne à visiter.": ("Select a person to visit.", "Seleccione una persona a visitar.", "اختر الشخص المراد زيارته."),
    "La personne à visiter est obligatoire.": ("A person to visit is required.", "Es obligatorio indicar la persona a visitar.", "يجب تحديد الشخص المراد زيارته."),
    "La signature du visiteur est obligatoire avant de valider la visite.": ("The visitor must sign before the visit can be confirmed.", "La firma del visitante es obligatoria para confirmar la visita.", "توقيع الزائر مطلوب قبل تأكيد الزيارة."),
    "La signature du visiteur est obligatoire pour valider la sortie.": ("The visitor must sign to confirm check-out.", "La firma del visitante es obligatoria para confirmar la salida.", "توقيع الزائر مطلوب لتأكيد المغادرة."),
    "Signature invalide. Veuillez signer à nouveau.": ("Invalid signature. Please sign again.", "Firma no válida. Vuelva a firmar.", "التوقيع غير صالح. يرجى التوقيع مجدداً."),
    "Ce visiteur possède déjà une visite en cours.": ("This visitor already has an active visit.", "Este visitante ya tiene una visita en curso.", "لهذا الزائر زيارة جارية بالفعل."),
    "Seule une visite en cours peut être clôturée.": ("Only an active visit can be checked out.", "Solo se puede cerrar una visita en curso.", "لا يمكن إنهاء إلا زيارة جارية."),
    "Cette visite n'est pas prête pour l'entrée.": ("This visit is not ready for check-in.", "Esta visita no está lista para registrar la entrada.", "هذه الزيارة ليست جاهزة لتسجيل الدخول."),
    "Cette visite ne peut pas être ouverte sur la borne.": ("This visit cannot be opened on the kiosk.", "Esta visita no se puede abrir en el quiosco.", "لا يمكن فتح هذه الزيارة على شاشة الاستقبال."),
    "Une validation du responsable est nécessaire.": ("Manager approval is required.", "Se requiere la aprobación del responsable.", "موافقة المسؤول مطلوبة."),
    "Le choix de langue n'est pas disponible à cette étape.": ("Language selection is not available at this stage.", "No se puede elegir el idioma en esta etapa.", "اختيار اللغة غير متاح في هذه المرحلة."),
    "Le parcours a déjà été démarré.": ("The journey has already started.", "El recorrido ya ha comenzado.", "بدأ المسار بالفعل."),
    "La sortie ne peut pas précéder l'entrée.": ("Check-out cannot precede check-in.", "La salida no puede ser anterior a la entrada.", "لا يمكن أن تسبق المغادرة الدخول."),
    "Aucune visite en cours n'a été trouvée pour cette personne.": ("No active visit was found for this person.", "No se ha encontrado una visita en curso para esta persona.", "لم يتم العثور على زيارة جارية لهذا الشخص."),
    "Personne introuvable.": ("Person not found.", "Persona no encontrada.", "لم يتم العثور على الشخص."),
    "Photo invalide.": ("Invalid photo.", "Foto no válida.", "الصورة غير صالحة."),
    "Langue invalide.": ("Invalid language.", "Idioma no válido.", "اللغة غير صالحة."),
    "L’accès au module est nécessaire pour utiliser la reconnaissance faciale.": ("Module access is required to use facial recognition.", "Se requiere acceso al módulo para usar el reconocimiento facial.", "يلزم الوصول إلى الوحدة لاستخدام التعرّف على الوجه."),
    "Seul un responsable peut accorder une dérogation.": ("Only a manager can grant an exception.", "Solo un responsable puede autorizar una excepción.", "يمكن للمسؤول فقط منح استثناء."),
    "Notification envoyée à %s.": ("Notification sent to %s.", "Notificación enviada a %s.", "تم إرسال إشعار إلى %s."),
    "Contrôle manuel validé par %s.": ("Manual review approved by %s.", "Control manual aprobado por %s.", "تم اعتماد التحقق اليدوي بواسطة %s."),
    "La personne à visiter ne possède pas d'adresse e-mail.": ("The person to visit has no email address.", "La persona a visitar no tiene correo electrónico.", "الشخص المراد زيارته ليس لديه عنوان بريد إلكتروني."),
    "Nouveau": ("New", "Nuevo", "جديد"),
}


def visitor_language(code):
    language = (code or "fr").split("_")[0]
    return language if language in LANG_CODES else "fr"


# Odoo can translate source XML to English before our view localization runs.
# Resolve those labels back to the module source, including for French visitors.
ENGLISH_SOURCES = {translations[0]: source for source, translations in MESSAGES.items()}


def visitor_text(source, language):
    language = visitor_language(language)
    source = source if source in MESSAGES else ENGLISH_SOURCES.get(source, source)
    translations = MESSAGES.get(source)
    if language == "fr" or not translations:
        return source
    return translations[("en", "es", "ar").index(language)]
