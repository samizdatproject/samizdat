// Validates raw unsigned transaction serialisation (no partial/Electrum headers).

import { fromHex } from '../core/hash';
import { readVarint } from './varint';

export interface ParsedRawTx {
  version: number;
  inputCount: number;
  outputCount: number;
  byteLength: number;
}

function readUint32LE(buf: Uint8Array, offset: number): number {
  return (buf[offset]! | (buf[offset + 1]! << 8) | (buf[offset + 2]! << 16) | (buf[offset + 3]! << 24)) >>> 0;
}

export function parseRawTx(raw: Uint8Array): ParsedRawTx {
  let off = 0;
  const version = readUint32LE(raw, off);
  off += 4;

  const [inputCount, inVarintLen] = readVarint(raw, off);
  off += inVarintLen;
  for (let i = 0; i < inputCount; i++) {
    off += 32 + 4; // prevout txid + vout
    const [scriptLen, scriptVarintLen] = readVarint(raw, off);
    off += scriptVarintLen + scriptLen + 4; // scriptSig + sequence
  }

  const [outputCount, outVarintLen] = readVarint(raw, off);
  off += outVarintLen;
  for (let i = 0; i < outputCount; i++) {
    off += 8; // satoshis
    const [scriptLen, scriptVarintLen] = readVarint(raw, off);
    off += scriptVarintLen + scriptLen;
  }

  off += 4; // locktime

  if (off !== raw.length) {
    throw new Error(
      `Malformed transaction: parsed ${off} bytes but buffer is ${raw.length} bytes`,
    );
  }

  return { version, inputCount, outputCount, byteLength: raw.length };
}

export function validateRawTxHex(hex: string): ParsedRawTx {
  return parseRawTx(fromHex(hex));
}
