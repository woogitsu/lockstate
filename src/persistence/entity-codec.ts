import type { EntityStoreSnapshot } from '../simulation/entity/entity-store';

/**
 * JSON-safe form of `EntityStoreSnapshot`. Typed arrays are not valid JSON,
 * so they are widened to plain number arrays at the persistence boundary;
 * the live `EntityStore` API is unaffected.
 *
 * This covers only entity-ID liveness bookkeeping. Per-component payloads
 * (e.g. `ComponentBitset`, `TransformComponent`) are deliberately excluded
 * until a component registry exists to enumerate them generically — no
 * runtime currently attaches components to an `EntityStore`, so inventing
 * that registry now would be an unreviewed architecture decision rather
 * than persistence of a real contract.
 */
export interface EncodedEntityStoreSnapshot {
  readonly capacity: number;
  readonly nextAvailableIndex: number;
  readonly maxActiveIndex: number;
  readonly freeCount: number;
  readonly generations: readonly number[];
  readonly freeIndices: readonly number[];
  readonly alive: readonly number[];
}

export function encodeEntityStoreSnapshot(snapshot: EntityStoreSnapshot): EncodedEntityStoreSnapshot {
  return {
    capacity: snapshot.capacity,
    nextAvailableIndex: snapshot.nextAvailableIndex,
    maxActiveIndex: snapshot.maxActiveIndex,
    freeCount: snapshot.freeCount,
    generations: Array.from(snapshot.generations),
    freeIndices: Array.from(snapshot.freeIndices),
    alive: Array.from(snapshot.alive),
  };
}

export function decodeEntityStoreSnapshot(encoded: EncodedEntityStoreSnapshot): EntityStoreSnapshot {
  return {
    capacity: encoded.capacity,
    nextAvailableIndex: encoded.nextAvailableIndex,
    maxActiveIndex: encoded.maxActiveIndex,
    freeCount: encoded.freeCount,
    generations: Uint16Array.from(encoded.generations),
    freeIndices: Uint32Array.from(encoded.freeIndices),
    alive: Uint8Array.from(encoded.alive),
  };
}
