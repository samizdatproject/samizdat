import { describe, it, expect } from 'vitest';
import { writePushData, buildDataScript, buildP2PKHScript, parsePushDataElements } from '../../src/tx/script';

describe('writePushData', () => {
  it('encodes empty data as OP_0', () => {
    expect(writePushData(new Uint8Array([]))).toEqual(new Uint8Array([0x00]));
  });

  it('encodes 1-byte data', () => {
    expect(writePushData(new Uint8Array([0xab]))).toEqual(new Uint8Array([0x01, 0xab]));
  });

  it('encodes 75-byte data with 1-byte length prefix', () => {
    const data = new Uint8Array(75).fill(0xff);
    const result = writePushData(data);
    expect(result[0]).toBe(75);
    expect(result.length).toBe(76);
  });

  it('encodes 76-byte data with OP_PUSHDATA1', () => {
    const data = new Uint8Array(76).fill(0xff);
    const result = writePushData(data);
    expect(result[0]).toBe(0x4c);
    expect(result[1]).toBe(76);
    expect(result.length).toBe(78);
  });

  it('encodes 256-byte data with OP_PUSHDATA2', () => {
    const data = new Uint8Array(256).fill(0xaa);
    const result = writePushData(data);
    expect(result[0]).toBe(0x4d);
    expect(result[1]).toBe(0x00);
    expect(result[2]).toBe(0x01);
    expect(result.length).toBe(259);
  });
});

describe('buildDataScript', () => {
  it('starts with OP_FALSE OP_RETURN', () => {
    const script = buildDataScript(new Uint8Array([0x01, 0x02]));
    expect(script[0]).toBe(0x00);
    expect(script[1]).toBe(0x6a);
  });

  it('builds script with multiple elements', () => {
    const el1 = new Uint8Array([0x01]);
    const el2 = new Uint8Array([0x02, 0x03]);
    const script = buildDataScript(el1, el2);
    expect(script[0]).toBe(0x00);
    expect(script[1]).toBe(0x6a);
    // el1: [0x01, 0x01]
    expect(script[2]).toBe(0x01);
    expect(script[3]).toBe(0x01);
    // el2: [0x02, 0x02, 0x03]
    expect(script[4]).toBe(0x02);
  });
});

describe('buildP2PKHScript', () => {
  it('produces a 25-byte script', () => {
    const hash = new Uint8Array(20).fill(0xab);
    const script = buildP2PKHScript(hash);
    expect(script.length).toBe(25);
    expect(script[0]).toBe(0x76); // OP_DUP
    expect(script[1]).toBe(0xa9); // OP_HASH160
    expect(script[2]).toBe(0x14); // push 20 bytes
    expect(script[23]).toBe(0x88); // OP_EQUALVERIFY
    expect(script[24]).toBe(0xac); // OP_CHECKSIG
  });

  it('throws for wrong-length hash', () => {
    expect(() => buildP2PKHScript(new Uint8Array(19))).toThrow(/20 bytes/);
    expect(() => buildP2PKHScript(new Uint8Array(21))).toThrow(/20 bytes/);
  });
});

describe('parsePushDataElements round-trip', () => {
  it('round-trips elements through buildDataScript', () => {
    const elements = [
      new Uint8Array([0x41, 0x42, 0x43, 0x44]),  // "ABCD" — 4 bytes
      new Uint8Array([0x01, 0x02, 0x03]),          // 3 bytes
      new Uint8Array(100).fill(0xbb),              // 100 bytes (needs OP_PUSHDATA1)
    ];
    const script = buildDataScript(...elements);
    const recovered = parsePushDataElements(script);
    expect(recovered).toHaveLength(3);
    expect(recovered[0]).toEqual(elements[0]);
    expect(recovered[1]).toEqual(elements[1]);
    expect(recovered[2]).toEqual(elements[2]);
  });

  it('throws on non-OP_FALSE OP_RETURN script', () => {
    expect(() => parsePushDataElements(new Uint8Array([0x76, 0xa9]))).toThrow(/OP_FALSE OP_RETURN/);
  });

  it('handles empty elements correctly', () => {
    const script = buildDataScript(new Uint8Array([]));
    const els = parsePushDataElements(script);
    expect(els).toHaveLength(1);
    expect(els[0]).toEqual(new Uint8Array(0));
  });
});
