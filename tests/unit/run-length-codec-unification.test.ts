import { describe, expect, it } from 'vitest';
import { encodeRunLengths } from '../../src/simulation/codec/run-length';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import {
  decodeEntityStoreSnapshot,
  encodeEntityStoreSnapshot,
  type EncodedEntityStoreSnapshot,
} from '../../src/simulation/entity/entity-codec';
import { decodeTerrainRle, encodeTerrainRle, WorldSnapshotError, type TerrainRle } from '../../src/simulation/world/sparse-world';
import { decodeRenderLayer } from '../../src/simulation/presentation/world-projection';

/**
 * #123 item 3: one declared wire format, two implementations, asymmetric
 * validation.
 *
 * The save declares a single `[value, length]` run shape -- `entity-codec.ts`
 * says so in its own header -- and until now carried two encoders and two
 * decoders for it. The decoders disagreed about what a corrupt save is:
 * `decodeTerrainRle` rejected a value outside 0-255 with a typed
 * `WorldSnapshotError`, while the entity path checked no value at all and let
 * `TypedArray.fill` coerce it, so `999` became `231` and `-1` became `255`.
 *
 * Both now decode through `src/simulation/codec/run-length.ts`, so what these
 * tests guard is the two properties that made sharing safe and the one that
 * makes it worth doing:
 *
 * 1. **The encoding did not change.** The shared encoder's output is pinned
 *    on the four shapes #123 names, so a future "optimisation" of it cannot
 *    quietly change what a save contains. The two encoders were verified
 *    identical by execution before being merged into one; with only one left
 *    there is nothing to compare them against any more, so the pin replaces
 *    the comparison.
 * 2. **Every valid save still decodes to exactly what it decoded to before.**
 *    Encode-then-decode is the identity on both planes. The added checks are
 *    refusals only -- they never alter a successful decode -- and no run the
 *    encoder can emit trips one, which is why this needs no migration.
 * 3. **The range check reaches both callers.** It is a `maxValue` parameter,
 *    not a difference between two copies, and each plane's own error type
 *    survives: `WorldSnapshotError` for the world snapshot, `RangeError` for
 *    the entity ledger.
 */

const SHAPES: readonly (readonly [label: string, values: readonly number[]])[] = [
  ['empty input', []],
  ['a single run', new Array(1024).fill(3)],
  ['alternating values', Array.from({ length: 1024 }, (_, index) => index % 2)],
  ['a full 32x32 plane', Array.from({ length: 1024 }, (_, index) => (index >> 4) % 256)],
];

describe('the shared run-length encoder still encodes what both planes always encoded', () => {
  it('pins the run shape #123 measured the two encoders agreeing on', () => {
    expect(encodeRunLengths([])).toEqual([]);
    expect(encodeRunLengths([7])).toEqual([[7, 1]]);
    expect(encodeRunLengths(new Array(1024).fill(3))).toEqual([[3, 1024]]);
    expect(encodeRunLengths([0, 255, 255, 0, 128])).toEqual([
      [0, 1],
      [255, 2],
      [0, 1],
      [128, 1],
    ]);
    // An alternating plane is the worst case: one run per slot, and the case
    // where an off-by-one in the inner scan would show up as a merged run.
    expect(encodeRunLengths([1, 0, 1, 0])).toEqual([
      [1, 1],
      [0, 1],
      [1, 1],
      [0, 1],
    ]);
  });

  it('is the same function the world plane encodes with, on every shape', () => {
    for (const [label, values] of SHAPES) {
      const buffer = Uint8Array.from(values);
      expect(encodeTerrainRle(buffer), label).toEqual(encodeRunLengths(buffer));
    }
  });
});

describe('no valid save decodes differently than it did before', () => {
  it('round-trips every world plane shape byte-for-byte', () => {
    for (const [label, values] of SHAPES) {
      const buffer = Uint8Array.from(values);
      expect(decodeTerrainRle(encodeTerrainRle(buffer), buffer.length), label).toEqual(buffer);
    }
  });

  it('round-trips an entity liveness ledger with holes in it', () => {
    const store = new EntityStore(64);
    const ids = Array.from({ length: 40 }, () => store.spawn());
    // Destroy a scattered subset so `alive` is many runs and `generations`
    // is non-uniform -- a single-run ledger would round-trip vacuously.
    for (let index = 0; index < ids.length; index += 3) store.destroy(ids[index]!);
    const before = store.getSnapshot();
    const decoded = decodeEntityStoreSnapshot(encodeEntityStoreSnapshot(before));

    expect(decoded.capacity).toBe(before.capacity);
    expect(decoded.generations).toEqual(before.generations);
    expect(decoded.alive).toEqual(before.alive);
    expect(decoded.freeCount).toBe(before.freeCount);
    expect(decoded.nextAvailableIndex).toBe(before.nextAvailableIndex);
    expect(decoded.maxActiveIndex).toBe(before.maxActiveIndex);
  });

  it('accepts a full-width generation counter, which is why the two planes cannot share one bound', () => {
    // `generations` is a `Uint16Array`. A save legitimately carrying 65,535
    // must still decode; giving both planes the world's 0-255 bound would
    // reject it, which would be a migration rather than a hardening.
    const store = new EntityStore(4);
    const encoded = encodeEntityStoreSnapshot(store.getSnapshot());
    const decoded = decodeEntityStoreSnapshot({ ...encoded, generations: [[65_535, 4]] });
    expect([...decoded.generations]).toEqual([65_535, 65_535, 65_535, 65_535]);
  });
});

describe('the range check is one parameter, and it reaches both callers', () => {
  /**
   * Values out of range on every plane, whatever its width. 999 is
   * deliberately absent: it is out of range for a `Uint8Array` plane and
   * perfectly valid for a `Uint16Array` one, which is the whole reason the
   * bound is a per-call parameter rather than a constant inside the codec.
   * The test below covers it per plane.
   */
  const OUT_OF_RANGE: readonly (readonly [label: string, value: number])[] = [
    ['negative', -1],
    ['fractional', 1.5],
    ['NaN', Number.NaN],
  ];

  const validEntity = (): EncodedEntityStoreSnapshot => encodeEntityStoreSnapshot(new EntityStore(8).getSnapshot());

  for (const [label, value] of OUT_OF_RANGE) {
    it(`the world plane rejects a ${label} value with a WorldSnapshotError`, () => {
      expect(() => decodeTerrainRle([[value, 4]], 4)).toThrow(WorldSnapshotError);
    });

    it(`the entity ledger rejects a ${label} value with a RangeError, on both its planes`, () => {
      // Before the shared codec every one of these was accepted here and
      // silently coerced by `fill`: -1 -> 255, 1.5 -> 1, NaN -> 0.
      expect(() => decodeEntityStoreSnapshot({ ...validEntity(), alive: [[value, 8]] })).toThrow(RangeError);
      expect(() => decodeEntityStoreSnapshot({ ...validEntity(), generations: [[value, 8]] })).toThrow(RangeError);
    });
  }

  it('rejects a value above the bound of its own plane, and only above that one', () => {
    // 999 in a byte plane: rejected here, accepted on the 16-bit plane.
    expect(() => decodeTerrainRle([[999, 4]], 4)).toThrow(WorldSnapshotError);
    expect(() => decodeEntityStoreSnapshot({ ...validEntity(), alive: [[999, 8]] })).toThrow(RangeError);
    expect(() => decodeEntityStoreSnapshot({ ...validEntity(), generations: [[999, 8]] })).not.toThrow();

    // Above 16 bits: rejected on the `generations` plane too.
    expect(() => decodeEntityStoreSnapshot({ ...validEntity(), generations: [[70_000, 8]] })).toThrow(RangeError);
  });

  it('rejects a run that is not a two-element tuple, on both planes', () => {
    expect(() => decodeTerrainRle([[0, 2, 9] as unknown as readonly [number, number]], 2)).toThrow(WorldSnapshotError);
    expect(() =>
      decodeEntityStoreSnapshot({ ...validEntity(), alive: [[0, 8, 9] as unknown as readonly [number, number]] }),
    ).toThrow(RangeError);
  });

  it('the render-layer plane rejects the same out-of-range values, with its own RangeError text', () => {
    // #182: `decodeRenderLayer` (`src/simulation/presentation/world-projection.ts`)
    // was a third hand-rolled implementation of this same shape, reported but
    // not folded in by #123 item 3. It now decodes through
    // `expandRunLengthsInto` too, with a `maxValue` of 255 (the only shape it
    // decodes -- a render layer is always a `Uint8Array`) and its own two
    // `RangeError` messages, collapsed exactly as the original loop collapsed
    // them.
    for (const value of [-1, 1.5, Number.NaN, 999]) {
      expect(() => decodeRenderLayer([[value, 4]], 4), String(value)).toThrow('Invalid render-layer RLE.');
    }
  });

  it('the render-layer plane rejects a malformed run the same way the other two planes do', () => {
    // Before #182, the render-layer loop destructured `[value, count]`
    // directly off each run with no shape check at all -- `for (const
    // [value, count] of rle)`. A run that is not a 2-element array (here, a
    // bare `null` slipped into the tuple array) threw a raw, undocumented
    // `TypeError` from the destructuring itself, not the `RangeError` this
    // decoder's contract promises. `expandRunLengthsInto`'s explicit
    // `Array.isArray(run)` check catches it before any destructuring happens,
    // so this is a real hardening and not only a deduplication.
    expect(() => decodeRenderLayer([null as unknown as readonly [number, number]], 4)).toThrow('Invalid render-layer RLE.');
    expect(() => decodeRenderLayer([[0, 4, 9] as unknown as readonly [number, number]], 4)).toThrow(
      'Invalid render-layer RLE.',
    );
  });

  it('the render-layer plane decodes exactly what it always decoded, for every shape the world plane does', () => {
    // Same round-trip guarantee as the world and entity planes above: sharing
    // the algorithm must not change what a valid render layer decodes to.
    for (const [label, values] of SHAPES) {
      const buffer = Uint8Array.from(values);
      const rle: TerrainRle = encodeTerrainRle(buffer);
      expect(decodeRenderLayer(rle, buffer.length), label).toEqual(buffer);
    }
  });

  it('keeps each plane its own error type rather than a shared generic one', () => {
    // The point of `fail` being a parameter. If the shared codec threw its
    // own error, one of these two would have to be weakened.
    let worldError: unknown;
    try {
      decodeTerrainRle([[999, 4]], 4);
    } catch (error) {
      worldError = error;
    }
    expect(worldError).toBeInstanceOf(WorldSnapshotError);
    expect((worldError as Error).message).toContain('Invalid terrain numericId in RLE: 999.');

    let entityError: unknown;
    try {
      decodeEntityStoreSnapshot({ ...validEntity(), alive: [[999, 8]] });
    } catch (error) {
      entityError = error;
    }
    expect(entityError).toBeInstanceOf(RangeError);
    expect(entityError).not.toBeInstanceOf(WorldSnapshotError);
    expect((entityError as Error).message).toContain('Entity snapshot "alive" has a run value outside 0..255 (999).');
  });
});
