// Fee estimation for SAMIZDAT transactions.
// Data outputs use a data-carrier P2PKH script (blob OP_DROP P2PKH).

// Per-input signed size estimate for P2PKH (txid+vout+scriptLen+unlocking+sequence).
const INPUT_BYTES = 148;
// Per-output size estimate (satoshis+scriptLen+script).
const DATA_OUTPUT_SCRIPT_OVERHEAD = 9;    // 8 satoshis + 1 scriptLen varint
const P2PKH_OUTPUT_BYTES = 34;
// Raw tx overhead: version(4) + inputCount(1) + outputCount(1) + locktime(4).
const TX_OVERHEAD = 10;

// Bytes consumed by a PUSHDATA-encoded element in the script.
function pushDataBytes(dataLen: number): number {
  if (dataLen === 0)    return 1;            // OP_0
  if (dataLen <= 75)    return 1 + dataLen;
  if (dataLen <= 255)   return 2 + dataLen;  // OP_PUSHDATA1
  if (dataLen <= 65535) return 3 + dataLen;  // OP_PUSHDATA2
  return 5 + dataLen;                        // OP_PUSHDATA4
}

// Returns estimated total byte count for a single chunk transaction.
// One P2PKH input, one data-carrier output (blob OP_DROP P2PKH), one P2PKH change output.
//
// Chunk blob layout: [4 magic][1 type][1 version][4 index][4 dataLen][n data] = 14 + dataLen
// Carrier script: writePushData(blob) + OP_DROP(1) + P2PKH(25)
export function estimateChunkTxBytes(chunkDataLen: number, _chunkIndex: number): number {
  const blobLen = 14 + chunkDataLen;
  const scriptLen = pushDataBytes(blobLen) + 1 + 25;
  const dataOutputBytes = DATA_OUTPUT_SCRIPT_OVERHEAD + scriptLen;
  return TX_OVERHEAD + INPUT_BYTES + dataOutputBytes + P2PKH_OUTPUT_BYTES;
}

// Returns estimated total byte count for an anchor transaction.
// One P2PKH input, one data-carrier output, one P2PKH change output.
//
// Anchor blob layout: [4][1][1][32][32][4+n][4+m] = 78 + txidsJsonLen + manifestJsonLen
// Carrier script: writePushData(blob) + OP_DROP(1) + P2PKH(25)
export function estimateAnchorTxBytes(chunkTxidsJsonLen: number, manifestJsonLen: number): number {
  const blobLen = 78 + chunkTxidsJsonLen + manifestJsonLen;
  const scriptLen = pushDataBytes(blobLen) + 1 + 25;
  const dataOutputBytes = DATA_OUTPUT_SCRIPT_OVERHEAD + scriptLen;
  return TX_OVERHEAD + INPUT_BYTES + dataOutputBytes + P2PKH_OUTPUT_BYTES;
}

// Returns the satoshi fee for a given byte count and rate.
export function satoshisRequired(txBytes: number, satPerByte: number): bigint {
  return BigInt(Math.ceil(txBytes * satPerByte));
}
