"""Translations of the standard visitor instructions; custom translations stay editable in Odoo."""
import re
import unicodedata


def _key(text):
    text = unicodedata.normalize('NFKD', text or '')
    text = ''.join(char for char in text if not unicodedata.combining(char))
    return re.sub(r'[^a-z0-9]+', '', text.lower())


ROWS = [
    ("Restez tout le temps accompagné par votre interlocuteur ou une personne autorisée.",
     "Always remain accompanied by your host or an authorised person.",
     "Permanezca siempre acompañado por su interlocutor o una persona autorizada.",
     "ابقَ دائماً برفقة الشخص الذي تزوره أو شخص مخوّل."),
    ("Portez les EPI obligatoires indiqués pour la zone : chaussures de sécurité, gilet haute visibilité, lunettes, protections auditives, etc.",
     "Wear the mandatory PPE specified for the area: safety shoes, high-visibility vest, safety glasses, hearing protection, etc.",
     "Utilice los EPI obligatorios indicados para la zona: calzado de seguridad, chaleco de alta visibilidad, gafas, protección auditiva, etc.",
     "ارتدِ معدات الوقاية الشخصية الإلزامية المحددة للمنطقة: أحذية السلامة، وسترة عالية الوضوح، ونظارات واقية، وواقيات السمع، وغيرها."),
    ("Respectez les voies piétonnes et les zones de circulation autorisées.",
     "Use pedestrian walkways and authorised circulation areas.",
     "Respete las vías peatonales y las zonas de circulación autorizadas.",
     "التزم بممرات المشاة ومناطق الحركة المسموح بها."),
    ("Restez vigilant aux chariots élévateurs et autres engins mobiles. Ne traversez jamais leur trajectoire sans vous assurer d’avoir été vu.",
     "Stay alert to forklifts and other moving vehicles. Never cross their path without making sure the driver has seen you.",
     "Manténgase atento a las carretillas elevadoras y otros vehículos móviles. Nunca cruce su trayectoria sin asegurarse de que el conductor le ha visto.",
     "انتبه للرافعات الشوكية وغيرها من المركبات المتحركة. لا تعبر مسارها أبداً قبل التأكد من أن السائق قد رآك."),
    ("N’entrez pas dans les zones interdites ou non autorisées.",
     "Do not enter prohibited or unauthorised areas.",
     "No entre en zonas prohibidas o no autorizadas.",
     "لا تدخل المناطق المحظورة أو غير المسموح بها."),
    ("N’utilisez pas votre téléphone en marchant.",
     "Do not use your phone while walking.",
     "No utilice su teléfono mientras camina.",
     "لا تستخدم هاتفك أثناء المشي."),
    ("Respectez l’interdiction de fumer, sauf dans les zones spécifiquement autorisées.",
     "Observe the smoking ban, except in specifically designated smoking areas.",
     "Respete la prohibición de fumar, salvo en las zonas específicamente autorizadas.",
     "التزم بحظر التدخين، باستثناء المناطق المخصصة والمسموح بها."),
    ("Photos et vidéos interdites sans autorisation préalable.",
     "Photography and video recording are prohibited without prior authorisation.",
     "Está prohibido tomar fotos y grabar vídeos sin autorización previa.",
     "يُمنع التصوير الفوتوغرافي وتسجيل الفيديو دون إذن مسبق."),
    ("Ne touchez pas aux machines, équipements, produits ou commandes sans autorisation.",
     "Do not touch machines, equipment, products or controls without authorisation.",
     "No toque máquinas, equipos, productos ni mandos sin autorización.",
     "لا تلمس الآلات أو المعدات أو المنتجات أو أدوات التحكم دون إذن."),
    ("Signalez immédiatement toute situation dangereuse, incident ou accident à votre accompagnateur.",
     "Immediately report any dangerous situation, incident or accident to the person accompanying you.",
     "Informe inmediatamente a su acompañante de cualquier situación peligrosa, incidente o accidente.",
     "أبلغ مرافقك فوراً عن أي وضع خطير أو حادث أو واقعة."),
    ("En cas d’alarme ou d’évacuation :\n1. Arrêtez votre activité.\n2. Évacuez calmement en suivant la signalisation et les instructions de votre accompagnateur.\n3. Ne retournez pas chercher vos effets personnels.\n4. Rendez-vous au point de rassemblement le plus proche 📍",
     "In the event of an alarm or evacuation:\n1. Stop your activity.\n2. Evacuate calmly, following the signs and your accompanying person's instructions.\n3. Do not go back to collect your personal belongings.\n4. Go to the nearest assembly point 📍",
     "En caso de alarma o evacuación:\n1. Detenga su actividad.\n2. Evacúe con calma siguiendo la señalización y las instrucciones de su acompañante.\n3. No regrese a buscar sus pertenencias personales.\n4. Diríjase al punto de reunión más cercano 📍",
     "في حال الإنذار أو الإخلاء:\n1. أوقف نشاطك.\n2. غادر بهدوء واتبع اللافتات وتعليمات مرافقك.\n3. لا تعد لجلب أغراضك الشخصية.\n4. توجّه إلى أقرب نقطة تجمع 📍"),
    ("N’intervenez pas sur une situation d’urgence sauf si vous êtes formé et autorisé à le faire.",
     "Do not intervene in an emergency unless you are trained and authorised to do so.",
     "No intervenga en una emergencia salvo si está formado y autorizado para hacerlo.",
     "لا تتدخل في حالة طوارئ إلا إذا كنت مدرّباً ومخوّلاً بذلك."),
]
TRANSLATIONS = {_key(row[0]): dict(zip(('fr', 'en', 'es', 'ar'), row)) for row in ROWS}


def safety_text(text, language):
    """Recognise standard French text, tolerating typography; preserve custom content."""
    if language == 'fr':
        return text
    translated = TRANSLATIONS.get(_key(text), {}).get(language)
    if translated:
        return translated
    # Keep the configured phone number (or placeholder) exactly as entered.
    match = re.fullmatch(r"\s*EN CAS D[’']URGENCE\s*Urgence interne\s*/\s*HSE\s*:\s*(.*)", text or '', re.I | re.S)
    if match and language in ('en', 'es', 'ar'):
        labels = {
            'en': 'IN AN EMERGENCY\nInternal emergency / HSE: ',
            'es': 'EN CASO DE EMERGENCIA\nEmergencia interna / HSE: ',
            'ar': 'في حالة الطوارئ\nالطوارئ الداخلية / الصحة والسلامة والبيئة: ',
        }
        return labels[language] + match.group(1)
    return text
