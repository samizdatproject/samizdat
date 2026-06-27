import { hashNode, fromHex } from './hash';

// Computes the Merkle root over an array of pre-computed leaf hashes.
//
// The callers pass leaf hashes that are already the output of hashLeaf() —
// domain-separated with SAMIZDAT_LEAF_1:. Interior nodes are combined with hashNode()
// (domain-separated with SAMIZDAT_NODE_1:), preventing second-preimage attacks.
//
// Odd-level rule: when a level has an odd number of nodes, the last
// node is duplicated to form a pair. This rule applies at every level, not just the
// leaf level.
export async function computeMerkleRoot(leafHashes: Uint8Array[]): Promise<Uint8Array> {
  if (leafHashes.length === 0) {
    throw new Error('Cannot compute Merkle root of empty leaf set');
  }
  if (leafHashes.length === 1) {
    return leafHashes[0] as Uint8Array;
  }

  let level: Uint8Array[] = [...leafHashes];
  while (level.length > 1) {
    const next: Uint8Array[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i] as Uint8Array;
      const right = i + 1 < level.length ? level[i + 1] as Uint8Array : left;
      next.push(await hashNode(left, right));
    }
    level = next;
  }
  return level[0] as Uint8Array;
}

// Convenience wrapper: accepts hex strings as stored in ChunkRef.hash.
export async function computeMerkleRootFromHex(hexHashes: string[]): Promise<Uint8Array> {
  return computeMerkleRoot(hexHashes.map(fromHex));
}
