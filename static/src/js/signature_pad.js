/** @odoo-module **/
import { Component, onMounted, useRef, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { standardFieldProps } from "@web/views/fields/standard_field_props";

class VisitorSignaturePad extends Component {
    static template = xml`
        <div class="ar_signature_pad">
            <canvas t-ref="canvas" aria-label="Signature du visiteur"
                t-on-pointerdown="start" t-on-pointermove="draw" t-on-pointerup="finish"
                t-on-pointercancel="finish" t-on-pointerleave="finish"/>
            <div class="ar_signature_pad_hint"><i class="fa fa-pencil" aria-hidden="true"/> <t t-esc="labels.hint"/></div>
            <button type="button" class="ar_signature_clear" t-on-click="clear"><i class="fa fa-eraser" aria-hidden="true"/> <t t-esc="labels.clear"/></button>
        </div>`;
    static props = { ...standardFieldProps };

    setup() {
        this.canvas = useRef("canvas");
        this.drawing = false;
        onMounted(() => this.prepareCanvas());
    }
    get labels() {
        const language = this.props.record.data.language || "fr";
        return {
            fr: { hint: "Signez directement dans la zone ci-dessus", clear: "Effacer la signature" },
            en: { hint: "Sign directly in the area above", clear: "Clear signature" },
            es: { hint: "Firme directamente en el área de arriba", clear: "Borrar firma" },
            ar: { hint: "وقّع مباشرة في المنطقة أعلاه", clear: "مسح التوقيع" },
        }[language] || { hint: "Signez directement dans la zone ci-dessus", clear: "Effacer la signature" };
    }
    prepareCanvas() {
        const canvas = this.canvas.el;
        const ratio = window.devicePixelRatio || 1;
        const box = canvas.getBoundingClientRect();
        canvas.width = Math.max(1, Math.round(box.width * ratio));
        canvas.height = Math.max(1, Math.round(box.height * ratio));
        const context = canvas.getContext("2d");
        context.scale(ratio, ratio);
        context.lineCap = "round";
        context.lineJoin = "round";
        context.strokeStyle = "#24324a";
        context.lineWidth = 2.5;
    }
    point(event) {
        const box = this.canvas.el.getBoundingClientRect();
        return { x: event.clientX - box.left, y: event.clientY - box.top };
    }
    start(event) {
        event.preventDefault();
        this.drawing = true;
        this.canvas.el.setPointerCapture?.(event.pointerId);
        const point = this.point(event);
        const context = this.canvas.el.getContext("2d");
        context.beginPath();
        context.moveTo(point.x, point.y);
    }
    draw(event) {
        if (!this.drawing) return;
        event.preventDefault();
        const point = this.point(event);
        const context = this.canvas.el.getContext("2d");
        context.lineTo(point.x, point.y);
        context.stroke();
    }
    async finish(event) {
        if (!this.drawing) return;
        this.drawing = false;
        this.canvas.el.releasePointerCapture?.(event.pointerId);
        await this.props.record.update({
            [this.props.name]: this.canvas.el.toDataURL("image/png").split(",")[1],
        });
    }
    async clear() {
        const canvas = this.canvas.el;
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
        await this.props.record.update({ [this.props.name]: false });
    }
}

registry.category("fields").add("ar_signature_pad", {
    component: VisitorSignaturePad,
    supportedTypes: ["binary"],
});
