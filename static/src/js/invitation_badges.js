/** @odoo-module **/
import { Component } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { _t } from "@web/core/l10n/translation";
import { standardFieldProps } from "@web/views/fields/standard_field_props";
import { listView } from "@web/views/list/list_view";
import { ListRenderer } from "@web/views/list/list_renderer";
import { kanbanView } from "@web/views/kanban/kanban_view";
import { KanbanRenderer } from "@web/views/kanban/kanban_renderer";

export function invitationKind(data) {
    return data.is_shared ? "shared" : data.parent_id ? "registration" : "email";
}

class InvitationTypeBadge extends Component {
    static template = "ar_visitors.InvitationTypeBadge";
    static props = { ...standardFieldProps };
    get kind() { return invitationKind(this.props.record.data); }
    get label() {
        return { email: _t("E-mail"), shared: _t("Lien partagé"), registration: _t("Via lien partagé") }[this.kind];
    }
    get icon() { return { email: "fa-envelope-o", shared: "fa-link", registration: "fa-user-o" }[this.kind]; }
}
registry.category("fields").add("ar_invitation_type", {
    component: InvitationTypeBadge,
    supportedTypes: ["boolean"],
});

class InvitationListRenderer extends ListRenderer {
    static template = "ar_visitors.InvitationListRenderer";
}
class InvitationKanbanRenderer extends KanbanRenderer {
    static template = "ar_visitors.InvitationKanbanRenderer";
}
registry.category("views").add("ar_invitation_list", { ...listView, Renderer: InvitationListRenderer });
registry.category("views").add("ar_invitation_kanban", { ...kanbanView, Renderer: InvitationKanbanRenderer });
