// End-to-end test: buildManifest → buildChunkTxs → (mock sign) → buildAnchorTx → buildReceipt
// Tests the full SAMIZDAT fail-safe publish ordering.

import { describe, it, expect } from 'vitest';
import { buildManifest, verifyChunkData } from '../../src/core/manifest';
import { buildChunkTxs, buildAnchorTx } from '../../src/tx/builder';
import { estimateChunkTxBytes } from '../../src/tx/fees';
import { buildReceipt } from '../../src/tx/receipt';
import { encodeChunkPayload, encodeAnchorPayload, decodeChunkPayload, decodeAnchorPayload } from '../../src/tx/encoding';
import { makeTestUtxo } from './test-utxo';

const MOCK_CHUNK_TXID = '1'.repeat(64);
const MOCK_ANCHOR_TXID = '2'.repeat(64);

function makeUtxo() {
  return makeTestUtxo({ txid: '0'.repeat(64) });
}

describe('full publish flow integration', () => {
  it('completes the end-to-end flow for a small text file', async () => {
    const fileContent = new TextEncoder().encode('Hello, SAMIZDAT world! This is a test publication.');

    // Step 1: Build manifest
    const { manifest } = await buildManifest(
      [{ filename: 'hello.txt', contentType: 'text/plain', data: fileContent }],
      { title: 'Integration Test' },
    );

    expect(manifest.version).toBe('1');
    expect(manifest.chunkTree.length).toBeGreaterThan(0);
    expect(manifest.fileTree).toHaveLength(1);

    // Step 2: Build chunk transactions
    const utxo = makeUtxo();
    const bundles = await buildChunkTxs(manifest, [fileContent], utxo);
    expect(bundles).toHaveLength(1);
    expect(bundles[0]!.hexTx.length).toBeGreaterThan(0);

    // Step 3: Verify chunk payload round-trips (simulates on-chain retrieval and verification)
    const chunkScript = encodeChunkPayload(0, fileContent);
    const decodedChunk = decodeChunkPayload(chunkScript);
    expect(decodedChunk.chunkIndex).toBe(0);
    expect(decodedChunk.data).toEqual(fileContent);

    // Step 4: Verify chunk hash against manifest (core fail-safe check)
    const chunkRef = manifest.chunkTree[0]!;
    const verified = await verifyChunkData(fileContent, chunkRef.hash);
    expect(verified).toBe(true);

    // Step 5: Build anchor transaction (only possible because we have verified chunk txids)
    const anchorBundle = await buildAnchorTx(manifest, [MOCK_CHUNK_TXID], utxo);
    expect(anchorBundle.hexTx.length).toBeGreaterThan(0);

    // Step 6: Verify anchor payload round-trips
    const anchorScript = encodeAnchorPayload(
      'a'.repeat(64),
      manifest.rootHash,
      [MOCK_CHUNK_TXID],
      manifest,
    );
    const decodedAnchor = decodeAnchorPayload(anchorScript);
    expect(decodedAnchor.chunkTxids).toEqual([MOCK_CHUNK_TXID]);
    expect(decodedAnchor.manifest.rootHash).toBe(manifest.rootHash);

    // Step 7: Build receipt
    const receipt = await buildReceipt(
      manifest,
      [MOCK_CHUNK_TXID],
      MOCK_ANCHOR_TXID,
      ['http://renderer.example.onion'],
    );
    expect(receipt.manifestHash).toHaveLength(64);
    expect(receipt.txids).toContain(MOCK_ANCHOR_TXID);
    expect(receipt.txids).toContain(MOCK_CHUNK_TXID);
    expect(receipt.rootHash).toBe(manifest.rootHash);
  });

  it('buildAnchorTx throws if chunk txids are not supplied', async () => {
    const content = new Uint8Array([1, 2, 3]);
    const { manifest } = await buildManifest(
      [{ filename: 'a.bin', contentType: 'application/octet-stream', data: content }],
    );
    // Pass empty array — must throw (fail-safe: cannot anchor without chunk txids)
    await expect(buildAnchorTx(manifest, [], makeUtxo())).rejects.toThrow(
      /one txid per chunk/,
    );
  });

  it('verifyChunkData detects tampered chunk data', async () => {
    const content = new TextEncoder().encode('sensitive content');
    const { manifest } = await buildManifest(
      [{ filename: 'data.txt', contentType: 'text/plain', data: content }],
    );
    const tampered = new Uint8Array(content);
    tampered[0] ^= 0xff;

    const chunkRef = manifest.chunkTree[0]!;
    const result = await verifyChunkData(tampered, chunkRef.hash);
    expect(result).toBe(false);
  });

  it('fee estimate uses signed tx size at 100 sats/KB', async () => {
    const content = new Uint8Array(500).fill(0x42);
    const { manifest } = await buildManifest(
      [{ filename: 'b.bin', contentType: 'application/octet-stream', data: content }],
    );
    const bundles = await buildChunkTxs(manifest, [content], makeUtxo());
    const bundle = bundles[0]!;
    const txBytes = estimateChunkTxBytes(content.length, 0);
    expect(bundle.feeEstimateSats).toBe(BigInt(Math.ceil((txBytes * 100) / 1024)));
    expect(bundle.feeEstimateSats).toBeLessThan(BigInt(txBytes));
  });
});
