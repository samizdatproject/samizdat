// SAMIZDAT append-only index store.
// In-memory by design — no persistent state is canonical.
// Operators may persist by serialising/deserialising `entries()`.

import type { IndexEntry, SearchResult } from './types';

export class IndexStore {
  private readonly byTxid = new Map<string, IndexEntry>();
  private readonly byHash = new Map<string, IndexEntry>();
  private readonly list: IndexEntry[] = [];

  // Adds an entry. Silently ignores duplicates (same txid).
  add(entry: IndexEntry): void {
    if (this.byTxid.has(entry.txid)) return;
    this.byTxid.set(entry.txid, entry);
    this.byHash.set(entry.manifestHash, entry);
    this.list.push(entry);
  }

  findByTxid(txid: string): IndexEntry | undefined {
    return this.byTxid.get(txid);
  }

  findByHash(manifestHash: string): IndexEntry | undefined {
    return this.byHash.get(manifestHash);
  }

  // Full-text search over title + tags + language, with optional tag filter.
  // Returns results ordered newest-indexed-first.
  search(opts: {
    q?: string;
    tags?: string[];
    language?: string;
    limit?: number;
    offset?: number;
  }): SearchResult {
    const { q, tags, language, limit = 20, offset = 0 } = opts;
    const qLow = q ? q.toLowerCase() : '';

    const filtered = this.list.filter(e => {
      if (language && e.language !== language) return false;
      if (tags && tags.length > 0) {
        const etags = e.tags ?? [];
        if (!tags.every(t => etags.includes(t))) return false;
      }
      if (qLow) {
        const haystack = [
          e.title ?? '',
          ...(e.tags ?? []),
          e.language ?? '',
        ].join(' ').toLowerCase();
        if (!haystack.includes(qLow)) return false;
      }
      return true;
    });

    // Newest-indexed-first
    const sorted = filtered.slice().reverse();
    const page = sorted.slice(offset, offset + limit);

    return {
      total: filtered.length,
      offset,
      limit,
      results: page,
    };
  }

  // Returns all entries (for serialisation / persistence).
  entries(): readonly IndexEntry[] {
    return this.list;
  }

  size(): number {
    return this.list.length;
  }
}
