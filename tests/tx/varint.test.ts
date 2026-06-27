import { describe, it, expect } from 'vitest';
import { writeVarint, writeUint32LE, writeInt64LE, readVarint, concat } from '../../src/tx/varint';

describe('writeVarint', () => {
  it('encodes 0 as single byte', () => {
    expect(writeVarint(0)).toEqual(new Uint8Array([0x00]));
  });

  it('encodes values 0–0xfc as one byte', () => {
    expect(writeVarint(0xfc)).toEqual(new Uint8Array([0xfc]));
    expect(writeVarint(1)).toEqual(new Uint8Array([0x01]));
  });

  it('encodes 0xfd with fd prefix', () => {
    const result = writeVarint(0xfd);
    expect(result).toEqual(new Uint8Array([0xfd, 0xfd, 0x00]));
  });

  it('encodes 0xffff with fd prefix', () => {
    const result = writeVarint(0xffff);
    expect(result).toEqual(new Uint8Array([0xfd, 0xff, 0xff]));
  });

  it('encodes values ≥ 0x10000 with fe prefix', () => {
    const result = writeVarint(0x10000);
    expect(result).toEqual(new Uint8Array([0xfe, 0x00, 0x00, 0x01, 0x00]));
  });

  it('throws for negative values', () => {
    expect(() => writeVarint(-1)).toThrow(/non-negative/);
  });
});

describe('readVarint', () => {
  it('reads single-byte varint', () => {
    const buf = new Uint8Array([0x42, 0xff]);
    const [val, len] = readVarint(buf, 0);
    expect(val).toBe(0x42);
    expect(len).toBe(1);
  });

  it('reads 3-byte varint', () => {
    const buf = new Uint8Array([0xfd, 0x01, 0x02]);
    const [val, len] = readVarint(buf, 0);
    expect(val).toBe(0x0201);
    expect(len).toBe(3);
  });

  it('round-trips writeVarint/readVarint', () => {
    for (const n of [0, 1, 252, 253, 0xffff, 0x10000, 0xffffffff]) {
      const buf = writeVarint(n);
      const [val] = readVarint(buf, 0);
      expect(val).toBe(n);
    }
  });

  it('throws on empty buffer', () => {
    expect(() => readVarint(new Uint8Array([]), 0)).toThrow();
  });
});

describe('writeUint32LE', () => {
  it('encodes 0 as four zero bytes', () => {
    expect(writeUint32LE(0)).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('encodes 1 correctly', () => {
    expect(writeUint32LE(1)).toEqual(new Uint8Array([1, 0, 0, 0]));
  });

  it('encodes 0x01020304 in LE order', () => {
    expect(writeUint32LE(0x01020304)).toEqual(new Uint8Array([0x04, 0x03, 0x02, 0x01]));
  });
});

describe('writeInt64LE', () => {
  it('encodes 0n as eight zero bytes', () => {
    expect(writeInt64LE(0n)).toEqual(new Uint8Array(8));
  });

  it('encodes 1n correctly', () => {
    const result = writeInt64LE(1n);
    expect(result[0]).toBe(1);
    expect(result.slice(1)).toEqual(new Uint8Array(7));
  });

  it('encodes large value', () => {
    const result = writeInt64LE(0x0102030405060708n);
    expect(result).toEqual(new Uint8Array([0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01]));
  });
});

describe('concat', () => {
  it('concatenates arrays', () => {
    expect(concat(new Uint8Array([1, 2]), new Uint8Array([3, 4]))).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('handles zero arguments', () => {
    expect(concat()).toEqual(new Uint8Array([]));
  });
});
