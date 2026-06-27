// Builds a PublicationRecord (receipt) after successful anchor broadcast.

import type { Manifest } from '../core/types';
import type { PublicationRecord } from '../core/types';
import { hashManifest } from '../core/manifest';

export async function buildReceipt(
  manifest: Manifest,
  chunkTxids: string[],
  anchorTxid: string,
  retrievalEndpoints: string[],
  blockHeight?: number,
): Promise<PublicationRecord> {
  const manifestHash = await hashManifest(manifest);
  return {
    manifestHash,
    txids: [anchorTxid, ...chunkTxids],
    rootHash: manifest.rootHash,
    retrievalEndpoints,
    verificationMetadata: {
      chunkCount: manifest.chunkTree.length,
      chunkTxids,
      anchorTxid,
    },
    ...(blockHeight !== undefined ? { blockHeight } : {}),
  };
}
