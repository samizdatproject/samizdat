// Combined SAMIZDAT server: editor static files + renderer API on one port.
// Usage: PORT=8089 HOST=0.0.0.0 npx tsx serve.ts

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { handleRenderRequest } from './src/renderer/handler';
import { WocChainReader } from './src/chain/whatsonchain';
import { TxChunkSource } from './src/chain/tx-chunk-source';
import type { BsvNetwork } from './src/chain/whatsonchain';

const PORT = parseInt(process.env.PORT ?? '8089', 10);
const HOST = process.env.HOST ?? '0.0.0.0';
const NETWORK = (process.env.BSV_NETWORK ?? 'main') as BsvNetwork;

const EDITOR_DIST = path.join(import.meta.dirname, 'editor', 'dist');
const TXID_RE = /^\/tx\/([0-9a-fA-F]{64})$/;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript',
  '.css':  'text/css',
  '.ico':  'image/x-icon',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.woff2':'font/woff2',
};

const chain = new WocChainReader(NETWORK);
const source = new TxChunkSource(chain);

function serveStatic(req: http.IncomingMessage, res: http.ServerResponse): void {
  let urlPath = req.url?.split('?')[0] ?? '/';
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(EDITOR_DIST, urlPath);
  // Prevent path traversal
  if (!filePath.startsWith(EDITOR_DIST)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for unknown routes
      fs.readFile(path.join(EDITOR_DIST, 'index.html'), (_e2, fallback) => {
        if (_e2 || !fallback) { res.writeHead(404); res.end('Not Found'); return; }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallback);
      });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url ?? '/';
  const txMatch = TXID_RE.exec(url);

  if (req.method === 'GET' && txMatch) {
    try {
      const result = await handleRenderRequest(txMatch[1]!, chain, source);
      res.writeHead(result.status, result.headers as http.OutgoingHttpHeaders);
      res.end(Buffer.from(result.body));
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Internal server error');
    }
    return;
  }

  if (req.method === 'GET') {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405, { 'Content-Type': 'text/plain' });
  res.end('Method Not Allowed');
});

server.listen(PORT, HOST, () => {
  const displayHost = process.env.PUBLIC_HOST ?? (HOST === '0.0.0.0' ? 'localhost' : HOST);
  console.log(`SAMIZDAT is live at  http://${displayHost}:${PORT}/`);
  console.log(`Renderer API:    http://${displayHost}:${PORT}/tx/<txid>`);
  console.log(`BSV network:     ${NETWORK}`);
});
