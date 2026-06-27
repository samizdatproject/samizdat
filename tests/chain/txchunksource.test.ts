import { describe, it, expect } from 'vitest';
import { TxChunkSource } from '../../src/chain/tx-chunk-source';
import { MockChainReader } from '../../src/renderer/chain';
import { encodeChunkPayload } from '../../src/tx/encoding';

describe('TxChunkSource', () => {
  it('decodes chunk data from a chunk tx script', async () => {
    const data = new TextEncoder().encode('Hello, SAMIZDAT!');
    const script = encodeChunkPayload(0, data);
    const chain = new MockChainReader().add('chunk-tx-1', script);
    const source = new TxChunkSource(chain);
    const result = await source.fetchChunk('anyhash', 'chunk-tx-1');
    expect(result).toEqual(data);
  });

  it('throws CHUNK_MISSING when no txid is provided', async () => {
    const source = new TxChunkSource(new MockChainReader());
    await expect(source.fetchChunk('anyhash')).rejects.toMatchObject({ code: 'CHUNK_MISSING' });
  });

  it('propagates RendererError from the ChainReader unchanged', async () => {
    const source = new TxChunkSource(new MockChainReader()); // empty — txid not found
    await expect(source.fetchChunk('anyhash', 'missing-tx')).rejects.toMatchObject({
      code: 'TX_NOT_FOUND',
    });
  });

  it('throws CHUNK_MISSING when the tx blob is not a valid chunk payload', async () => {
    const badBlob = new Uint8Array([0x01, 0x42, 0x41, 0x44]); // not a SAMIZDAT blob
    const chain = new MockChainReader().add('bad-tx', badBlob);
    const source = new TxChunkSource(chain);
    await expect(source.fetchChunk('anyhash', 'bad-tx')).rejects.toMatchObject({
      code: 'CHUNK_MISSING',
    });
  });

  it('preserves binary chunk data exactly', async () => {
    const binary = new Uint8Array([0x00, 0xff, 0x00, 0xde, 0xad, 0xbe, 0xef]);
    const script = encodeChunkPayload(3, binary);
    const chain = new MockChainReader().add('bin-tx', script);
    const source = new TxChunkSource(chain);
    const result = await source.fetchChunk('binhash', 'bin-tx');
    expect(result).toEqual(binary);
  });

  it('correctly extracts chunk data regardless of chunk index', async () => {
    const data = new TextEncoder().encode('chunk at index 7');
    const script = encodeChunkPayload(7, data);
    const chain = new MockChainReader().add('idx7-tx', script);
    const source = new TxChunkSource(chain);
    const result = await source.fetchChunk('hash7', 'idx7-tx');
    expect(result).toEqual(data);
  });
});
