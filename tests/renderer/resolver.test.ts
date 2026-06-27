import { describe, it, expect } from 'vitest';
import { resolveManifest } from '../../src/renderer/resolver';
import { MockChainReader } from '../../src/renderer/chain';
import { RendererError } from '../../src/renderer/errors';
import { buildManifest, hashManifest } from '../../src/core/manifest';
import { encodeAnchorPayload } from '../../src/tx/encoding';

const CHUNK_TXID = 'a'.repeat(64);
const ANCHOR_TXID = 'b'.repeat(64);

async function makeAnchorScript(content = 'hello samizdat') {
  const data = new TextEncoder().encode(content);
  const { manifest } = await buildManifest([
    { filename: 'test.txt', contentType: 'text/plain', data },
  ]);
  const manifestHash = await hashManifest(manifest);
  const script = encodeAnchorPayload(manifestHash, manifest.rootHash, [CHUNK_TXID], manifest);
  return { manifest, manifestHash, script };
}

describe('resolveManifest', () => {
  it('resolves a valid anchor tx into a verified manifest', async () => {
    const { manifest, manifestHash, script } = await makeAnchorScript();
    const chain = new MockChainReader().add(ANCHOR_TXID, script);

    const result = await resolveManifest(ANCHOR_TXID, chain);

    expect(result.manifest.version).toBe('1');
    expect(result.manifest.rootHash).toBe(manifest.rootHash);
    expect(result.manifestHash).toBe(manifestHash);
    expect(result.rootHash).toBe(manifest.rootHash);
    expect(result.chunkTxids).toEqual([CHUNK_TXID]);
  });

  it('throws TX_NOT_FOUND for unknown txid', async () => {
    const chain = new MockChainReader();
    await expect(resolveManifest('deadbeef'.repeat(8), chain)).rejects.toMatchObject({
      code: 'TX_NOT_FOUND',
    });
  });

  it('throws PAYLOAD_DECODE_FAILED for corrupted script', async () => {
    const corrupt = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
    const chain = new MockChainReader().add(ANCHOR_TXID, corrupt);
    await expect(resolveManifest(ANCHOR_TXID, chain)).rejects.toMatchObject({
      code: 'PAYLOAD_DECODE_FAILED',
    });
  });

  it('throws HASH_MISMATCH when manifestHash in payload is wrong', async () => {
    const data = new TextEncoder().encode('content');
    const { manifest } = await buildManifest([
      { filename: 'f.txt', contentType: 'text/plain', data },
    ]);
    // Use a wrong manifestHash
    const wrongHash = '0'.repeat(64);
    const script = encodeAnchorPayload(wrongHash, manifest.rootHash, [CHUNK_TXID], manifest);
    const chain = new MockChainReader().add(ANCHOR_TXID, script);

    await expect(resolveManifest(ANCHOR_TXID, chain)).rejects.toMatchObject({
      code: 'HASH_MISMATCH',
    });
  });

  it('throws ROOT_HASH_MISMATCH when rootHash in payload differs from manifest.rootHash', async () => {
    const data = new TextEncoder().encode('content');
    const { manifest } = await buildManifest([
      { filename: 'f.txt', contentType: 'text/plain', data },
    ]);
    const manifestHash = await hashManifest(manifest);
    const wrongRoot = 'f'.repeat(64);
    const script = encodeAnchorPayload(manifestHash, wrongRoot, [CHUNK_TXID], manifest);
    const chain = new MockChainReader().add(ANCHOR_TXID, script);

    await expect(resolveManifest(ANCHOR_TXID, chain)).rejects.toMatchObject({
      code: 'ROOT_HASH_MISMATCH',
    });
  });

  it('RendererError has correct name and code fields', async () => {
    const chain = new MockChainReader();
    try {
      await resolveManifest('x'.repeat(64), chain);
    } catch (err) {
      expect(err).toBeInstanceOf(RendererError);
      const re = err as RendererError;
      expect(re.name).toBe('RendererError');
      expect(re.code).toBe('TX_NOT_FOUND');
    }
  });
});
