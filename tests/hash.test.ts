import { describe, it, expect } from 'vitest';
import { hashLeaf, hashNode, sha256Raw, toHex, fromHex } from '../src/core/hash';

describe('toHex / fromHex', () => {
  it('converts empty array', () => {
    expect(toHex(new Uint8Array(0))).toBe('');
  });

  it('converts known bytes', () => {
    expect(toHex(new Uint8Array([0x00, 0x01, 0xff]))).toBe('0001ff');
  });

  it('round-trips arbitrary bytes', () => {
    const orig = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(fromHex(toHex(orig))).toEqual(orig);
  });

  it('fromHex throws on odd-length string', () => {
    expect(() => fromHex('abc')).toThrow();
  });

  it('fromHex throws on non-hex characters', () => {
    expect(() => fromHex('zz')).toThrow();
  });

  it('fromHex accepts both upper and lower case', () => {
    expect(fromHex('DEADBEEF')).toEqual(fromHex('deadbeef'));
  });
});

describe('sha256Raw', () => {
  it('hashes the empty string to the known SHA-256 digest', async () => {
    const hash = toHex(await sha256Raw(new Uint8Array(0)));
    expect(hash).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('hashes "hello" to the known SHA-256 digest', async () => {
    const hash = toHex(await sha256Raw(new TextEncoder().encode('hello')));
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('returns 32 bytes', async () => {
    expect((await sha256Raw(new Uint8Array(100))).length).toBe(32);
  });
});

describe('hashLeaf', () => {
  it('returns 32 bytes', async () => {
    expect((await hashLeaf(new TextEncoder().encode('test'))).length).toBe(32);
  });

  it('differs from sha256Raw — domain prefix changes the result', async () => {
    const data = new TextEncoder().encode('test');
    expect(toHex(await hashLeaf(data))).not.toBe(toHex(await sha256Raw(data)));
  });

  it('is deterministic', async () => {
    const data = new TextEncoder().encode('hello world');
    const h1 = toHex(await hashLeaf(data));
    const h2 = toHex(await hashLeaf(data));
    expect(h1).toBe(h2);
  });

  it('different inputs produce different hashes', async () => {
    const h1 = toHex(await hashLeaf(new TextEncoder().encode('foo')));
    const h2 = toHex(await hashLeaf(new TextEncoder().encode('bar')));
    expect(h1).not.toBe(h2);
  });
});

describe('hashNode', () => {
  it('returns 32 bytes', async () => {
    const left = new Uint8Array(32).fill(0x01);
    const right = new Uint8Array(32).fill(0x02);
    expect((await hashNode(left, right)).length).toBe(32);
  });

  it('is NOT commutative — order of children matters', async () => {
    const left = new Uint8Array(32).fill(0x01);
    const right = new Uint8Array(32).fill(0x02);
    const h1 = toHex(await hashNode(left, right));
    const h2 = toHex(await hashNode(right, left));
    expect(h1).not.toBe(h2);
  });

  it('is deterministic', async () => {
    const left = new Uint8Array(32).fill(0xaa);
    const right = new Uint8Array(32).fill(0xbb);
    expect(toHex(await hashNode(left, right))).toBe(toHex(await hashNode(left, right)));
  });

  it('differs from hashLeaf for the same byte sequence (domain separation)', async () => {
    const left = new Uint8Array(16).fill(0x01);
    const right = new Uint8Array(16).fill(0x02);
    const combined = new Uint8Array([...left, ...right]);
    const leafH = toHex(await hashLeaf(combined));
    const nodeH = toHex(await hashNode(left, right));
    expect(leafH).not.toBe(nodeH);
  });
});
