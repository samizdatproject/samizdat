# SAMIZDAT Deployment Guide

SAMIZDAT has three deployable components:

| Component | What it does | Required for publishing | Required for reading |
|-----------|-------------|------------------------|---------------------|
| **Editor** | Static web app — authors prepare and export transactions locally | Yes | No |
| **Renderer** | Stateless web service — fetches, verifies, and serves content | No | Yes |
| **Indexer** | Optional — scans the BSV chain for SAMIZDAT anchors and exposes a search API | No | No (convenience only) |

Both components can be self-hosted on an onion service, a clearnet domain, or both simultaneously. They are fully independent — any editor can publish to be read by any renderer.

### Quick install (Debian/Ubuntu with nginx + Tor)

```bash
sudo bash deploy/install.sh
```

This script creates a `samizdat` system user, builds the project, installs systemd units for the renderer and indexer, and drops an nginx config at `/etc/nginx/sites-available/samizdat`. Edit the nginx config to fill in your `.onion` addresses, then reload nginx and Tor.

| File | Purpose |
|------|---------|
| `deploy/install.sh` | One-command installer |
| `deploy/nginx-samizdat.conf` | nginx server blocks for editor, renderer, indexer (three separate backends) |
| `deploy/samizdat-renderer.service` | systemd unit for the renderer |
| `deploy/samizdat-indexer.service` | systemd unit for the indexer |
| `serve.ts` (repo root) | **Combined** editor static + renderer on one port — simpler single-onion setup |

---

## 1 — Onion service deployment (recommended)

Serving over Tor gives authors and readers the strongest anonymity guarantees. Neither component stores user data or logs queries.

### Prerequisites

- A Linux server (Debian/Ubuntu recommended)
- Tor installed (`apt install tor`)
- Node 20+ for the renderer; no runtime needed for the editor static files

### 1a — Single onion (editor + renderer) via `serve.ts`

This is the simplest production layout: one Node process serves `editor/dist/` and the renderer API.

```bash
cd /path/to/samizdat
npm install && npm run editor:build

# Default: PORT=8089, binds 0.0.0.0 — use nginx on loopback in front
PORT=8089 HOST=127.0.0.1 npx tsx serve.ts
```

Routes:
- `/` — editor (`index.html`, `sign.html`, assets)
- `/tx/<64-hex-txid>` — renderer (verified content or 422 error page)

nginx example (Tor hidden service → loopback):

```nginx
server {
    listen 127.0.0.1:8765;
    access_log off;

    location / {
        proxy_pass http://127.0.0.1:8089;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

Tor `torrc`:

```
HiddenServiceDir /var/lib/tor/samizdat/
HiddenServicePort 80 127.0.0.1:8765
```

Readers use: `http://<your-onion>/tx/<anchor-txid>`

### 1b — Separate renderer service (`src/server.ts`)

For a dedicated renderer onion or clearnet mirror, use the renderer-only server:

```bash
npm run build
CHAIN_SOURCE=woc BSV_NETWORK=main npm run renderer:dev   # default http://127.0.0.1:3000
```

Route: **`GET /tx/<64-hex-txid>`** only. Wire `deploy/nginx-samizdat.conf` renderer block to proxy `127.0.0.1:4001` → `127.0.0.1:3000`.

Minimal custom integration:

```typescript
import http from 'http';
import { handleRenderRequest } from './src/renderer/handler';
import { WocChainReader } from './src/chain/whatsonchain';
import { TxChunkSource } from './src/chain/tx-chunk-source';

const TXID_RE = /^\/tx\/([0-9a-fA-F]{64})$/;
const chain = new WocChainReader('main');
const source = new TxChunkSource(chain);

const server = http.createServer(async (req, res) => {
  const match = req.url ? TXID_RE.exec(req.url) : null;
  if (req.method !== 'GET' || !match) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found\nUsage: GET /tx/<64-hex-txid>');
    return;
  }
  const result = await handleRenderRequest(match[1]!, chain, source);
  res.writeHead(result.status, result.headers);
  res.end(Buffer.from(result.body));
});

server.listen(3000, '127.0.0.1');
```

**Key renderer properties (never change):**
- No session cookies; operators should disable access logs on `/tx/` paths
- Returns **422** with an error page on any hash check failure — never serves partially verified content
- Responses include strict CSP (`default-src 'self'; script-src 'none'; connect-src 'none'; …`)

### 1c — Deploy the editor (static only)

If the renderer runs separately, serve the editor bundle as static files:

```bash
npm run editor:build
# Output: editor/dist/  (includes index.html and sign.html)
```

```nginx
server {
    listen 127.0.0.1:4000;
    root /path/to/samizdat/editor/dist;

    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'" always;
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Security note:** The editor performs all publish operations locally in the browser. It never makes outbound requests (`connect-src 'none'`). Signing uses **`sign.html`** (separate page) or the CLI — not the main publish UI.

---

## 2 — Clearnet mirror

A clearnet mirror of the renderer lets non-Tor users read published content. Clearnet mirrors do NOT break the anonymity model because:
- Authors always publish through the editor (local) — no clearnet mirror involved
- Readers using Tor can use either the onion or the clearnet renderer
- The protocol anchors content on-chain; no mirror is authoritative

### Clearnet mirror checklist

- [ ] TLS certificate installed (Let's Encrypt via certbot)
- [ ] `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload` header set
- [ ] No request logging enabled for render endpoints (privacy)
- [ ] Rate limiting on all renderer endpoints (nginx `limit_req`)
- [ ] `X-Robots-Tag: noindex` on renderer pages (content is indexed on-chain, not by search engines)

---

## 3 — Self-hosted node (private use)

For organizational or private use on a LAN:

```bash
npm run build && npm run editor:build

# Combined editor + renderer
PORT=8089 npx tsx serve.ts

# Or renderer only
CHAIN_SOURCE=node BSV_NODE_HOST=127.0.0.1 npm run renderer:dev
```

Configure `CHAIN_SOURCE=node` to point at a trusted full BSV node with `txindex=1`.

---

## 4 — Chain source configuration

The renderer fetches transaction data from a configurable chain backend controlled by the `CHAIN_SOURCE` environment variable (**`src/server.ts` only** — `serve.ts` uses WhatsOnChain main/test). **This choice has real anonymity implications for renderer operators and readers.**

| `CHAIN_SOURCE` | Backend | Anonymity | Notes |
|---|---|---|---|
| `woc` (default) | WhatsOnChain public API | Low — WoC logs txid queries and your IP | Simple, no setup required |
| `bitails` | Bitails public API | Low — Bitails logs txid queries and your IP | Pruned mode; may not have all historical transactions |
| `node` | Self-hosted BSV node | High — your node, your logs | Requires a full BSV node with `txindex=1` |

### Privacy warning

When the renderer queries WhatsOnChain or Bitails to fetch transactions, those services can observe:
- Which txids are being fetched (= which content is being read)
- Timing of requests
- The renderer server's IP address

For operators running a public renderer, this means a third party can track which publications are popular and when they are accessed. **For maximum reader privacy, use `CHAIN_SOURCE=node`.**

### CHAIN_SOURCE=woc (default)

```bash
CHAIN_SOURCE=woc npm run renderer:dev
```

### CHAIN_SOURCE=bitails

```bash
CHAIN_SOURCE=bitails npm run renderer:dev
```

**Important:** Bitails operates in pruned mode. Not all historical transactions are retained.

### CHAIN_SOURCE=node

```bash
CHAIN_SOURCE=node \
  BSV_NODE_HOST=127.0.0.1 \
  BSV_NODE_PORT=8332 \
  BSV_NODE_USER=rpcuser \
  BSV_NODE_PASS=rpcpassword \
  npm run renderer:dev
```

**Node requirements:**
- A BSV full node reachable from the renderer
- `txindex=1` in the node's config
- RPC firewalled; never expose publicly

### Implementing a custom ChainReader

The renderer depends on two pluggable interfaces defined in `src/renderer/chain.ts`:

```typescript
interface ChainReader {
  fetchTxScript(txid: string): Promise<Uint8Array>;
}

interface ChunkSource {
  fetchChunk(hash: string, txid?: string): Promise<Uint8Array>;
}
```

Ready-to-use implementations:
- `WocChainReader` (`src/chain/whatsonchain.ts`)
- `BitailsChainReader` (`src/chain/bitails.ts`)
- `NodeChainReader` (`src/chain/node.ts`)
- `TxChunkSource` (`src/chain/tx-chunk-source.ts`) — uses chunk txids embedded in the anchor payload

```typescript
import { WocChainReader } from './src/chain/whatsonchain.js';
import { TxChunkSource } from './src/chain/tx-chunk-source.js';

const chain = new WocChainReader('main');
const source = new TxChunkSource(chain);
```

The renderer is stateless — chain backends see txid fetch requests, not end-user identity.

---

## 5 — Privacy-preserving operations

- **Do not log txids in renderer access logs.** Disable logging on `/tx/` paths or use `access_log off`.
- **Do not store IP + txid pairs.**
- **Prefer onion-only deployment** for maximum reader privacy.
- **The editor never phones home.** No telemetry, analytics, or CDN dependency in the bundle.

---

## 6 — Running the indexer (optional)

The indexer scans BSV blocks for SAMIZDAT anchor transactions and exposes a search API. It is explicitly non-canonical: all API responses carry `"canonical": false`.

```bash
INDEXER_PORT=3001 BSV_NETWORK=main HOST=127.0.0.1 npm run indexer:dev
```

On startup, the indexer scans the last 10 blocks. The index is in-memory (not persistent across restarts).

### API routes

```
GET /by-txid/<64-hex-txid>          → IndexEntry | 404
GET /by-hash/<64-hex-manifest-hash> → IndexEntry | 404
GET /search?q=&tags=&language=&limit=&offset=  → SearchResult
GET /status                         → { size, canonical: false }
```

---

## 7 — Verifying a deployment

After deploying, verify correctness by publishing a test document:

1. Open the editor at your deployment URL (or locally via `npm run editor:dev`)
2. Write a short Markdown document in the Markdown tab (or click **Load sample**)
3. Click **Prepare** — verify the manifest hash and chunk count display
4. Enter a UTXO, build chunk transactions, sign via **sign bundle** + **sign.html**, broadcast
5. Paste chunk txids and signed chunk hex; run **Verify** (local hash check, no network)
6. Build, sign, and broadcast the anchor transaction (typically funded from chunk change output)
7. Open **`/tx/<your-anchor-txid>`** on the renderer — verify content renders (markdown as HTML) or returns 422 on failure

---

## 8 — Build artifacts

| Command | Output | Purpose |
|---------|--------|---------|
| `npm run build` | `dist/` | Core library (Node/browser) |
| `npm run editor:build` | `editor/dist/` | Static editor + sign.html bundle |
| `npm test` | stdout | Full unit suite (328 tests, 30 files) |
| `npm run e2e` | stdout | 20 Playwright E2E tests |
| `npm run typecheck` | stdout | TypeScript check (core) |
| `npm run editor:typecheck` | stdout | TypeScript check (editor) |

The core library has **zero runtime dependencies** — it uses only the Web Crypto API (`globalThis.crypto.subtle`) available natively in Node 16+ and all modern browsers including Tor Browser.
