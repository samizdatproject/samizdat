// Tests for editor/src/publish.ts — verifyChunkFromHex and verifyAnchorFromHex.
// These cover state C7 (VERIFY_CHUNKS) and C10 (VERIFY_ANCHOR) of the publish flow.

import { describe, it, expect } from 'vitest';
import { buildManifest } from '../../src/core/manifest';
import { buildChunkTxs } from '../../src/tx/builder';
import {
  verifyChunkFromHex,
  verifyAnchorFromHex,
  makeMockUtxo,
} from '../../editor/src/publish';
import type { Manifest } from '../../src/core/types';

async function buildManifestAndTxs(content: string): Promise<{
  manifest: Manifest;
  hexTxs: string[];
  rawChunks: Uint8Array[];
}> {
  const data = new TextEncoder().encode(content);
  const { manifest, chunks } = await buildManifest(
    [{ filename: 'test.md', contentType: 'text/markdown', data }],
    { title: 'Test' },
  );
  const rawChunks = chunks.map(c => c.data);
  const utxo = makeMockUtxo();
  const bundles = await buildChunkTxs(manifest, rawChunks, utxo);
  return { manifest, hexTxs: bundles.map(b => b.hexTx), rawChunks };
}

describe('verifyChunkFromHex', () => {
  it('returns true when given the unsigned chunk tx hex (single chunk)', async () => {
    const { manifest, hexTxs } = await buildManifestAndTxs('Hello, SAMIZDAT world!');
    expect(hexTxs).toHaveLength(1);
    const ok = await verifyChunkFromHex(hexTxs[0]!, 0, manifest);
    expect(ok).toBe(true);
  });

  it('returns true for each chunk in a multi-chunk payload', async () => {
    // Use enough content to guarantee at least 2 chunks
    const longContent = 'x'.repeat(130_000);
    const { manifest, hexTxs } = await buildManifestAndTxs(longContent);
    expect(hexTxs.length).toBeGreaterThan(1);
    for (let i = 0; i < hexTxs.length; i++) {
      const ok = await verifyChunkFromHex(hexTxs[i]!, i, manifest);
      expect(ok).toBe(true);
    }
  });

  it('returns false for an empty hex string', async () => {
    const { manifest } = await buildManifestAndTxs('test');
    const ok = await verifyChunkFromHex('', 0, manifest);
    expect(ok).toBe(false);
  });

  it('returns false when the hex does not contain a SAMIZDAT marker', async () => {
    const { manifest } = await buildManifestAndTxs('test');
    const garbage = 'deadbeef'.repeat(8);
    const ok = await verifyChunkFromHex(garbage, 0, manifest);
    expect(ok).toBe(false);
  });

  it('returns false when the chunk index is wrong (chunk 1 tx claimed as chunk 0)', async () => {
    const longContent = 'y'.repeat(130_000);
    const { manifest, hexTxs } = await buildManifestAndTxs(longContent);
    expect(hexTxs.length).toBeGreaterThan(1);
    // chunk 1 tx hex is given but claimed as chunk 0 — hash mismatch
    const ok = await verifyChunkFromHex(hexTxs[1]!, 0, manifest);
    expect(ok).toBe(false);
  });

  it('throws on invalid hex (odd-length input)', async () => {
    const { manifest } = await buildManifestAndTxs('test');
    await expect(verifyChunkFromHex('abc', 0, manifest)).rejects.toThrow('odd length');
  });
});

describe('verifyAnchorFromHex', () => {
  it('returns true for a valid manifest regardless of hex content', async () => {
    const { manifest } = await buildManifestAndTxs('anchor test');
    // verifyAnchorFromHex ignores the hex — it checks the manifest merkle root
    const ok = await verifyAnchorFromHex('deadbeef', manifest);
    expect(ok).toBe(true);
  });

  it('returns false when the manifest root hash has been tampered', async () => {
    const { manifest } = await buildManifestAndTxs('tamper test');
    const tampered = { ...manifest, rootHash: 'f'.repeat(64) };
    const ok = await verifyAnchorFromHex('deadbeef', tampered);
    expect(ok).toBe(false);
  });
});
