#!/usr/bin/env node
// SAMIZDAT CLI transaction signer.
//
// Signs an unsigned SAMIZDAT transaction (chunk or anchor) with a WIF private key.
// Runs entirely offline — no network requests are made.
//
// Usage:
//   echo "$WIF" | npx tsx scripts/sign-tx.ts \
//     --tx   <unsigned_tx_hex>     \
//     --sats <utxo_satoshis>       \
//     --script <locking_script_hex>
//
// All inputs except WIF can be passed as flags. WIF is read from stdin to keep
// it out of your shell history.
//
// Output: signed transaction hex, ready to broadcast via any BSV node or explorer.

import { secp256k1 } from '@noble/curves/secp256k1.js';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';

// ── Utilities ────────────────────────────────────────────────────────────────

function fromHex(hex: string): Uint8Array {
  const clean = hex.trim().replace(/\s/g, '');
  if (clean.length % 2 !== 0) throw new Error(`Odd-length hex: ${clean.length} chars`);
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

function sha256(data: Uint8Array): Uint8Array {
  return new Uint8Array(createHash('sha256').update(data).digest());
}

function sha256d(data: Uint8Array): Uint8Array {
  return sha256(sha256(data));
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

// ── Base58Check ──────────────────────────────────────────────────────────────

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function base58Decode(str: string): Uint8Array {
  let n = 0n;
  for (const char of str) {
    const idx = BASE58_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid Base58 character: ${char}`);
    n = n * 58n + BigInt(idx);
  }
  // Count leading '1's → leading zero bytes
  let leadingZeros = 0;
  for (const char of str) {
    if (char === '1') leadingZeros++;
    else break;
  }
  // Convert bigint to bytes
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  return new Uint8Array([...new Array(leadingZeros).fill(0), ...bytes]);
}

function base58CheckDecode(str: string): Uint8Array {
  const full = base58Decode(str);
  if (full.length < 4) throw new Error('Base58Check data too short');
  const payload = full.slice(0, -4);
  const checksum = full.slice(-4);
  const expected = sha256d(payload).slice(0, 4);
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== expected[i]) throw new Error('Base58Check checksum mismatch — invalid WIF');
  }
  return payload;
}

// ── WIF decode ───────────────────────────────────────────────────────────────

function wifToPrivKey(wif: string): { privKey: Uint8Array; compressed: boolean } {
  const payload = base58CheckDecode(wif.trim());
  // payload[0] = version byte (0x80 for mainnet, 0xef for testnet)
  const version = payload[0];
  if (version !== 0x80 && version !== 0xef) {
    throw new Error(`Unexpected WIF version byte 0x${version?.toString(16)} — expected 0x80 (mainnet) or 0xef (testnet)`);
  }
  const body = payload.slice(1);
  if (body.length === 33 && body[32] === 0x01) {
    return { privKey: body.slice(0, 32), compressed: true };
  }
  if (body.length === 32) {
    return { privKey: body, compressed: false };
  }
  throw new Error(`Unexpected WIF payload length: ${body.length}`);
}

// ── Transaction parser ────────────────────────────────────────────────────────

interface ParsedInput {
  txidBytes: Uint8Array; // raw wire order (reversed from display order)
  vout: number;
  scriptSigLen: number;
  scriptSig: Uint8Array;
  sequence: number;
  rawOffset: number; // byte offset of this input in the raw tx
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
  rawInputsOffset: number;
  rawOutputsOffset: number;
}

function parseTx(raw: Uint8Array): ParsedTx {
  let off = 0;
  const version = readUint32LE(raw, off); off += 4;
  const [inputCount, varintLen] = readVarint(raw, off); off += varintLen;
  const rawInputsOffset = off;

  const inputs: ParsedInput[] = [];
  for (let i = 0; i < inputCount; i++) {
    const rawOffset = off;
    const txidBytes = raw.slice(off, off + 32); off += 32;
    const vout = readUint32LE(raw, off); off += 4;
    const [ssLen, ssVarintLen] = readVarint(raw, off); off += ssVarintLen;
    const scriptSig = raw.slice(off, off + ssLen); off += ssLen;
    const sequence = readUint32LE(raw, off); off += 4;
    inputs.push({ txidBytes, vout, scriptSigLen: ssLen, scriptSig, sequence, rawOffset });
  }

  const [outputCount, oVarintLen] = readVarint(raw, off); off += oVarintLen;
  const rawOutputsOffset = off;

  const outputs: ParsedOutput[] = [];
  for (let i = 0; i < outputCount; i++) {
    const satoshis = readInt64LE(raw, off); off += 8;
    const [scriptLen, sVarintLen] = readVarint(raw, off); off += sVarintLen;
    const script = raw.slice(off, off + scriptLen); off += scriptLen;
    outputs.push({ satoshis, scriptLen, script });
  }

  const locktime = readUint32LE(raw, off);
  return { version, inputs, outputs, locktime, rawInputsOffset, rawOutputsOffset };
}

// ── BIP143 sighash (BSV: SIGHASH_ALL | SIGHASH_FORKID = 0x41) ───────────────
//
// BSV uses the BIP143 digest algorithm with SIGHASH_FORKID (0x40) set.
// https://github.com/bitcoin/bips/blob/master/bip-0143.mediawiki
// The nHashType field in the preimage is: sighashType (4 bytes LE), where
//   sighashType = SIGHASH_ALL (0x01) | SIGHASH_FORKID (0x40) = 0x41

const SIGHASH_ALL_FORKID = 0x41;

function computeSighash(
  parsed: ParsedTx,
  inputIndex: number,
  subscript: Uint8Array,   // locking script of the UTXO being spent (P2PKH script)
  value: bigint,           // satoshis of the UTXO being spent
): Uint8Array {
  const inp = parsed.inputs[inputIndex]!;

  // hashPrevouts: SHA256d of all outpoints (txid LE + vout LE)
  const prevouts = concat(...parsed.inputs.map(i => concat(i.txidBytes, writeUint32LE(i.vout))));
  const hashPrevouts = sha256d(prevouts);

  // hashSequence: SHA256d of all input sequences
  const sequences = concat(...parsed.inputs.map(i => writeUint32LE(i.sequence)));
  const hashSequence = sha256d(sequences);

  // hashOutputs: SHA256d of all outputs (satoshis LE + varint(scriptLen) + script)
  const outputBytes = concat(...parsed.outputs.map(o =>
    concat(writeInt64LE(o.satoshis), writeVarint(o.scriptLen), o.script)
  ));
  const hashOutputs = sha256d(outputBytes);

  // scriptCode: varint(subscript.length) + subscript
  const scriptCode = concat(writeVarint(subscript.length), subscript);

  // BIP143 preimage:
  const preimage = concat(
    writeUint32LE(parsed.version),           // 1. nVersion
    hashPrevouts,                            // 2. hashPrevouts
    hashSequence,                            // 3. hashSequence
    inp.txidBytes,                           // 4a. outpoint txid (wire order)
    writeUint32LE(inp.vout),                 // 4b. outpoint vout
    scriptCode,                              // 5. scriptCode
    writeInt64LE(value),                     // 6. value (satoshis)
    writeUint32LE(inp.sequence),             // 7. nSequence
    hashOutputs,                             // 8. hashOutputs
    writeUint32LE(parsed.locktime),          // 9. nLocktime
    writeUint32LE(SIGHASH_ALL_FORKID),       // 10. sighash type
  );

  return sha256d(preimage);
}

// ── DER-encode a secp256k1 signature ─────────────────────────────────────────

function derEncode(r: Uint8Array, s: Uint8Array): Uint8Array {
  // Ensure positive (prepend 0x00 if high bit set)
  const rEnc = r[0]! & 0x80 ? concat(new Uint8Array([0x00]), r) : r;
  const sEnc = s[0]! & 0x80 ? concat(new Uint8Array([0x00]), s) : s;
  const rPart = concat(new Uint8Array([0x02, rEnc.length]), rEnc);
  const sPart = concat(new Uint8Array([0x02, sEnc.length]), sEnc);
  const inner = concat(rPart, sPart);
  return concat(new Uint8Array([0x30, inner.length]), inner);
}

// ── Build scriptSig for P2PKH input ──────────────────────────────────────────

function buildP2PKHScriptSig(derSig: Uint8Array, sighashByte: number, pubKey: Uint8Array): Uint8Array {
  const sigWithType = concat(derSig, new Uint8Array([sighashByte]));
  return concat(writePushData(sigWithType), writePushData(pubKey));
}

// ── Serialise signed transaction ──────────────────────────────────────────────

function serialiseTx(parsed: ParsedTx, signedScriptSigs: Uint8Array[]): Uint8Array {
  const { version, inputs, outputs, locktime } = parsed;

  const serialisedInputs = inputs.map((inp, i) => {
    const ss = signedScriptSigs[i]!;
    return concat(
      inp.txidBytes,
      writeUint32LE(inp.vout),
      writeVarint(ss.length),
      ss,
      writeUint32LE(inp.sequence),
    );
  });

  const serialisedOutputs = outputs.map(out =>
    concat(writeInt64LE(out.satoshis), writeVarint(out.scriptLen), out.script)
  );

  return concat(
    writeUint32LE(version),
    writeVarint(inputs.length),
    ...serialisedInputs,
    writeVarint(outputs.length),
    ...serialisedOutputs,
    writeUint32LE(locktime),
  );
}

// ── Argument parsing ──────────────────────────────────────────────────────────

function getArg(name: string): string | undefined {
  const args = process.argv.slice(2);
  const idx = args.indexOf(name);
  return idx !== -1 ? args[idx + 1] : undefined;
}

function requireArg(name: string, description: string): string {
  const val = getArg(name);
  if (!val) {
    console.error(`\nError: missing required argument ${name} (${description})`);
    console.error('\nUsage:');
    console.error('  echo "$WIF" | npx tsx scripts/sign-tx.ts \\');
    console.error('    --tx   <unsigned_tx_hex>');
    console.error('    --sats <utxo_satoshis>');
    console.error('    --script <locking_script_hex>');
    process.exit(1);
  }
  return val;
}

// ── Read WIF from stdin ───────────────────────────────────────────────────────

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    process.stdout.write('WIF private key: ');
  }
  return new Promise((resolve, reject) => {
    const rl = createInterface({ input: process.stdin, terminal: false });
    let line = '';
    rl.on('line', l => { line = l.trim(); rl.close(); });
    rl.on('close', () => {
      if (!line) reject(new Error('No WIF key received on stdin'));
      else resolve(line);
    });
    rl.on('error', reject);
  });
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const txHex = requireArg('--tx', 'unsigned transaction hex');
  const satsStr = requireArg('--sats', 'UTXO value in satoshis');
  const scriptHex = requireArg('--script', 'UTXO locking script hex');

  const utxoSats = BigInt(satsStr);
  if (utxoSats <= 0n) throw new Error('--sats must be a positive integer');

  const subscript = fromHex(scriptHex);
  const rawTx = fromHex(txHex);
  const parsed = parseTx(rawTx);

  if (parsed.inputs.length === 0) throw new Error('Transaction has no inputs');

  const wif = await readStdin();
  const { privKey, compressed } = wifToPrivKey(wif);

  // Derive public key (compressed or uncompressed depending on WIF flag)
  const pubKey = secp256k1.getPublicKey(privKey, compressed);

  // Sign all inputs (SAMIZDAT txs have one input, but handle multiple for robustness)
  const signedScriptSigs: Uint8Array[] = [];

  for (let i = 0; i < parsed.inputs.length; i++) {
    const sighash = computeSighash(parsed, i, subscript, utxoSats);
    const derSig = secp256k1.sign(sighash, privKey, {
      lowS: true,
      prehash: false,
      format: 'der',
    });
    const scriptSig = buildP2PKHScriptSig(derSig, SIGHASH_ALL_FORKID, pubKey);
    signedScriptSigs.push(scriptSig);
  }

  const signedTx = serialiseTx(parsed, signedScriptSigs);
  const signedHex = toHex(signedTx);

  console.log('\nSigned transaction hex:');
  console.log(signedHex);
  console.log('\nBroadcast this hex to any BSV node or block explorer.');
}

main().catch(err => {
  console.error(`\nError: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
