# SAMIZDAT

**BSV Anonymous Publishing Protocol — Reference Implementation**

SAMIZDAT is an open protocol and reference implementation for anonymous, non-custodial, onion-first content publishing anchored on the BSV blockchain. Anyone can publish an article, PDF, image bundle, or static site — paying their own fees, signing with their own wallet, through Tor Browser — with no account, no login, and no operator able to censor, de-platform, or charge a toll on their behalf.

The word *samizdat* (Russian: самиздат) described the practice of clandestine self-publishing under Soviet censorship — passing carbon copies hand-to-hand to evade state control. This protocol is its digital successor.

---

## The Promise

> Anyone can publish content anonymously, pay for their own publication, anchor it on BSV, and let any community member independently render or index it — without trusting a single operator.

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Architecture](#architecture)
- [How Publishing Works](#how-publishing-works)
- [Security Model](#security-model)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
- [Running the Editor](#running-the-editor)
- [Running the Renderer](#running-the-renderer)
- [Deploying an Onion Site](#deploying-an-onion-site)
- [Signing Transactions](#signing-transactions)
- [Testing](#testing)
- [Protocol Specification](#protocol-specification)
- [Hard Rules](#hard-rules)
- [Threat Model](#threat-model)
- [Manifest Format](#manifest-format)
- [Transaction Encoding](#transaction-encoding)
- [Verification Flow](#verification-flow)
- [Contributing](#contributing)
- [Support](#support)

---

## Why This Exists

Every publishing platform today has a kill switch. Domain registrars cancel domains. App stores remove apps. Payment processors cut accounts. CDNs terminate contracts. Hosting companies comply with takedown orders. Even decentralized platforms often depend on a small set of infrastructure providers that can be pressured.

SAMIZDAT removes the kill switch from three critical points:

1. **Publication** — the author pays directly, via their own wallet, from their own funds. No operator can block a publication by refusing to process payment.
2. **Anchoring** — the content hash is written into the BSV blockchain as an immutable, timestamped record. No operator can retroactively deny that a publication occurred.
3. **Retrieval** — any person running a compatible renderer can reconstruct and verify the content. No single renderer is canonical; if one is shut down, others remain.

The protocol is designed so that the authoring tool, renderer, indexer, and directory are all independently replaceable. Removing any one of them does not break the protocol.

---

## Architecture

SAMIZDAT has five independent, replaceable layers:

```
┌─────────────────────────────────────────────────────────┐
│  Authoring Client  (editor/)                            │
│  Static web app · Tor Browser · zero third-party assets │
└───────────────────────┬─────────────────────────────────┘
                        │ unsigned tx hex (exported)
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Author's Own Wallet  (external)                        │
│  Signs and broadcasts · never inside the browser        │
└───────────────────────┬─────────────────────────────────┘
                        │ txid(s)
                        ▼
┌─────────────────────────────────────────────────────────┐
│  BSV Blockchain  (canonical anchor)                     │
│  P2PKH data-carrier outputs · content-addressed · final │
└───────────────────────┬─────────────────────────────────┘
                        │ txid or manifest hash
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Renderer  (src/renderer/ + src/server.ts)              │
│  Stateless · verifies every hash · safe HTML output     │
└─────────────────────────────────────────────────────────┘
                        │ (optional)
                        ▼
┌─────────────────────────────────────────────────────────┐
│  Indexer  (src/indexer/)                                │
│  Never canonical · no user accounts · no IP logging     │
└─────────────────────────────────────────────────────────┘
```

**Layer** | **Delivered as** | **Replaceable by**
--- | --- | ---
Core library | TypeScript (`src/core/`) | Any implementation passing the test vectors
Transaction constructor | TypeScript (`src/tx/`) | Any unsigned-tx builder using the same encoding
Stateless renderer | Node HTTP service (`src/renderer/`, `src/server.ts`) | Any verifying renderer
Tor-safe web editor | Static Vite bundle (`editor/`) | Any editor producing valid manifests
Indexer / directory | Optional services (`src/indexer/`, `directory/`) | Any community-run equivalent

---

## How Publishing Works

Publishing is a 10-step state machine. Each step is explicit, reviewable, and gated — no step can be skipped, and no irreversible action occurs until the author confirms.

```
IDLE
  │  author writes content (Markdown / HTML / PDF / image / archive)
  ▼
PREPARE
  │  client hashes content locally, builds manifest, estimates fees
  ▼
REVIEW
  │  author sees: chunk count, root hash, privacy warnings, manifest JSON
  ▼
CONFIRM
  │  author enters their UTXO details; checks the irreversibility checkbox
  ▼
EXPORT_CHUNKS
  │  client builds unsigned chunk transaction(s); author copies hex
  ▼
COLLECT_CHUNK_TXIDS
  │  author signs + broadcasts in their wallet; pastes txid(s) back
  ▼
VERIFY_CHUNKS
  │  author pastes signed chunk tx hex; editor re-hashes locally (no network)
  │  to declared chunk hashes — BLOCKED until all match
  ▼
EXPORT_ANCHOR
  │  only now: client builds unsigned anchor tx referencing verified txids
  ▼
COLLECT_ANCHOR_TXID
  │  author signs + broadcasts anchor; pastes anchor txid back
  ▼
VERIFY_ANCHOR
  │  author pastes signed anchor tx hex; editor verifies chunk Merkle root
  ▼
RECEIPT
     manifest hash, txid(s), root hash, retrieval endpoints
```

**Why this order matters:** the anchor transaction is never built until every chunk has been hash-verified from the signed transaction hex you paste. If any chunk fails, the anchor is never created. This means a failed or partial publish cannot consume funds for an anchor that references missing or corrupt data.

The client never touches private keys. It exports a **sign bundle** (JSON marked `"unsigned": true` with hex and per-input metadata) for external signing — typically via **`sign.html`** (offline WIF signer) or `scripts/sign-tx.ts`. Optional ElectrumSV JSON export is available if you provide xpub/derivation in the UTXO form.

---

## Security Model

### What the client never does

- Never holds, imports, or requests private keys
- Never makes external network requests (enforced by CSP: `connect-src 'none'`)
- Never loads third-party fonts, scripts, or analytics
- Never stores content, manifests, or keys server-side
- Never builds the anchor transaction before chunk hashes are verified

### What the renderer always does

- Verifies every chunk hash with `verifyChunkData` before presenting content
- Verifies the Merkle root with `verifyMerkleRoot` before rendering
- Returns a 422 with a clean error page if any verification fails
- Sanitizes HTML (removes scripts, event handlers, external fetches)
- Renders `text/markdown` as sanitized HTML
- Strips EXIF metadata from images
- Serves PDFs as `Content-Disposition: attachment` only — no inline execution
- Enforces strict CSP on rendered output

### Secure context requirement

The Web Crypto API (`crypto.subtle`) is only available in secure contexts. The editor requires one of:

- An **`.onion` address** in Tor Browser — recommended for anonymity
- An **`https://`** origin with a valid certificate
- **`http://localhost`** for local development only

Accessing via plain `http://` over a public IP exposes your IP to the server and disables the Web Crypto API. The editor will show an explicit error if this is detected.

---

## Repository Layout

```
samizdat/
├── src/
│   ├── core/               # Pure functions — no network, no UI
│   │   ├── hash.ts         # SHA-256 with SAMIZDAT_LEAF_1 / SAMIZDAT_NODE_1 prefixes
│   │   ├── merkle.ts       # Binary Merkle tree, odd-level duplicate rule
│   │   ├── chunker.ts      # Fixed-size deterministic chunker
│   │   ├── manifest.ts     # Manifest builder + strict validator
│   │   └── types.ts        # Protocol types
│   ├── tx/                 # Transaction constructor
│   │   ├── builder.ts      # Unsigned chunk + anchor tx builders
│   │   ├── encoding.ts     # OP_PUSHDATA payload encoding
│   │   ├── fees.ts         # Exact byte-count fee estimator
│   │   ├── receipt.ts      # PublicationRecord builder
│   │   ├── rawtx.ts        # Raw BSV transaction serialization
│   │   ├── sign-bundle.ts  # Wallet-agnostic unsigned tx export
│   │   ├── electrum.ts     # Optional ElectrumSV incomplete JSON
│   │   ├── script.ts       # Data-carrier P2PKH script assembly
│   │   ├── varint.ts       # Bitcoin varint encoding
│   │   └── types.ts        # Tx and UTXO types
│   ├── renderer/           # Stateless renderer
│   │   ├── handler.ts      # HTTP request handler
│   │   ├── resolver.ts     # Anchor txid → manifest resolution
│   │   ├── fetcher.ts      # Chunk fetching via pluggable ChunkSource
│   │   ├── markdown.ts     # Markdown → HTML (sanitized before serve)
│   │   ├── chain.ts        # ChainReader + ChunkSource interfaces
│   │   ├── reconstruct.ts  # File tree reconstruction from verified chunks
│   │   ├── sanitize.ts     # HTML sanitizer, EXIF stripper
│   │   ├── pdfstrip.ts     # PDF /Info dictionary stripper
│   │   ├── zip.ts          # Verified-content ZIP packager
│   │   └── errors.ts       # Renderer error types
│   ├── chain/              # Chain readers (WoC, Bitails, node RPC)
│   ├── indexer/            # Optional indexer
│   │   ├── scan.ts         # Block scanner for SAMIZDAT anchors
│   │   ├── store.ts        # Append-only IndexStore
│   │   └── server.ts       # Search API
│   ├── test-vectors/       # Committed reproducibility vectors
│   │   └── vectors.json
│   ├── index.ts            # Library entry point
│   └── server.ts           # Renderer-only HTTP server (GET /tx/<txid>)
├── editor/                 # Tor-safe web editor
│   ├── src/
│   │   ├── main.ts         # Publish state machine + UI
│   │   ├── guide.ts        # Built-in guide + sample markdown
│   │   ├── sign-page.ts    # Offline WIF signer page logic
│   │   ├── sign-wif.ts     # BIP143 signing (sign.html + CLI)
│   │   ├── mime.ts         # Magic-byte MIME detection
│   │   └── styles.css      # Self-contained styles (sz-* prefix)
│   ├── index.html          # Editor entry (CSP inline)
│   ├── sign.html           # Offline transaction signer
│   └── dist/               # Production build (index.html + sign.html)
├── serve.ts                # Combined editor static + renderer API (recommended for single onion)
├── scripts/
│   └── sign-tx.ts          # CLI signing tool (uses sign bundle hex + input metadata)
├── tests/
│   ├── core/               # Unit tests — hash, merkle, chunker, manifest
│   ├── tx/                 # Unit tests — builder, fees, receipt, encoding
│   ├── renderer/           # Unit tests — sanitize, pdfstrip, zip, handler
│   ├── chain/              # Unit tests — TxChunkSource
│   ├── editor/             # Unit tests — markdown, MIME detection
│   └── e2e/                # Playwright E2E tests (20 tests, full flow)
│       └── editor.test.ts
├── deploy/                 # Deployment artifacts
│   ├── install.sh          # One-command server installer
│   ├── nginx-samizdat.conf # nginx config (onion backend only)
│   ├── samizdat-renderer.service
│   └── samizdat-indexer.service
├── directory/
│   └── index.html          # Zero-JS community directory page
├── docs/
│   ├── deployment.md       # Onion + clearnet + private node guides
│   ├── opsec-guide.md      # Operational security for authors
│   └── bsv-integration.md  # BSV transaction encoding details
├── SPEC.md                 # Full protocol specification (30 sections)
└── DONATE.md               # Donation addresses
```

---

## Getting Started

**Requirements:** Node 20+, npm

```bash
git clone git@github.com:samizdatproject/samizdat.git
cd samizdat
npm install
npm test              # 328 unit tests
npm run typecheck     # zero type errors
```

---

## Running the Editor

The editor is a fully self-contained static web app. No server-side logic. No network requests. No dependencies at runtime.

```bash
npm run editor:dev      # http://localhost:5173 — secure context, crypto.subtle works
npm run editor:build      # production bundle → editor/dist/
```

For HTTPS dev/preview (remote access), from the `editor/` directory:

```bash
cd editor
npm run dev:https       # https://0.0.0.0:5173 — self-signed cert, accept once
npm run preview:https   # https://0.0.0.0:4173
```

The editor includes a **Load sample** button (full SAMIZDAT intro markdown) and a built-in **Guide** (header) covering:
- How to use Tor Browser and obtain an anonymous BSV address
- The 10-step publish flow explained step by step
- How to sign with the **sign bundle** + **sign.html** (or CLI); ElectrumSV JSON is optional
- Operational security warnings for each publish step

---

## Running the Renderer

The renderer is a stateless Node HTTP service. It accepts an **anchor txid** via `GET /tx/<64-hex-txid>`, fetches on-chain data via a configurable chain backend (WhatsOnChain by default), verifies all hashes, and serves safe HTML or a download. `text/markdown` files are converted to sanitized HTML.

```bash
# Renderer only (default port 3000)
npm run build
npm run renderer:dev    # tsx src/server.ts

# Editor + renderer on one port (default 8089) — common for a single .onion
npm run editor:build
npx tsx serve.ts

# Production (via deploy/install.sh — separate renderer + indexer systemd units)
sudo bash deploy/install.sh
```

The installer:
- Creates a `samizdat` system user
- Builds the project
- Installs `samizdat-renderer.service` and `samizdat-indexer.service` as systemd units
- Drops `deploy/nginx-samizdat.conf` for nginx proxy configuration
- Prints final status

Environment variables for `src/server.ts`:

```bash
PORT=3000              # HTTP port (default: 3000)
HOST=127.0.0.1         # Bind address (default: loopback)
BSV_NETWORK=main       # main | test | stn
CHAIN_SOURCE=woc       # woc | bitails | node
```

For `serve.ts`: `PORT`, `HOST`, `BSV_NETWORK` (chain source is WhatsOnChain main/test).

---

## Deploying an Onion Site

The editor is designed to be served as a Tor hidden service. This is the recommended deployment for maximum author anonymity.

### Quick setup (combined editor + renderer)

For a single `.onion` serving both the editor and renderer API, run `serve.ts` and proxy `/tx/` to it:

```bash
# 1. Install tor and nginx
apt install tor nginx

# 2. Build from repo root
cd /path/to/samizdat
npm install && npm run editor:build

# 3. Run combined server (editor static + GET /tx/<txid>)
PORT=8089 npx tsx serve.ts   # or systemd unit wrapping the same command

# 4. nginx backend (127.0.0.1:8765 only — never on a public interface)
cat > /etc/nginx/sites-available/samizdat-onion << 'EOF'
server {
    listen 127.0.0.1:8765;
    access_log off;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'none'; frame-ancestors 'none'; object-src 'none'; base-uri 'self';" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-Frame-Options "DENY" always;
    add_header Referrer-Policy "no-referrer" always;
    location /tx/ {
        proxy_pass http://127.0.0.1:8089;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
    location / {
        proxy_pass http://127.0.0.1:8089;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
EOF
ln -s /etc/nginx/sites-available/samizdat-onion /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# 5. Configure the hidden service
cat >> /etc/tor/torrc << 'EOF'
HiddenServiceDir /var/lib/tor/samizdat/
HiddenServicePort 80 127.0.0.1:8765
HiddenServiceVersion 3
EOF
systemctl restart tor

# 6. Get your .onion address
cat /var/lib/tor/samizdat/hostname
```

Readers open **`http://<your-onion>/tx/<anchor-txid>`** to view verified content.

### Alternative: static editor only

If you run `src/server.ts` as a separate renderer service, serve `editor/dist/` as static files only (see [`docs/deployment.md`](docs/deployment.md) for the three-service nginx layout).

The v3 onion address (56 characters, ed25519) is printed by the last command. Share it with authors.

### Key material

```
/var/lib/tor/samizdat/
├── hostname                  — the .onion address (public, shareable)
├── hs_ed25519_secret_key     — KEEP OFFLINE — loss = permanent loss of address
└── hs_ed25519_public_key
```

Back up `hs_ed25519_secret_key` immediately. If lost, the `.onion` address cannot be recovered. If leaked, anyone can impersonate the site.

### Updating

```bash
cd /path/to/samizdat && npm run editor:build
# Restart serve.ts if used; nginx reload only needed when config changes
```

For detailed deployment guides including clearnet mirrors, private nodes, and monitoring that does not log user queries, see [`docs/deployment.md`](docs/deployment.md).

---

## Signing Transactions

The editor exports a **sign bundle** — JSON with `"protocol": "samizdat-sign-bundle"`, `"unsigned": true`, the raw transaction hex, and per-input metadata (outpoint, satoshis, locking script). This is the primary, wallet-agnostic signing format.

**Recommended (browser, offline):**

1. Copy the sign bundle from the export step (COPY BUNDLE) or click OPEN SIGNER.
2. Open **`sign.html`**, paste the bundle and your WIF, click Sign.
3. Broadcast the signed hex via any BSV tool; paste the resulting **txid** back into the editor.

**CLI alternative:**

```bash
echo "$WIF" | npx tsx scripts/sign-tx.ts \
  --tx <unsigned-hex-from-bundle> \
  --sats <input-satoshis-from-bundle> \
  --script <locking-script-hex-from-bundle>
```

The script reads the WIF from stdin (avoids shell history). It uses `@noble/curves/secp256k1` for BIP143 signing with SIGHASH_FORKID (0x41), which is required for BSV.

**Optional:** if you enter ElectrumSV xpub/derivation in the UTXO form, an Electrum-specific incomplete JSON export appears under a collapsible section. Do **not** paste raw unsigned hex into ElectrumSV — empty scriptSig is valid unsigned format, but many wallets treat plain hex as already signed.

**Security note:** Never paste a WIF into the main editor publish flow. Use `sign.html` (separate page) or the CLI tool so key material stays out of the publish UI.

---

## Testing

```bash
npm test                   # 328 unit tests (Vitest)
npm run test:watch         # watch mode
npm run test:coverage      # coverage report
npm run typecheck          # tsc --noEmit (core)
npm run editor:typecheck   # tsc --noEmit (editor)

npm run e2e                # 20 Playwright E2E tests (editor publish flow)
npm run generate-vectors   # regenerate src/test-vectors/vectors.json
```

### Test coverage (representative)

| Area | Tests | What is covered |
|---|---|---|
| Hash / Merkle / Chunker | 41 | Domain-separated SHA-256, Merkle tree, chunk splitting |
| Manifest | 32 | Builder, strict validator, required fields |
| Transaction (`tests/tx/`) | 83 | Builder, encoding, fees, sign bundle, raw tx, script |
| Renderer (`tests/renderer/`) | 72 | Sanitize, PDF strip, handler, markdown serve, integration |
| Chain | 13 | WoC reader, TxChunkSource |
| Editor | 23 | Markdown, publish, MIME/zip |
| Indexer + vectors | 30 | Scan, API, committed hash vectors |
| E2E (`tests/e2e/`) | 20 | IDLE→RECEIPT flow, privacy invariants, guide panel |

### Test vectors

`src/test-vectors/vectors.json` contains committed, fixed inputs with known root hashes. These are the reproducibility guarantee for the protocol — any correct implementation must produce the same roots from the same inputs.

```bash
npm run generate-vectors   # regenerate from current implementation
```

If the generated file differs from the committed one, the implementation has diverged from the reference.

---

## Protocol Specification

The full protocol specification is in [`SPEC.md`](SPEC.md) (30 sections, ~1,100 lines). The reference renderer implements **`GET /tx/<anchor-txid>`** only; manifest-hash lookup is described in the spec for optional indexers and future renderers.

| Section | Topic |
|---|---|
| §2 | Core design principles |
| §4 | Threat model and adversaries |
| §7 | Canonical publish flow (7 stages) |
| §8 | Data model — file object, chunk object, manifest, publication record |
| §9 | Chunking specification — determinism, boundary rules, failure handling |
| §10 | OP_PUSHDATA handling — encoding, constraints, appropriate use |
| §12 | Privacy and anonymity rules — safe defaults, metadata stripping |
| §13 | Renderer specification — verification requirements, safety rules |
| §17 | Payment model — what is allowed, what is forbidden, refund logic |
| §20 | Verification rules — conditions for a valid published object |
| §30 | Naming discipline — canonical vocabulary |

---

## Hard Rules

These seven constraints hold in every layer and every future version. Violation of any one is a blocker, not a deferral.

1. **No browser extension in the publish flow** — ever. Extensions weaken anonymity, increase fingerprinting, and break Tor compatibility.

2. **No private key material in the browser** — ever. The editor exports unsigned transactions for external signing. There is no key import, no wallet UI, no signing inside the page.

3. **No anchor transaction until chunk hashes are verified** — the anchor tx is not built or exported until the author pastes the signed chunk tx hex and the client has re-hashed every chunk payload and confirmed it matches the declared chunk hash.

4. **Renderer refuses unverified content** — if any chunk hash fails or the Merkle root mismatches, the renderer returns a 422 and a clean error page. It never renders partially verified content.

5. **Document metadata stripped locally before hashing** — JPEG/PNG EXIF and PDF `/Info` metadata are stripped in the client before hashing. Office and other formats are **not** stripped automatically; the REVIEW step warns you to use ExifTool manually.

6. **Platform never custodies funds** — the authoring client never holds funds. The operator never pays for user publications. Each author pays their own fees from their own wallet.

7. **Transaction constructor is wallet-agnostic** — exports include a sign bundle (`samizdat-sign-bundle` JSON with hex + per-input metadata) compatible with `sign.html`, the CLI signer, or any external wallet. Optional ElectrumSV JSON is provided when xpub/derivation is supplied.

---

## Threat Model

SAMIZDAT explicitly considers the following adversaries:

- **Network observers** — mitigated by Tor Browser + onion service (no clearnet IP exposure)
- **Browser fingerprinting** — mitigated by no extensions, no third-party assets, CSP `connect-src 'none'`
- **Malicious hosting operators** — mitigated by content-addressed verification (every byte is hashed before rendering)
- **Malicious indexers** — mitigated by non-canonical status (`"canonical": false` on all results)
- **Chain reorganization** — acknowledged; the protocol notes txids and block heights; manifests survive reorgs as long as the data remains retrievable
- **Metadata deanonymization** — mitigated by automatic EXIF/PDF stripping, manual Office warnings, and privacy checklist in the REVIEW step
- **Fee manipulation** — mitigated by fee estimation displayed before confirmation; author controls their own UTXO
- **Malformed manifests** — mitigated by strict validator that rejects manifests with missing mandatory fields

**Chain API visibility** — when the renderer queries WhatsOnChain or Bitails to fetch transactions, those services can log the queried txids, timing, and the renderer's IP. For operators running a public renderer, this means WoC/Bitails can observe which content is being read and when. Mitigation: run the renderer with `CHAIN_SOURCE=node` pointing to a self-hosted BSV node (`BSV_NODE_HOST` / `BSV_NODE_PORT` / `BSV_NODE_USER` / `BSV_NODE_PASS`), or route chain queries through Tor if using a third-party API.

What the protocol does **not** protect against:

- Timing correlation attacks at the network level (not specific to this protocol)
- Reused pseudonyms or payment patterns that correlate activity (documented in `docs/opsec-guide.md`)
- Browser vulnerabilities unrelated to this application

---

## Manifest Format

A manifest is a JSON object. All mandatory fields must be present; the validator rejects any manifest missing them.

```jsonc
{
  "version": "1",
  "authorMode": "anonymous",        // "anonymous" | "pseudonymous" | "signed"
  "publicationMode": "onchain",      // "onchain" | "hybrid"
  "fileTree": [
    {
      "filename": "article.md",
      "contentType": "text/markdown",
      "size": 4096,
      "hash": "e3b0c44298fc1c149afb...",   // SHA-256 of full file bytes (pre-chunking)
      "chunks": [
        { "index": 0, "size": 3717, "hash": "a665a45920422f9d417e..." },
        { "index": 1, "size": 379,  "hash": "b94f6f125c79e3..." }
      ]
    }
  ],
  "chunkTree": [
    {
      "index": 0,
      "size": 3717,
      "hash": "a665a45920422f9d417e..."
    },
    {
      "index": 1,
      "size": 379,              // true byte length — final chunk is never padded
      "hash": "b94f6f125c79e3..."
    }
  ],
  "rootHash": "3fdba35f04dc8c462986...",   // Merkle root over all chunkTree leaf hashes
  // Optional fields (set after anchor broadcast):
  "txidAnchor": "f4184fc596403b9d638...",
  "title": "On Censorship Resistance",
  "subtitle": "A technical analysis",
  "tags": ["privacy", "bsv", "protocol"],
  "language": "en",
  "createdAt": "2026-06-26T00:00:00Z",
  "previousManifest": null,
  "rendererHints": {}
}
```

### Hashing

All hashes use SHA-256 with domain separation to prevent second-preimage attacks:

- **Leaf hash**: `SHA-256("SAMIZDAT_LEAF_1:" || chunk_bytes)`
- **Interior node hash**: `SHA-256("SAMIZDAT_NODE_1:" || left_hash || right_hash)`
- **Odd levels**: the last node is duplicated before hashing (defined explicitly in `src/core/merkle.ts`)

---

## Transaction Encoding

Chunk payloads and the manifest anchor are encoded as **data-carrier P2PKH outputs** using the `<PUSHDATA(blob)> OP_DROP <P2PKH>` script pattern. The data blob is pushed and immediately dropped; the remaining P2PKH suffix is spendable by the author's key. Each data-carrier output carries 1 satoshi.

The durability of anchored data depends on chain infrastructure retaining transaction history. OP_PUSHDATA encoding is used because it is the established BSV data-carrier pattern and is indexed by block explorers such as WhatsOnChain and Bitails.

The transaction output structure (data carrier first, change second):

```
Output 0: <PUSHDATA(blob)> OP_DROP OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG   (data carrier, 1 sat)
Output 1: OP_DUP OP_HASH160 <pubKeyHash> OP_EQUALVERIFY OP_CHECKSIG                            (change)
```

The blob is encoded using `OP_PUSHDATA1` / `OP_PUSHDATA2` / `OP_PUSHDATA4` depending on payload size (`src/tx/script.ts` — `writePushData`). Chunk size limits are governed by current BSV miner policy — verify limits before deployment; do not assume legacy Bitcoin push caps apply.

The anchor output blob contains:
- Protocol marker: `SMZD` (4 bytes)
- Record type + version (2 bytes)
- Manifest hash (32 bytes)
- Merkle root (32 bytes)
- Chunk txids JSON (variable length)
- Full manifest JSON (variable length)

Full encoding details: [`docs/bsv-integration.md`](docs/bsv-integration.md).

---

## Verification Flow

A reader verifying a published document:

```
1. Obtain the anchor txid (from the publication receipt)
2. Open GET /tx/<anchor-txid> on a compatible renderer
3. Renderer fetches the anchor tx from the BSV chain
4. Renderer decodes the SMZD blob: manifest hash, root hash, chunk txids, embedded manifest
5. Renderer validates manifest schema and checks embedded manifest hash
6. For each chunk in manifest.chunkTree order:
   a. Fetch chunk tx using txid from anchor payload
   b. verifyChunkData(chunk.data, chunk.hash) — must pass
7. verifyMerkleRoot(manifest) — must pass
8. Reconstruct file tree from verified chunks
9. Sanitize HTML / render markdown / strip EXIF / serve PDF as attachment
10. Serve content on success, or return 422 with an error page on any failure
```

If any verification step fails, the renderer returns **422 Unverified Content**. It never presents partially verified content.

---

## Contributing

The protocol is designed to be forked, extended, and independently implemented.

**Running the tests before opening a PR:**
```bash
npm test && npm run typecheck && npm run e2e
```

**Areas most useful for contribution:**

- Additional `ChunkSource` implementations (IPFS, BitTorrent, Filecoin, S3)
- Alternative renderer implementations (Python, Go, Rust)
- Indexer improvements (full-text search, tag filtering, multi-language)
- Editor improvements (bundle composer, static site mode, evidence pack mode)
- Packaging for Tails OS and Whonix
- Additional language translations for the guide panel

The protocol spec (`SPEC.md`) documents what is mandatory versus optional. Any implementation that passes the test vectors in `src/test-vectors/vectors.json` is a compliant implementation.

---

## Support

SAMIZDAT is free, open-source software. No tracking, no telemetry, no ads.

**Monero (XMR)** — recommended for privacy:
```
4Av1J2bZdvkes5j9ZFLZhuRoKHwK4HmyrdHywAKoVSZzEW6RQ3mq7JpWExNiBMxYSRFTvv2ygWNCaTASZbnpUJAo8Fs6BGQ
```

**Bitcoin (BTC):**
```
bc1qeupr8q5lpft4zy2fagtvly7eqjy2crqk7g979s
```

All donations go directly to protocol development.

---

## License

Open source. See repository for license terms.

The protocol specification (`SPEC.md`) and test vectors (`src/test-vectors/vectors.json`) are placed in the public domain — implement them freely, in any language, for any purpose.
