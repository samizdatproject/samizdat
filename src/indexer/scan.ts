// SAMIZDAT block scanner.
// Fetches a BSV block's transactions via WhatsOnChain and indexes any SAMIZDAT anchor txs.
// This is a reference implementation — production operators should add rate limiting,
// retry logic, and persistent height tracking on top.

import type { IndexStore } from './store';
import type { IndexEntry } from './types';
import type { BsvNetwork } from '../chain/whatsonchain';
import { decodeAnchorPayload } from '../tx/encoding';
import { WocChainReader } from '../chain/whatsonchain';

const BASE = 'https://api.whatsonchain.com/v1/bsv';

interface WocBlockInfo {
  hash: string;
  height: number;
}

interface WocBlockTxPage {
  txs: string[];
  page: number;
  totalPages: number;
}

// ScanResult summarises what was found in the block.
export interface ScanResult {
  blockHeight: number;
  blockHash: string;
  txsInspected: number;
  anchorsFound: number;
  errors: string[];
}

// Fetches one page of txids from a block (WhatsOnChain pages at 1000 txids/page).
async function fetchBlockTxPage(
  net: BsvNetwork,
  blockHash: string,
  page: number,
  fetchFn: typeof globalThis.fetch,
): Promise<WocBlockTxPage> {
  const url = `${BASE}/${net}/block/hash/${blockHash}/tx/page/${page}`;
  const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`WoC block tx page returned HTTP ${res.status}`);
  return res.json() as Promise<WocBlockTxPage>;
}

// Fetches the block hash for a given height.
async function fetchBlockHashAtHeight(
  net: BsvNetwork,
  height: number,
  fetchFn: typeof globalThis.fetch,
): Promise<string> {
  const url = `${BASE}/${net}/block/hash/fromheight/${height}`;
  const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`WoC block hash returned HTTP ${res.status}`);
  const data = await res.json() as WocBlockInfo;
  return data.hash;
}

// Fetches the current chain tip height.
export async function fetchChainHeight(
  net: BsvNetwork = 'main',
  fetchFn: typeof globalThis.fetch = globalThis.fetch,
): Promise<number> {
  const url = `${BASE}/${net}/chain/info`;
  const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`WoC chain info returned HTTP ${res.status}`);
  const data = await res.json() as { blocks: number };
  return data.blocks;
}

// Scans a single block at `height` for SAMIZDAT anchor transactions.
// Adds any found entries to `store`. Returns a ScanResult summary.
export async function scanBlock(
  height: number,
  store: IndexStore,
  opts: {
    network?: BsvNetwork;
    fetchFn?: typeof globalThis.fetch;
  } = {},
): Promise<ScanResult> {
  const net = opts.network ?? 'main';
  const fetchFn = opts.fetchFn ?? globalThis.fetch;
  const chain = new WocChainReader(net, fetchFn);
  const errors: string[] = [];
  let txsInspected = 0;
  let anchorsFound = 0;

  let blockHash: string;
  try {
    blockHash = await fetchBlockHashAtHeight(net, height, fetchFn);
  } catch (err) {
    return { blockHeight: height, blockHash: '', txsInspected: 0, anchorsFound: 0, errors: [String(err)] };
  }

  let page = 1;
  let totalPages = 1;
  do {
    let txPage: WocBlockTxPage;
    try {
      txPage = await fetchBlockTxPage(net, blockHash, page, fetchFn);
      totalPages = txPage.totalPages;
    } catch (err) {
      errors.push(`Page ${page}: ${String(err)}`);
      break;
    }

    for (const txid of txPage.txs) {
      txsInspected++;
      let script: Uint8Array;
      try {
        script = await chain.fetchTxScript(txid);
      } catch {
        continue; // not a data tx
      }

      let payload;
      try {
        payload = decodeAnchorPayload(script);
      } catch {
        continue; // not a SAMIZDAT anchor
      }

      const manifest = payload.manifest;
      const entry: IndexEntry = {
        txid,
        manifestHash: payload.manifestHash,
        rootHash: payload.rootHash,
        chunkTxids: payload.chunkTxids,
        blockHeight: height,
        title: manifest.title,
        tags: manifest.tags,
        language: manifest.language,
        createdAt: manifest.createdAt,
        indexedAt: new Date().toISOString(),
      };
      store.add(entry);
      anchorsFound++;
    }

    page++;
  } while (page <= totalPages);

  return { blockHeight: height, blockHash, txsInspected, anchorsFound, errors };
}

// Scans a range of blocks [fromHeight, toHeight] inclusive.
// Calls `onBlock` after each block (useful for progress reporting).
export async function scanRange(
  fromHeight: number,
  toHeight: number,
  store: IndexStore,
  opts: {
    network?: BsvNetwork;
    fetchFn?: typeof globalThis.fetch;
    onBlock?: (result: ScanResult) => void;
  } = {},
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];
  for (let h = fromHeight; h <= toHeight; h++) {
    const result = await scanBlock(h, store, opts);
    results.push(result);
    opts.onBlock?.(result);
  }
  return results;
}
