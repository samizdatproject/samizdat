import { describe, it, expect } from 'vitest';
import {
  encodeChunkPayload,
  encodeAnchorPayload,
  decodeChunkPayload,
  decodeAnchorPayload,
  stableStringify,
} from '../../src/tx/encoding';
import type { Manifest } from '../../src/core/types';

const MANIFEST_HASH_HEX = 'a'.repeat(64);
const ROOT_HASH_HEX = 'b'.repeat(64);
const CHUNK_TXIDS = ['c'.repeat(64), 'd'.repeat(64)];

function makeManifest(): Manifest {
  return {
    version: '1',
    authorMode: 'anonymous',
    publicationMode: 'onchain',
    fileTree: [{
      filename: 'test.txt',
      contentType: 'text/plain',
      size: 5,
      hash: 'e'.repeat(64),
      chunks: [{ index: 0, size: 5, hash: 'f'.repeat(64) }],
    }],
    chunkTree: [{ index: 0, size: 5, hash: 'f'.repeat(64) }],
    rootHash: ROOT_HASH_HEX,
  };
}

describe('stableStringify', () => {
  it('sorts keys alphabetically', () => {
    const obj = { z: 1, a: 2, m: 3 };
    const result = stableStringify(obj);
    const parsed = JSON.parse(result);
    expect(Object.keys(parsed)).toEqual(['a', 'm', 'z']);
  });

  it('passes through non-object values', () => {
    expect(stableStringify(42)).toBe('42');
    expect(stableStringify('hello')).toBe('"hello"');
    expect(stableStringify([1, 2])).toBe('[1,2]');
    expect(stableStringify(null)).toBe('null');
  });
});

describe('chunk payload encode/decode round-trip', () => {
  it('round-trips small chunk', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);
    const blob = encodeChunkPayload(0, data);
    const decoded = decodeChunkPayload(blob);

    expect(decoded.version).toBe(1);
    expect(decoded.chunkIndex).toBe(0);
    expect(decoded.data).toEqual(data);
  });

  it('round-trips chunk with non-zero index', () => {
    const data = new Uint8Array(100).fill(0x42);
    const blob = encodeChunkPayload(7, data);
    const decoded = decodeChunkPayload(blob);

    expect(decoded.chunkIndex).toBe(7);
    expect(decoded.data).toEqual(data);
  });

  it('throws on wrong marker', () => {
    // Construct a blob with "XXXX" instead of "SAMIZDAT"
    const blob = new Uint8Array(14);
    new TextEncoder().encodeInto('XXXX', blob); // writes to offset 0
    blob[4] = 0x01; // TYPE_CHUNK
    blob[5] = 0x01; // version
    expect(() => decodeChunkPayload(blob)).toThrow(/SAMIZDAT/);
  });

  it('throws on wrong type (anchor blob passed to chunk decoder)', () => {
    const anchorBlob = encodeAnchorPayload(
      MANIFEST_HASH_HEX,
      ROOT_HASH_HEX,
      CHUNK_TXIDS,
      makeManifest(),
    );
    expect(() => decodeChunkPayload(anchorBlob)).toThrow(/CHUNK/);
  });
});

describe('anchor payload encode/decode round-trip', () => {
  it('round-trips all fields', () => {
    const manifest = makeManifest();
    const blob = encodeAnchorPayload(MANIFEST_HASH_HEX, ROOT_HASH_HEX, CHUNK_TXIDS, manifest);
    const decoded = decodeAnchorPayload(blob);

    expect(decoded.version).toBe(1);
    expect(decoded.manifestHash).toBe(MANIFEST_HASH_HEX);
    expect(decoded.rootHash).toBe(ROOT_HASH_HEX);
    expect(decoded.chunkTxids).toEqual(CHUNK_TXIDS);
    expect(decoded.manifest.version).toBe('1');
    expect(decoded.manifest.rootHash).toBe(ROOT_HASH_HEX);
  });

  it('throws on wrong type (chunk blob passed to anchor decoder)', () => {
    // Need blob >= 74 bytes to pass the length check and reach the type check.
    const chunkBlob = encodeChunkPayload(0, new Uint8Array(80)); // 14 + 80 = 94 bytes
    expect(() => decodeAnchorPayload(chunkBlob)).toThrow(/ANCHOR/);
  });
});
