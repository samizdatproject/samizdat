// Stateless manifest resolver.
// Given an anchor txid, fetches and validates the manifest from chain.

import type { Manifest } from '../core/types';
import type { ChainReader } from './chain';
import { validateManifest, hashManifest } from '../core/manifest';
import { decodeAnchorPayload } from '../tx/encoding';
import { RendererError } from './errors';

export interface ResolvedManifest {
  manifest: Manifest;
  manifestHash: string;
  rootHash: string;
  chunkTxids: string[];
}

// Fetches and decodes the anchor payload from `txid`, validates the manifest,
// and verifies the embedded manifestHash matches a fresh hash of the manifest JSON.
export async function resolveManifest(
  txid: string,
  chain: ChainReader,
): Promise<ResolvedManifest> {
  let script: Uint8Array;
  try {
    script = await chain.fetchTxScript(txid);
  } catch (err) {
    if (err instanceof RendererError) throw err;
    throw new RendererError('TX_NOT_FOUND', `Failed to fetch tx ${txid}: ${String(err)}`);
  }

  let payload;
  try {
    payload = decodeAnchorPayload(script);
  } catch (err) {
    throw new RendererError(
      'PAYLOAD_DECODE_FAILED',
      `Failed to decode anchor payload from tx ${txid}: ${String(err)}`,
    );
  }

  let manifest: Manifest;
  try {
    manifest = validateManifest(payload.manifest);
  } catch (err) {
    throw new RendererError(
      'MANIFEST_INVALID',
      `Manifest in tx ${txid} failed validation: ${String(err)}`,
    );
  }

  // Verify the embedded manifestHash matches a fresh hash of the manifest JSON.
  const freshHash = await hashManifest(manifest);
  if (freshHash !== payload.manifestHash) {
    throw new RendererError(
      'HASH_MISMATCH',
      `Manifest hash mismatch in tx ${txid}: declared ${payload.manifestHash}, computed ${freshHash}`,
    );
  }

  // Verify the embedded rootHash matches the manifest field.
  if (payload.rootHash !== manifest.rootHash) {
    throw new RendererError(
      'ROOT_HASH_MISMATCH',
      `Root hash mismatch: payload says ${payload.rootHash}, manifest.rootHash is ${manifest.rootHash}`,
    );
  }

  return {
    manifest,
    manifestHash: payload.manifestHash,
    rootHash: payload.rootHash,
    chunkTxids: payload.chunkTxids,
  };
}
