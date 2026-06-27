import { describe, it, expect } from 'vitest';
import {
  buildElectrumIncompleteJson,
  buildElectrumInputMeta,
  ELECTRUM_NO_SIGNATURE,
  SCRIPT_TYPE_P2PKH,
} from '../../src/tx/electrum';
import { buildUnsignedTx } from '../../src/tx/rawtx';
import { toHex } from '../../src/core/hash';
import type { Utxo } from '../../src/tx/types';

const DUMMY_TXID = '0000000000000000000000000000000000000000000000000000000000000001';

function makeUtxo(overrides: Partial<Utxo> = {}): Utxo {
  return {
    txid: DUMMY_TXID,
    vout: 0,
    satoshis: 5000n,
    lockingScriptHex: '76a914' + 'ab'.repeat(20) + '88ac',
    pubKeyHashHex: 'ab'.repeat(20),
    ...overrides,
  };
}

describe('buildElectrumIncompleteJson', () => {
  const hexTx = toHex(buildUnsignedTx(
    [{ txidHex: DUMMY_TXID, vout: 0 }],
    [{ satoshis: 1n, scriptHex: '006a' }],
  ));

  it('marks the transaction incomplete with placeholder signatures', () => {
    const json = JSON.parse(buildElectrumIncompleteJson(hexTx, [{
      value: 5000n,
      scriptType: SCRIPT_TYPE_P2PKH,
    }]));

    expect(json.version).toBe(1);
    expect(json.complete).toBe(false);
    expect(json.hex).toBe(hexTx);
    expect(json.inputs[0].signatures).toEqual([ELECTRUM_NO_SIGNATURE]);
    expect(json.inputs[0].script_type).toBe(SCRIPT_TYPE_P2PKH);
    expect(json.inputs[0].value).toBe(5000);
  });

  it('includes bip32 xpub metadata when provided on the UTXO', () => {
    const utxo = makeUtxo({
      electrumXpub: 'xpub6Example',
      electrumDerivationPath: [0, 3],
    });
    const meta = buildElectrumInputMeta(utxo, utxo.satoshis);
    const json = JSON.parse(buildElectrumIncompleteJson(hexTx, [meta]));

    expect(json.inputs[0].x_pubkeys).toEqual([{
      bip32_xpub: 'xpub6Example',
      derivation_path: [0, 3],
    }]);
  });

  it('is not plain network hex (ElectrumSV would treat that as signed)', () => {
    const json = buildElectrumIncompleteJson(hexTx, [{ value: 5000n }]);
    expect(json.startsWith('{')).toBe(true);
    expect(json).not.toMatch(/^01000000/);
  });
});
