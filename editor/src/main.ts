// SAMIZDAT Editor — entry point

import './styles.css';
import { initialState, STEPS, STEP_LABELS, stepIndex } from './machine';
import type { EditorState, EditorMode, PublishStep } from './machine';
import {
  processFiles,
  processMarkdown,
  prepareManifest,
  buildChunkTransactions,
  buildAnchorTransaction,
  verifyChunkFromHex,
  verifyAnchorFromHex,
  formatSatoshis,
} from './publish';
import type { Utxo } from '@samizdat/tx/types';
import { markdownToHtml } from './markdown';
import { sanitizeHtml } from '@samizdat/renderer/sanitize';
import { renderGuide, SAMPLE_MARKDOWN } from './guide';
let state: EditorState = initialState();
let guideOpen = false;

// ── DOM refs ──

function q<T extends HTMLElement>(selector: string): T {
  return document.querySelector<T>(selector)!;
}

const stepbarEl  = q<HTMLDivElement>('#stepbar');
const contentEl  = q<HTMLDivElement>('#content');

// ── Rendering ──

function render(): void {
  renderStepbar();
  renderStep();
}

function renderStepbar(): void {
  if (state.step === 'IDLE') {
    stepbarEl.innerHTML = '';
    return;
  }
  const currentIdx = stepIndex(state.step);
  stepbarEl.innerHTML = `<div class="sz-stepbar">` +
    STEPS.map((s, i) => {
      const cls = i < currentIdx ? 'is-done' : i === currentIdx ? 'is-active' : 'is-future';
      return `<span class="sz-stepbar-item ${cls}">${STEP_LABELS[s]}</span>`;
    }).join('') +
    `</div>`;
}

function renderStep(): void {
  if (guideOpen) {
    contentEl.className = '';
    contentEl.innerHTML = renderGuide();
    attachHandlers();
    return;
  }

  const renderers: Record<PublishStep, () => string> = {
    IDLE:                renderIdle,
    PREPARE:             renderPrepare,
    REVIEW:              renderReview,
    CONFIRM:             renderConfirm,
    EXPORT_CHUNKS:       renderExportChunks,
    COLLECT_CHUNK_TXIDS: renderCollectChunkTxids,
    VERIFY_CHUNKS:       renderVerifyChunks,
    EXPORT_ANCHOR:       renderExportAnchor,
    COLLECT_ANCHOR_TXID: renderCollectAnchorTxid,
    VERIFY_ANCHOR:       renderVerifyAnchor,
    RECEIPT:             renderReceipt,
  };

  const html = state.error
    ? renderError(state.error)
    : (renderers[state.step] ?? renderIdle)();

  if (state.step === 'IDLE') {
    contentEl.className = 'sz-editor-layout';
  } else {
    contentEl.className = '';
  }

  contentEl.innerHTML = html;
  attachHandlers();
}

// ── Step views ──

function renderIdle(): string {
  const isMarkdown = state.mode === 'markdown';
  const hasFiles   = state.files.length > 0;
  const preview    = state.markdownDraft
    ? sanitizeHtml(markdownToHtml(state.markdownDraft))
    : `<p class="sz-text-muted" style="font-size:0.875rem">preview appears here as you write.</p>`;

  const fileTreeHtml = hasFiles
    ? `<ul class="sz-file-list" style="margin-top:0.5rem">` +
        state.files.map(f =>
          `<li class="sz-file-item">
            <span class="sz-file-name">${esc(f.name)}</span>
            <span class="sz-file-meta">${formatBytes(f.data.length)}</span>
          </li>`
        ).join('') +
      `</ul>`
    : `<p class="sz-text-muted" style="font-size:0.8rem">no files loaded.</p>`;

  const metaHtml = hasFiles && !isMarkdown
    ? `<div class="sz-stats">
        <span class="sz-stat-label">Files</span>
        <span class="sz-stat-value">${state.files.length}</span>
      </div>` +
      state.files.map(f =>
        `<div class="sz-mb-sm">
          <span class="sz-data-label">${esc(f.name)}</span>
          <span class="sz-data">${esc(f.contentType)} &middot; ${formatBytes(f.data.length)}</span>
        </div>`
      ).join('')
    : `<p class="sz-text-muted" style="font-size:0.8rem">metadata appears after files are loaded.</p>`;

  return `
    <div class="sz-rail-left">
      <div class="sz-rail-head">Files</div>
      ${fileTreeHtml}
    </div>

    <div class="sz-editor-pane">
      <div class="sz-tabs">
        <button class="sz-tab${!isMarkdown ? ' is-active' : ''}" data-mode="files">Upload files</button>
        <button class="sz-tab${isMarkdown ? ' is-active' : ''}" data-mode="markdown">Write markdown</button>
      </div>

      ${!isMarkdown ? `
        <div id="file-panel">
          <div class="sz-drop-zone" id="drop-zone">
            &#128196; drop files here or click to browse
            <div class="sz-drop-zone-hint">Markdown, plain text, HTML, PDF, JPEG, PNG, WebP, ZIP &mdash; up to 10 MB each</div>
          </div>
          <input type="file" id="file-input" style="display:none" multiple>
        </div>
      ` : `
        <div id="markdown-panel">
          <div class="sz-md-split">
            <div class="sz-md-pane">
              <div class="sz-md-pane-head" style="display:flex;align-items:center;justify-content:space-between">
                <span>Write</span>
                <button class="sz-sample-btn" id="load-sample-btn" title="Load a sample document">Load sample</button>
              </div>
              <textarea id="md-input" rows="16" placeholder="# your document">${esc(state.markdownDraft)}</textarea>
            </div>
            <div class="sz-md-pane">
              <div class="sz-md-pane-head">Preview</div>
              <div class="sz-md-preview">${preview}</div>
            </div>
          </div>
          <div class="sz-form-row">
            <label for="md-filename">Filename</label>
            <input type="text" id="md-filename" placeholder="document.md" value="document.md">
          </div>
        </div>
      `}

      <div class="sz-form-row sz-mt">
        <label for="title-input">Publication title (optional)</label>
        <input type="text" id="title-input" placeholder="untitled">
      </div>

      <div class="sz-warn-block">
        <div class="sz-warn"><span class="sz-warn-label">Privacy</span>: no data leaves this page until you export a transaction.</div>
        <div class="sz-warn"><span class="sz-warn-label">Tor Browser</span>: use the onion address, not a clearnet URL, for maximum anonymity.</div>
      </div>

      <div>
        <button class="sz-btn sz-btn-primary" id="prepare-btn" ${!isMarkdown && !hasFiles ? 'disabled' : ''}>
          Prepare &rarr;
        </button>
      </div>
    </div>

    <div class="sz-rail-right">
      <div class="sz-rail-head">Metadata</div>
      ${metaHtml}
    </div>
  `;
}

function renderPrepare(): string {
  const manifest  = state.manifest!;
  const totalBytes = manifest.chunkTree.reduce((s, c) => s + c.size, 0);
  const stripped  = state.files.flatMap(f => f.strippedMetadata);

  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Prepare &mdash; content summary</div>
      <div class="sz-section-body">

        <div class="sz-stats">
          <span class="sz-stat-label">Files</span>
          <span class="sz-stat-value">${state.files.length}</span>
          <span class="sz-stat-label">Total size</span>
          <span class="sz-stat-value">${formatBytes(totalBytes)}</span>
          <span class="sz-stat-label">Chunks</span>
          <span class="sz-stat-value">${manifest.chunkTree.length}</span>
          <span class="sz-stat-label">Root hash</span>
          <span class="sz-stat-value is-data">${manifest.rootHash.slice(0,24)}&hellip;</span>
        </div>

        <ul class="sz-file-list sz-mt">
          ${state.files.map(f => `
            <li class="sz-file-item">
              <span class="sz-file-name">${esc(f.name)}</span>
              <span class="sz-file-meta">${formatBytes(f.data.length)} &middot; ${esc(f.contentType)}</span>
            </li>
          `).join('')}
        </ul>

        ${stripped.length ? `
          <div class="sz-mt">
            ${stripped.map(s => `<div class="sz-verified">&#10003; ${esc(s)}</div>`).join('')}
          </div>
        ` : ''}

        <div class="sz-mt">
          <div class="sz-label">Chunk tree</div>
          <table class="sz-table">
            <thead><tr><th>#</th><th>Size</th><th>Hash (first 24)</th></tr></thead>
            <tbody>
              ${manifest.chunkTree.slice(0, 20).map(c => `
                <tr>
                  <td>${c.index}</td>
                  <td>${formatBytes(c.size)}</td>
                  <td>${c.hash.slice(0,24)}&hellip;</td>
                </tr>
              `).join('')}
              ${manifest.chunkTree.length > 20
                ? `<tr><td colspan="3" style="color:var(--sz-faded)">… ${manifest.chunkTree.length - 20} more chunks</td></tr>`
                : ''}
            </tbody>
          </table>
        </div>

        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="back-btn">&larr; Back</button>
          <button class="sz-btn sz-btn-primary" id="review-btn">Review &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderFeeEstimatePanel(): string {
  const f = state.feeEstimate;
  if (!f) return '';

  const chunkLines = f.chunkMinerFees.map((fee, i) =>
    `<li>Chunk ${i + 1}: ~${formatSatoshis(fee)}</li>`,
  ).join('');

  return `
    <div class="sz-notice sz-mb">
      <div class="sz-data-label">Estimated miner fees (${f.satsPerKb} satoshis per KB)</div>
      <p style="margin:0.4rem 0 0.5rem;font-size:0.9rem;color:var(--sz-ink)">
        BSV miners currently charge about <strong>${f.satsPerKb} sat/KB</strong> of signed transaction size.
        Your publication needs:
      </p>
      <ul style="margin:0.25rem 0 0.75rem 1.25rem;font-size:0.9rem;color:var(--sz-ink)">
        ${chunkLines}
        <li>Anchor: ~${formatSatoshis(f.anchorMinerFee)}</li>
      </ul>
      <div class="sz-stats" style="margin-top:0.5rem">
        <span class="sz-stat-label">Total miner fees</span>
        <span class="sz-stat-value">~${formatSatoshis(f.totalMinerFees)}</span>
        <span class="sz-stat-label">Min. first UTXO</span>
        <span class="sz-stat-value">${formatSatoshis(f.minimumFirstUtxoSats)}</span>
        <span class="sz-stat-label">Min. one UTXO (all txs)</span>
        <span class="sz-stat-value">${formatSatoshis(f.minimumTotalSats)}</span>
      </div>
      <p class="sz-field-hint" style="margin-top:0.6rem">
        Each transaction also includes a 1-sat data output (${formatSatoshis(f.dustOutputs)} sats total across
        ${f.chunkMinerFees.length + 1} transaction(s)). Unused change returns to your wallet.
        Fund your UTXO with at least the <strong>minimum first UTXO</strong> amount before building.
      </p>
    </div>`;
}

function renderReview(): string {
  const manifest   = state.manifest!;
  const totalBytes = manifest.chunkTree.reduce((s, c) => s + c.size, 0);

  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Review &mdash; before you commit</div>
      <div class="sz-section-body">

        <div class="sz-warn-block">
          <div class="sz-warn"><span class="sz-warn-label">Irreversible</span>: once broadcast, the content hash is permanently anchored on the BSV blockchain. there is no undo.</div>
          <div class="sz-warn"><span class="sz-warn-label">Public record</span>: the manifest hash and all chunk hashes become publicly inspectable on-chain.</div>
        </div>

        ${renderFeeEstimatePanel()}

        ${manifest.title ? `<div class="sz-mb">
          <span class="sz-data-label">Title</span>
          <div style="font-size:1.1rem;color:var(--sz-ink)">${esc(manifest.title)}</div>
        </div>` : ''}

        <div class="sz-stats">
          <span class="sz-stat-label">Author mode</span>
          <span class="sz-stat-value">${manifest.authorMode}</span>
          <span class="sz-stat-label">Total size</span>
          <span class="sz-stat-value">${formatBytes(totalBytes)}</span>
          <span class="sz-stat-label">Chunks</span>
          <span class="sz-stat-value">${manifest.chunkTree.length}</span>
          <span class="sz-stat-label">Files</span>
          <span class="sz-stat-value">${manifest.fileTree.length}</span>
        </div>

        <div class="sz-hash-block sz-mt">
          <span class="sz-data-label">Root hash</span>
          <div class="sz-big-hash">${manifest.rootHash}</div>
        </div>

        <ul class="sz-file-list sz-mb">
          ${state.files.map(f => `
            <li class="sz-file-item">
              <span class="sz-file-name">${esc(f.name)}</span>
              <span class="sz-file-meta">${formatBytes(f.data.length)}</span>
            </li>
          `).join('')}
        </ul>

        <div class="sz-label sz-mt">Privacy checklist</div>
        <ul class="sz-privacy-list">
          <li class="sz-privacy-item">
            <span class="sz-privacy-icon sz-verified">&#10003;</span>
            <span>No private key material is present in this editor.</span>
          </li>
          <li class="sz-privacy-item">
            <span class="sz-privacy-icon sz-verified">&#10003;</span>
            <span>Content is hashed locally &mdash; no data leaves your browser before you export a transaction.</span>
          </li>
          <li class="sz-privacy-item">
            <span class="sz-privacy-icon ${state.files.some(f => f.strippedMetadata.length) ? 'sz-verified' : 'sz-unverified'}">
              ${state.files.some(f => f.strippedMetadata.length) ? '&#10003;' : '!'}
            </span>
            <span>Image/PDF metadata: ${state.files.some(f => f.strippedMetadata.length)
              ? 'stripped before hashing.'
              : 'none detected &mdash; verify manually for PDFs and Office documents before proceeding.'}</span>
          </li>
          <li class="sz-privacy-item">
            <span class="sz-privacy-icon sz-unverified">!</span>
            <span>Transaction timing and size are observable to network-level adversaries.</span>
          </li>
          <li class="sz-privacy-item">
            <span class="sz-privacy-icon sz-unverified">!</span>
            <span>Use Tor Browser over the onion address and an anonymously-acquired BSV wallet for maximum protection.</span>
          </li>
        </ul>

        <div class="sz-mt">
          <details class="sz-details">
            <summary class="sz-details-summary">Manifest JSON</summary>
            <div class="sz-details-body">
              <div class="sz-hex-block">${esc(JSON.stringify(manifest, null, 2))}</div>
            </div>
          </details>
        </div>

        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="back-btn">&larr; Back</button>
          <button class="sz-btn sz-btn-primary" id="confirm-btn">Proceed to confirmation &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderConfirm(): string {
  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Confirm &mdash; point of no return</div>
      <div class="sz-section-body">

        <div class="sz-warn-block">
          <div class="sz-warn"><span class="sz-warn-label">Warning</span>: signing and broadcasting the chunk transactions commits the content hash irreversibly. you cannot undo this action.</div>
        </div>

        ${renderFeeEstimatePanel()}

        ${utxoForm('chunk-utxo', 'Funding UTXO for chunk transaction(s)', `
          Enter an unspent output from your BSV wallet. This funds the chunk transaction(s).
          The locking script for a standard P2PKH output: <code style="font-family:var(--sz-font-data);font-size:0.85em;color:var(--sz-faded)">76a914[40 hex chars]88ac</code>.
          Find your UTXO details in your wallet or a BSV block explorer.
        `)}

        <div class="sz-checkbox-row sz-mt">
          <input type="checkbox" id="confirm-check">
          <label for="confirm-check" style="text-transform:none;font-family:var(--sz-font-body);font-size:0.9375rem;color:var(--sz-ink);letter-spacing:0;margin:0">
            I am responsible for this content. I understand that publication is permanent.
          </label>
        </div>

        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="back-btn">&larr; Back</button>
          <button class="sz-btn sz-btn-danger" id="build-chunks-btn" disabled>Build chunk transactions</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderExportChunks(): string {
  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Export &mdash; unsigned chunk transactions</div>
      <div class="sz-section-body">

        <div class="sz-warn-block sz-mb">
          <div class="sz-warn"><span class="sz-warn-label">ElectrumSV</span>: copy the JSON below (not raw hex). In ElectrumSV: Tools → Load Transaction → paste. Status should show <strong>Unsigned</strong> with a Sign button.</div>
          <div class="sz-warn"><span class="sz-warn-label">CLI</span>: use the raw hex with <code style="font-family:var(--sz-font-data);font-size:0.85em">scripts/sign-tx.ts</code> if you prefer offline WIF signing.</div>
          <div class="sz-warn"><span class="sz-warn-label">Order</span>: chunk transactions must be broadcast before the anchor transaction. do not skip steps.</div>
        </div>

        ${state.chunkBundles.map(b => `
          <div class="sz-mb">
            <span class="sz-data-label">
              Chunk transaction ${b.index + 1} of ${state.chunkBundles.length}
              &mdash; est. fee ${formatSatoshis(b.feeEstimateSats)}
            </span>
            <div class="sz-copy-wrap">
              <div class="sz-hex-block" id="chunk-hex-${b.index}">${esc(b.electrumJsonTx)}</div>
              <button class="sz-btn sz-btn-secondary sz-btn-copy" data-copy="${b.index}">COPY</button>
            </div>
          </div>
        `).join('')}

        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-primary" id="next-collect-btn">I have broadcast all chunk transactions &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderCollectChunkTxids(): string {
  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Collect &mdash; chunk txids</div>
      <div class="sz-section-body">

        <div class="sz-notice sz-mb">
          Paste the txid your wallet returned for each signed and broadcast chunk transaction.
        </div>

        <div class="sz-mt">
          ${state.chunkBundles.map((_, i) => `
            <div class="sz-txid-row sz-mb-sm">
              <label>Chunk ${i + 1}</label>
              <input type="text" class="sz-txid-input is-data" data-chunk="${i}"
                placeholder="64 hex characters" value="${esc(state.chunkTxids[i] ?? '')}">
            </div>
          `).join('')}
        </div>

        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="back-btn">&larr; Back</button>
          <button class="sz-btn sz-btn-primary" id="verify-chunks-btn">Verify chunks &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderVerifyChunks(): string {
  if (state.chunksVerified) {
    return `<div class="sz-content">
      <div class="sz-section">
        <div class="sz-section-head">Verify &mdash; chunks confirmed</div>
        <div class="sz-section-body">

          <div class="sz-verified sz-mb">&#10003; Verified &mdash; all ${state.chunkBundles.length} chunk(s) verified successfully.</div>
          <div>${state.chunkVerifyHtml}</div>

          ${utxoForm('anchor-utxo', 'Funding UTXO for anchor transaction', `
            Enter the UTXO that will fund the anchor transaction.
            This is typically the <em>change output</em> from your chunk transaction —
            check your wallet after broadcasting to find the change txid and vout.
          `)}

          <div class="sz-btn-row">
            <button class="sz-btn sz-btn-secondary" id="back-btn">&larr; Re-verify</button>
            <button class="sz-btn sz-btn-primary" id="build-anchor-btn">Build anchor transaction &rarr;</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Verify &mdash; chunk data</div>
      <div class="sz-section-body">

        <div class="sz-notice sz-mb">
          Paste the signed transaction hex for each chunk. The editor re-hashes the chunk data locally
          and compares it to the manifest. No network requests are made.
        </div>

        <div class="sz-mt">
          ${state.chunkBundles.map((_, i) => `
            <div class="sz-form-row">
              <label>
                Chunk ${i + 1} signed hex
                &mdash; txid: <span style="font-family:var(--sz-font-data)">${esc((state.chunkTxids[i] ?? '').slice(0, 16))}…</span>
              </label>
              <textarea class="sz-chunk-tx-hex is-data" data-chunk="${i}" rows="4"
                placeholder="paste the full signed transaction hex…"></textarea>
            </div>
          `).join('')}
        </div>

        <div id="verify-results" class="sz-mt"></div>

        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="back-btn">&larr; Back</button>
          <button class="sz-btn sz-btn-primary" id="run-verify-btn">Verify &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderExportAnchor(): string {
  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Export &mdash; unsigned anchor transaction</div>
      <div class="sz-section-body">

        <div class="sz-verified sz-mb">&#10003; All ${state.chunkBundles.length} chunk(s) verified. now sign and broadcast the anchor transaction.</div>

        <div class="sz-hash-block sz-mt">
          <span class="sz-data-label">Manifest hash</span>
          <div class="sz-big-hash">${state.manifestHash}</div>
          <span class="sz-data-label">Estimated anchor fee</span>
          <div style="color:var(--sz-ink);font-size:0.9375rem;margin-top:0.2rem">${formatSatoshis(state.anchorFee)}</div>
        </div>

        <div class="sz-mb sz-mt">
          <span class="sz-data-label">ElectrumSV unsigned transaction (JSON)</span>
          <div class="sz-copy-wrap">
            <div class="sz-hex-block" id="anchor-hex-block">${esc(state.anchorElectrumJsonTx)}</div>
            <button class="sz-btn sz-btn-secondary sz-btn-copy" data-copy="anchor">COPY</button>
          </div>
        </div>

        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-primary" id="next-anchor-txid-btn">I have broadcast the anchor &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderCollectAnchorTxid(): string {
  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Collect &mdash; anchor txid</div>
      <div class="sz-section-body">
        <div class="sz-form-row">
          <label for="anchor-txid-input">Anchor transaction txid</label>
          <input type="text" id="anchor-txid-input" class="is-data"
            placeholder="64 hex characters"
            value="${esc(state.anchorTxid)}">
        </div>
        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="back-btn">&larr; Back</button>
          <button class="sz-btn sz-btn-primary" id="verify-anchor-btn" disabled>Verify and continue &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderVerifyAnchor(): string {
  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Verify &mdash; anchor transaction</div>
      <div class="sz-section-body">

        <div class="sz-notice sz-mb">
          Paste the signed anchor transaction hex to verify it locally.
          txid: <span style="font-family:var(--sz-font-data);color:var(--sz-faded)">${esc(state.anchorTxid.slice(0,24))}…</span>
        </div>

        <div class="sz-form-row sz-mt">
          <label>Anchor signed transaction hex</label>
          <textarea id="anchor-tx-hex" class="is-data" rows="5"
            placeholder="paste the full signed anchor transaction hex…"></textarea>
        </div>

        <div id="anchor-verify-result" class="sz-mt"></div>

        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="back-btn">&larr; Back</button>
          <button class="sz-btn sz-btn-primary" id="run-anchor-verify-btn">Verify &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderReceipt(): string {
  const record = {
    manifestHash: state.manifestHash,
    txids:        [...state.chunkTxids, state.anchorTxid],
    rootHash:     state.manifest!.rootHash,
    retrievalEndpoints: [],
  };
  const receiptText = [
    `SAMIZDAT PUBLICATION RECEIPT`,
    ``,
    `Manifest hash:  ${state.manifestHash}`,
    `Root hash:      ${state.manifest!.rootHash}`,
    `Anchor txid:    ${state.anchorTxid}`,
    `Chunk txid(s):  ${state.chunkTxids.join(', ')}`,
    ``,
    `Retrieval: provide the anchor txid to any Samizdat renderer.`,
    `Verification: a renderer that shows an unverified warning should`,
    `not be trusted. verify the root hash matches this receipt.`,
    ``,
    `Save this file offline. do not store it in a cloud account.`,
  ].join('\n');

  return `<div class="sz-content">
    <div class="sz-receipt">
      <div class="sz-receipt-head">&#10003; Publication complete &mdash; save your receipt</div>
      <div class="sz-receipt-body">

        <div class="sz-hash-block sz-mb">
          <span class="sz-data-label">Root hash</span>
          <div class="sz-big-hash">${state.manifest!.rootHash}</div>
          <span class="sz-data-label">Manifest hash</span>
          <div class="sz-big-hash">${state.manifestHash}</div>
          <span class="sz-data-label">Anchor txid</span>
          <div class="sz-big-hash">${esc(state.anchorTxid)}</div>
        </div>

        <div class="sz-notice sz-mb">
          Provide the anchor txid to any Samizdat renderer to retrieve and verify this publication.
          A renderer that shows an unverified warning has not confirmed the hashes &mdash; do not trust unverified content.
        </div>

        <div class="sz-warn sz-mb">
          <span class="sz-warn-label">Offline backup</span>: save this receipt now. do not store it in a cloud account.
        </div>
      </div>
    </div>

    <div class="sz-section">
      <div class="sz-section-head">Publication record (JSON)</div>
      <div class="sz-section-body">
        <div class="sz-copy-wrap">
          <div class="sz-hex-block" id="receipt-json">${esc(JSON.stringify(record, null, 2))}</div>
          <button class="sz-btn sz-btn-secondary sz-btn-copy" data-copy="receipt">COPY</button>
        </div>
        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="save-receipt-btn" data-receipt="${esc(receiptText)}">SAVE RECEIPT</button>
          <button class="sz-btn sz-btn-secondary" id="restart-btn">Publish another &rarr;</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderError(msg: string): string {
  return `<div class="sz-content">
    <div class="sz-section">
      <div class="sz-section-head">Error</div>
      <div class="sz-section-body">
        <div class="sz-warn"><span class="sz-warn-label">Error</span>: ${esc(msg)}</div>
        <div class="sz-btn-row">
          <button class="sz-btn sz-btn-secondary" id="restart-btn">Start over</button>
        </div>
      </div>
    </div>
  </div>`;
}

// ── Event handlers ──

function attachHandlers(): void {
  const step = state.step;

  // Guide close button (rendered when guideOpen = true)
  document.getElementById('guide-close-btn')?.addEventListener('click', () => {
    guideOpen = false;
    render();
  });

  // "What is a UTXO? Open guide §4" links in UTXO form fields
  document.querySelectorAll<HTMLAnchorElement>('.sz-guide-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      guideOpen = true;
      render();
      // Scroll to the §4 funding section after render
      setTimeout(() => {
        document.querySelector('.sz-section-head')?.scrollIntoView?.({ behavior: 'smooth' });
      }, 50);
    });
  });

  // Load sample button (rendered in IDLE markdown mode)
  document.getElementById('load-sample-btn')?.addEventListener('click', () => {
    state.markdownDraft = SAMPLE_MARKDOWN;
    render();
  });

  // Copy buttons
  document.querySelectorAll<HTMLElement>('.sz-btn-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset['copy']!;
      let text = '';
      if (id === 'anchor')  text = state.anchorElectrumJsonTx;
      else if (id === 'receipt') text = q<HTMLElement>('#receipt-json').textContent ?? '';
      else {
        const idx = parseInt(id);
        text = state.chunkBundles[idx]?.electrumJsonTx ?? '';
      }
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = 'COPIED';
        setTimeout(() => { btn.textContent = 'COPY'; }, 1500);
      });
    });
  });

  const on = (id: string, ev: string, fn: (e: Event) => void): void => {
    document.getElementById(id)?.addEventListener(ev, fn);
  };

  // Save receipt as plain text
  on('save-receipt-btn', 'click', () => {
    const btn = document.getElementById('save-receipt-btn') as HTMLButtonElement | null;
    const text = btn?.dataset['receipt'] ?? '';
    const blob = new Blob([text], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'samizdat-receipt.txt';
    a.click();
    URL.revokeObjectURL(url);
  });

  if (step === 'IDLE') {
    document.querySelectorAll<HTMLButtonElement>('.sz-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        state.mode = (btn.dataset['mode'] as EditorMode) ?? 'files';
        render();
      });
    });

    if (state.mode === 'files') {
      const fileInput  = document.getElementById('file-input') as HTMLInputElement | null;
      const dropZone   = document.getElementById('drop-zone');
      const prepareBtn = document.getElementById('prepare-btn') as HTMLButtonElement | null;

      if (dropZone && fileInput && prepareBtn) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('dragover',  e => { e.preventDefault(); dropZone.classList.add('is-drag-over'); });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('is-drag-over'));
        dropZone.addEventListener('drop', e => {
          e.preventDefault();
          dropZone.classList.remove('is-drag-over');
          if (e.dataTransfer?.files.length) handleFiles(Array.from(e.dataTransfer.files), prepareBtn);
        });
        fileInput.addEventListener('change', () => {
          if (fileInput.files?.length) handleFiles(Array.from(fileInput.files), prepareBtn);
        });
      }
    } else {
      const mdInput = document.getElementById('md-input') as HTMLTextAreaElement | null;
      if (mdInput) {
        mdInput.addEventListener('input', () => {
          state.markdownDraft = mdInput.value;
          const preview = document.querySelector('.sz-md-preview');
          if (preview) {
            preview.innerHTML = state.markdownDraft
              ? sanitizeHtml(markdownToHtml(state.markdownDraft))
              : `<p class="sz-text-muted" style="font-size:0.875rem">preview appears here as you write.</p>`;
          }
        });
      }
    }

    on('prepare-btn', 'click', async () => {
      const title = q<HTMLInputElement>('#title-input').value.trim() || undefined;
      if (state.mode === 'markdown') {
        const draft = state.markdownDraft.trim();
        if (!draft) { state.error = 'Nothing to publish — write some content first.'; render(); return; }
        const filename = (document.getElementById('md-filename') as HTMLInputElement | null)?.value.trim() || 'document.md';
        await transition('PREPARE', async () => {
          state.files = await processMarkdown(draft, filename);
          const result = await prepareManifest(state.files, title);
          state.manifest     = result.manifest;
          state.rawChunks    = result.rawChunks;
          state.manifestHash = result.manifestHash;
          state.feeEstimate  = result.feeEstimate;
        });
      } else {
        await transition('PREPARE', async () => {
          const result = await prepareManifest(state.files, title);
          state.manifest     = result.manifest;
          state.rawChunks    = result.rawChunks;
          state.manifestHash = result.manifestHash;
          state.feeEstimate  = result.feeEstimate;
        });
      }
    });
  }

  if (step === 'PREPARE') {
    on('back-btn',   'click', () => { state.step = 'IDLE';    render(); });
    on('review-btn', 'click', () => { state.step = 'REVIEW';  render(); });
  }

  if (step === 'REVIEW') {
    on('back-btn',   'click', () => { state.step = 'PREPARE'; render(); });
    on('confirm-btn','click', () => { state.step = 'CONFIRM'; render(); });
  }

  if (step === 'CONFIRM') {
    on('back-btn', 'click', () => { state.step = 'REVIEW'; render(); });
    const buildBtn = document.getElementById('build-chunks-btn') as HTMLButtonElement | null;
    on('confirm-check', 'change', () => {
      if (buildBtn) buildBtn.disabled = !q<HTMLInputElement>('#confirm-check').checked;
    });
    on('build-chunks-btn', 'click', async () => {
      const utxo = tryReadUtxoForm('chunk-utxo');
      if (!utxo) return;
      await transition('EXPORT_CHUNKS', async () => {
        state.utxo = utxo;
        const result = await buildChunkTransactions(state.manifest!, state.rawChunks, utxo);
        state.chunkBundles = result.chunkBundles;
      });
    });
  }

  if (step === 'EXPORT_CHUNKS') {
    on('next-collect-btn', 'click', () => { state.step = 'COLLECT_CHUNK_TXIDS'; render(); });
  }

  if (step === 'COLLECT_CHUNK_TXIDS') {
    on('back-btn',          'click', () => { state.step = 'EXPORT_CHUNKS'; render(); });
    on('verify-chunks-btn', 'click', () => {
      const txids: string[] = [];
      document.querySelectorAll<HTMLInputElement>('.sz-txid-input').forEach(inp => {
        txids[parseInt(inp.dataset['chunk']!)] = inp.value.trim();
      });
      state.chunkTxids = txids;
      state.step       = 'VERIFY_CHUNKS';
      render();
    });
  }

  if (step === 'VERIFY_CHUNKS') {
    if (!state.chunksVerified) {
      on('back-btn',       'click', () => { state.step = 'COLLECT_CHUNK_TXIDS'; render(); });
      on('run-verify-btn', 'click', async () => {
        const hexInputs = document.querySelectorAll<HTMLTextAreaElement>('.sz-chunk-tx-hex');
        const resultsEl = document.getElementById('verify-results')!;
        resultsEl.innerHTML = `<span class="sz-pending">&#8230; Verifying</span>`;
        let allPass = true;
        const results: string[] = [];

        for (const inp of hexInputs) {
          const chunkIdx = parseInt(inp.dataset['chunk']!);
          const hex      = inp.value.trim();
          try {
            const ok = hex ? await verifyChunkFromHex(hex, chunkIdx, state.manifest!) : false;
            if (!ok) allPass = false;
            results.push(`<li class="sz-privacy-item">
              <span class="sz-privacy-icon ${ok ? 'sz-verified' : 'sz-unverified'}">${ok ? '&#10003;' : '!'}</span>
              <span>Chunk ${chunkIdx + 1}: ${ok ? 'verified.' : 'FAILED &mdash; hash mismatch or no hex provided.'}</span>
            </li>`);
          } catch (err) {
            allPass = false;
            results.push(`<li class="sz-privacy-item">
              <span class="sz-privacy-icon sz-unverified">!</span>
              <span>Chunk ${chunkIdx + 1}: error &mdash; ${esc(String(err))}</span>
            </li>`);
          }
        }

        const resultList = `<ul class="sz-privacy-list">${results.join('')}</ul>`;
        if (!allPass) {
          resultsEl.innerHTML = resultList;
        } else {
          state.chunksVerified  = true;
          state.chunkVerifyHtml = resultList;
          render();
        }
      });
    } else {
      on('build-anchor-btn', 'click', async () => {
        const utxo = tryReadUtxoForm('anchor-utxo');
        if (!utxo) return;
        await transition('EXPORT_ANCHOR', async () => {
          state.anchorUtxo = utxo;
          const result = await buildAnchorTransaction(state.manifest!, state.chunkTxids, utxo);
          state.anchorHexTx  = result.anchorHexTx;
          state.anchorElectrumJsonTx = result.anchorElectrumJsonTx;
          state.anchorFee    = result.anchorFee;
        });
      });
    }
  }

  if (step === 'EXPORT_ANCHOR') {
    on('next-anchor-txid-btn', 'click', () => { state.step = 'COLLECT_ANCHOR_TXID'; render(); });
  }

  if (step === 'COLLECT_ANCHOR_TXID') {
    on('back-btn', 'click', () => { state.step = 'EXPORT_ANCHOR'; render(); });

    // Enable verify button only when txid is non-empty
    const inp = document.getElementById('anchor-txid-input') as HTMLInputElement | null;
    const verBtn = document.getElementById('verify-anchor-btn') as HTMLButtonElement | null;
    if (inp && verBtn) {
      const update = () => { verBtn.disabled = inp.value.trim().length === 0; };
      update();
      inp.addEventListener('input', update);
    }
    on('verify-anchor-btn', 'click', () => {
      state.anchorTxid = q<HTMLInputElement>('#anchor-txid-input').value.trim();
      state.step       = 'VERIFY_ANCHOR';
      render();
    });
  }

  if (step === 'VERIFY_ANCHOR') {
    on('back-btn',             'click', () => { state.step = 'COLLECT_ANCHOR_TXID'; render(); });
    on('run-anchor-verify-btn','click', async () => {
      const hex      = q<HTMLTextAreaElement>('#anchor-tx-hex').value.trim();
      const resultEl = document.getElementById('anchor-verify-result')!;
      resultEl.innerHTML = `<span class="sz-pending">&#8230; Verifying</span>`;
      try {
        const ok = await verifyAnchorFromHex(hex, state.manifest!);
        if (ok) {
          state.step = 'RECEIPT';
          render();
        } else {
          resultEl.innerHTML = `<div class="sz-unverified">! Anchor verification failed. do not proceed.</div>`;
        }
      } catch (err) {
        resultEl.innerHTML = `<div class="sz-unverified">! Error: ${esc(String(err))}</div>`;
      }
    });
  }

  on('restart-btn', 'click', () => {
    state = initialState();
    render();
  });

  on('back-btn', 'click', () => {
    const idx = stepIndex(state.step);
    if (idx > 0) {
      if (state.step === 'VERIFY_CHUNKS' && state.chunksVerified) {
        state.chunksVerified  = false;
        state.chunkVerifyHtml = '';
        render();
        return;
      }
      state.step = STEPS[idx - 1]!;
      render();
    }
  });
}

// ── Helpers ──

async function handleFiles(files: File[], btn: HTMLButtonElement): Promise<void> {
  try {
    state.files = await processFiles(files);
    btn.disabled = false;
    const dropZone = document.getElementById('drop-zone');
    if (dropZone) {
      dropZone.textContent = `${state.files.length} file(s) ready: ${state.files.map(f => f.name).join(', ')}`;
    }
    // Refresh the rail metadata
    render();
  } catch (err) {
    state.error = String(err);
    render();
  }
}

function readUtxoForm(prefix: string): Utxo {
  const txid   = (document.getElementById(`${prefix}-txid`)   as HTMLInputElement | null)?.value ?? '';
  const vout   = (document.getElementById(`${prefix}-vout`)   as HTMLInputElement | null)?.value ?? '';
  const sats   = (document.getElementById(`${prefix}-sats`)   as HTMLInputElement | null)?.value ?? '';
  const script = (document.getElementById(`${prefix}-script`) as HTMLInputElement | null)?.value ?? '';
  const xpub   = (document.getElementById(`${prefix}-xpub`)   as HTMLInputElement | null)?.value ?? '';
  const deriv  = (document.getElementById(`${prefix}-deriv`)  as HTMLInputElement | null)?.value ?? '';
  return parseUtxo(txid, vout, sats, script, xpub, deriv);
}

async function transition(
  nextStep: PublishStep,
  work: () => Promise<void>,
): Promise<void> {
  state.error = null;
  try {
    await work();
    state.step = nextStep;
  } catch (err) {
    state.error = String(err);
  }
  render();
}

function formatBytes(n: number): string {
  if (n < 1024)             return `${n} B`;
  if (n < 1024 * 1024)     return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function parseDerivationPath(raw: string): number[] | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const parts = trimmed.split(/[/,\s]+/).filter(Boolean);
  const path = parts.map(p => {
    const n = parseInt(p, 10);
    if (!Number.isInteger(n) || n < 0) throw new Error('Derivation path must be non-negative integers (e.g. 0/3).');
    return n;
  });
  if (path.length === 0) return undefined;
  return path;
}

function parseUtxo(
  txid: string,
  voutStr: string,
  satsStr: string,
  scriptHex: string,
  xpub = '',
  derivPath = '',
): Utxo {
  const cleanTxid = txid.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(cleanTxid)) throw new Error('UTXO txid must be exactly 64 hex characters.');

  const vout = parseInt(voutStr.trim(), 10);
  if (!Number.isInteger(vout) || vout < 0) throw new Error('UTXO vout must be a non-negative integer.');

  let satoshis: bigint;
  try {
    satoshis = BigInt(satsStr.trim());
    if (satoshis <= 0n) throw new Error();
  } catch {
    throw new Error('UTXO satoshis must be a positive integer.');
  }

  const hex = scriptHex.trim().toLowerCase().replace(/\s/g, '');
  if (!/^[0-9a-f]+$/.test(hex) || hex.length % 2 !== 0) throw new Error('Locking script must be valid hex.');
  if (!hex.startsWith('76a914') || !hex.endsWith('88ac') || hex.length !== 50)
    throw new Error('Only standard P2PKH locking scripts are supported (76a914…88ac, 25 bytes).');

  const pubKeyHashHex = hex.slice(6, 46);
  const utxo: Utxo = { txid: cleanTxid, vout, satoshis, lockingScriptHex: hex, pubKeyHashHex };

  const xpubTrimmed = xpub.trim();
  const derivationPath = derivPath ? parseDerivationPath(derivPath) : undefined;
  if (xpubTrimmed) {
    if (!xpubTrimmed.startsWith('xpub')) throw new Error('ElectrumSV xpub must start with "xpub".');
    if (!derivationPath?.length) {
      throw new Error('Provide a derivation path when an ElectrumSV xpub is set (e.g. 0/3).');
    }
    utxo.electrumXpub = xpubTrimmed;
    utxo.electrumDerivationPath = derivationPath;
  }

  return utxo;
}

function utxoForm(idPrefix: string, label: string, hint: string): string {
  return `
    <details class="sz-details" id="${idPrefix}-details">
      <summary class="sz-details-summary">${label}</summary>
      <div class="sz-details-body">
        <div class="sz-notice sz-mb" style="font-size:0.875rem">
          ${hint}
          <span style="margin-left:0.5rem">
            — <a href="#" class="sz-guide-link" id="${idPrefix}-guide-link" style="color:var(--sz-accent);text-decoration:underline">What is a UTXO? Open guide §4</a>
          </span>
        </div>
        <div id="${idPrefix}-error" class="sz-unverified sz-mb" style="display:none"></div>
        <div class="sz-form-row">
          <label>Transaction ID (txid)</label>
          <input type="text" id="${idPrefix}-txid" class="is-data" placeholder="64 hex characters">
          <div class="sz-field-hint">The 64-character hex ID of the transaction that created this output. In ElectrumSV: View → Coins → Transaction column.</div>
        </div>
        <div class="sz-form-row">
          <label>Output index (vout)</label>
          <input type="number" id="${idPrefix}-vout" min="0" placeholder="0">
          <div class="sz-field-hint">Which output in that transaction is yours — usually 0 (first) or 1 (second). In ElectrumSV: View → Coins → Output column.</div>
        </div>
        <div class="sz-form-row">
          <label>Amount (satoshis)</label>
          <input type="number" id="${idPrefix}-sats" min="1" placeholder="100000000">
          <div class="sz-field-hint">The value of this output in satoshis (1 BSV = 100,000,000 satoshis). Must be at least the <strong>minimum first UTXO</strong> shown above (miner fee at 100 sat/KB + 1 sat data output). In ElectrumSV: View → Coins → Value column.</div>
        </div>
        <div class="sz-form-row">
          <label>Locking script hex (P2PKH)</label>
          <input type="text" id="${idPrefix}-script" class="is-data" placeholder="76a914…88ac (50 hex chars)">
          <div class="sz-field-hint">How to unlock this output — for a standard BSV address, always starts with 76a914 and ends with 88ac (50 hex chars total). In ElectrumSV: View → Coins → right-click row → Copy script pubkey.</div>
        </div>
        <div class="sz-form-row">
          <label>ElectrumSV xpub <span style="color:var(--sz-faded);font-weight:normal">(optional — enables Sign)</span></label>
          <input type="text" id="${idPrefix}-xpub" class="is-data" placeholder="xpub6…">
          <div class="sz-field-hint">Account extended public key. In ElectrumSV: Wallet → Account → Information → Master Public Keys.</div>
        </div>
        <div class="sz-form-row">
          <label>Derivation path <span style="color:var(--sz-faded);font-weight:normal">(optional)</span></label>
          <input type="text" id="${idPrefix}-deriv" class="is-data" placeholder="0/3">
          <div class="sz-field-hint">Path suffix for the coin you are spending (from the account xpub). In ElectrumSV: View → Coins → Derivation column, or right-click the row.</div>
        </div>
      </div>
    </details>
  `;
}

function tryReadUtxoForm(prefix: string): Utxo | null {
  const errEl = document.getElementById(`${prefix}-error`) as HTMLElement | null;
  try {
    const utxo = readUtxoForm(prefix);
    if (errEl) { errEl.style.display = 'none'; errEl.textContent = ''; }
    return utxo;
  } catch (err) {
    if (errEl) {
      errEl.textContent = `! ${String(err)}`;
      errEl.style.display = '';
      const details = document.getElementById(`${prefix}-details`) as HTMLDetailsElement | null;
      if (details) details.open = true;
    }
    return null;
  }
}

// ── Boot ──

if (typeof globalThis.crypto?.subtle?.digest !== 'function') {
  // browsers only expose crypto.subtle in secure contexts (HTTPS, .onion, localhost).
  // show a legible error rather than an obscure crash later when hashing is attempted.
  contentEl.innerHTML = `
    <div class="sz-content">
      <div class="sz-section">
        <div class="sz-section-head">Secure context required</div>
        <div class="sz-section-body">
          <div class="sz-warn-block">
            <div class="sz-warn">
              <span class="sz-warn-label">Error</span>
              The Web Crypto API (<code>crypto.subtle</code>) is not available in this context.
              Browsers only expose it on HTTPS, .onion addresses, and http://localhost.
            </div>
          </div>
          <p style="margin-top:1rem;font-size:0.875rem">Access the editor via one of:</p>
          <ul style="font-size:0.875rem;line-height:1.8;margin-top:0.25rem">
            <li>The operator-provided <strong>.onion address</strong> in Tor Browser &mdash; recommended</li>
            <li>An <strong>https://</strong> origin with a valid certificate</li>
            <li><strong>http://localhost</strong> for local development only</li>
          </ul>
          <p style="margin-top:1rem;font-size:0.8rem;color:var(--sz-text-lo)">
            Accessing via a clearnet http:// URL also exposes your IP address to the server.
            Use Tor Browser and the .onion address.
          </p>
        </div>
      </div>
    </div>`;
} else {
  render();

  // Guide button lives in the header (outside #content) — wire once at boot.
  document.getElementById('guide-btn')?.addEventListener('click', () => {
    guideOpen = true;
    render();
  });
}
