import type { SaveEnvelope } from './save-schema';

/**
 * Byte size of the canonical JSON encoding. This is the size/version hook
 * `docs/BENCHMARKING.md`'s "Planned scenario families" and issue #18 call
 * for: it lets a future storage backend decide when compression is worth
 * it without this module choosing an algorithm.
 */
export function estimateSaveEnvelopeByteSize(envelope: SaveEnvelope): number {
  return new TextEncoder().encode(JSON.stringify(envelope)).length;
}
