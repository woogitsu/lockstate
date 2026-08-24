import type { RunLength, RunLengthDecodeContract } from '../codec/run-length';
import { encodeRunLengths, expandRunLengthsInto } from '../codec/run-length';
import type { EntityStoreSnapshot } from './entity-store';

/**
 * A `[value, length]` run. Matches the run-length convention the world
 * snapshot already uses for terrain/edge/zoning planes, so a save carries one
 * RLE shape rather than two -- and, since #123 item 3, one *implementation*
 * rather than two as well: this is `RunLength` from
 * `src/simulation/codec/run-length.ts`, which both planes encode and decode
 * with. The alias stays because "entity liveness run" is what the save
 * schema and `src/persistence/entity-codec.ts` callers name it.
 */
export type EntityLivenessRun = RunLength;

/**
 * JSON-safe, **population-shaped** form of `EntityStoreSnapshot`.
 *
 * Typed arrays are not valid JSON, so the store's three parallel arrays are
 * widened to plain JSON. The live `EntityStore` keeps its SoA layout exactly
 * as ADR 0005 specifies -- nothing here changes how the store is represented
 * in memory, only how its ID-liveness ledger is written down.
 *
 * This lives in the simulation layer rather than the persistence layer
 * because both consumers need it and only one of them may import the other:
 * a session snapshot crosses the worker protocol boundary, whose
 * `structured-clone` payload is declared as `jsonValue`, so an unencoded
 * typed array would be rejected by the main thread's own message decoder
 * before it ever reached a save. `src/persistence/entity-codec.ts`
 * re-exports these for persistence callers.
 *
 * **Why run-length encoding, not plain arrays (#50).** The previous encoding
 * wrote `generations`, `freeIndices` and `alive` across the store's full
 * allocated `capacity`, so a save's `entities` section cost the same 29.4 KiB
 * whether the prison held 25 prisoners or 3,000 -- 45% of a small envelope,
 * all of it padding for slots that do not exist, and growing with
 * `DEFAULT_PRISONER_CAPACITY` rather than with play. Both `generations` and
 * `alive` are long uniform runs by construction (every never-allocated slot
 * is zero; a store with no destroys is one run), so RLE makes the cost
 * proportional to the *structure of liveness* -- bounded by the number of
 * live/dead transitions, itself bounded by the live population -- instead of
 * to the allocation. RLE also absorbs the unallocated tail into a single run,
 * so no separate truncate/pad step is needed and `capacity` stays exactly
 * reconstructible: it is stored explicitly and cross-checked against the run
 * lengths on decode.
 *
 * `freeIndices` is *not* run-length encoded: it is a stack of arbitrary
 * indices with no run structure. Only its live prefix (`freeCount` entries)
 * is written, because the remainder of the store's `freeIndices` array is
 * stale data that `EntityStore.spawn` can never read -- it only ever reads
 * below `freeCount`. `freeCount` itself is therefore not stored; it *is*
 * `freeIndices.length`, so the two cannot disagree.
 *
 * This covers only entity-ID liveness bookkeeping. Per-component payloads
 * (e.g. `ComponentBitset`, `TransformComponent`) are deliberately excluded
 * until a component registry exists to enumerate them generically -- no
 * runtime currently attaches components to an `EntityStore`, so inventing
 * that registry now would be an unreviewed architecture decision rather
 * than persistence of a real contract.
 */
export interface EncodedEntityStoreSnapshot {
  /** Allocated slot count. Restored stores allocate exactly this many slots. */
  readonly capacity: number;
  readonly nextAvailableIndex: number;
  readonly maxActiveIndex: number;
  /** Run-length encoded generation counters; run lengths sum to `capacity`. */
  readonly generations: readonly EntityLivenessRun[];
  /** The live free-list prefix, in stack order. Its length is the store's `freeCount`. */
  readonly freeIndices: readonly number[];
  /** Run-length encoded liveness flags (0/1); run lengths sum to `capacity`. */
  readonly alive: readonly EntityLivenessRun[];
}

/**
 * Run-length encodes a dense numeric array. A zero-length input encodes to
 * zero runs.
 *
 * Re-exported from `src/simulation/codec/run-length.ts` rather than
 * implemented here (#123 item 3): the world snapshot's planes encode with the
 * same function now, so the save cannot grow two encoders again. The name
 * stays because persistence callers reach it through
 * `src/persistence/entity-codec.ts` under this name.
 */
export { encodeRunLengths };

/**
 * Per-plane halves of the shared decoder's contract.
 *
 * `maxValue` is the target array's own maximum, so a save cannot smuggle a
 * value that only survives by `TypedArray.fill` coercion -- before #123 item
 * 3 this path checked no value at all, and a corrupt `alive` run of `999`
 * restored silently as `231`, `-1` as `255` and `NaN` as `0`. `fail` builds
 * the `RangeError` this codec has always thrown, with the messages it has
 * always used; the two additional failure kinds are the two checks this path
 * did not previously make.
 */
function entityRunContract(field: string, maxValue: number): RunLengthDecodeContract {
  return {
    maxValue,
    fail: (failure): never => {
      switch (failure.kind) {
        case 'malformed-run':
          throw new RangeError(`Entity snapshot "${field}" has a run that is not a [value, length] tuple.`);
        case 'value-out-of-range':
          throw new RangeError(
            `Entity snapshot "${field}" has a run value outside 0..${failure.maxValue} (${String(failure.value)}).`,
          );
        case 'invalid-length':
          throw new RangeError(`Entity snapshot "${field}" has a non-positive run length (${String(failure.length)}).`);
        case 'exceeds-capacity':
          throw new RangeError(`Entity snapshot "${field}" runs cover more than ${failure.capacity} slots.`);
        case 'length-mismatch':
          throw new RangeError(
            `Entity snapshot "${field}" runs cover ${failure.covered} slots, expected ${failure.capacity}.`,
          );
      }
    },
  };
}

/** `generations` is a `Uint16Array`; a counter above this could only ever have been stored by coercion. */
const GENERATION_MAX_VALUE = 65_535;

/** `alive` is a `Uint8Array`. The encoder writes only 0 or 1, but the plane's width is what a decode can honestly assert. */
const ALIVE_MAX_VALUE = 255;

export function encodeEntityStoreSnapshot(snapshot: EntityStoreSnapshot): EncodedEntityStoreSnapshot {
  const { capacity, freeCount } = snapshot;
  if (snapshot.generations.length !== capacity || snapshot.alive.length !== capacity) {
    throw new RangeError('Entity snapshot generations/alive arrays must be exactly `capacity` long.');
  }
  if (freeCount < 0 || freeCount > snapshot.freeIndices.length) {
    throw new RangeError(`Entity snapshot freeCount (${freeCount}) exceeds its free-list array.`);
  }

  return {
    capacity,
    nextAvailableIndex: snapshot.nextAvailableIndex,
    maxActiveIndex: snapshot.maxActiveIndex,
    generations: encodeRunLengths(snapshot.generations),
    // Only the live prefix; everything above `freeCount` is stack garbage
    // that `EntityStore.spawn` structurally cannot read.
    freeIndices: Array.from(snapshot.freeIndices.subarray(0, freeCount)),
    alive: encodeRunLengths(snapshot.alive),
  };
}

/**
 * Rebuilds the full-capacity `EntityStoreSnapshot` an `EntityStore` expects.
 * The returned arrays are always exactly `capacity` long, so
 * `EntityStore.loadSnapshot` sees the same shape it always has; the free-list
 * tail above `freeCount` is restored as zeroes rather than as the original
 * stack garbage, which is unobservable because nothing ever reads it.
 */
export function decodeEntityStoreSnapshot(encoded: EncodedEntityStoreSnapshot): EntityStoreSnapshot {
  const capacity = encoded.capacity;
  if (!Number.isInteger(capacity) || capacity < 0) {
    throw new RangeError(`Entity snapshot capacity must be a non-negative integer, got ${capacity}.`);
  }
  if (encoded.freeIndices.length > capacity) {
    throw new RangeError(`Entity snapshot free list (${encoded.freeIndices.length}) exceeds capacity (${capacity}).`);
  }

  const generations = new Uint16Array(capacity);
  expandRunLengthsInto(encoded.generations, generations, entityRunContract('generations', GENERATION_MAX_VALUE));

  const alive = new Uint8Array(capacity);
  expandRunLengthsInto(encoded.alive, alive, entityRunContract('alive', ALIVE_MAX_VALUE));

  const freeIndices = new Uint32Array(capacity);
  freeIndices.set(encoded.freeIndices);

  return {
    capacity,
    nextAvailableIndex: encoded.nextAvailableIndex,
    maxActiveIndex: encoded.maxActiveIndex,
    freeCount: encoded.freeIndices.length,
    generations,
    freeIndices,
    alive,
  };
}
