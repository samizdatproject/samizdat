// Minimal PKZIP reader for the SAMIZDAT editor.
// Reads file list and data from local user-uploaded ZIP archives.
// Supports STORED (method 0) and DEFLATE (method 8) via DecompressionStream.
// No dependencies, no CDN.

export interface ZipFile {
  filename: string;
  data: Uint8Array;
}

function u16(buf: Uint8Array, off: number): number {
  return buf[off]! | (buf[off + 1]! << 8);
}

function u32(buf: Uint8Array, off: number): number {
  return ((buf[off]! | (buf[off + 1]! << 8) | (buf[off + 2]! << 16) | (buf[off + 3]! << 24)) >>> 0);
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  writer.write(compressed.slice()); // .slice() ensures a plain ArrayBuffer backing
  writer.close();

  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value as Uint8Array);
  }

  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

export async function readZip(data: Uint8Array): Promise<ZipFile[]> {
  // Locate end-of-central-directory (EOCD) — scan backward from end
  const EOCD_SIG = 0x06054b50;
  let eocd = -1;
  for (let i = data.length - 22; i >= 0 && i >= data.length - 65578; i--) {
    if (u32(data, i) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Not a valid ZIP file (no EOCD record found)');

  const cdCount = u16(data, eocd + 10);
  const cdOffset = u32(data, eocd + 16);

  const files: ZipFile[] = [];
  let pos = cdOffset;

  for (let i = 0; i < cdCount; i++) {
    if (u32(data, pos) !== 0x02014b50) throw new Error('Invalid central directory entry at offset ' + pos);

    const method = u16(data, pos + 10);
    const compressedSize = u32(data, pos + 20);
    const uncompressedSize = u32(data, pos + 24);
    const fnLen = u16(data, pos + 28);
    const extraLen = u16(data, pos + 30);
    const commentLen = u16(data, pos + 32);
    const lhOffset = u32(data, pos + 42);

    const filename = new TextDecoder('utf-8').decode(data.slice(pos + 46, pos + 46 + fnLen));
    pos += 46 + fnLen + extraLen + commentLen;

    if (filename.endsWith('/') || filename.endsWith('\\')) continue; // skip dirs
    if (filename.startsWith('__MACOSX/') || filename.startsWith('.')) continue; // skip macOS metadata

    // Read data from local file header
    if (u32(data, lhOffset) !== 0x04034b50) throw new Error('Invalid local file header at offset ' + lhOffset);
    const lhFnLen = u16(data, lhOffset + 26);
    const lhExtraLen = u16(data, lhOffset + 28);
    const dataStart = lhOffset + 30 + lhFnLen + lhExtraLen;
    const compressed = data.slice(dataStart, dataStart + compressedSize);

    let fileData: Uint8Array;
    if (method === 0) {
      fileData = compressed; // STORED
    } else if (method === 8) {
      fileData = await inflateRaw(compressed); // DEFLATE
    } else {
      throw new Error(`Unsupported compression method ${method} for file "${filename}"`);
    }

    if (method === 0 && fileData.length !== uncompressedSize) {
      throw new Error(`Size mismatch for "${filename}": expected ${uncompressedSize}, got ${fileData.length}`);
    }

    files.push({ filename: filename.replace(/^.*\//, ''), data: fileData }); // basename only
  }

  return files;
}

export function isZip(data: Uint8Array): boolean {
  return data.length >= 4 && data[0] === 0x50 && data[1] === 0x4b && data[2] === 0x03 && data[3] === 0x04;
}
