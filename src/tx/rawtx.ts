// Raw unsigned Bitcoin/BSV transaction serialiser.
// Format defined in docs/bsv-integration.md §"Transaction Binary Format".

import { concat, writeVarint, writeUint32LE, writeInt64LE } from './varint';
import { fromHex } from '../core/hash';

export interface TxOutput {
  satoshis: bigint;
  scriptHex: string;
}

export interface TxInput {
  txidHex: string;   // displayed (big-endian) hex; reversed in raw bytes
  vout: number;
  sequence?: number; // default 0xffffffff
}

// Serialises an unsigned transaction (all inputs have empty unlocking scripts).
export function buildUnsignedTx(inputs: TxInput[], outputs: TxOutput[]): Uint8Array {
  const version   = writeUint32LE(1);
  const locktime  = writeUint32LE(0);

  const serialisedInputs = inputs.map(inp => {
    const txidBytes = fromHex(inp.txidHex);
    // Reverse from display order to raw wire order.
    const txidReversed = txidBytes.slice().reverse();
    return concat(
      txidReversed,
      writeUint32LE(inp.vout),
      writeVarint(0),                                         // empty unlocking script (unsigned)
      writeUint32LE(inp.sequence ?? 0xffffffff),
    );
  });

  const serialisedOutputs = outputs.map(out => {
    const script = fromHex(out.scriptHex);
    return concat(
      writeInt64LE(out.satoshis),
      writeVarint(script.length),
      script,
    );
  });

  return concat(
    version,
    writeVarint(inputs.length),
    ...serialisedInputs,
    writeVarint(outputs.length),
    ...serialisedOutputs,
    locktime,
  );
}
