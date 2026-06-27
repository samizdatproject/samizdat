import { describe, it, expect } from 'vitest';
import { stripPdfInfo, isPdf } from '../../src/renderer/pdfstrip';

// Minimal valid-enough PDF with a traditional xref table and /Info dictionary.
function buildTestPdf(metadata: Record<string, string>): Uint8Array {
  const enc = new TextEncoder();
  const metaEntries = Object.entries(metadata)
    .map(([k, v]) => `/${k} (${v})`)
    .join(' ');

  // Object 1: Catalog
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  // Object 2: Pages
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n`;
  // Object 3: Info dict
  const obj3 = `3 0 obj\n<< ${metaEntries} >>\nendobj\n`;

  const header = `%PDF-1.4\n`;
  let body = obj1 + obj2 + obj3;

  const offset1 = header.length;
  const offset2 = offset1 + obj1.length;
  const offset3 = offset2 + obj2.length;
  const xrefOffset = header.length + body.length;

  const xref = `xref\n0 4\n0000000000 65535 f \n` +
    `${String(offset1).padStart(10, '0')} 00000 n \n` +
    `${String(offset2).padStart(10, '0')} 00000 n \n` +
    `${String(offset3).padStart(10, '0')} 00000 n \n`;

  const trailer = `trailer\n<< /Size 4 /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return enc.encode(header + body + xref + trailer);
}

function buildPdfNoInfo(): Uint8Array {
  const enc = new TextEncoder();
  const obj1 = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  const obj2 = `2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n`;
  const header = `%PDF-1.4\n`;
  const xrefOffset = header.length + obj1.length + obj2.length;
  const xref = `xref\n0 3\n0000000000 65535 f \n` +
    `${String(header.length).padStart(10, '0')} 00000 n \n` +
    `${String(header.length + obj1.length).padStart(10, '0')} 00000 n \n`;
  const trailer = `trailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return enc.encode(header + obj1 + obj2 + xref + trailer);
}

// Decode a range of bytes back to ASCII string
function extractRegion(data: Uint8Array, from: number, to: number): string {
  return Array.from(data.slice(from, to)).map(b => String.fromCharCode(b)).join('');
}

describe('isPdf', () => {
  it('returns true for valid PDF magic', () => {
    const pdf = buildTestPdf({ Title: 'Test' });
    expect(isPdf(pdf)).toBe(true);
  });

  it('returns false for non-PDF', () => {
    expect(isPdf(new TextEncoder().encode('hello world'))).toBe(false);
  });

  it('returns false for empty data', () => {
    expect(isPdf(new Uint8Array(0))).toBe(false);
  });
});

describe('stripPdfInfo', () => {
  it('strips author from /Info dictionary', () => {
    const original = buildTestPdf({ Author: 'John Doe' });
    const { data, stripped } = stripPdfInfo(original);
    const text = extractRegion(data, 0, data.length);
    expect(text).not.toContain('John Doe');
    expect(stripped).toBe(true);
  });

  it('strips title from /Info dictionary', () => {
    const original = buildTestPdf({ Title: 'My Secret Report', Author: 'Jane' });
    const { data, stripped } = stripPdfInfo(original);
    const text = extractRegion(data, 0, data.length);
    expect(text).not.toContain('My Secret Report');
    expect(text).not.toContain('Jane');
    expect(stripped).toBe(true);
  });

  it('preserves the exact byte length of the file', () => {
    const original = buildTestPdf({ Author: 'Alice', Creator: 'Word' });
    const { data } = stripPdfInfo(original);
    expect(data.length).toBe(original.length);
  });

  it('preserves %PDF- magic bytes', () => {
    const original = buildTestPdf({ Author: 'Alice' });
    const { data } = stripPdfInfo(original);
    expect(isPdf(data)).toBe(true);
  });

  it('returns stripped=true when no /Info dict is present', () => {
    const pdf = buildPdfNoInfo();
    const { stripped, warnings } = stripPdfInfo(pdf);
    expect(stripped).toBe(true);
    expect(warnings).toHaveLength(0);
  });

  it('returns stripped=false with a warning for non-PDF data', () => {
    const { stripped, warnings } = stripPdfInfo(new TextEncoder().encode('not a pdf'));
    expect(stripped).toBe(false);
    expect(warnings[0]).toContain('Not a PDF');
  });

  it('returns stripped=false with a warning for PDF without traditional xref table', () => {
    // Build a minimal file that looks like PDF but has no "trailer" keyword
    const enc = new TextEncoder();
    const fakePdf = enc.encode('%PDF-1.5\n%some content\nstartxref\n10\n%%EOF\n');
    const { stripped, warnings } = stripPdfInfo(fakePdf);
    expect(stripped).toBe(false);
    expect(warnings.some(w => w.includes('cross-reference streams') || w.includes('ExifTool'))).toBe(true);
  });

  it('does not corrupt the xref table (offsets preserved)', () => {
    const original = buildTestPdf({ Author: 'Eve', Title: 'Confidential' });
    const { data } = stripPdfInfo(original);
    // The startxref value should still be parseable at the same position
    const originalText = Array.from(original).map(b => String.fromCharCode(b)).join('');
    const strippedText = Array.from(data).map(b => String.fromCharCode(b)).join('');
    const origXref = originalText.match(/startxref\n(\d+)/)?.[1];
    const newXref = strippedText.match(/startxref\n(\d+)/)?.[1];
    expect(origXref).toBeTruthy();
    expect(newXref).toBe(origXref); // same xref offset
  });

  it('handles metadata with special PDF characters', () => {
    // Parentheses in metadata must be properly tracked
    const original = buildTestPdf({ Title: 'Report (Draft)', Author: 'Team \\AI' });
    const { data, stripped } = stripPdfInfo(original);
    expect(stripped).toBe(true);
    const text = extractRegion(data, 0, data.length);
    expect(text).not.toContain('Draft');
  });

  it('warns and returns stripped=false when endobj is missing after Info object', () => {
    const enc = new TextEncoder();
    // Craft a PDF where the Info object exists but has no closing endobj
    const raw =
      '%PDF-1.4\n' +
      '3 0 obj\n<< /Author (Alice) >>\n' +   // intentionally no endobj
      'xref\n0 2\n0000000000 65535 f \n0000000009 00000 n \n' +
      'trailer\n<< /Size 2 /Root 1 0 R /Info 3 0 R >>\nstartxref\n10\n%%EOF\n';
    const { stripped, warnings } = stripPdfInfo(enc.encode(raw));
    expect(stripped).toBe(false);
    expect(warnings.some(w => w.includes('end of Info object'))).toBe(true);
  });

  it('zeroes literal string content in bare Info object (e.g. non-dict Info)', () => {
    // PDF where the /Info object is a bare literal string rather than a dict.
    // This exercises the '(' parser branch in zeroStringsInRange.
    const enc = new TextEncoder();
    const obj3Content = '(Secret metadata)';
    const obj1 = '1 0 obj\n<< /Type /Catalog >>\nendobj\n';
    const obj2 = '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';
    const obj3 = `3 0 obj\n${obj3Content}\nendobj\n`;
    const header = '%PDF-1.4\n';
    const body = obj1 + obj2 + obj3;
    const xrefOffset = header.length + body.length;
    const xref =
      'xref\n0 4\n0000000000 65535 f \n' +
      `${String(header.length).padStart(10, '0')} 00000 n \n` +
      `${String(header.length + obj1.length).padStart(10, '0')} 00000 n \n` +
      `${String(header.length + obj1.length + obj2.length).padStart(10, '0')} 00000 n \n`;
    const trailer =
      `trailer\n<< /Size 4 /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    const pdf = enc.encode(header + body + xref + trailer);
    // stripPdfInfo returns a copy — read `data`, not the original `pdf`
    const { data, stripped } = stripPdfInfo(pdf);
    expect(stripped).toBe(true);
    const text = Array.from(data).map(b => String.fromCharCode(b)).join('');
    expect(text).not.toContain('Secret metadata');
  });

  it('handles backslash escapes inside literal string content', () => {
    // Build a literal-string Info object with a backslash escape to hit lines 108-117.
    const enc = new TextEncoder();
    // In the PDF stream, \( is an escaped paren; the backslash + next char are both zeroed.
    const escapedContent = '(Author\\(Alice\\))';
    const obj1 = '1 0 obj\n<< /Type /Catalog >>\nendobj\n';
    const obj2 = '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';
    const obj3 = `3 0 obj\n${escapedContent}\nendobj\n`;
    const header = '%PDF-1.4\n';
    const body = obj1 + obj2 + obj3;
    const xrefOffset = header.length + body.length;
    const xref =
      'xref\n0 4\n0000000000 65535 f \n' +
      `${String(header.length).padStart(10, '0')} 00000 n \n` +
      `${String(header.length + obj1.length).padStart(10, '0')} 00000 n \n` +
      `${String(header.length + obj1.length + obj2.length).padStart(10, '0')} 00000 n \n`;
    const trailer =
      `trailer\n<< /Size 4 /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    const pdf = enc.encode(header + body + xref + trailer);
    const { data, stripped } = stripPdfInfo(pdf);
    expect(stripped).toBe(true);
    const text = Array.from(data).map(b => String.fromCharCode(b)).join('');
    expect(text).not.toContain('Alice');
  });

  it('handles nested parentheses inside literal string content', () => {
    // Build a literal-string Info object with nested parens to hit lines 119-120.
    const enc = new TextEncoder();
    const nestedContent = '(Author (John Doe) Inc)'; // nested parens — valid PDF literal string
    const obj1 = '1 0 obj\n<< /Type /Catalog >>\nendobj\n';
    const obj2 = '2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\n';
    const obj3 = `3 0 obj\n${nestedContent}\nendobj\n`;
    const header = '%PDF-1.4\n';
    const body = obj1 + obj2 + obj3;
    const xrefOffset = header.length + body.length;
    const xref =
      'xref\n0 4\n0000000000 65535 f \n' +
      `${String(header.length).padStart(10, '0')} 00000 n \n` +
      `${String(header.length + obj1.length).padStart(10, '0')} 00000 n \n` +
      `${String(header.length + obj1.length + obj2.length).padStart(10, '0')} 00000 n \n`;
    const trailer =
      `trailer\n<< /Size 4 /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    const pdf = enc.encode(header + body + xref + trailer);
    const { data, stripped } = stripPdfInfo(pdf);
    expect(stripped).toBe(true);
    const text = Array.from(data).map(b => String.fromCharCode(b)).join('');
    expect(text).not.toContain('John Doe');
  });
});
