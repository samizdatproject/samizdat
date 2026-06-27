import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import { IndexStore } from '../../src/indexer/store';
import { createHandler } from '../../src/indexer/handler';
import type { IndexEntry } from '../../src/indexer/types';

function makeEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    txid: '0'.repeat(64),
    manifestHash: 'a'.repeat(64),
    rootHash: 'b'.repeat(64),
    chunkTxids: ['c'.repeat(64)],
    blockHeight: 500,
    title: 'Test',
    tags: ['samizdat'],
    language: 'en',
    indexedAt: '2026-06-24T00:00:00Z',
    ...overrides,
  };
}

// Spin up a real http server on a random port and tear it down after the suite.
let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  const store = new IndexStore();
  store.add(makeEntry({ txid: '1'.repeat(64), manifestHash: 'd'.repeat(64), title: 'Alpha' }));
  store.add(makeEntry({ txid: '2'.repeat(64), manifestHash: 'e'.repeat(64), title: 'Beta', tags: ['news'], language: 'de' }));

  server = http.createServer(createHandler(store));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close(err => (err ? reject(err) : resolve())),
  );
});

async function get(path: string) {
  const res = await fetch(`${baseUrl}${path}`);
  const json = await res.json();
  return { status: res.status, json };
}

describe('GET /by-txid/:txid', () => {
  it('returns 200 and the entry for a known txid', async () => {
    const { status, json } = await get(`/by-txid/${'1'.repeat(64)}`);
    expect(status).toBe(200);
    expect(json.canonical).toBe(false);
    expect(json.data.title).toBe('Alpha');
    expect(json.data.txid).toBe('1'.repeat(64));
  });

  it('returns 404 for an unknown txid', async () => {
    const { status, json } = await get(`/by-txid/${'f'.repeat(64)}`);
    expect(status).toBe(404);
    expect(json.canonical).toBe(false);
    expect(json.error).toMatch(/not found/);
  });
});

describe('GET /by-hash/:hash', () => {
  it('returns 200 and the entry for a known manifest hash', async () => {
    const { status, json } = await get(`/by-hash/${'d'.repeat(64)}`);
    expect(status).toBe(200);
    expect(json.canonical).toBe(false);
    expect(json.data.title).toBe('Alpha');
  });

  it('returns 404 for an unknown hash', async () => {
    const { status, json } = await get(`/by-hash/${'0'.repeat(64)}`);
    expect(status).toBe(404);
    expect(json.canonical).toBe(false);
  });
});

describe('GET /search', () => {
  it('returns all entries with no filters', async () => {
    const { status, json } = await get('/search');
    expect(status).toBe(200);
    expect(json.canonical).toBe(false);
    expect(json.data.total).toBe(2);
    expect(json.data.results).toHaveLength(2);
  });

  it('filters by q (title match)', async () => {
    const { status, json } = await get('/search?q=alpha');
    expect(status).toBe(200);
    expect(json.data.total).toBe(1);
    expect(json.data.results[0].title).toBe('Alpha');
  });

  it('filters by tags', async () => {
    const { status, json } = await get('/search?tags=news');
    expect(status).toBe(200);
    expect(json.data.total).toBe(1);
    expect(json.data.results[0].title).toBe('Beta');
  });

  it('filters by language', async () => {
    const { status, json } = await get('/search?language=de');
    expect(status).toBe(200);
    expect(json.data.total).toBe(1);
    expect(json.data.results[0].language).toBe('de');
  });

  it('respects limit parameter', async () => {
    const { json } = await get('/search?limit=1');
    expect(json.data.results).toHaveLength(1);
    expect(json.data.limit).toBe(1);
  });

  it('respects offset parameter', async () => {
    const { json: page1 } = await get('/search?limit=1&offset=0');
    const { json: page2 } = await get('/search?limit=1&offset=1');
    expect(page1.data.results[0].txid).not.toBe(page2.data.results[0].txid);
  });
});

describe('GET /status', () => {
  it('returns store size and canonical: false', async () => {
    const { status, json } = await get('/status');
    expect(status).toBe(200);
    expect(json.canonical).toBe(false);
    expect(json.size).toBe(2);
  });
});

describe('Error handling', () => {
  it('returns 404 for unknown routes', async () => {
    const { status, json } = await get('/unknown-route');
    expect(status).toBe(404);
    expect(json.canonical).toBe(false);
  });

  it('returns 405 for non-GET methods', async () => {
    const res = await fetch(`${baseUrl}/search`, { method: 'POST' });
    expect(res.status).toBe(405);
  });
});
