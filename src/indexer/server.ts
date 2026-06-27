// SAMIZDAT Indexer HTTP API server.
// All responses carry `"canonical": false` — this indexer is never authoritative.
// No user accounts, no IP logging, no query history.
//
// Routes:
//   GET /by-txid/:txid           → IndexEntry | 404
//   GET /by-hash/:hash           → IndexEntry | 404
//   GET /search?q=&tags=&language=&limit=&offset=  → SearchResult
//   GET /status                  → { size, canonical: false }
//
// Run with:
//   tsx src/indexer/server.ts [PORT]
//
// Environment variables:
//   INDEXER_PORT   TCP port (default: 3001)
//   HOST           Bind address (default: 127.0.0.1)

import http from 'node:http';
import { IndexStore } from './store';
import { fetchChainHeight } from './scan';
import { createHandler } from './handler';
import type { BsvNetwork } from '../chain/whatsonchain';

const PORT = parseInt(process.env.INDEXER_PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '127.0.0.1';
const NETWORK = (process.env.BSV_NETWORK ?? 'main') as BsvNetwork;

const store = new IndexStore();
const server = http.createServer(createHandler(store));

server.listen(PORT, HOST, async () => {
  console.log(`SAMIZDAT indexer: http://${HOST}:${PORT}/`);
  console.log(`BSV network:  ${NETWORK}`);
  console.log('Routes: GET /by-txid/:txid  /by-hash/:hash  /search  /status');
  console.log('');

  // Scan the last 10 blocks on startup as an initial seed.
  try {
    const tip = await fetchChainHeight(NETWORK);
    const from = Math.max(0, tip - 9);
    console.log(`Scanning blocks ${from}–${tip} for SAMIZDAT anchors…`);
    const { scanRange } = await import('./scan');
    await scanRange(from, tip, store, {
      network: NETWORK,
      onBlock: r => {
        if (r.anchorsFound > 0) {
          console.log(`  Block ${r.blockHeight}: ${r.anchorsFound} SAMIZDAT anchor(s) found`);
        }
      },
    });
    console.log(`Initial scan complete. Index size: ${store.size()}`);
  } catch (err) {
    console.error(`Initial scan failed (network may be unavailable): ${String(err)}`);
  }
});
