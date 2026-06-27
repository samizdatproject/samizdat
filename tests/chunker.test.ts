import { describe, it, expect } from 'vitest';
import { chunkData, hashFileContent, CHUNK_SIZE_MIN, CHUNK_SIZE_MAX } from '../src/core/chunker';
import { hashLeaf, toHex } from '../src/core/hash';

describe('chunkData', () => {
  it('throws on empty data', async () => {
    await expect(chunkData(new Uint8Array(0))).rejects.toThrow();
  });

  it('throws if chunkSize is below CHUNK_SIZE_MIN', async () => {
    await expect(chunkData(new Uint8Array(100), CHUNK_SIZE_MIN - 1)).rejects.toThrow(RangeError);
  });

  it('throws if chunkSize is above CHUNK_SIZE_MAX', async () => {
    await expect(chunkData(new Uint8Array(100), CHUNK_SIZE_MAX + 1)).rejects.toThrow(RangeError);
  });

  it('data smaller than chunkSize produces one chunk', async () => {
    const data = new Uint8Array(100).fill(0xab);
    const chunks = await chunkData(data, CHUNK_SIZE_MIN);
    expect(chunks.length).toBe(1);
    expect(chunks[0]!.size).toBe(100);
    expect(chunks[0]!.index).toBe(0);
  });

  it('assigns contiguous 0-based indices', async () => {
    const data = new Uint8Array(3 * CHUNK_SIZE_MIN);
    const chunks = await chunkData(data, CHUNK_SIZE_MIN);
    expect(chunks.map(c => c.index)).toEqual([0, 1, 2]);
  });

  it('final chunk stores true length — NOT padded', async () => {
    const remainder = 452;
    const data = new Uint8Array(2 * CHUNK_SIZE_MIN + remainder);
    const chunks = await chunkData(data, CHUNK_SIZE_MIN);
    expect(chunks.length).toBe(3);
    expect(chunks[2]!.size).toBe(remainder);
    expect(chunks[2]!.data.length).toBe(remainder);
  });

  it('sum of chunk sizes equals original data size', async () => {
    const size = 1_234_567;
    const data = new Uint8Array(size).fill(0x7f);
    const chunks = await chunkData(data, CHUNK_SIZE_MIN);
    expect(chunks.reduce((acc, c) => acc + c.size, 0)).toBe(size);
  }, 30_000);

  it('chunk.hash equals toHex(hashLeaf(chunk.data))', async () => {
    const data = new Uint8Array(2 * CHUNK_SIZE_MIN + 100).fill(0x11);
    const chunks = await chunkData(data, CHUNK_SIZE_MIN);
    for (const chunk of chunks) {
      expect(chunk.hash).toBe(toHex(await hashLeaf(chunk.data)));
    }
  });

  it('concatenating all chunk data reconstructs the original', async () => {
    const data = new Uint8Array(5000);
    for (let i = 0; i < data.length; i++) data[i] = i % 251;
    const chunks = await chunkData(data, CHUNK_SIZE_MIN);
    const reconstructed = new Uint8Array(data.length);
    let offset = 0;
    for (const chunk of chunks) {
      reconstructed.set(chunk.data, offset);
      offset += chunk.size;
    }
    expect(reconstructed).toEqual(data);
  });

  it('is deterministic — same input yields identical chunk hashes', async () => {
    const data = new Uint8Array(3000).fill(0xcc);
    const c1 = await chunkData(data, CHUNK_SIZE_MIN);
    const c2 = await chunkData(data, CHUNK_SIZE_MIN);
    expect(c1.map(c => c.hash)).toEqual(c2.map(c => c.hash));
  });

  it('different chunk sizes produce different chunk counts', async () => {
    const data = new Uint8Array(4 * CHUNK_SIZE_MIN);
    const chunksA = await chunkData(data, CHUNK_SIZE_MIN);
    const chunksB = await chunkData(data, 2 * CHUNK_SIZE_MIN);
    expect(chunksA.length).toBe(4);
    expect(chunksB.length).toBe(2);
  });
});

describe('hashFileContent', () => {
  it('returns a 64-char lowercase hex string', async () => {
    const hash = await hashFileContent(new TextEncoder().encode('hello'));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('matches the known SHA-256 of "hello"', async () => {
    const hash = await hashFileContent(new TextEncoder().encode('hello'));
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('is deterministic', async () => {
    const data = new Uint8Array(1000).fill(0x42);
    expect(await hashFileContent(data)).toBe(await hashFileContent(data));
  });
});
