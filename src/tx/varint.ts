// Raw Bitcoin/BSV binary serialisation primitives.
// See docs/bsv-integration.md for format details.

export function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

export function writeVarint(n: number): Uint8Array {
  if (n < 0) throw new RangeError(`varint must be non-negative, got ${n}`);
  if (n <= 0xfc) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, n >> 8]);
  if (n <= 0xffffffff) {
    return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
  }
  throw new RangeError(`varint too large: ${n}`);
}

export function writeUint32LE(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
}

export function writeInt64LE(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = n < 0n ? n + 0x10000000000000000n : n;
  for (let i = 0; i < 8; i++) { buf[i] = Number(v & 0xffn); v >>= 8n; }
  return buf;
}

// Reads a single varint from buf at offset. Returns [value, bytesRead].
export function readVarint(buf: Uint8Array, offset: number): [number, number] {
  const first = buf[offset];
  if (first === undefined) throw new Error('Buffer too short for varint');
  if (first <= 0xfc) return [first, 1];
  if (first === 0xfd) {
    return [(buf[offset + 1]! | (buf[offset + 2]! << 8)), 3];
  }
  if (first === 0xfe) {
    return [
      (buf[offset + 1]! | (buf[offset + 2]! << 8) | (buf[offset + 3]! << 16) | (buf[offset + 4]! << 24)) >>> 0,
      5,
    ];
  }
  throw new Error('64-bit varint not supported');
}
