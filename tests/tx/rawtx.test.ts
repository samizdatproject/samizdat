import { describe, it, expect } from 'vitest';
import { buildUnsignedTx } from '../../src/tx/rawtx';
import { buildP2PKHScript } from '../../src/tx/script';
import { toHex, fromHex } from '../../src/core/hash';
import { DUMMY_OUTPUT_SCRIPT_HEX } from './test-utxo';

const DUMMY_TXID = '0000000000000000000000000000000000000000000000000000000000000001';
const HASH160 = new Uint8Array(20).fill(0xab);

describe('buildUnsignedTx', () => {
  it('starts with version 1 in little-endian', () => {
    const rawTx = buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 0 }],
      [{ satoshis: 0n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
    );
    // bytes 0-3: version = 1 LE
    expect(rawTx[0]).toBe(1);
    expect(rawTx[1]).toBe(0);
    expect(rawTx[2]).toBe(0);
    expect(rawTx[3]).toBe(0);
  });

  it('reverses the txid in the raw bytes', () => {
    // Display order: [0xaa, 0xbb, 0xcc, 0xdd, 0x00*28]
    const txid = 'aabbccdd' + '00'.repeat(28);
    const rawTx = buildUnsignedTx(
      [{ txidHex: txid, vout: 0 }],
      [{ satoshis: 0n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
    );
    // Txid starts at byte 5 (after version 4B + inputCount varint 1B).
    // Wire order is reversed: display byte[31]=0x00 is wire byte[0], display byte[0]=0xaa is wire byte[31].
    expect(rawTx[5]).toBe(0x00);   // wire[0] = display byte 31 = 0x00
    expect(rawTx[33]).toBe(0xdd);  // wire[28] = display byte 3 = 0xdd
    expect(rawTx[34]).toBe(0xcc);  // wire[29] = display byte 2 = 0xcc
    expect(rawTx[35]).toBe(0xbb);  // wire[30] = display byte 1 = 0xbb
    expect(rawTx[36]).toBe(0xaa);  // wire[31] = display byte 0 = 0xaa
  });

  it('writes vout in little-endian at the right offset', () => {
    const rawTx = buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 2 }],
      [{ satoshis: 0n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
    );
    // After version(4) + inputCount(1) + txid(32) = offset 37 → vout at 37..40
    expect(rawTx[37]).toBe(2);
    expect(rawTx[38]).toBe(0);
    expect(rawTx[39]).toBe(0);
    expect(rawTx[40]).toBe(0);
  });

  it('has empty unlocking script (varint=0) for each unsigned input', () => {
    const rawTx = buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 0 }],
      [{ satoshis: 0n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
    );
    // script_len at offset 4(version) + 1(inputCount) + 32(txid) + 4(vout) = 41
    expect(rawTx[41]).toBe(0); // varint 0 = no unlocking script
  });

  it('ends with locktime = 0 (4 bytes)', () => {
    const rawTx = buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 0 }],
      [{ satoshis: 0n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
    );
    const last4 = rawTx.slice(rawTx.length - 4);
    expect(last4).toEqual(new Uint8Array([0, 0, 0, 0]));
  });

  it('encodes output satoshis as int64 LE', () => {
    const changeScript = toHex(buildP2PKHScript(HASH160));
    const rawTx = buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 0 }],
      [
        { satoshis: 0n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX },
        { satoshis: 50000n, scriptHex: changeScript },
      ],
    );
    // Find the change output satoshis: 50000 = 0x0000C350
    // Scan for 0x50, 0xC3, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
    const hex = toHex(rawTx);
    expect(hex).toContain('50c3000000000000');
  });

  it('handles multiple inputs and outputs', () => {
    const rawTx = buildUnsignedTx(
      [
        { txidHex: DUMMY_TXID, vout: 0 },
        { txidHex: DUMMY_TXID, vout: 1 },
      ],
      [
        { satoshis: 0n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX },
        { satoshis: 1000n, scriptHex: toHex(buildP2PKHScript(HASH160)) },
      ],
    );
    // inputCount varint at byte 4
    expect(rawTx[4]).toBe(2);
    // Find output count — comes after both inputs
    // Each input = 32(txid) + 4(vout) + 1(scriptLen=0) + 4(seq) = 41 bytes
    // outputCount at byte 4(ver) + 1(inputCount) + 2*41 = 87
    expect(rawTx[87]).toBe(2);
  });
});
