import { describe, it, expect } from 'vitest';
import { buildSignBundle, parseSignBundle, SIGN_BUNDLE_PROTOCOL } from '../../src/tx/sign-bundle';
import { buildUnsignedTx } from '../../src/tx/rawtx';
import { toHex } from '../../src/core/hash';
import { DUMMY_OUTPUT_SCRIPT_HEX } from './test-utxo';

describe('sign bundle', () => {
  const hexTx = toHex(buildUnsignedTx(
    [{ txidHex: '0'.repeat(63) + '1', vout: 0 }],
    [{ satoshis: 0n, scriptHex: DUMMY_OUTPUT_SCRIPT_HEX }],
  ));
  const bundle = {
    hexTx,
    signerInputs: [{
      inputIndex: 0,
      outpoint: 'a'.repeat(64) + ':0',
      satoshis: 5000n,
      lockingScriptHex: '76a914' + 'ab'.repeat(20) + '88ac',
    }],
    description: 'Test chunk',
  };

  it('marks the transaction explicitly unsigned', () => {
    const json = JSON.parse(buildSignBundle(bundle));
    expect(json.protocol).toBe(SIGN_BUNDLE_PROTOCOL);
    expect(json.version).toBe(1);
    expect(json.unsigned).toBe(true);
    expect(json.hex).toBe(bundle.hexTx);
    expect(json.inputs[0].satoshis).toBe(5000);
  });

  it('round-trips through parseSignBundle', () => {
    const text = buildSignBundle(bundle);
    const parsed = parseSignBundle(text);
    expect(parsed.unsigned).toBe(true);
    expect(parsed.inputs[0].lockingScriptHex).toBe(bundle.signerInputs[0]!.lockingScriptHex);
  });

  it('is not plain network hex', () => {
    const text = buildSignBundle(bundle);
    expect(text.startsWith('{')).toBe(true);
  });
});
