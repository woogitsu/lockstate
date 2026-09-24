import { describe, expect, it } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A prison can let a staff member go** (issue #533, the owner's decision on
 * issue #535 decision 4).
 *
 * ## What was measured, and why a unit test could not have seen it
 *
 * Nothing in `src/` removed a staff member from `GuardRoster`.
 * `src/simulation/staff/hiring.ts` said so in its own words and used the
 * sentence as an argument -- *"nothing in `src/` ever removes a staff member
 * from it, and `PayrollSystem` bills every id it holds at every in-game day
 * boundary"* -- and the protocol carried four `hire.*` refusals and no dismiss
 * command at all. A hire was therefore a permanent payroll line: 80 minor units
 * at the click and 80 again at the day boundary, against an empty prison's
 * income of nothing.
 *
 * That is a fact about the *session*, not about a function, which is why the
 * cases below start from `createNewSimulationRuntime` and send real commands
 * through the real handler. A fixture that constructed a roster and called a
 * service would have proved a service exists.
 *
 * ## What is deliberately not asserted
 *
 * **No money moves.** A dismissal neither refunds the engagement charge nor
 * takes a severance, and `src/simulation/staff/dismissal.ts` argues why: both
 * are balance, and balance is the owner's. The treasury assertions below pin
 * the *absence* of a transfer rather than a chosen figure, so a later balance
 * pass changes one place and this file tells it which cases it has moved.
 */

const SEED = 0x533;
const ORIGIN = { x: 16, y: 16 } as const;
const FAR_TILE = { x: 0, y: 0 } as const;
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const ADMISSION = { sentenceLengthTicks: 200_000, priorIncidents: 0 } as const;
const GUARD = 'staff-role.guard';

function submit(runtime: SimulationRuntime, id: string, command: SimulationCommand): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function hire(runtime: SimulationRuntime, id: string, tile: { readonly x: number; readonly y: number } = ORIGIN): void {
  submit(runtime, id, { type: 'HireStaff', staffRoleId: GUARD, x: tile.x, y: tile.y });
}

function dismiss(runtime: SimulationRuntime, id: string, staffId: number): void {
  submit(runtime, id, { type: 'DismissStaff', staffId });
}

/** A cell with a furnished place and one arrival, so the derived sector needs a guard. */
function prisonWithOneOccupant(seed = SEED): SimulationRuntime {
  const runtime = createNewSimulationRuntime(seed);
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', { type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
  const cell = runtime.prisoners.roomInstances.allByRoomCatalogId('room.cell')[0]!;
  runtime.prisoners.roomInstances.updateDerived(cell.instanceId, {
    residentCapacity: 1, concurrentUseCapacity: 1,
    concurrentUseCapacityByCapability: [['sleep-surface', 1]], objectCapabilities: ['sleep-surface'],
  });
  submit(runtime, 'admit-1', { type: 'AdmitPrisoner', ...ADMISSION, ...ORIGIN });
  if (runtime.refusals.count > 0) throw new Error('The admission this fixture depends on was refused.');
  while (runtime.kernel.tick % 10 !== 0) runtime.kernel.step();
  return runtime;
}

describe('a hire is no longer permanent', () => {
  it('takes the staff member off the roster, and off the payroll with them', () => {
    const runtime = prisonWithOneOccupant();
    hire(runtime, 'hire-1');
    expect(runtime.securityGuards.allGuardIds()).toEqual([0]);

    const balanceBeforeDismissal = runtime.treasury.balanceMinorUnits;
    dismiss(runtime, 'dismiss-1', 0);

    expect(runtime.securityGuards.allGuardIds()).toEqual([]);
    expect(runtime.refusals.count).toBe(0);
    // Neither a refund nor a severance: the dismissal itself moves no money.
    // What it ends is the *future* payroll, asserted below.
    expect(runtime.treasury.balanceMinorUnits).toBe(balanceBeforeDismissal);

    // A whole in-game day, twice over. `PayrollSystem` bills every id the
    // roster holds at each day boundary, so a roster that still held this one
    // would show two more debits here. This is the assertion the defect was
    // about: before the command existed there was no way to reach it.
    const balanceAfterDismissal = runtime.treasury.balanceMinorUnits;
    for (let tick = 0; tick < 4_800; tick += 1) runtime.kernel.step();
    expect(runtime.treasury.balanceMinorUnits).toBeGreaterThanOrEqual(balanceAfterDismissal);
    // Arrears are the part of a bill the prison could not pay (`payroll.ts`). A
    // roster this dismissal did not empty would accrue them here in a prison
    // with no income; an empty roster has no bill to fall behind on.
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
  });

  it('refuses a staff id the roster does not hold, and says so down the one channel a refusal has', () => {
    const runtime = prisonWithOneOccupant();
    hire(runtime, 'hire-1');
    dismiss(runtime, 'dismiss-1', 0);
    expect(runtime.refusals.count).toBe(0);

    // The second press on a row a cadence-stale projection still shows. Not a
    // silent no-op: `EntityStore.destroy` tolerates a double destroy, and a
    // command that answered a player with silence would be a control that
    // appeared to work and did not.
    const tick = runtime.kernel.tick;
    dismiss(runtime, 'dismiss-again', 0);
    expect(runtime.refusals.count).toBe(1);
    expect(runtime.refusals.last).toEqual({ sequence: 1, tick, reason: 'dismiss.unknown-staff' });

    // ...and an id nobody was ever hired into reaches the same reason, which is
    // why the two states are one refusal rather than two.
    dismiss(runtime, 'dismiss-nobody', 4_242);
    expect(runtime.refusals.count).toBe(2);
    expect(runtime.refusals.last?.reason).toBe('dismiss.unknown-staff');
  });

  it('lets the freed index be hired into again, under an id that is not the old one', () => {
    const runtime = prisonWithOneOccupant();
    hire(runtime, 'hire-1');
    const first = runtime.securityGuards.allGuardIds()[0]!;
    dismiss(runtime, 'dismiss-1', first);

    hire(runtime, 'hire-2');
    const second = runtime.securityGuards.allGuardIds()[0]!;

    // The same slot, a later life: index 0 both times, generation 0 then 1.
    // This is what makes the old id safe to hold on to -- `isAlive` rejects it,
    // rather than silently naming the new occupant.
    expect(runtime.securityGuards.entityStore.getIndex(second)).toBe(runtime.securityGuards.entityStore.getIndex(first));
    expect(second).not.toBe(first);
    expect(runtime.securityGuards.entityStore.isAlive(first)).toBe(false);
    expect(runtime.securityGuards.entityStore.isAlive(second)).toBe(true);
    // And the stale handle cannot be used to sack the new occupant.
    dismiss(runtime, 'dismiss-stale', first);
    expect(runtime.securityGuards.allGuardIds()).toEqual([second]);
    expect(runtime.refusals.last?.reason).toBe('dismiss.unknown-staff');
  });

  it('gives the new occupant of a recycled slot a name of their own, rather than the last one`s', () => {
    const runtime = prisonWithOneOccupant();
    hire(runtime, 'hire-1');
    const first = runtime.securityGuards.allGuardIds()[0]!;
    expect(runtime.actorIdentity.getName('staff', first)).toBeDefined();

    dismiss(runtime, 'dismiss-1', first);
    // `ActorIdentityRegistry.release`'s own contract: *"Required when the actor
    // is destroyed: `EntityStore` recycles the index, so a retained entry would
    // eventually hand the slot's next occupant the previous occupant's name."*
    // Nothing had ever called it for a staff member before this command.
    expect(runtime.actorIdentity.getName('staff', first)).toBeUndefined();
    expect(runtime.actorIdentity.entries().filter((entry) => entry.kind === 'staff')).toEqual([]);

    hire(runtime, 'hire-2');
    const second = runtime.securityGuards.allGuardIds()[0]!;
    expect(runtime.actorIdentity.getName('staff', second)).toBeDefined();
  });
});

describe('a staff member mid-task is dismissed without stranding what was holding them', () => {
  it('cancels the route a travelling guard was walking, instead of leaving a request nothing resolves', () => {
    const runtime = prisonWithOneOccupant();
    hire(runtime, 'hire-far', FAR_TILE);

    // A real route request against the session's own `NavigationSystem`, which
    // is the state `GuardRoster.unassign` clears without telling navigation.
    const requestId = runtime.securityGuards.getPathRequestId(0);
    expect(requestId).toBeDefined();
    expect(runtime.securityGuards.getDeploymentPhase(0)).toBe('travelling');

    dismiss(runtime, 'dismiss-1', 0);

    expect(runtime.securityGuards.allGuardIds()).toEqual([]);
    // The request is gone from both halves of the queue: still-pending and
    // already-resolved. Before this command, `NavigationSystem.cancelRequest`
    // had exactly one caller in `src/` -- `releasePrisoner` -- so no guard's
    // route had ever been cancelled by anything.
    expect(runtime.navigation.getResult(requestId!)).toBeUndefined();
    expect(runtime.navigation.cancelRequest(requestId!)).toBe(false);
  });

  it('takes a posted guard off the post, and the sector reports the shortage that leaves', () => {
    const runtime = prisonWithOneOccupant();
    hire(runtime, 'hire-1');
    expect(runtime.securityGuards.getDeploymentPhase(0)).toBe('on-post');
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 1, assigned: 1, shortage: 0 },
    ]);

    dismiss(runtime, 'dismiss-1', 0);

    // The sector's own bookkeeping is the phase and the sector id on the roster
    // record (`GuardReleaseService`: "`DeploymentSystem` holds no per-guard
    // record of its own"), so removing the record is the whole of the release --
    // and the coverage report says so rather than continuing to count a guard
    // who has gone.
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: 'security-sector.prison', required: 1, assigned: 0, shortage: 1 },
    ]);
    expect(runtime.deploymentSystem.getMetrics()).toEqual({ deploymentFailures: 0 });
  });
});

describe('what a dismissal does to a save', () => {
  it('round-trips a prison whose staff store has recycled an index, with no schema bump', () => {
    const live = prisonWithOneOccupant();
    hire(live, 'hire-1');
    dismiss(live, 'dismiss-1', 0);
    hire(live, 'hire-2');
    for (let tick = 0; tick < 50; tick += 1) live.kernel.step();

    const restored = restoreSimulationRuntime(captureSessionSnapshot(live), SEED).runtime;

    // The *same ids*, not merely the same count: `entity-codec.ts` run-length
    // encodes `generations` and `alive` in full and writes the free list's live
    // prefix verbatim, so a slot on its second life comes back on its second
    // life. Nothing here needed a `SAVE_SCHEMA_VERSION` bump, because a
    // dismissal writes no new kind of value -- it shortens a list and marks a
    // slot dead, both of which this payload has always expressed.
    expect(restored.securityGuards.allGuardIds()).toEqual(live.securityGuards.allGuardIds());
    const survivor = live.securityGuards.allGuardIds()[0]!;
    expect(restored.securityGuards.getStaffRoleId(survivor)).toBe(GUARD);
    expect(restored.securityGuards.entityStore.isAlive(survivor)).toBe(true);
    // The dismissed id stays dead across the boundary, which is what stops a
    // restored session from handing a stale handle a live entity.
    expect(restored.securityGuards.entityStore.isAlive(0)).toBe(false);
  });
});
