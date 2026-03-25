import streamDeck, { action, DidReceiveSettingsEvent, KeyAction, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { executeIsTake, fetchResources } from "../nmos";
import { senderImage, senderFixedImage, senderFlashImage, senderFixedFlashImage, senderErrorImage, senderFixedErrorImage } from "../images";
import { bccNodes, selectedReceiver } from "../state";

// ---------------------------------------------------------------------------
// Settings type
// ---------------------------------------------------------------------------

export type SenderSettings = {
    // --- Sender source ---
    /** How the sender's IS-04 URL is determined */
    senderMode?: "manual" | "bcc";
    /** IS-04 URL for the sender node (manual mode) */
    senderIs04Url?: string;
    /** BCC node id for the sender node (bcc mode) */
    senderBccNodeId?: string;
    /** BCC node display name for the sender */
    senderNodeLabel?: string;
    /** Selected sender UUID */
    senderId?: string;
    /** Sender display label (used as button title) */
    senderLabel?: string;
    /** Sender manifest_href (SDP URL) – required for IS-05 TAKE */
    senderManifestHref?: string;

    // --- Target receiver ---
    /**
     * How the target receiver is determined:
     * - "selector" : use the globally selected Receiver button
     * - "manual"   : IS-04 URL entered by user
     * - "bcc"      : use a BCC node's IS-04
     */
    receiverMode?: "selector" | "manual" | "bcc";
    /** IS-04 URL for the receiver node (manual mode) */
    receiverIs04Url?: string;
    /** BCC node id for the receiver node (bcc mode) */
    receiverBccNodeId?: string;
    /** Selected receiver UUID (manual / bcc mode) */
    receiverId?: string;
    /** Receiver display label */
    receiverLabel?: string;
    /** Cached IS-05 base URL for the receiver (manual / bcc mode) */
    receiverIs05Url?: string;
    /** Cached IS-05 version string for the receiver (manual / bcc mode) */
    receiverIs05Version?: string;
};

// ---------------------------------------------------------------------------
// PI message shapes
// ---------------------------------------------------------------------------

type PIRequest =
    | { event: "getNodeList" }
    | { event: "fetchResources"; is04Url: string };

// ---------------------------------------------------------------------------
// Action
// ---------------------------------------------------------------------------

/** Blink red border 3 times to signal an error. */
async function blinkError(action: KeyAction<SenderSettings>, settings: SenderSettings): Promise<void> {
    const title = buildSenderTitle(settings);
    const isFixed = (settings.receiverMode ?? "selector") !== "selector";
    const errorImg = isFixed ? senderFixedErrorImage(title) : senderErrorImage(title);
    const normalImg = isFixed ? senderFixedImage(title) : senderImage(title);
    for (let i = 0; i < 3; i++) {
        await action.setImage(errorImg);
        await new Promise(r => setTimeout(r, 200));
        await action.setImage(normalImg);
        await new Promise(r => setTimeout(r, 200));
    }
}

/** Build button title: "NodeName\nSenderName" when both are available. */
function buildSenderTitle(settings: SenderSettings): string {
    const node = settings.senderNodeLabel?.trim();
    const sender = settings.senderLabel?.replace(/^\[.*?\]\s*/, '').trim();
    if (node && sender) return `${node}\n${sender}`;
    if (sender) return sender;
    if (node) return node;
    return "Sender";
}

@action({ UUID: "com.taqq505.nmos-simple-controller.sender" })
export class SenderAction extends SingletonAction<SenderSettings> {

    /** Set button title to the configured sender label. */
    override async onWillAppear(ev: WillAppearEvent<SenderSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        await this.applyVisuals(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<SenderSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        await this.applyVisuals(ev.action, ev.payload.settings);
    }

    private async applyVisuals(action: KeyAction<SenderSettings>, settings: SenderSettings): Promise<void> {
        const title = buildSenderTitle(settings);
        const img = (settings.receiverMode ?? "selector") === "selector"
            ? senderImage(title)
            : senderFixedImage(title);
        await action.setImage(img);
        await action.setTitle(""); // title is rendered inside SVG
    }

    /**
     * Press → execute IS-05 TAKE.
     * Target receiver is resolved according to receiverMode:
     *   - "selector" : uses the globally selected Receiver button
     *   - "manual" / "bcc" : uses cached receiverId + receiverIs05Url from settings
     */
    override async onKeyDown(ev: KeyDownEvent<SenderSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        const { settings } = ev.payload;

        if (!settings.senderId) {
            streamDeck.logger.warn("SenderAction: senderId not configured");
            await blinkError(ev.action, settings);
            return;
        }

        // Resolve target receiver
        let receiverId: string | undefined;
        let receiverIs05Url: string | undefined;
        let receiverIs05Version: string | undefined;

        const mode = settings.receiverMode ?? "selector";

        if (mode === "selector") {
            if (!selectedReceiver) {
                streamDeck.logger.warn("SenderAction: no Receiver selected");
                await blinkError(ev.action, settings);
                return;
            }
            receiverId = selectedReceiver.receiverId;
            receiverIs05Url = selectedReceiver.is05Url;
            receiverIs05Version = selectedReceiver.is05Version;
        } else {
            receiverId = settings.receiverId;
            receiverIs05Url = settings.receiverIs05Url;
            receiverIs05Version = settings.receiverIs05Version;
        }

        if (!receiverId || !receiverIs05Url || !receiverIs05Version) {
            streamDeck.logger.warn("SenderAction: receiver not fully configured");
            await blinkError(ev.action, settings);
            return;
        }

        // streamDeck.logger.info(`SenderAction: TAKE sender=${settings.senderId} → receiver=${receiverId}`);

        try {
            const result = await executeIsTake(receiverId, settings.senderId, settings.senderManifestHref ?? null, receiverIs05Url, receiverIs05Version);
            // streamDeck.logger.info(`SenderAction: TAKE result – ${JSON.stringify(result)}`);
            // Flash the button brighter briefly on success
            const title = buildSenderTitle(settings);
            const isFixed = (settings.receiverMode ?? "selector") !== "selector";
            await ev.action.setImage(isFixed ? senderFixedFlashImage(title) : senderFlashImage(title));
            await new Promise(resolve => setTimeout(resolve, 1000));
            await this.applyVisuals(ev.action, settings);
        } catch (e) {
            streamDeck.logger.error(`SenderAction: TAKE failed – ${e}`);
            await blinkError(ev.action, settings);
        }
    }

    /** Handle messages from the Property Inspector. */
    override async onSendToPlugin(
        ev: SendToPluginEvent<JsonValue, SenderSettings>
    ): Promise<void> {
        const req = ev.payload as unknown as PIRequest;

        const send = (payload: unknown) =>
            streamDeck.ui.sendToPropertyInspector(payload as Parameters<typeof streamDeck.ui.sendToPropertyInspector>[0]);

        if (req.event === "getNodeList") {
            await send({ event: "nodeList", nodes: bccNodes });
            return;
        }

        if (req.event === "fetchResources") {
            try {
                const { senders, receivers, is05Url, is05Version } =
                    await fetchResources(req.is04Url);
                await send({ event: "resources", senders, receivers, is05Url, is05Version });
            } catch (e) {
                streamDeck.logger.error(`SenderAction: fetchResources failed – ${e}`);
                await send({ event: "error", message: String(e) });
            }
        }
    }
}
