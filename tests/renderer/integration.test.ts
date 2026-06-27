// End-to-end renderer integration tests.
// Flow: buildManifest → encodeAnchorPayload → resolveManifest → fetchAndVerifyChunks
//        → verifyMerkleRoot → reconstructFiles → handleRenderRequest

import { describe, it, expect, vi } from 'vitest';
import { buildManifest, hashManifest, verifyMerkleRoot } from '../../src/core/manifest';
import * as manifestModule from '../../src/core/manifest';
import { encodeAnchorPayload } from '../../src/tx/encoding';
import { CHUNK_SIZE_MIN } from '../../src/core/chunker';
import { resolveManifest } from '../../src/renderer/resolver';
import { fetchAndVerifyChunks } from '../../src/renderer/fetcher';
import { reconstructFiles } from '../../src/renderer/reconstruct';
import { handleRenderRequest } from '../../src/renderer/handler';
import { MockChainReader, MockChunkSource } from '../../src/renderer/chain';

const ANCHOR_TXID = 'c'.repeat(64);

async function setupRenderer(
  fileContent: Uint8Array,
  filename: string,
  contentType: string,
  chunkSize?: number,
) {
  const { manifest, chunks } = await buildManifest(
    [{ filename, contentType, data: fileContent }],
    chunkSize ? { chunkSize } : {},
  );
  const manifestHash = await hashManifest(manifest);
  const chunkTxids = chunks.map((_, i) => `${'d'.repeat(63)}${i}`);
  const script = encodeAnchorPayload(manifestHash, manifest.rootHash, chunkTxids, manifest);

  const chain = new MockChainReader().add(ANCHOR_TXID, script);
  const source = new MockChunkSource();
  for (const c of chunks) source.add(c.hash, c.data);

  return { manifest, chunks, chain, source, chunkTxids };
}

describe('renderer integration', () => {
  it('resolves → fetches → reconstructs a text file end-to-end', async () => {
    const content = new TextEncoder().encode('SAMIZDAT is a protocol for anonymous publishing.');
    const { manifest, chain, source } = await setupRenderer(content, 'article.txt', 'text/plain');

    const { manifest: resolved } = await resolveManifest(ANCHOR_TXID, chain);
    expect(await verifyMerkleRoot(resolved)).toBe(true);

    const chunks = await fetchAndVerifyChunks(resolved, source);
    const files = await reconstructFiles(resolved, chunks);

    expect(files).toHaveLength(1);
    expect(new TextDecoder().decode(files[0]!.data)).toBe(
      'SAMIZDAT is a protocol for anonymous publishing.',
    );
  });

  it('handleRenderRequest serves a text/plain file with CSP headers', async () => {
    const content = new TextEncoder().encode('plain text content');
    const { chain, source } = await setupRenderer(content, 'note.txt', 'text/plain');

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toContain('text/plain');
    expect(response.headers['Content-Security-Policy']).toContain("script-src 'none'");
    expect(new TextDecoder().decode(response.body)).toBe('plain text content');
  });

  it('handleRenderRequest serves HTML through the sanitizer', async () => {
    const html = '<h1>Hello</h1><script>evil()</script><p>Safe paragraph.</p>';
    const content = new TextEncoder().encode(html);
    const { chain, source } = await setupRenderer(content, 'page.html', 'text/html');

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);

    const body = new TextDecoder().decode(response.body);
    expect(response.status).toBe(200);
    expect(body).toContain('<h1>Hello</h1>');
    expect(body).not.toContain('<script');
    expect(body).not.toContain('evil()');
  });

  it('handleRenderRequest forces PDF download, never inline', async () => {
    const content = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const { chain, source } = await setupRenderer(content, 'doc.pdf', 'application/pdf');

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);

    expect(response.status).toBe(200);
    expect(response.headers['Content-Disposition']).toContain('attachment');
    expect(response.headers['Content-Type']).toContain('application/pdf');
  });

  it('handleRenderRequest returns a ZIP for multi-file manifests', async () => {
    const file1 = new TextEncoder().encode('first file');
    const file2 = new TextEncoder().encode('second file');
    const { manifest, chunks } = await buildManifest([
      { filename: 'a.txt', contentType: 'text/plain', data: file1 },
      { filename: 'b.txt', contentType: 'text/plain', data: file2 },
    ]);
    const manifestHash = await hashManifest(manifest);
    const chunkTxids = chunks.map((_, i) => `${'e'.repeat(63)}${i}`);
    const script = encodeAnchorPayload(manifestHash, manifest.rootHash, chunkTxids, manifest);

    const chain = new MockChainReader().add(ANCHOR_TXID, script);
    const source = new MockChunkSource();
    for (const c of chunks) source.add(c.hash, c.data);

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('application/zip');
    expect(response.headers['Content-Disposition']).toContain('attachment');
    // ZIP magic bytes: PK\x03\x04
    expect(response.body[0]).toBe(0x50);
    expect(response.body[1]).toBe(0x4b);
    expect(response.body[2]).toBe(0x03);
    expect(response.body[3]).toBe(0x04);
  });

  it('handleRenderRequest returns 422 when Merkle root is inconsistent', async () => {
    // Build a valid manifest, then corrupt manifest.rootHash so verifyMerkleRoot returns false.
    const content = new TextEncoder().encode('root mismatch test');
    const { manifest, chunks } = await buildManifest([
      { filename: 'f.txt', contentType: 'text/plain', data: content },
    ]);
    const manifestHash = await hashManifest(manifest);
    const chunkTxids = chunks.map((_, i) => `${'f'.repeat(63)}${i}`);

    // Tamper with the manifest's own rootHash so the decoded manifest will fail verifyMerkleRoot.
    const tamperedManifest = { ...manifest, rootHash: '0'.repeat(64) };
    const script = encodeAnchorPayload(manifestHash, '0'.repeat(64), chunkTxids, tamperedManifest);

    const chain = new MockChainReader().add(ANCHOR_TXID, script);
    const source = new MockChunkSource();
    for (const c of chunks) source.add(c.hash, c.data);

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);

    expect(response.status).toBe(422);
    const body = new TextDecoder().decode(response.body);
    expect(body).toContain('could not be verified');
  });

  it('handleRenderRequest returns 422 for unexpected non-RendererError exceptions', async () => {
    // Spy on verifyMerkleRoot to throw a plain Error (not a RendererError).
    // This covers the "Internal error during verification" fallback path in handler.ts.
    const content = new TextEncoder().encode('spy test');
    const { chain, source } = await setupRenderer(content, 'spy.txt', 'text/plain');
    vi.spyOn(manifestModule, 'verifyMerkleRoot').mockRejectedValueOnce(
      new Error('simulated unexpected error'),
    );

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);

    expect(response.status).toBe(422);
    const body = new TextDecoder().decode(response.body);
    expect(body).toContain('could not be verified');

    vi.restoreAllMocks();
  });

  it('handleRenderRequest returns 422 for unknown txid', async () => {
    const chain = new MockChainReader(); // empty
    const source = new MockChunkSource();

    const response = await handleRenderRequest('f'.repeat(64), chain, source);

    expect(response.status).toBe(422);
    expect(new TextDecoder().decode(response.body)).toContain('could not be verified');
  });

  it('handleRenderRequest returns 422 when a chunk is corrupted', async () => {
    const content = new TextEncoder().encode('tamper test');
    const { manifest, chunks, chain } = await setupRenderer(content, 'file.txt', 'text/plain');

    // Provide a corrupted chunk
    const corruptSource = new MockChunkSource();
    const bad = new Uint8Array(chunks[0]!.data);
    bad[0] ^= 0xff;
    corruptSource.add(chunks[0]!.hash, bad);

    const response = await handleRenderRequest(ANCHOR_TXID, chain, corruptSource);
    expect(response.status).toBe(422);
  });

  it('CSP header is present on all verified responses', async () => {
    const content = new TextEncoder().encode('test');
    const { chain, source } = await setupRenderer(content, 'test.txt', 'text/plain');

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);
    expect(response.headers['Content-Security-Policy']).toBeDefined();
  });

  it('CSP header is present on unverified (422) responses', async () => {
    const chain = new MockChainReader();
    const source = new MockChunkSource();
    const response = await handleRenderRequest('0'.repeat(64), chain, source);
    expect(response.status).toBe(422);
    expect(response.headers['Content-Security-Policy']).toBeDefined();
  });

  it('handleRenderRequest serves an image file with EXIF stripped', async () => {
    // Minimal JPEG: SOI marker + APP1 EXIF marker (stripped) + EOI marker
    const jpeg = new Uint8Array([
      0xff, 0xd8,             // SOI
      0xff, 0xe1,             // APP1 marker
      0x00, 0x08,             // APP1 length = 8 (includes the 2 length bytes)
      0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
      0xff, 0xd9,             // EOI
    ]);
    const { chain, source } = await setupRenderer(jpeg, 'photo.jpg', 'image/jpeg');

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);

    expect(response.status).toBe(200);
    expect(response.headers['Content-Type']).toBe('image/jpeg');
    expect(response.headers['Content-Security-Policy']).toBeDefined();
    // The APP1 EXIF segment should be stripped — body should not contain "Exif"
    const bodyText = Array.from(response.body).map(b => String.fromCharCode(b)).join('');
    expect(bodyText).not.toContain('Exif');
  });

  it('handleRenderRequest returns 422 for unexpected non-RendererError exceptions', async () => {
    // Chain reader that throws a plain Error (not a RendererError) to exercise line 67-68.
    const badChain = {
      fetchTxScript: async (_txid: string): Promise<Uint8Array> => {
        throw new Error('Unexpected network failure');
      },
    };
    const source = new MockChunkSource();

    const response = await handleRenderRequest('a'.repeat(64), badChain, source);

    expect(response.status).toBe(422);
    const body = new TextDecoder().decode(response.body);
    expect(body).toContain('could not be verified');
  });

  it('multi-chunk file is correctly reconstructed end-to-end', async () => {
    const content = new Uint8Array(CHUNK_SIZE_MIN * 3).fill(0x55); // 3 chunks
    const { chain, source } = await setupRenderer(
      content,
      'chunked.bin',
      'application/octet-stream',
      CHUNK_SIZE_MIN,
    );

    const response = await handleRenderRequest(ANCHOR_TXID, chain, source);

    expect(response.status).toBe(200);
    expect(response.body).toEqual(content);
  });
});
