/** @odoo-module **/
import { Component, onWillUnmount, useRef, useState, xml } from "@odoo/owl";
import { registry } from "@web/core/registry";
import { useService } from "@web/core/utils/hooks";
import { loadJS } from "@web/core/assets";

let modelsReady;
function loadModels() {
    if (!modelsReady) {
        modelsReady = (async () => {
            if (!window.faceapi) {
                await loadJS("/sttl_face_attendance/static/face-api/dist/face-api.js");
            }
            const root = "/sttl_face_attendance/static/face-api/weights/";
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(root),
                faceapi.nets.faceLandmark68Net.loadFromUri(root),
                faceapi.nets.faceRecognitionNet.loadFromUri(root),
            ]);
        })().catch((error) => { modelsReady = null; throw error; });
    }
    return modelsReady;
}

class VisitorFaceAttendance extends Component {
    static template = xml`
        <div class="ar_face_screen">
            <div class="ar_face_panel">
                <span class="ar_face_badge">AR VISITORS</span>
                <h1>Reconnaissance faciale</h1>
                <p>Présentez un seul visage face à la caméra pour rechercher un visiteur.</p>
                <div class="ar_face_camera">
                    <video t-ref="video" autoplay="autoplay" playsinline="playsinline" muted="muted"/>
                    <div t-if="state.retryMessage" class="ar_face_retry_overlay" role="status" aria-live="polite">
                        <t t-esc="state.retryMessage"/>
                    </div>
                </div>
                <div class="ar_face_controls">
                    <button class="btn btn-primary" t-on-click="startCamera" t-att-disabled="state.busy || state.redirecting">Activer la caméra</button>
                    <button class="btn btn-primary" t-on-click="capture" t-att-disabled="state.busy || state.redirecting || !state.camera">Reconnaître le visiteur</button>
                    <button class="btn btn-light" t-on-click="manual" t-att-disabled="state.busy || state.redirecting">Saisir CIN / passeport</button>
                    <button class="btn btn-outline-primary" t-on-click="beginCheckout" t-att-disabled="state.busy || state.redirecting">Marquer une sortie</button>
                </div>
                <p class="ar_face_status" role="status" t-esc="state.message"/>
                <div t-if="state.person &amp;&amp; state.mode === 'arrival'" class="ar_face_identity_overlay">
                    <div class="ar_face_identity_card" role="dialog" aria-modal="true" aria-live="polite" aria-label="Identity confirmation">
                        <img t-if="state.person.image" t-att-src="'data:image/jpeg;base64,' + state.person.image" alt="Recognized visitor"/>
                        <div t-else="" class="ar_face_avatar" aria-hidden="true"><t t-esc="initials"/></div>
                        <div class="ar_face_identity_details">
                            <span class="ar_face_identity_label">RECOGNIZED VISITOR</span>
                            <h2><t t-esc="state.person.first_name"/> <t t-esc="state.person.last_name"/></h2>
                            <p t-if="state.person.nationality"><strong>Nationality:</strong> <t t-esc="state.person.nationality"/></p>
                            <p class="ar_face_identity_question">Is this you?</p>
                            <div class="ar_face_identity_actions">
                                <button class="btn btn-primary" t-on-click="confirmIdentity" t-att-disabled="state.busy">Yes, this is me</button>
                                <button class="btn btn-outline-secondary" t-on-click="rejectIdentity" t-att-disabled="state.busy">No, this isn't me</button>
                            </div>
                        </div>
                    </div>
                </div>
                <div t-if="state.captured &amp;&amp; !state.busy &amp;&amp; !state.person &amp;&amp; state.mode === 'arrival'" class="ar_face_result">
                    <img t-att-src="'data:image/jpeg;base64,' + state.captured" alt="Photo capturée"/>
                    <p t-if="state.match">Une correspondance a été trouvée. Continuez pour ouvrir le parcours visiteur.</p>
                    <p t-else="">Aucune correspondance fiable. Continuez pour identifier le visiteur par CIN / passeport.</p>
                    <button class="btn btn-primary" t-on-click="continueVisit">Continuer</button>
                </div>
                <div t-if="state.mode === 'checkout' &amp;&amp; state.checkoutError &amp;&amp; !state.busy" class="ar_face_result">
                    <p t-esc="state.message"/>
                    <button class="btn btn-primary" t-on-click="retryCheckoutRecognition">Refaire la reconnaissance faciale</button>
                </div>
            </div>
        </div>`;
    setup() {
        this.orm = useService("orm");
        this.action = useService("action");
        this.video = useRef("video");
        this.state = useState({ busy: false, camera: false, redirecting: false, message: "", retryMessage: "", captured: "", match: false, person: false, mode: "arrival", checkoutError: false, attempt: 0, attemptLimit: 3, retryDelay: 1.5 });
        this.alive = true;
        onWillUnmount(() => { this.alive = false; clearTimeout(this.retryTimer); this.stopCamera(); });
    }
    stopCamera() {
        this.stream?.getTracks().forEach((track) => track.stop());
        this.stream = null;
        this.state.camera = false;
    }
    async startCamera() {
        if (this.state.busy || this.state.redirecting) return;
        this.state.message = "";
        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error("La caméra nécessite HTTPS ou localhost.");
            }
            this.stopCamera();
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
            if (!this.alive) { stream.getTracks().forEach((t) => t.stop()); return; }
            this.stream = stream;
            this.video.el.srcObject = stream;
            await this.video.el.play();
            this.state.camera = true;
        } catch (error) {
            this.stopCamera();
            this.state.message = error.message || "Impossible d’accéder à la caméra.";
        }
    }
    async capture() {
        const video = this.video.el;
        if (!video.videoWidth) { this.state.message = "Attendez que la caméra soit prête."; return; }
        clearTimeout(this.retryTimer);
        this.state.attempt = 0;
        try {
            this.state.attemptLimit = await this.orm.call("ar.visitor.face.bridge", "recognition_attempt_limit", []);
        } catch (_) { this.state.attemptLimit = 3; }
        try {
            this.state.retryDelay = await this.orm.call("ar.visitor.face.bridge", "recognition_retry_delay", []);
        } catch (_) { this.state.retryDelay = 1.5; }
        await this.recognize(video, true);
    }
    async beginCheckout() {
        if (this.state.busy || this.state.redirecting) return;
        this.stopCamera();
        this.state.mode = "checkout";
        this.state.captured = "";
        this.state.match = false;
        this.state.person = false;
        this.state.checkoutError = false;
        this.state.message = "Présentez le visage du visiteur pour enregistrer sa sortie.";
        await this.startCamera();
    }
    async recognize(source, fromCamera = false) {
        if (this.state.busy || this.state.redirecting) return;
        this.state.busy = true; this.state.captured = ""; this.state.match = false; this.state.person = false; this.state.checkoutError = false;
        this.state.retryMessage = "";
        this.state.attempt += 1;
        this.state.message = "Chargement du moteur facial…";
        try {
            await loadModels();
            if (!this.alive) return;
            const options = new faceapi.TinyFaceDetectorOptions();
            // Freeze the frame so recognition and the saved photo refer to the same image.
            const canvas = document.createElement("canvas");
            const width = source.videoWidth || source.naturalWidth;
            const height = source.videoHeight || source.naturalHeight;
            const scale = Math.min(1, 1280 / Math.max(width, height));
            canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
            canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
            const detected = await faceapi.detectAllFaces(canvas, options).withFaceLandmarks().withFaceDescriptors();
            if (detected.length !== 1) {
                const reason = detected.length ? "Plusieurs visages détectés. Présentez une seule personne." : "Aucun visage détecté. Regardez la caméra et restez immobile.";
                if (this.scheduleRetry(reason)) return;
                this.state.message = reason;
                this.state.checkoutError = this.state.mode === "checkout";
                return;
            }
            const distances = [];
            let after = 0, count = 0;
            do {
                const batch = await this.orm.call("ar.visitor.face.bridge", "reference_photos", [after]);
                for (const person of batch.people) {
                    if (!this.alive) return;
                    let best = Infinity;
                    for (const data of person.images) {
                        try {
                            const image = await faceapi.bufferToImage(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))]));
                            const refs = await faceapi.detectAllFaces(image, options).withFaceLandmarks().withFaceDescriptors();
                            if (refs.length === 1) best = Math.min(best, faceapi.euclideanDistance(detected[0].descriptor, refs[0].descriptor));
                        } catch (_) { /* An unusable reference must not prevent checking the other photos. */ }
                    }
                    if (Number.isFinite(best)) distances.push({ id: person.id, distance: best });
                    this.state.message = "Comparaison des photos : " + (++count) + " personne(s)…";
                }
                after = batch.next_id;
            } while (after && this.alive);
            if (!this.alive) return;
            distances.sort((a,b) => a.distance-b.distance);
            const first = distances[0], second = distances[1];
            // Same threshold as the installed module, with an ambiguity margin.
            this.state.match = first && first.distance < 0.45 && (!second || second.distance-first.distance >= 0.05) ? first.id : false;
            this.state.captured = canvas.toDataURL("image/jpeg", .9).split(",")[1];
            if (this.state.match) {
                if (this.state.mode === "checkout") {
                    this.stopCamera();
                    await this.openCheckout(this.state.match);
                    return;
                }
                this.state.message = "";
                this.state.person = await this.orm.call("ar.visitor.face.bridge", "recognition_person", [this.state.match]);
            } else {
                if (this.scheduleRetry("Correspondance incertaine. Gardez le visage face à la caméra.")) return;
                this.state.message = "Visiteur inconnu ou correspondance incertaine.";
                this.state.checkoutError = this.state.mode === "checkout";
                if (this.state.checkoutError) this.state.captured = "";
            }
            this.stopCamera();
        } catch (error) {
            this.state.message = this.safeErrorMessage(error, "La reconnaissance faciale a échoué. Veuillez réessayer.");
            this.state.checkoutError = this.state.mode === "checkout";
        } finally { this.state.busy = false; }
    }
    scheduleRetry(reason) {
        if (!this.alive || !this.state.camera || this.state.attempt >= this.state.attemptLimit) return false;
        this.state.retryMessage = `Nouvelle tentative automatique (${this.state.attempt + 1}/${this.state.attemptLimit})…`;
        this.state.message = reason;
        this.retryTimer = setTimeout(() => {
            if (this.alive && this.state.camera && !this.state.busy) this.recognize(this.video.el, true);
        }, this.state.retryDelay * 1000);
        return true;
    }
    get initials() {
        const person = this.state.person;
        return person ? `${person.first_name?.[0] || ""}${person.last_name?.[0] || ""}`.toUpperCase() : "";
    }
    async confirmIdentity() {
        await this.continueVisit();
    }
    async openCheckout(personId) {
        try {
            const action = await this.orm.call("ar.visitor.face.bridge", "checkout_for_person", [personId]);
            if (!this.alive) return;
            await this.action.doAction(action);
        } catch (error) {
            if (!this.alive) return;
            this.state.captured = "";
            this.state.match = false;
            this.state.message = this.checkoutErrorMessage(error);
            this.state.checkoutError = true;
        }
    }
    checkoutErrorMessage(error) {
        return this.safeErrorMessage(
            error,
            "Impossible de préparer la sortie pour le moment. Vérifiez qu'une visite est en cours, puis réessayez."
        );
    }
    safeErrorMessage(error, fallback) {
        const message = error?.message || "";
        return message && !/odoo server error/i.test(message) ? message : fallback;
    }
    async retryCheckoutRecognition() {
        if (this.state.busy) return;
        this.state.captured = "";
        this.state.match = false;
        this.state.person = false;
        this.state.checkoutError = false;
        this.state.attempt = 0;
        await this.startCamera();
    }
    rejectIdentity() {
        if (this.state.busy) return;
        this.state.person = false;
        this.state.match = false;
        this.state.captured = "";
        this.state.message = "Identity not confirmed. Please try again or enter your CIN / passport.";
    }
    async continueVisit() {
        if (!this.alive || this.state.busy || this.openingJourney || !this.state.captured) return;
        this.openingJourney = true;
        this.state.busy = true;
        try {
            const action = await this.orm.call("ar.visitor.face.bridge", "start_visit", [this.state.captured, this.state.match || false]);
            if (!this.alive) return;
            this.stopCamera();
            await this.action.doAction(action);
            if (this.alive) {
                this.state.captured = "";
                this.state.person = false;
                this.state.message = "Parcours ouvert.";
            }
        } catch (error) {
            if (this.alive) this.state.message = this.safeErrorMessage(error, "Impossible d’ouvrir le parcours. Réessayez avec Continuer.");
        } finally {
            this.openingJourney = false;
            if (this.alive) { this.state.busy = false; this.state.redirecting = false; }
        }
    }
    async manual() {
        if (this.state.busy || this.state.redirecting) return;
        this.stopCamera();
        await this.action.doAction("ar_visitors.action_ar_visitor_identify");
    }
}
registry.category("actions").add("ar_visitors.face_attendance", VisitorFaceAttendance);
