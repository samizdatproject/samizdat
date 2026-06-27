import type { Manifest } from '../core/types';

// An unspent transaction output the author wants to spend for publication.
export interface Utxo {
  txid: string;              // hex, displayed order (will be reversed in raw tx)
  vout: number;              // output index
  satoshis: bigint;
  lockingScriptHex: string;  // hex of the P2PKH locking script (for sighash)
  pubKeyHashHex: string;     // hex of the 20-byte hash160(pubkey), for change output
  // Optional ElectrumSV signing metadata (enables Sign in Tools → Load Transaction).
  electrumXpub?: string;
  electrumDerivationPath?: number[];
  spendingPubKeyHex?: string;
}

// Per-input data the external signer needs to compute the sighash and sign.
export interface SignerInput {
  inputIndex: number;
  outpoint: string;          // "txid:vout" in display (big-endian txid)
  satoshis: bigint;
  lockingScriptHex: string;
}

// An unsigned transaction plus all signing metadata for the external wallet.
export interface UnsignedTxBundle {
  hexTx: string;                    // standard unsigned wire hex (empty scriptSig)
  signBundleJson: string;           // wallet-agnostic JSON with unsigned: true + signer inputs
  electrumJsonTx: string | null;    // optional ElectrumSV incomplete JSON (wallet-specific)
  signerInputs: SignerInput[];
  feeEstimateSats: bigint;
  description: string;
}

// The decoded payload from an anchor transaction output script.
export interface AnchorPayload {
  version: number;
  manifestHash: string;   // hex
  rootHash: string;       // hex
  chunkTxids: string[];   // hex txids in chunk order
  manifest: Manifest;
}

// The decoded payload from a chunk transaction output script.
export interface ChunkPayload {
  version: number;
  chunkIndex: number;
  data: Uint8Array;
}
