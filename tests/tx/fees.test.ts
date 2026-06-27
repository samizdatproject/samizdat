import { describe, it, expect } from 'vitest';
import {
  estimateChunkTxBytes,
  estimateAnchorTxBytes,
  satoshisRequired,
  estimatePublicationFees,
  DEFAULT_SATS_PER_KB,
  BYTES_PER_KB,
} from '../../src/tx/fees';

describe('estimateChunkTxBytes', () => {
  it('returns a positive number for small chunks', () => {
    const bytes = estimateChunkTxBytes(1024, 0);
    expect(bytes).toBeGreaterThan(0);
  });

  it('grows with chunk data size', () => {
    const small = estimateChunkTxBytes(100, 0);
    const large = estimateChunkTxBytes(100_000, 0);
    expect(large).toBeGreaterThan(small);
  });

  it('is roughly overhead + data for a 1KB chunk', () => {
    const bytes = estimateChunkTxBytes(1024, 0);
    expect(bytes).toBeGreaterThan(1200);
    expect(bytes).toBeLessThan(1300);
  });
});

describe('estimateAnchorTxBytes', () => {
  it('returns a positive number', () => {
    const bytes = estimateAnchorTxBytes(130, 200);
    expect(bytes).toBeGreaterThan(0);
  });

  it('grows with chunkTxids JSON length', () => {
    const few = estimateAnchorTxBytes(130, 200);
    const many = estimateAnchorTxBytes(1300, 200);
    expect(many).toBeGreaterThan(few);
  });
});

describe('satoshisRequired', () => {
  it('charges 100 sats per KB by default', () => {
    expect(satoshisRequired(BYTES_PER_KB)).toBe(100n);
    expect(satoshisRequired(BYTES_PER_KB / 2)).toBe(50n);
  });

  it('rounds up partial kilobytes', () => {
    expect(satoshisRequired(1025)).toBe(101n);
    expect(satoshisRequired(1)).toBe(1n);
  });

  it('accepts a custom sats-per-KB rate', () => {
    expect(satoshisRequired(BYTES_PER_KB, 200)).toBe(200n);
  });

  it('returns a bigint', () => {
    expect(typeof satoshisRequired(100)).toBe('bigint');
  });
});

describe('estimatePublicationFees', () => {
  it('sums chunk and anchor fees with dust outputs', () => {
    const est = estimatePublicationFees([5000, 5000], 1200, 130);
    expect(est.satsPerKb).toBe(DEFAULT_SATS_PER_KB);
    expect(est.chunkMinerFees).toHaveLength(2);
    expect(est.totalMinerFees).toBe(est.chunkMinerFees[0]! + est.chunkMinerFees[1]! + est.anchorMinerFee);
    expect(est.dustOutputs).toBe(3n);
    expect(est.minimumFirstUtxoSats).toBe(est.chunkMinerFees[0]! + 1n);
    expect(est.minimumTotalSats).toBe(est.totalMinerFees + 3n);
  });

  it('is far below 1 sat/byte for large chunk txs', () => {
    const bytes = estimateChunkTxBytes(8000, 0);
    const perKb = satoshisRequired(bytes);
    expect(perKb).toBeLessThan(BigInt(bytes));
  });
});
