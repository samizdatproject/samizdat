import { describe, it, expect } from 'vitest';
import {
  writePushData,
  buildDataCarrierScript,
  buildP2PKHScript,
  extractDataCarrierPayload,
} from '../../src/tx/script';

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

describe('buildDataCarrierScript', () => {
  const hash = new Uint8Array(20).fill(0xab);

  it('embeds blob before OP_DROP and P2PKH suffix', () => {
    const blob = new Uint8Array([0x53, 0x4d, 0x5a, 0x44, 0x01]);
    const script = buildDataCarrierScript(blob, hash);
    expect(script[0]).toBe(0x05); // push 5 bytes
    expect(script.slice(1, 6)).toEqual(blob);
    expect(script[6]).toBe(0x75); // OP_DROP
    expect(script[7]).toBe(0x76); // OP_DUP — start of P2PKH
    expect(script.length).toBe(7 + 25);
  });

  it('round-trips blob through extractDataCarrierPayload', () => {
    const blob = new Uint8Array(100).fill(0xbb);
    const script = buildDataCarrierScript(blob, hash);
    expect(extractDataCarrierPayload(script)).toEqual(blob);
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

describe('extractDataCarrierPayload', () => {
  const hash = new Uint8Array(20).fill(0xcd);

  it('throws on non-data-carrier script', () => {
    const p2pkh = buildP2PKHScript(hash);
    expect(() => extractDataCarrierPayload(p2pkh)).toThrow(/data push/);
  });
});
