// Pluggable chain reader and chunk source interfaces.
// The renderer never speaks directly to a node — it goes through these interfaces,
// which allows test mocks, mirror HTTP implementations, and local caches.

export interface ChainReader {
  // Extracts the SAMIZDAT binary data blob from the data-carrier output of a tx.
  // Returns the blob bytes or throws RendererError('TX_NOT_FOUND') if not found.
  fetchTxScript(txid: string): Promise<Uint8Array>;
}

export interface ChunkSource {
  // Fetches the raw chunk data for a given hash (and optionally its chunk txid).
  // Throws RendererError('CHUNK_MISSING') if unavailable.
  fetchChunk(hash: string, txid?: string): Promise<Uint8Array>;
}

// In-memory mock for tests and local previews.
export class MockChainReader implements ChainReader {
  private scripts = new Map<string, Uint8Array>();

  add(txid: string, script: Uint8Array): this {
    this.scripts.set(txid, script);
    return this;
  }

  async fetchTxScript(txid: string): Promise<Uint8Array> {
    const script = this.scripts.get(txid);
    if (!script) {
      const { RendererError } = await import('./errors');
      throw new RendererError('TX_NOT_FOUND', `txid not found: ${txid}`);
    }
    return script;
  }
}

// In-memory mock chunk source for tests.
export class MockChunkSource implements ChunkSource {
  private chunks = new Map<string, Uint8Array>();

  add(hash: string, data: Uint8Array): this {
    this.chunks.set(hash, data);
    return this;
  }

  async fetchChunk(hash: string): Promise<Uint8Array> {
    const data = this.chunks.get(hash);
    if (!data) {
      const { RendererError } = await import('./errors');
      throw new RendererError('CHUNK_MISSING', `chunk not found: hash=${hash}`);
    }
    return data;
  }
}
