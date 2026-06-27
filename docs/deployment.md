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

This script creates a `samizdat` system user, builds the project, installs systemd units for the renderer and indexer, and drops an nginx config at `/etc/nginx/sites-available/samizdat`. Edit the nginx config to fill in your `.onion` addresses, then reload nginx and Tor. Ready-to-use files:

| File | Purpose |
|------|---------|
| `deploy/install.sh` | One-command installer |
| `deploy/nginx-samizdat.conf` | nginx server blocks for editor, renderer, indexer |
| `deploy/samizdat-renderer.service` | systemd unit for the renderer |
| `deploy/samizdat-indexer.service` | systemd unit for the indexer |

---

## 1 — Onion service deployment (recommended)

Serving over Tor gives authors and readers the strongest anonymity guarantees. Neither component stores user data or logs queries.

### Prerequisites

- A Linux server (Debian/Ubuntu recommended)
- Tor installed (`apt install tor`)
- Node 20+ for the renderer; no runtime needed for the editor (it's static files)

### 1a — Configure a Tor hidden service

Add to `/etc/tor/torrc`:

```
HiddenServiceDir /var/lib/tor/samizdat/
HiddenServicePort 80 127.0.0.1:3000
```

Restart Tor:

```bash
systemctl restart tor
cat /var/lib/tor/samizdat/hostname   # your .onion address
```

### 1b — Deploy the renderer

The renderer is a stateless HTTP handler — it has no framework dependency and no persistent state. Wire it to any Node HTTP server:

```typescript
// server.ts — minimal Node HTTP wrapper
import http from 'http';
import { handleRenderRequest } from './src/renderer/handler';
import { MyChainReader } from './src/chain/my-reader'; // your BSV node client
import { MyChunkSource } from './src/chain/my-source'; // your data source

const chain = new MyChainReader();
const source = new MyChunkSource();

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`);
  const txid = url.searchParams.get('txid') ?? url.pathname.slice(1);

  const response = await handleRenderRequest(txid, chain, source);

  res.writeHead(response.status, response.headers);
  res.end(response.body);
});

server.listen(3000, '127.0.0.1');
```

Then run behind a reverse proxy (nginx, caddy) listening on `127.0.0.1:3000`.

**Key renderer properties (never change):**
- No session cookies, no logs of txids or user IPs
- Returns a 422 "Unverified Content" page on any hash check failure — never serves partially verified content
- All responses include strict CSP: `default-src 'none'; style-src 'unsafe-inline'`

### 1c — Deploy the editor

Build the editor to a static bundle:

```bash
npm run editor:build
# Output: editor/dist/
```

Serve the `editor/dist/` directory with any static file server:

```nginx
# nginx site config (listening on 127.0.0.1:4000, same onion port or different)
server {
    listen 127.0.0.1:4000;
    root /path/to/samizdat/editor/dist;

    # Enforce strict CSP at the server layer too
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'self'";
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;

    location / {
        try_files $uri /index.html;
    }
}
```

**Security note:** The editor performs all operations locally in the browser. It never makes outbound requests (`connect-src 'none'`). The static bundle can be served from an onion, a clearnet CDN, or a USB drive — the author's browser does all the work.

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

For organizational or private use, run both components on a local network with no internet exposure:

```bash
# 1. Build everything
npm run build && npm run editor:build

# 2. Run renderer on LAN
node dist/server.js --listen 0.0.0.0:3000

# 3. Serve editor on LAN
npx serve editor/dist -l 4000 -s
```

Configure your BSV node connection to point to a trusted full node (or run your own with `bitcoind` / `bsvd`).

---

## 4 — Chain source configuration

The renderer fetches transaction data from a configurable chain backend controlled by the `CHAIN_SOURCE` environment variable. **This choice has real anonymity implications for renderer operators and readers.**

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

No extra configuration needed. The renderer uses the WhatsOnChain public REST API.

```bash
CHAIN_SOURCE=woc tsx src/server.ts
```

For high-volume deployments, WhatsOnChain may require an API key. Contact WoC for commercial terms.

### CHAIN_SOURCE=bitails

Uses the Bitails REST API as an alternative to WhatsOnChain.

```bash
CHAIN_SOURCE=bitails tsx src/server.ts
```

**Important:** Bitails operates in pruned mode. Not all historical transactions are retained. If Bitails does not have a transaction, the renderer returns a clear error page with instructions to try a different source. Do not use Bitails as your sole chain source if you need to serve older publications.

### CHAIN_SOURCE=node

Uses a self-hosted BSV node via JSON-RPC (`getrawtransaction`). This is the strongest anonymity option — the queries stay on infrastructure you control.

```bash
CHAIN_SOURCE=node \
  BSV_NODE_HOST=127.0.0.1 \
  BSV_NODE_PORT=8332 \
  BSV_NODE_USER=rpcuser \
  BSV_NODE_PASS=rpcpassword \
  tsx src/server.ts
```

**Node requirements:**
- A BSV full node (such as `bitcoin-sv` / `bsvd`) reachable from the renderer
- `txindex=1` in the node's config — without this, only UTXO-set (unspent) transactions are available and historical chunk transactions will not be found
- The node's RPC interface should be firewalled; never expose it publicly

**Routing through Tor:** If you cannot run a local node but want to avoid exposing your renderer's IP to a public API, you can route WoC or Bitails requests through Tor by wrapping the `fetch` call with a SOCKS5 proxy. This requires a custom `ChainReader` implementation — see `src/chain/whatsonchain.ts` as a starting point.

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
- `WocChainReader` (`src/chain/whatsonchain.ts`) — WhatsOnChain REST API
- `BitailsChainReader` (`src/chain/bitails.ts`) — Bitails REST API
- `NodeChainReader` (`src/chain/node.ts`) — self-hosted BSV node via JSON-RPC
- `TxChunkSource` (`src/chain/tx-chunk-source.ts`) — wraps any `ChainReader` to fetch chunk payloads

```typescript
import { WocChainReader } from './src/chain/whatsonchain.js';
import { TxChunkSource } from './src/chain/tx-chunk-source.js';

const chain = new WocChainReader('main');
const source = new TxChunkSource(chain);
```

Or implement these yourself against your BSV infrastructure. Example backends:

| Backend | Notes |
|---------|-------|
| WhatsOnChain API | Simple REST API; requires API key for high volume |
| Local `bitcoind` RPC | `getrawtransaction` — most private; requires a full node |
| TAAL API | Commercial; good uptime |
| Custom mirror DB | Index SAMIZDAT txids locally for fast retrieval |

None of these backends have access to which users are reading what — the renderer is stateless and does not tell the backend who is requesting.

---

## 5 — Privacy-preserving operations

The SAMIZDAT protocol is designed so operators cannot correlate readers with content. To maintain this guarantee:

- **Do not log txids in renderer access logs.** Nginx/Apache log the request path by default — disable this or route renderer requests through a path that omits the txid from logs.
- **Do not store IP + txid pairs.** Rate limiting is fine; associating IPs with content hashes is not.
- **Prefer onion-only deployment** for maximum reader privacy.
- **The editor never phones home.** There is no telemetry, analytics, or CDN dependency in the editor bundle.

---

## 6 — Running the indexer (optional)

The indexer scans BSV blocks for SAMIZDAT anchor transactions and exposes a search API. It is explicitly non-canonical: all API responses carry `"canonical": false`.

### Start the indexer

```bash
# Development
tsx src/indexer/server.ts

# Environment variables
INDEXER_PORT=3001 BSV_NETWORK=main HOST=127.0.0.1 tsx src/indexer/server.ts
```

On startup, the indexer scans the last 10 blocks for SAMIZDAT anchors. It keeps an in-memory index (not persistent across restarts).

### API routes

```
GET /by-txid/<64-hex-txid>         → IndexEntry | 404
GET /by-hash/<64-hex-manifest-hash> → IndexEntry | 404
GET /search?q=&tags=&language=&limit=&offset=  → SearchResult
GET /status                        → { size, canonical: false }
```

All responses include `"canonical": false`. No query history is recorded.

### Privacy for indexer operators

- Do not log query txids or manifest hashes in access logs
- Do not associate reader IPs with indexed content
- Consider running the indexer on the same onion as the renderer, or separately as a community service

---

## 7 — Verifying a deployment

After deploying, verify correctness by publishing a test document:

1. Open the editor at your deployment URL (or locally from `editor/dist/index.html`)
2. Write a short Markdown document in the Markdown tab
3. Click "Prepare" — verify the manifest hash and chunk count display
4. Build chunk transactions (use a BSV testnet wallet and testnet UTXOs)
5. After broadcasting, paste the chunk txid and verify the chunk hash matches
6. Build and broadcast the anchor transaction
7. Open the renderer at `/?txid=<your-anchor-txid>` — verify the content renders correctly and all hash checks pass

---

## 7 — Build artifacts

| Command | Output | Purpose |
|---------|--------|---------|
| `npm run build` | `dist/` | Core library (Node/browser) |
| `npm run editor:build` | `editor/dist/` | Static editor bundle |
| `npm test` | stdout | Full test suite (292 tests, 26 files) |
| `npm run typecheck` | stdout | TypeScript check (core) |
| `npm run editor:typecheck` | stdout | TypeScript check (editor) |

The core library has **zero runtime dependencies** — it uses only the Web Crypto API (`globalThis.crypto.subtle`) available natively in Node 16+ and all modern browsers including Tor Browser.
