// BitailsChainReader — ChainReader backed by the Bitails REST API.
//
// Bitails operates in pruned mode and may not have all historical transactions.
// When a transaction is not available, a clear RendererError('TX_NOT_FOUND') is
// thrown with an actionable message so operators know to fall back to a full node.
//
// Privacy note: Bitails can log every txid queried and correlate reader IPs with
// content access. For maximum anonymity, use CHAIN_SOURCE=node with a self-hosted
// BSV node instead.

import type { ChainReader } from '../renderer/chain';
import { RendererError } from '../renderer/errors';
import { readVarint } from '../tx/varint';
import { extractDataCarrierPayload } from '../tx/script';

const SAMIZDAT_MAGIC = new Uint8Array([0x53, 0x4d, 0x5a, 0x44]); // "SMZD"

function isSamizdatCarrierScript(script: Uint8Array): boolean {
  try {
    const blob = extractDataCarrierPayload(script);
    return (
      blob.length >= 4 &&
      blob[0] === SAMIZDAT_MAGIC[0] &&
      blob[1] === SAMIZDAT_MAGIC[1] &&
      blob[2] === SAMIZDAT_MAGIC[2] &&
      blob[3] === SAMIZDAT_MAGIC[3]
    );
  } catch {
    return false;
  }
}

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Odd hex string length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function parseOutputScripts(raw: Uint8Array): Uint8Array[] {
  let off = 4; // skip version

  const [inputCount, iLen] = readVarint(raw, off);
  off += iLen;
  for (let i = 0; i < inputCount; i++) {
    off += 36;
    const [scriptLen, sLen] = readVarint(raw, off);
    off += sLen + scriptLen + 4;
  }

  const [outputCount, oLen] = readVarint(raw, off);
  off += oLen;
  const scripts: Uint8Array[] = [];
  for (let i = 0; i < outputCount; i++) {
    off += 8;
    const [scriptLen, sLen] = readVarint(raw, off);
    off += sLen;
    scripts.push(raw.slice(off, off + scriptLen));
    off += scriptLen;
  }
  return scripts;
}

export type BsvNetwork = 'main' | 'test';

const BASE_URL: Record<BsvNetwork, string> = {
  main: 'https://api.bitails.io',
  test: 'https://api.bitails.io/test',
};

// ChainReader backed by the Bitails REST API.
// Inject a custom `fetchFn` to mock network calls in tests.
export class BitailsChainReader implements ChainReader {
  private readonly net: BsvNetwork;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(network: BsvNetwork = 'main', fetchFn?: typeof globalThis.fetch) {
    this.net = network;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  async fetchTxScript(txid: string): Promise<Uint8Array> {
    const base = BASE_URL[this.net];
    const url = `${base}/tx/${txid}/hex`;
    let res: Response;
    try {
      res = await this.fetchFn(url, { headers: { Accept: 'text/plain' } });
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Network error fetching ${txid} from Bitails: ${String(err)}`);
    }

    if (res.status === 404) {
      // Bitails runs in pruned mode — not all historical transactions are available.
      throw new RendererError(
        'TX_NOT_FOUND',
        `Transaction ${txid} not found on Bitails. ` +
        `Bitails operates in pruned mode and may not retain all historical transactions. ` +
        `Try CHAIN_SOURCE=woc or CHAIN_SOURCE=node pointing to a full node.`,
      );
    }
    if (!res.ok) {
      throw new RendererError('TX_NOT_FOUND', `Bitails returned HTTP ${res.status} for ${txid}`);
    }

    const hex = (await res.text()).trim();
    let raw: Uint8Array;
    try {
      raw = hexToBytes(hex);
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Invalid hex response from Bitails for tx ${txid}: ${String(err)}`);
    }

    let scripts: Uint8Array[];
    try {
      scripts = parseOutputScripts(raw);
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Failed to parse tx ${txid} from Bitails: ${String(err)}`);
    }

    const carrierScript = scripts.find(isSamizdatCarrierScript);
    if (!carrierScript) {
      throw new RendererError('TX_NOT_FOUND', `No SAMIZDAT data-carrier output found in tx ${txid}`);
    }
    return extractDataCarrierPayload(carrierScript);
  }
}
