import { describe, expect, it } from 'vitest';
import {
  INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS,
  TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
  WAGES_STARTER_RESERVE_MINOR_UNITS,
} from '../../src/simulation/economy';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * **[ADR 0096](../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
 * decision 2, through the real kernel: staff hired before any residency
 * capacity exists must still be able to build one complete cell.**
 *
 * This is the exact class the ADR names as the one every measured shape of
 * this repository's own `scripts/report-loan-recovery-pricing.mjs` §6 fails
 * in, 9 of 9 rows: *"staffed and unbuilt, with a loan … balance −2,500,
 * capacity 0, occupancy 0, debt never cleared."* Reproduced here with no loan
 * at all, only the standing overdraft and the wages starter rung ADR 0096
 * decision 2 adds — the ADR's own act B numbers (60 guards, day one, no
 * purchases) and no shortcuts: every wall segment, the door and the bed are
 * placed through `PlaceBuildOrder`/`PlaceObject`, the same commands the Build
 * panel sends, so the just-in-time procurement path that actually stalls is
 * the one under test.
 *
 * **What this file settles that `tests/unit/economy-treasury.test.ts` cannot.**
 * That file proves the *arithmetic* — `floorFor('wages', true)` reads a
 * particular number. It cannot show that number actually lets a build order
 * finish, because the treasury never asks whether a follow-on purchase at a
 * *different* rung succeeds. `ADR 0096`'s own weakest claim #2 names exactly
 * this gap and the check that closes it: *"add a 'wages' rung … and read
 * whether the nine backlog-drained=false rows house anybody. If they do not,
 * decision 2 is wrong."* This file is that check, run once rather than nine
 * times, because the reserve is sized to be independent of headcount — see
 * the case below that varies it.
 */

const SEED = 0x0096a;
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const ARRIVAL = { x: 16, y: 16 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** The ten edges enclosing `CELL_RECT`; the last is left for the door, matching `scripts/report-loan-recovery-pricing.mjs`. */
function cellRingEdges(): readonly { readonly x: number; readonly y: number; readonly edge: 'north' | 'west' }[] {
  const ring: { readonly x: number; readonly y: number; readonly edge: 'north' | 'west' }[] = [];
  for (let x = CELL_RECT.x; x < CELL_RECT.x + CELL_RECT.width; x += 1) {
    ring.push({ x, y: CELL_RECT.y, edge: 'north' });
    ring.push({ x, y: CELL_RECT.y + CELL_RECT.height, edge: 'north' });
  }
  for (let y = CELL_RECT.y; y < CELL_RECT.y + CELL_RECT.height; y += 1) {
    ring.push({ x: CELL_RECT.x, y, edge: 'west' });
    ring.push({ x: CELL_RECT.x + CELL_RECT.width, y, edge: 'west' });
  }
  return ring;
}

/** Hires `guards`, on day one, and presses nothing else — ADR 0096's own act B. */
function hireOnly(guards: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  for (let index = 0; index < guards; index += 1) {
    submit(runtime, `hire-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
  expect(runtime.refusals.count, 'every hire in this fixture must be affordable on day one').toBe(0);
  return runtime;
}

/** Queues the whole cell -- nine wall segments, a door, a bed -- through the commands the Build panel sends. */
function queueTheWholeCell(runtime: SimulationRuntime): void {
  const ring = cellRingEdges();
  const doorway = ring[ring.length - 1]!;
  const wallEdges = ring.slice(0, ring.length - 1);
  wallEdges.forEach((edge, index) => {
    submit(runtime, `wall-${String(index)}`, packCommand({ type: 'PlaceBuildOrder', orderId: `wall-${String(index)}`, definitionId: 'wall-brick', ...edge }));
  });
  submit(runtime, 'door', packCommand({ type: 'PlaceBuildOrder', orderId: 'door', definitionId: 'door-wooden', ...doorway }));
}

function cellResidentCapacity(runtime: SimulationRuntime): number {
  const cellInstanceId = `room.cell:${String(CELL_RECT.x)}:${String(CELL_RECT.y)}`;
  return runtime.prisoners.roomInstances.getById(cellInstanceId)?.residentCapacity ?? 0;
}

describe('ADR 0096 decision 2: a fresh, unfurnished prison can still build one complete cell', () => {
  it('60 guards hired on day one, no purchase ever pressed -- the whole cell still completes', () => {
    const runtime = hireOnly(60);
    // ADR 0096's own reproduction of act B: the standing overdraft opens the
    // room, and 60 guards at 80 is 4,800 a day against 300 a day of income
    // from nothing yet housed -- the class every §6 row of this repository's
    // own loan-pricing instrument fails.
    stepTo(runtime, 8 * DAY_LENGTH_TICKS);
    expect(runtime.treasury.balanceMinorUnits, 'pinned at the wages starter rung, not the treasury floor').toBe(
      INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS + WAGES_STARTER_RESERVE_MINOR_UNITS,
    );
    expect(runtime.treasury.balanceMinorUnits, 'nowhere near the treasury`s own floor').toBeGreaterThan(
      TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
    );
    expect(runtime.payroll.unpaidWagesMinorUnits, 'arrears is where the unaffordable wages go, not the balance').toBeGreaterThan(0);

    // Now the player queues the whole cell -- every wall, the door -- through
    // the just-in-time procurement path the Build panel actually uses, from
    // the worst balance payroll alone has already reached.
    queueTheWholeCell(runtime);
    stepTo(runtime, runtime.kernel.tick + 5_000);
    const states = new Map<string, number>();
    for (const order of runtime.construction.snapshot().orders) states.set(order.state, (states.get(order.state) ?? 0) + 1);
    expect(states.get('completed'), 'nine walls and a door, none stalled at materials-pending').toBe(10);
    expect(states.get('materials-pending'), 'nothing left stalled').toBeUndefined();

    // The bed: the same reserve has to leave enough for the plank too, not
    // only the bricks, or the enclosure is complete and unfurnished.
    submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
    submit(runtime, 'bed', packCommand({ type: 'PlaceObject', orderId: 'bed-1', definitionId: 'bed-wooden', x: CELL_RECT.x, y: CELL_RECT.y }));
    stepTo(runtime, runtime.kernel.tick + 2_000);
    expect(runtime.refusals.last, 'the bed itself must not be refused').toBeUndefined();
    expect(cellResidentCapacity(runtime), 'furnished: the class ADR 0096 decision 2 exists for is closed').toBe(1);

    // And the way back is real, not merely reachable: admitting somebody now
    // holds an occupied place, which is the income line the whole ADR is
    // about.
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 400_000, priorIncidents: 0, ...ARRIVAL }));
    stepTo(runtime, runtime.kernel.tick + 500);
    expect(runtime.prisoners.roomInstances.totalOccupancy, 'housed').toBe(1);
  });

  it('the same class with twenty guards -- the reserve is a bound, not a per-guard allowance', () => {
    // ADR 0096 decision 2 sizes the reserve off the earning unit's own cost,
    // never off headcount -- `Treasury.canAfford` is one comparison against a
    // floor, so twenty guards and sixty guards must be pinned at the
    // identical balance, only reaching it on a different day.
    const runtime = hireOnly(20);
    stepTo(runtime, 20 * DAY_LENGTH_TICKS);
    expect(runtime.treasury.balanceMinorUnits).toBe(INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS + WAGES_STARTER_RESERVE_MINOR_UNITS);

    queueTheWholeCell(runtime);
    stepTo(runtime, runtime.kernel.tick + 5_000);
    const states = new Map<string, number>();
    for (const order of runtime.construction.snapshot().orders) states.set(order.state, (states.get(order.state) ?? 0) + 1);
    expect(states.get('completed')).toBe(10);
  });
});
