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
 * reintroduces the "list every store" problem #111 was about. ADR 0026
 * states all three at Proposed. Deciding one inside a test would be the
 * quietest possible way to make that choice.
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
    expect(store.isAlive(stale)).toBe(false); // correct, for the first 4,095 recycles
    let latest = store.spawn();
    for (let cycle = 1; cycle < WRAP_PERIOD; cycle += 1) {
      store.destroy(latest);
      expect(store.isAlive(stale)).toBe(false);
      latest = store.spawn();
    }

    // The 4,096th recycle brings the generation back around. `latest` is a
    // different entity by every meaning the simulation has, and the store
    // can no longer say so.
    expect(latest).toBe(stale);
    expect(store.isAlive(stale)).toBe(true); // DEFECT: should still be false
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
