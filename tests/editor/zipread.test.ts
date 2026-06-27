import { describe, it, expect } from 'vitest';
import { readZip, isZip } from '../../editor/src/zipread';

// Build a minimal STORED (no compression) PKZIP archive in memory.
function u16(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
}
function u32(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}
function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const b of data) {
    let val = (crc ^ b) & 0xff;
    for (let i = 0; i < 8; i++) val = (val & 1) ? (0xedb88320 ^ (val >>> 1)) : (val >>> 1);
    crc = val ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function buildTestZip(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const enc = new TextEncoder();
  const localHeaders: Uint8Array[] = [];
  const centralDirs: Uint8Array[] = [];
  let localOffset = 0;

  for (const file of files) {
    const fnBytes = enc.encode(file.name);
    const crc = crc32(file.data);

    // Local file header
    const lh = concat(
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]), // signature
      u16(20),          // version needed
      u16(0),           // flags
      u16(0),           // method: STORED
      u16(0), u16(0),   // mod time, mod date
      u32(crc),         // CRC-32
      u32(file.data.length), // compressed size
      u32(file.data.length), // uncompressed size
      u16(fnBytes.length),
      u16(0),           // extra field length
      fnBytes,
      file.data,
    );
    localHeaders.push(lh);

    // Central directory entry
    const cd = concat(
      new Uint8Array([0x50, 0x4b, 0x01, 0x02]), // signature
      u16(20), u16(20), // version made by, version needed
      u16(0),           // flags
      u16(0),           // method: STORED
      u16(0), u16(0),   // mod time, mod date
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(fnBytes.length),
      u16(0), u16(0),   // extra, comment length
      u16(0),           // disk number start
      u16(0), u32(0),   // int attrs, ext attrs
      u32(localOffset), // local header offset
      fnBytes,
    );
    centralDirs.push(cd);
    localOffset += lh.length;
  }

  const allLocal = concat(...localHeaders);
  const allCd = concat(...centralDirs);
  const cdSize = allCd.length;
  const cdOffset = allLocal.length;

  const eocd = concat(
    new Uint8Array([0x50, 0x4b, 0x05, 0x06]), // signature
    u16(0), u16(0),     // disk number, start disk
    u16(files.length), u16(files.length), // entries on disk, total entries
    u32(cdSize),
    u32(cdOffset),
    u16(0),             // comment length
  );

  return concat(allLocal, allCd, eocd);
}

describe('isZip', () => {
  it('returns true for a valid ZIP magic header', () => {
    const zip = buildTestZip([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]);
    expect(isZip(zip)).toBe(true);
  });

  it('returns false for non-ZIP data', () => {
    expect(isZip(new TextEncoder().encode('hello world'))).toBe(false);
  });

  it('returns false for empty data', () => {
    expect(isZip(new Uint8Array(0))).toBe(false);
  });
});

describe('readZip', () => {
  it('reads a single STORED file', async () => {
    const content = new TextEncoder().encode('hello from zip');
    const zip = buildTestZip([{ name: 'hello.txt', data: content }]);
    const files = await readZip(zip);
    expect(files).toHaveLength(1);
    expect(files[0]!.filename).toBe('hello.txt');
    expect(new TextDecoder().decode(files[0]!.data)).toBe('hello from zip');
  });

  it('reads multiple STORED files', async () => {
    const enc = new TextEncoder();
    const zip = buildTestZip([
      { name: 'a.txt', data: enc.encode('AAA') },
      { name: 'b.txt', data: enc.encode('BBB') },
    ]);
    const files = await readZip(zip);
    expect(files).toHaveLength(2);
    expect(files.map(f => f.filename)).toEqual(['a.txt', 'b.txt']);
  });

  it('preserves file data exactly', async () => {
    const data = new Uint8Array([0, 1, 2, 3, 255, 254]);
    const zip = buildTestZip([{ name: 'bin.bin', data }]);
    const files = await readZip(zip);
    expect(files[0]!.data).toEqual(data);
  });

  it('skips directory entries', async () => {
    const enc = new TextEncoder();
    // Build a zip that has a directory entry (filename ending with /)
    const dirEntry: { name: string; data: Uint8Array } = { name: 'mydir/', data: new Uint8Array(0) };
    const fileEntry: { name: string; data: Uint8Array } = { name: 'mydir/file.txt', data: enc.encode('content') };
    const zip = buildTestZip([dirEntry, fileEntry]);
    const files = await readZip(zip);
    // directory entry is skipped; only the file entry should be returned
    // basename extraction: 'mydir/file.txt' → 'file.txt'
    expect(files.every(f => !f.filename.endsWith('/'))).toBe(true);
  });

  it('throws on invalid data', async () => {
    await expect(readZip(new Uint8Array([1, 2, 3, 4]))).rejects.toThrow();
  });
});
