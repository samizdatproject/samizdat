import { describe, it, expect } from 'vitest';
import {
  buildElectrumIncompleteJson,
  buildElectrumInputMeta,
  hasElectrumSigningMetadata,
  ELECTRUM_NO_SIGNATURE,
  SCRIPT_TYPE_P2PKH,
} from '../../src/tx/electrum';
import { buildUnsignedTx } from '../../src/tx/rawtx';
import { toHex } from '../../src/core/hash';
import { makeTestUtxo } from './test-utxo';
import type { Utxo } from '../../src/tx/types';

const DUMMY_TXID = '0000000000000000000000000000000000000000000000000000000000000001';

function makeUtxo(overrides: Partial<Utxo> = {}): Utxo {
  return makeTestUtxo(overrides);
}

describe('buildElectrumIncompleteJson', () => {
  const hexTx = toHex(buildUnsignedTx(
    [{ txidHex: DUMMY_TXID, vout: 0 }],
    [{ satoshis: 1n, scriptHex: '006a' }],
  ));

  it('marks the transaction incomplete with placeholder signatures and x_pubkeys', () => {
    const utxo = makeUtxo();
    const meta = buildElectrumInputMeta(utxo, utxo.satoshis);
    const json = JSON.parse(buildElectrumIncompleteJson(hexTx, [meta]));

    expect(json.version).toBe(1);
    expect(json.complete).toBe(false);
    expect(json.inputs[0].signatures).toEqual([ELECTRUM_NO_SIGNATURE]);
    expect(json.inputs[0].script_type).toBe(SCRIPT_TYPE_P2PKH);
    expect(json.inputs[0].x_pubkeys).toHaveLength(1);
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

  it('hasElectrumSigningMetadata is false without wallet fields', () => {
    const utxo = makeTestUtxo();
    delete (utxo as { electrumXpub?: string }).electrumXpub;
    expect(hasElectrumSigningMetadata(utxo)).toBe(false);
  });

  it('is not plain network hex (ElectrumSV would treat that as signed)', () => {
    const utxo = makeUtxo();
    const meta = buildElectrumInputMeta(utxo, utxo.satoshis);
    const json = buildElectrumIncompleteJson(hexTx, [meta]);
    expect(json.startsWith('{')).toBe(true);
  });
});
