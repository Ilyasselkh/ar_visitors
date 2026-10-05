/** @odoo-module **/
import { patch } from "@web/core/utils/patch";
import { ListController } from "@web/views/list/list_controller";
import { FormController } from "@web/views/form/form_controller";
import { useEffect } from "@odoo/owl";

patch(ListController.prototype, {
    async createRecord(...args) {
        if (this.props.resModel === "ar.visitor.visit") {
            return this.env.services.action.doAction("ar_visitors.action_ar_visitor_identify");
        }
        return super.createRecord(...args);
    },
});
patch(FormController.prototype, {
    async afterExecuteActionButton(clickParams) {
        await super.afterExecuteActionButton(...arguments);
        if (this.props.resModel === "ar.visitor.identify.wizard" && clickParams.special === "cancel") {
            window.location.reload();
        }
    },
    setup() {
        super.setup(...arguments);
        const visitorModels = ["ar.visitor.identify.wizard", "ar.visitor.visit", "ar.visitor.checkout.wizard"];
        if (visitorModels.includes(this.props.resModel)) {
            useEffect(() => {
                const element = this.rootRef.el?.closest(".modal-content") || this.rootRef.el;
                if (!element) return;
                const previousDir = element.getAttribute("dir");
                const previousLang = element.getAttribute("lang");
                const language = (this.props.context?.lang || "fr").split("_")[0];
                element.setAttribute("dir", language === "ar" ? "rtl" : "ltr");
                element.setAttribute("lang", language);
                return () => {
                    for (const [key, value] of [["dir", previousDir], ["lang", previousLang]]) {
                        if (value === null) element.removeAttribute(key);
                        else element.setAttribute(key, value);
                    }
                };
            }, () => [this.rootRef.el, this.props.context?.lang]);
        }
    },
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
