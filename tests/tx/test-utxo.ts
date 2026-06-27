import type { Utxo } from '../../src/tx/types';

/** Minimal P2PKH locking script hex for generic unsigned-tx test outputs. */
export const DUMMY_OUTPUT_SCRIPT_HEX = '76a914' + 'ab'.repeat(20) + '88ac';

/** Test-only ElectrumSV signing metadata so buildChunkTxs can export signable JSON. */
export const TEST_ELECTRUM_SIGNING: Pick<Utxo, 'electrumXpub' | 'electrumDerivationPath'> = {
  electrumXpub: 'xpub6TestKeyForUnitTestsOnlyNotReal',
  electrumDerivationPath: [0, 1],
};

export function makeTestUtxo(overrides: Partial<Utxo> = {}): Utxo {
  return {
    txid: 'a'.repeat(64),
    vout: 0,
    satoshis: 100_000_000n,
    lockingScriptHex: DUMMY_OUTPUT_SCRIPT_HEX,
    pubKeyHashHex: 'ab'.repeat(20),
    ...TEST_ELECTRUM_SIGNING,
    ...overrides,
  };
}
