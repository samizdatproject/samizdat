import type { Manifest } from '../core/types';
import { sha256Raw, toHex } from '../core/hash';
import { RendererError } from './errors';

export interface ReconstructedFile {
  filename: string;
  contentType: string;
  data: Uint8Array;
  hash: string;
}

// Assembles verified chunk data into per-file byte arrays.
// Calls verifyChunkData at the file level (SHA-256 of assembled bytes === file.hash).
// Only returns files after ALL file-level hash checks pass.
export async function reconstructFiles(
  manifest: Manifest,
  verifiedChunks: Uint8Array[],
): Promise<ReconstructedFile[]> {
  const results: ReconstructedFile[] = [];

  for (const fileObj of manifest.fileTree) {
    const parts: Uint8Array[] = [];
    let totalSize = 0;

    for (const chunkRef of fileObj.chunks) {
      const chunk = verifiedChunks[chunkRef.index];
      if (!chunk) {
        throw new RendererError(
          'CHUNK_MISSING',
          `Chunk ${chunkRef.index} missing for file "${fileObj.filename}"`,
        );
      }
      parts.push(chunk);
      totalSize += chunk.length;
    }

    const data = new Uint8Array(totalSize);
    let offset = 0;
    for (const part of parts) {
      data.set(part, offset);
      offset += part.length;
    }

    const computedHash = toHex(await sha256Raw(data));
    if (computedHash !== fileObj.hash) {
      throw new RendererError(
        'HASH_MISMATCH',
        `File hash mismatch for "${fileObj.filename}": declared ${fileObj.hash.slice(0, 16)}…`,
      );
    }

    results.push({
      filename: fileObj.filename,
      contentType: fileObj.contentType,
      data,
      hash: fileObj.hash,
    });
  }

  return results;
}
