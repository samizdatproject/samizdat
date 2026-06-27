import { describe, it, expect } from 'vitest';
import { estimateChunkTxBytes, estimateAnchorTxBytes, satoshisRequired } from '../../src/tx/fees';

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
    // TX overhead(10) + 1 input(148) + OP_RETURN output header(9) + change output(34)
    // script ≈ 2 (OP_FALSE/OP_RETURN) + push("SAMIZDAT")(5) + push("CHUNK")(6) + push(version)(2)
    //         + push(index 4B)(5) + push(1024B data)(1025+2) = approx 1047
    const bytes = estimateChunkTxBytes(1024, 0);
    expect(bytes).toBeGreaterThan(1200);
    expect(bytes).toBeLessThan(1300);
  });
});

describe('estimateAnchorTxBytes', () => {
  it('returns a positive number', () => {
    // 2 chunk txids (2 × 64-char hex = 130+ chars JSON), manifest ~200 chars
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
  it('returns ceil(bytes × rate)', () => {
    expect(satoshisRequired(100, 1)).toBe(100n);
    expect(satoshisRequired(100, 2)).toBe(200n);
  });

  it('rounds up fractional bytes', () => {
    expect(satoshisRequired(10, 1.5)).toBe(15n);
    expect(satoshisRequired(3, 1.1)).toBe(4n);
  });

  it('returns a bigint', () => {
    expect(typeof satoshisRequired(100, 1)).toBe('bigint');
  });
});
