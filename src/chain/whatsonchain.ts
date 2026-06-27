// WhatsOnChain HTTP ChainReader.
// Fetches raw transactions from the WhatsOnChain REST API and extracts
// the SAMIZDAT data blob from the data-carrier output for the SAMIZDAT renderer.

import type { ChainReader } from '../renderer/chain';
import { RendererError } from '../renderer/errors';
import { readVarint } from '../tx/varint';
import { extractDataCarrierPayload } from '../tx/script';

const SAMIZDAT_MAGIC = new Uint8Array([0x53, 0x4D, 0x5A, 0x44]); // "SMZD" — Samizdat 4-byte on-chain marker

// Returns true if `script` is a SAMIZDAT data-carrier locking script whose embedded
// blob starts with the SAMIZDAT magic bytes.
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

export type BsvNetwork = 'main' | 'test' | 'stn';

const BASE_URL = 'https://api.whatsonchain.com/v1/bsv';

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Odd hex string length');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Parses a raw BSV transaction and returns all output locking scripts in order.
function parseOutputScripts(raw: Uint8Array): Uint8Array[] {
  let off = 4; // skip version (4 bytes)

  // Skip inputs
  const [inputCount, iLen] = readVarint(raw, off);
  off += iLen;
  for (let i = 0; i < inputCount; i++) {
    off += 36; // prev txid (32) + prev output index (4)
    const [scriptLen, sLen] = readVarint(raw, off);
    off += sLen + scriptLen + 4; // unlocking script + sequence
  }

  // Collect output scripts
  const [outputCount, oLen] = readVarint(raw, off);
  off += oLen;
  const scripts: Uint8Array[] = [];
  for (let i = 0; i < outputCount; i++) {
    off += 8; // value (8-byte LE int64)
    const [scriptLen, sLen] = readVarint(raw, off);
    off += sLen;
    scripts.push(raw.slice(off, off + scriptLen));
    off += scriptLen;
  }
  return scripts;
}

// ChainReader backed by the WhatsOnChain public REST API.
// Inject a custom `fetchFn` to mock network calls in tests.
export class WocChainReader implements ChainReader {
  private readonly net: BsvNetwork;
  private readonly fetchFn: typeof globalThis.fetch;

  constructor(network: BsvNetwork = 'main', fetchFn?: typeof globalThis.fetch) {
    this.net = network;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  async fetchTxScript(txid: string): Promise<Uint8Array> {
    const url = `${BASE_URL}/${this.net}/tx/${txid}/hex`;
    let res: Response;
    try {
      res = await this.fetchFn(url, { headers: { Accept: 'text/plain' } });
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Network error fetching ${txid}: ${String(err)}`);
    }

    if (res.status === 404) {
      throw new RendererError('TX_NOT_FOUND', `Transaction not found: ${txid}`);
    }
    if (!res.ok) {
      throw new RendererError('TX_NOT_FOUND', `WhatsOnChain returned HTTP ${res.status} for ${txid}`);
    }

    const hex = (await res.text()).trim();
    let raw: Uint8Array;
    try {
      raw = hexToBytes(hex);
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Invalid hex response for tx ${txid}: ${String(err)}`);
    }

    let scripts: Uint8Array[];
    try {
      scripts = parseOutputScripts(raw);
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Failed to parse tx ${txid}: ${String(err)}`);
    }

    const carrierScript = scripts.find(isSamizdatCarrierScript);
    if (!carrierScript) {
      throw new RendererError('TX_NOT_FOUND', `No SAMIZDAT data-carrier output found in tx ${txid}`);
    }
    return extractDataCarrierPayload(carrierScript);
  }
}
