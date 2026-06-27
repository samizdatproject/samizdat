// PDF /Info metadata stripper.
// Removes author, title, creator, producer, and date fields from the Info
// dictionary by zeroing string values in-place (preserves all byte offsets
// so xref tables remain valid). Works for PDFs with traditional xref tables.
// PDFs using compressed xref streams (PDF 1.5+ object streams) fall back
// to a warning — instruct users to strip with ExifTool before uploading.

export interface PdfStripResult {
  data: Uint8Array;
  warnings: string[];
  stripped: boolean;
}

export function stripPdfInfo(pdf: Uint8Array): PdfStripResult {
  if (!isPdf(pdf)) {
    return { data: pdf, warnings: ['Not a PDF file'], stripped: false };
  }

  const data = new Uint8Array(pdf); // work on a copy
  const warnings: string[] = [];

  // Build a char-code view of the file for pattern searching.
  // We use latin-1 (1 byte = 1 char) so string indices == byte offsets.
  const str = latin1(data);

  // Locate the last "trailer" keyword — traditional PDFs have one.
  const trailerIdx = str.lastIndexOf('trailer');
  if (trailerIdx < 0) {
    warnings.push(
      'PDF uses compressed cross-reference streams (PDF 1.5+). ' +
      'Auto-stripping is not supported — strip metadata with ExifTool before uploading.',
    );
    return { data, warnings, stripped: false };
  }

  // Parse /Info N G R from the trailer dictionary.
  const trailerSlice = str.slice(trailerIdx, trailerIdx + 1024);
  const infoMatch = trailerSlice.match(/\/Info\s+(\d+)\s+\d+\s+R/);
  if (!infoMatch) {
    // No /Info dict — PDF has no metadata to strip.
    return { data, warnings, stripped: true };
  }

  const objNum = parseInt(infoMatch[1]!, 10);

  // Find "objNum G obj" in the file.
  const objRe = new RegExp(`(?:^|[^0-9])${objNum}\\s+\\d+\\s+obj(?:[^a-z]|$)`, 'm');
  const objMatch = objRe.exec(str);
  if (!objMatch) {
    warnings.push(`Info object ${objNum} not found in file body.`);
    return { data, warnings, stripped: false };
  }

  // objMatch.index might point to the non-digit char before objNum; advance past it.
  let objStart = objMatch.index;
  while (objStart < str.length && (str[objStart] === '\n' || str[objStart] === '\r' || str[objStart] === ' ')) {
    objStart++;
  }

  const endobjIdx = str.indexOf('endobj', objStart);
  if (endobjIdx < 0) {
    warnings.push('Could not find end of Info object — PDF may be malformed.');
    return { data, warnings, stripped: false };
  }

  zeroStringsInRange(data, objStart, endobjIdx);
  return { data, warnings, stripped: true };
}

export function isPdf(data: Uint8Array): boolean {
  // PDF magic bytes: %PDF-
  return (
    data.length >= 5 &&
    data[0] === 0x25 && // %
    data[1] === 0x50 && // P
    data[2] === 0x44 && // D
    data[3] === 0x46 && // F
    data[4] === 0x2d    // -
  );
}

// Replaces the content of every PDF literal string (...) and hex string <...>
// in the given byte range with space/zero characters, preserving byte count.
function zeroStringsInRange(data: Uint8Array, start: number, end: number): void {
  let i = start;
  while (i < end) {
    const b = data[i]!;

    if (b === 0x3c) {
      // Possible hex string <...>; make sure it's not a dict <<
      const next = i + 1 < end ? data[i + 1] : 0;
      if (next !== 0x3c) {
        i++;
        while (i < end && data[i] !== 0x3e) {
          const c = data[i]!;
          // Replace hex digit chars with '0' (preserves byte count)
          if (isHexDigit(c)) data[i] = 0x30;
          i++;
        }
        // skip closing >
      }
    } else if (b === 0x28) {
      // Literal string (...)
      let depth = 1;
      i++; // skip opening (
      while (i < end && depth > 0) {
        const c = data[i]!;
        if (c === 0x5c) {
          // Backslash escape — skip the escaped byte but zero both
          if (i + 1 < end) {
            data[i] = 0x20;
            data[i + 1] = 0x20;
            i += 2;
          } else {
            i++;
          }
          continue;
        }
        if (c === 0x28) depth++;
        else if (c === 0x29) depth--;

        if (depth > 0) {
          data[i] = 0x20; // replace content byte with ASCII space
        }
        i++;
      }
      continue;
    }

    i++;
  }
}

function isHexDigit(c: number): boolean {
  return (c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66);
}

function latin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}
