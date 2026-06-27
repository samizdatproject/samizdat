import { hashLeaf, sha256Raw, toHex } from './hash';

// BSV Post-Genesis limits (verified against genesis-spec.md, block 620538, Feb 2020).
// Consensus max tx: 1GB. Default miner script policy: 500KB.
// Target 100KB matches the BCAT protocol convention, well within default policy.
// Do NOT use BTC values (520-byte push, 80-byte OP_RETURN) — those are wrong for BSV.
export const CHUNK_SIZE_MIN    =          1_024; //   1 KB — floor for validation
export const CHUNK_SIZE_TARGET =    100 * 1_024; // 100 KB — default
export const CHUNK_SIZE_MAX    =    500 * 1_024; // 500 KB — default miner script policy

export interface Chunk {
  index: number;      // 0-based, local within a chunkData() call
  size: number;       // true byte length — final chunk is NOT padded
  hash: string;       // hex(hashLeaf(data)) — this is also the Merkle leaf input
  data: Uint8Array;   // the raw chunk bytes (attached for publishing; stripped in manifests)
}

// Splits data into fixed-size chunks. The final chunk stores its true length.
// Chunk hash = hashLeaf(chunkData), so it serves as both the content identifier
// and the Merkle tree leaf — no double-hashing in the tree.
export async function chunkData(
  data: Uint8Array,
  chunkSize: number = CHUNK_SIZE_TARGET,
): Promise<Chunk[]> {
  if (data.length === 0) throw new Error('Cannot chunk empty data');
  if (chunkSize < CHUNK_SIZE_MIN || chunkSize > CHUNK_SIZE_MAX) {
    throw new RangeError(
      `chunkSize must be between ${CHUNK_SIZE_MIN} and ${CHUNK_SIZE_MAX}, got ${chunkSize}`,
    );
  }

  const chunks: Chunk[] = [];
  let offset = 0;
  while (offset < data.length) {
    const end = Math.min(offset + chunkSize, data.length);
    const slice = data.slice(offset, end);
    const hashBytes = await hashLeaf(slice);
    chunks.push({
      index: chunks.length,
      size: slice.length,
      hash: toHex(hashBytes),
      data: slice,
    });
    offset = end;
  }
  return chunks;
}

// SHA-256 of the complete (pre-chunking) file content. Used for file-level verification.
export async function hashFileContent(data: Uint8Array): Promise<string> {
  return toHex(await sha256Raw(data));
}
