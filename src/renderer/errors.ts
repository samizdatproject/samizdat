export type RendererErrorCode =
  | 'TX_NOT_FOUND'
  | 'PAYLOAD_DECODE_FAILED'
  | 'MANIFEST_INVALID'
  | 'HASH_MISMATCH'
  | 'CHUNK_MISSING'
  | 'CHUNK_HASH_MISMATCH'
  | 'ROOT_HASH_MISMATCH'
  | 'UNSUPPORTED_CONTENT_TYPE';

export class RendererError extends Error {
  readonly code: RendererErrorCode;

  constructor(code: RendererErrorCode, message: string) {
    super(message);
    this.name = 'RendererError';
    this.code = code;
  }
}
