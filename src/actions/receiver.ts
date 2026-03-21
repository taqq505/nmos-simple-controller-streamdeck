import streamDeck, { action, KeyDownEvent, SendToPluginEvent, SingletonAction, WillAppearEvent } from "@elgato/streamdeck";
import type { JsonValue } from "@elgato/utils";
import { fetchResources } from "../nmos";
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
    /** Selected receiver UUID – persisted for standalone TAKE */
    receiverId?: string;
    /** Display label */
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

@action({ UUID: "com.taqq505.nmos-simple-controller.receiver" })
export class ReceiverAction extends SingletonAction<ReceiverSettings> {

    /** Restore title and selected visual state when button becomes visible. */
    override async onWillAppear(ev: WillAppearEvent<ReceiverSettings>): Promise<void> {
        if (!ev.action.isKey()) return;
        const { settings } = ev.payload;

        await ev.action.setTitle(settings.receiverLabel || "Receiver");

        // Restore selected highlight if this receiver is still the global selection
        const isSelected = !!settings.receiverId && settings.receiverId === selectedReceiver?.receiverId;
        await ev.action.setState(isSelected ? 1 : 0);
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
            if (a.isKey()) await a.setState(0);
        }

        // Highlight this one
        await ev.action.setState(1);

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

        if (req.event === "getNodeList") {
            await ev.action.sendToPropertyInspector({ event: "nodeList", nodes: bccNodes });
            return;
        }

        if (req.event === "fetchResources") {
            try {
                const { receivers, is05Url, is05Version } = await fetchResources(req.is04Url);
                await ev.action.sendToPropertyInspector({
                    event: "resources",
                    receivers,
                    is05Url,
                    is05Version,
                });
            } catch (e) {
                streamDeck.logger.error(`ReceiverAction: fetchResources failed – ${e}`);
                await ev.action.sendToPropertyInspector({
                    event: "error",
                    message: String(e),
                });
            }
        }
    }
}
