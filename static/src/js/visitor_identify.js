/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { ListController } from "@web/views/list/list_controller";
import { FormController } from "@web/views/form/form_controller";

patch(ListController.prototype, {
    async createRecord(...args) {
        if (this.props.resModel === "ar.visitor.visit") {
            return this.env.services.action.doAction("ar_visitors.action_ar_visitor_identify");
        }
        return super.createRecord(...args);
    },
});
patch(FormController.prototype, {
    async create(...args) {
        if (this.props.resModel === "ar.visitor.visit") {
            const record = this.model.root;
            if (await record.isDirty()) {
                const saved = await record.save({
                    onError: (error, options) => this.onSaveError(error, options, true),
                });
                if (!saved) {
                    return;
                }
            }
            return this.env.services.action.doAction("ar_visitors.action_ar_visitor_identify");
        }
        return super.create(...args);
    },
});
