/** @odoo-module **/
import { Component, onWillUnmount, useRef, xml } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { registry } from "@web/core/registry";

class VisitorKioskDialog extends Component {
    static components = { Dialog };
    static props = { close: Function, url: String, title: String };
    static template = xml`
        <Dialog title="props.title" size="'xl'" footer="false" withBodyPadding="false">
            <iframe class="ar_journey_loading" t-ref="journey" t-on-load="onJourneyLoad" t-att-src="props.url" t-att-title="props.title"
                style="display:block;width:100%;height:78vh;border:0;"/>
        </Dialog>`;
    setup() {
        this.journey = useRef("journey");
        onWillUnmount(() => clearTimeout(this.returnTimer));
    }
    onJourneyLoad() {
        if (this.completed) return;
        let completed = false;
        try {
            this.journey.el.closest?.(".o_dialog")?.classList.toggle("ar_quiz_journey_dialog",
                Boolean(this.journey.el?.contentDocument?.querySelector('#ar-quiz-dialog')));
            const details = this.journey.el?.contentDocument?.querySelector('#ar-entry-signature');
            this.journey.el.closest?.(".o_dialog")?.classList.toggle("ar_visit_details_dialog", Boolean(details));
            if (details) {
                const doc = this.journey.el.contentDocument;
                doc.documentElement.style.setProperty('background', 'transparent', 'important');
                doc.body.style.setProperty('background', 'transparent', 'important');
                const header = doc.querySelector('.ar-kiosk-card > header');
                if (header && !doc.querySelector('.ar-visit-close')) {
                    const close = doc.createElement('button');
                    close.type = 'button';
                    close.className = 'ar-visit-close';
                    close.textContent = '×';
                    close.setAttribute('aria-label', ({fr: 'Fermer', en: 'Close', es: 'Cerrar', ar: 'إغلاق'})[doc.documentElement.lang?.slice(0, 2)] || 'Fermer');
                    close.addEventListener('click', () => this.props.close());
                    header.append(close);
                }
            }
            completed = Boolean(this.journey.el?.contentDocument?.querySelector('[data-visitor-registration-complete="true"]'));
        } catch (_) {
            // A page outside this origin cannot signal completion of this visit.
        }
        this.journey.el?.classList?.remove('ar_journey_loading');
        if (completed) {
            this.completed = true;
            this.journey.el.closest?.(".o_dialog")?.classList.add("ar_completion_dialog");
            const marker = this.journey.el.contentDocument.querySelector('[data-visitor-registration-complete="true"]');
            this.returnTimer = setTimeout(() => { this.props.close(); window.location.reload(); }, Number(marker.dataset.returnDelay) || 3000);
        }
    }
}

registry.category("actions").add("ar_visitors.open_kiosk", (env, action) => {
    env.services.dialog.add(VisitorKioskDialog, { url: action.params.url, title: action.params.title || "Parcours visiteur" }, {
        onClose: () => env.services.action.doAction({ type: "ir.actions.client", tag: "soft_reload" }),
    });
});

registry.category("actions").add("ar_visitors.start_journey", async (env, action) => {
    const { form_action, visit_id } = action.params;
    const journey = await env.services.orm.call("ar.visitor.visit", "action_open_kiosk", [[visit_id]], {
        context: form_action.context,
    });
    await env.services.action.doAction(journey);
});

class VisitorDoneDialog extends Component {
    static props = { close: Function, message: String, delay: Number };
    static template = xml`<div class="ar_completion_overlay" role="status" aria-live="polite">
        <div class="ar_completion_result">
            <svg class="ar_completion_check" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="43"/><path d="M28 50 L44 66 L73 36"/></svg>
            <h1 t-if="props.message !== '✅'" t-esc="props.message"/>
        </div>
    </div>`;
    setup() {
        const timer = setTimeout(() => { this.props.close(); window.location.reload(); }, this.props.delay);
        onWillUnmount(() => clearTimeout(timer));
    }
}
registry.category("actions").add("ar_visitors.kiosk_done", async (env, action) => {
    await env.services.action.doAction({ type: "ir.actions.act_window_close" });
    let remove;
    remove = env.services.overlay.add(VisitorDoneDialog, {
        close: () => remove(), message: action.params.message, delay: action.params.delay || 3000,
    }, {sequence: 100});
});
