/** @odoo-module **/
import { Component, xml } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { registry } from "@web/core/registry";

class VisitorKioskDialog extends Component {
    static components = { Dialog };
    static props = { close: Function, url: String, title: String };
    static template = xml`
        <Dialog title="props.title" size="'xl'" footer="false" withBodyPadding="false">
            <iframe t-att-src="props.url" t-att-title="props.title"
                style="display:block;width:100%;height:78vh;border:0;"/>
        </Dialog>`;
}

registry.category("actions").add("ar_visitors.open_kiosk", (env, action) => {
    env.services.dialog.add(VisitorKioskDialog, { url: action.params.url, title: action.params.title || "Parcours visiteur" }, {
        onClose: () => env.services.action.doAction({ type: "ir.actions.client", tag: "soft_reload" }),
    });
});

registry.category("actions").add("ar_visitors.start_journey", async (env, action) => {
    const { form_action, visit_id } = action.params;
    await env.services.action.doAction(form_action);
    const journey = await env.services.orm.call("ar.visitor.visit", "action_open_kiosk", [[visit_id]], {
        context: form_action.context,
    });
    await env.services.action.doAction(journey);
});
