// SAMIZDAT indexer types.
// An indexer scans BSV blocks for SAMIZDAT anchor transactions, extracts metadata,
// and exposes a search API. It is explicitly non-canonical: all results carry
// `canonical: false` and no response is authoritative over the on-chain anchor.

export interface IndexEntry {
  txid: string;
  manifestHash: string;
  rootHash: string;
  chunkTxids: string[];
  blockHeight: number | null;
  title?: string;
  tags?: string[];
  language?: string;
  createdAt?: string;
  indexedAt: string; // ISO 8601 UTC timestamp of when this entry was added
}

// All API responses carry this disclaimer.
export interface IndexResponse<T> {
  canonical: false;
  data: T;
}

export interface SearchResult {
  total: number;
  offset: number;
  limit: number;
  results: IndexEntry[];
}
