# BSV Anonymous Publishing Protocol (SAMIZDAT)

## 1. Purpose

SAMIZDAT is an open, self-hostable, onion-first publishing protocol for anonymous or pseudonymous publication of articles, static websites, PDFs, images, archives, and arbitrary file bundles on BSV.

The protocol’s purpose is not to create a centralized hosting platform. Its purpose is to provide a **censorship-resistant, content-addressed publication layer** anchored by BSV, with fully replaceable renderers, indexers, mirrors, and discovery services.

SAMIZDAT is designed so that:

* authors can publish without accounts,
* publication can be done through Tor Browser,
* the author pays their own publication costs,
* the system never assumes liability for user content,
* any community member can run their own renderer or indexer,
* the source of truth is the on-chain anchor plus the published manifest,
* no single service is required for retrieval or rendering,
* comments are optional and out of scope for the first version.

---

## 2. Core design principles

### 2.1 Onion-first

The primary user path must work in Tor Browser over an onion service.

### 2.2 No extension dependency

Browser extensions are forbidden in the critical publish flow. They weaken anonymity, increase fingerprinting, and break Tor compatibility.

### 2.3 Non-custodial

The platform must never take custody of user funds, never pool publishing fees, never promise to pay for user content, and never publish content on behalf of users without explicit final confirmation.

### 2.4 Local-first preparation

All content preparation must happen locally before any irreversible action:

* metadata stripping,
* chunking,
* hashing,
* manifest generation,
* optional encryption,
* fee estimation.

### 2.5 Replaceability

Any renderer, indexer, discovery service, mirror, or frontend can be replaced without breaking the protocol.

### 2.6 Content-addressed source of truth

The published manifest hash and on-chain anchor are the canonical identifiers. Everything else is an implementation detail.

### 2.7 Minimal trust

The protocol must not require trust in a single operator, a single indexer, or a single storage backend.

### 2.8 Fail-safe money handling

If staging or upload fails, the system must not broadcast a final anchor transaction. Failed publishes must not leak funds through partial irreversible actions.

---

## 3. Non-goals

SAMIZDAT is not intended to:

* be a social network,
* be a commenting platform in the first version,
* be a custodial wallet,
* be a hosting company,
* guarantee permanent availability of all content,
* promise that every renderer will always exist,
* promise that blockchain data will never be spendable,
* force one canonical indexer.

---

## 4. Threat model

### 4.1 Adversaries

Potential adversaries include:

* network observers,
* Tor exit observers where clearnet is used,
* browser fingerprinting systems,
* malicious hosting operators,
* malicious indexers,
* spam publishers,
* content takedown attempts,
* link rot and data loss,
* fee manipulation,
* metadata deanonymization,
* wallet or signing compromise,
* chain reorganization risk,
* malicious or malformed manifests,
* unsafe PDF/image/doc rendering attacks.

### 4.2 Security objectives

The system should aim to:

* keep author identity hidden by default,
* avoid browser fingerprinting,
* prevent central operators from seeing more than necessary,
* make manifests verifiable,
* make content retrieval possible from multiple independent sources,
* prevent accidental publication of malformed or incomplete bundles,
* avoid accidental money loss.

### 4.3 Important privacy caveat

Anonymity is only as strong as the weakest step. The protocol must assume that:

* browser extensions may leak identity,
* external assets may leak IP or user-agent,
* upload timing may leak information,
* document metadata may leak authorship,
* reused pseudonyms may correlate activity,
* payment patterns may be linkable.

---

## 5. User roles

### 5.1 Author

The person preparing and publishing content.

### 5.2 Reader

The person retrieving and verifying content.

### 5.3 Renderer operator

Anyone running a service that reconstructs content from manifests and BSV anchors.

### 5.4 Indexer operator

Anyone running a service that indexes manifests, txids, titles, tags, or hashes.

### 5.5 Mirror operator

Anyone storing or serving chunk data, manifests, or cached content.

### 5.6 Directory operator

Anyone maintaining a directory of compatible renderers, onion endpoints, documentation, or protocol versions.

No role is privileged by default.

---

## 6. System architecture

### 6.1 Components

SAMIZDAT consists of five independent layers:

1. **Authoring client**

   * web-based editor,
   * runs in Tor Browser,
   * prepares and validates content locally.

2. **Packaging and chunking engine**

   * turns content into deterministic chunks,
   * computes hashes,
   * builds the manifest.

3. **Publication anchor layer**

   * writes the final manifest anchor to BSV,
   * may use OP_PUSHDATA-based payloads where appropriate,
   * may include signatures or compact metadata.

4. **Renderer**

   * reconstructs and serves the content,
   * stateless where possible,
   * replaceable by anyone.

5. **Indexer / discovery layer**

   * optional,
   * indexes txids, hashes, titles, and tags,
   * never canonical.

### 6.2 Recommended topology

* Public users interact with an onion service.
* The onion service may proxy only the minimal APIs required.
* Rendering nodes may exist on onion and clearnet.
* Indexers may be public or private.
* The directory page may be hosted anywhere, including GitHub Pages, but never as a required trust anchor.

---

## 7. Canonical publish flow

### 7.1 Stage 1: Local preparation

The author uploads or writes content in the browser:

* text article,
* HTML bundle,
* PDF,
* images,
* ZIP/TAR archive,
* mixed media package.

The client immediately performs:

* MIME detection,
* metadata stripping for supported formats,
* normalization of line endings where appropriate,
* optional encryption,
* chunking,
* hashing,
* manifest creation,
* fee estimation.

### 7.2 Stage 2: Preview

The user sees a preview with:

* final title,
* optional abstract,
* file tree,
* size per file,
* total bytes,
* number of chunks,
* estimated on-chain cost,
* optional off-chain mirror cost if any,
* final publish path,
* final manifest root hash,
* privacy warnings,
* a clear note that the user is responsible for the content.

### 7.3 Stage 3: User confirmation

Nothing irreversible happens until the author explicitly confirms.

### 7.4 Stage 4: Funding

The author funds the publication transaction non-custodially.

The system must support one of the following models:

* direct wallet signing,
* external payment request,
* on-demand signed transaction template,
* pay-before-broadcast invoice flow.

The platform must never hold user funds in escrow unless it is strictly non-custodial and technically unavoidable, and even then only for a minimum ephemeral duration.

### 7.5 Stage 5: Chunk publication

Chunks are published or staged first.

If the storage design is on-chain only, chunk publication is the anchor transaction itself.
If a hybrid design is used, chunks may be mirrored externally as well.

### 7.6 Stage 6: Final anchor

The final manifest anchor transaction is broadcast only after all required chunks and hashes are locally verified.

### 7.7 Stage 7: Receipt

The author receives:

* txid,
* manifest hash,
* optional content URI,
* retrieval instructions,
* verification instructions,
* onion rendering link,
* optional public rendering link.

---

## 8. Data model

### 8.1 Content object

A content object is the smallest logical unit of publication. It may be:

* plain text,
* HTML document,
* CSS file,
* JavaScript file,
* image,
* PDF,
* video/audio object if supported later,
* bundled website root.

### 8.2 File object

Each file object contains:

* filename,
* content-type,
* byte length,
* SHA-256 or equivalent content hash,
* chunk references,
* optional original filename,
* optional sanitized filename,
* optional encryption metadata.

### 8.3 Chunk object

A chunk object contains:

* chunk index,
* chunk size,
* chunk hash,
* optional compression flag,
* optional encryption flag,
* payload reference.

### 8.4 Manifest object

The manifest is the root publication object. It contains:

* protocol version,
* author mode,
* publication mode,
* file tree,
* chunk tree,
* root hash,
* txid anchor,
* optional title,
* optional subtitle,
* optional tags,
* optional language,
* optional created-at time,
* optional expiry or versioning metadata,
* optional previous manifest reference,
* optional renderer hints.

### 8.5 Publication record

A publication record is the final metadata bundle used by renderers and indexers.

It should include:

* manifest hash,
* txid,
* block height if known,
* retrieval endpoints,
* verification metadata,
* optional author signature,
* optional signature algorithm identifier.

---

## 9. Chunking specification

### 9.1 Goals

Chunking must be:

* deterministic,
* reproducible,
* streamable,
* safe for large files,
* compatible with local validation,
* independent of any single backend.

### 9.2 Recommended approach

Use deterministic chunking on the client.

A suitable approach is:

* fixed-size chunks for simplicity,
* optional content-defined chunking for advanced deduplication,
* chunk hashes arranged into a Merkle tree or equivalent root hash structure.

### 9.3 Chunk boundary rules

Chunk boundaries must be deterministic for the same input and same protocol version.

Rules must specify:

* minimum chunk size,
* target chunk size,
* maximum chunk size,
* padding behavior for the final chunk,
* compression behavior,
* encryption behavior.

### 9.4 Recommended defaults

These can be tuned, but the protocol should define explicit defaults:

* small text files: no chunking unless needed,
* medium files: fixed-size chunking,
* large bundles: fixed-size chunking plus manifest tree,
* extremely large files: hierarchical manifests.

### 9.5 Failure handling

If any chunk fails validation:

* the bundle is incomplete,
* no final anchor should be published,
* the user must be told exactly what failed.

### 9.6 On-chain chunking possibility

If OP_PUSHDATA-based storage is used directly on BSV, the protocol must define how payloads are encoded as transaction data.

Important detail:

* do not assume a single push opcode,
* chunk sizing must be based on actual script limits and payload limits,
* chunk generation must adapt to the real byte size of the payload,
* the system must support multiple push encodings as required by size.

The protocol should treat OP_PUSHDATA as a transport encoding, not a trust model.

---

## 10. OP_PUSHDATA handling

### 10.1 Concept

OP_PUSHDATA can be used as a way to embed archival payloads directly into transaction scripts or script-like data carriers.

### 10.2 Important constraint

Do not promise permanence from OP_PUSHDATA alone.

A payload is only practically durable if:

* the output is intentionally left unspent,
* nodes keep historical transaction data,
* independent mirrors and archives exist,
* retrieval tooling can reconstruct content.

### 10.3 Protocol stance

If OP_PUSHDATA is used:

* it must be explicitly marked as archival data,
* the content hash must be published separately,
* the manifest must include the payload encoding details,
* chunk size must respect transaction limits,
* the system must not assume that spending behavior will never change.

### 10.4 Recommended use

OP_PUSHDATA is best suited for:

* compact payloads,
* manifests,
* metadata roots,
* compact articles,
* references to larger chunk trees.

It is not a magic answer for massive storage.

---

## 11. Storage models

### 11.1 On-chain only mode

All data is stored directly in BSV transactions.

Pros:

* simple truth model,
* direct anchoring,
* maximum chain-native portability.

Cons:

* potentially expensive,
* large payloads are inefficient,
* retrieval is harder,
* heavy burden on chain infra.

### 11.2 Hybrid mode

Anchor the manifest on BSV, store larger payloads in distributed or mirrored storage.

Pros:

* cheaper,
* easier to scale,
* better for PDFs and websites.

Cons:

* external storage can disappear,
* retrieval requires more than one backend.

### 11.3 Suggested default

Use hybrid mode for general publishing.
Use on-chain only mode for small, critical, or high-value payloads.

### 11.4 Storage providers

The protocol should support any of the following without depending on one of them:

* IPFS,
* Filecoin,
* Tahoe-LAFS,
* BitTorrent seed archives,
* S3 mirrors,
* rsync mirrors,
* self-hosted disk archives,
* public archive mirrors.

The format must remain portable across storage backends.

---

## 12. Privacy and anonymity rules

### 12.1 Default anonymity model

The default publication path should assume:

* Tor Browser,
* onion service,
* no login,
* no wallet account,
* no external dependencies.

### 12.2 Safe defaults

The system should:

* block remote resource loading by default,
* sanitize HTML,
* strip document metadata,
* disable telemetry,
* avoid third-party fonts and CDNs,
* avoid storing long-lived identifiers in cookies or localStorage unless explicitly necessary.

### 12.3 What hurts anonymity

The protocol must explicitly avoid or warn about:

* browser extensions,
* clearnet dependencies,
* analytics,
* payment widgets that leak browser fingerprints,
* cross-site scripts,
* reused email addresses,
* stable usernames,
* author-provided metadata in PDFs or Office files,
* external image hotlinks,
* remote JavaScript,
* social login,
* IP-based upload logs.

### 12.4 Anonymous modes

Support at least three modes:

**Mode A: Anonymous publication**
No account, no identity, no signature.

**Mode B: Pseudonymous publication**
Stable alias or pseudonym can be attached voluntarily.

**Mode C: Signed publication**
Optional author signature for provenance.

### 12.5 Metadata stripping

The authoring client should warn about and optionally strip:

* PDF metadata,
* EXIF,
* Office document metadata,
* embedded revision history,
* author fields,
* geolocation fields,
* hidden layers,
* tracking pixels,
* document templates that leak identity.

---

## 13. Renderer specification

### 13.1 Purpose

The renderer reconstructs content from the manifest and serves it for reading or download.

### 13.2 Requirements

A renderer must:

* accept a manifest hash or txid,
* retrieve the manifest,
* retrieve chunks from available sources,
* verify hashes before rendering,
* reconstruct the content tree,
* serve HTML safely,
* serve PDFs/downloads safely,
* handle missing chunks gracefully.

### 13.3 Stateless mode

A renderer should ideally be stateless except for cache.

### 13.4 Safety rules

For HTML rendering:

* sanitize scripts unless explicitly allowed in a trusted sandbox mode,
* block external fetches by default,
* prevent active content from escaping the renderer environment.

### 13.5 Preview mode

The renderer should support local preview before publication.

---

## 14. Indexer specification

### 14.1 Role

Indexers are optional discovery services that scan manifests and anchors.

### 14.2 Non-canonical status

No indexer is authoritative. The protocol must not depend on any one indexer.

### 14.3 Indexable fields

Suggested fields:

* txid,
* manifest hash,
* title,
* subtitle,
* tags,
* language,
* created time,
* content type,
* file names,
* block height,
* optional pseudonym,
* optional signatures.

### 14.4 Search model

Search can be full-text or metadata-only.
Search is convenience, not truth.

### 14.5 Fork tolerance

Different indexers may disagree on ranking or availability, but not on hash verification.

---

## 15. Directory and bootstrap site

### 15.1 Purpose

The directory site helps users discover compatible software and endpoints.

### 15.2 What it may contain

* protocol spec,
* reference implementation links,
* onion renderer links,
* indexer links,
* test vectors,
* format documentation,
* security warnings,
* deployment guides.

### 15.3 What it must not be

It must not be the only place the protocol works.

### 15.4 GitHub usage

GitHub Pages may host docs and reference UI, but the protocol must survive GitHub removal.

---

## 16. Frontend authoring tool

### 16.1 Purpose

A web-based editor lets users create and prepare content inside Tor Browser.

### 16.2 Required features

* plain text editor,
* markdown editor,
* HTML import,
* PDF upload,
* image upload,
* file tree view,
* bundle composer,
* preview pane,
* hash preview,
* chunk preview,
* fee estimate,
* privacy warnings,
* publish confirmation.

### 16.3 Editor modes

The editor should support:

* article mode,
* static site mode,
* file archive mode,
* evidence pack mode,
* anonymous note mode.

### 16.4 No extension dependency

All essential editing and publishing must work without browser extensions.

### 16.5 Client-side validation

The frontend must verify:

* file sizes,
* chunk hashes,
* manifest integrity,
* allowed file types,
* dangerous file contents where possible,
* publication fee sufficiency.

---

## 17. Payment model

### 17.1 Core rule

The author pays.
The platform does not pay for user content.
The platform does not absorb losses from user failures.

### 17.2 Why this matters

If the platform pays or guarantees costs, it inherits liability and can be abused as a free publishing relay for illegal, spam, or malicious content.

### 17.3 Allowed payment patterns

* direct wallet payment,
* user-signed transaction,
* one-time payment request,
* per-publication fee,
* optional prepaid balance controlled by the user only if non-custodial and technically safe.

### 17.4 Forbidden patterns

* centralized escrow for publication costs,
* platform-funded anchoring,
* content subsidies,
* pooled “publish anything” funds without explicit strict terms,
* automatic spending from a shared operator wallet for arbitrary user uploads.

### 17.5 Fee estimation

The system must estimate:

* transaction count,
* total bytes,
* payload size,
* required UTXOs if any,
* likely fee range,
* any hybrid storage cost if used.

### 17.6 Refund logic

Ideally, no irreversible action occurs until the user confirms.
If a preflight step fails, the system should never have consumed funds for the final anchor.
If a wallet or network failure occurs mid-flow, the failure mode should be explicit and safe.

---

## 18. Liability and abuse handling

### 18.1 User responsibility

The person publishing content is fully responsible for what they put on chain.

### 18.2 Platform responsibility

The platform only provides tools.
It does not claim ownership of content.
It does not endorse content.
It does not guarantee legality.
It does not store user files as a custodial archive unless explicitly configured as an independent mirror with clear operator policy.

### 18.3 Abuse controls

The protocol may include optional anti-abuse measures at the UI layer:

* rate limiting,
* proof-of-work for spam reduction,
* max upload size warnings,
* content type restrictions in public frontends,
* operator-defined policy rules.

These controls must never be baked into the protocol as central censorship points.

---

## 19. Versioning

### 19.1 Protocol versions

Every manifest must specify a protocol version.

### 19.2 Backward compatibility

Renderers should support older versions where feasible.

### 19.3 Upgrade strategy

New fields must be optional unless the version increment explicitly requires them.

### 19.4 Forks and variants

Different communities may implement variants. The reference implementation must document what is mandatory versus optional.

---

## 20. Verification rules

A published object is considered valid if:

* its manifest is syntactically valid,
* the hashes of all chunks match,
* the manifest root hash matches the anchored hash,
* the txid anchor is valid,
* any optional signature is valid,
* any optional encryption metadata is internally consistent.

The renderer must refuse to present unverifiable content as verified.

---

## 21. Recommended minimal MVP

### 21.1 MVP goal

Ship something useful quickly without pretending to solve everything.

### 21.2 MVP features

* onion-hosted web editor,
* markdown article publishing,
* PDF upload,
* image upload,
* deterministic hashing,
* manifest creation,
* BSV anchor,
* txid receipt,
* verification page,
* stateless renderer,
* simple public directory of nodes.

### 21.3 MVP exclusions

* commenting,
* accounts,
* social feeds,
* recommendation algorithms,
* complex search,
* ad systems,
* identity verification,
* custodial balances.

---

## 22. Recommended technical stack

The stack is intentionally flexible, but the reference implementation should use something practical and auditable.

### 22.1 Frontend

* static frontend,
* minimal JavaScript,
* no heavy framework dependency if avoidable,
* Tor-safe CSP,
* no third-party assets.

### 22.2 Backend

* API for uploads and anchoring,
* manifest builder,
* wallet integration layer,
* renderer service,
* optional indexer service.

### 22.3 Storage

* on-chain payloads for small objects or roots,
* hybrid distributed storage for larger files,
* pluggable backends.

### 22.4 BSV integration

Use whatever BSV toolchain is stable and auditable, but the protocol must not be locked to one SDK.

---

## 23. Deployment modes

### 23.1 Onion-only

For maximum anonymity.

### 23.2 Onion + clearnet mirror

For convenience and discovery.

### 23.3 Self-hosted private node

For organizations or researchers.

### 23.4 Federation of mirrors

Multiple independent nodes can host renderers and indexers.

---

## 24. Governance and openness

### 24.1 Open source requirement

All protocol specs, reference code, test vectors, and deployment tooling should be open source.

### 24.2 Independence

No operator should have exclusive control over the protocol.

### 24.3 Community forkability

Anyone should be able to:

* run a renderer,
* run an indexer,
* run a mirror,
* run a directory,
* create their own frontend,
* create their own storage backend.

### 24.4 No vendor lock-in

The protocol must not depend on one company’s wallet, storage, or hosting.

---

## 25. Security requirements for rendering active content

### 25.1 HTML safety

The renderer must default to safe rendering.

### 25.2 Dangerous content handling

Potentially dangerous content should be sandboxed or displayed as a downloadable artifact, not blindly executed.

### 25.3 PDF handling

PDFs should be scanned and handled carefully because they can leak metadata and sometimes exploit viewers.

### 25.4 Image handling

Strip or warn about EXIF and other embedded metadata.

---

## 26. Search and discovery stance

Search is useful but not required.

The protocol should separate:

* **publication**,
* **verification**,
* **discovery**.

Discovery can be as simple as txid lookup, or as advanced as metadata search.

No search layer should be trusted as the source of truth.

---

## 27. Practical recommendation on BSV storage

Do not claim the whole chain must be stored directly in OP_PUSHDATA forever.
That is too expensive and too brittle as a blanket strategy.

Use a layered approach:

* small roots and manifests on-chain,
* larger content chunked and optionally mirrored,
* archival commitments on-chain,
* multiple retrievable storage backends for durability.

That gives the vision without pretending cost does not exist.

---

## 28. Final product definition

The final product is a protocol and reference implementation for anonymous, non-custodial, onion-first publishing on BSV.

It includes:

* a web editor,
* a chunking engine,
* a manifest format,
* a BSV anchoring flow,
* a stateless renderer,
* an optional indexer,
* an optional directory,
* a public documentation site,
* a clear payment model,
* and a clear liability boundary.

The product’s central promise is:

**Anyone can publish content anonymously, pay for their own publication, anchor it on BSV, and let any community member independently render or index it without trusting a single operator.**

---

## 29. Implementation checklist

### Protocol

* [ ] define manifest schema
* [ ] define chunk schema
* [ ] define versioning rules
* [ ] define validation rules
* [ ] define receipt format

### Authoring

* [ ] Tor-safe editor
* [ ] article mode
* [ ] PDF upload
* [ ] image upload
* [ ] bundle mode
* [ ] local preview
* [ ] metadata stripping

### Publishing

* [ ] fee estimation
* [ ] user confirmation
* [ ] non-custodial payment
* [ ] safe fail-before-anchor behavior
* [ ] txid receipt

### Rendering

* [ ] stateless renderer
* [ ] hash verification
* [ ] safe HTML mode
* [ ] download mode

### Discovery

* [ ] optional indexer
* [ ] directory page
* [ ] compatible node list

### Security

* [ ] Tor Browser testing
* [ ] extension-free workflow
* [ ] external asset blocking
* [ ] privacy warnings
* [ ] content sanitization

### Ops

* [ ] onion deployment docs
* [ ] clearnet mirror docs
* [ ] backup and cache policy
* [ ] monitoring without tracking users

---

## 30. Suggested naming discipline

Use these terms consistently:

* **Authoring client** not “wallet app”
* **Manifest** not “post”
* **Anchor transaction** not “upload receipt”
* **Renderer** not “website host”
* **Indexer** not “search engine source of truth”
* **Mirror** not “canonical storage”
* **Publication record** not “account profile”
* **Protocol** not “platform”

This matters because the vocabulary shapes the architecture.

