// In-editor user guide — rendered as static HTML, no network requests, CSP-compliant.
// All content is hardcoded; no external links are clickable (connect-src 'none' enforced by CSP).

export const SAMPLE_MARKDOWN = `# SAMIZDAT — Anonymous Publishing on the Blockchain

*There is no kill switch in this protocol.*

Every platform you have ever published on has one. Domain registrars can cancel domains. Payment processors can close accounts. CDNs can terminate contracts. Hosting companies comply with takedown orders. Even "decentralized" platforms often depend on a handful of infrastructure providers who can be pressured.

**SAMIZDAT removes the kill switch from the points that matter most.**

---

## What this is

**SAMIZDAT** is an open protocol and reference implementation for **anonymous, non-custodial, onion-first content publishing** anchored on the BSV blockchain.

You write your content locally. The editor running inside **Tor Browser**, on an **.onion address**, hashes your content, splits it into chunks, and builds a **Merkle tree** over those chunks. It produces **unsigned transaction hex**. You sign that hex in **your own wallet**, outside the browser. You broadcast it yourself.

The editor **never holds your keys**. The operator **never holds your funds**. The anchor is **permanent** on the blockchain. Any person running a compatible **renderer** can reconstruct and verify your document **independently**.

> **The promise:** Anyone can publish content anonymously, pay for their own publication, anchor it on BSV, and let any community member independently render or index it — without trusting a single operator.

---

## What it does

1. **Local authoring** — You write Markdown, HTML, PDFs, images, or file bundles in the browser. Nothing is uploaded to a server during preparation.

2. **Deterministic chunking** — Content is split into chunks. Each chunk is hashed with SHA-256 (domain-separated leaf hashing). A binary Merkle tree produces a **root hash** that commits to the entire document byte-for-byte.

3. **Unsigned transactions only** — The client builds chunk transaction(s) and an anchor transaction. You export a **sign bundle**, sign via **sign.html** or the CLI, and broadcast. No in-browser wallet on the publish page. No browser extension.

4. **Fail-safe publish order** — Chunk transactions are broadcast and **hash-verified first**. The anchor transaction is built **only after** every chunk hash is confirmed. A failed or partial publish cannot consume funds for an anchor that references missing or corrupt data.

5. **Stateless verification** — A renderer accepts an **anchor txid** (path /tx/ plus the 64-character txid), fetches on-chain data, re-hashes every chunk, checks the Merkle root, and only then serves safe HTML or downloads. If verification fails, it shows an error page. **No partial content is ever presented as verified.**

6. **Metadata stripping** — JPEG/PNG EXIF and PDF /Info metadata are stripped locally before hashing. You are warned about Office documents and other formats that may still carry identifying metadata.

7. **Optional discovery** — Indexers and directory pages may exist. They are **never canonical**. No indexer is authoritative. Mirrors are mirrors, not source of truth.

---

## What it is not

This is **not a platform**. There are no accounts. There is no login. No operator can de-platform you because there is no platform to be removed from.

This is **not a storage service**. The protocol does not guarantee data availability — you must ensure your content is retrievable (mirrors, indexers, IPFS bridges). The **anchor is permanent**; the **data is your responsibility**.

This is **not anonymous by default**. Anonymity requires Tor Browser, a fresh wallet funded without KYC linkage, and careful operational security. The protocol provides the **infrastructure**. The **opsec is yours**.

This is **not irreversible in the human sense** — once broadcast, the anchor and chunk data are on-chain. **There is no delete.** Verify everything before you sign.

---

## The guarantee

A **content-addressed Merkle root** means any correct renderer will either:

- reproduce your document **exactly** (byte for byte), or
- **refuse** to render it at all.

There is no partial trust. There is no "close enough." The hash either matches or it does not.

---

## Core values (non-negotiable)

| Principle | What it means |
|-----------|---------------|
| **Onion-first** | The primary path works in Tor Browser over .onion. Clearnet reveals your IP to the server operator. |
| **No extensions** | Browser extensions are forbidden in the publish flow. They weaken anonymity and break Tor compatibility. |
| **Non-custodial** | The operator never holds funds, never pays for your content, never signs on your behalf. |
| **Local-first** | Hashing, chunking, manifest building, and fee estimation happen in your browser before any irreversible step. |
| **Replaceability** | Editor, renderer, indexer, and directory are all independently replaceable. Remove one; the protocol survives. |
| **Content-addressed truth** | The manifest hash and on-chain anchor are canonical. Everything else is implementation detail. |
| **Minimal trust** | You do not need to trust a single operator, indexer, or storage backend. You verify the hashes yourself. |
| **Fail-safe money** | No anchor is built until every chunk is retrieved and hash-verified. Failed publishes must not leak funds. |

---

## How publishing works (ten steps)

Write → Prepare → Review → Confirm → Export chunks → Collect txids → Verify chunks → Export anchor → Collect anchor txid → Verify → Receipt

Each step is explicit. You see the chunk count, root hash, fee estimate, and full manifest JSON before you commit. You enter your own **UTXO** (the unspent output that pays the miner fees). You sign externally. You paste back the txids. The editor verifies locally before moving forward.

**Publication is irreversible.** Treat the REVIEW step as final.

---

## Architecture (five layers)

Authoring client → Chunking engine → Your wallet signs → BSV anchor → Renderer (Indexer optional)

1. **Authoring client** — static web editor; zero third-party assets; strict CSP
2. **Chunking engine** — deterministic chunking, hashing, Merkle tree, manifest
3. **Publication anchor** — unsigned txs exported as sign bundles; you sign via sign.html or CLI
4. **Renderer** — stateless; verifies all hashes; safe HTML only
5. **Indexer** — optional; never canonical; no IP logging in the reference design

---

## Signing your transaction

After the editor builds your transactions:

1. Copy the **sign bundle** from the export step — it is JSON marked unsigned: true with the input data any signer needs.
2. Open **sign.html** (linked from the export step), paste the bundle and your WIF, click Sign.
3. Broadcast the signed hex via any BSV tool, then paste the **txid** back into the editor.

Do **not** paste raw unsigned hex into a wallet. Empty scriptSig is valid unsigned Bitcoin format, but ElectrumSV and others treat plain hex as already signed — that is a wallet limitation, not a bug in the transaction bytes.

Alternatively: scripts/sign-tx.ts with the hex and satoshis from the bundle, or optional ElectrumSV JSON if you filled in xpub/derivation in the UTXO form.

---

## The name

*Samizdat* (Russian: **самиздат**) was the practice of clandestine self-publishing under Soviet censorship — citizens typed manuscripts, carbon-copied them, and passed copies hand-to-hand to evade state control. The text survived because **no single point could kill it**.

This protocol is its digital successor: content addressed by hash, anchored on a blockchain, retrievable by anyone who runs a verifier — with **no single point of failure** and **no single operator in control**.

---

## Threat model (honest)

**SAMIZDAT mitigates:**

- Network observers → Tor + onion
- Malicious operators → content-addressed verification
- Malicious indexers → non-canonical by design
- Metadata leaks → local stripping + privacy warnings
- Partial/corrupt publishes → fail-safe chunk-before-anchor ordering

**SAMIZDAT does not magically fix:**

- Reused wallets or addresses linking your publications
- KYC-linked funding sources
- Timing correlation at the network level
- Your own metadata in the prose (names, places, writing style)

Evaluate your threat model honestly. The protocol gives you tools. **You** supply the discipline.

---

## Get it

The reference implementation is **open source**. The protocol specification is public. Any correct implementation that passes the test vectors is a compliant implementation.

- Implement it freely, in any language, for any purpose.
- Run your own editor, renderer, indexer, or mirror.
- No permission required.

---

## This post

This document is the **first publication** on this SAMIZDAT instance — published with SAMIZDAT itself.

**Verified by hash. Censored by no one.**

---

*Published with SAMIZDAT. If you are reading this through a renderer, every chunk hash and the Merkle root were checked before these words reached your screen.*
`;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function section(title: string, body: string): string {
  return `
    <div class="sz-section">
      <div class="sz-section-head">${esc(title)}</div>
      <div class="sz-section-body sz-guide-body">${body}</div>
    </div>`;
}

function step(n: number, text: string): string {
  return `<div class="sz-guide-step"><span class="sz-guide-step-num">${n}</span><span>${text}</span></div>`;
}

function code(text: string): string {
  return `<code class="sz-guide-code">${esc(text)}</code>`;
}

function codeBlock(text: string): string {
  return `<pre class="sz-guide-pre">${esc(text)}</pre>`;
}

function checkItem(text: string): string {
  return `<li class="sz-privacy-item"><span class="sz-privacy-icon sz-unverified">[ ]</span><span>${text}</span></li>`;
}

export function renderGuide(): string {
  return `<div class="sz-guide-panel">
    <div class="sz-guide-header">
      <span class="sz-guide-title">SAMIZDAT — Getting Started Guide</span>
      <button class="sz-btn sz-btn-secondary" id="guide-close-btn">Close Guide</button>
    </div>

    <div class="sz-guide-scroll">

      ${section('§1 — Getting started on Tor', `
        <p>The editor is designed to run inside <strong>Tor Browser</strong>. Always access it via an <strong>.onion address</strong> — never via a clearnet URL. A clearnet URL reveals your IP address to the server operator regardless of what browser you use.</p>
        <div class="sz-guide-steps">
          ${step(1, 'Download Tor Browser from <strong>torproject.org</strong> (type this address manually in your normal browser). Verify the signature before installing.')}
          ${step(2, `Open Tor Browser. Click the Shield icon → <strong>Advanced Security Settings</strong> → set level to <strong>Safer</strong>. The editor is built to run at this level.`)}
          ${step(3, 'Connect to Tor. Navigate to the editor\'s <strong>.onion address</strong> — your operator should give you this. Never use a clearnet mirror for publishing.')}
          ${step(4, 'Open the browser console (F12) and confirm zero requests appear outside the .onion address. No clearnet host should ever appear in the network tab.')}
        </div>
        <div class="sz-warn-block sz-mt-sm">
          <div class="sz-warn"><span class="sz-warn-label">Important</span> — If any step requires a browser extension, stop immediately. That is a hard protocol violation. SAMIZDAT requires no extensions.</div>
        </div>
      `)}

      ${section('§2 — Getting BSV without KYC linkage', `
        <p>Every chunk and anchor transaction must be funded with BSV. The wallet you use broadcasts those transactions, so its IP address and address history are observable. Use BSV that is not linked to your identity.</p>
        <p><strong>Do not</strong> use a regulated exchange that required identity verification (KYC). Those records can be subpoenaed and link your wallet to your name.</p>

        <div class="sz-section-head" style="margin-top:1rem;font-size:0.85rem">Option A — Faucets (free, tiny amounts — enough for a first post)</div>
        <p style="font-size:0.85rem;margin:0.4rem 0 0.6rem">A single SAMIZDAT publication costs roughly <strong>100–2 000 satoshis</strong> in miner fees at the current <strong>100 sat/KB</strong> rate (shown precisely in the REVIEW step). Faucets cover this easily.</p>
        <div class="sz-guide-steps">
          ${step(1, '<strong>bsvfaucet.net</strong> — mainnet BSV faucet. Visit the site, enter your receiving address, and claim. Funded by community donations; balance varies.')}
          ${step(2, 'If bsvfaucet.net is empty, search "BSV faucet" in the r/bitcoinsv or bitcointalk.org communities — community members periodically run ad-hoc faucets.')}
        </div>
        <p class="sz-guide-note" style="margin-bottom:0.8rem">Faucets give you just enough to publish. They are not a long-term funding strategy. Do not request more than you need.</p>

        <div class="sz-section-head" style="margin-top:1rem;font-size:0.85rem">Option B — Swap existing crypto, no registration (recommended)</div>
        <p style="font-size:0.85rem;margin:0.4rem 0 0.6rem">If you already hold any cryptocurrency (BTC, XMR, ETH, etc.) you can swap directly to BSV without creating an account.</p>
        <div class="sz-guide-steps">
          ${step(1, '<strong>ChangeHero</strong> (changehero.io) — registration-free swap. Choose your source coin → BSV, paste your fresh BSV wallet address, send. No account required.')}
          ${step(2, 'Use a fresh BSV address generated from a wallet that has never been associated with your identity. The swap service sees your source-chain address and the BSV destination.')}
        </div>

        <div class="sz-section-head" style="margin-top:1rem;font-size:0.85rem">Option C — Exchange with minimal KYC</div>
        <div class="sz-guide-steps">
          ${step(1, '<strong>MEXC</strong> — lists BSV and allows withdrawals up to a daily limit without mandatory identity verification. Suitable if you need more than faucet amounts.')}
          ${step(2, 'Withdraw immediately to your fresh wallet. Do not leave funds on any exchange.')}
        </div>

        <div class="sz-section-head" style="margin-top:1rem;font-size:0.85rem">All options — wallet hygiene</div>
        <div class="sz-guide-steps">
          ${step(1, 'Use a <strong>fresh wallet</strong> for each publication identity. Do not reuse a wallet that has been used for identified purchases — address reuse links transactions.')}
          ${step(2, 'Fund the wallet and confirm the funds are spendable before starting the publish flow. The REVIEW step shows how many satoshis you need (BSV miners charge about <strong>100 satoshis per KB</strong> of transaction size).')}
        </div>
        <p class="sz-guide-note">There is no perfect approach. Evaluate your threat model honestly. The opsec guide (docs/opsec-guide.md) covers this in depth.</p>
      `)}

      ${section('§3 — Setting up ElectrumSV (recommended wallet)', `
        <p><strong>ElectrumSV</strong> is an open-source BSV desktop wallet. It is the most capable wallet for signing raw unsigned transactions, which is what SAMIZDAT produces.</p>
        <div class="sz-guide-steps">
          ${step(1, 'Download ElectrumSV from <strong>electrumsv.io</strong> — verify the signature before running.')}
          ${step(2, 'Create a new Standard wallet. <strong>Write down the 12-word seed phrase on paper and store it offline.</strong> Never photograph it or store it in cloud.')}
          ${step(3, 'Go to the <strong>Addresses</strong> tab to find a receiving address, or click <strong>Receive</strong> to generate one. This is the address you will fund.')}
          ${step(4, 'Send BSV to that address from your anonymous source. Wait for confirmation before starting a publication.')}
        </div>
      `)}

      ${section('§4 — How to fund a publication', `
        <p><strong>What is a UTXO?</strong></p>
        <p>A UTXO ("unspent transaction output") is a specific amount of BSV sitting at a specific address in your wallet — like a banknote with a serial number. You need to tell SAMIZDAT <em>which banknote to use</em> to pay the publication fees.</p>
        <p>Each UTXO has four properties you need to enter into the editor:</p>
        <ul class="sz-privacy-list" style="margin-top:0.5rem">
          <li><strong>Transaction ID (txid)</strong> — 64 hex characters identifying the transaction that created this banknote.</li>
          <li><strong>Output index (vout)</strong> — which output in that transaction is yours (0 = first output, 1 = second, etc.).</li>
          <li><strong>Amount (satoshis)</strong> — how many satoshis this output is worth. 1 BSV = 100,000,000 satoshis.</li>
          <li><strong>Locking script hex (P2PKH)</strong> — a hex string describing how to spend the output. For a standard BSV address it looks like ${code('76a914…88ac')} (50 hex characters).</li>
        </ul>

        <p class="sz-guide-note sz-mt">You only need one UTXO that is larger than the estimated fee shown in the editor. If you have multiple small UTXOs, you may need to combine them in your wallet first (ElectrumSV: Coins tab → select multiple → right-click → Send to self).</p>

        <div class="sz-section-head" style="margin-top:1rem;font-size:0.85rem">Finding your UTXO in ElectrumSV</div>
        <div class="sz-guide-steps sz-mt-sm">
          ${step(1, 'Open ElectrumSV. Go to <strong>View → Coins</strong> (or press Ctrl+U). Each row in the Coins tab is one UTXO.')}
          ${step(2, 'Find a UTXO with a value in satoshis large enough to cover the fee shown in the editor (usually a few hundred to a few thousand satoshis for a small document). Click the row to select it.')}
          ${step(3, 'You can see the <strong>Transaction ID</strong> and <strong>Output index</strong> in the columns. Right-click the row and choose <strong>Copy script pubkey</strong> to copy the locking script hex.')}
          ${step(4, 'Paste these four values into the UTXO form in the CONFIRM step of the editor.')}
        </div>

        <div class="sz-section-head" style="margin-top:1rem;font-size:0.85rem">Finding your UTXO from the command line</div>
        <div class="sz-guide-steps sz-mt-sm">
          ${step(1, 'If you have a BSV node with RPC access, run:' + codeBlock('bitcoin-cli getrawtransaction <txid> 1 | jq \'.vout[]\''))}
          ${step(2, 'Each entry shows an output with its value and scriptPubKey hex. Match the output index to the one holding your funds.')}
        </div>

        <div class="sz-section-head" style="margin-top:1rem;font-size:0.85rem">If the UTXO amount is less than the estimated fee</div>
        <p>The editor will show an error during transaction building. You have two options:</p>
        <ul class="sz-privacy-list">
          <li>Use a larger UTXO from a different address in your wallet.</li>
          <li>Combine small UTXOs in ElectrumSV: select multiple UTXOs in the Coins tab, right-click → <strong>Send to self</strong>. This creates a single larger UTXO in the same wallet.</li>
        </ul>

        <div class="sz-section-head" style="margin-top:1rem;font-size:0.85rem">If the broadcast fails</div>
        <p>Nothing irreversible has happened until you successfully broadcast the anchor transaction. If a chunk transaction fails to broadcast:</p>
        <ul class="sz-privacy-list">
          <li>No funds have left your wallet yet (the transaction was never accepted by the network).</li>
          <li>You can retry with the same unsigned hex, or go back and re-enter a different UTXO.</li>
          <li>Only after all chunk txids are collected and verified will the editor build the anchor transaction.</li>
        </ul>
        <p class="sz-guide-note">A failed broadcast is always safe to retry. The editor never builds the anchor until all chunk hashes are confirmed.</p>
      `)}

      ${section('§5 — Signing transactions (sign bundle + sign.html)', `
        <p>The editor exports a <strong>sign bundle</strong> — JSON with <code>"unsigned": true</code> plus the hex and input metadata. This is wallet-agnostic. Raw unsigned hex alone is not: wallets like ElectrumSV treat empty scriptSig as already signed.</p>
        <div class="sz-guide-steps">
          ${step(1, 'Copy the <strong>sign bundle</strong> from the EXPORT step (COPY BUNDLE), or click OPEN SIGNER.')}
          ${step(2, 'In <strong>sign.html</strong>, paste the bundle and your WIF private key. Click Sign. Your key never leaves the page.')}
          ${step(3, 'Copy the signed hex. Broadcast via any BSV wallet, explorer, or node.')}
          ${step(4, 'Paste the returned txid back into the editor and continue.')}
        </div>
        <div class="sz-notice sz-mt-sm">
          Optional: if you entered ElectrumSV xpub/derivation in the UTXO form, an Electrum-specific JSON export appears under a collapsible section. Otherwise use sign.html or <code>scripts/sign-tx.ts</code>.
        </div>
      `)}

      ${section('§6 — Signing transactions: CLI script path (advanced)', `
        <p>For users who prefer a terminal, airgap-friendly, or fully auditable signing workflow. The script runs offline and never makes network requests.</p>
        <p class="sz-guide-note">Requires <strong>Node.js 20+</strong> and the SAMIZDAT repository cloned locally.</p>
        <div class="sz-guide-steps">
          ${step(1, 'Clone the SAMIZDAT repository and run ' + code('npm install') + ' to install devDependencies (includes the signing library).')}
          ${step(2, 'Export the unsigned transaction hex from the editor. Also note the UTXO satoshis and locking script hex — you entered these in the CONFIRM step.')}
          ${step(3, 'Run the signing script. The WIF private key is read from stdin to avoid shell history exposure:' + codeBlock(
            'echo "$WIF" | npx tsx scripts/sign-tx.ts \\\n' +
            '  --tx <unsigned_hex> \\\n' +
            '  --sats <utxo_satoshis> \\\n' +
            '  --script <locking_script_hex>'
          ))}
          ${step(4, 'The script outputs the signed transaction hex. Broadcast it using any BSV node, ElectrumSV (Tools → Broadcast Transaction), or a BSV block explorer\'s broadcast tool.')}
          ${step(5, 'Copy the returned txid and paste it into the editor.')}
        </div>
        <div class="sz-warn-block sz-mt-sm">
          <div class="sz-warn"><span class="sz-warn-label">WIF security</span> — Your WIF private key should only ever exist on a device you trust. Using an environment variable (' + code('$WIF') + ') keeps it out of your shell history. Do not paste your WIF key directly into a terminal command with <strong>--wif</strong> as a flag — it will be stored in your shell history.</div>
        </div>
      `)}

      ${section('§7 — Privacy checklist (before every publication)', `
        <p>Run through this before you broadcast anything.</p>
        <ul class="sz-privacy-list">
          ${checkItem('Using Tor Browser, accessing the editor via an .onion address — not clearnet.')}
          ${checkItem('BSV wallet used for this publication is fresh and not linked to your identity.')}
          ${checkItem('BSV was acquired without KYC linkage, or you have evaluated and accepted this risk.')}
          ${checkItem('Generic filenames used (e.g. document.md, file.txt) — no identifying names.')}
          ${checkItem('Title field is blank or uses a pseudonymous title that cannot be traced to you.')}
          ${checkItem('JPEG/PNG images: EXIF metadata stripped — the editor does this automatically.')}
          ${checkItem('PDF files: /Info metadata stripped — the editor does this automatically.')}
          ${checkItem('Office/LibreOffice documents: metadata stripped manually with ExifTool before upload.')}
          ${checkItem('Reviewed the manifest JSON in the editor before exporting any transactions.')}
          ${checkItem('All chunk transactions broadcast and verified before building the anchor transaction.')}
          ${checkItem('Publication receipt saved to an offline location not connected to cloud storage.')}
          ${checkItem('Not announcing this publication from any account linked to your identity.')}
        </ul>
        <p class="sz-guide-note sz-mt">Full threat model: see <strong>docs/opsec-guide.md</strong> in the SAMIZDAT repository.</p>
      `)}

    </div>
  </div>`;
}
