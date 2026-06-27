// NodeChainReader — ChainReader backed by a self-hosted BSV node via JSON-RPC.
//
// This provides the strongest anonymity guarantee for renderer operators: the
// node you query is under your control and does not log your access patterns
// to a third party.
//
// Configuration via environment variables:
//   BSV_NODE_HOST  — hostname or IP of the BSV node (default: 127.0.0.1)
//   BSV_NODE_PORT  — RPC port (default: 8332)
//   BSV_NODE_USER  — RPC username
//   BSV_NODE_PASS  — RPC password
//
// The node must have txindex=1 in its configuration to serve arbitrary
// historical transactions. Without txindex, only UTXO-set transactions
// (unspent outputs) are retrievable.
//
// TODO: add support for BSV node authentication via cookie file
//       (standard bitcoind cookie at $DATADIR/.cookie)
// TODO: retry on transient network errors with exponential backoff
// TODO: support ZMQ block/tx notifications for indexer use

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
  let off = 4;

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

export interface NodeConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export function nodeConfigFromEnv(): NodeConfig {
  const host = process.env.BSV_NODE_HOST ?? '127.0.0.1';
  const port = parseInt(process.env.BSV_NODE_PORT ?? '8332', 10);
  const user = process.env.BSV_NODE_USER ?? '';
  const pass = process.env.BSV_NODE_PASS ?? '';
  if (!user || !pass) {
    throw new Error('BSV_NODE_USER and BSV_NODE_PASS must be set when using CHAIN_SOURCE=node');
  }
  return { host, port, user, pass };
}

// ChainReader backed by a self-hosted BSV node via JSON-RPC (getrawtransaction).
// Inject a custom `fetchFn` to mock network calls in tests.
export class NodeChainReader implements ChainReader {
  private readonly config: NodeConfig;
  private readonly fetchFn: typeof globalThis.fetch;
  private rpcId = 0;

  constructor(config: NodeConfig, fetchFn?: typeof globalThis.fetch) {
    this.config = config;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  async fetchTxScript(txid: string): Promise<Uint8Array> {
    const { host, port, user, pass } = this.config;
    const url = `http://${host}:${port}/`;
    const body = JSON.stringify({
      jsonrpc: '1.0',
      id: ++this.rpcId,
      method: 'getrawtransaction',
      params: [txid, false],
    });
    const auth = Buffer.from(`${user}:${pass}`).toString('base64');

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${auth}`,
        },
        body,
      });
    } catch (err) {
      throw new RendererError(
        'TX_NOT_FOUND',
        `Network error reaching BSV node at ${host}:${port} for tx ${txid}: ${String(err)}`,
      );
    }

    if (!res.ok) {
      throw new RendererError(
        'TX_NOT_FOUND',
        `BSV node returned HTTP ${res.status} for getrawtransaction(${txid}). ` +
        `Check BSV_NODE_HOST, BSV_NODE_PORT, BSV_NODE_USER, BSV_NODE_PASS.`,
      );
    }

    let json: { result?: string | null; error?: { message: string } | null };
    try {
      json = await res.json() as typeof json;
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Invalid JSON from BSV node for tx ${txid}: ${String(err)}`);
    }

    if (json.error) {
      const msg = json.error.message ?? String(json.error);
      if (msg.includes('No such mempool') || msg.includes('No information') || msg.includes('not found')) {
        throw new RendererError(
          'TX_NOT_FOUND',
          `Transaction ${txid} not found on BSV node. ` +
          `Ensure the node has txindex=1 enabled to serve historical transactions.`,
        );
      }
      throw new RendererError('TX_NOT_FOUND', `BSV node RPC error for tx ${txid}: ${msg}`);
    }

    if (!json.result) {
      throw new RendererError('TX_NOT_FOUND', `BSV node returned empty result for tx ${txid}`);
    }

    let raw: Uint8Array;
    try {
      raw = hexToBytes(json.result);
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Invalid hex from BSV node for tx ${txid}: ${String(err)}`);
    }

    let scripts: Uint8Array[];
    try {
      scripts = parseOutputScripts(raw);
    } catch (err) {
      throw new RendererError('TX_NOT_FOUND', `Failed to parse tx ${txid} from BSV node: ${String(err)}`);
    }

    const carrierScript = scripts.find(isSamizdatCarrierScript);
    if (!carrierScript) {
      throw new RendererError('TX_NOT_FOUND', `No SAMIZDAT data-carrier output found in tx ${txid}`);
    }
    return extractDataCarrierPayload(carrierScript);
  }
}
