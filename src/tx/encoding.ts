// SAMIZDAT on-chain payload encoding/decoding — binary blob format.
//
// Each record is a compact binary blob embedded in a data-carrier P2PKH
// locking script (see script.ts buildDataCarrierScript). The blob format
// uses a fixed header for fast indexer scanning.

import type { Manifest } from '../core/types';
import type { AnchorPayload, ChunkPayload } from './types';
import { fromHex, toHex } from '../core/hash';

const ENC = new TextEncoder();
const DEC = new TextDecoder();

// 4-byte on-chain protocol identifier embedded in every blob header.
const SAMIZDAT_MAGIC = ENC.encode('SMZD'); // 4 bytes — Samizdat protocol marker

// Record type discriminators
const TYPE_CHUNK  = 0x01;
const TYPE_ANCHOR = 0x02;

const VERSION = 0x01;

// --- Helpers ---

function readUint32LE(buf: Uint8Array, off: number): number {
  return ((buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16) | (buf[off + 3]! << 24)) >>> 0);
}

// --- Stable JSON stringify (sorted keys, deterministic) ---

export function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return JSON.stringify(obj);
  }
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .reduce<Record<string, unknown>>((acc, k) => {
      acc[k] = (obj as Record<string, unknown>)[k];
      return acc;
    }, {});
  return JSON.stringify(sorted);
}

// --- Chunk blob ---
//
// Layout:
//   [4]     "SMZD"
//   [1]     TYPE_CHUNK (0x01)
//   [1]     version (0x01)
//   [4 LE]  chunk_index
//   [4 LE]  data_length
//   [n]     data

export function encodeChunkPayload(chunkIndex: number, data: Uint8Array): Uint8Array {
  const blob = new Uint8Array(14 + data.length);
  const view = new DataView(blob.buffer);
  blob.set(SAMIZDAT_MAGIC, 0);
  blob[4] = TYPE_CHUNK;
  blob[5] = VERSION;
  view.setUint32(6, chunkIndex, true);
  view.setUint32(10, data.length, true);
  blob.set(data, 14);
  return blob;
}

export function decodeChunkPayload(blob: Uint8Array): ChunkPayload {
  if (blob.length < 14) throw new Error(`Chunk blob too short (${blob.length} bytes)`);
  const marker = DEC.decode(blob.slice(0, 4));
  if (marker !== 'SMZD') throw new Error(`Expected SAMIZDAT marker, got ${JSON.stringify(marker)}`);
  if (blob[4] !== TYPE_CHUNK) {
    throw new Error(`Expected CHUNK type (0x01), got 0x${blob[4]?.toString(16)}`);
  }
  const version = blob[5]!;
  const chunkIndex = readUint32LE(blob, 6);
  const dataLen    = readUint32LE(blob, 10);
  if (blob.length < 14 + dataLen) throw new Error('Chunk blob truncated');
  return { version, chunkIndex, data: blob.slice(14, 14 + dataLen) };
}

// --- Anchor blob ---
//
// Layout:
//   [4]     "SMZD"
//   [1]     TYPE_ANCHOR (0x02)
//   [1]     version (0x01)
//   [32]    manifest_hash (raw bytes)
//   [32]    root_hash (raw bytes)
//   [4 LE]  chunk_txids_json_length
//   [n]     chunk_txids_json (UTF-8)
//   [4 LE]  manifest_json_length
//   [m]     manifest_json (UTF-8)

export function encodeAnchorPayload(
  manifestHashHex: string,
  rootHashHex: string,
  chunkTxids: string[],
  manifest: Manifest,
): Uint8Array {
  const manifestHashBytes = fromHex(manifestHashHex);
  const rootHashBytes     = fromHex(rootHashHex);
  const txidsJson         = ENC.encode(JSON.stringify(chunkTxids));
  const manifestJson      = ENC.encode(stableStringify(manifest));

  // 4+1+1+32+32 = 70 fixed header + 4+n+4+m variable = 78 + n + m
  const blobLen = 78 + txidsJson.length + manifestJson.length;
  const blob    = new Uint8Array(blobLen);
  const view    = new DataView(blob.buffer);

  let off = 0;
  blob.set(SAMIZDAT_MAGIC, off);       off += 4;
  blob[off++] = TYPE_ANCHOR;
  blob[off++] = VERSION;
  blob.set(manifestHashBytes, off); off += 32;
  blob.set(rootHashBytes, off);     off += 32;
  view.setUint32(off, txidsJson.length, true);   off += 4;
  blob.set(txidsJson, off);                       off += txidsJson.length;
  view.setUint32(off, manifestJson.length, true); off += 4;
  blob.set(manifestJson, off);

  return blob;
}

export function decodeAnchorPayload(blob: Uint8Array): AnchorPayload {
  if (blob.length < 74) throw new Error(`Anchor blob too short (${blob.length} bytes)`);
  const marker = DEC.decode(blob.slice(0, 4));
  if (marker !== 'SMZD') throw new Error(`Expected SAMIZDAT marker, got ${JSON.stringify(marker)}`);
  if (blob[4] !== TYPE_ANCHOR) {
    throw new Error(`Expected ANCHOR type (0x02), got 0x${blob[4]?.toString(16)}`);
  }
  const version      = blob[5]!;
  const manifestHash = toHex(blob.slice(6, 38));
  const rootHash     = toHex(blob.slice(38, 70));

  let off = 70;

  const txidsLen  = readUint32LE(blob, off); off += 4;
  if (blob.length < off + txidsLen) throw new Error('Anchor blob truncated at chunkTxids');
  const chunkTxids: string[] = JSON.parse(DEC.decode(blob.slice(off, off + txidsLen)));
  off += txidsLen;

  const manifestLen = readUint32LE(blob, off); off += 4;
  if (blob.length < off + manifestLen) throw new Error('Anchor blob truncated at manifest');
  const manifest: Manifest = JSON.parse(DEC.decode(blob.slice(off, off + manifestLen)));

  return { version, manifestHash, rootHash, chunkTxids, manifest };
}
