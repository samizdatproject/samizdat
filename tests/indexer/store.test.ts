import { describe, it, expect, beforeEach } from 'vitest';
import { IndexStore } from '../../src/indexer/store';
import type { IndexEntry } from '../../src/indexer/types';

function makeEntry(overrides: Partial<IndexEntry> = {}): IndexEntry {
  return {
    txid: '0'.repeat(64),
    manifestHash: 'a'.repeat(64),
    rootHash: 'b'.repeat(64),
    chunkTxids: ['c'.repeat(64)],
    blockHeight: 100,
    title: 'Test Publication',
    tags: ['test', 'samizdat'],
    language: 'en',
    createdAt: '2026-01-01T00:00:00Z',
    indexedAt: '2026-06-24T00:00:00Z',
    ...overrides,
  };
}

describe('IndexStore', () => {
  let store: IndexStore;

  beforeEach(() => {
    store = new IndexStore();
  });

  it('starts empty', () => {
    expect(store.size()).toBe(0);
    expect(store.entries()).toHaveLength(0);
  });

  it('adds an entry and retrieves it by txid', () => {
    const e = makeEntry({ txid: '1'.repeat(64) });
    store.add(e);
    expect(store.findByTxid('1'.repeat(64))).toEqual(e);
    expect(store.size()).toBe(1);
  });

  it('adds an entry and retrieves it by manifest hash', () => {
    const e = makeEntry({ manifestHash: 'd'.repeat(64) });
    store.add(e);
    expect(store.findByHash('d'.repeat(64))).toEqual(e);
  });

  it('returns undefined for unknown txid', () => {
    expect(store.findByTxid('f'.repeat(64))).toBeUndefined();
  });

  it('returns undefined for unknown manifest hash', () => {
    expect(store.findByHash('e'.repeat(64))).toBeUndefined();
  });

  it('ignores duplicate txids silently', () => {
    const e1 = makeEntry({ txid: '2'.repeat(64), title: 'First' });
    const e2 = makeEntry({ txid: '2'.repeat(64), title: 'Second' });
    store.add(e1);
    store.add(e2);
    expect(store.size()).toBe(1);
    expect(store.findByTxid('2'.repeat(64))!.title).toBe('First');
  });

  it('search returns all entries when no filters', () => {
    store.add(makeEntry({ txid: '1'.repeat(64), manifestHash: 'a'.repeat(64) }));
    store.add(makeEntry({ txid: '2'.repeat(64), manifestHash: 'b'.repeat(64) }));
    const result = store.search({});
    expect(result.total).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('search filters by query string (title match)', () => {
    store.add(makeEntry({ txid: '1'.repeat(64), manifestHash: 'a'.repeat(64), title: 'Hello World' }));
    store.add(makeEntry({ txid: '2'.repeat(64), manifestHash: 'b'.repeat(64), title: 'Goodbye World' }));
    const result = store.search({ q: 'hello' });
    expect(result.total).toBe(1);
    expect(result.results[0]!.title).toBe('Hello World');
  });

  it('search filters by tag', () => {
    store.add(makeEntry({ txid: '1'.repeat(64), manifestHash: 'a'.repeat(64), tags: ['news', 'tech'] }));
    store.add(makeEntry({ txid: '2'.repeat(64), manifestHash: 'b'.repeat(64), tags: ['art'] }));
    const result = store.search({ tags: ['news'] });
    expect(result.total).toBe(1);
    expect(result.results[0]!.tags).toContain('news');
  });

  it('search filters by language', () => {
    store.add(makeEntry({ txid: '1'.repeat(64), manifestHash: 'a'.repeat(64), language: 'en' }));
    store.add(makeEntry({ txid: '2'.repeat(64), manifestHash: 'b'.repeat(64), language: 'de' }));
    const result = store.search({ language: 'de' });
    expect(result.total).toBe(1);
    expect(result.results[0]!.language).toBe('de');
  });

  it('search paginates correctly', () => {
    for (let i = 0; i < 5; i++) {
      store.add(makeEntry({
        txid: i.toString().repeat(64).slice(0, 64),
        manifestHash: (i + 10).toString().repeat(64).slice(0, 64),
      }));
    }
    const page1 = store.search({ limit: 2, offset: 0 });
    const page2 = store.search({ limit: 2, offset: 2 });
    expect(page1.total).toBe(5);
    expect(page1.results).toHaveLength(2);
    expect(page2.results).toHaveLength(2);
    expect(page1.results[0]).not.toEqual(page2.results[0]);
  });

  it('search returns newest-indexed-first', () => {
    store.add(makeEntry({
      txid: '1'.repeat(64), manifestHash: 'a'.repeat(64),
      title: 'First', indexedAt: '2026-01-01T00:00:00Z',
    }));
    store.add(makeEntry({
      txid: '2'.repeat(64), manifestHash: 'b'.repeat(64),
      title: 'Second', indexedAt: '2026-06-01T00:00:00Z',
    }));
    const result = store.search({});
    expect(result.results[0]!.title).toBe('Second');
    expect(result.results[1]!.title).toBe('First');
  });

  it('entries() returns all added entries in insertion order', () => {
    const e1 = makeEntry({ txid: '1'.repeat(64), manifestHash: 'a'.repeat(64) });
    const e2 = makeEntry({ txid: '2'.repeat(64), manifestHash: 'b'.repeat(64) });
    store.add(e1);
    store.add(e2);
    const entries = store.entries();
    expect(entries[0]).toEqual(e1);
    expect(entries[1]).toEqual(e2);
  });
});
