/**
 * The one run-length codec the save format uses.
 *
 * Two planes of the save carry `[value, length]` runs: the world snapshot's
 * `terrain` / `topEdge` / `leftEdge` / `zoning` chunk layers
 * (`src/simulation/world/sparse-world.ts`) and the entity store's
 * `generations` / `alive` liveness ledger
 * (`src/simulation/entity/entity-codec.ts`). `entity-codec.ts` chose that
 * tuple shape deliberately so "a save carries one RLE shape rather than
 * two" -- but until #123 item 3 it carried one shape and *two*
 * implementations, whose decoders validated different things: the world
 * decoder rejected a value outside 0-255, the entity decoder accepted any
 * value at all and let `TypedArray.fill` coerce it (`999` became `231`,
 * `-1` became `255`, `NaN` became `0`). The same corrupt save was a typed
 * error in one plane and silent acceptance in the other.
 *
 * So both callers now share this module, and the two things that legitimately
 * differ between them are **parameters** rather than divergent code:
 *
 * - **The value range.** A world plane is a `Uint8Array`, so `0-255`. The
 *   entity ledger has two planes with different widths -- `alive` is a
 *   `Uint8Array` (`0-255`) and `generations` a `Uint16Array` (`0-65535`).
 *   `maxValue` says which, per call.
 * - **The error type.** `WorldSnapshotError` is part of the world snapshot's
 *   decode contract and `RangeError` is part of the entity codec's; flattening
 *   either into a shared generic error would weaken a contract to share code.
 *   So this module never constructs an error. It describes the failure as a
 *   `RunLengthFailure` and calls the caller's `fail`, which builds its own
 *   error type with its own message.
 *
 * A third caller joined the two above without crossing any tree boundary:
 * `decodeRenderLayer` in `src/simulation/presentation/world-projection.ts`
 * decodes the `world/render-snapshot` worker-projection channel's payload
 * rather than a save, and until #182 it was a third hand-rolled
 * implementation of this same shape with its own inlined validation --
 * reported by #123 item 3 as out of that issue's scope, since that issue
 * named the save-format pair only. #182 folded it in: `world-projection.ts`
 * already lives under `src/simulation/`, so calling `expandRunLengthsInto`
 * from there is simulation-internal, not a presentation module reaching into
 * simulation -- no boundary rule in `tests/unit/*-boundaries.test.ts` names
 * `src/simulation/presentation/**` as a presentation tier, and neither
 * `src/ui/**` nor `src/rendering/**` imports this module or `world-projection.ts`
 * directly. It keeps its own `RangeError` messages via `fail`, collapsed the
 * same way the original loop collapsed them, so nothing that catches or
 * matches on those two strings changes.
 */

/** A `[value, length]` run. `length` is a count of slots, never an index. */
export type RunLength = readonly [value: number, length: number];

/** Why a run sequence could not be expanded. Each caller renders these in its own vocabulary. */
export type RunLengthFailure =
  /** The run was not a two-element tuple. */
  | { readonly kind: 'malformed-run'; readonly run: unknown }
  /** The run's value was not an integer within `0..maxValue`. */
  | { readonly kind: 'value-out-of-range'; readonly value: unknown; readonly maxValue: number }
  /** The run's length was not a positive safe integer. */
  | { readonly kind: 'invalid-length'; readonly length: unknown }
  /** Expanding the run would write past `capacity`. */
  | { readonly kind: 'exceeds-capacity'; readonly capacity: number }
  /** The runs ended short of `capacity`. */
  | { readonly kind: 'length-mismatch'; readonly covered: number; readonly capacity: number };

export interface RunLengthDecodeContract {
  /**
   * Inclusive upper bound on a run's value. Every value must be an integer in
   * `0..maxValue`; pass the target array's own maximum (`255` for a
   * `Uint8Array`, `65535` for a `Uint16Array`) so a save cannot smuggle a
   * value that only survives by silent `fill` coercion.
   */
  readonly maxValue: number;
  /** Builds and throws the caller's own error type. Must never return. */
  readonly fail: (failure: RunLengthFailure) => never;
}

/**
 * Run-length encodes a dense numeric array. A zero-length input encodes to
 * zero runs.
 *
 * This is the single encoder behind both save planes. Before #123 item 3 the
 * world and entity paths had one encoder each; executing both over an empty
 * input, a single element, a single 1,024-slot run, alternating values, a
 * banded full 32x32 plane, the 0/255 boundaries and all 256 byte values
 * produced identical run arrays in every case, which is why unifying them
 * changes no save's contents.
 */
export function encodeRunLengths(values: ArrayLike<number>): RunLength[] {
  const runs: RunLength[] = [];
  let index = 0;
  while (index < values.length) {
    const value = values[index]!;
    let length = 1;
    while (index + length < values.length && values[index + length] === value) length += 1;
    runs.push([value, length]);
    index += length;
  }
  return runs;
}

/**
 * Expands `runs` into `target`, which must already be sized to the expected
 * slot count.
 *
 * Throws (via `contract.fail`) rather than silently truncating, zero-filling
 * or coercing. A run total that disagrees with the target's length means the
 * save is inconsistent, and restoring a partially-populated plane -- a
 * liveness ledger especially -- would corrupt what reads it instead of
 * failing loudly.
 */
export function expandRunLengthsInto(
  runs: readonly RunLength[],
  target: Uint8Array | Uint16Array,
  contract: RunLengthDecodeContract,
): void {
  let offset = 0;
  for (const run of runs) {
    if (!Array.isArray(run) || run.length !== 2) {
      contract.fail({ kind: 'malformed-run', run });
    }
    const [value, length] = run;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > contract.maxValue) {
      contract.fail({ kind: 'value-out-of-range', value, maxValue: contract.maxValue });
    }
    if (typeof length !== 'number' || !Number.isSafeInteger(length) || length <= 0) {
      contract.fail({ kind: 'invalid-length', length });
    }
    if (offset + length > target.length) {
      contract.fail({ kind: 'exceeds-capacity', capacity: target.length });
    }
    target.fill(value, offset, offset + length);
    offset += length;
  }

  if (offset !== target.length) {
    contract.fail({ kind: 'length-mismatch', covered: offset, capacity: target.length });
  }
}
