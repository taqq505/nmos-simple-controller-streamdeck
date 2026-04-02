/**
 * SDP Parser for ST2110
 * TypeScript port of BCC's sdp-parser.js
 * Converts SDP to NMOS IS-05 PATCH transport_params format.
 */

export interface TransportBlock {
    destination_port: number | null;
    multicast_ip: string | null;
    source_ip: string | null;
    rtp_enabled: boolean;
}

export interface SDPPatchBody {
    activation: { mode: string };
    master_enable: boolean;
    sender_id?: string;
    transport_file: { data: string; type: string };
    transport_params: TransportBlock[];
}

export class SDPParser {
    /**
     * Parse SDP text to IS-05 PATCH body.
     * @param sdpText  Raw SDP text from manifest_href
     * @param senderId NMOS sender UUID
     * @param receiverPortCount Number of transport_params ports on the receiver (1 or 2)
     */
    parseToJSON(sdpText: string, senderId: string | null = null, receiverPortCount = 2): SDPPatchBody {
        // Normalize to LF for processing
        const normalized = sdpText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

        // transport_file uses CRLF; strip consecutive blank lines
        let crlfSdp = normalized.replace(/\n/g, '\r\n');
        crlfSdp = crlfSdp.replace(/\r\n\r\n+/g, '\r\n');

        const lines = normalized.split('\n');

        const result: SDPPatchBody = {
            activation: { mode: 'activate_immediate' },
            master_enable: true,
            transport_file: { data: crlfSdp, type: 'application/sdp' },
            transport_params: [],
        };

        if (senderId) result.sender_id = senderId;

        result.transport_params = this.extractTransportParams(lines, receiverPortCount);
        return result;
    }

    extractTransportParams(lines: string[], receiverPortCount: number): TransportBlock[] {
        const paramBlocks: Record<string, TransportBlock> = {};
        let currentBlock: TransportBlock = { destination_port: null, multicast_ip: null, source_ip: null, rtp_enabled: true };
        let currentMid: string | null = null;

        for (const line of lines) {
            const t = line.trim();

            if (t.startsWith('m=')) {
                // Save finished block before starting new media section
                if (currentMid && currentBlock.destination_port !== null && currentBlock.multicast_ip !== null) {
                    paramBlocks[currentMid] = { ...currentBlock };
                    currentMid = null;
                }
                currentBlock = { destination_port: null, multicast_ip: null, source_ip: null, rtp_enabled: true };
                const parts = t.split(/\s+/);
                if (parts.length >= 2) currentBlock.destination_port = parseInt(parts[1]);

            } else if (t.startsWith('c=IN IP4')) {
                const parts = t.split(/\s+/);
                if (parts.length >= 3) currentBlock.multicast_ip = parts[2].split('/')[0];

            } else if (t.startsWith('a=source-filter:')) {
                const parts = t.split(/\s+/);
                if (parts.length >= 5) currentBlock.source_ip = parts[parts.length - 1];

            } else if (t.startsWith('a=mid:')) {
                const midParts = t.split(':');
                if (midParts.length >= 2) currentMid = midParts[1].trim().toLowerCase();
            }
        }

        // Save the last block
        if (currentMid && currentBlock.destination_port !== null && currentBlock.multicast_ip !== null) {
            paramBlocks[currentMid] = { ...currentBlock };
        }

        return this.buildTransportParamsArray(paramBlocks, currentBlock, receiverPortCount);
    }

    buildTransportParamsArray(
        paramBlocks: Record<string, TransportBlock>,
        lastBlock: TransportBlock,
        receiverPortCount: number
    ): TransportBlock[] {
        const disabled: TransportBlock = { destination_port: null, multicast_ip: null, source_ip: null, rtp_enabled: false };
        const params: TransportBlock[] = [];

        if (paramBlocks['primary'] && paramBlocks['secondary']) {
            // ST2110-7: primary + secondary
            params.push(paramBlocks['primary']);
            params.push(paramBlocks['secondary']);
        } else if (paramBlocks['primary']) {
            params.push(paramBlocks['primary']);
            if (receiverPortCount === 2) params.push(disabled);
        } else if (Object.keys(paramBlocks).length > 0) {
            // Single stream with a mid tag (not "primary")
            params.push(paramBlocks[Object.keys(paramBlocks)[0]]);
            if (receiverPortCount === 2) params.push(disabled);
        } else if (this.isValidBlock(lastBlock)) {
            // Single stream without mid tags
            params.push(lastBlock);
            if (receiverPortCount === 2) params.push(disabled);
        } else {
            throw new Error('Could not extract transport_params from SDP (missing required fields)');
        }

        // Truncate to receiver port count
        if (receiverPortCount === 1 && params.length > 1) return [params[0]];
        return params;
    }

    isValidBlock(block: TransportBlock): boolean {
        return block.destination_port !== null && block.multicast_ip !== null && block.source_ip !== null;
    }
}
