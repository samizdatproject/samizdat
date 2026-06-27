// High-level SAMIZDAT transaction builders.
// Enforces the fail-safe publish ordering from KICKOFF.md:
//   chunk txs → author signs/broadcasts → verify chunk hashes → anchor tx
//
// These functions produce unsigned transactions only. Authors sign externally.

import type { Manifest } from '../core/types';
import type { Utxo, UnsignedTxBundle } from './types';
import { buildP2PKHScript, buildDataCarrierScript } from './script';
import { buildUnsignedTx } from './rawtx';
import { encodeChunkPayload, encodeAnchorPayload, stableStringify } from './encoding';
import { estimateChunkTxBytes, estimateAnchorTxBytes, satoshisRequired } from './fees';
import { toHex, fromHex } from '../core/hash';
import { hashManifest } from '../core/manifest';
import { validateRawTxHex } from './parse';
import { buildElectrumIncompleteFromBundle } from './electrum';

const DEFAULT_SAT_PER_BYTE = 1;
// Minimum satoshis for a data-carrier output (1 sat dust per BSV convention).
const DUST_SATOSHIS = 1n;

function scriptToHex(script: Uint8Array): string {
  return toHex(script);
}

function bundleFromRawTx(
  rawTx: Uint8Array,
  utxo: Utxo,
  feeEstimate: bigint,
  description: string,
): UnsignedTxBundle {
  const hexTx = toHex(rawTx);
  validateRawTxHex(hexTx);
  const signerInputs: UnsignedTxBundle['signerInputs'] = [{
    inputIndex: 0,
    outpoint: `${utxo.txid}:${utxo.vout}`,
    satoshis: utxo.satoshis,
    lockingScriptHex: utxo.lockingScriptHex,
  }];
  return {
    hexTx,
    electrumJsonTx: buildElectrumIncompleteFromBundle(hexTx, signerInputs, utxo),
    signerInputs,
    feeEstimateSats: feeEstimate,
    description,
  };
}

// Returns one unsigned tx bundle per chunk.
// Each tx spends `utxo`, writes the chunk payload to OP_FALSE OP_RETURN, and sends change back.
export async function buildChunkTxs(
  manifest: Manifest,
  chunkDataArray: Uint8Array[],
  utxo: Utxo,
  satPerByte: number = DEFAULT_SAT_PER_BYTE,
): Promise<UnsignedTxBundle[]> {
  if (chunkDataArray.length !== manifest.chunkTree.length) {
    throw new Error(
      `chunkDataArray.length (${chunkDataArray.length}) must equal manifest.chunkTree.length (${manifest.chunkTree.length})`,
    );
  }

  const bundles: UnsignedTxBundle[] = [];
  // Simplified: one input UTXO per chunk tx, deriving a fresh "remaining" balance.
  // In a real wallet the UTXO set would be managed externally; here we model the first chunk
  // spending the full UTXO and producing change, which the caller would wire together.
  // For test/demo purposes each bundle carries the same input UTXO; the caller must adjust.
  let remaining = utxo.satoshis;

  const pubKeyHash = fromHex(utxo.pubKeyHashHex);

  for (let i = 0; i < chunkDataArray.length; i++) {
    const data = chunkDataArray[i]!;
    const chunkRef = manifest.chunkTree[i]!;
    const blob = encodeChunkPayload(i, data);
    const carrierScript = buildDataCarrierScript(blob, pubKeyHash);
    const feeEstimate = satoshisRequired(estimateChunkTxBytes(data.length, i), satPerByte);
    const changeSats = remaining - DUST_SATOSHIS - feeEstimate;
    if (changeSats < 0n) throw new Error(`Insufficient funds for chunk ${i}: need ${feeEstimate + DUST_SATOSHIS} sats`);

    const changeScript = buildP2PKHScript(pubKeyHash);
    const rawTx = buildUnsignedTx(
      [{ txidHex: utxo.txid, vout: utxo.vout }],
      [
        { satoshis: DUST_SATOSHIS, scriptHex: scriptToHex(carrierScript) },
        { satoshis: changeSats, scriptHex: scriptToHex(changeScript) },
      ],
    );

    bundles.push(bundleFromRawTx(
      rawTx,
      utxo,
      feeEstimate,
      `Chunk ${i} of ${chunkDataArray.length} — ${data.length} bytes, hash ${chunkRef.hash.slice(0, 16)}…`,
    ));

    // Subsequent chunks in the same flow would spend the change output.
    // This is modelled here for fee accounting; the caller wires UTXOs appropriately.
    remaining = changeSats;
  }

  return bundles;
}

// Builds a single unsigned anchor transaction.
// THROWS if chunkTxids.length does not equal manifest.chunkTree.length — enforcing the
// fail-safe: the caller must have collected all chunk txids before calling this.
export async function buildAnchorTx(
  manifest: Manifest,
  chunkTxids: string[],
  utxo: Utxo,
  satPerByte: number = DEFAULT_SAT_PER_BYTE,
): Promise<UnsignedTxBundle> {
  if (chunkTxids.length !== manifest.chunkTree.length) {
    throw new Error(
      `buildAnchorTx requires one txid per chunk. Got ${chunkTxids.length} txids for ${manifest.chunkTree.length} chunks.`,
    );
  }

  const manifestHashHex = await hashManifest(manifest);
  const rootHashHex = manifest.chunkTree.length === 1
    ? manifest.chunkTree[0]!.hash
    : manifest.rootHash;

  const chunkTxidsJson = JSON.stringify(chunkTxids);
  const manifestJson = stableStringify(manifest);

  const pubKeyHash = fromHex(utxo.pubKeyHashHex);
  const anchorBlob = encodeAnchorPayload(manifestHashHex, rootHashHex, chunkTxids, manifest);
  const anchorScript = buildDataCarrierScript(anchorBlob, pubKeyHash);
  const feeEstimate = satoshisRequired(
    estimateAnchorTxBytes(chunkTxidsJson.length, manifestJson.length),
    satPerByte,
  );

  const changeSats = utxo.satoshis - DUST_SATOSHIS - feeEstimate;
  if (changeSats < 0n) {
    throw new Error(`Insufficient funds for anchor tx: need ${feeEstimate + DUST_SATOSHIS} sats, have ${utxo.satoshis}`);
  }

  const changeScript = buildP2PKHScript(pubKeyHash);
  const rawTx = buildUnsignedTx(
    [{ txidHex: utxo.txid, vout: utxo.vout }],
    [
      { satoshis: DUST_SATOSHIS, scriptHex: scriptToHex(anchorScript) },
      { satoshis: changeSats, scriptHex: scriptToHex(changeScript) },
    ],
  );

  return bundleFromRawTx(
    rawTx,
    utxo,
    feeEstimate,
    `Anchor — manifest ${manifestHashHex.slice(0, 16)}… root ${rootHashHex.slice(0, 16)}…`,
  );
}
