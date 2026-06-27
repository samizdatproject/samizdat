import { describe, it, expect } from 'vitest';
import { reconstructFiles } from '../../src/renderer/reconstruct';
import { buildManifest } from '../../src/core/manifest';
import { CHUNK_SIZE_MIN } from '../../src/core/chunker';

async function makeTestData(content: string | Uint8Array, filename = 'test.txt') {
  const data = typeof content === 'string' ? new TextEncoder().encode(content) : content;
  const { manifest, chunks } = await buildManifest([
    { filename, contentType: 'text/plain', data },
  ]);
  // Build the verifiedChunks array keyed by global index
  const verifiedChunks: Uint8Array[] = [];
  for (const c of chunks) verifiedChunks[c.index] = c.data;
  return { manifest, chunks, data, verifiedChunks };
}

describe('reconstructFiles', () => {
  it('reconstructs a single-file manifest', async () => {
    const { manifest, data, verifiedChunks } = await makeTestData('hello reconstruct');
    const files = await reconstructFiles(manifest, verifiedChunks);

    expect(files).toHaveLength(1);
    expect(files[0]!.filename).toBe('test.txt');
    expect(files[0]!.contentType).toBe('text/plain');
    expect(files[0]!.data).toEqual(data);
  });

  it('reconstructs a multi-chunk file correctly', async () => {
    const bigData = new Uint8Array(CHUNK_SIZE_MIN * 3).fill(0xab); // 3 chunks
    const { manifest: m2, chunks } = await buildManifest(
      [{ filename: 'big.bin', contentType: 'application/octet-stream', data: bigData }],
      { chunkSize: CHUNK_SIZE_MIN },
    );
    const vc: Uint8Array[] = [];
    for (const c of chunks) vc[c.index] = c.data;

    const files = await reconstructFiles(m2, vc);
    expect(files[0]!.data).toEqual(bigData);
    expect(files[0]!.data.length).toBe(CHUNK_SIZE_MIN * 3);
  });

  it('reconstructs a multi-file manifest', async () => {
    const file1 = new TextEncoder().encode('file one content');
    const file2 = new TextEncoder().encode('file two content');
    const { manifest, chunks } = await buildManifest([
      { filename: 'a.txt', contentType: 'text/plain', data: file1 },
      { filename: 'b.txt', contentType: 'text/plain', data: file2 },
    ]);
    const vc: Uint8Array[] = [];
    for (const c of chunks) vc[c.index] = c.data;

    const files = await reconstructFiles(manifest, vc);

    expect(files).toHaveLength(2);
    expect(files[0]!.filename).toBe('a.txt');
    expect(files[0]!.data).toEqual(file1);
    expect(files[1]!.filename).toBe('b.txt');
    expect(files[1]!.data).toEqual(file2);
  });

  it('throws HASH_MISMATCH if assembled file data is tampered', async () => {
    const { manifest, verifiedChunks } = await makeTestData('tamper me');
    // Corrupt the first chunk byte
    const bad = new Uint8Array(verifiedChunks[0]!);
    bad[0] ^= 0xff;
    verifiedChunks[0] = bad;

    await expect(reconstructFiles(manifest, verifiedChunks)).rejects.toMatchObject({
      code: 'HASH_MISMATCH',
    });
  });

  it('throws CHUNK_MISSING if a chunk index is absent from verifiedChunks', async () => {
    const { manifest } = await makeTestData('missing chunk');
    // Provide an empty array — no chunks at all
    await expect(reconstructFiles(manifest, [])).rejects.toMatchObject({
      code: 'CHUNK_MISSING',
    });
  });

  it('exposes the correct file hash on the result', async () => {
    const { manifest, verifiedChunks } = await makeTestData('hash check');
    const files = await reconstructFiles(manifest, verifiedChunks);
    expect(files[0]!.hash).toBe(manifest.fileTree[0]!.hash);
  });
});
