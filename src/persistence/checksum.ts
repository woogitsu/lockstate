import { deterministicStateHash } from '../simulation/determinism/canonical';
import type { JsonValue } from '../shared/json';

/**
 * Detects corruption/accidental mismatch in a save payload. This reuses the
 * simulation's canonical hash (stable across equivalent key insertion
 * order) rather than a new algorithm; it is not a cryptographic signature.
 */
export function computeSaveChecksum(payload: JsonValue): string {
  return deterministicStateHash(payload);
}
