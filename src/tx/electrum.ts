// ElectrumSV incomplete-transaction JSON export.
//
// ElectrumSV treats plain network-serialised hex (empty scriptSig) as a complete/signed
// transaction. Unsigned txs must use version-1 JSON with complete:false and placeholder
// signatures — see electrumsv/transaction.py Transaction.from_dict().

import type { SignerInput, Utxo } from './types';

export const ELECTRUM_NO_SIGNATURE = 'ff';
export const SCRIPT_TYPE_P2PKH = 2;

export interface ElectrumInputMeta {
  value: bigint;
  scriptType?: number;
  xpub?: string;
  derivationPath?: number[];
  pubkeyHex?: string;
}

export interface ElectrumIncompleteTx {
  version: 1;
  hex: string;
  complete: false;
  inputs: Array<{
    script_type: number;
    threshold: number;
    value: number;
    signatures: string[];
    x_pubkeys: Array<Record<string, unknown>>;
  }>;
}

function buildXPubkeys(meta: ElectrumInputMeta): Array<Record<string, unknown>> {
  if (meta.pubkeyHex) {
    return [{ pubkey_bytes: meta.pubkeyHex.replace(/\s/g, '').toLowerCase() }];
  }
  if (meta.xpub && meta.derivationPath?.length) {
    return [{ bip32_xpub: meta.xpub, derivation_path: meta.derivationPath }];
  }
  return [];
}

export function buildElectrumInputMeta(
  utxo: Utxo,
  satoshis: bigint,
): ElectrumInputMeta {
  const meta: ElectrumInputMeta = {
    value: satoshis,
    scriptType: SCRIPT_TYPE_P2PKH,
  };
  if (utxo.electrumXpub && utxo.electrumDerivationPath?.length) {
    meta.xpub = utxo.electrumXpub.trim();
    meta.derivationPath = [...utxo.electrumDerivationPath];
  } else if (utxo.spendingPubKeyHex) {
    meta.pubkeyHex = utxo.spendingPubKeyHex.replace(/\s/g, '').toLowerCase();
  }
  return meta;
}

export function buildElectrumIncompleteJson(
  hexTx: string,
  inputMetas: ElectrumInputMeta[],
): string {
  const inputs = inputMetas.map(meta => {
    const x_pubkeys = buildXPubkeys(meta);
    const sigCount = Math.max(1, x_pubkeys.length);
    return {
      script_type: meta.scriptType ?? SCRIPT_TYPE_P2PKH,
      threshold: 1,
      value: Number(meta.value),
      signatures: Array.from({ length: sigCount }, () => ELECTRUM_NO_SIGNATURE),
      x_pubkeys,
    };
  });

  const payload: ElectrumIncompleteTx = {
    version: 1,
    hex: hexTx.replace(/\s/g, '').toLowerCase(),
    complete: false,
    inputs,
  };

  return JSON.stringify(payload);
}

export function buildElectrumIncompleteFromBundle(
  hexTx: string,
  signerInputs: SignerInput[],
  utxo: Utxo,
): string {
  const metas = signerInputs.map(si =>
    buildElectrumInputMeta(utxo, si.satoshis),
  );
  return buildElectrumIncompleteJson(hexTx, metas);
}
