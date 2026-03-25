import streamDeck from "@elgato/streamdeck";
import { WebSocketServer } from "ws";

import { ReceiverAction } from "./actions/receiver";
import { SenderAction } from "./actions/sender";
import { setBccNodes, type NmosNode } from "./state";

// ---------------------------------------------------------------------------
// WebSocket server (port 57284)
// BCC is the client; plugin is the server.
// One-way: BCC → Plugin (node_list messages only).
// ---------------------------------------------------------------------------

const wss = new WebSocketServer({ port: 57284 });

wss.on("listening", () => {
    streamDeck.logger.info("WebSocket server listening on ws://localhost:57284");
});

wss.on("connection", ws => {
    streamDeck.logger.info("BCC connected via WebSocket");

    ws.on("message", raw => {
        try {
            const msg = JSON.parse(raw.toString()) as { type?: string; nodes?: NmosNode[] };
            if (msg.type === "node_list" && Array.isArray(msg.nodes)) {
                setBccNodes(msg.nodes);
                streamDeck.logger.debug(`Received node_list: ${msg.nodes.length} node(s) from BCC`);
            }
        } catch {
            // Ignore malformed messages
        }
    });

    ws.on("close", () => {
        streamDeck.logger.info("BCC disconnected");
    });

    ws.on("error", err => {
        streamDeck.logger.warn(`BCC WebSocket error: ${err.message}`);
    });
});

wss.on("error", err => {
    streamDeck.logger.error(`WebSocket server error: ${err.message}`);
});

// ---------------------------------------------------------------------------
// Stream Deck setup
// ---------------------------------------------------------------------------

streamDeck.logger.setLevel("warn"); // change to "trace" to re-enable debug logging

streamDeck.actions.registerAction(new ReceiverAction());
streamDeck.actions.registerAction(new SenderAction());

streamDeck.connect();
