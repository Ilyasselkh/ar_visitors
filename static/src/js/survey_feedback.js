/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { SurveyForm } from "@survey/interactions/survey_form";

const labels = {
    fr: ["Prenez connaissance de la correction", "Bonne réponse :", "Question suivante", "Continuer"],
    en: ["Review the correction", "Correct answer:", "Next question", "Continue"],
    es: ["Revise la corrección", "Respuesta correcta:", "Pregunta siguiente", "Continuar"],
    ar: ["اطلع على التصحيح", "الإجابة الصحيحة:", "السؤال التالي", "متابعة"],
};

export function showVisitorFeedback(feedback, language, nextLabel) {
    const text = labels[language] || labels.fr;
    return new Promise(resolve => {
        const dialog = document.createElement("dialog");
        dialog.className = "ar_quiz_feedback";
        dialog.dir = language === "ar" ? "rtl" : "ltr";
        dialog.setAttribute("aria-labelledby", "ar-quiz-feedback-title");
        const heading = document.createElement("h2");
        heading.id = "ar-quiz-feedback-title";
        heading.textContent = text[0];
        dialog.append(heading);
        for (const item of feedback) {
            const section = document.createElement("section");
            const question = document.createElement("h3");
            question.textContent = item.question;
            const caption = document.createElement("p");
            caption.textContent = text[1];
            const answers = document.createElement("ul");
            if (Object.keys(item.answer_images || {}).length) answers.className = "ar_quiz_image_answers";
            for (const [index, value] of item.answers.entries()) {
                const li = document.createElement("li");
                const imageUrl = item.answer_images?.[index];
                if (imageUrl) {
                    const image = document.createElement("img");
                    image.src = imageUrl;
                    image.alt = value;
                    image.addEventListener("error", () => { image.hidden = true; }, { once: true });
                    li.append(image);
                }
                const label = document.createElement("span");
                label.textContent = value;
                li.append(label);
                answers.append(li);
            }
            section.append(question, caption, answers);
            dialog.append(section);
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "btn btn-primary";
        button.textContent = text[nextLabel ? 2 : 3];
        button.addEventListener("click", () => { dialog.close(); dialog.remove(); resolve(); }, { once: true });
        dialog.addEventListener("cancel", event => event.preventDefault());
        dialog.append(button);
        document.body.append(dialog);
        dialog.showModal();
        button.focus();
    });
}

patch(SurveyForm.prototype, {
    onChoiceImageClick(ev) {
        if (ev.currentTarget.closest('body.ar_visitor_quiz')) {
            // The image is inside the answer label: let its native click select
            // the radio/checkbox, without opening Odoo's image zoom dialog.
            return;
        }
        return super.onChoiceImageClick(ev);
    },
    async submitForm(...args) {
        if (this.submitting) return;
        // Prevent the kiosk's completion polling from closing the last correction.
        window.parent.postMessage('ar-visitors-quiz-submitting', window.location.origin);
        try {
            return await super.submitForm(...args);
        } finally {
            window.parent.postMessage('ar-visitors-quiz-ready', window.location.origin);
        }
    },
    async nextScreen(submitPromise, options) {
        const result = await submitPromise;
        const page = result[1];
        if (page?.visitor_feedback?.length) {
            const listening = this.listenOnKeydown;
            this.listenOnKeydown = false;
            try {
                await showVisitorFeedback(page.visitor_feedback, page.visitor_feedback_language,
                    this.options.questionsLayout === 'page_per_question' && !options?.isFinish);
            } finally {
                this.listenOnKeydown = listening;
            }
        }
        return super.nextScreen(Promise.resolve(result), options);
    },
});
