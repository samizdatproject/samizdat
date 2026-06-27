import { describe, it, expect } from 'vitest';
import { sanitizeHtml, stripExif } from '../../src/renderer/sanitize';

describe('sanitizeHtml', () => {
  it('removes <script> tags and their content', () => {
    const input = '<p>Hello</p><script>alert("xss")</script>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('<script');
    expect(output).not.toContain('alert');
    expect(output).toContain('<p>Hello</p>');
  });

  it('removes <style> blocks', () => {
    const input = '<style>body{background:url(http://evil.com)}</style><p>text</p>';
    expect(sanitizeHtml(input)).not.toContain('<style');
    expect(sanitizeHtml(input)).toContain('<p>text</p>');
  });

  it('removes <iframe> elements', () => {
    const input = '<iframe src="http://evil.com"></iframe><span>safe</span>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('<iframe');
    expect(output).toContain('<span>safe</span>');
  });

  it('removes <object> and <embed> elements', () => {
    expect(sanitizeHtml('<object data="foo.swf"></object>')).not.toContain('<object');
    expect(sanitizeHtml('<embed src="bad.swf">')).not.toContain('<embed');
  });

  it('removes <form> elements', () => {
    const input = '<form action="http://evil.com"><input></form>';
    expect(sanitizeHtml(input)).not.toContain('<form');
  });

  it('removes <link> tags', () => {
    const input = '<link rel="stylesheet" href="http://remote.css"><p>ok</p>';
    expect(sanitizeHtml(input)).not.toContain('<link');
    expect(sanitizeHtml(input)).toContain('<p>ok</p>');
  });

  it('removes <meta> and <base> tags', () => {
    expect(sanitizeHtml('<meta http-equiv="refresh" content="0;url=http://evil.com">')).not.toContain('<meta');
    expect(sanitizeHtml('<base href="http://evil.com">')).not.toContain('<base');
  });

  it('removes on* event handler attributes', () => {
    const input = '<img src="cat.png" onload="steal()" onerror="bad()">';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onload');
    expect(output).not.toContain('onerror');
    expect(output).toContain('<img');
  });

  it('removes onclick from any element', () => {
    const input = '<button onclick="xss()">Click me</button>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('onclick');
    expect(output).toContain('Click me');
  });

  it('strips javascript: protocol from href', () => {
    const input = '<a href="javascript:alert(1)">link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('javascript:');
  });

  it('strips vbscript: protocol from href', () => {
    const input = '<a href="vbscript:MsgBox(1)">link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('vbscript:');
  });

  it('strips data: protocol from href (prevents data: URI XSS)', () => {
    const input = '<a href="data:text/html,<script>alert(1)</script>">click</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('data:text/html');
  });

  it('strips remote http/https URLs from src attributes', () => {
    const input = '<img src="https://tracker.evil.com/pixel.gif">';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('https://tracker.evil.com');
  });

  it('strips remote https URLs from href attributes', () => {
    const input = '<a href="https://external.com/page">link</a>';
    const output = sanitizeHtml(input);
    expect(output).not.toContain('https://external.com');
  });

  it('preserves relative src and href attributes', () => {
    const input = '<img src="/local/image.png"><a href="/local/page">link</a>';
    const output = sanitizeHtml(input);
    expect(output).toContain('src="/local/image.png"');
    expect(output).toContain('href="/local/page"');
  });

  it('preserves safe HTML structure', () => {
    const input = '<h1>Title</h1><p>Body text with <strong>bold</strong> and <em>italic</em>.</p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it('returns empty string unchanged', () => {
    expect(sanitizeHtml('')).toBe('');
  });
});

describe('stripExif', () => {
  it('returns non-image data unchanged', () => {
    const data = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    expect(stripExif(data)).toBe(data);
  });

  it('returns unknown format unchanged', () => {
    const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    expect(stripExif(data)).toBe(data);
  });

  it('returns a JPEG without APP1 when given a minimal JPEG', () => {
    // Minimal JPEG: SOI + APP0 (JFIF) + DQT stub + SOS stub + EOI
    const jpeg = buildMinimalJpeg();
    const result = stripExif(jpeg);
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8); // SOI preserved
    // No APP1 (0xFF 0xE1) marker in the result
    expect(findMarker(result, 0xe1)).toBe(-1);
  });

  it('strips APP1 EXIF from a JPEG containing an EXIF block', () => {
    const jpeg = buildJpegWithExif();
    const result = stripExif(jpeg);
    expect(findMarker(result, 0xe1)).toBe(-1); // APP1 stripped
    expect(result[0]).toBe(0xff);
    expect(result[1]).toBe(0xd8); // SOI still there
  });

  it('recognises a PNG by magic bytes', () => {
    const png = buildMinimalPng();
    const result = stripExif(png);
    // Should not throw and should return valid PNG signature
    expect(result.slice(0, 8)).toEqual(PNG_SIG);
  });

  it('strips tEXt metadata chunk from a PNG', () => {
    const png = buildPngWithTextChunk();
    const result = stripExif(png);
    expect(containsPngChunkType(result, 'tEXt')).toBe(false);
    expect(containsPngChunkType(result, 'IHDR')).toBe(true);
    expect(containsPngChunkType(result, 'IDAT')).toBe(true);
    expect(containsPngChunkType(result, 'IEND')).toBe(true);
  });
});

// ---- helpers ----

function findMarker(data: Uint8Array, markerByte: number): number {
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i] === 0xff && data[i + 1] === markerByte) return i;
  }
  return -1;
}

function buildMinimalJpeg(): Uint8Array {
  const parts: number[] = [];
  // SOI
  parts.push(0xff, 0xd8);
  // APP0 (JFIF) with minimal payload (length includes itself = 16 bytes)
  const app0Payload = [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  parts.push(0xff, 0xe0, 0x00, app0Payload.length + 2, ...app0Payload);
  // SOS + EOI (stub)
  parts.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00);
  parts.push(0xff, 0xd9);
  return new Uint8Array(parts);
}

function buildJpegWithExif(): Uint8Array {
  const parts: number[] = [];
  // SOI
  parts.push(0xff, 0xd8);
  // APP1 (EXIF) — fake, 10 bytes payload
  const exifPayload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00];
  parts.push(0xff, 0xe1, 0x00, exifPayload.length + 2, ...exifPayload);
  // SOS + EOI (stub)
  parts.push(0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x00);
  parts.push(0xff, 0xd9);
  return new Uint8Array(parts);
}

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makePngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new Uint8Array([
    type.charCodeAt(0), type.charCodeAt(1), type.charCodeAt(2), type.charCodeAt(3),
  ]);
  const len = new Uint8Array(4);
  new DataView(len.buffer).setUint32(0, data.length, false);
  // CRC placeholder (all zeros) — valid enough for our test
  const crc = new Uint8Array(4);
  return concat([len, typeBytes, data, crc]);
}

function buildMinimalPng(): Uint8Array {
  const ihdr = makePngChunk('IHDR', new Uint8Array([0,0,0,1, 0,0,0,1, 8, 2, 0, 0, 0]));
  const idat = makePngChunk('IDAT', new Uint8Array([0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]));
  const iend = makePngChunk('IEND', new Uint8Array(0));
  return concat([PNG_SIG, ihdr, idat, iend]);
}

function buildPngWithTextChunk(): Uint8Array {
  const ihdr = makePngChunk('IHDR', new Uint8Array([0,0,0,1, 0,0,0,1, 8, 2, 0, 0, 0]));
  const text = makePngChunk('tEXt', new TextEncoder().encode('Author\x00SAMIZDAT Test'));
  const idat = makePngChunk('IDAT', new Uint8Array([0x78, 0x9c, 0x62, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01]));
  const iend = makePngChunk('IEND', new Uint8Array(0));
  return concat([PNG_SIG, ihdr, text, idat, iend]);
}

function containsPngChunkType(data: Uint8Array, type: string): boolean {
  let i = 8; // skip PNG signature
  while (i + 12 <= data.length) {
    const len = new DataView(data.buffer, data.byteOffset + i, 4).getUint32(0, false);
    const t = String.fromCharCode(data[i+4]!, data[i+5]!, data[i+6]!, data[i+7]!);
    if (t === type) return true;
    i += 12 + len;
    if (t === 'IEND') break;
  }
  return false;
}

function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const a of arrays) { out.set(a, pos); pos += a.length; }
  return out;
}
