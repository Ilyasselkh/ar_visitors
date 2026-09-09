/** @odoo-module **/
import { Component, xml } from "@odoo/owl";
import { Dialog } from "@web/core/dialog/dialog";
import { registry } from "@web/core/registry";

class VisitorKioskDialog extends Component {
    static components = { Dialog };
    static props = { close: Function, url: String };
    static template = xml`
        <Dialog title="'Parcours visiteur'" size="'xl'" footer="false" withBodyPadding="false">
            <iframe t-att-src="props.url" title="Parcours visiteur"
                style="display:block;width:100%;height:78vh;border:0;"/>
        </Dialog>`;
}

registry.category("actions").add("ar_visitors.open_kiosk", (env, action) => {
    env.services.dialog.add(VisitorKioskDialog, { url: action.params.url }, {
        onClose: () => env.services.action.doAction({ type: "ir.actions.client", tag: "soft_reload" }),
    });
});
