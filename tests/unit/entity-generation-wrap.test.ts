import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { GangRegistry } from '../../src/simulation/incidents/gangs';
import { ActorIdentityRegistry } from '../../src/simulation/identity';
import { PrisonerColdState } from '../../src/simulation/prisoners/components';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';

/**
 * **These cases pin a defect, not an intention.** Read that first, because
 * every assertion below asserts the wrong answer on purpose.
 *
 * `destroy()` does `generations[index] = (generations[index] + 1) & 0xFFF`,
 * so one index's generation returns to where it started after exactly 4,096
 * destroy/spawn cycles of that index (`EntityStore.destroy`). At that
 * moment a handle to an entity that died 4,096 lifetimes ago starts naming
 * the entity currently in the slot: `isAlive` says true, `getIndex` and
 * `getGeneration` both agree, and no record anywhere can tell the two apart.
 * That is a use-after-free with the safety net removed, and it is silent in
 * both directions -- a stale read returns the wrong prisoner's data and a
 * stale `destroy` kills the right slot's *current* occupant.
 *
 * Three stores rely for their entire safety on a recycled index producing a
 * key that misses -- `PrisonerColdState`, `GangRegistry` and
 * `ActorIdentityRegistry`, all plain `Map<EntityId, …>`. At the wrap they
 * stop missing and start inheriting: the same defect as #111, one level up,
 * and in a place no per-index component reset can reach, because the whole
 * mechanism is "the key is different now".
 *
 * ## Why the wrong answer is asserted rather than fixed
 *
 * Every available fix is a decision, and #169 says so. Refusing to recycle a
 * retired index trades silent corruption for a capacity limit; widening the
 * generation field costs index bits out of the same 32-bit word (halving
 * addressable entities per bit) *and* a save migration; clearing the three
 * stores on release needs a release path that does not exist (#31) and
 * reintroduces the "list every store" problem #111 was about. ADR 0026 is
 * Accepted as the framing and the tripwire, not as an answer, and leaves all
 * three open. Deciding one inside a test would be the quietest possible way
 * to make that choice.
 *
 * ## What these cases are for, then
 *
 * A tripwire. Every one of the three options changes an assertion here, so
 * none can be implemented without arriving at this file and saying which
 * option was taken. Nothing else in the suite notices: mutating the wrap
 * period from `& 0xFFF` to `& 0xF` -- a 256x worse version of exactly this
 * defect -- leaves the entire suite green except `actor-identity.test.ts`'s
 * pin on the arithmetic period, which observes the counter and not one of
 * its consequences.
 *
 * ## Two things this file did not cover, found by mutating what it guards (#169)
 *
 * A tripwire is only worth what it detects, so its own coverage was measured
 * rather than assumed, and both gaps were in the *guard* rather than in the
 * defect the cases describe.
 *
 * **The generation check was not exercised at all.** Every
 * `isAlive(stale) === false` here used to be asserted between a `destroy` and
 * the following `spawn`, with the slot on the free list -- so it was satisfied
 * by `alive[index] !== 1` and never reached the generation comparison. Removing
 * the generation term from `isAlive` entirely, which is #110's fix and the
 * exact guard whose failure at the wrap is this file's whole subject, left
 * **all 190 test files and 2,229 tests green**. The assertion now runs with the
 * slot *occupied*, where only the generation can reject the id.
 *
 * **The period was not pinned here.** Every loop below runs exactly 4,096
 * cycles, so any wrap period dividing 4,096 lands on the same starting
 * generation and satisfies every assertion. The `& 0xF` mutation above passed
 * all six original cases for that reason. It is pinned now, in its own case,
 * and the reason it cannot be left to `actor-identity.test.ts` alone is given
 * there.
 *
 * ## Latency, stated so the severity is not overstated
 *
 * Nothing in `src/` destroys an entity, so no index is recycled even once
 * today, let alone 4,096 times (#31). These cases reach the wrap by driving
 * `EntityStore` directly. What makes it worth pinning before #31 rather than
 * after is that 4,096 recycles of one index is a long-running prison, not a
 * pathological input.
 */

const WRAP_PERIOD = 4_096;

/** Destroys and respawns one index until its generation returns to where it started. */
function cycleUntilWrap(store: EntityStore, first: number): number {
  let latest = first;
  for (let cycle = 0; cycle < WRAP_PERIOD; cycle += 1) {
    store.destroy(latest);
    latest = store.spawn();
  }
  return latest;
}

describe('EntityId generation wrap (#169, DEFECT PINNED -- see this file’s header)', () => {
  it('DEFECT: a stale handle reports itself alive again once the generation wraps', () => {
    const store = new EntityStore(4);
    const stale = store.spawn();

    store.destroy(stale);
    let latest = store.spawn();
    for (let cycle = 1; cycle < WRAP_PERIOD; cycle += 1) {
      // Asserted here -- *after* the respawn, with the slot occupied --
      // rather than between the destroy and the spawn, and that placement is
      // the whole assertion. With the slot on the free list `isAlive` returns
      // false on `alive[index] !== 1` and never reaches the generation
      // comparison, so the same expectation written one line earlier passes
      // just as well against a store that has no generation check at all.
      // Here the slot is alive and only the generation can reject the id, so
      // this is the guard #110 added, exercised 4,095 times.
      expect(store.isAlive(stale)).toBe(false);
      expect(store.isAlive(latest)).toBe(true);
      store.destroy(latest);
      latest = store.spawn();
    }

    // The 4,096th recycle brings the generation back around. `latest` is a
    // different entity by every meaning the simulation has, and the store
    // can no longer say so.
    expect(latest).toBe(stale);
    expect(store.isAlive(stale)).toBe(true); // DEFECT: should still be false
  });

  it('rejects a stale handle for every one of the 4,095 recycles before the wrap, and only wraps at 4,096', () => {
    // The period itself, pinned here rather than only in
    // `actor-identity.test.ts`. Two reasons it belongs in this file too.
    //
    // First, it was not covered here at all: every assertion in this file is
    // satisfied by *any* wrap period that divides 4,096, because the loops
    // run exactly 4,096 cycles and land back on the starting generation
    // either way. Measured -- with `& 0xFFF` mutated to `& 0xF`, a 256x
    // shorter fuse and a 256x worse version of exactly the defect this file
    // documents, all six cases here passed and only `actor-identity.test.ts`
    // failed.
    //
    // Second, `actor-identity.test.ts`'s pin is the one ADR 0026 names as the
    // cost of option A ("refuse to recycle an index past its last
    // generation"), because under A the id genuinely never comes back. So the
    // sole guard on this counter is scheduled to be re-baselined by one of
    // the options this file exists to gate -- which would leave the period
    // unpinned at precisely the moment someone is editing the counter. This
    // case survives A on its own terms: it asserts that a stale handle is
    // rejected while its slot is *live*, which is what A strengthens rather
    // than removes, and the wrap assertion is the one line A changes.
    const store = new EntityStore(4);
    const stale = store.spawn();
    store.destroy(stale);

    let latest = store.spawn();
    let recycles = 1;
    while (latest !== stale) {
      if (recycles > WRAP_PERIOD) throw new Error(`no wrap within ${WRAP_PERIOD} recycles`);
      store.destroy(latest);
      latest = store.spawn();
      recycles += 1;
    }

    // 4,096 is a literal from the 12-bit field (`GENERATION_MASK`), not a
    // value read back out of the store.
    expect(recycles).toBe(WRAP_PERIOD);
  });

  it('DEFECT: a stale handle destroys the live entity now holding the slot', () => {
    // The write side, and the worse half. A retained handle -- in a queued
    // command, a pending path request, a projection built last tick -- does
    // not merely read the wrong prisoner. It kills them.
    const store = new EntityStore(4);
    const stale = store.spawn();
    const live = cycleUntilWrap(store, stale);
    const bystander = store.spawn();

    store.destroy(stale);

    expect(store.isAlive(live)).toBe(false); // DEFECT: `live` was never destroyed
    expect(store.isAlive(bystander)).toBe(true); // unrelated slots are untouched
  });

  it('DEFECT: PrisonerColdState hands the new occupant the previous occupant’s cell', () => {
    const store = new EntityStore(4);
    const coldState = new PrisonerColdState();

    const first = store.spawn();
    coldState.setAccommodation(first, 'cell-first');

    const latest = cycleUntilWrap(store, first);

    expect(coldState.getAccommodation(latest)).toBe('cell-first'); // DEFECT: should be undefined
  });

  it('DEFECT: GangRegistry hands the new occupant the previous occupant’s gang', () => {
    const store = new EntityStore(4);
    const gangs = new GangRegistry();
    gangs.register({ id: 'gang.north', territorySectorIds: [] });

    const first = store.spawn();
    gangs.addMember('gang.north', first);

    const latest = cycleUntilWrap(store, first);

    expect(gangs.getGangOf(latest)).toBe('gang.north'); // DEFECT: should be undefined
    expect(gangs.membersOf('gang.north')).toEqual([latest]);
  });

  it('DEFECT: ActorIdentityRegistry hands the new occupant the previous occupant’s name', () => {
    // The one with a stated contract to violate: `release` is documented as
    // **required** when an actor is destroyed, precisely because "a retained
    // entry would eventually hand the slot's next occupant the previous
    // occupant's name". Nothing calls it (#31), and this is that eventually.
    const store = new EntityStore(4);
    const identity = new ActorIdentityRegistry();
    const rng = new Xoshiro128StarStar(deriveXoshiroState(1, 'identity.actor-name').words);

    const first = store.spawn();
    const minted = identity.assign('prisoner', first, rng);

    const latest = cycleUntilWrap(store, first);

    // Worse than a stale read: `assign` is idempotent, so intake's reception
    // stage finds an existing entry, draws nothing, and the new prisoner is
    // named after the old one without any code path noticing.
    expect(identity.assign('prisoner', latest, rng)).toEqual(minted); // DEFECT: should mint a new name
    expect(identity.getName('prisoner', latest)).toEqual(minted);
  });

  it('is per index: wrapping one index says nothing about its neighbour', () => {
    // Not a defect -- recorded because it bounds the blast radius. The
    // generations array is per slot, so this is a 4,096-recycle period on
    // each index independently, not a global counter.
    const store = new EntityStore(4);
    const a = store.spawn();
    const b = store.spawn();

    const wrappedA = cycleUntilWrap(store, a);

    expect(wrappedA).toBe(a);
    expect(store.getIndex(b)).toBe(1);
    expect(store.getGeneration(b)).toBe(0);
    expect(store.isAlive(b)).toBe(true);
  });
});
