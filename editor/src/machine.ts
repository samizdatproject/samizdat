// Publish state machine types for the SAMIZDAT editor.
// States are strictly ordered — no skipping allowed.

import type { Manifest } from '@samizdat/core/types';
import type { Utxo } from '@samizdat/tx/types';

export type EditorMode = 'files' | 'markdown';

export type PublishStep =
  | 'IDLE'
  | 'PREPARE'
  | 'REVIEW'
  | 'CONFIRM'
  | 'EXPORT_CHUNKS'
  | 'COLLECT_CHUNK_TXIDS'
  | 'VERIFY_CHUNKS'
  | 'EXPORT_ANCHOR'
  | 'COLLECT_ANCHOR_TXID'
  | 'VERIFY_ANCHOR'
  | 'RECEIPT';

export interface FileEntry {
  name: string;
  contentType: string;
  data: Uint8Array;
  strippedMetadata: string[];
}

export interface ChunkBundle {
  index: number;
  hexTx: string;
  electrumJsonTx: string;
  feeEstimateSats: bigint;
}

export interface EditorState {
  step: PublishStep;
  mode: EditorMode;
  markdownDraft: string;
  files: FileEntry[];
  manifest: Manifest | null;
  rawChunks: Uint8Array[];
  chunkBundles: ChunkBundle[];
  anchorHexTx: string;
  anchorElectrumJsonTx: string;
  anchorFee: bigint;
  chunkTxids: string[];
  anchorTxid: string;
  manifestHash: string;
  error: string | null;
  utxo: Utxo | null;
  anchorUtxo: Utxo | null;
  chunksVerified: boolean;
  chunkVerifyHtml: string;
}

export function initialState(): EditorState {
  return {
    step: 'IDLE',
    mode: 'files',
    markdownDraft: '',
    files: [],
    manifest: null,
    rawChunks: [],
    chunkBundles: [],
    anchorHexTx: '',
    anchorElectrumJsonTx: '',
    anchorFee: 0n,
    chunkTxids: [],
    anchorTxid: '',
    manifestHash: '',
    error: null,
    utxo: null,
    anchorUtxo: null,
    chunksVerified: false,
    chunkVerifyHtml: '',
  };
}

// Ordered list of steps for the progress bar
export const STEPS: PublishStep[] = [
  'PREPARE',
  'REVIEW',
  'CONFIRM',
  'EXPORT_CHUNKS',
  'COLLECT_CHUNK_TXIDS',
  'VERIFY_CHUNKS',
  'EXPORT_ANCHOR',
  'COLLECT_ANCHOR_TXID',
  'VERIFY_ANCHOR',
  'RECEIPT',
];

export const STEP_LABELS: Record<PublishStep, string> = {
  IDLE: 'Start',
  PREPARE: 'Prepare',
  REVIEW: 'Review',
  CONFIRM: 'Confirm',
  EXPORT_CHUNKS: 'Export Chunks',
  COLLECT_CHUNK_TXIDS: 'Collect Chunk TXIDs',
  VERIFY_CHUNKS: 'Verify Chunks',
  EXPORT_ANCHOR: 'Export Anchor',
  COLLECT_ANCHOR_TXID: 'Collect Anchor TXID',
  VERIFY_ANCHOR: 'Verify Anchor',
  RECEIPT: 'Receipt',
};

export function stepIndex(step: PublishStep): number {
  return STEPS.indexOf(step);
}
