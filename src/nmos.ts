/**
 * NMOS IS-04 / IS-05 client for Stream Deck Plugin (Node.js)
 *
 * Based on BCC's nmos-api.js, adapted for Node.js:
 * - No CORS restrictions
 * - No SDP parsing (transport_params built from staged state only)
 * - Native fetch (Node.js v20)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NmosSender {
    id: string;
    label: string;
    description: string;
    format: string;
}

export interface NmosReceiver {
    id: string;
    label: string;
    description: string;
    format: string;
}

export interface NmosResources {
    senders: NmosSender[];
    receivers: NmosReceiver[];
    is05Url: string;
    is05Version: string;
    version: string;
}

type StagedState = {
    transport_params?: Array<{ rtp_enabled?: boolean; [key: string]: unknown }>;
    [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// NMOSClient – IS-04 discovery + resource fetching
// ---------------------------------------------------------------------------

export class NMOSClient {
    private is04BaseUrl: string;
    private is05BaseUrl: string | null = null;
    private version: string | null = null;
    private is05Version: string | null = null;

    constructor(is04BaseUrl: string) {
        this.is04BaseUrl = is04BaseUrl.replace(/\/$/, '');
    }

    /** Discover IS-04 version and IS-05 endpoint. Must be called before getSenders/getReceivers. */
    async initialize(): Promise<{ is05Url: string; is05Version: string; version: string }> {
        const versions = await this.fetchJSON<string[]>('/x-nmos/node/');
        this.version = versions.sort().reverse()[0].replace(/\//g, '');
        await this.discoverIS05();
        return {
            is05Url: this.is05BaseUrl!,
            is05Version: this.is05Version!,
            version: this.version,
        };
    }

    private async discoverIS05(): Promise<void> {
        try {
            const devices = await this.fetchJSON<Array<{
                controls?: Array<{ type?: string; href?: string }>;
            }>>(`/x-nmos/node/${this.version}/devices/`);

            if (devices.length === 0) throw new Error('No devices found');

            const ctrl = devices[0].controls?.find(
                c => c.type && (c.type.includes('sr-ctrl') || c.type.includes('connection'))
            );

            if (ctrl?.href) {
                const href = ctrl.href.replace(/\/$/, '');
                // href may already include version: /x-nmos/connection/v1.1
                const versionMatch = href.match(/\/x-nmos\/connection\/(v\d+\.\d+)$/);
                if (versionMatch) {
                    this.is05BaseUrl = href.replace(/\/x-nmos\/connection\/v\d+\.\d+$/, '');
                    this.is05Version = versionMatch[1];
                } else {
                    this.is05BaseUrl = href;
                    const is05Versions = await this.fetchJSON<string[]>('/x-nmos/connection/', this.is05BaseUrl);
                    this.is05Version = is05Versions.sort().reverse()[0].replace(/\//g, '');
                }
                return;
            }
        } catch {
            // fall through to port guessing
        }
        await this.guessIS05Endpoint();
    }

    /** Fallback: try IS-04 port+1, 3001, IS-04 port */
    private async guessIS05Endpoint(): Promise<void> {
        const url = new URL(this.is04BaseUrl);
        const basePort = parseInt(url.port || '80');
        for (const port of [basePort + 1, 3001, basePort]) {
            try {
                const testUrl = `${url.protocol}//${url.hostname}:${port}`;
                const versions = await this.fetchJSON<string[]>('/x-nmos/connection/', testUrl);
                this.is05BaseUrl = testUrl;
                this.is05Version = versions.sort().reverse()[0].replace(/\//g, '');
                return;
            } catch {
                // try next
            }
        }
        throw new Error('Could not discover IS-05 endpoint. Check NMOS node configuration.');
    }

    async getSenders(): Promise<NmosSender[]> {
        const senders = await this.fetchJSON<Array<{
            id: string; label?: string; description?: string; flow_id?: string;
        }>>(`/x-nmos/node/${this.version}/senders/`);

        const flows = await this.fetchJSON<Array<{ id: string; format?: string }>>(
            `/x-nmos/node/${this.version}/flows/`
        );
        const flowMap = new Map(flows.map(f => [f.id, f]));

        return senders.map(s => {
            let format = 'unknown';
            if (s.flow_id) {
                const m = flowMap.get(s.flow_id)?.format?.match(/urn:x-nmos:format:(\w+)/);
                if (m) format = m[1];
            }
            return { id: s.id, label: s.label || s.id, description: s.description || '', format };
        }).sort((a, b) => a.label.localeCompare(b.label));
    }

    async getReceivers(): Promise<NmosReceiver[]> {
        const receivers = await this.fetchJSON<Array<{
            id: string; label?: string; description?: string; format?: string;
        }>>(`/x-nmos/node/${this.version}/receivers/`);

        return receivers.map(r => {
            let format = 'unknown';
            const m = r.format?.match(/urn:x-nmos:format:(\w+)/);
            if (m) format = m[1];
            return { id: r.id, label: r.label || r.id, description: r.description || '', format };
        }).sort((a, b) => a.label.localeCompare(b.label));
    }

    private async fetchJSON<T>(path: string, baseUrl?: string): Promise<T> {
        const url = (baseUrl ?? this.is04BaseUrl) + path;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText} (${url})`);
        return res.json() as Promise<T>;
    }
}

// ---------------------------------------------------------------------------
// fetchResources – convenience wrapper
// ---------------------------------------------------------------------------

export async function fetchResources(is04Url: string): Promise<NmosResources> {
    const client = new NMOSClient(is04Url);
    const info = await client.initialize();
    const [senders, receivers] = await Promise.all([
        client.getSenders(),
        client.getReceivers(),
    ]);
    return { senders, receivers, ...info };
}

// ---------------------------------------------------------------------------
// executeIsTake – IS-05 PATCH (TAKE)
// ---------------------------------------------------------------------------

/**
 * Execute IS-05 TAKE: PATCH the receiver's staged endpoint to connect to a sender.
 *
 * Steps:
 * 1. GET /staged (try with and without trailing slash) to read current transport_params
 * 2. Fallback: PATCH probe with master_enable:false if GET fails
 * 3. Build transport_params preserving existing rtp_enabled state
 * 4. PATCH with activation, master_enable:true, sender_id, transport_params
 */
export async function executeIsTake(
    receiverId: string,
    senderId: string,
    is05BaseUrl: string,
    is05Version: string
): Promise<void> {
    const { stagedPath, currentState } = await findStagedPath(receiverId, is05BaseUrl, is05Version);
    const transportParams = buildTransportParams(currentState);

    await patchStaged(is05BaseUrl + stagedPath, {
        activation: { mode: 'activate_immediate' },
        master_enable: true,
        sender_id: senderId,
        transport_params: transportParams,
    });
}

async function findStagedPath(
    receiverId: string,
    is05BaseUrl: string,
    is05Version: string
): Promise<{ stagedPath: string; currentState: StagedState | null }> {
    const base = `/x-nmos/connection/${is05Version}/single/receivers/${receiverId}/staged`;
    let lastError: unknown;

    // Prefer GET (non-invasive; handles trailing slash variance between vendors)
    for (const suffix of ['/', '']) {
        try {
            const res = await fetch(is05BaseUrl + base + suffix, {
                headers: { Accept: 'application/json' },
            });
            if (res.ok) {
                return { stagedPath: base + suffix, currentState: (await res.json()) as StagedState };
            }
        } catch (e) {
            lastError = e;
        }
    }

    // Fallback: PATCH probe with master_enable:false (safe – does not change routing)
    for (const suffix of ['/', '']) {
        try {
            const res = await fetch(is05BaseUrl + base + suffix, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ activation: { mode: 'activate_immediate' }, master_enable: false }),
            });
            if (res.ok || res.status === 202) {
                const text = await res.text();
                const state = text ? (JSON.parse(text) as StagedState) : null;
                return { stagedPath: base + suffix, currentState: state };
            }
        } catch (e) {
            lastError = e;
        }
    }

    throw new Error(`Could not determine PATCH path for receiver ${receiverId}: ${lastError}`);
}

/**
 * Build transport_params for PATCH body.
 * Preserves the existing rtp_enabled state of each leg (important for ST 2110-7 redundant streams).
 */
function buildTransportParams(staged: StagedState | null): Array<{ rtp_enabled: boolean }> {
    if (!staged?.transport_params?.length) {
        return [{ rtp_enabled: true }];
    }
    return staged.transport_params.map(p => ({
        rtp_enabled: p.rtp_enabled !== false,
    }));
}

async function patchStaged(url: string, body: unknown): Promise<void> {
    const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
    });
    if (!res.ok && res.status !== 202) {
        const text = await res.text();
        throw new Error(`PATCH failed HTTP ${res.status}: ${text || res.statusText}`);
    }
}
