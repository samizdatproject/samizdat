// Regression tests against the committed test vectors in src/test-vectors/vectors.json.
// These are the SAMIZDAT reproducibility guarantee: any correct implementation must
// produce identical hashes for these inputs.
//
// If any of these fail, the hashing spec or implementation has changed in a
// breaking way. Update the vectors file (and document why) only with deliberate
// intent — do not auto-regenerate to silence a failure.

import { describe, it, expect } from 'vitest';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import { hashLeaf, hashNode, sha256Raw, toHex } from '../src/core/hash';
import { computeMerkleRoot } from '../src/core/merkle';
import { chunkData, hashFileContent, CHUNK_SIZE_MIN } from '../src/core/chunker';
import { buildManifest } from '../src/core/manifest';

const vectorsPath = new URL('../src/test-vectors/vectors.json', import.meta.url).pathname;

interface Vectors {
  sha256Raw: Record<string, string>;
  hashLeaf: Record<string, string>;
  hashNode: Record<string, string>;
  merkleRoot: Record<string, string>;
  chunker: {
    hello_samizdat: { chunk_count: number; chunks: Array<{ index: number; size: number; hash: string }> };
    fixed_3000_x42: { chunk_count: number; chunks: Array<{ index: number; size: number; hash: string }> };
    file_hash_hello_samizdat: string;
  };
  manifest: {
    simple: { file_count: number; chunk_count: number; root_hash: string; file_hash: string };
    multi_file: { file_count: number; chunk_count: number; root_hash: string; file_hashes: string[] };
  };
}

async function loadVectors(): Promise<Vectors> {
  const raw = await readFile(vectorsPath, 'utf8');
  return JSON.parse(raw) as Vectors;
}

const enc = new TextEncoder();

describe('test vectors — sha256Raw', () => {
  it('empty input', async () => {
    const v = await loadVectors();
    expect(toHex(await sha256Raw(new Uint8Array(0)))).toBe(v.sha256Raw['empty']);
  });

  it('"hello"', async () => {
    const v = await loadVectors();
    expect(toHex(await sha256Raw(enc.encode('hello')))).toBe(v.sha256Raw['hello']);
  });

  it('"hello samizdat"', async () => {
    const v = await loadVectors();
    expect(toHex(await sha256Raw(enc.encode('hello samizdat')))).toBe(v.sha256Raw['hello_samizdat']);
  });
});

describe('test vectors — hashLeaf', () => {
  it('empty input', async () => {
    const v = await loadVectors();
    expect(toHex(await hashLeaf(new Uint8Array(0)))).toBe(v.hashLeaf['empty']);
  });

  it('"hello"', async () => {
    const v = await loadVectors();
    expect(toHex(await hashLeaf(enc.encode('hello')))).toBe(v.hashLeaf['hello']);
  });

  it('"hello samizdat"', async () => {
    const v = await loadVectors();
    expect(toHex(await hashLeaf(enc.encode('hello samizdat')))).toBe(v.hashLeaf['hello_samizdat']);
  });

  it('leaf("hello samizdat") == chunker.hello_samizdat.chunks[0].hash (chunk hash IS the leaf hash)', async () => {
    const v = await loadVectors();
    expect(v.hashLeaf['hello_samizdat']).toBe(v.chunker.hello_samizdat.chunks[0]!.hash);
  });
});

describe('test vectors — hashNode', () => {
  it('0x01×32 then 0x02×32', async () => {
    const v = await loadVectors();
    const left  = new Uint8Array(32).fill(0x01);
    const right = new Uint8Array(32).fill(0x02);
    expect(toHex(await hashNode(left, right))).toBe(v.hashNode['0x01_32bytes_then_0x02_32bytes']);
  });

  it('0x02×32 then 0x01×32 (reversed — different result)', async () => {
    const v = await loadVectors();
    const left  = new Uint8Array(32).fill(0x02);
    const right = new Uint8Array(32).fill(0x01);
    expect(toHex(await hashNode(left, right))).toBe(v.hashNode['0x02_32bytes_then_0x01_32bytes']);
  });

  it('hashNode(0x01×32, 0x02×32) == merkle root of two such leaves', async () => {
    // This confirms the Merkle tree reduces to hashNode for two leaves, as expected.
    const v = await loadVectors();
    expect(v.hashNode['0x01_32bytes_then_0x02_32bytes']).toBe(v.merkleRoot['two_leaves_0x01_0x02']);
  });
});

describe('test vectors — Merkle root', () => {
  const makeLeaves = (count: number) =>
    Array.from({ length: count }, (_, i) => new Uint8Array(32).fill(i + 1));

  it('1 leaf: root equals the leaf itself', async () => {
    const v = await loadVectors();
    const root = toHex(await computeMerkleRoot(makeLeaves(1)));
    expect(root).toBe(v.merkleRoot['one_leaf_0x01']);
  });

  it('2 leaves', async () => {
    const v = await loadVectors();
    expect(toHex(await computeMerkleRoot(makeLeaves(2)))).toBe(v.merkleRoot['two_leaves_0x01_0x02']);
  });

  it('3 leaves (odd — last duplicated)', async () => {
    const v = await loadVectors();
    expect(toHex(await computeMerkleRoot(makeLeaves(3)))).toBe(v.merkleRoot['three_leaves_0x01_0x02_0x03']);
  });

  it('4 leaves (balanced)', async () => {
    const v = await loadVectors();
    expect(toHex(await computeMerkleRoot(makeLeaves(4)))).toBe(v.merkleRoot['four_leaves_0x01_0x02_0x03_0x04']);
  });
});

describe('test vectors — chunker', () => {
  it('"hello samizdat" produces expected chunk count and hashes', async () => {
    const v = await loadVectors();
    const chunks = await chunkData(enc.encode('hello samizdat'), CHUNK_SIZE_MIN);
    expect(chunks.length).toBe(v.chunker.hello_samizdat.chunk_count);
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.hash).toBe(v.chunker.hello_samizdat.chunks[i]!.hash);
      expect(chunks[i]!.size).toBe(v.chunker.hello_samizdat.chunks[i]!.size);
    }
  });

  it('3000 bytes of 0x42 produces expected chunk count, sizes, and hashes', async () => {
    const v = await loadVectors();
    const chunks = await chunkData(new Uint8Array(3000).fill(0x42), CHUNK_SIZE_MIN);
    expect(chunks.length).toBe(v.chunker.fixed_3000_x42.chunk_count);
    expect(chunks[2]!.size).toBe(3000 - 2 * CHUNK_SIZE_MIN); // 952 — not padded
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i]!.hash).toBe(v.chunker.fixed_3000_x42.chunks[i]!.hash);
    }
  });

  it('file hash of "hello samizdat"', async () => {
    const v = await loadVectors();
    expect(await hashFileContent(enc.encode('hello samizdat'))).toBe(v.chunker.file_hash_hello_samizdat);
  });
});

describe('test vectors — manifest', () => {
  it('single-file manifest has the expected root hash and file hash', async () => {
    const v = await loadVectors();
    const { manifest } = await buildManifest(
      [{ filename: 'article.txt', contentType: 'text/plain', data: enc.encode('hello samizdat') }],
      { title: 'Test Article', chunkSize: CHUNK_SIZE_MIN },
    );
    expect(manifest.fileTree.length).toBe(v.manifest.simple.file_count);
    expect(manifest.chunkTree.length).toBe(v.manifest.simple.chunk_count);
    expect(manifest.rootHash).toBe(v.manifest.simple.root_hash);
    expect(manifest.fileTree[0]!.hash).toBe(v.manifest.simple.file_hash);
  });

  it('multi-file manifest has the expected root hash and per-file hashes', async () => {
    const v = await loadVectors();
    const { manifest } = await buildManifest(
      [
        { filename: 'a.txt', contentType: 'text/plain', data: enc.encode('file a') },
        { filename: 'b.txt', contentType: 'text/plain', data: enc.encode('file b contents are longer') },
      ],
      { authorMode: 'pseudonymous', chunkSize: CHUNK_SIZE_MIN },
    );
    expect(manifest.fileTree.length).toBe(v.manifest.multi_file.file_count);
    expect(manifest.chunkTree.length).toBe(v.manifest.multi_file.chunk_count);
    expect(manifest.rootHash).toBe(v.manifest.multi_file.root_hash);
    expect(manifest.fileTree.map(f => f.hash)).toEqual(v.manifest.multi_file.file_hashes);
  });
});
