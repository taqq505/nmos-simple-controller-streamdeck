import streamDeck, { action, DidReceiveSettingsEvent, KeyAction, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { fetchResources } from "../nmos";
import { receiverImage, receiverSelectedImage } from "../images";
import { bccNodes, selectedReceiver, setSelectedReceiver } from "../state";

// ---------------------------------------------------------------------------
// Settings type
// ---------------------------------------------------------------------------

export type ReceiverSettings = {
    /** How the IS-04 URL is determined */
    sourceMode?: "manual" | "bcc";
    /** IS-04 URL (manual mode) */
    is04Url?: string;
    /** BCC node id (bcc mode) */
    bccNodeId?: string;
    /** BCC node display name – shown as first line of button title */
    nodeLabel?: string;
    /** Selected receiver UUID – persisted for standalone TAKE */
    receiverId?: string;
    /** Display label (receiver name) – shown as second line of button title */
    receiverLabel?: string;
    /** Cached IS-05 base URL – persisted so TAKE works without BCC */
    is05Url?: string;
    /** Cached IS-05 version string */
    is05Version?: string;
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

/** Build button title: "NodeName\nReceiverName" when both are available. */
function buildReceiverTitle(settings: ReceiverSettings): string {
    const node = settings.nodeLabel?.trim();
    // Strip "[format] " prefix from receiverLabel for compactness
    const receiver = settings.receiverLabel?.replace(/^\[.*?\]\s*/, '').trim();
    if (node && receiver) return `${node}\n${receiver}`;
    if (receiver) return receiver;
    if (node) return node;
    return "Receiver";
}

@action({ UUID: "com.taqq505.nmos-simple-controller.receiver" })
export class ReceiverAction extends SingletonAction<ReceiverSettings> {

    /** Restore title and selected visual state when button becomes visible. */
    override async onWillAppear(ev: WillAppearEvent<ReceiverSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        await this.applyVisuals(ev.action, ev.payload.settings);
    }

    override async onDidReceiveSettings(ev: DidReceiveSettingsEvent<ReceiverSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        await this.applyVisuals(ev.action, ev.payload.settings);
    }

    private async applyVisuals(action: KeyAction<ReceiverSettings>, settings: ReceiverSettings): Promise<void> {
        const title = buildReceiverTitle(settings);
        const isSelected = !!settings.receiverId && settings.receiverId === selectedReceiver?.receiverId;
        await action.setState(isSelected ? 1 : 0);
        await action.setImage(isSelected ? receiverSelectedImage(title) : receiverImage(title));
        await action.setTitle(""); // title is rendered inside SVG
    }

    /**
     * Press → mark this receiver as the global selection.
     * All other Receiver buttons are deselected (state 0).
     */
    override async onKeyDown(ev: KeyDownEvent<ReceiverSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        const { settings } = ev.payload;

        if (!settings.receiverId || !settings.is05Url || !settings.is05Version) {
            streamDeck.logger.warn("ReceiverAction: button not configured – showing alert");
            await ev.action.showAlert();
            return;
        }

        // Deselect every visible Receiver button
        for (const a of this.actions) {
            if (a.isKey()) {
                const s = (await a.getSettings()) as ReceiverSettings;
                await a.setState(0);
                await a.setImage(receiverImage(buildReceiverTitle(s)));
            }
        }

        // Highlight this one
        await ev.action.setState(1);
        await ev.action.setImage(receiverSelectedImage(buildReceiverTitle(settings)));

        setSelectedReceiver({
            receiverId: settings.receiverId,
            is05Url: settings.is05Url,
            is05Version: settings.is05Version,
            label: settings.receiverLabel || "Receiver",
        });

        streamDeck.logger.debug(`ReceiverAction: selected "${settings.receiverLabel}" (${settings.receiverId})`);
    }

    /** Handle messages from the Property Inspector. */
    override async onSendToPlugin(
        ev: SendToPluginEvent<JsonValue, ReceiverSettings>
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
                const { receivers, is05Url, is05Version } = await fetchResources(req.is04Url);
                await send({ event: "resources", receivers, is05Url, is05Version });
            } catch (e) {
                streamDeck.logger.error(`ReceiverAction: fetchResources failed – ${e}`);
                await send({ event: "error", message: String(e) });
            }
        }
    }
}
