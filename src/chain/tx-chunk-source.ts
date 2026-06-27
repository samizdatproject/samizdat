// TxChunkSource: extracts SAMIZDAT chunk data from on-chain chunk transactions.
// Requires chunk txids to be supplied by the caller (they come from the anchor payload
// and are passed through fetchAndVerifyChunks via the optional chunkTxids argument).

import type { ChunkSource, ChainReader } from '../renderer/chain';
import { RendererError } from '../renderer/errors';
import { decodeChunkPayload } from '../tx/encoding';

export class TxChunkSource implements ChunkSource {
  constructor(private readonly chain: ChainReader) {}

  async fetchChunk(hash: string, txid?: string): Promise<Uint8Array> {
    if (!txid) {
      throw new RendererError(
        'CHUNK_MISSING',
        `No txid provided for chunk ${hash.slice(0, 16)}… — pass chunkTxids to fetchAndVerifyChunks`,
      );
    }

    let script: Uint8Array;
    try {
      script = await this.chain.fetchTxScript(txid);
    } catch (err) {
      if (err instanceof RendererError) throw err;
      throw new RendererError('CHUNK_MISSING', `Failed to fetch chunk tx ${txid}: ${String(err)}`);
    }

    let payload: ReturnType<typeof decodeChunkPayload>;
    try {
      payload = decodeChunkPayload(script);
    } catch (err) {
      throw new RendererError(
        'CHUNK_MISSING',
        `Failed to decode chunk payload from tx ${txid}: ${String(err)}`,
      );
    }

    return payload.data;
  }
}
