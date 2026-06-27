// HTML and image sanitization for the SAMIZDAT renderer.
// Defense-in-depth: even after sanitization the renderer sets a strict CSP header
// that blocks all script execution and remote resource loading.

// Strips dangerous constructs from an HTML string:
// - <script>, <style>, <iframe>, <object>, <embed>, <form>, <link>, <meta>, <base> tags
// - on* event handler attributes
// - javascript: protocol in any attribute
// - Remote http/https URLs in src, href, action attributes
export function sanitizeHtml(html: string): string {
  let result = html;

  // Block tags: remove the entire element including content
  const blockTags = ['script', 'style', 'iframe', 'object', 'embed', 'form'];
  for (const tag of blockTags) {
    result = result.replace(new RegExp(`<${tag}[\\s\\S]*?<\\/${tag}\\s*>`, 'gi'), '');
    result = result.replace(new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi'), '');
  }

  // Void/standalone tags to remove entirely
  const voidTags = ['link', 'meta', 'base'];
  for (const tag of voidTags) {
    result = result.replace(new RegExp(`<${tag}(\\s[^>]*)?/?>`, 'gi'), '');
  }

  // Strip on* event attributes from any element
  result = result.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '');

  // Strip dangerous URL protocols in href/src/action/data/formaction
  result = result.replace(
    /((?:href|src|action|data|formaction)\s*=\s*["']?)(?:javascript|vbscript|data):[^"'\s>]*/gi,
    '$1',
  );

  // Strip remote http/https URLs in src, href, action attributes
  result = result.replace(
    /((?:src|href|action)\s*=\s*["']?)https?:\/\/[^"'\s>]*/gi,
    '$1',
  );

  return result;
}

// Strips EXIF and other metadata from JPEG and PNG images.
// Returns the original bytes unchanged for unrecognised formats.
export function stripExif(imageData: Uint8Array): Uint8Array {
  if (isJpeg(imageData)) return stripJpegMetadata(imageData);
  if (isPng(imageData)) return stripPngMetadata(imageData);
  return imageData;
}

function isJpeg(data: Uint8Array): boolean {
  return data.length >= 2 && data[0] === 0xff && data[1] === 0xd8;
}

function isPng(data: Uint8Array): boolean {
  return (
    data.length >= 8 &&
    data[0] === 0x89 &&
    data[1] === 0x50 &&
    data[2] === 0x4e &&
    data[3] === 0x47 &&
    data[4] === 0x0d &&
    data[5] === 0x0a &&
    data[6] === 0x1a &&
    data[7] === 0x0a
  );
}

// Strips APP1-APP15 markers (EXIF, ICC, IPTC, Adobe) and COM from a JPEG.
// Keeps APP0 (JFIF), DQT, DHT, SOF, DRI, SOS + compressed data.
function stripJpegMetadata(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [];
  let i = 0;

  // Expect SOI marker
  if (i + 2 > data.length || data[i] !== 0xff || data[i + 1] !== 0xd8) return data;
  parts.push(data.slice(0, 2));
  i = 2;

  while (i + 2 <= data.length) {
    if (data[i] !== 0xff) break; // Corrupt stream
    const marker = data[i + 1]!;

    // EOI
    if (marker === 0xd9) {
      parts.push(data.slice(i, i + 2));
      break;
    }

    // SOS — compressed image data runs to EOI; include the remainder as-is
    if (marker === 0xda) {
      parts.push(data.slice(i));
      break;
    }

    // Markers with no payload (RST0-RST7)
    if (marker >= 0xd0 && marker <= 0xd7) {
      parts.push(data.slice(i, i + 2));
      i += 2;
      continue;
    }

    // All other markers: 2-byte big-endian length following the marker
    if (i + 4 > data.length) break;
    const length = ((data[i + 2]! << 8) | data[i + 3]!) >>> 0;
    const segEnd = i + 2 + length;
    if (segEnd > data.length) break;

    // APP1-APP15 (FF E1-EF) and COM (FF FE): strip
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) {
      i = segEnd;
      continue;
    }

    parts.push(data.slice(i, segEnd));
    i = segEnd;
  }

  return concatArrays(parts);
}

// Strips eXIf, tEXt, iTXt, zTXt chunks from a PNG.
// All other chunks (IHDR, PLTE, IDAT, IEND, etc.) are preserved.
function stripPngMetadata(data: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [data.slice(0, 8)]; // PNG signature
  let i = 8;

  const stripTypes = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt']);

  while (i + 12 <= data.length) {
    const length = ((data[i]! << 24) | (data[i + 1]! << 16) | (data[i + 2]! << 8) | data[i + 3]!) >>> 0;
    const type = String.fromCharCode(data[i + 4]!, data[i + 5]!, data[i + 6]!, data[i + 7]!);
    const chunkEnd = i + 12 + length;

    if (chunkEnd > data.length) break;

    if (!stripTypes.has(type)) {
      parts.push(data.slice(i, chunkEnd));
    }

    i = chunkEnd;
    if (type === 'IEND') break;
  }

  return concatArrays(parts);
}

function concatArrays(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
