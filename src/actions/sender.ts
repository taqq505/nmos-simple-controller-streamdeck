import streamDeck, { action, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { executeIsTake, fetchResources } from "../nmos";
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
    /** Selected sender UUID */
    senderId?: string;
    /** Sender display label (used as button title) */
    senderLabel?: string;

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

@action({ UUID: "com.taqq505.nmos-simple-controller.sender" })
export class SenderAction extends SingletonAction<SenderSettings> {

    /** Set button title to the configured sender label. */
    override async onWillAppear(ev: WillAppearEvent<SenderSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        const { settings } = ev.payload;
        await ev.action.setTitle(settings.senderLabel || "Sender");
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
            await ev.action.showAlert();
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
                await ev.action.showAlert();
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
            await ev.action.showAlert();
            return;
        }

        streamDeck.logger.info(
            `SenderAction: TAKE sender=${settings.senderId} → receiver=${receiverId}`
        );

        try {
            await executeIsTake(receiverId, settings.senderId, receiverIs05Url, receiverIs05Version);
            await ev.action.showOk();
        } catch (e) {
            streamDeck.logger.error(`SenderAction: TAKE failed – ${e}`);
            await ev.action.showAlert();
        }
    }

    /** Handle messages from the Property Inspector. */
    override async onSendToPlugin(
        ev: SendToPluginEvent<JsonValue, SenderSettings>
    ): Promise<void> {
        const req = ev.payload as unknown as PIRequest;

        if (req.event === "getNodeList") {
            await ev.action.sendToPropertyInspector({ event: "nodeList", nodes: bccNodes });
            return;
        }

        if (req.event === "fetchResources") {
            try {
                const { senders, receivers, is05Url, is05Version } =
                    await fetchResources(req.is04Url);
                await ev.action.sendToPropertyInspector({
                    event: "resources",
                    senders,
                    receivers,
                    is05Url,
                    is05Version,
                });
            } catch (e) {
                streamDeck.logger.error(`SenderAction: fetchResources failed – ${e}`);
                await ev.action.sendToPropertyInspector({
                    event: "error",
                    message: String(e),
                });
            }
        }
    }
}
