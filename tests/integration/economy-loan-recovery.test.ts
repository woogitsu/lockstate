import { describe, expect, it } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import {
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import type { LoanTerms } from '../../src/simulation/economy';

/**
 * **Playing out of [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)'s
 * locked position**, which decision 2 exists to dissolve.
 *
 * `tests/integration/economy-liquidity-hard-lock.test.ts` is the other side of
 * this file and stays exactly as it is: it establishes that the position is
 * terminal *with no loan*, by exhausting the escapes. This one establishes
 * what a loan changes, and the two are not substitutes -- a remedy that made
 * that file green by accident would be a remedy nobody had read.
 *
 * ## What is pinned here, and what deliberately is not
 *
 * **No magnitude.** The terms below are a probe. The diversion percentage, the
 * fee and the maximum duration belong to
 * [#29](https://github.com/matmaxalez/lockstate/issues/29) under ADR 0017
 * decision 5, and the five candidate triples they were chosen from -- with the
 * in-game days each costs -- are priced in
 * `scripts/report-loan-recovery-pricing.mjs` and recorded in
 * `docs/research/2026-08-30-pricing-the-way-out.md`. What is pinned is the
 * *shape*: that the position is reachable and stationary, that a loan smaller
 * than what the build queue already owes buys nothing at all, and that one
 * larger than it houses a prisoner.
 *
 * ## Why the position is built by playing rather than by assignment
 *
 * Every wall below goes through `packCommand` and the real command router, so
 * the treasury reaches 40 the way a player's does: 312 funded segments at 80,
 * and the thirteen behind them that the money ran out on. A fixture that set
 * the balance to 40 would be testing a number rather than a prison, and the
 * thirteen unfunded orders are the whole of the second case.
 */

/**
 * A probe, and nothing here is a recommendation.
 *
 * Chosen so the arithmetic is legible rather than because it is right: a
 * quarter of every inflow, a fee of fifteen per cent, and a duration far
 * enough out that no case below reaches it. `scripts/report-loan-recovery-pricing.mjs`
 * is what prices the real thing.
 */
const PROBE_TERMS: LoanTerms = {
  diversionRateBasisPoints: 2_500,
  feeRateBasisPoints: 1_500,
  maximumDurationDays: 45,
  escalatedDiversionRateBasisPoints: 4_500,
};

const SEED = 0x692;
/** `room.cell`'s authored minimum, the rectangle every object fixture in this repository uses. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const CELL_INSTANCE_ID = `room.cell:${CELL_RECT.x}:${CELL_RECT.y}`;
/** The tile `src/main.ts` admits at. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Written out rather than read from the catalogue: two `item.brick` at 40 (`docs/TESTING.md`). */
const WALL_COST = 80;
/** The thirteen orders the playtest read as *"Waiting for 1,040 to buy materials."* at the bottom. */
const UNFUNDED_TAIL = 13;
const STANDING_SHORTFALL = UNFUNDED_TAIL * WALL_COST;

interface Edge {
  readonly x: number;
  readonly y: number;
  readonly edge: 'north' | 'west';
}

function cellRingEdges(): Edge[] {
  const ring: Edge[] = [];
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

/** Every other edge in the one 32x32 chunk a new session owns. */
function fillerEdges(ring: readonly Edge[]): Edge[] {
  const taken = new Set(ring.map((edge) => `${String(edge.x)}:${String(edge.y)}:${edge.edge}`));
  const edges: Edge[] = [];
  for (let y = 1; y < 32; y += 1) {
    for (let x = 1; x < 32; x += 1) {
      for (const edge of ['north', 'west'] as const) {
        if (!taken.has(`${String(x)}:${String(y)}:${edge}`)) edges.push({ x, y, edge });
      }
    }
  }
  return edges;
}

function send(runtime: SimulationRuntime, command: SimulationCommand): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(`c${String(sequence)}`, sequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function stepDays(runtime: SimulationRuntime, days: number): void {
  for (let index = 0; index < DAY_LENGTH_TICKS * days; index += 1) runtime.kernel.step();
}

interface LockedPosition {
  readonly runtime: SimulationRuntime;
  readonly doorway: Edge;
  readonly unfunded: readonly string[];
}

/**
 * Plays into the lock: nine of the cell's ten perimeter edges, then filler
 * wall until 312 segments are funded, then thirteen more the money did not
 * reach. The tenth ring edge is left for the door the prison cannot afford.
 */
function lockedPosition(): LockedPosition {
  const runtime = createNewSimulationRuntime(SEED, { loanTerms: PROBE_TERMS });
  const ring = cellRingEdges();
  const doorway = ring[ring.length - 1] as Edge;
  const order = [...ring.slice(0, ring.length - 1), ...fillerEdges(ring)];
  for (let index = 0; index < 312; index += 1) {
    send(runtime, { type: 'PlaceBuildOrder', orderId: `wall-${String(index)}`, definitionId: 'wall-brick', ...(order[index] as Edge) });
  }
  const unfunded: string[] = [];
  for (let extra = 0; extra < UNFUNDED_TAIL; extra += 1) {
    const orderId = `tail-${String(extra)}`;
    send(runtime, { type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick', ...(order[312 + extra] as Edge) });
    unfunded.push(orderId);
  }
  // Twenty in-game days: long enough for all 312 funded segments to stand.
  stepDays(runtime, 20);
  return { runtime, doorway, unfunded };
}

/**
 * The door, the designation and `beds` sleep surfaces -- the whole of what a
 * prison needs to start earning.
 *
 * Returns the refusal the **designation** produced, rather than leaving the
 * caller to read `refusals.last` after the beds have run: a bed placed in a
 * rectangle that was never zoned is refused `place-object.outside-room`, which
 * is a true sentence about the wrong step.
 */
function furnishCell(runtime: SimulationRuntime, doorway: Edge, beds: number): { readonly zoneRefusal: string | undefined } {
  send(runtime, { type: 'PlaceBuildOrder', orderId: 'door', definitionId: 'door-wooden', ...doorway });
  for (let index = 0; index < 600; index += 1) runtime.kernel.step();
  // Reference identity rather than a sequence comparison: `RefusalLog` numbers
  // its own entries, so `refusals.last.sequence` is not the command's.
  const beforeZone = runtime.refusals.last;
  send(runtime, { type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT });
  const zoneRefusal = runtime.refusals.last === beforeZone ? undefined : runtime.refusals.last?.reason;
  for (let bed = 0; bed < beds; bed += 1) {
    send(runtime, {
      type: 'PlaceObject',
      orderId: `bed-${String(bed)}`,
      definitionId: 'bed-wooden',
      x: CELL_RECT.x + (bed % CELL_RECT.width),
      y: CELL_RECT.y + Math.floor(bed / CELL_RECT.width),
    });
  }
  for (let index = 0; index < 900; index += 1) runtime.kernel.step();
  return { zoneRefusal };
}

describe('the locked position, reached by playing into it', () => {
  it('is 40 in the bank against a 65 plank, and stays there', () => {
    const { runtime } = lockedPosition();

    // 312 x 80 = 24,960 of 25,000.
    expect(runtime.treasury.balanceMinorUnits).toBe(40);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(0);
    const states: Record<string, number> = {};
    for (const order of runtime.construction.snapshot().orders) states[order.state] = (states[order.state] ?? 0) + 1;
    expect(states, 'every funded segment is standing and the tail never starts').toEqual({
      completed: 312,
      'materials-pending': UNFUNDED_TAIL,
    });

    send(runtime, { type: 'PurchaseMaterials', orderId: 'plank', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');

    stepDays(runtime, 20);
    expect(runtime.treasury.balanceMinorUnits, 'twenty more in-game days and nothing moves').toBe(40);
  }, 30_000);

  it('takes nothing back from a prison that borrows and never starts earning', () => {
    /*
     * The property the owner's ruling rests on, at the scale of a session
     * rather than of a method: *"a repayment that takes a share of what
     * arrives cannot bill a prison that is earning nothing."* Thirty in-game
     * days of holding a debt against no income leaves the figure exactly where
     * the drawdown left it -- which is what makes this not a loss condition
     * reached by arithmetic.
     */
    const { runtime } = lockedPosition();
    runtime.loans?.draw(1_000, runtime.kernel.tick);
    const owed = runtime.loans?.outstandingMinorUnits;
    // 1,000 + 15% of 1,000.
    expect(owed).toBe(1_150);

    stepDays(runtime, 30);

    expect(runtime.loans?.outstandingMinorUnits, 'not one minor unit was billed').toBe(1_150);
    expect(runtime.loans?.divertedTotalMinorUnits).toBe(0);
  }, 30_000);
});

describe('what a loan does to the locked position, and what it does not', () => {
  it('buys nothing at all when the standing build queue can swallow it whole', () => {
    /*
     * **The finding this file exists for.** At the bottom the prison already
     * owes 1,040 to thirteen wall orders it could not fund, and
     * `ConstructionSystem.update` calls `procureForPendingOrders` on every
     * scheduled tick -- so the first 1,040 of any money that arrives is spent
     * on walls before the player can spend a minor unit of it on a plank.
     *
     * A loan of 1,000 against that queue therefore leaves the prison exactly
     * where it was, with the balance back at zero and the cell still not
     * enclosed. Nothing in the interface says so.
     */
    const { runtime, doorway } = lockedPosition();
    expect(STANDING_SHORTFALL).toBe(1_040);

    runtime.loans?.draw(1_000, runtime.kernel.tick);
    expect(runtime.treasury.balanceMinorUnits, 'the principal, on top of the 40').toBe(1_040);

    const { zoneRefusal } = furnishCell(runtime, doorway, 1);

    expect(runtime.treasury.balanceMinorUnits, 'every minor unit went into wall').toBe(0);
    expect(zoneRefusal, 'the door was never built, so the rectangle is not a room').toBe('zone.not-enclosed');
    expect(runtime.refusals.last?.reason, 'and the bed is then refused for a reason that is not about money').toBe('place-object.outside-room');
    expect(runtime.prisoners.roomInstances.getById(CELL_INSTANCE_ID)).toBeUndefined();

    stepDays(runtime, 20);
    expect(runtime.prisoners.roomInstances.totalOccupancy, 'and the prison is still locked').toBe(0);
    expect(runtime.loans?.outstandingMinorUnits, 'owing 1,150 it can never repay').toBe(1_150);
  }, 30_000);

  it('houses a prisoner on the second day once the loan clears the queue as well as the plank', () => {
    /*
     * The same prison, the same terms, and a principal above the standing
     * shortfall: 1,040 to the walls, 65 to a door, 65 to a bed, and the income
     * line starts. The class ADR 0075 could not close is closed here, and what
     * closed it is that money could enter at all.
     */
    const { runtime, doorway } = lockedPosition();
    const drawnAt = runtime.kernel.tick;
    runtime.loans?.draw(1_500, drawnAt);
    expect(runtime.loans?.outstandingMinorUnits, '1,500 + 15%').toBe(1_725);

    expect(furnishCell(runtime, doorway, 1).zoneRefusal, 'the door stands, so the rectangle is a room').toBeUndefined();
    expect(runtime.prisoners.roomInstances.getById(CELL_INSTANCE_ID)?.residentCapacity, 'a bed is a place').toBe(1);

    send(runtime, { type: 'AdmitPrisoner', ...ARRIVAL, sentenceLengthTicks: 5_000_000, priorIncidents: 0 });
    stepDays(runtime, 2);

    expect(runtime.prisoners.roomInstances.totalOccupancy, 'somebody is asleep in it').toBe(1);
    expect(runtime.loans?.divertedTotalMinorUnits, 'and the first payment has already been shared with the debt').toBeGreaterThan(0);
    expect(runtime.treasury.balanceMinorUnits).toBeGreaterThan(65);
  }, 30_000);
});
