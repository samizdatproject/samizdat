import { describe, it, expect } from 'vitest';
import { fetchAndVerifyChunks } from '../../src/renderer/fetcher';
import { MockChunkSource } from '../../src/renderer/chain';
import { buildManifest } from '../../src/core/manifest';
import { CHUNK_SIZE_MIN } from '../../src/core/chunker';

async function makeManifestAndChunks(content = 'hello fetcher') {
  const data = new TextEncoder().encode(content);
  const { manifest, chunks } = await buildManifest([
    { filename: 'test.txt', contentType: 'text/plain', data },
  ]);
  return { manifest, chunks, data };
}

describe('fetchAndVerifyChunks', () => {
  it('returns verified chunk data for a single-chunk file', async () => {
    const { manifest, chunks } = await makeManifestAndChunks();
    const source = new MockChunkSource();
    for (const c of chunks) source.add(c.hash, c.data);

    const result = await fetchAndVerifyChunks(manifest, source);

    expect(result).toHaveLength(manifest.chunkTree.length);
    expect(result[0]).toBeInstanceOf(Uint8Array);
  });

  it('returns all chunks in chunkTree index order', async () => {
    const bigContent = new Uint8Array(CHUNK_SIZE_MIN * 3).fill(0x42); // 3 chunks at CHUNK_SIZE_MIN
    const { manifest, chunks } = await buildManifest(
      [{ filename: 'b.bin', contentType: 'application/octet-stream', data: bigContent }],
      { chunkSize: CHUNK_SIZE_MIN },
    );
    const source = new MockChunkSource();
    for (const c of chunks) source.add(c.hash, c.data);

    const result = await fetchAndVerifyChunks(manifest, source);

    expect(result).toHaveLength(chunks.length);
    for (let i = 0; i < result.length; i++) {
      expect(result[i]).toEqual(chunks[i]!.data);
    }
  });

  it('throws CHUNK_MISSING when a chunk is not in the source', async () => {
    const { manifest } = await makeManifestAndChunks();
    const source = new MockChunkSource(); // empty — nothing loaded

    await expect(fetchAndVerifyChunks(manifest, source)).rejects.toMatchObject({
      code: 'CHUNK_MISSING',
    });
  });

  it('throws CHUNK_HASH_MISMATCH when fetched data is tampered', async () => {
    const { manifest, chunks } = await makeManifestAndChunks();
    const source = new MockChunkSource();
    // Add a tampered version of the chunk
    const tampered = new Uint8Array(chunks[0]!.data);
    tampered[0] ^= 0xff;
    source.add(chunks[0]!.hash, tampered);

    await expect(fetchAndVerifyChunks(manifest, source)).rejects.toMatchObject({
      code: 'CHUNK_HASH_MISMATCH',
    });
  });

  it('passes chunk txids to the source fetchChunk call', async () => {
    const { manifest, chunks } = await makeManifestAndChunks();
    const txids = ['txid_' + '0'.repeat(60)];
    const source = new MockChunkSource();
    for (const c of chunks) source.add(c.hash, c.data);

    // Should not throw — txid arg is optional in MockChunkSource
    await expect(fetchAndVerifyChunks(manifest, source, txids)).resolves.toBeTruthy();
  });
});
