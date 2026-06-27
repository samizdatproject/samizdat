export type AuthorMode = 'anonymous' | 'pseudonymous' | 'signed';
export type PublicationMode = 'onchain' | 'hybrid';

export interface ChunkRef {
  index: number;   // 0-based, global across all files in the manifest
  size: number;    // true byte length — final chunk is NOT padded
  hash: string;    // hex(hashLeaf(chunkData)) — also the Merkle leaf input
}

export interface EncryptionMetadata {
  algorithm: string;
  keyDerivation?: string;
  iv?: string;
}

export interface FileObject {
  filename: string;
  contentType: string;
  size: number;                      // total byte length of the original file
  hash: string;                      // hex(SHA-256(raw file data)) — pre-chunking identity
  chunks: ChunkRef[];                // chunk references for this file, in order
  originalFilename?: string;
  sanitizedFilename?: string;
  encryptionMetadata?: EncryptionMetadata;
}

// The root publication object. Every required field must be present; optional fields
// are omitted (not set to null) when absent.
export interface Manifest {
  version: '1';
  authorMode: AuthorMode;
  publicationMode: PublicationMode;
  fileTree: FileObject[];            // one entry per published file
  chunkTree: ChunkRef[];            // all chunks from all files, global order
  rootHash: string;                  // hex Merkle root over all chunkTree leaf hashes
  txidAnchor?: string;               // set after the anchor tx is broadcast
  title?: string;
  subtitle?: string;
  tags?: string[];
  language?: string;
  createdAt?: string;               // ISO 8601
  expiry?: string;                  // ISO 8601
  previousManifest?: string;        // hash of a previous manifest (updates/revisions)
  rendererHints?: Record<string, unknown>;
}

export interface VerificationMetadata {
  chunkCount: number;
  chunkTxids: string[];
  anchorTxid: string;
}

export interface PublicationRecord {
  manifestHash: string;
  txids: string[];
  rootHash: string;
  blockHeight?: number;
  retrievalEndpoints: string[];
  verificationMetadata?: VerificationMetadata;
  authorSignature?: string;
  signatureAlgorithmId?: string;
}
