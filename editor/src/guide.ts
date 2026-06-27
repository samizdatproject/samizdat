// In-editor user guide — rendered as static HTML, no network requests, CSP-compliant.
// All content is hardcoded; no external links are clickable (connect-src 'none' enforced by CSP).

export const SAMPLE_MARKDOWN = `# Hello, SAMIZDAT

This is an anonymous publication anchored on the BSV blockchain.

## What you can write

Paragraphs of plain text with **bold**, *italic*, and ***bold italic*** emphasis.

## Lists

- Censorship-resistant publishing
- No accounts, no passwords, no tracking
- Verified by cryptographic hash, not by a server

1. Write your content locally
2. Build a Merkle tree over the chunks
3. Sign and broadcast — the editor never holds keys

## Code

Inline \`code\` works. So do fenced blocks:

\`\`\`
Content is hashed before it leaves your browser.
No plaintext crosses the network during authoring.
\`\`\`

## Images

Attach an image file alongside this document. Reference it by filename:

![A descriptive caption](photo.jpg)

PNG, JPEG, GIF, and WebP are supported. The editor strips EXIF metadata
from JPEG and PNG files automatically before hashing — no manual step needed.

## Blockquotes

> "Privacy is necessary for an open society in the electronic age."
> — A Cypherpunk's Manifesto, Eric Hughes, 1993

## What happens when you publish

Each file is split into chunks. A SHA-256 Merkle tree is computed over the chunk hashes.
The root hash is anchored to a BSV transaction — on-chain, permanent, and verifiable
by anyone with a copy of the manifest.

**Publication is irreversible.** There is no delete. Verify everything before you broadcast.
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
        <p style="font-size:0.85rem;margin:0.4rem 0 0.6rem">A single SAMIZDAT publication costs roughly 200–2 000 satoshis in miner fees. Faucets cover this easily. Availability depends on the faucet's current balance — try more than one if the first is empty.</p>
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
          ${step(2, 'Fund the wallet and confirm the funds are spendable before starting the publish flow. You need at least enough to cover fees (1 sat/byte is the BSV standard).')}
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

      ${section('§5 — Signing transactions: ElectrumSV path', `
        <p>After the editor builds an unsigned transaction, you must sign it in your wallet. Here is the ElectrumSV workflow.</p>
        <div class="sz-guide-steps">
          ${step(1, 'Copy the <strong>JSON</strong> transaction from the editor (EXPORT CHUNKS step). Click COPY. Do <em>not</em> paste raw hex — ElectrumSV treats plain hex with empty signatures as already signed.')}
          ${step(2, 'In ElectrumSV: go to <strong>Tools → Load Transaction</strong>. Paste the JSON. Status should show <strong>Unsigned</strong>. Verify inputs and outputs.')}
          ${step(3, 'Click <strong>Sign</strong>. If Sign is disabled, add your account xpub and derivation path in the UTXO form before building (optional fields). Alternatively use the CLI signer (<code>scripts/sign-tx.ts</code>).')}
          ${step(4, 'Click <strong>Broadcast</strong> (or go to Tools → Broadcast Transaction, paste the signed hex). ElectrumSV broadcasts to the BSV network and returns the txid.')}
          ${step(5, 'Copy the txid. Return to the editor and paste it into the txid input field. Continue to the next step.')}
        </div>
        <div class="sz-notice sz-mt-sm">
          Repeat this for each chunk transaction in order, then once more for the anchor transaction. <strong>Do not broadcast the anchor before all chunk txids are collected and verified.</strong>
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
