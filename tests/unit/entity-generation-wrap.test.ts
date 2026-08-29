import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { GangRegistry } from '../../src/simulation/incidents/gangs';
import { ActorIdentityRegistry } from '../../src/simulation/identity';
import { PrisonerColdState } from '../../src/simulation/prisoners/components';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';

/**
 * **These cases used to pin a defect on purpose; they now pin the fix.**
 * Read the history here before touching `EntityStore.destroy`, because every
 * case below is the re-baseline ADR 0026 named as the cost of taking option A.
 *
 * `destroy()` used to do `generations[index] = (generations[index] + 1) &
 * 0xFFF` unconditionally, so one index's generation returned to where it
 * started after exactly 4,096 destroy/spawn cycles of that index. At that
 * moment a handle to an entity that died 4,096 lifetimes ago started naming
 * the entity currently in the slot: `isAlive` said true, `getIndex` and
 * `getGeneration` both agreed, and no record anywhere could tell the two
 * apart. That was a use-after-free with the safety net removed, and it was
 * silent in both directions -- a stale read returned the wrong prisoner's
 * data and a stale `destroy` killed the right slot's *current* occupant.
 *
 * Three stores relied for their entire safety on a recycled index producing a
 * key that misses -- `PrisonerColdState`, `GangRegistry` and
 * `ActorIdentityRegistry`, all plain `Map<EntityId, …>`. At the wrap they
 * stopped missing and started inheriting: the same defect as #111, one level
 * up, and in a place no per-index component reset could reach, because the
 * whole mechanism was "the key is different now".
 *
 * ## The decision taken (#169, ADR 0026 question 1, option A)
 *
 * `EntityStore.destroy` now **retires** a slot that dies at generation 4,095
 * instead of recycling it: the index is marked dead and never pushed back
 * onto `freeIndices`, so that exact `EntityId` -- identical to the slot's very
 * first id -- can never be reissued. Silent corruption becomes a bounded
 * capacity loss (one retired index per 4,096 releases of the same slot),
 * which `EntityStore.canSpawn` and `admitPrisoner`'s existing
 * `population-full` refusal already handle as an ordinary outcome. See
 * `EntityStore.destroy`'s doc comment for the full argument, and ADR 0026 for
 * why option A and option C (already shipped with #441's release path, which
 * clears these same three stores on every departure) are complements rather
 * than alternatives: C alone still left `isAlive`/`destroy` lying at the
 * wrap; A alone still left an orphaned map entry behind (harmless once the id
 * can never recur, but a leak). Both are now taken.
 *
 * ## Why this file, and not just `actor-identity.test.ts`
 *
 * Nothing else in the suite observed any of this before #169's audit found
 * it: mutating the wrap period from `& 0xFFF` to `& 0xF` -- a 256x worse
 * version of the old defect -- used to leave the entire suite green except
 * `actor-identity.test.ts`'s pin on the arithmetic period, which observed the
 * counter and not one of its consequences. This file is the guard on the
 * consequences; `actor-identity.test.ts` keeps the guard on the period
 * (re-baselined alongside this file, see its own comment).
 *
 * ## Mutation discipline (#169)
 *
 * The cases below were confirmed RED against the pre-fix `destroy()` --
 * generation incremented and freed unconditionally, no retirement branch --
 * and GREEN again with the fix restored. See the commit message for the
 * exact before/after counts.
 */

const WRAP_PERIOD = 4_096;

/**
 * Destroys and respawns one index `WRAP_PERIOD` times. Before the fix this
 * landed back on the id the index started with; now the last destroy retires
 * the index, so the returned id names a *different* index whose generation
 * is 0 -- the retirement, not a recycle.
 */
function cycleUntilRetirement(store: EntityStore, first: number): number {
  let latest = first;
  for (let cycle = 0; cycle < WRAP_PERIOD; cycle += 1) {
    store.destroy(latest);
    latest = store.spawn();
  }
  return latest;
}

describe('EntityId generation wrap (#169, ADR 0026 option A -- retire rather than recycle)', () => {
  it('rejects a stale handle for every one of the 4,095 recycles before retirement, and retires the index at the 4,096th destroy rather than recycling it', () => {
    const store = new EntityStore(4);
    const stale = store.spawn();
    const staleIndex = store.getIndex(stale);

    store.destroy(stale);
    let latest = store.spawn();
    for (let cycle = 1; cycle < WRAP_PERIOD; cycle += 1) {
      // Same guard as before the fix: the slot is alive and only the
      // generation can reject a stale id, exercised 4,095 times. This half
      // of the file's behaviour is unchanged by option A -- it is what A
      // strengthens into "for every recycle, forever" rather than replaces.
      expect(store.isAlive(stale)).toBe(false);
      expect(store.isAlive(latest)).toBe(true);
      expect(store.getIndex(latest)).toBe(staleIndex); // still the same index recycling
      store.destroy(latest);
      latest = store.spawn();
    }

    // The 4,096th recycle used to bring the generation back around and hand
    // `latest` the exact id `stale` named. Now the index is retired instead:
    // `latest` is a fresh index at generation 0, `stale`'s index never comes
    // back, and neither id is ever alive again.
    expect(store.getIndex(latest)).not.toBe(staleIndex);
    expect(store.isAlive(stale)).toBe(false);
    expect(store.isIndexAlive(staleIndex)).toBe(false);
    expect(store.isAlive(latest)).toBe(true);

    // The retired index stays retired: further destroy/spawn traffic on
    // other indices can never hand it out again, because it was never
    // returned to the free list. Two more full cycles of destroy/spawn on
    // whatever `spawn()` gives out next never reproduce `staleIndex`.
    for (let cycle = 0; cycle < 2; cycle += 1) {
      store.destroy(latest);
      latest = store.spawn();
      expect(store.getIndex(latest)).not.toBe(staleIndex);
    }
  });

  it('destroying an already-retired id is a no-op, the same tolerance an ordinary stale id gets', () => {
    const store = new EntityStore(4);
    const stale = store.spawn();
    const live = cycleUntilRetirement(store, stale);
    const bystander = store.spawn();

    // Before the fix, this destroy call reached the wrap and killed `live`
    // (`live`'s id and `stale`'s id had become identical). Retirement means
    // `stale`'s slot is simply gone: this call has nothing left to act on.
    store.destroy(stale);

    expect(store.isAlive(live)).toBe(true); // no longer collateral damage
    expect(store.isAlive(bystander)).toBe(true); // unrelated slots are untouched
  });

  it('PrisonerColdState no longer hands the new occupant of a retired index the previous occupant’s cell', () => {
    const store = new EntityStore(4);
    const coldState = new PrisonerColdState();

    const first = store.spawn();
    coldState.setAccommodation(first, 'cell-first');

    const latest = cycleUntilRetirement(store, first);

    // `latest` is a genuinely different EntityId now (a different index, at
    // its own generation 0), so the map lookup misses on its own merits --
    // not because release happened to clear it, but because the key that
    // used to collide can no longer be produced.
    expect(coldState.getAccommodation(latest)).toBeUndefined();
  });

  it('GangRegistry no longer hands the new occupant of a retired index the previous occupant’s gang', () => {
    const store = new EntityStore(4);
    const gangs = new GangRegistry();
    gangs.register({ id: 'gang.north', territorySectorIds: [] });

    const first = store.spawn();
    gangs.addMember('gang.north', first);

    const latest = cycleUntilRetirement(store, first);

    expect(gangs.getGangOf(latest)).toBeUndefined();
    expect(gangs.membersOf('gang.north')).toEqual([first]); // the stale membership is still on record, but under an id nothing can ever spawn again
  });

  it('ActorIdentityRegistry no longer hands the new occupant of a retired index the previous occupant’s name', () => {
    // The one with a stated contract to violate: `release` is documented as
    // **required** when an actor is destroyed, precisely because "a retained
    // entry would eventually hand the slot's next occupant the previous
    // occupant's name". Option A closes the same hole from the other side --
    // even an entry nobody ever released cannot be handed out again, because
    // the id it is keyed by cannot recur.
    const store = new EntityStore(4);
    const identity = new ActorIdentityRegistry();
    const rng = new Xoshiro128StarStar(deriveXoshiroState(1, 'identity.actor-name').words);

    const first = store.spawn();
    const minted = identity.assign('prisoner', first, rng);

    const latest = cycleUntilRetirement(store, first);
    const second = identity.assign('prisoner', latest, rng);

    expect(second).not.toEqual(minted); // a fresh id mints a fresh name
    expect(identity.getName('prisoner', latest)).toEqual(second);
  });

  it('is per index: retiring one index says nothing about its neighbour', () => {
    // Not a defect -- recorded because it bounds the blast radius. The
    // generations array is per slot, so this is a 4,096-recycle-then-retire
    // period on each index independently, not a global counter.
    const store = new EntityStore(4);
    const a = store.spawn();
    const b = store.spawn();

    const afterRetirement = cycleUntilRetirement(store, a);

    expect(store.getIndex(afterRetirement)).not.toBe(store.getIndex(a));
    expect(store.isIndexAlive(store.getIndex(a))).toBe(false); // retired
    expect(store.getIndex(b)).toBe(1);
    expect(store.getGeneration(b)).toBe(0);
    expect(store.isAlive(b)).toBe(true); // never touched by a's retirement
  });
});
