import { describe, it, expect } from 'vitest';
import { buildChunkTxs, buildAnchorTx } from '../../src/tx/builder';
import { buildManifest } from '../../src/core/manifest';
import { chunkData } from '../../src/core/chunker';
import { makeTestUtxo } from './test-utxo';

const FAKE_TXID = 'a'.repeat(64);

function makeUtxo(satoshis = 100_000_000n) {
  return makeTestUtxo({ txid: FAKE_TXID, satoshis });
}

function makeUtxoPlain(satoshis = 100_000_000n) {
  return {
    txid: FAKE_TXID,
    vout: 0,
    satoshis,
    lockingScriptHex: '76a914' + 'b'.repeat(40) + '88ac',
    pubKeyHashHex: 'b'.repeat(40),
  };
}

async function makeManifestAndChunks(content: Uint8Array) {
  const { manifest } = await buildManifest(
    [{ filename: 'test.txt', contentType: 'text/plain', data: content }],
  );
  return { manifest };
}

describe('buildChunkTxs', () => {
  it('returns one bundle per chunk', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    const chunkArr = [content]; // single chunk
    const bundles = await buildChunkTxs(manifest, chunkArr, makeUtxo());

    expect(bundles).toHaveLength(1);
    expect(typeof bundles[0]!.hexTx).toBe('string');
    expect(bundles[0]!.hexTx.length).toBeGreaterThan(0);
    expect(typeof bundles[0]!.signBundleJson).toBe('string');
    expect(JSON.parse(bundles[0]!.signBundleJson).unsigned).toBe(true);
    expect(bundles[0]!.electrumJsonTx).not.toBeNull();
    expect(JSON.parse(bundles[0]!.electrumJsonTx!).complete).toBe(false);
    expect(bundles[0]!.signerInputs).toHaveLength(1);
    expect(bundles[0]!.feeEstimateSats).toBeGreaterThan(0n);
  });

  it('throws if chunkDataArray length mismatches manifest', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    // Pass 2 data arrays but manifest has 1 chunk
    await expect(buildChunkTxs(manifest, [content, content], makeUtxo())).rejects.toThrow(
      /chunkDataArray.length/,
    );
  });

  it('throws if insufficient funds', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    await expect(buildChunkTxs(manifest, [content], makeUtxo(1n))).rejects.toThrow(
      /Insufficient funds/,
    );
  });

  it('omits ElectrumSV JSON when wallet metadata is absent', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    const bundles = await buildChunkTxs(manifest, [content], makeUtxoPlain());
    expect(bundles[0]!.electrumJsonTx).toBeNull();
    expect(JSON.parse(bundles[0]!.signBundleJson).unsigned).toBe(true);
  });

  it('each bundle description mentions chunk index', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    const bundles = await buildChunkTxs(manifest, [content], makeUtxo());
    expect(bundles[0]!.description).toContain('Chunk 0');
  });
});

describe('buildAnchorTx', () => {
  it('produces a valid bundle when chunk txids match manifest', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    const chunkTxids = [FAKE_TXID];
    const bundle = await buildAnchorTx(manifest, chunkTxids, makeUtxo());

    expect(typeof bundle.hexTx).toBe('string');
    expect(bundle.hexTx.length).toBeGreaterThan(0);
    expect(JSON.parse(bundle.signBundleJson).unsigned).toBe(true);
    expect(bundle.electrumJsonTx).not.toBeNull();
    expect(bundle.signerInputs).toHaveLength(1);
    expect(bundle.feeEstimateSats).toBeGreaterThan(0n);
  });

  it('throws when chunkTxids.length does not match manifest.chunkTree.length', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    // Manifest has 1 chunk; pass 0 txids
    await expect(buildAnchorTx(manifest, [], makeUtxo())).rejects.toThrow(
      /buildAnchorTx requires one txid per chunk/,
    );
  });

  it('throws if insufficient funds for anchor tx', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    await expect(buildAnchorTx(manifest, [FAKE_TXID], makeUtxo(1n))).rejects.toThrow(
      /Insufficient funds/,
    );
  });

  it('anchor description mentions manifest hash', async () => {
    const content = new Uint8Array(500).fill(0x41);
    const { manifest } = await makeManifestAndChunks(content);
    const bundle = await buildAnchorTx(manifest, [FAKE_TXID], makeUtxo());
    expect(bundle.description).toContain('Anchor');
    expect(bundle.description).toContain('manifest');
  });
});
