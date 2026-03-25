/**
 * NMOS IS-04 / IS-05 client for Stream Deck Plugin (Node.js)
 *
 * Based on BCC's nmos-api.js, adapted for Node.js:
 * - No CORS restrictions
 * - Native fetch (Node.js v20)
 */

// import streamDeck from "@elgato/streamdeck"; // uncomment to re-enable debug logging
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { URL } from 'node:url';
import { SDPParser } from './sdp-parser';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NmosSender {
    id: string;
    label: string;
    description: string;
    format: string;
    manifest_href: string | null;
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

/** Extract Set-Cookie headers from Node.js IncomingMessage headers into a Cookie header string. */
function extractCookies(headers: Record<string, string | string[] | undefined>): string {
    const raw = headers['set-cookie'];
    if (!raw) return '';
    const list = Array.isArray(raw) ? raw : [raw];
    return list.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

// Use Node.js built-in http/https modules to preserve header name case (e.g. Content-Length).
// Some devices (e.g. LV5600) have case-sensitive HTTP parsers that ignore lowercase content-length,
// causing them to silently discard the PATCH body and return the old state.
// undici normalizes all header names to lowercase; node:http preserves them as-written.

function nodeRequest(
    method: 'GET' | 'PATCH',
    url: string,
    headers: Record<string, string | number>,
    bodyStr?: string
): Promise<{ status: number; text: string; headers: Record<string, string | string[] | undefined> }> {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const reqFn = isHttps ? httpsRequest : httpRequest;
        const port = parsed.port || (isHttps ? '443' : '80');
        const path = parsed.pathname + parsed.search;

        const req = reqFn({ method, hostname: parsed.hostname, port, path, headers }, (res) => {
            let data = '';
            res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
            res.on('end', () => resolve({
                status: res.statusCode ?? 0,
                text: data,
                headers: res.headers as Record<string, string | string[] | undefined>,
            }));
        });
        req.on('error', reject);
        if (bodyStr) req.write(bodyStr);
        req.end();
    });
}

/** Simple HTTP GET using node:http – preserves header name case. */
async function httpGet(url: string, extraHeaders: Record<string, string> = {}): Promise<{ status: number; text: string; headers: Record<string, string | string[] | undefined> }> {
    return nodeRequest('GET', url, {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'http://127.0.0.1:5500/',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
    });
}

/** Simple HTTP PATCH using node:http – preserves header name case (Content-Length, etc.). */
async function httpPatch(url: string, bodyObj: unknown, extraHeaders: Record<string, string> = {}): Promise<{ status: number; text: string }> {
    const bodyStr = JSON.stringify(bodyObj);
    const { status, text } = await nodeRequest('PATCH', url, {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': 'http://127.0.0.1:5500/',
        'Accept-Language': 'en-US,en;q=0.9',
        ...extraHeaders,
    }, bodyStr);
    return { status, text };
}

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
            id: string; label?: string; description?: string; flow_id?: string; manifest_href?: string;
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
            return {
                id: s.id,
                label: s.label || s.id,
                description: s.description || '',
                format,
                manifest_href: s.manifest_href || null,
            };
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
        const { status, text } = await httpGet(url);
        if (status < 200 || status >= 300) throw new Error(`HTTP ${status} (${url})`);
        return JSON.parse(text) as T;
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
// executeIsTake – IS-05 PATCH (TAKE) – BCC patchReceiver() equivalent
// ---------------------------------------------------------------------------

/**
 * Execute IS-05 TAKE: PATCH the receiver's staged endpoint to connect to a sender.
 *
 * Steps (matches BCC's patchReceiver()):
 * 1. GET /staged to find correct path and read current transport_params
 * 2. Determine receiver port count from staged transport_params
 * 3. Fetch SDP from sender's manifest_href
 * 4. Parse SDP via SDPParser to build full transport_params + transport_file
 * 5. mergeTransportParams: preserve receiver's existing rtp_enabled state
 * 6. PATCH staged
 * 7. Wait 1000ms for activation
 * 8. GET active state to confirm
 */
export async function executeIsTake(
    receiverId: string,
    senderId: string,
    manifestHref: string | null,
    is05BaseUrl: string,
    is05Version: string
): Promise<unknown> {
    // Step 1: Find staged path and read current state
    const { stagedPath, activePath, currentState, cookies } = await findStagedPath(receiverId, is05BaseUrl, is05Version);

    // Step 2: Determine receiver port count
    const portCount = (currentState?.transport_params?.length) ?? 2;

    // Step 3 & 4: Fetch SDP and parse it
    if (!manifestHref) {
        throw new Error('Sender has no manifest_href – cannot build transport_params from SDP');
    }

    const sdpText = await fetchSDP(manifestHref);
    const parser = new SDPParser();
    const patchBody = parser.parseToJSON(sdpText, senderId, portCount);

    // Step 5: Merge to preserve receiver's existing rtp_enabled state
    if (currentState?.transport_params) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        patchBody.transport_params = mergeTransportParams(
            patchBody.transport_params as any[],
            currentState.transport_params
        ) as any;
    }

    // Step 6: PATCH (forward cookies captured from GET /staged/ – some devices require session continuity)
    const patchUrl = is05BaseUrl + stagedPath;
    // if (cookies) streamDeck.logger.info(`[nmos] forwarding cookies to PATCH: ${cookies}`);
    // streamDeck.logger.info(`[nmos] PATCH ${patchUrl} body=${JSON.stringify(patchBody)}`);

    const patchResponse = await patchStaged(patchUrl, patchBody, cookies);

    // Step 7: Wait for activation
    await new Promise(resolve => setTimeout(resolve, 20));

    // Step 8: GET active state (confirms routing completed)
    // Try with and without trailing slash – some nodes reject one or the other
    for (const path of [activePath, activePath.replace(/\/$/, '')]) {
        const activeUrl = is05BaseUrl + path;
        try {
            const { status, text } = await httpGet(activeUrl);
            if (status >= 200 && status < 300) {
                return { patchUrl, patchBody, patchResponse, activeState: JSON.parse(text) };
            }
        } catch {
            // try next
        }
    }
    // GET active failed, but PATCH already succeeded – not a fatal error
    return { patchUrl, patchBody, patchResponse, activeState: null };
}

async function fetchSDP(manifestHref: string): Promise<string> {
    const { status, text } = await httpGet(manifestHref, { accept: 'application/sdp, text/plain, */*' });
    if (status < 200 || status >= 300) {
        throw new Error(`Failed to fetch SDP from ${manifestHref}: HTTP ${status}`);
    }
    return text;
}

async function findStagedPath(
    receiverId: string,
    is05BaseUrl: string,
    is05Version: string
): Promise<{ stagedPath: string; activePath: string; currentState: StagedState | null; cookies: string }> {
    const base = `/x-nmos/connection/${is05Version}/single/receivers/${receiverId}/staged`;
    const activePath = `/x-nmos/connection/${is05Version}/single/receivers/${receiverId}/active/`;
    let lastError: unknown;

    // Prefer GET (non-invasive; handles trailing slash variance between vendors)
    for (const suffix of ['/', '']) {
        const getUrl = is05BaseUrl + base + suffix;
        try {
            const { status, text, headers } = await httpGet(getUrl);
            // streamDeck.logger.info(`[nmos] GET staged status=${status} url=${getUrl} body=${text}`);
            if (status >= 200 && status < 300) {
                return {
                    stagedPath: base + suffix,
                    activePath,
                    currentState: JSON.parse(text) as StagedState,
                    cookies: extractCookies(headers),
                };
            }
        } catch (e) {
            lastError = e;
            // streamDeck.logger.info(`[nmos] GET staged error url=${getUrl} err=${e}`);
        }
    }

    // Fallback: PATCH probe with master_enable:false (safe – does not change routing)
    for (const suffix of ['/', '']) {
        const probeUrl = is05BaseUrl + base + suffix;
        try {
            const { status, text } = await httpPatch(probeUrl, { activation: { mode: 'activate_immediate' }, master_enable: false });
            if (status >= 200 && status < 300 || status === 202) {
                const state = text ? (JSON.parse(text) as StagedState) : null;
                return { stagedPath: base + suffix, activePath, currentState: state, cookies: '' };
            }
        } catch (e) {
            lastError = e;
        }
    }

    throw new Error(`Could not determine PATCH path for receiver ${receiverId}: ${lastError}`);
}

/**
 * Merge SDP-parsed transport_params with receiver's existing params.
 * Matches BCC's nmos-api.js mergeTransportParams() exactly:
 *   - Trust the SDP parser completely for rtp_enabled (it already handles all 4 ST2110-7 cases)
 *   - Safety fallback (should never occur): receiver params with rtp_enabled forced false
 * Do NOT copy interface_ip or other receiver-specific fields into the PATCH body –
 * some devices (e.g. LV5600) reject PATCH bodies that contain interface_ip.
 */
function mergeTransportParams(
    sdpParams: Array<{ rtp_enabled?: boolean; [key: string]: unknown }>,
    receiverParams: Array<{ rtp_enabled?: boolean; [key: string]: unknown }>
): Array<{ [key: string]: unknown }> {
    const merged: Array<{ [key: string]: unknown }> = [];
    for (let i = 0; i < receiverParams.length; i++) {
        if (i < sdpParams.length) {
            // Trust what the SDP parser determined (rtp_enabled: true or false).
            // For non-7 sender → -7 receiver, sdpParams[1] is {rtp_enabled:false}
            // which explicitly disables the secondary leg.
            merged.push(sdpParams[i]);
        } else {
            // Safety fallback: should not occur given SDPParser matches receiverPortCount.
            // Strip all receiver-specific fields (interface_ip etc.) to avoid device rejection.
            merged.push({ rtp_enabled: false });
        }
    }
    return merged;
}

async function patchStaged(url: string, body: unknown, cookies = ''): Promise<{ status: number; body: unknown }> {
    const extraHeaders: Record<string, string> = {};
    if (cookies) extraHeaders['cookie'] = cookies;
    const { status, text } = await httpPatch(url, body, extraHeaders);

    // streamDeck.logger.info(`[nmos] PATCH response status=${status} url=${url} body=${text}`);

    if ((status < 200 || status >= 300) && status !== 202) {
        throw new Error(`PATCH failed HTTP ${status}: ${text}`);
    }
    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* not JSON */ }
    return { status, body: parsed };
}
