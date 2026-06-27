import { describe, it, expect } from 'vitest';
import { WocChainReader } from '../../src/chain/whatsonchain';
import { buildDataCarrierScript } from '../../src/tx/script';
import { encodeAnchorPayload } from '../../src/tx/encoding';
import { buildUnsignedTx } from '../../src/tx/rawtx';
import { toHex } from '../../src/core/hash';
import type { Manifest } from '../../src/core/types';

const DUMMY_TXID = '0'.repeat(64);
const REAL_TXID  = 'a'.repeat(64);
const DUMMY_PUBKEY_HASH = new Uint8Array(20).fill(0xbb);

function mockFetch(status: number, body: string): typeof globalThis.fetch {
  return (_url, _init) => Promise.resolve(new Response(body, { status }));
}

function makeSamizdatBlob(): Uint8Array {
  // Minimal anchor blob with valid SAMIZDAT magic
  const manifest: Manifest = {
    version: '1',
    authorMode: 'anonymous',
    publicationMode: 'onchain',
    fileTree: [],
    chunkTree: [{ index: 0, size: 5, hash: 'f'.repeat(64) }],
    rootHash: 'b'.repeat(64),
  };
  return encodeAnchorPayload('a'.repeat(64), 'b'.repeat(64), ['c'.repeat(64)], manifest);
}

function buildTxHex(script: Uint8Array, satoshis = 0n): string {
  const raw = buildUnsignedTx(
    [{ txidHex: DUMMY_TXID, vout: 0 }],
    [{ satoshis, scriptHex: toHex(script) }],
  );
  return toHex(raw);
}

describe('WocChainReader', () => {
  it('returns the SAMIZDAT data blob from a data-carrier output', async () => {
    const blob = makeSamizdatBlob();
    const carrierScript = buildDataCarrierScript(blob, DUMMY_PUBKEY_HASH);
    const reader = new WocChainReader('main', mockFetch(200, buildTxHex(carrierScript, 1n)));
    const result = await reader.fetchTxScript(REAL_TXID);
    expect(result).toEqual(blob);
  });

  it('throws TX_NOT_FOUND on HTTP 404', async () => {
    const reader = new WocChainReader('main', mockFetch(404, ''));
    await expect(reader.fetchTxScript(REAL_TXID)).rejects.toMatchObject({ code: 'TX_NOT_FOUND' });
  });

  it('throws TX_NOT_FOUND on non-ok response', async () => {
    const reader = new WocChainReader('main', mockFetch(500, 'server error'));
    await expect(reader.fetchTxScript(REAL_TXID)).rejects.toMatchObject({ code: 'TX_NOT_FOUND' });
  });

  it('throws TX_NOT_FOUND on network error', async () => {
    const failFetch: typeof globalThis.fetch = () => Promise.reject(new Error('Connection refused'));
    const reader = new WocChainReader('main', failFetch);
    await expect(reader.fetchTxScript(REAL_TXID)).rejects.toMatchObject({ code: 'TX_NOT_FOUND' });
  });

  it('throws TX_NOT_FOUND when tx has no SAMIZDAT data-carrier output', async () => {
    const p2pkh = new Uint8Array([0x76, 0xa9, 0x14, ...new Uint8Array(20), 0x88, 0xac]);
    const reader = new WocChainReader('main', mockFetch(200, buildTxHex(p2pkh)));
    await expect(reader.fetchTxScript(REAL_TXID)).rejects.toMatchObject({ code: 'TX_NOT_FOUND' });
  });

  it('finds the SAMIZDAT carrier output when it is not the first output', async () => {
    const p2pkh = new Uint8Array([0x76, 0xa9, 0x14, ...new Uint8Array(20), 0x88, 0xac]);
    const blob = makeSamizdatBlob();
    const carrierScript = buildDataCarrierScript(blob, DUMMY_PUBKEY_HASH);
    const raw = buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 0 }],
      [
        { satoshis: 5000n, scriptHex: toHex(p2pkh) },
        { satoshis: 1n,    scriptHex: toHex(carrierScript) },
      ],
    );
    const reader = new WocChainReader('main', mockFetch(200, toHex(raw)));
    const result = await reader.fetchTxScript(REAL_TXID);
    expect(result).toEqual(blob);
  });

  it('tolerates leading/trailing whitespace in the API response', async () => {
    const blob = makeSamizdatBlob();
    const carrierScript = buildDataCarrierScript(blob, DUMMY_PUBKEY_HASH);
    const hex = buildTxHex(carrierScript, 1n);
    const reader = new WocChainReader('main', mockFetch(200, `  ${hex}\n`));
    const result = await reader.fetchTxScript(REAL_TXID);
    expect(result).toEqual(blob);
  });
});
