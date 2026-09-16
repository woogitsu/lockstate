import { describe, expect, it } from 'vitest';
import { EntityStore, INDEX_MASK, type EntityId } from '../../src/simulation/entity/entity-store';
import { ACTOR_IDENTITY_RNG_STREAM, ActorIdentityRegistry } from '../../src/simulation/identity';
import type { ActorNamePool } from '../../src/simulation/identity/name-pool';
import { packCommand } from '../../src/simulation/protocol/commands';
import { deriveXoshiroState } from '../../src/simulation/rng/seed';
import { Xoshiro128StarStar } from '../../src/simulation/rng/xoshiro128starstar';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { StaffDismissalService, type StaffClaimReleasePort } from '../../src/simulation/staff';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * **ADR 0015's destroy obligation, for staff, executed rather than read.**
 *
 * [ADR 0015](../../docs/adr/0015-actor-identity-allocation.md) requires a name
 * to be *"released when the actor is destroyed -- mandatory, because the index
 * is recycled"*, and `ActorIdentityRegistry.release`'s own docblock states the
 * consequence it is guarding against: *"a retained entry would eventually hand
 * the slot's next occupant the previous occupant's name."*
 * `src/simulation/staff/dismissal.ts:295` is the staff path's discharge of it.
 *
 * ## Two halves, and only one of them was pinned
 *
 * `release` does two things, and the difference is the reason this file exists.
 * It drops the `(kind, entityId)` key, **and** it hands the departed full name
 * back to the multiset minting consults (`fullNameCounts`, via `forget`).
 *
 * - The **key** half is already guarded, executably, by
 *   `tests/unit/staff-dismissal-completeness.test.ts`: that gate walks the real
 *   session's object graph for the departed numeric id and reports
 *   `.actorIdentity.byKind.get(staff){key …}` by name. Measured on this tree:
 *   deleting `surfaces.identity?.release('staff', entityId)` fails it, and so
 *   does omitting the optional `identity` port from the session's
 *   `StaffDismissalService` construction.
 * - The **name-set** half was guarded by nothing. Measured on this tree: a
 *   `release` that deletes the map entry and skips `forget` leaves the whole
 *   suite green (453 files, 5,333 tests). That is what the draw-count case
 *   below pins, and it is a *determinism-visible* leak rather than a tidiness
 *   one -- `draw()` re-draws while the candidate full name is already held, so
 *   a ghost occupying a name changes how many words the
 *   `identity.actor-name` stream gives up for the next arrival, and therefore
 *   changes that arrival's name and every name after it
 *   (`docs/DETERMINISM.md`, "Systems must claim specific named RNG streams").
 *
 * ## What this file deliberately does **not** assert, because it cannot go red
 *
 * "Hire, dismiss, spawn into the recycled index, assert the new guard did not
 * inherit the dismissed guard's name" holds **whether or not `release` is ever
 * called**, and asserting it would be decoration. An `EntityId` packs 20 index
 * bits and 12 generation bits, `destroy` bumps the generation, and since
 * ADR 0026 question 1 / #169 a slot dying at generation 4,095 is *retired*
 * rather than recycled -- so the recycled index yields an id the registry has
 * never seen, and the stale entry misses on its own merits. That property is
 * already pinned, one store over, at
 * `tests/unit/entity-generation-wrap.test.ts`'s *"ActorIdentityRegistry no
 * longer hands the new occupant of a retired index the previous occupant's
 * name"*. The recycle is still asserted below -- as the *premise* of the cases
 * that can fail, so they cannot quietly stop testing a recycled slot.
 */

/**
 * One given name and one family name, so the pool can mint exactly one full
 * name. That turns "a retained ghost name might collide with the next draw"
 * from a probability into a certainty, which is what makes the draw count a
 * clean assertion instead of a seed-dependent one. Nothing else about the
 * fixture depends on the pool's size.
 */
const SINGLE_NAME_POOL: ActorNamePool = {
  id: 'test.single-name.v1',
  givenNames: ['Adan'],
  familyNames: ['Abara'],
};

const GUARD = 'staff-role.guard';
const ORIGIN = { x: tileCoordinate(16), y: tileCoordinate(16) } as const;
const SEED = 0x533c;

/** Counts the words the `identity.actor-name` stream actually gives up. */
class CountingXoshiro extends Xoshiro128StarStar {
  public draws = 0;

  public override nextUint32(): number {
    this.draws += 1;
    return super.nextUint32();
  }
}

/** A guard nothing has claimed: `dismissStaff` then skips the claim step entirely. */
const NO_CLAIMS: StaffClaimReleasePort = {
  claimOf: () => undefined,
  release: () => ({ kind: 'refused', reason: 'not-held' }),
};

function freshStream(): CountingXoshiro {
  return new CountingXoshiro(deriveXoshiroState(SEED, ACTOR_IDENTITY_RNG_STREAM).words);
}

describe('a dismissal gives the name back (ADR 0015, staff path)', () => {
  it('costs the same number of draws to name the guard hired into the recycled slot as it did to name the first one', () => {
    const rng = freshStream();
    const identity = new ActorIdentityRegistry({ pool: SINGLE_NAME_POOL });
    const roster = new GuardRoster(8, identity, () => rng);
    const dismissal = new StaffDismissalService({ roster, claims: NO_CLAIMS, identity });

    const first = roster.hire(GUARD, ORIGIN);
    const firstMintCost = rng.draws;

    // Two words: `drawOnce` reads one for the given name and one for the
    // family name, and an empty registry needs no re-draw. Stated as a number
    // as well as compared below, so a change that inflated both mints equally
    // cannot pass by matching itself.
    expect(firstMintCost, 'minting into an empty registry draws one candidate and keeps it').toBe(2);

    expect(dismissal.dismiss(first).kind).toBe('dismissed');

    const before = rng.draws;
    const second = roster.hire(GUARD, ORIGIN);
    const secondMintCost = rng.draws - before;

    // The premise: the slot really was recycled, and the new occupant is a
    // different `EntityId` at the same index.
    expect(second & INDEX_MASK, 'the freed index must be the one handed out again').toBe(first & INDEX_MASK);
    expect(second, 'a recycled index is issued under a bumped generation').not.toBe(first);

    // The obligation, priced. A registry still holding the dismissed guard's
    // full name sends `draw()` round its retry loop instead, which spends the
    // stream on a name it is going to return anyway.
    expect(secondMintCost, 'a dismissed guard must not still be occupying their name').toBe(firstMintCost);
  });

  it('leaves the registry holding names for living staff only, and nothing else', () => {
    const rng = freshStream();
    const identity = new ActorIdentityRegistry({ pool: SINGLE_NAME_POOL });
    const roster = new GuardRoster(8, identity, () => rng);
    const dismissal = new StaffDismissalService({ roster, claims: NO_CLAIMS, identity });

    const first = roster.hire(GUARD, ORIGIN);
    expect(dismissal.dismiss(first).kind).toBe('dismissed');
    const second = roster.hire(GUARD, ORIGIN);

    expect(identity.getName('staff', first), 'a destroyed id must name nobody').toBeUndefined();
    expect(identity.getName('staff', second)).toBeDefined();
    // `size` rather than a hand-listed set: the snapshot this reflects is a
    // session-level field of every save payload from V3 on, so an entry per
    // departure is unbounded growth in the save envelope, not only in memory.
    expect(identity.size, 'one live guard, one entry').toBe(1);
    expect(identity.getSnapshot().entries.map((entry) => entry.entityId)).toEqual([second]);
  });

  it('leaves the registry with nothing for `reconcile` to sweep up', () => {
    const rng = freshStream();
    const identity = new ActorIdentityRegistry({ pool: SINGLE_NAME_POOL });
    const roster = new GuardRoster(8, identity, () => rng);
    const dismissal = new StaffDismissalService({ roster, claims: NO_CLAIMS, identity });

    const hired: EntityId[] = [roster.hire(GUARD, ORIGIN), roster.hire(GUARD, ORIGIN), roster.hire(GUARD, ORIGIN)];
    for (const entityId of hired) expect(dismissal.dismiss(entityId).kind).toBe('dismissed');
    roster.hire(GUARD, ORIGIN);

    // `reconcile` is the safety net ADR 0015 offers *instead of* releasing
    // ("or reuse `reconcile` as a safety net"). Nothing in `src/` calls it, so
    // asking it what it would have found is the direct measure of whether the
    // release path did its job: zero means the net was never needed.
    const store: EntityStore = roster.entityStore;
    expect(identity.reconcile('staff', (entityId) => store.isAlive(entityId))).toBe(0);
  });

  it('holds on the real session, where the optional identity port is actually supplied', () => {
    // The port is optional -- `StaffDismissalSurfaces.identity?` -- so a
    // construction that omits it compiles and releases nothing. The two cases
    // above build the service themselves and therefore cannot notice; this one
    // goes through `createNewSimulationRuntime`, which is the only
    // construction of `StaffDismissalService` in `src/`.
    const runtime: SimulationRuntime = createNewSimulationRuntime(SEED);
    const hire = (): EntityId => {
      runtime.kernel.submitCommand(
        `hire-${String(runtime.kernel.tick)}-${String(runtime.securityGuards.allGuardIds().length)}`,
        runtime.kernel.expectedSequence,
        runtime.kernel.tick,
        packCommand({ type: 'HireStaff', staffRoleId: GUARD, x: ORIGIN.x, y: ORIGIN.y }),
      );
      runtime.kernel.step();
      const ids = runtime.securityGuards.allGuardIds();
      return ids[ids.length - 1]!;
    };

    const first = hire();
    expect(runtime.refusals.count, 'the guard this case needs must actually be hired').toBe(0);
    const departed = runtime.actorIdentity.getName('staff', first);
    expect(departed, 'the production session must name a guard at hire').toBeDefined();

    expect(runtime.staffDismissal.dismiss(first).kind).toBe('dismissed');
    expect(runtime.actorIdentity.getName('staff', first)).toBeUndefined();

    const second = hire();
    expect(second & INDEX_MASK, 'the freed index must be the one handed out again').toBe(first & INDEX_MASK);
    expect(second).not.toBe(first);

    const store = runtime.securityGuards.entityStore;
    expect(runtime.actorIdentity.reconcile('staff', (entityId) => store.isAlive(entityId))).toBe(0);
    expect(runtime.actorIdentity.getSnapshot().entries.filter((entry) => entry.kind === 'staff').map((entry) => entry.entityId)).toEqual([second]);
  });
});
