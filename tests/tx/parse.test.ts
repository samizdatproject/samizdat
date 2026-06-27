import { describe, it, expect } from 'vitest';
import { buildUnsignedTx } from '../../src/tx/rawtx';
import { toHex } from '../../src/core/hash';
import { parseRawTx, validateRawTxHex } from '../../src/tx/parse';
import { buildManifest } from '../../src/core/manifest';
import { buildChunkTxs } from '../../src/tx/builder';
import { makeTestUtxo, DUMMY_OUTPUT_SCRIPT_HEX } from './test-utxo';

const DUMMY_TXID = '0000000000000000000000000000000000000000000000000000000000000001';

describe('parseRawTx', () => {
  it('consumes the full buffer for a minimal unsigned tx', () => {
    const raw = buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 0 }],
      [{ satoshis: 1n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
    );
    const parsed = parseRawTx(raw);
    expect(parsed.version).toBe(1);
    expect(parsed.inputCount).toBe(1);
    expect(parsed.outputCount).toBe(1);
    expect(parsed.byteLength).toBe(raw.length);
  });

  it('throws when the buffer has trailing bytes', () => {
    const raw = buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 0 }],
      [{ satoshis: 1n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
    );
    const padded = new Uint8Array(raw.length + 4);
    padded.set(raw);
    expect(() => parseRawTx(padded)).toThrow(/Malformed transaction/);
  });

  it('validateRawTxHex round-trips from hex string', () => {
    const hex = toHex(buildUnsignedTx(
      [{ txidHex: DUMMY_TXID, vout: 0 }],
      [{ satoshis: 1n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
    ));
    expect(validateRawTxHex(hex).inputCount).toBe(1);
  });
});

describe('parseRawTx on built chunk transactions', () => {
  const utxo = {
    txid: '2f7597dbcec311735910b5557837b6eb5038df6dbcced344e327aa03c3425265',
    vout: 0,
    satoshis: 5000n,
    lockingScriptHex: '76a914eff0c0b32bb67a935a06130a5649116c2c7878d688ac',
    pubKeyHashHex: 'eff0c0b32bb67a935a06130a5649116c2c7878d6',
  };

  it('parses a large data-carrier chunk tx without length mismatch', async () => {
    const data = new Uint8Array(2686).fill(0x41);
    const { manifest } = await buildManifest([
      { filename: 'a.md', contentType: 'text/plain', data },
    ]);
    const bundles = await buildChunkTxs(manifest, [data], utxo);
    const parsed = validateRawTxHex(bundles[0]!.hexTx);
    expect(parsed.outputCount).toBe(2);
    expect(parsed.byteLength).toBeGreaterThan(2700);
  });
});
