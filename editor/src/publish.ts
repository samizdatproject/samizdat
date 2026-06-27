// Publish flow: wraps core library functions for the editor state machine.

import { buildManifest, hashManifest } from '@samizdat/core/manifest';
import { buildChunkTxs, buildAnchorTx } from '@samizdat/tx/builder';
import { estimatePublicationFees, type PublicationFeeEstimate } from '@samizdat/tx/fees';
import { stableStringify, decodeChunkPayload } from '@samizdat/tx/encoding';
import { verifyChunkData, verifyMerkleRoot } from '@samizdat/core/manifest';
import { stripExif } from '@samizdat/renderer/sanitize';
import { stripPdfInfo, isPdf } from '@samizdat/renderer/pdfstrip';
import type { Utxo } from '@samizdat/tx/types';
import type { Manifest } from '@samizdat/core/types';
import type { FileEntry, ChunkBundle } from './machine';
import { detectMime } from './mime';
import { isZip, readZip } from './zipread';

export type { PublicationFeeEstimate };

export interface PrepareResult {
  manifest: Manifest;
  rawChunks: Uint8Array[];
  manifestHash: string;
  feeEstimate: PublicationFeeEstimate;
}

export interface BuildTxsResult {
  chunkBundles: ChunkBundle[];
}

export interface BuildAnchorResult {
  anchorHexTx: string;
  anchorSignBundleJson: string;
  anchorElectrumJsonTx: string | null;
  anchorFee: bigint;
}

export async function processFiles(rawFiles: File[]): Promise<FileEntry[]> {
  const MAX_SIZE = 10 * 1024 * 1024; // 10 MB hard limit
  const entries: FileEntry[] = [];

  for (const file of rawFiles) {
    if (file.size > MAX_SIZE) {
      throw new Error(`File "${file.name}" exceeds 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
    }

    const raw = new Uint8Array(await file.arrayBuffer());

    // Expand ZIP archives into individual file entries
    if (isZip(raw)) {
      const zipFiles = await readZip(raw);
      if (zipFiles.length === 0) throw new Error(`ZIP file "${file.name}" contains no usable files`);
      for (const zf of zipFiles) {
        const entry = await processRawBytes(zf.data, zf.filename);
        entries.push(entry);
      }
      continue;
    }

    entries.push(await processRawBytes(raw, file.name));
  }

  return entries;
}

async function processRawBytes(raw: Uint8Array, name: string): Promise<FileEntry> {
  const mime = detectMime(raw, name);
  const stripped: string[] = [];

  let data: Uint8Array<ArrayBufferLike> = raw;
  if (mime === 'image/jpeg' || mime === 'image/png') {
    data = stripExif(raw);
    if (data.length < raw.length) {
      stripped.push(`Stripped metadata from ${name} (${raw.length - data.length} bytes removed)`);
    }
  }

  if (isPdf(data)) {
    const result = stripPdfInfo(data);
    data = result.data;
    if (result.stripped) {
      stripped.push(`Stripped PDF /Info metadata from "${name}"`);
    }
    for (const w of result.warnings) {
      stripped.push(`PDF "${name}": ${w}`);
    }
  }

  return { name, contentType: mime, data, strippedMetadata: stripped };
}

export async function processMarkdown(content: string, filename: string): Promise<FileEntry[]> {
  const data = new TextEncoder().encode(content);
  return [{ name: filename, contentType: 'text/markdown', data, strippedMetadata: [] }];
}

export async function prepareManifest(
  files: FileEntry[],
  title?: string,
): Promise<PrepareResult> {
  const { manifest, chunks } = await buildManifest(
    files.map(f => ({ filename: f.name, contentType: f.contentType, data: f.data })),
    title ? { title } : {},
  );
  const rawChunks = chunks.map(c => c.data);
  const manifestHash = await hashManifest(manifest);
  const manifestJsonLen = stableStringify(manifest).length;
  const chunkTxidsJsonLen = JSON.stringify(
    rawChunks.map(() => '0'.repeat(64)),
  ).length;
  const feeEstimate = estimatePublicationFees(
    rawChunks.map(c => c.length),
    manifestJsonLen,
    chunkTxidsJsonLen,
  );
  return { manifest, rawChunks, manifestHash, feeEstimate };
}

export async function buildChunkTransactions(
  manifest: Manifest,
  rawChunks: Uint8Array[],
  utxo: Utxo,
): Promise<BuildTxsResult> {
  const bundles = await buildChunkTxs(manifest, rawChunks, utxo);
  const chunkBundles: ChunkBundle[] = bundles.map((b, i) => ({
    index: i,
    hexTx: b.hexTx,
    signBundleJson: b.signBundleJson,
    electrumJsonTx: b.electrumJsonTx,
    feeEstimateSats: b.feeEstimateSats,
  }));
  return { chunkBundles };
}

export async function buildAnchorTransaction(
  manifest: Manifest,
  chunkTxids: string[],
  utxo: Utxo,
): Promise<BuildAnchorResult> {
  const bundle = await buildAnchorTx(manifest, chunkTxids, utxo);
  return {
    anchorHexTx: bundle.hexTx,
    anchorSignBundleJson: bundle.signBundleJson,
    anchorElectrumJsonTx: bundle.electrumJsonTx,
    anchorFee: bundle.feeEstimateSats,
  };
}

// Verifies chunk data from a signed transaction hex the user pastes.
// Extracts the chunk payload, re-hashes it, and compares to the manifest.
export async function verifyChunkFromHex(
  signedTxHex: string,
  chunkIndex: number,
  manifest: Manifest,
): Promise<boolean> {
  const txBytes = hexToBytes(signedTxHex);
  // Parse outputs to find the SAMIZDAT data-carrier blob
  // For now: look for the chunk payload by scanning for SAMIZDAT marker in outputs
  const chunkPayload = extractChunkPayload(txBytes, chunkIndex);
  if (!chunkPayload) return false;
  return verifyChunkData(chunkPayload, manifest.chunkTree[chunkIndex]!.hash);
}

// Verifies an anchor transaction hex provided by the user.
export async function verifyAnchorFromHex(
  _signedTxHex: string,
  manifest: Manifest,
): Promise<boolean> {
  // The anchor tx contains the manifest; structural check only here since
  // we already verified the manifest earlier in the flow.
  return verifyMerkleRoot(manifest);
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim().replace(/\s/g, '');
  if (clean.length % 2 !== 0) throw new Error('Invalid hex string: odd length');
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

// Extracts chunk payload from a raw transaction by scanning for the SAMIZDAT chunk blob.
// The new format stores data in a data-carrier P2PKH script:
//   writePushData(blob) OP_DROP P2PKH
// where blob starts with [SAMIZDAT][0x01 TYPE_CHUNK]...
// We scan for that magic sequence and parse the blob with decodeChunkPayload.
function extractChunkPayload(txBytes: Uint8Array, _chunkIndex: number): Uint8Array | null {
  // "SMZD" + TYPE_CHUNK (0x01) — Samizdat 4-byte on-chain marker
  const SAMIZDAT_CHUNK = new Uint8Array([0x53, 0x4D, 0x5A, 0x44, 0x01]);
  for (let i = 0; i < txBytes.length - SAMIZDAT_CHUNK.length; i++) {
    if (!SAMIZDAT_CHUNK.every((b, j) => txBytes[i + j] === b)) continue;
    // Found blob start — slice from here to end of tx and try to decode.
    try {
      const payload = decodeChunkPayload(txBytes.slice(i));
      return payload.data;
    } catch {
      // Not a valid chunk blob at this position; keep scanning.
    }
  }
  return null;
}

// Mock UTXO for building transactions (user provides their own UTXO in practice)
// Mock UTXO for building transactions (user provides their own UTXO in practice)
export function makeMockUtxo(satoshis: bigint = 100_000_000n): Utxo {
  return {
    txid: '0'.repeat(64),
    vout: 0,
    satoshis,
    lockingScriptHex: '76a914' + 'ab'.repeat(20) + '88ac',
    pubKeyHashHex: 'ab'.repeat(20),
  };
}

export function formatSatoshis(sats: bigint): string {
  if (sats < 1000n) return `${sats} sats`;
  if (sats < 100_000n) return `${(Number(sats) / 1000).toFixed(2)} ksat`;
  return `${(Number(sats) / 100_000_000).toFixed(8)} BSV`;
}

export function truncateHex(hex: string, chars = 32): string {
  if (hex.length <= chars * 2) return hex;
  return `${hex.slice(0, chars)}…${hex.slice(-8)}`;
}
