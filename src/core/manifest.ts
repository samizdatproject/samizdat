import { chunkData, hashFileContent, CHUNK_SIZE_TARGET, type Chunk } from './chunker';
import { computeMerkleRoot } from './merkle';
import { sha256Raw, toHex, fromHex } from './hash';
import type { Manifest, FileObject, ChunkRef, AuthorMode, PublicationMode } from './types';

export interface FileInput {
  filename: string;
  contentType: string;
  data: Uint8Array;
  originalFilename?: string;
}

export interface ManifestOptions {
  authorMode?: AuthorMode;
  publicationMode?: PublicationMode;
  title?: string;
  subtitle?: string;
  tags?: string[];
  language?: string;
  createdAt?: string;
  chunkSize?: number;
  previousManifest?: string;
  rendererHints?: Record<string, unknown>;
}

export interface ManifestResult {
  manifest: Manifest;
  // All chunks across all files in global order, with data attached for publishing.
  // Strip .data before storing the manifest itself.
  chunks: Chunk[];
}

export async function buildManifest(
  files: FileInput[],
  options: ManifestOptions = {},
): Promise<ManifestResult> {
  if (files.length === 0) throw new Error('Manifest must contain at least one file');

  const chunkSize = options.chunkSize ?? CHUNK_SIZE_TARGET;
  const allChunks: Chunk[] = [];
  const fileObjects: FileObject[] = [];

  for (const file of files) {
    const fileHash = await hashFileContent(file.data);
    const fileChunks = await chunkData(file.data, chunkSize);
    const baseIndex = allChunks.length;

    const chunkRefs: ChunkRef[] = fileChunks.map((c, localIdx) => ({
      index: baseIndex + localIdx,
      size: c.size,
      hash: c.hash,
    }));

    for (const c of fileChunks) {
      allChunks.push({ ...c, index: allChunks.length });
    }

    const fo: FileObject = {
      filename: file.filename,
      contentType: file.contentType,
      size: file.data.length,
      hash: fileHash,
      chunks: chunkRefs,
    };
    if (file.originalFilename !== undefined) fo.originalFilename = file.originalFilename;
    fileObjects.push(fo);
  }

  const leafHashes = allChunks.map(c => fromHex(c.hash));
  const rootHashBytes = await computeMerkleRoot(leafHashes);
  const rootHash = toHex(rootHashBytes);

  const chunkTree: ChunkRef[] = allChunks.map(c => ({
    index: c.index,
    size: c.size,
    hash: c.hash,
  }));

  const manifest: Manifest = {
    version: '1',
    authorMode: options.authorMode ?? 'anonymous',
    publicationMode: options.publicationMode ?? 'onchain',
    fileTree: fileObjects,
    chunkTree,
    rootHash,
  };

  if (options.title !== undefined) manifest.title = options.title;
  if (options.subtitle !== undefined) manifest.subtitle = options.subtitle;
  if (options.tags !== undefined) manifest.tags = options.tags;
  if (options.language !== undefined) manifest.language = options.language;
  if (options.createdAt !== undefined) manifest.createdAt = options.createdAt;
  if (options.previousManifest !== undefined) manifest.previousManifest = options.previousManifest;
  if (options.rendererHints !== undefined) manifest.rendererHints = options.rendererHints;

  return { manifest, chunks: allChunks };
}

// SHA-256 of the canonical JSON serialisation of the manifest.
// Keys are sorted before serialisation so the hash is stable regardless of
// the insertion order of the caller's object. This matches the stableStringify
// function used in encodeAnchorPayload, so hashes round-trip through the chain.
export async function hashManifest(manifest: Manifest): Promise<string> {
  const bytes = new TextEncoder().encode(stableManifestJson(manifest));
  return toHex(await sha256Raw(bytes));
}

function stableManifestJson(manifest: Manifest): string {
  const obj = manifest as unknown as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return JSON.stringify(sorted);
}

// Re-derives the Merkle root from the manifest's chunkTree hashes and
// compares it to manifest.rootHash. Returns false if they disagree.
export async function verifyMerkleRoot(manifest: Manifest): Promise<boolean> {
  try {
    const leafHashes = manifest.chunkTree.map(c => fromHex(c.hash));
    const computed = await computeMerkleRoot(leafHashes);
    return toHex(computed) === manifest.rootHash;
  } catch {
    return false;
  }
}

// Verifies that a fetched chunk's raw data matches the declared hash in the manifest.
// The renderer MUST call this for every chunk before presenting content as verified.
export async function verifyChunkData(data: Uint8Array, declaredHash: string): Promise<boolean> {
  const { hashLeaf } = await import('./hash');
  const actual = toHex(await hashLeaf(data));
  return actual === declaredHash;
}

// --- Manifest validation ---

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestValidationError';
  }
}

const VALID_AUTHOR_MODES = new Set<string>(['anonymous', 'pseudonymous', 'signed']);
const VALID_PUBLICATION_MODES = new Set<string>(['onchain', 'hybrid']);

export function validateManifest(value: unknown): Manifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ManifestValidationError('Manifest must be a non-null object');
  }
  const m = value as Record<string, unknown>;

  requireString(m, 'version');
  if (m['version'] !== '1') {
    throw new ManifestValidationError(`Unsupported manifest version: ${m['version']}`);
  }

  requireString(m, 'authorMode');
  if (!VALID_AUTHOR_MODES.has(m['authorMode'] as string)) {
    throw new ManifestValidationError(`Invalid authorMode: ${m['authorMode']}`);
  }

  requireString(m, 'publicationMode');
  if (!VALID_PUBLICATION_MODES.has(m['publicationMode'] as string)) {
    throw new ManifestValidationError(`Invalid publicationMode: ${m['publicationMode']}`);
  }

  requireString(m, 'rootHash');
  requireHex(m['rootHash'] as string, 64, 'rootHash');

  if (!Array.isArray(m['fileTree'])) {
    throw new ManifestValidationError('fileTree must be an array');
  }
  if ((m['fileTree'] as unknown[]).length === 0) {
    throw new ManifestValidationError('fileTree must not be empty');
  }
  (m['fileTree'] as unknown[]).forEach((f, i) => validateFileObject(f, i));

  if (!Array.isArray(m['chunkTree'])) {
    throw new ManifestValidationError('chunkTree must be an array');
  }
  if ((m['chunkTree'] as unknown[]).length === 0) {
    throw new ManifestValidationError('chunkTree must not be empty');
  }
  (m['chunkTree'] as unknown[]).forEach((c, i) => validateChunkRef(c, i, 'chunkTree'));

  // Optional fields
  const optionalStrings = ['txidAnchor', 'title', 'subtitle', 'language', 'createdAt', 'expiry', 'previousManifest'];
  for (const field of optionalStrings) {
    if (field in m && m[field] !== undefined && typeof m[field] !== 'string') {
      throw new ManifestValidationError(`${field} must be a string if present`);
    }
  }

  if ('tags' in m && m['tags'] !== undefined) {
    if (!Array.isArray(m['tags'])) {
      throw new ManifestValidationError('tags must be an array');
    }
    (m['tags'] as unknown[]).forEach((t, i) => {
      if (typeof t !== 'string') {
        throw new ManifestValidationError(`tags[${i}] must be a string`);
      }
    });
  }

  return m as unknown as Manifest;
}

function requireString(obj: Record<string, unknown>, field: string): void {
  if (!(field in obj) || obj[field] === undefined || obj[field] === null) {
    throw new ManifestValidationError(`Missing required field: ${field}`);
  }
  if (typeof obj[field] !== 'string') {
    throw new ManifestValidationError(`Field ${field} must be a string, got ${typeof obj[field]}`);
  }
}

function requireHex(value: string, expectedLength: number, field: string): void {
  if (!/^[0-9a-f]+$/.test(value)) {
    throw new ManifestValidationError(`${field} must be lowercase hex, got: ${value.slice(0, 16)}...`);
  }
  if (value.length !== expectedLength) {
    throw new ManifestValidationError(
      `${field} must be ${expectedLength} hex chars (${expectedLength / 2} bytes), got ${value.length}`,
    );
  }
}

function validateChunkRef(value: unknown, index: number, ctx: string): void {
  if (typeof value !== 'object' || value === null) {
    throw new ManifestValidationError(`${ctx}[${index}] must be an object`);
  }
  const c = value as Record<string, unknown>;
  if (typeof c['index'] !== 'number') {
    throw new ManifestValidationError(`${ctx}[${index}].index must be a number`);
  }
  if (typeof c['size'] !== 'number' || (c['size'] as number) <= 0) {
    throw new ManifestValidationError(`${ctx}[${index}].size must be a positive number`);
  }
  if (typeof c['hash'] !== 'string') {
    throw new ManifestValidationError(`${ctx}[${index}].hash must be a string`);
  }
  requireHex(c['hash'] as string, 64, `${ctx}[${index}].hash`);
}

function validateFileObject(value: unknown, index: number): void {
  if (typeof value !== 'object' || value === null) {
    throw new ManifestValidationError(`fileTree[${index}] must be an object`);
  }
  const f = value as Record<string, unknown>;
  if (typeof f['filename'] !== 'string' || (f['filename'] as string).length === 0) {
    throw new ManifestValidationError(`fileTree[${index}].filename must be a non-empty string`);
  }
  if (typeof f['contentType'] !== 'string') {
    throw new ManifestValidationError(`fileTree[${index}].contentType must be a string`);
  }
  if (typeof f['size'] !== 'number' || (f['size'] as number) <= 0) {
    throw new ManifestValidationError(`fileTree[${index}].size must be a positive number`);
  }
  if (typeof f['hash'] !== 'string') {
    throw new ManifestValidationError(`fileTree[${index}].hash must be a string`);
  }
  requireHex(f['hash'] as string, 64, `fileTree[${index}].hash`);
  if (!Array.isArray(f['chunks'])) {
    throw new ManifestValidationError(`fileTree[${index}].chunks must be an array`);
  }
  (f['chunks'] as unknown[]).forEach((c, j) =>
    validateChunkRef(c, j, `fileTree[${index}].chunks`),
  );
}
