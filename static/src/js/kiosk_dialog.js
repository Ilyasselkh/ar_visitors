/** @odoo-module **/
import { Component, onWillUnmount, useRef, xml } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { registry } from "@web/core/registry";

class VisitorKioskDialog extends Component {
    static components = { Dialog };
    static props = { close: Function, url: String, title: String };
    static template = xml`
        <Dialog title="props.title" size="'xl'" footer="false" withBodyPadding="false">
            <iframe t-ref="journey" t-on-load="onJourneyLoad" t-att-src="props.url" t-att-title="props.title"
                style="display:block;width:100%;height:78vh;border:0;"/>
        </Dialog>`;
    setup() {
        this.journey = useRef("journey");
        onWillUnmount(() => clearTimeout(this.successTimer));
    }
    onJourneyLoad() {
        clearTimeout(this.successTimer);
        let completed = false;
        try {
            completed = Boolean(this.journey.el?.contentDocument?.querySelector('[data-visitor-registration-complete="true"]'));
        } catch (_) {
            // A page outside this origin cannot signal completion of this visit.
        }
        if (completed) {
            this.successTimer = setTimeout(() => {
                this.props.close();
                window.location.reload();
            }, 3000);
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
