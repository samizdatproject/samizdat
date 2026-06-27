// Raw Bitcoin/BSV script building primitives.
// See docs/bsv-integration.md for PUSHDATA encoding rules.

import { concat } from './varint';

// Minimally-encodes a data push per Bitcoin script rules.
export function writePushData(data: Uint8Array): Uint8Array {
  const len = data.length;
  let prefix: Uint8Array;
  if (len === 0) {
    return new Uint8Array([0x00]);            // OP_0
  } else if (len <= 75) {
    prefix = new Uint8Array([len]);
  } else if (len <= 255) {
    prefix = new Uint8Array([0x4c, len]);     // OP_PUSHDATA1
  } else if (len <= 65535) {
    prefix = new Uint8Array([0x4d, len & 0xff, len >> 8]);  // OP_PUSHDATA2
  } else {
    prefix = new Uint8Array([                 // OP_PUSHDATA4
      0x4e,
      len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >>> 24) & 0xff,
    ]);
  }
  return concat(prefix, data);
}

// Builds an OP_FALSE OP_RETURN script with one or more data elements.
// Each element is pushed separately, enabling structured parsing by indexers.
// Retained for tests and backward compatibility; new code uses buildDataCarrierScript.
export function buildDataScript(...elements: Uint8Array[]): Uint8Array {
  const header = new Uint8Array([0x00, 0x6a]); // OP_FALSE OP_RETURN
  return concat(header, ...elements.map(writePushData));
}

// Builds a data-carrier P2PKH locking script: <blob> OP_DROP <P2PKH>.
// The blob is pushed and immediately dropped; the P2PKH suffix is spendable.
// This is the established BSV data-carrier pattern indexed by WoC and Bitails.
export function buildDataCarrierScript(blob: Uint8Array, pubKeyHash: Uint8Array): Uint8Array {
  const opDrop = new Uint8Array([0x75]); // OP_DROP
  return concat(writePushData(blob), opDrop, buildP2PKHScript(pubKeyHash));
}

// Extracts the data blob from a data-carrier script built by buildDataCarrierScript.
// Throws if the script does not match the expected format.
export function extractDataCarrierPayload(script: Uint8Array): Uint8Array {
  if (script.length < 3) throw new Error('Script too short to be a data-carrier script');

  const opcode = script[0]!;
  let blobStart: number;
  let blobLen: number;

  if (opcode >= 0x01 && opcode <= 75) {
    blobStart = 1;
    blobLen = opcode;
  } else if (opcode === 0x4c) {
    blobStart = 2;
    blobLen = script[1]!;
  } else if (opcode === 0x4d) {
    blobStart = 3;
    blobLen = script[1]! | (script[2]! << 8);
  } else if (opcode === 0x4e) {
    blobStart = 5;
    blobLen = (script[1]! | (script[2]! << 8) | (script[3]! << 16) | (script[4]! << 24)) >>> 0;
  } else {
    throw new Error(`Script does not start with a data push: 0x${opcode.toString(16)}`);
  }

  const dropOffset = blobStart + blobLen;
  if (script[dropOffset] !== 0x75) {
    throw new Error(
      `Expected OP_DROP (0x75) after data push at offset ${dropOffset}, ` +
      `got 0x${script[dropOffset]?.toString(16) ?? 'end-of-script'}`,
    );
  }

  return script.slice(blobStart, dropOffset);
}

// Standard P2PKH locking script: OP_DUP OP_HASH160 <20-byte-hash> OP_EQUALVERIFY OP_CHECKSIG
export function buildP2PKHScript(pubKeyHash: Uint8Array): Uint8Array {
  if (pubKeyHash.length !== 20) throw new Error('pubKeyHash must be exactly 20 bytes');
  return new Uint8Array([0x76, 0xa9, 0x14, ...pubKeyHash, 0x88, 0xac]);
}

// Parses the push-data elements from an OP_FALSE OP_RETURN script.
// Throws if the script does not start with OP_FALSE (0x00) OP_RETURN (0x6a).
export function parsePushDataElements(script: Uint8Array): Uint8Array[] {
  if (script[0] !== 0x00 || script[1] !== 0x6a) {
    throw new Error('Script is not OP_FALSE OP_RETURN');
  }
  const elements: Uint8Array[] = [];
  let i = 2;
  while (i < script.length) {
    const opcode = script[i]!;
    if (opcode === 0x00) {
      elements.push(new Uint8Array(0));
      i++;
    } else if (opcode <= 75) {
      elements.push(script.slice(i + 1, i + 1 + opcode));
      i += 1 + opcode;
    } else if (opcode === 0x4c) {
      const len = script[i + 1]!;
      elements.push(script.slice(i + 2, i + 2 + len));
      i += 2 + len;
    } else if (opcode === 0x4d) {
      const len = script[i + 1]! | (script[i + 2]! << 8);
      elements.push(script.slice(i + 3, i + 3 + len));
      i += 3 + len;
    } else if (opcode === 0x4e) {
      const len =
        (script[i + 1]! | (script[i + 2]! << 8) | (script[i + 3]! << 16) | (script[i + 4]! << 24)) >>> 0;
      elements.push(script.slice(i + 5, i + 5 + len));
      i += 5 + len;
    } else {
      throw new Error(`Unexpected opcode 0x${opcode.toString(16)} at offset ${i}`);
    }
  }
  return elements;
}
