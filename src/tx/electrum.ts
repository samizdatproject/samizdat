// ElectrumSV incomplete-transaction JSON export.
//
// ElectrumSV treats plain network-serialised hex (empty scriptSig) as a complete/signed
// transaction. Unsigned txs must use version-1 JSON with complete:false, placeholder
// signatures, and x_pubkeys so the wallet can sign — see electrumsv/transaction.py.

import type { SignerInput, Utxo } from './types';

export const ELECTRUM_NO_SIGNATURE = 'ff';
export const SCRIPT_TYPE_NONE = 0;
export const SCRIPT_TYPE_P2PKH = 2;

export interface ElectrumInputMeta {
  value: bigint;
  scriptType?: number;
  xpub?: string;
  derivationPath?: number[];
  pubkeyHex?: string;
}

export interface ElectrumOutputMeta {
  scriptType: number;
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
  outputs?: Array<{
    script_type: number;
    x_pubkeys: Array<Record<string, unknown>>;
  }>;
}

function xPubkeyRecord(meta: Pick<ElectrumInputMeta, 'xpub' | 'derivationPath' | 'pubkeyHex'>):
  Record<string, unknown> | null {
  if (meta.pubkeyHex) {
    return { pubkey_bytes: meta.pubkeyHex.replace(/\s/g, '').toLowerCase() };
  }
  if (meta.xpub && meta.derivationPath?.length) {
    return { bip32_xpub: meta.xpub, derivation_path: meta.derivationPath };
  }
  return null;
}

function buildXPubkeys(meta: ElectrumInputMeta): Array<Record<string, unknown>> {
  const rec = xPubkeyRecord(meta);
  return rec ? [rec] : [];
}

export function hasElectrumSigningMetadata(utxo: Utxo): boolean {
  const hasXpub = Boolean(utxo.electrumXpub?.trim() && utxo.electrumDerivationPath?.length);
  const pk = utxo.spendingPubKeyHex?.replace(/\s/g, '').toLowerCase() ?? '';
  return hasXpub || /^(02|03)[0-9a-f]{64}$/.test(pk) || /^04[0-9a-f]{128}$/.test(pk);
}

export function buildElectrumInputMeta(
  utxo: Utxo,
  satoshis: bigint,
): ElectrumInputMeta {
  if (!hasElectrumSigningMetadata(utxo)) {
    throw new Error('ElectrumSV export requires xpub + derivation path or spending public key.');
  }
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

export function buildElectrumChangeOutputMeta(utxo: Utxo): ElectrumOutputMeta {
  if (!hasElectrumSigningMetadata(utxo)) {
    throw new Error('ElectrumSV export requires xpub + derivation path or spending public key.');
  }
  const meta: ElectrumOutputMeta = { scriptType: SCRIPT_TYPE_P2PKH };
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
  outputMetas?: ElectrumOutputMeta[],
): string {
  for (const meta of inputMetas) {
    if (buildXPubkeys(meta).length === 0) {
      throw new Error('ElectrumSV export requires x_pubkeys on every input');
    }
  }

  const inputs = inputMetas.map(meta => {
    const x_pubkeys = buildXPubkeys(meta);
    return {
      script_type: meta.scriptType ?? SCRIPT_TYPE_P2PKH,
      threshold: 1,
      value: Number(meta.value),
      signatures: x_pubkeys.map(() => ELECTRUM_NO_SIGNATURE),
      x_pubkeys,
    };
  });

  const payload: ElectrumIncompleteTx = {
    version: 1,
    hex: hexTx.replace(/\s/g, '').toLowerCase(),
    complete: false,
    inputs,
  };

  if (outputMetas?.length) {
    payload.outputs = outputMetas.map(out => {
      const rec = xPubkeyRecord(out);
      return {
        script_type: out.scriptType,
        x_pubkeys: rec ? [rec] : [],
      };
    });
  }

  return JSON.stringify(payload);
}

export function buildElectrumIncompleteFromBundle(
  hexTx: string,
  signerInputs: SignerInput[],
  utxo: Utxo,
  outputCount = 2,
): string {
  const keyMeta = buildElectrumChangeOutputMeta(utxo);
  const inputMetas = signerInputs.map(si =>
    buildElectrumInputMeta(utxo, si.satoshis),
  );
  const outputMetas: ElectrumOutputMeta[] = [];
  for (let i = 0; i < outputCount; i++) {
    outputMetas.push(i === outputCount - 1
      ? keyMeta
      : { scriptType: SCRIPT_TYPE_NONE });
  }
  return buildElectrumIncompleteJson(hexTx, inputMetas, outputMetas);
}

/** Returns ElectrumSV JSON when optional wallet metadata is present; otherwise null. */
export function tryBuildElectrumIncompleteFromBundle(
  hexTx: string,
  signerInputs: SignerInput[],
  utxo: Utxo,
  outputCount = 2,
): string | null {
  if (!hasElectrumSigningMetadata(utxo)) return null;
  return buildElectrumIncompleteFromBundle(hexTx, signerInputs, utxo, outputCount);
}
