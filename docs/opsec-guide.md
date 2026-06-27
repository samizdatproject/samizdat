# SAMIZDAT Operational Security Guide

This guide covers threat modeling, operational security, and practical anonymity for SAMIZDAT publishers and node operators. It does not offer false reassurances. Read it before you publish.

---

## 1. How SAMIZDAT Works

SAMIZDAT is a protocol for publishing content on the BSV blockchain in a way that is cryptographically verifiable, pseudonymous by design, and censorship-resistant. Understanding what the protocol does — and does not — protect against is essential before using it.

**What the protocol does:**

- Hashes your content locally in your browser before anything leaves your machine.
- Builds a Merkle tree over chunk hashes so any reader can independently verify completeness and integrity.
- Exports unsigned transactions for you to sign and broadcast from your own wallet. The editor never holds keys, never pays fees, and never broadcasts anything.
- Anchors a manifest hash on-chain so that publication cannot be quietly altered or retracted.

**What the protocol does not do:**

- It does not hide the fact that you published. The anchor transaction is publicly visible on the BSV blockchain.
- It does not encrypt your content. Everything in chunk transactions is readable by anyone who fetches the transaction.
- It does not protect your IP address. That is your responsibility, addressed in section 2.
- It does not prevent correlation attacks based on transaction timing, amounts, or wallet history.

**Publication is permanent.** Once you broadcast the anchor transaction, the content hash and all chunk data are on the public blockchain forever. There is no delete. There is no appeal process. Verify everything locally before you broadcast.

---

## 2. Using SAMIZDAT Anonymously

### Use Tor Browser

The editor is designed to run in Tor Browser. Always access it via an onion address, never via a clearnet URL. A clearnet URL reveals your IP address to the server operator regardless of what browser you use.

If you are in a jurisdiction where Tor access is restricted, use a bridge. Do not assume clearnet HTTPS is sufficient.

### Use an anonymous BSV wallet

Your wallet broadcasts transactions. Every broadcast reveals your IP address to the node it connects to, and possibly to passive network observers. Use a wallet that:

- Connects exclusively via Tor, or
- Is accessed from a device that routes all traffic through Tor.

Do not use an exchange or custodial wallet. Custody and KYC linkage destroy the pseudonymity this protocol can provide.

### Acquire BSV anonymously

If you purchase BSV on a regulated exchange with identity verification, those records exist and can be subpoenaed. Strategies for reducing this exposure:

- Peer-to-peer purchase for cash (in person or through a service with no identity requirement)
- Mining (where available and practical)
- Receiving BSV as payment for goods or services

There is no perfect solution. Evaluate your threat model honestly.

### Funding a publication: what is a UTXO and where to find one

SAMIZDAT builds unsigned transactions that you sign in your own wallet. To build those transactions, the editor needs to know exactly which funds you plan to spend. In Bitcoin/BSV terminology, a specific chunk of money sitting at a specific address is called a **UTXO** — "unspent transaction output."

Think of a UTXO like a banknote with a serial number. Your wallet might contain several UTXOs of different sizes. You tell SAMIZDAT which one to use by providing four values:

- **Transaction ID (txid)** — the 64-character hex identifier of the transaction that originally put money into that address.
- **Output index (vout)** — which output in that transaction is yours (0 = first, 1 = second, and so on).
- **Amount (satoshis)** — how many satoshis this output contains. 1 BSV = 100,000,000 satoshis.
- **Locking script hex** — a hex string describing how the output can be spent. For a standard BSV address it always looks like `76a914…88ac` (50 hex characters total).

**Finding these values in ElectrumSV:**

1. Go to **View → Coins** (or Ctrl+U). Each row in the Coins tab is one UTXO.
2. Identify a UTXO with a value large enough to cover the fee shown by the editor (usually hundreds to a few thousand satoshis for a small document).
3. The Transaction ID and Output Index appear as columns in the Coins tab.
4. Right-click the row and choose **Copy script pubkey** to get the locking script hex.

**Finding these values from a block explorer:**

Look up your BSV address on a BSV block explorer. Find the transaction that funded your address and note the txid, vout, and value. The locking script can be copied from the transaction's output details.

**If your UTXO is too small:**

The editor will show an error if the UTXO satoshis are less than the fee estimate. You have two options:
- Use a different UTXO from a larger output.
- Combine small UTXOs in ElectrumSV: select multiple rows in Coins tab, right-click → **Send to self**. This creates a single larger UTXO.

**If the broadcast fails:**

Nothing irreversible has happened until the anchor transaction is successfully broadcast. If a chunk transaction fails:
- No funds have been deducted (the transaction was never accepted by the network).
- You can retry with the same unsigned hex using a different UTXO.
- The editor will not let you proceed to the anchor transaction until all chunk txids are verified.

A failed broadcast is always safe to retry. Keep the unsigned transaction hex until the publish is confirmed complete.

### Do not reuse addresses

Every wallet output you use as a UTXO in a SAMIZDAT chunk transaction links that transaction to your wallet. If you have previously used that wallet for identified purchases, the linkage exists. Use a fresh wallet for publication.

### Strip document metadata before uploading

The editor automatically strips EXIF metadata from JPEG and PNG images, and strips the `/Info` dictionary from PDFs. It does not strip metadata from:

- Microsoft Office documents (`.docx`, `.xlsx`, `.pptx`)
- LibreOffice documents (`.odt`, `.ods`, `.odp`)
- Audio and video files
- ZIP archives that contain files with embedded metadata

For these formats, strip metadata manually using [ExifTool](https://exiftool.org/) before dropping files into the editor:

```
exiftool -all= yourfile.docx
exiftool -all= yourfile.mp3
```

Verify the output before uploading. Author name, institution, software version, and creation timestamps embedded in documents have identified people who believed they were anonymous.

### Filenames and titles are public

The manifest stores filenames and the publication title in plaintext. These fields are on-chain forever. Use generic filenames (`document.md`, `file.txt`) and leave the title blank, or use a pseudonymous title that cannot be traced to you.

### Transaction timing

The time you broadcast a transaction is observable. If you publish consistently at the same time of day, or immediately after certain observable events, that pattern is metadata. Consider adding random delay between signing and broadcasting.

### Be aware of writing style

SAMIZDAT does not anonymize your writing. Stylometric analysis can identify authors from writing patterns, vocabulary, and sentence structure. If your threat model includes a technically sophisticated adversary, consider writing style as a potential deanonymization vector.

---

## 3. Running Your Own Node

### Why self-host

Self-hosted nodes give you control over your privacy and the privacy of users who access your node. A renderer or editor hosted by someone else can log query patterns, txids requested, and IP addresses. If you operate your own node accessible only via an onion service, the operator risk disappears.

### Server requirements

The renderer is a stateless HTTP service. It needs:

- A server running Node.js 20+ (a small VPS or a Raspberry Pi is sufficient)
- An onion service configured in Tor (see `docs/deployment.md`)
- A BSV node or public chain API access for fetching transactions

### Do not keep logs

Configure your HTTP server to write no access logs. If you run nginx or another reverse proxy in front of the renderer, disable access logging:

```nginx
access_log off;
error_log /dev/null;
```

If your host or VPS provider enables logging at the infrastructure level, evaluate whether that is acceptable for your use case. Some jurisdictions require operators to retain logs; operating in those jurisdictions is incompatible with protecting user privacy.

### Onion-only is recommended

A clearnet address for your renderer or editor reveals your server's IP address, which can be linked back to you through hosting records, TLS certificate transparency logs, and WHOIS data. Run onion-only where possible.

If you must expose a clearnet address (for accessibility reasons), be aware that this creates a permanent public record linking your infrastructure to SAMIZDAT operation.

### Keep software updated

The renderer, editor, and supporting libraries should be updated regularly. Security vulnerabilities in Node.js, the HTTP server, or the Tor daemon can expose user IP addresses even on an otherwise correctly configured node.

Subscribe to security advisories for:
- Node.js: nodejs.org/en/security
- Tor Project: blog.torproject.org

### CSP headers

The renderer enforces strict Content-Security-Policy headers on all responses. Do not modify these. The headers prevent rendered content from loading remote resources, which would break anonymity for readers.

```
Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'none'; frame-src 'none'; object-src 'none'; style-src 'self' 'unsafe-inline'; connect-src 'none'; base-uri 'self'
```

If you run a caching proxy in front of the renderer, ensure it passes these headers through unchanged.

---

## 4. Threat Model for Readers

Reading content from a SAMIZDAT renderer involves fewer risks than publishing, but is not risk-free.

### What the renderer knows about you

A renderer operated by a third party sees:

- Your IP address (if you are not using Tor)
- The txid you requested
- Timing of your request

If you access a renderer via Tor, the operator sees only your Tor exit node IP, not your real IP.

### What the chain reveals

The BSV blockchain is public. Anyone can see:

- Every chunk transaction and anchor transaction
- The content of every chunk (the data is not encrypted)
- Transaction timestamps (approximate; block time)
- Wallet addresses associated with chunk and anchor outputs

If you retrieve chunk transactions directly from a block explorer or BSV node rather than a renderer, the explorer or node sees your IP and the txids you requested.

### Verify before trusting

A renderer that does not verify hashes could serve you modified content silently. The Samizdat renderer will display a verification failure page if any hash check fails — it will never show you partial or unverified content.

Do not trust renderers that do not show verification status clearly. The verified/unverified distinction is the entire security model for readers.

---

## 5. What SAMIZDAT Does NOT Protect Against

Be explicit about the limits of this protocol.

### It does not provide confidentiality

Content is not encrypted. Every chunk transaction is readable by anyone. If you need your content to be readable only by specific people, you must encrypt it yourself before uploading and distribute decryption keys through a separate channel. SAMIZDAT does not handle key distribution.

### It does not protect against legal compulsion

If your wallet provider, hosting provider, or ISP is compelled by a legal authority to disclose records, those records may exist. The protocol cannot protect you from legal processes directed at infrastructure you do not control.

### It does not protect against a compromised device

If your computer is compromised by malware before you run the editor, your content, identity, and actions may be observable regardless of network-level anonymity.

### It does not hide publication metadata

The fact that you published something, the approximate time you published it, the size of the content, and the number of chunks are all observable on-chain. Only the author identity is pseudonymous, and that pseudonymity depends on how you manage your wallet and network connection.

### It does not prevent writing style analysis

Sophisticated adversaries use stylometric analysis to identify authors from text. If you write in a distinctive style, publish in multiple places using the same voice, or use rare vocabulary, that is a potential identification vector.

### It does not protect you if you tell someone

Operational security fails at the human layer more often than the technical layer.

---

## 6. Quick Reference Checklist

Use this before every publication.

### Before you start

- [ ] You are using Tor Browser and accessed the editor via an onion address.
- [ ] You have a fresh BSV wallet not linked to your identity.
- [ ] You acquired BSV without KYC linkage to your identity (or you have evaluated and accepted this risk).

### Content preparation

- [ ] Documents do not contain your name, institution, or other identifying metadata.
- [ ] JPEG/PNG images: EXIF stripped (editor does this automatically).
- [ ] PDF files: `/Info` dictionary stripped (editor does this automatically).
- [ ] Office/LibreOffice documents: metadata stripped with ExifTool manually.
- [ ] Filenames are generic and non-identifying.
- [ ] Title field is left blank or uses a pseudonymous title.
- [ ] Writing style does not uniquely identify you (if this is a concern for your threat model).

### Publication

- [ ] You reviewed the manifest hash in the editor before exporting transactions.
- [ ] You signed and broadcast chunk transactions before the anchor transaction.
- [ ] You verified chunk hashes in the editor before building the anchor transaction.
- [ ] You saved the publication receipt offline in a location not connected to cloud storage.

### After publication

- [ ] You have not announced your publication from an account linked to your identity.
- [ ] If you need to share the txid, you are doing so through a channel appropriate to your threat model.
- [ ] You understand that you cannot retract or modify what you have published.

---

*This guide reflects the protocol as implemented. If you find errors or omissions, open an issue or submit a pull request.*
