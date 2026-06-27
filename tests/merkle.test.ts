import { describe, it, expect } from 'vitest';
import { computeMerkleRoot, computeMerkleRootFromHex } from '../src/core/merkle';
import { hashNode, toHex } from '../src/core/hash';

// Helpers — pre-computed leaf hashes (32-byte blocks filled with a constant).
const leaf = (fill: number) => new Uint8Array(32).fill(fill);

describe('computeMerkleRoot', () => {
  it('throws on empty input', async () => {
    await expect(computeMerkleRoot([])).rejects.toThrow();
  });

  it('single leaf: root equals the leaf itself', async () => {
    const l = leaf(0x42);
    expect(await computeMerkleRoot([l])).toEqual(l);
  });

  it('two leaves: root = hashNode(leaf0, leaf1)', async () => {
    const l0 = leaf(0x01);
    const l1 = leaf(0x02);
    const root = await computeMerkleRoot([l0, l1]);
    const expected = await hashNode(l0, l1);
    expect(root).toEqual(expected);
  });

  it('three leaves: odd node at level 1 is duplicated', async () => {
    // Level 0: [L0, L1, L2]
    // Level 1: [hashNode(L0,L1), hashNode(L2,L2)]   ← L2 duplicated
    // Level 2: [hashNode(prev0, prev1)]              = root
    const l0 = leaf(0x01);
    const l1 = leaf(0x02);
    const l2 = leaf(0x03);
    const n01 = await hashNode(l0, l1);
    const n22 = await hashNode(l2, l2);
    const root = await computeMerkleRoot([l0, l1, l2]);
    expect(root).toEqual(await hashNode(n01, n22));
  });

  it('four leaves: balanced binary tree', async () => {
    const leaves = [0x01, 0x02, 0x03, 0x04].map(leaf);
    const n01 = await hashNode(leaves[0]!, leaves[1]!);
    const n23 = await hashNode(leaves[2]!, leaves[3]!);
    const root = await computeMerkleRoot(leaves);
    expect(root).toEqual(await hashNode(n01, n23));
  });

  it('five leaves: level-1 has 3 nodes, last duplicated', async () => {
    const leaves = [0x01, 0x02, 0x03, 0x04, 0x05].map(leaf);
    const n01 = await hashNode(leaves[0]!, leaves[1]!);
    const n23 = await hashNode(leaves[2]!, leaves[3]!);
    const n44 = await hashNode(leaves[4]!, leaves[4]!); // duplicate
    const mid01 = await hashNode(n01, n23);
    const mid22 = await hashNode(n44, n44);             // duplicate at level 2
    const root = await computeMerkleRoot(leaves);
    expect(root).toEqual(await hashNode(mid01, mid22));
  });

  it('is deterministic', async () => {
    const leaves = [0x01, 0x02, 0x03].map(leaf);
    const r1 = await computeMerkleRoot(leaves);
    const r2 = await computeMerkleRoot(leaves);
    expect(r1).toEqual(r2);
  });

  it('different leaf order produces different root', async () => {
    const l0 = leaf(0x01);
    const l1 = leaf(0x02);
    const r1 = toHex(await computeMerkleRoot([l0, l1]));
    const r2 = toHex(await computeMerkleRoot([l1, l0]));
    expect(r1).not.toBe(r2);
  });

  it('all-same leaves still produce a consistent root', async () => {
    const leaves = Array(4).fill(null).map(() => leaf(0xff));
    const root = toHex(await computeMerkleRoot(leaves));
    expect(root).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('computeMerkleRootFromHex', () => {
  it('accepts hex strings and returns the same result as computeMerkleRoot', async () => {
    const leaves = [0x01, 0x02, 0x03].map(leaf);
    const expected = toHex(await computeMerkleRoot(leaves));
    const hexLeaves = leaves.map(toHex);
    const actual = toHex(await computeMerkleRootFromHex(hexLeaves));
    expect(actual).toBe(expected);
  });
});
