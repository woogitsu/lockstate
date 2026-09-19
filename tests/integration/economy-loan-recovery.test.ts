import { describe, expect, it } from 'vitest';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import {
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, type LoanTerms } from '../../src/simulation/economy';

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
 * *shape*: that the position is reachable and stationary, what the standing
 * overdraft does to it with no loan at all, and that a loan larger than the
 * standing shortfall houses a prisoner.
 *
 * ## What #703 ruling A did to this file, which is more than move a figure
 *
 * **The paragraph above ended *"that a loan smaller than what the build queue
 * already owes buys nothing at all"*, and that was the finding this file was
 * written for.** It is kept because it was measured and because the *mechanism*
 * it names is unchanged: `ConstructionSystem.procureQueuedMaterials` spends the
 * first 1,040 of any money that arrives, before the player can spend a minor
 * unit of it on a plank.
 *
 * What changed is **when money arrives**. #703 ruled a standing overdraft of
 * 2,500 in every session
 * ([ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * §2), so the queue is funded out of the facility at the moment it is placed and
 * the position at the bottom is **-1,000 with all 325 segments standing**,
 * rather than 40 with thirteen `materials-pending`. From there a door and a bed
 * are affordable out of the 1,500 of room that is left, and the prison houses a
 * prisoner on day 1.63 with **no loan of any kind** --
 * `scripts/report-loan-recovery-pricing.mjs` §9 measures the same run and the
 * first case below plays it.
 *
 * So the position ADR 0075 decision 2 exists to dissolve is dissolved by the
 * ruling's own half of that decision, in this reproduction. It is not dissolved
 * in general: a player who keeps pressing until something is refused is locked
 * at the floor instead of at 40, which
 * `tests/integration/construction-just-in-time-materials.test.ts` measures on
 * the drag gesture.
 *
 * ## Why the position is built by playing rather than by assignment
 *
 * Every wall below goes through `packCommand` and the real command router, so
 * the treasury reaches the bottom the way a player's does: 312 funded segments
 * at 80, and the thirteen behind them that the *balance* ran out on. A fixture
 * that set the balance would be testing a number rather than a prison, and the
 * thirteen orders past the opening grant are the whole of the second case.
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
  /**
   * **This case was titled *"is 40 in the bank against a 65 plank, and stays
   * there"* and it asserted the lock. Every figure in it was measured:**
   *
   * > ```
   * > expect(runtime.treasury.balanceMinorUnits).toBe(40);          // 312 x 80 of 25,000
   * > expect(states).toEqual({ completed: 312, 'materials-pending': 13 });
   * > send(... PurchaseMaterials 'item.wood-plank' x1);
   * > expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
   * > ```
   *
   * #703 ruling A funds those thirteen orders out of the standing overdraft, so
   * the position is 1,040 lower and 1,500 of the facility is still unspent --
   * which is enough for the 65 plank the old assertion watched being refused.
   * The property the file's docblock names is the one kept below: the position
   * is *reachable and stationary*. It is no longer terminal.
   */
  it('funds its own tail out of the standing overdraft and is not locked at all', () => {
    const { runtime } = lockedPosition();

    // 325 x 80 = 26,000, against 25,000 of grant: 1,000 of the facility spent.
    expect(runtime.treasury.balanceMinorUnits).toBe(-STANDING_SHORTFALL + 40);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(0);
    const states: Record<string, number> = {};
    for (const order of runtime.construction.snapshot().orders) states[order.state] = (states[order.state] ?? 0) + 1;
    expect(states, 'the tail the grant could not reach was bought with no press').toEqual({
      completed: 312 + UNFUNDED_TAIL,
    });

    // The press the old case watched being refused.
    send(runtime, { type: 'PurchaseMaterials', orderId: 'plank', itemId: 'item.wood-plank', quantity: 1 });
    expect(runtime.refusals.last, 'a plank is affordable out of the 1,500 of room left').toBeUndefined();
    expect(runtime.treasury.balanceMinorUnits).toBe(-STANDING_SHORTFALL + 40 - 65);

    // Stationary, which is the half that has not changed: no bed, so no income,
    // so nothing moves the balance in either direction.
    stepDays(runtime, 20);
    expect(runtime.treasury.balanceMinorUnits, 'twenty more in-game days and nothing moves').toBe(
      -STANDING_SHORTFALL + 40 - 65,
    );
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
  /**
   * **The finding this file exists for, and #703 ruling A changed which money it
   * eats.** What stood here, measured:
   *
   * > At the bottom the prison already owes 1,040 to thirteen wall orders it
   * > could not fund, and `ConstructionSystem.update` calls
   * > `procureForPendingOrders` on every scheduled tick -- so the first 1,040 of
   * > any money that arrives is spent on walls before the player can spend a
   * > minor unit of it on a plank. A loan of 1,000 against that queue therefore
   * > leaves the prison exactly where it was, with the balance back at zero and
   * > the cell still not enclosed. Nothing in the interface says so.
   *
   * **The mechanism is untouched and the victim is different.** With a standing
   * overdraft the money that arrives first is the *facility*, at the moment the
   * order is placed -- so the queue is paid before any loan is drawn, and a loan
   * of 1,000 on top of that is ordinary cash the player can spend on a plank.
   * There is no longer a principal small enough for the queue to swallow,
   * because the queue has already been fed.
   *
   * What is measured below is the half a player still meets: **the 1,040 is
   * spent with no press and nothing in the interface says so.** It is the same
   * silence, moved from "after you borrow" to "before you have done anything",
   * and it is why the overdraft is a hidden feature until somebody writes the
   * sentence -- which is the owner's under `AGENTS.md`.
   */
  it('spends the standing shortfall with no press, out of the facility rather than out of a loan', () => {
    const { runtime, doorway } = lockedPosition();
    expect(STANDING_SHORTFALL).toBe(1_040);

    /*
     * Half of what the old case drew, and it makes no difference to the queue:
     * the queue is already funded, so nothing diverts this and all of it is
     * spendable.
     */
    runtime.loans?.draw(1_000, runtime.kernel.tick);
    expect(runtime.treasury.balanceMinorUnits, 'the principal, on top of -1,000').toBe(0);

    const { zoneRefusal } = furnishCell(runtime, doorway, 1);

    expect(zoneRefusal, 'the door is affordable now, so the rectangle is a room').toBeUndefined();
    expect(runtime.prisoners.roomInstances.getById(CELL_INSTANCE_ID)?.residentCapacity).toBe(1);
    expect(runtime.treasury.balanceMinorUnits, 'a door at 65 and a bed at 65, out of the principal').toBe(-130);

    send(runtime, { type: 'AdmitPrisoner', ...ARRIVAL, sentenceLengthTicks: 5_000_000, priorIncidents: 0 });
    stepDays(runtime, 5);
    expect(runtime.prisoners.roomInstances.totalOccupancy, 'and the prison is earning').toBe(1);
    expect(runtime.treasury.balanceMinorUnits).toBeGreaterThan(0);
  }, 30_000);

  /**
   * The control the case above needs, and the one that says the 1,040 was spent
   * by the thirteen orders and by nothing else: the same 312 segments without
   * the tail leave the facility untouched at 40.
   *
   * **Re-measured on 2026-09-01: `CancelBuildOrder` is still not the control,
   * and now for a different reason than the one first written here.**
   * *"`cancelOrder` returns bricks, never money"* was true when this case was
   * written and false the moment the owner's ruling 20 landed (#746, ADR
   * 0076's amendment): a `materials-pending` order -- which is what all
   * thirteen tail orders are, twenty days on, per `ConstructionSystem.update`'s
   * unconditional `'approved'` -> `'materials-pending'` transition -- now
   * refunds money rather than bricks. The case below has been run rather than
   * guessed at, and the balance it measures is unchanged: still -1,000. Not
   * because the currency change did not happen, but because there is nothing
   * in either currency to hand back. ADR 0081 (#725) funds the queue one whole
   * order at a time and skips an order the treasury cannot cover in full
   * (`ConstructionSystem.update`), and the thirteen tail orders are exactly
   * what it skips -- none of them ever reached `procureQueuedMaterials`, so
   * none holds a delivery in flight. `cancelOrder`'s `refundSurplusOf` pays
   * back only the surplus a cancellation creates between demand
   * (`demandedQuantityOf`) and what is actually held or in flight
   * (`ConstructionProcurementSink.heldOrInFlightOf`), and both are zero for
   * these thirteen, before and after every one of them is cancelled. So the
   * sentence this case needed was never about which currency `cancelOrder`
   * pays in -- it is that **an order the queue never funded returns nothing,
   * in either currency** -- and that is what is measured below, not guessed
   * at.
   */
  it('leaves the facility untouched when the thirteen orders are never placed', () => {
    const runtime = createNewSimulationRuntime(SEED, { loanTerms: PROBE_TERMS });
    const ring = cellRingEdges();
    const order = [...ring.slice(0, ring.length - 1), ...fillerEdges(ring)];
    for (let index = 0; index < 312; index += 1) {
      send(runtime, { type: 'PlaceBuildOrder', orderId: `wall-${String(index)}`, definitionId: 'wall-brick', ...(order[index] as Edge) });
    }
    stepDays(runtime, 20);
    expect(runtime.treasury.balanceMinorUnits, '312 x 80 of 25,000, and the facility untouched').toBe(40);
    expect(runtime.treasury.overdraftFloorMinorUnits, 'the whole of it still standing').toBe(
      TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS,
    );

    // And the cancelling player, measured rather than assumed.
    const cancelled = lockedPosition();
    for (const orderId of cancelled.unfunded) {
      send(cancelled.runtime, {
        type: 'CancelBuildOrder',
        orderId,
        // ADR 0107: the true current revision, so the press succeeds.
        expectedRevision: cancelled.runtime.construction.revisionOf(orderId),
      });
    }
    expect(
      cancelled.runtime.treasury.balanceMinorUnits,
      // Not "bricks, never money" any more (#746) -- the treasury balance is
      // unchanged because none of the thirteen was ever funded, so there is
      // no delivery in flight for `cancelOrder` to turn into a refund.
      'cancelling after the fact gives back nothing, because nothing was ever spent on the unfunded tail',
    ).toBe(-STANDING_SHORTFALL + 40);
  }, 60_000);

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
