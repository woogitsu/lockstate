import { describe, expect, it } from 'vitest';
import { MAX_GENERATION } from '../../src/simulation/entity/entity-store';
import { Treasury } from '../../src/simulation/economy/treasury';
import { GuardRoster } from '../../src/simulation/security/guard-roster';
import { StaffDismissalService } from '../../src/simulation/staff/dismissal';
import { StaffHiringService } from '../../src/simulation/staff/hiring';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * **What `roster-full` has to mean once a staff slot can die** (issue #533).
 *
 * `StaffHiringService` refuses `'roster-full'` rather than letting
 * `EntityStore.spawn` throw, and its own comment says why: *"a throw out of the
 * kernel's command handler is not a refusal -- it is a crashed tick, on a
 * command the worker has already acknowledged as queued."*
 *
 * That check compared a **live headcount** against the store's capacity, under
 * a comment claiming the reading "was already the one that survives a destroy
 * path arriving here". It was not, and this file is the demonstration.
 * `EntityStore.destroy` **retires** a slot dying at generation
 * {@link MAX_GENERATION} instead of recycling it (ADR 0026 question 1 option A,
 * #169), so a store can be genuinely out of indices while its headcount sits at
 * zero. A headcount gate passes there, and `spawn()` throws.
 *
 * Unreachable before this change, because nothing destroyed a staff entity at
 * all -- which is exactly why the old comment was defensible when it was
 * written and wrong the moment a dismissal existed.
 *
 * ## Why a roster of one, and why 4,096 lives is cheap
 *
 * The condition needs one index driven through every generation it has. At
 * `DEFAULT_GUARD_CAPACITY` (500) that would be a pathological session; at a
 * capacity of one it is a loop, and the arithmetic is the store's rather than
 * this fixture's -- 12 generation bits, so 4,096 lives and then retirement.
 * `GuardRoster` takes its capacity as a constructor argument, so no production
 * constant is bent to make this reachable.
 */

const GUARD = 'staff-role.guard';
const ORIGIN = { x: tileCoordinate(4), y: tileCoordinate(4) };

/** Enough that money is never the reason a hire below is refused. */
const RICH = 10_000_000;

describe('a staff store that has run out of indices refuses rather than throwing', () => {
  it('refuses roster-full when every index has been retired, with the headcount at zero', () => {
    const roster = new GuardRoster(1);
    const treasury = new Treasury(RICH);
    const hiring = new StaffHiringService(roster, treasury);
    const claims = { claimOf: () => undefined, release: () => ({ kind: 'refused' as const, reason: 'not-held' as const }) };
    const dismissal = new StaffDismissalService({ roster, claims });

    // 4,096 lives at index 0: generations 0..4,095. The last dismissal retires
    // the slot instead of freeing it.
    for (let life = 0; life <= MAX_GENERATION; life += 1) {
      const outcome = hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN });
      expect(outcome.kind, `life ${String(life)} should still have an index`).toBe('hired');
      if (outcome.kind !== 'hired') return;
      expect(roster.entityStore.getGeneration(outcome.entityId)).toBe(life);
      expect(dismissal.dismiss(outcome.entityId).kind).toBe('dismissed');
    }

    // The state a headcount cannot see: nobody is employed, and there is
    // nowhere to put anybody.
    expect(roster.allGuardIds()).toEqual([]);
    expect(roster.allGuardIds().length).toBeLessThan(roster.entityStore.capacity);
    expect(roster.entityStore.canSpawn).toBe(false);

    // A refusal, not a throw. With the old headcount gate this line threw
    // `'EntityStore capacity exhausted'` out of `hire` -- which, from the
    // command handler, is a crashed tick rather than something the player is
    // told about.
    expect(() => hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN })).not.toThrow();
    expect(hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN })).toEqual({
      kind: 'refused',
      reason: 'roster-full',
    });
    // And no money moved on a refused hire, which is the ordering argument
    // `hire` makes about all four of its refusals.
    expect(treasury.balanceMinorUnits).toBe(RICH - (MAX_GENERATION + 1) * 80);
  });

  it('still refuses roster-full for a store that is simply full, which is the case that always worked', () => {
    // The other side of the same gate, pinned so a fix aimed at retirement
    // cannot quietly stop refusing the ordinary case.
    const roster = new GuardRoster(2);
    const hiring = new StaffHiringService(roster, new Treasury(RICH));

    expect(hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN }).kind).toBe('hired');
    expect(hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN }).kind).toBe('hired');
    expect(hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN })).toEqual({
      kind: 'refused',
      reason: 'roster-full',
    });
  });

  it('lets a dismissal make room in a full store, which is the point of the command', () => {
    const roster = new GuardRoster(1);
    const hiring = new StaffHiringService(roster, new Treasury(RICH));
    const claims = { claimOf: () => undefined, release: () => ({ kind: 'refused' as const, reason: 'not-held' as const }) };
    const dismissal = new StaffDismissalService({ roster, claims });

    const first = hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN });
    expect(first.kind).toBe('hired');
    expect(hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN }).kind).toBe('refused');

    if (first.kind !== 'hired') return;
    expect(dismissal.dismiss(first.entityId).kind).toBe('dismissed');
    expect(hiring.hire({ staffRoleId: GUARD, originTile: ORIGIN }).kind).toBe('hired');
  });
});
