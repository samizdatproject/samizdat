// Local MIME detection from magic bytes — no server round-trip.

const SIGNATURES: Array<{ sig: number[]; offset?: number; mime: string }> = [
  // PDF
  { sig: [0x25, 0x50, 0x44, 0x46], mime: 'application/pdf' },
  // JPEG
  { sig: [0xff, 0xd8, 0xff], mime: 'image/jpeg' },
  // PNG
  { sig: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], mime: 'image/png' },
  // GIF
  { sig: [0x47, 0x49, 0x46, 0x38], mime: 'image/gif' },
  // WebP
  { sig: [0x52, 0x49, 0x46, 0x46], mime: 'image/webp' }, // RIFF…WEBP
  // ZIP
  { sig: [0x50, 0x4b, 0x03, 0x04], mime: 'application/zip' },
  { sig: [0x50, 0x4b, 0x05, 0x06], mime: 'application/zip' },
];

export function detectMime(data: Uint8Array, filename: string): string {
  for (const entry of SIGNATURES) {
    const offset = entry.offset ?? 0;
    if (data.length < offset + entry.sig.length) continue;
    if (entry.sig.every((b, i) => data[offset + i] === b)) {
      // Extra check for WebP
      if (entry.mime === 'image/webp') {
        if (data.length >= 12 && String.fromCharCode(...data.slice(8, 12)) === 'WEBP') {
          return 'image/webp';
        }
        continue;
      }
      return entry.mime;
    }
  }

  // Fall back to extension
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const extMap: Record<string, string> = {
    txt: 'text/plain',
    md: 'text/markdown',
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    json: 'application/json',
    xml: 'application/xml',
    svg: 'image/svg+xml',
    zip: 'application/zip',
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
  };
  return extMap[ext] ?? 'application/octet-stream';
}
