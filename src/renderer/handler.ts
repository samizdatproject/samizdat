// Stateless renderer request handler.
// Given a txid, runs the full verify → reconstruct pipeline and returns a
// RendererResponse that any HTTP server can forward to the client.

import type { ChainReader, ChunkSource } from './chain';
import { resolveManifest } from './resolver';
import { fetchAndVerifyChunks } from './fetcher';
import { reconstructFiles, type ReconstructedFile } from './reconstruct';
import { sanitizeHtml, stripExif } from './sanitize';
import { markdownToHtml } from './markdown';
import { buildZip } from './zip';
import { verifyMerkleRoot } from '../core/manifest';
import { RendererError } from './errors';

export interface RendererResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

// Strict CSP: no remote resources, no script execution, no framing.
const RENDERER_CSP = [
  "default-src 'self'",
  "img-src 'self' data:",
  "script-src 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'none'",
  "base-uri 'self'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': RENDERER_CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
};

// Renders content identified by `txid` (anchor transaction).
// Verification pipeline: resolveManifest → verifyMerkleRoot → fetchAndVerifyChunks
//   → reconstructFiles → serve.
// Any verification failure returns the "Unverified content" error page (422).
export async function handleRenderRequest(
  txid: string,
  chain: ChainReader,
  source: ChunkSource,
  chunkTxids?: string[],
): Promise<RendererResponse> {
  try {
    const { manifest, chunkTxids: anchorChunkTxids } = await resolveManifest(txid, chain);

    const rootOk = await verifyMerkleRoot(manifest);
    if (!rootOk) {
      return unverifiedResponse('Merkle root verification failed: chunk tree is inconsistent');
    }

    const verifiedChunks = await fetchAndVerifyChunks(
      manifest,
      source,
      chunkTxids ?? anchorChunkTxids,
    );
    const files = await reconstructFiles(manifest, verifiedChunks);

    return serveFiles(files);
  } catch (err) {
    if (err instanceof RendererError) {
      return unverifiedResponse(`${err.code}: ${err.message}`);
    }
    return unverifiedResponse(`Internal error during verification`);
  }
}

function serveFiles(files: ReconstructedFile[]): RendererResponse {
  if (files.length === 0) return unverifiedResponse('Manifest contains no files');

  // Single file: serve by content type
  if (files.length === 1) return serveSingle(files[0]!);

  // Multiple files: package as a verified ZIP download
  const zip = buildZip(files.map(f => ({ name: f.filename, data: f.data })));
  return {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="samizdat-content.zip"',
    },
    body: zip,
  };
}

function serveSingle(file: ReconstructedFile): RendererResponse {
  const { filename, contentType, data } = file;
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');

  if (contentType === 'text/html' || contentType === 'text/markdown') {
    const raw = new TextDecoder().decode(data);
    const html = contentType === 'text/markdown' ? markdownToHtml(raw) : raw;
    const safeHtml = sanitizeHtml(html);
    return {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': 'text/html; charset=utf-8' },
      body: new TextEncoder().encode(safeHtml),
    };
  }

  if (contentType.startsWith('image/')) {
    const clean = stripExif(data);
    return {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': contentType },
      body: clean,
    };
  }

  if (contentType === 'application/pdf') {
    // PDF: always force download — no inline rendering
    return {
      status: 200,
      headers: {
        ...SECURITY_HEADERS,
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${safeName}"`,
      },
      body: data,
    };
  }

  if (contentType.startsWith('text/')) {
    return {
      status: 200,
      headers: { ...SECURITY_HEADERS, 'Content-Type': `${contentType}; charset=utf-8` },
      body: data,
    };
  }

  // Everything else: generic download
  return {
    status: 200,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${safeName}"`,
    },
    body: data,
  };
}

export function unverifiedResponse(reason: string): RendererResponse {
  const escaped = reason.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="referrer" content="no-referrer">
<title>Content Not Verified — SAMIZDAT</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:'Courier New',Courier,monospace;font-size:1rem;line-height:1.65;
    color:#0f172a;background:#f8fafc;min-height:100vh;display:flex;flex-direction:column;
  }
  header{
    background:#ffffff;border-bottom:1px solid #e2e8f0;padding:0 2rem;height:46px;
    display:flex;align-items:center;justify-content:space-between;flex-shrink:0;
  }
  .name{font-size:.8rem;font-weight:700;letter-spacing:.2em;text-transform:uppercase;color:#0f172a;}
  .ver{font-size:.65rem;letter-spacing:.08em;color:#6b7280;}
  main{max-width:720px;width:100%;margin:0 auto;padding:2.5rem 2rem;flex:1;}
  .section{border:1px solid #fecaca;border-left:3px solid #7f1d1d;background:#fef2f2;margin-bottom:1.5rem;}
  .section-head{
    border-bottom:1px solid #fecaca;padding:.625rem 1.25rem;
    font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;
    color:#7f1d1d;font-weight:700;
  }
  .section-body{padding:1.25rem;}
  .reason{
    background:#f1f5f9;border:1px solid #e2e8f0;border-left:2px solid #0f172a;
    padding:.75rem 1rem;font-family:'Courier New',Courier,monospace;font-size:.65rem;
    word-break:break-all;line-height:1.6;color:#1e293b;margin-top:1rem;
  }
  p{margin:.75rem 0;font-size:.9375rem;color:#0f172a;}
  .note{color:#4b5563;font-size:.875rem;margin-top:1rem;border-top:1px solid #e2e8f0;padding-top:1rem;}
  footer{
    background:#f8fafc;border-top:1px solid #e2e8f0;padding:0 2rem;height:34px;
    display:flex;align-items:center;font-size:.6rem;letter-spacing:.1em;
    text-transform:uppercase;color:#4b5563;
  }
</style>
</head>
<body>
<header>
  <span class="name">SAMIZDAT</span>
  <span class="ver">renderer</span>
</header>
<main>
  <div class="section">
    <div class="section-head">! content not verified</div>
    <div class="section-body">
      <p>This content could not be verified and was <strong>not rendered</strong>.
      Cryptographic verification failed. No partial content is shown.</p>
      <div class="reason">${escaped}</div>
      <p class="note">This renderer only presents content after every chunk hash and the Merkle
      root are independently verified against the on-chain anchor.
      If you believe this content is valid, verify the anchor txid on a BSV block explorer
      and confirm the manifest hash matches the receipt you received from the author.</p>
    </div>
  </div>
</main>
<footer>content not shown &mdash; verification failed</footer>
</body>
</html>`;
  return {
    status: 422,
    headers: {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/html; charset=utf-8',
    },
    body: new TextEncoder().encode(html),
  };
}
