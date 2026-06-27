// Testable HTTP request handler for the SAMIZDAT indexer API.
// Extracted from server.ts so it can be unit-tested without binding to a port.

import type http from 'node:http';
import type { IndexStore } from './store';
import type { IndexResponse, SearchResult, IndexEntry } from './types';

const RESPONSE_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

function writeJson<T>(res: http.ServerResponse, status: number, payload: IndexResponse<T> | Record<string, unknown>): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, { ...RESPONSE_HEADERS, 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function parseIntParam(val: string | null, def: number): number {
  if (!val) return def;
  const n = parseInt(val, 10);
  return isNaN(n) ? def : n;
}

// Creates an http.RequestListener backed by the given store.
// Inject a store with test data to unit-test routes without a real BSV node.
export function createHandler(store: IndexStore): http.RequestListener {
  return (req, res) => {
    if (req.method !== 'GET') {
      return writeJson(res, 405, { error: 'Method not allowed', canonical: false });
    }

    const baseUrl = `http://localhost`;
    const url = new URL(req.url ?? '/', baseUrl);
    const path = url.pathname;

    // GET /by-txid/:txid
    const txidMatch = /^\/by-txid\/([0-9a-fA-F]{64})$/.exec(path);
    if (txidMatch) {
      const entry = store.findByTxid(txidMatch[1]!);
      if (!entry) {
        return writeJson(res, 404, { canonical: false, error: `txid not found: ${txidMatch[1]}` });
      }
      return writeJson<IndexEntry>(res, 200, { canonical: false, data: entry });
    }

    // GET /by-hash/:hash
    const hashMatch = /^\/by-hash\/([0-9a-fA-F]{64})$/.exec(path);
    if (hashMatch) {
      const entry = store.findByHash(hashMatch[1]!);
      if (!entry) {
        return writeJson(res, 404, { canonical: false, error: `manifest hash not found: ${hashMatch[1]}` });
      }
      return writeJson<IndexEntry>(res, 200, { canonical: false, data: entry });
    }

    // GET /search
    if (path === '/search') {
      const q = url.searchParams.get('q') ?? undefined;
      const tagsRaw = url.searchParams.get('tags');
      const tags = tagsRaw ? tagsRaw.split(',').map(t => t.trim()).filter(Boolean) : undefined;
      const language = url.searchParams.get('language') ?? undefined;
      const limit = Math.min(parseIntParam(url.searchParams.get('limit'), 20), 100);
      const offset = parseIntParam(url.searchParams.get('offset'), 0);
      const results = store.search({ q, tags, language, limit, offset });
      return writeJson<SearchResult>(res, 200, { canonical: false, data: results });
    }

    // GET /status
    if (path === '/status') {
      return writeJson(res, 200, { canonical: false, size: store.size() });
    }

    writeJson(res, 404, { error: 'Not found', canonical: false });
  };
}
