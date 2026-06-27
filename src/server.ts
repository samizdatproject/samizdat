// SAMIZDAT Renderer — minimal Node.js HTTP server.
// Exposes GET /tx/<txid> which runs the full verify → reconstruct pipeline.
//
// Run in development:
//   tsx src/server.ts
//
// Run after build:
//   node --experimental-specifier-resolution=node dist/server.js
//
// Environment variables:
//   PORT         TCP port (default: 3000)
//   HOST         Bind address (default: 127.0.0.1 — loopback only)
//   BSV_NETWORK  BSV network: main | test | stn (default: main)
//   CHAIN_SOURCE Chain data backend: woc | bitails | node (default: woc)
//                woc     — WhatsOnChain public API (third-party; logs txid queries)
//                bitails — Bitails public API (third-party; pruned mode; may not
//                          have all historical transactions)
//                node    — Self-hosted BSV node via JSON-RPC (strongest privacy;
//                          requires BSV_NODE_HOST / BSV_NODE_PORT / BSV_NODE_USER
//                          / BSV_NODE_PASS and txindex=1 on the node)
//
// For onion deployment, point a Tor hidden service at 127.0.0.1:PORT.
// Never expose this server directly to the internet — put a reverse proxy in front.

import http from 'node:http';
import { handleRenderRequest } from './renderer/handler';
import { WocChainReader } from './chain/whatsonchain';
import { BitailsChainReader } from './chain/bitails';
import { NodeChainReader, nodeConfigFromEnv } from './chain/node';
import { TxChunkSource } from './chain/tx-chunk-source';
import type { BsvNetwork } from './chain/whatsonchain';
import type { ChainReader } from './renderer/chain';

const PORT = parseInt(process.env.PORT ?? '3000', 10);
const HOST = process.env.HOST ?? '127.0.0.1';
const NETWORK = (process.env.BSV_NETWORK ?? 'main') as BsvNetwork;
const CHAIN_SOURCE = process.env.CHAIN_SOURCE ?? 'woc';

const TXID_RE = /^\/tx\/([0-9a-fA-F]{64})$/;

function buildChainReader(): ChainReader {
  switch (CHAIN_SOURCE) {
    case 'bitails':
      return new BitailsChainReader(NETWORK === 'stn' ? 'main' : NETWORK as 'main' | 'test');
    case 'node':
      return new NodeChainReader(nodeConfigFromEnv());
    case 'woc':
    default:
      return new WocChainReader(NETWORK);
  }
}

const chain = buildChainReader();
const source = new TxChunkSource(chain);

const server = http.createServer(async (req, res) => {
  const match = req.url ? TXID_RE.exec(req.url) : null;

  if (req.method !== 'GET' || !match) {
    res.writeHead(404, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    });
    res.end('Not Found\nUsage: GET /tx/<64-hex-txid>');
    return;
  }

  const txid = match[1]!;
  try {
    const result = await handleRenderRequest(txid, chain, source);
    res.writeHead(result.status, result.headers as http.OutgoingHttpHeaders);
    res.end(Buffer.from(result.body));
  } catch {
    res.writeHead(500, {
      'Content-Type': 'text/plain',
      'Cache-Control': 'no-store',
    });
    res.end('Internal server error');
  }
});

server.listen(PORT, HOST, () => {
  console.log(`SAMIZDAT renderer: http://${HOST}:${PORT}/`);
  console.log(`BSV network:   ${NETWORK}`);
  console.log(`Chain source:  ${CHAIN_SOURCE}`);
  console.log('Route:         GET /tx/<txid>');
});
