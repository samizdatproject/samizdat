// Offline P2PKH transaction signing (BSV BIP143 + SIGHASH_FORKID).
// Used by the standalone signer page and scripts/sign-tx.ts — not loaded by the main editor.

import { secp256k1 } from '@noble/curves/secp256k1.js';
import type { SamizdatSignBundle } from '@samizdat/tx/sign-bundle';

const SIGHASH_ALL_FORKID = 0x41;

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().replace(/\s/g, '').toLowerCase();
  if (clean.length % 2 !== 0) throw new Error('Invalid hex length');
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toHex(b: Uint8Array): string {
  return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('');
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest('SHA-256', data.buffer as ArrayBuffer),
  );
}

async function sha256d(data: Uint8Array): Promise<Uint8Array> {
  return sha256(await sha256(data));
}

function writeUint32LE(n: number): Uint8Array {
  return new Uint8Array([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
}

function writeInt64LE(n: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  let v = n < 0n ? n + 0x10000000000000000n : n;
  for (let i = 0; i < 8; i++) { buf[i] = Number(v & 0xffn); v >>= 8n; }
  return buf;
}

function readUint32LE(b: Uint8Array, off: number): number {
  return (b[off]! | (b[off + 1]! << 8) | (b[off + 2]! << 16) | (b[off + 3]! << 24)) >>> 0;
}

function readInt64LE(b: Uint8Array, off: number): bigint {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(b[off + i]!);
  return v;
}

function readVarint(b: Uint8Array, off: number): [number, number] {
  const f = b[off]!;
  if (f <= 0xfc) return [f, 1];
  if (f === 0xfd) return [(b[off + 1]! | (b[off + 2]! << 8)), 3];
  if (f === 0xfe) {
    return [
      (b[off + 1]! | (b[off + 2]! << 8) | (b[off + 3]! << 16) | (b[off + 4]! << 24)) >>> 0,
      5,
    ];
  }
  throw new Error('64-bit varint not supported');
}

function writeVarint(n: number): Uint8Array {
  if (n <= 0xfc) return new Uint8Array([n]);
  if (n <= 0xffff) return new Uint8Array([0xfd, n & 0xff, n >> 8]);
  return new Uint8Array([0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]);
}

function writePushData(data: Uint8Array): Uint8Array {
  const len = data.length;
  if (len < 0x4c) return concat(new Uint8Array([len]), data);
  if (len <= 0xff) return concat(new Uint8Array([0x4c, len]), data);
  if (len <= 0xffff) return concat(new Uint8Array([0x4d, len & 0xff, len >> 8]), data);
  return concat(new Uint8Array([0x4e, len & 0xff, (len >> 8) & 0xff, (len >> 16) & 0xff, (len >> 24) & 0xff]), data);
}

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str: string): Uint8Array {
  let n = 0n;
  for (const char of str) {
    const idx = BASE58.indexOf(char);
    if (idx === -1) throw new Error(`Invalid Base58: ${char}`);
    n = n * 58n + BigInt(idx);
  }
  let leadingZeros = 0;
  for (const char of str) {
    if (char === '1') leadingZeros++;
    else break;
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  return new Uint8Array([...new Array(leadingZeros).fill(0), ...bytes]);
}

function wifToPrivKeySync(wif: string): { privKey: Uint8Array; compressed: boolean } {
  // Minimal sync checksum using noble isn't available; validate length only for offline tool.
  const decoded = base58Decode(wif.trim());
  if (decoded.length !== 37 && decoded.length !== 38) {
    throw new Error('WIF must decode to 37 or 38 bytes (with checksum)');
  }
  const version = decoded[0];
  if (version !== 0x80 && version !== 0xef) {
    throw new Error('WIF version byte must be 0x80 (mainnet) or 0xef (testnet)');
  }
  const body = decoded.slice(1, -4);
  if (body.length === 33 && body[32] === 0x01) {
    return { privKey: body.slice(0, 32), compressed: true };
  }
  if (body.length === 32) return { privKey: body, compressed: false };
  throw new Error('Unexpected WIF payload');
}

interface ParsedInput {
  txidBytes: Uint8Array;
  vout: number;
  sequence: number;
}

interface ParsedOutput {
  satoshis: bigint;
  scriptLen: number;
  script: Uint8Array;
}

interface ParsedTx {
  version: number;
  inputs: ParsedInput[];
  outputs: ParsedOutput[];
  locktime: number;
}

function parseTx(raw: Uint8Array): ParsedTx {
  let off = 0;
  const version = readUint32LE(raw, off); off += 4;
  const [inputCount, varintLen] = readVarint(raw, off); off += varintLen;
  const inputs: ParsedInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    const txidBytes = raw.slice(off, off + 32); off += 32;
    const vout = readUint32LE(raw, off); off += 4;
    const [ssLen, ssVarintLen] = readVarint(raw, off); off += ssVarintLen + ssLen;
    const sequence = readUint32LE(raw, off); off += 4;
    inputs.push({ txidBytes, vout, sequence });
  }
  const [outputCount, oVarintLen] = readVarint(raw, off); off += oVarintLen;
  const outputs: ParsedOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    const satoshis = readInt64LE(raw, off); off += 8;
    const [scriptLen, sVarintLen] = readVarint(raw, off); off += sVarintLen;
    const script = raw.slice(off, off + scriptLen); off += scriptLen;
    outputs.push({ satoshis, scriptLen, script });
  }
  const locktime = readUint32LE(raw, off);
  return { version, inputs, outputs, locktime };
}

async function computeSighash(
  parsed: ParsedTx,
  inputIndex: number,
  subscript: Uint8Array,
  value: bigint,
): Promise<Uint8Array> {
  const inp = parsed.inputs[inputIndex]!;
  const prevouts = concat(...parsed.inputs.map(i => concat(i.txidBytes, writeUint32LE(i.vout))));
  const hashPrevouts = await sha256d(prevouts);
  const sequences = concat(...parsed.inputs.map(i => writeUint32LE(i.sequence)));
  const hashSequence = await sha256d(sequences);
  const outputBytes = concat(...parsed.outputs.map(o =>
    concat(writeInt64LE(o.satoshis), writeVarint(o.scriptLen), o.script),
  ));
  const hashOutputs = await sha256d(outputBytes);
  const scriptCode = concat(writeVarint(subscript.length), subscript);
  const preimage = concat(
    writeUint32LE(parsed.version),
    hashPrevouts,
    hashSequence,
    inp.txidBytes,
    writeUint32LE(inp.vout),
    scriptCode,
    writeInt64LE(value),
    writeUint32LE(inp.sequence),
    hashOutputs,
    writeUint32LE(parsed.locktime),
    writeUint32LE(SIGHASH_ALL_FORKID),
  );
  return sha256d(preimage);
}

function buildP2PKHScriptSig(derSig: Uint8Array, pubKey: Uint8Array): Uint8Array {
  const sigWithType = concat(derSig, new Uint8Array([SIGHASH_ALL_FORKID]));
  return concat(writePushData(sigWithType), writePushData(pubKey));
}

function serialiseSignedTx(parsed: ParsedTx, signedScriptSigs: Uint8Array[]): Uint8Array {
  const serialisedInputs = parsed.inputs.map((inp, i) => {
    const ss = signedScriptSigs[i]!;
    return concat(inp.txidBytes, writeUint32LE(inp.vout), writeVarint(ss.length), ss, writeUint32LE(inp.sequence));
  });
  const serialisedOutputs = parsed.outputs.map(out =>
    concat(writeInt64LE(out.satoshis), writeVarint(out.scriptLen), out.script),
  );
  return concat(
    writeUint32LE(parsed.version),
    writeVarint(parsed.inputs.length),
    ...serialisedInputs,
    writeVarint(parsed.outputs.length),
    ...serialisedOutputs,
    writeUint32LE(parsed.locktime),
  );
}

/** Sign a SAMIZDAT sign bundle with a WIF private key. Runs locally; no network. */
export async function signBundleWithWif(
  bundle: SamizdatSignBundle,
  wif: string,
): Promise<string> {
  const rawTx = fromHex(bundle.hex);
  const parsed = parseTx(rawTx);
  if (parsed.inputs.length !== bundle.inputs.length) {
    throw new Error('Input count mismatch between hex and bundle metadata.');
  }

  const { privKey, compressed } = wifToPrivKeySync(wif.trim());
  const pubKey = secp256k1.getPublicKey(privKey, compressed);
  const signedScriptSigs: Uint8Array[] = [];

  for (let i = 0; i < parsed.inputs.length; i++) {
    const meta = bundle.inputs.find(inp => inp.index === i) ?? bundle.inputs[i]!;
    const subscript = fromHex(meta.lockingScriptHex);
    const sighash = await computeSighash(parsed, i, subscript, BigInt(meta.satoshis));
    const derSig = secp256k1.sign(sighash, privKey, {
      lowS: true,
      prehash: false,
      format: 'der',
    });
    signedScriptSigs.push(buildP2PKHScriptSig(derSig, pubKey));
  }

  return toHex(serialiseSignedTx(parsed, signedScriptSigs));
}
