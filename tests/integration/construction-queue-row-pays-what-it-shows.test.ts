import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { projectBuildQueue, type BuildQueueOrderViewModel } from '../../src/simulation/presentation';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * **The treasury-agreement test.** The Build panel's queue row now says what
 * `CancelBuildOrder` would pay (the owner's ruling of 2026-09-02,
 * `src/content/default-locale-en.ts`'s `hud.build.queue-order`), and this file
 * is the one claim that matters about that figure: it must never disagree with
 * what pressing Cancel actually does to the treasury.
 *
 * The shape of every case below is the same, and it is the shape the brief for
 * this change asked for by name: **read the row's figure off the real
 * projection, press Cancel through the real command, and assert the treasury
 * moved by exactly that figure** -- never a value computed a second way and
 * compared to the row, which `docs/TESTING.md` forbids as a fixture supplying
 * both sides of its own comparison. The row's figure *is* one of the two
 * numbers being compared; the treasury's own before/after is the other, and
 * neither is invented here.
 *
 * Every command goes through `packCommand` and the real kernel
 * (`tests/unit/simulation-refusals.test.ts`'s rule, followed by this file's
 * sibling `tests/integration/economy-cancel-what-comes-back.test.ts`), and
 * every tick figure below is the one that file already measured rather than a
 * second guess at the schedule.
 */

const SEED = 0x902;
const WALL = 'wall-brick';
const UNIT_PRICE = new Map(PROCURABLE_MATERIALS.map((material) => [material.itemId, material.unitPriceMinorUnits]));
const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
/** Two bricks at 40, read from content rather than written down (`docs/TESTING.md`). */
const WALL_COST = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity;

function session(seed = SEED): SimulationRuntime {
  return createNewSimulationRuntime(seed);
}

function dispatch(runtime: SimulationRuntime, commands: readonly SimulationCommand[]): void {
  for (const command of commands) {
    runtime.kernel.submitCommand(
      `cmd-${runtime.kernel.expectedSequence}`,
      runtime.kernel.expectedSequence,
      runtime.kernel.tick,
      packCommand(command),
    );
  }
  runtime.kernel.step();
}

function placeWall(orderId: string, x: number, y: number): SimulationCommand {
  return { type: 'PlaceBuildOrder', orderId, definitionId: WALL, x, y, transactionId: `txn-${orderId}` };
}

/** Advances `ticks` scheduled steps from wherever the kernel is now -- relative, not absolute. */
function run(runtime: SimulationRuntime, ticks: number): void {
  for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
}

/** The one row this file ever reads, by id -- so a test fails loudly if the order it means is not on the page. */
function rowFor(runtime: SimulationRuntime, orderId: string): BuildQueueOrderViewModel {
  const view = projectBuildQueue(runtime.construction, {}, runtime.justInTimeMaterials);
  const row = view.orders.rows.find((candidate) => candidate.orderId === orderId);
  if (row === undefined) throw new Error(`${orderId} is not on the queue page`);
  return row;
}

/**
 * Reads the row, presses Cancel through the real command, and asserts the
 * treasury moved by exactly the figure the row showed -- the whole of what
 * this file exists to prove, run once per case below.
 */
function expectRowPaysWhatItShows(runtime: SimulationRuntime, orderId: string, expectedState: string): number {
  const row = rowFor(runtime, orderId);
  expect(row.state, `${orderId} is expected to be ${expectedState} when its row is read`).toBe(expectedState);

  const balanceBefore = runtime.treasury.balanceMinorUnits;
  dispatch(runtime, [{ type: 'CancelBuildOrder', orderId }]);
  const movedBy = runtime.treasury.balanceMinorUnits - balanceBefore;

  expect(movedBy, `${orderId}'s row promised ${String(row.cancelRefundMinorUnits)} and the press moved ${String(movedBy)}`).toBe(
    row.cancelRefundMinorUnits,
  );
  return movedBy;
}

describe('the queue row pays what it shows, at every state it can be read in', () => {
  it('the money case: a delivery still on the road', () => {
    // `PlaceBuildOrder` buys at the press (`ConstructionSystem.procureQueuedMaterials`'s
    // own comment on when it runs), so on the very next tick the order is
    // `'materials-pending'` with its money already spent into a delivery.
    const runtime = session();
    dispatch(runtime, [placeWall('order-a', 3, 3)]);
    expect(runtime.treasury.balanceMinorUnits).toBe(TREASURY_STARTING_BALANCE_MINOR_UNITS - WALL_COST);

    const movedBy = expectRowPaysWhatItShows(runtime, 'order-a', 'materials-pending');
    expect(movedBy, 'the whole 80 back, in money').toBe(WALL_COST);
  });

  it('the zero case named by the playtest: `in-progress`', () => {
    /*
     * The exact scenario the brief for this change names: a cancel on an
     * `'in-progress'` order must move the treasury by 0, and the row must
     * have already said `0 back` before the press. Ruling 20's `in-progress`
     * row is the one state that destroys value on purpose -- the materials
     * went into a wall that is now being un-built -- so this is the sharpest
     * possible case for "the row must not promise money the press does not
     * pay".
     */
    const runtime = session();
    dispatch(runtime, [placeWall('order-a', 3, 3)]);
    // `'approved'` at 0, `'materials-pending'` at 0 (the same tick, the
    // schedule's own first pass), the delivery lands at
    // `PROCUREMENT_DELIVERY_DELAY_TICKS`, `'assigned'` ten scheduled ticks
    // later, `'in-progress'` the scheduled tick after that -- measured in
    // `economy-cancel-what-comes-back.test.ts`.
    run(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 20);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('in-progress');

    const movedBy = expectRowPaysWhatItShows(runtime, 'order-a', 'in-progress');
    expect(movedBy, 'nothing at all, and the row said so before the press').toBe(0);
  });

  it('the other zero case: materials landed, still `materials-pending`, nothing on the road to turn around', () => {
    /*
     * The sharp edge `economy-cancel-what-comes-back.test.ts` documents by
     * name: same state label as the money case above, different payout,
     * because the bricks are already on the shelf and there is no delivery
     * left for `refundSurplusDeliveries` to cancel. A row that read `state`
     * alone could not tell this case apart from the first one; this file
     * reads the row's own figure instead, which already knows the
     * difference.
     */
    const runtime = session();
    dispatch(runtime, [placeWall('order-a', 3, 3)]);
    run(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('materials-pending');
    expect(runtime.procurement.pendingDeliveries, 'nothing left on the road for this item').toHaveLength(0);

    const movedBy = expectRowPaysWhatItShows(runtime, 'order-a', 'materials-pending');
    expect(movedBy, 'nothing -- the row does not promise money that already turned into bricks').toBe(0);
  });

  it('the money case at `assigned`: the catalogue value of the material it is holding', () => {
    const runtime = session();
    dispatch(runtime, [placeWall('order-a', 3, 3)]);
    run(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 10);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('assigned');

    const movedBy = expectRowPaysWhatItShows(runtime, 'order-a', 'assigned');
    expect(movedBy, 'the catalogue value of the two bricks it is holding').toBe(WALL_COST);
  });

  it('a queue of two: cancelling the one whose delivery is on the road leaves the other exactly where it was', () => {
    /*
     * The multi-row case a single-order fixture cannot exercise:
     * `previewCancelRefundMinorUnits` has to exclude the previewed order from
     * the demand it compares supply against (`demandedQuantityOf`'s own
     * comment), and with only one order in the book that exclusion cannot be
     * distinguished from not excluding anything. Two orders can.
     */
    const runtime = session();
    dispatch(runtime, [placeWall('order-a', 3, 3), placeWall('order-b', 3, 4)]);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('materials-pending');
    expect(runtime.construction.getOrder('order-b')?.state).toBe('materials-pending');

    const rowA = rowFor(runtime, 'order-a');
    const rowB = rowFor(runtime, 'order-b');
    expect([rowA.cancelRefundMinorUnits, rowB.cancelRefundMinorUnits], 'each order paid for its own delivery').toEqual([
      WALL_COST,
      WALL_COST,
    ]);

    const movedBy = expectRowPaysWhatItShows(runtime, 'order-a', 'materials-pending');
    expect(movedBy).toBe(WALL_COST);

    // `order-b` was not the one pressed, and its own row still promises
    // exactly what it did before -- the press must not have moved money out
    // from under a control nobody touched.
    expect(runtime.construction.getOrder('order-b')?.state).toBe('materials-pending');
    expect(rowFor(runtime, 'order-b').cancelRefundMinorUnits).toBe(WALL_COST);
  });
});
