// Minimal PKZIP writer using STORED compression (no compression).
// Produces valid ZIP archives readable by any standard unzip tool.

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  const localOffsets: number[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    localOffsets.push(localOffset);

    const localHeader = concat([
      sig(0x04034b50),   // PK\x03\x04 — local file header
      u16(20),           // version needed: 2.0
      u16(0),            // general purpose flags
      u16(0),            // compression method: STORED
      u16(0),            // last mod time
      u16(0),            // last mod date
      u32(crc),
      u32(size),         // compressed size (= uncompressed for STORED)
      u32(size),
      u16(nameBytes.length),
      u16(0),            // extra field length
      nameBytes,
      entry.data,
    ]);
    localParts.push(localHeader);
    localOffset += localHeader.length;
  }

  const cdStart = localOffset;
  for (let idx = 0; idx < entries.length; idx++) {
    const entry = entries[idx]!;
    const nameBytes = enc.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    centralParts.push(concat([
      sig(0x02014b50),   // PK\x01\x02 — central directory header
      u16(20),           // version made by: 2.0
      u16(20),           // version needed: 2.0
      u16(0),
      u16(0),            // STORED
      u16(0),
      u16(0),
      u32(crc),
      u32(size),
      u32(size),
      u16(nameBytes.length),
      u16(0),            // extra field length
      u16(0),            // file comment length
      u16(0),            // disk number start
      u16(0),            // internal file attributes
      u32(0),            // external file attributes
      u32(localOffsets[idx]!),
      nameBytes,
    ]));
  }

  const cdSize = centralParts.reduce((s, p) => s + p.length, 0);

  const eocd = concat([
    sig(0x06054b50),     // PK\x05\x06 — end of central directory
    u16(0),              // disk number
    u16(0),              // start disk
    u16(entries.length),
    u16(entries.length),
    u32(cdSize),
    u32(cdStart),
    u16(0),              // comment length
  ]);

  return concat([...localParts, ...centralParts, eocd]);
}

// CRC-32 lookup table (standard polynomial 0xEDB88320)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]!) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function sig(val: number): Uint8Array {
  return u32(val);
}

function u16(val: number): Uint8Array {
  const n = val & 0xffff;
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff]);
}

function u32(val: number): Uint8Array {
  const n = val >>> 0;
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff]);
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) {
    out.set(a, pos);
    pos += a.length;
  }
  return out;
}
