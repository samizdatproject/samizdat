import { describe, it, expect } from 'vitest';
import { IndexStore } from '../../src/indexer/store';
import { scanBlock, scanRange, fetchChainHeight } from '../../src/indexer/scan';
import { encodeAnchorPayload, encodeChunkPayload } from '../../src/tx/encoding';
import { buildDataCarrierScript } from '../../src/tx/script';
import { buildUnsignedTx } from '../../src/tx/rawtx';
import { buildManifest } from '../../src/core/manifest';
import { hashManifest } from '../../src/core/manifest';
import { toHex } from '../../src/core/hash';

const DUMMY_PUBKEY_HASH = new Uint8Array(20).fill(0xaa);

// Build a raw tx hex containing a single data-carrier output.
function buildCarrierTxHex(blob: Uint8Array, satoshis = 1n): string {
  const carrierScript = buildDataCarrierScript(blob, DUMMY_PUBKEY_HASH);
  const raw = buildUnsignedTx(
    [{ txidHex: '0'.repeat(64), vout: 0 }],
    [{ satoshis, scriptHex: toHex(carrierScript) }],
  );
  return toHex(raw);
}

// Build a complete valid SAMIZDAT anchor tx hex given a chunk txid.
async function buildAnchorTxHex(chunkTxid: string): Promise<string> {
  const content = new TextEncoder().encode('Hello, SAMIZDAT indexer!');
  const { manifest } = await buildManifest(
    [{ filename: 'test.txt', contentType: 'text/plain', data: content }],
  );
  const hash = await hashManifest(manifest);
  const blob = encodeAnchorPayload(hash, manifest.rootHash, [chunkTxid], manifest);
  return buildCarrierTxHex(blob);
}

// Build a chunk tx hex (carrier with chunk blob — not an anchor, should be skipped by indexer).
function buildChunkTxHex(): string {
  const blob = encodeChunkPayload(0, new TextEncoder().encode('Hello, SAMIZDAT indexer!'));
  return buildCarrierTxHex(blob);
}

type MockResponses = Map<string, { status: number; body: string }>;

function makeMockFetch(responses: MockResponses): typeof globalThis.fetch {
  return (input, _init) => {
    const url = typeof input === 'string' ? input : (input as URL).toString();
    // Find last path segment for matching
    for (const [pattern, resp] of responses) {
      if (url.includes(pattern)) {
        return Promise.resolve(new Response(resp.body, { status: resp.status }));
      }
    }
    return Promise.resolve(new Response('', { status: 404 }));
  };
}

describe('fetchChainHeight', () => {
  it('returns the block height from chain/info', async () => {
    const fetchFn = makeMockFetch(new Map([
      ['chain/info', { status: 200, body: JSON.stringify({ blocks: 850000 }) }],
    ]));
    const height = await fetchChainHeight('main', fetchFn);
    expect(height).toBe(850000);
  });

  it('throws on non-ok response', async () => {
    const fetchFn = makeMockFetch(new Map());
    await expect(fetchChainHeight('main', fetchFn)).rejects.toThrow();
  });
});

describe('scanBlock', () => {
  it('adds a SAMIZDAT anchor entry to the store', async () => {
    const chunkTxid = 'c'.repeat(64);
    const anchorTxid = 'a'.repeat(64);
    const anchorHex = await buildAnchorTxHex(chunkTxid);

    const responses: MockResponses = new Map([
      ['fromheight/100', { status: 200, body: JSON.stringify({ hash: 'blockhash1', height: 100 }) }],
      ['blockhash1/tx/page/1', { status: 200, body: JSON.stringify({ txs: [anchorTxid], page: 1, totalPages: 1 }) }],
      [anchorTxid, { status: 200, body: anchorHex }],
    ]);
    const fetchFn = makeMockFetch(responses);

    const store = new IndexStore();
    const result = await scanBlock(100, store, { network: 'main', fetchFn });

    expect(result.blockHeight).toBe(100);
    expect(result.txsInspected).toBe(1);
    expect(result.anchorsFound).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(store.size()).toBe(1);
    expect(store.findByTxid(anchorTxid)).toBeDefined();
    expect(store.findByTxid(anchorTxid)!.blockHeight).toBe(100);
  });

  it('skips non-SAMIZDAT transactions silently', async () => {
    const nonSamizdatHex = buildChunkTxHex(); // chunk tx, not an anchor
    const txid = 'd'.repeat(64);

    const responses: MockResponses = new Map([
      ['fromheight/200', { status: 200, body: JSON.stringify({ hash: 'blockhash2', height: 200 }) }],
      ['blockhash2/tx/page/1', { status: 200, body: JSON.stringify({ txs: [txid], page: 1, totalPages: 1 }) }],
      [txid, { status: 200, body: nonSamizdatHex }],
    ]);

    const store = new IndexStore();
    const result = await scanBlock(200, store, { network: 'main', fetchFn: makeMockFetch(responses) });

    expect(result.txsInspected).toBe(1);
    expect(result.anchorsFound).toBe(0);
    expect(store.size()).toBe(0);
  });

  it('records an error and stops scanning when a tx-page fetch fails after block hash resolves', async () => {
    const responses: MockResponses = new Map([
      ['fromheight/200', { status: 200, body: JSON.stringify({ hash: 'blk200', height: 200 }) }],
      // tx page returns HTTP 500 → fetchBlockTxPage throws → errors.push + break
      ['blk200/tx/page/1', { status: 500, body: 'Server Error' }],
    ]);

    const store = new IndexStore();
    const result = await scanBlock(200, store, { network: 'main', fetchFn: makeMockFetch(responses) });

    expect(result.txsInspected).toBe(0);
    expect(result.anchorsFound).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('Page 1');
  });

  it('handles block height not found gracefully', async () => {
    const store = new IndexStore();
    const result = await scanBlock(99999999, store, {
      network: 'main',
      fetchFn: makeMockFetch(new Map()), // 404 for everything
    });
    expect(result.anchorsFound).toBe(0);
    expect(result.errors).toHaveLength(1);
  });

  it('skips transactions where fetchTxScript throws (no data output)', async () => {
    // A tx that exists but has no data-carrier output — fetchTxScript will throw.
    // The scanner must skip it (continue) rather than abort.
    const txid = 'b'.repeat(64);
    // Return a raw tx with no outputs so WocChainReader cannot find a data output.
    const emptyTxHex = '01000000' + '00' + '00' + '00000000'; // version + 0 inputs + 0 outputs + locktime
    const responses: MockResponses = new Map([
      ['fromheight/150', { status: 200, body: JSON.stringify({ hash: 'blk150', height: 150 }) }],
      ['blk150/tx/page/1', { status: 200, body: JSON.stringify({ txs: [txid], page: 1, totalPages: 1 }) }],
      [txid, { status: 200, body: emptyTxHex }],
    ]);

    const store = new IndexStore();
    const result = await scanBlock(150, store, { network: 'main', fetchFn: makeMockFetch(responses) });

    expect(result.txsInspected).toBe(1);
    expect(result.anchorsFound).toBe(0);
    expect(result.errors).toHaveLength(0); // error is swallowed silently
    expect(store.size()).toBe(0);
  });

  it('scans multiple pages', async () => {
    const chunkTxid = 'e'.repeat(64);
    const anchor1Txid = '1'.repeat(64);
    const anchor2Txid = '2'.repeat(64);
    const anchor1Hex = await buildAnchorTxHex(chunkTxid);
    const anchor2Hex = await buildAnchorTxHex('f'.repeat(64));

    const responses: MockResponses = new Map([
      ['fromheight/300', { status: 200, body: JSON.stringify({ hash: 'blk300', height: 300 }) }],
      ['blk300/tx/page/1', { status: 200, body: JSON.stringify({ txs: [anchor1Txid], page: 1, totalPages: 2 }) }],
      ['blk300/tx/page/2', { status: 200, body: JSON.stringify({ txs: [anchor2Txid], page: 2, totalPages: 2 }) }],
      [anchor1Txid, { status: 200, body: anchor1Hex }],
      [anchor2Txid, { status: 200, body: anchor2Hex }],
    ]);

    const store = new IndexStore();
    const result = await scanBlock(300, store, { network: 'main', fetchFn: makeMockFetch(responses) });

    expect(result.txsInspected).toBe(2);
    expect(result.anchorsFound).toBe(2);
    expect(store.size()).toBe(2);
  });
});

describe('scanRange', () => {
  it('scans a range of blocks and returns one result per block', async () => {
    const anchor400Txid = '4'.repeat(64);
    const anchor401Txid = '5'.repeat(64);
    const anchor400Hex = await buildAnchorTxHex('x'.repeat(64));
    const anchor401Hex = await buildAnchorTxHex('y'.repeat(64));

    const responses: MockResponses = new Map([
      ['fromheight/400', { status: 200, body: JSON.stringify({ hash: 'blk400', height: 400 }) }],
      ['blk400/tx/page/1', { status: 200, body: JSON.stringify({ txs: [anchor400Txid], page: 1, totalPages: 1 }) }],
      ['fromheight/401', { status: 200, body: JSON.stringify({ hash: 'blk401', height: 401 }) }],
      ['blk401/tx/page/1', { status: 200, body: JSON.stringify({ txs: [anchor401Txid], page: 1, totalPages: 1 }) }],
      [anchor400Txid, { status: 200, body: anchor400Hex }],
      [anchor401Txid, { status: 200, body: anchor401Hex }],
    ]);

    const store = new IndexStore();
    const results = await scanRange(400, 401, store, {
      network: 'main',
      fetchFn: makeMockFetch(responses),
    });

    expect(results).toHaveLength(2);
    expect(results[0].blockHeight).toBe(400);
    expect(results[1].blockHeight).toBe(401);
    expect(store.size()).toBe(2);
  });

  it('calls onBlock callback for each block in the range', async () => {
    const responses: MockResponses = new Map([
      ['fromheight/500', { status: 200, body: JSON.stringify({ hash: 'blk500', height: 500 }) }],
      ['blk500/tx/page/1', { status: 200, body: JSON.stringify({ txs: [], page: 1, totalPages: 1 }) }],
      ['fromheight/501', { status: 200, body: JSON.stringify({ hash: 'blk501', height: 501 }) }],
      ['blk501/tx/page/1', { status: 200, body: JSON.stringify({ txs: [], page: 1, totalPages: 1 }) }],
    ]);

    const store = new IndexStore();
    const seen: number[] = [];
    await scanRange(500, 501, store, {
      network: 'main',
      fetchFn: makeMockFetch(responses),
      onBlock: (r) => seen.push(r.blockHeight),
    });

    expect(seen).toEqual([500, 501]);
  });

  it('handles a single-block range (fromHeight === toHeight)', async () => {
    const responses: MockResponses = new Map([
      ['fromheight/600', { status: 200, body: JSON.stringify({ hash: 'blk600', height: 600 }) }],
      ['blk600/tx/page/1', { status: 200, body: JSON.stringify({ txs: [], page: 1, totalPages: 1 }) }],
    ]);

    const store = new IndexStore();
    const results = await scanRange(600, 600, store, {
      network: 'main',
      fetchFn: makeMockFetch(responses),
    });

    expect(results).toHaveLength(1);
    expect(results[0].blockHeight).toBe(600);
  });
});
