import { describe, it, expect } from 'vitest';
import {
  buildManifest,
  validateManifest,
  verifyMerkleRoot,
  verifyChunkData,
  hashManifest,
  ManifestValidationError,
} from '../src/core/manifest';
import { CHUNK_SIZE_MIN } from '../src/core/chunker';

const enc = new TextEncoder();

// Minimal valid manifest stub for validator tests.
const validChunkRef = { index: 0, size: 5, hash: 'a'.repeat(64) };
const validFileObj = {
  filename: 'test.txt',
  contentType: 'text/plain',
  size: 5,
  hash: 'b'.repeat(64),
  chunks: [validChunkRef],
};
const minimalValid = {
  version: '1' as const,
  authorMode: 'anonymous' as const,
  publicationMode: 'onchain' as const,
  rootHash: 'c'.repeat(64),
  fileTree: [validFileObj],
  chunkTree: [validChunkRef],
};

describe('buildManifest', () => {
  it('throws on empty files array', async () => {
    await expect(buildManifest([])).rejects.toThrow('at least one file');
  });

  it('builds a valid manifest from a single small file', async () => {
    const { manifest, chunks } = await buildManifest([
      { filename: 'hello.txt', contentType: 'text/plain', data: enc.encode('Hello, SAMIZDAT!') },
    ]);
    expect(manifest.version).toBe('1');
    expect(manifest.authorMode).toBe('anonymous');
    expect(manifest.publicationMode).toBe('onchain');
    expect(manifest.fileTree.length).toBe(1);
    expect(manifest.chunkTree.length).toBe(1);
    expect(manifest.fileTree[0]!.filename).toBe('hello.txt');
    expect(manifest.fileTree[0]!.size).toBe(enc.encode('Hello, SAMIZDAT!').length);
    expect(manifest.rootHash).toMatch(/^[0-9a-f]{64}$/);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.data).toBeInstanceOf(Uint8Array);
  });

  it('propagates optional fields from options', async () => {
    const { manifest } = await buildManifest(
      [{ filename: 'a.txt', contentType: 'text/plain', data: enc.encode('test') }],
      {
        title: 'My Article',
        subtitle: 'A subtitle',
        tags: ['bsv', 'samizdat'],
        language: 'en',
        authorMode: 'pseudonymous',
        publicationMode: 'hybrid',
        createdAt: '2025-01-01T00:00:00Z',
      },
    );
    expect(manifest.title).toBe('My Article');
    expect(manifest.subtitle).toBe('A subtitle');
    expect(manifest.tags).toEqual(['bsv', 'samizdat']);
    expect(manifest.language).toBe('en');
    expect(manifest.authorMode).toBe('pseudonymous');
    expect(manifest.publicationMode).toBe('hybrid');
    expect(manifest.createdAt).toBe('2025-01-01T00:00:00Z');
  });

  it('does not include undefined optional fields in the manifest object', async () => {
    const { manifest } = await buildManifest([
      { filename: 'a.txt', contentType: 'text/plain', data: enc.encode('test') },
    ]);
    expect('title' in manifest).toBe(false);
    expect('tags' in manifest).toBe(false);
    expect('txidAnchor' in manifest).toBe(false);
  });

  it('multi-file manifest has global chunk indices across files', async () => {
    const dataA = new Uint8Array(2 * CHUNK_SIZE_MIN).fill(0x01);
    const dataB = new Uint8Array(CHUNK_SIZE_MIN).fill(0x02);
    const { manifest } = await buildManifest(
      [
        { filename: 'a.bin', contentType: 'application/octet-stream', data: dataA },
        { filename: 'b.bin', contentType: 'application/octet-stream', data: dataB },
      ],
      { chunkSize: CHUNK_SIZE_MIN },
    );
    // file A produces 2 chunks (indices 0, 1), file B produces 1 chunk (index 2)
    expect(manifest.fileTree[0]!.chunks.map(c => c.index)).toEqual([0, 1]);
    expect(manifest.fileTree[1]!.chunks.map(c => c.index)).toEqual([2]);
    expect(manifest.chunkTree.map(c => c.index)).toEqual([0, 1, 2]);
  });

  it('chunkTree hashes match the corresponding chunk .data hashes', async () => {
    const { manifest, chunks } = await buildManifest(
      [{ filename: 'x.bin', contentType: 'application/octet-stream', data: new Uint8Array(3000).fill(0xab) }],
      { chunkSize: CHUNK_SIZE_MIN },
    );
    for (let i = 0; i < manifest.chunkTree.length; i++) {
      expect(manifest.chunkTree[i]!.hash).toBe(chunks[i]!.hash);
    }
  });

  it('rootHash is verifiable via verifyMerkleRoot', async () => {
    const { manifest } = await buildManifest([
      { filename: 'test.txt', contentType: 'text/plain', data: enc.encode('reproducible content') },
    ]);
    expect(await verifyMerkleRoot(manifest)).toBe(true);
  });

  it('a tampered rootHash fails verifyMerkleRoot', async () => {
    const { manifest } = await buildManifest([
      { filename: 'test.txt', contentType: 'text/plain', data: enc.encode('test') },
    ]);
    const tampered = { ...manifest, rootHash: 'f'.repeat(64) };
    expect(await verifyMerkleRoot(tampered)).toBe(false);
  });

  it('is deterministic — same inputs produce identical manifests', async () => {
    const files = [
      { filename: 'article.md', contentType: 'text/markdown', data: enc.encode('# Hello\n\nThis is a test.') },
    ];
    const { manifest: m1 } = await buildManifest(files);
    const { manifest: m2 } = await buildManifest(files);
    expect(m1.rootHash).toBe(m2.rootHash);
    expect(JSON.stringify(m1)).toBe(JSON.stringify(m2));
  });
});

describe('hashManifest', () => {
  it('returns a 64-char hex string', async () => {
    const { manifest } = await buildManifest([
      { filename: 'a.txt', contentType: 'text/plain', data: enc.encode('hello') },
    ]);
    expect(await hashManifest(manifest)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', async () => {
    const { manifest } = await buildManifest([
      { filename: 'a.txt', contentType: 'text/plain', data: enc.encode('hello') },
    ]);
    expect(await hashManifest(manifest)).toBe(await hashManifest(manifest));
  });
});

describe('verifyChunkData', () => {
  it('returns true when data matches the declared hash', async () => {
    const { manifest, chunks } = await buildManifest([
      { filename: 'a.txt', contentType: 'text/plain', data: enc.encode('hello samizdat') },
    ]);
    const declaredHash = manifest.chunkTree[0]!.hash;
    expect(await verifyChunkData(chunks[0]!.data, declaredHash)).toBe(true);
  });

  it('returns false when data has been tampered with', async () => {
    const { manifest, chunks } = await buildManifest([
      { filename: 'a.txt', contentType: 'text/plain', data: enc.encode('hello samizdat') },
    ]);
    const declaredHash = manifest.chunkTree[0]!.hash;
    const tampered = new Uint8Array(chunks[0]!.data);
    tampered[0] = tampered[0]! ^ 0xff; // flip a byte
    expect(await verifyChunkData(tampered, declaredHash)).toBe(false);
  });
});

describe('validateManifest', () => {
  it('accepts a minimal valid manifest', () => {
    expect(() => validateManifest(minimalValid)).not.toThrow();
  });

  it('accepts a manifest produced by buildManifest', async () => {
    const { manifest } = await buildManifest([
      { filename: 'a.txt', contentType: 'text/plain', data: enc.encode('hello') },
    ]);
    expect(() => validateManifest(manifest)).not.toThrow();
  });

  it('throws ManifestValidationError on null', () => {
    expect(() => validateManifest(null)).toThrow(ManifestValidationError);
  });

  it('throws on array', () => {
    expect(() => validateManifest([])).toThrow(ManifestValidationError);
  });

  it('throws on missing version', () => {
    const { version: _, ...noVersion } = minimalValid;
    expect(() => validateManifest(noVersion)).toThrow(ManifestValidationError);
  });

  it('throws on unsupported version', () => {
    expect(() => validateManifest({ ...minimalValid, version: '99' })).toThrow(ManifestValidationError);
  });

  it('throws on invalid authorMode', () => {
    expect(() => validateManifest({ ...minimalValid, authorMode: 'hacker' })).toThrow(ManifestValidationError);
  });

  it('throws on invalid publicationMode', () => {
    expect(() => validateManifest({ ...minimalValid, publicationMode: 'cloud' })).toThrow(ManifestValidationError);
  });

  it('throws on missing rootHash', () => {
    const { rootHash: _, ...noRoot } = minimalValid;
    expect(() => validateManifest(noRoot)).toThrow(ManifestValidationError);
  });

  it('throws on rootHash with wrong length', () => {
    expect(() => validateManifest({ ...minimalValid, rootHash: 'a'.repeat(63) })).toThrow(ManifestValidationError);
  });

  it('throws on rootHash with uppercase hex', () => {
    expect(() => validateManifest({ ...minimalValid, rootHash: 'A'.repeat(64) })).toThrow(ManifestValidationError);
  });

  it('throws on empty fileTree', () => {
    expect(() => validateManifest({ ...minimalValid, fileTree: [] })).toThrow(ManifestValidationError);
  });

  it('throws on empty chunkTree', () => {
    expect(() => validateManifest({ ...minimalValid, chunkTree: [] })).toThrow(ManifestValidationError);
  });

  it('throws on fileObject with zero size', () => {
    const badFile = { ...validFileObj, size: 0 };
    expect(() => validateManifest({ ...minimalValid, fileTree: [badFile] })).toThrow(ManifestValidationError);
  });

  it('throws on chunkRef with non-hex hash', () => {
    const badChunk = { ...validChunkRef, hash: 'g'.repeat(64) };
    expect(() => validateManifest({ ...minimalValid, chunkTree: [badChunk] })).toThrow(ManifestValidationError);
  });

  it('throws if tags is not an array', () => {
    expect(() => validateManifest({ ...minimalValid, tags: 'bsv' })).toThrow(ManifestValidationError);
  });

  it('throws if a tag is not a string', () => {
    expect(() => validateManifest({ ...minimalValid, tags: [42] })).toThrow(ManifestValidationError);
  });

  it('throws if title is not a string', () => {
    expect(() => validateManifest({ ...minimalValid, title: 42 })).toThrow(ManifestValidationError);
  });

  it('returns the manifest typed as Manifest on success', () => {
    const result = validateManifest(minimalValid);
    expect(result.version).toBe('1');
    expect(result.rootHash).toBe('c'.repeat(64));
  });
});
