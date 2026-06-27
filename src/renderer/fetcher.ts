// Chunk fetcher and verifier.
// Fetches every chunk in manifest.chunkTree order and verifies each hash
// before returning. Returns data only after ALL chunks are verified.

import type { Manifest } from '../core/types';
import type { ChunkSource } from './chain';
import { verifyChunkData } from '../core/manifest';
import { RendererError } from './errors';

// Returns verified chunk data array in chunkTree order.
// Throws RendererError('CHUNK_HASH_MISMATCH') if any chunk fails verification.
// Throws RendererError('CHUNK_MISSING') if any chunk cannot be fetched.
export async function fetchAndVerifyChunks(
  manifest: Manifest,
  source: ChunkSource,
  chunkTxids?: string[],
): Promise<Uint8Array[]> {
  const verified: Uint8Array[] = [];

  for (const chunkRef of manifest.chunkTree) {
    const txid = chunkTxids?.[chunkRef.index];

    let data: Uint8Array;
    try {
      data = await source.fetchChunk(chunkRef.hash, txid);
    } catch (err) {
      if (err instanceof RendererError) throw err;
      throw new RendererError(
        'CHUNK_MISSING',
        `Failed to fetch chunk ${chunkRef.index} (hash ${chunkRef.hash.slice(0, 16)}…): ${String(err)}`,
      );
    }

    const ok = await verifyChunkData(data, chunkRef.hash);
    if (!ok) {
      throw new RendererError(
        'CHUNK_HASH_MISMATCH',
        `Chunk ${chunkRef.index} hash mismatch: declared ${chunkRef.hash.slice(0, 16)}…`,
      );
    }

    verified.push(data);
  }

  return verified;
}
