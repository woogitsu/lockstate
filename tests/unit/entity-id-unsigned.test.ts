import { describe, expect, it } from 'vitest';
import { EntityStore, GENERATION_MASK, GENERATION_SHIFT, INDEX_MASK } from '../../src/simulation/entity/entity-store';
import { ComponentBitset } from '../../src/simulation/entity/component';
import { EntityQuery } from '../../src/simulation/entity/query';
import { ACTOR_IDENTITY_RNG_STREAM, ActorIdentityRegistry } from '../../src/simulation/identity';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';

/**
 * A packed `EntityId` is a non-negative integer, at every generation.
 *
 * The two fields fill the whole word -- 20 index bits plus 12 generation bits
 * is 32 of 32 -- so `generation << 20` sets bit 31 from generation 2,048, and
 * `|` yields a signed int32. `spawn()` therefore used to return
 * `-2147483648` at generation 2,048 and `-1048576` at generation 4,095.
 *
 * `EntityStore` itself tolerates that -- every decode there uses `>>>` or
 * `& INDEX_MASK` -- which is precisely why nothing noticed. Three modules
 * outside it do not tolerate it, and each already states the unsigned
 * contract in as many words. The cases below are one per statement, so the
 * fix is pinned by what actually depends on it rather than by a restatement
 * of the arithmetic.
 *
 * ## Why this is 2,048 and not 4,096
 *
 * #169 is about the generation *wrapping* at 4,096, after which an
 * `EntityId`-keyed map inherits the previous occupant's entry instead of
 * missing. This is a different defect on the same counter that fires at
 * **half** the recycles and fails loudly rather than silently: a thrown
 * `RangeError` inside the tick loop, and a session that will not serialise.
 * Both share the same latency condition -- nothing in `src/` destroys an
 * entity (#31), so no index is recycled even once -- but this one is the
 * earlier of the two and, unlike the wrap, needs no decision to fix.
 *
 * ## Nothing here changes the save format
 *
 * `save-schema.ts`'s `entityIdSchema` has always been
 * `z.number().int().min(0)`. No save this codebase can produce holds a
 * generation-2,048 id, because reaching one needs 2,048 destroy/spawn cycles
 * of a single index and no production path destroys anything. The declared
 * domain is unchanged; only the producer is brought into line with it.
 */

/** Cycles one index up to `generation`, returning the id it hands back. */
function idAtGeneration(generation: number): number {
  const store = new EntityStore(4);
  let id = store.spawn();
  for (let cycle = 0; cycle < generation; cycle += 1) {
    store.destroy(id);
    id = store.spawn();
  }
  expect(store.getGeneration(id), `the fixture did not reach generation ${generation}`).toBe(generation);
  return id;
}

describe('a packed EntityId is non-negative at every generation', () => {
  it('hands back a non-negative id across the whole generation range, including the bit-31 boundary', () => {
    // Both sides of the boundary explicitly, then a sweep. 2,047 was always
    // positive; 2,048 was `-2147483648`, and 4,095 -- the last generation
    // before the wrap -- was `-1048576`.
    expect(idAtGeneration(2_047)).toBe(2_146_435_072);
    expect(idAtGeneration(2_048)).toBe(2_147_483_648);
    expect(idAtGeneration(4_095)).toBe(4_293_918_720);

    const store = new EntityStore(4);
    let id = store.spawn();
    for (let generation = 0; generation < 4_096; generation += 1) {
      expect(id, `spawn() returned a negative id at generation ${generation}`).toBeGreaterThanOrEqual(0);
      store.destroy(id);
      id = store.spawn();
    }
  });

  it('still decodes to the same index and generation, so the fix changes the sign and nothing else', () => {
    // The control on the control. `>>> 0` must not perturb what the id
    // *means*: a fix that shifted a bit would pass the sign assertions above
    // and break every consumer.
    const store = new EntityStore(8);
    const other = store.spawn();
    let id = store.spawn();
    for (let cycle = 0; cycle < 3_000; cycle += 1) {
      store.destroy(id);
      id = store.spawn();
    }

    expect(store.getIndex(id)).toBe(1);
    expect(store.getGeneration(id)).toBe(3_000);
    expect(store.isAlive(id)).toBe(true);
    expect(id & INDEX_MASK).toBe(1);
    expect((id & GENERATION_MASK) >>> GENERATION_SHIFT).toBe(3_000);
    // And the untouched neighbour is unaffected, so this is not a store-wide
    // reset dressed up as a fix.
    expect(store.isAlive(other)).toBe(true);
    expect(store.getGeneration(other)).toBe(0);
  });

  it('agrees with getIdByIndex, which packs the same id by the other route', () => {
    // Two encode sites, one contract. Fixing only `spawn` would leave a query
    // handing out negative ids for the same live slot.
    const store = new EntityStore(4);
    let id = store.spawn();
    for (let cycle = 0; cycle < 2_500; cycle += 1) {
      store.destroy(id);
      id = store.spawn();
    }

    expect(store.getIdByIndex(0)).toBe(id);
    expect(store.getIdByIndex(0)).toBeGreaterThanOrEqual(0);
  });
});

describe('what the unsigned domain is load-bearing for', () => {
  it('survives ActorIdentityRegistry.assign, which throws RangeError on a negative id', () => {
    // `assertEntityId` is not defensive padding: `IntakeSystem.update` calls
    // `assign` at the reception stage, so a negative id here is a throw
    // inside the tick loop while a prisoner is being admitted.
    const identity = new ActorIdentityRegistry();
    const rng = new Xoshiro128StarStar(deriveXoshiroState(7, ACTOR_IDENTITY_RNG_STREAM).words);

    expect(() => identity.assign('prisoner', idAtGeneration(2_048), rng)).not.toThrow();

    // The negative control: the assertion the case above relies on is really
    // there, so this test cannot pass because `assign` stopped checking.
    expect(() => identity.assign('prisoner', -1, rng)).toThrow(RangeError);
  });

  it('keeps every id a numeric sort can order, which a dozen canonical-order sites depend on', () => {
    /*
     * Twelve sites in `src/simulation/` sort entity ids with `a - b` to
     * establish canonical order. A negative id sorts to the *front* of all of
     * them, so the same set of live entities produced two different orders
     * depending only on which generation a slot happened to be on -- a
     * property of history rather than of state, which is precisely what
     * `docs/DETERMINISM.md`'s canonical-order rule rules out.
     *
     * This builds the shape that used to break it: a high-generation slot at
     * a low index beside a fresh slot at a higher one.
     */
    const store = new EntityStore(8);
    let recycled = store.spawn();
    for (let cycle = 0; cycle < 2_048; cycle += 1) {
      store.destroy(recycled);
      recycled = store.spawn();
    }
    const fresh = store.spawn();
    expect(store.getIndex(recycled)).toBe(0);
    expect(store.getIndex(fresh)).toBe(1);

    for (const id of [recycled, fresh]) expect(id).toBeGreaterThanOrEqual(0);
    // The recycled slot's generation is higher, so it sorts last. Before the
    // fix it sorted first, because it was negative.
    expect([fresh, recycled].sort((a, b) => a - b)).toEqual([fresh, recycled]);
  });

  it('is walked by EntityQuery in index order, which is not id order once generations differ', () => {
    /*
     * The neighbouring claim, pinned so it is not assumed away. `query.ts`
     * used to promise "strictly ascending ID order"; an id packs the
     * generation into the high bits, so index order is id order only while
     * every live slot shares one. That was never true of a recycled store and
     * `>>> 0` does not change it -- which is why the comment there is
     * corrected rather than the loop.
     *
     * This is not pinning a defect as acceptable: ascending *index* order is
     * a total order derived from state and is what determinism needs. It is
     * pinning that the two orders are different things, so the next reader
     * does not restore the stronger sentence.
     */
    const store = new EntityStore(8);
    const bitset = new ComponentBitset(8);

    let recycled = store.spawn();
    for (let cycle = 0; cycle < 2_048; cycle += 1) {
      store.destroy(recycled);
      recycled = store.spawn();
    }
    const fresh = store.spawn();

    bitset.add(0, 0);
    bitset.add(1, 0);
    const query = new EntityQuery(store, bitset);
    query.mask.require(0);
    const walked = query.execute();

    expect(walked, 'the walk is index order').toEqual([recycled, fresh]);
    expect(store.getIndex(walked[0]!)).toBe(0);
    expect(store.getIndex(walked[1]!)).toBe(1);
    expect([...walked].sort((a, b) => a - b), 'index order is not id order here, and the comment must not say it is').not.toEqual(walked);
  });
});
