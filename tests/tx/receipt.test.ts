import { describe, it, expect } from 'vitest';
import { buildReceipt } from '../../src/tx/receipt';
import { buildManifest } from '../../src/core/manifest';

const FAKE_TXID = 'c'.repeat(64);
const CHUNK_TXID = 'd'.repeat(64);
const ENDPOINTS = ['http://localhost:3000', 'http://mirror.example.com'];

async function makeManifest() {
  const data = new TextEncoder().encode('hello world');
  const { manifest } = await buildManifest(
    [{ filename: 'hello.txt', contentType: 'text/plain', data }],
  );
  return manifest;
}

describe('buildReceipt', () => {
  it('returns a PublicationRecord with all required fields', async () => {
    const manifest = await makeManifest();
    const receipt = await buildReceipt(manifest, [CHUNK_TXID], FAKE_TXID, ENDPOINTS);

    expect(typeof receipt.manifestHash).toBe('string');
    expect(receipt.manifestHash).toHaveLength(64);
    expect(receipt.txids).toContain(FAKE_TXID);
    expect(receipt.txids).toContain(CHUNK_TXID);
    expect(receipt.rootHash).toBe(manifest.rootHash);
    expect(receipt.retrievalEndpoints).toEqual(ENDPOINTS);
  });

  it('includes verification metadata', async () => {
    const manifest = await makeManifest();
    const receipt = await buildReceipt(manifest, [CHUNK_TXID], FAKE_TXID, ENDPOINTS);

    expect(receipt.verificationMetadata).toBeDefined();
    expect(receipt.verificationMetadata!.chunkCount).toBe(1);
    expect(receipt.verificationMetadata!.chunkTxids).toEqual([CHUNK_TXID]);
    expect(receipt.verificationMetadata!.anchorTxid).toBe(FAKE_TXID);
  });

  it('puts anchorTxid first in txids list', async () => {
    const manifest = await makeManifest();
    const receipt = await buildReceipt(manifest, [CHUNK_TXID], FAKE_TXID, ENDPOINTS);
    expect(receipt.txids[0]).toBe(FAKE_TXID);
  });

  it('includes blockHeight when provided', async () => {
    const manifest = await makeManifest();
    const receipt = await buildReceipt(manifest, [CHUNK_TXID], FAKE_TXID, ENDPOINTS, 800_000);
    expect(receipt.blockHeight).toBe(800_000);
  });

  it('omits blockHeight when not provided', async () => {
    const manifest = await makeManifest();
    const receipt = await buildReceipt(manifest, [CHUNK_TXID], FAKE_TXID, ENDPOINTS);
    expect(receipt.blockHeight).toBeUndefined();
  });
});
