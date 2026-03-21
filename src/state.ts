/**
 * Shared volatile state between plugin.ts and actions.
 * Extracted to avoid circular imports.
 */

/** Node info received from NMOS Simple BCC via WebSocket. */
export interface NmosNode {
    id: string;
    name: string;
    is04_url: string;
}

/** Currently selected Receiver (set by pressing a Receiver button). */
export interface SelectedReceiver {
    receiverId: string;
    is05Url: string;
    is05Version: string;
    label: string;
}

export let bccNodes: NmosNode[] = [];
export let selectedReceiver: SelectedReceiver | null = null;

export function setBccNodes(nodes: NmosNode[]): void {
    bccNodes = nodes;
}

export function setSelectedReceiver(r: SelectedReceiver | null): void {
    selectedReceiver = r;
}
