// Domain-separation prefixes for second-preimage resistance.
// Leaf nodes and interior nodes use distinct prefixes so a leaf hash can never
// be confused with an interior-node hash, and vice versa. See KICKOFF.md.
const enc = new TextEncoder();
const LEAF_PREFIX = enc.encode('SAMIZDAT_LEAF_1:');
const NODE_PREFIX = enc.encode('SAMIZDAT_NODE_1:');

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  // All Uint8Arrays produced by this library are backed by ArrayBuffer, never
  // SharedArrayBuffer, so this cast is safe. Web Crypto's digest() requires
  // ArrayBuffer-backed views per its TypeScript lib typings in TS 5.x.
  return new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer),
  );
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// Leaf hash: SHA-256(SAMIZDAT_LEAF_1: || data). Used for chunk hashes and Merkle leaves.
export async function hashLeaf(data: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(LEAF_PREFIX, data));
}

// Interior node hash: SHA-256(SAMIZDAT_NODE_1: || left || right). Used for all Merkle interior nodes.
export async function hashNode(left: Uint8Array, right: Uint8Array): Promise<Uint8Array> {
  return sha256(concat(NODE_PREFIX, left, right));
}

// Plain SHA-256 with no prefix — for file-level content hashes (pre-chunking identity).
export async function sha256Raw(data: Uint8Array): Promise<Uint8Array> {
  return sha256(data);
}

export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) {
    throw new Error(`Invalid hex string: odd length (${hex.length})`);
  }
  if (hex.length > 0 && !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Invalid hex string: non-hex characters');
  }
  return new Uint8Array(hex.length / 2).map((_, i) =>
    parseInt(hex.slice(i * 2, i * 2 + 2), 16),
  );
}
