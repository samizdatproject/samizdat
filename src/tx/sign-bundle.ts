// Wallet-agnostic unsigned transaction export for external signing.
//
// Standard Bitcoin wire hex uses empty scriptSig for unsigned inputs. Many wallets
// (including ElectrumSV) treat plain hex as already signed — that is a wallet quirk,
// not invalid tx bytes. This bundle marks unsigned explicitly and carries the per-input
// data any signer needs (raw hex + per-input signer detail).

import type { UnsignedTxBundle } from './types';

export const SIGN_BUNDLE_PROTOCOL = 'samizdat-sign-bundle' as const;

export interface SamizdatSignBundle {
  protocol: typeof SIGN_BUNDLE_PROTOCOL;
  version: 1;
  unsigned: true;
  hex: string;
  inputs: Array<{
    index: number;
    outpoint: string;
    satoshis: number;
    lockingScriptHex: string;
  }>;
  description: string;
}

export function buildSignBundle(
  bundle: Pick<UnsignedTxBundle, 'hexTx' | 'signerInputs' | 'description'>,
): string {
  const payload: SamizdatSignBundle = {
    protocol: SIGN_BUNDLE_PROTOCOL,
    version: 1,
    unsigned: true,
    hex: bundle.hexTx.replace(/\s/g, '').toLowerCase(),
    inputs: bundle.signerInputs.map(si => ({
      index: si.inputIndex,
      outpoint: si.outpoint,
      satoshis: Number(si.satoshis),
      lockingScriptHex: si.lockingScriptHex.toLowerCase(),
    })),
    description: bundle.description,
  };
  return JSON.stringify(payload);
}

export function parseSignBundle(text: string): SamizdatSignBundle {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    throw new Error('Sign bundle must be valid JSON.');
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Sign bundle must be a JSON object.');
  }
  const obj = data as Record<string, unknown>;
  if (obj.protocol !== SIGN_BUNDLE_PROTOCOL) {
    throw new Error(`Expected protocol "${SIGN_BUNDLE_PROTOCOL}".`);
  }
  if (obj.version !== 1) {
    throw new Error('Unsupported sign bundle version.');
  }
  if (obj.unsigned !== true) {
    throw new Error('Sign bundle must have unsigned: true.');
  }
  if (typeof obj.hex !== 'string' || !/^[0-9a-f]+$/.test(obj.hex)) {
    throw new Error('Sign bundle hex must be a hex string.');
  }
  if (!Array.isArray(obj.inputs) || obj.inputs.length === 0) {
    throw new Error('Sign bundle must include at least one input.');
  }
  const inputs = obj.inputs.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Input ${i} is invalid.`);
    const inp = raw as Record<string, unknown>;
    if (typeof inp.outpoint !== 'string') throw new Error(`Input ${i} missing outpoint.`);
    if (typeof inp.satoshis !== 'number' || inp.satoshis <= 0) {
      throw new Error(`Input ${i} satoshis must be a positive number.`);
    }
    if (typeof inp.lockingScriptHex !== 'string') {
      throw new Error(`Input ${i} missing lockingScriptHex.`);
    }
    return {
      index: typeof inp.index === 'number' ? inp.index : i,
      outpoint: inp.outpoint,
      satoshis: inp.satoshis,
      lockingScriptHex: inp.lockingScriptHex.toLowerCase(),
    };
  });
  return {
    protocol: SIGN_BUNDLE_PROTOCOL,
    version: 1,
    unsigned: true,
    hex: obj.hex.toLowerCase(),
    inputs,
    description: typeof obj.description === 'string' ? obj.description : '',
  };
}
