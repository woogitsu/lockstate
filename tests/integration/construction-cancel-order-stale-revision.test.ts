import { describe, expect, it } from 'vitest';
import { PROCUREMENT_DELIVERY_DELAY_TICKS, PROCURABLE_MATERIALS } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction';
import { TREASURY_STARTING_BALANCE_MINOR_UNITS } from '../../src/simulation/economy';
import { packCommand, type SimulationCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * **ADR 0107's own mechanism, end to end: a `CancelBuildOrder` naming a stale
 * `expectedRevision` is refused rather than silently paying less than its row
 * advertised.**
 *
 * This is the case #853 and #859 measured happening by accident, produced
 * here on purpose and asserted rather than merely logged: a row read the
 * order as `assigned` at revision *R*, the order transitioned to
 * `in-progress` (a scheduled tick bumps its revision to *R+1*), and a press
 * still carrying *R* must be refused -- the order untouched, the treasury
 * untouched, and `refusals.last?.reason` naming
 * `'cancel-build-order.stale-cancellation'` -- rather than reaching
 * `cancelOrder` and paying ruling 20's `0` for `'in-progress'` without saying
 * so.
 *
 * The control beside it is the ordinary path: a press that carries the
 * order's *current* revision is not refused and cancels exactly as it always
 * has.
 */

const SEED = 0x107;
const WALL = 'wall-brick';
const UNIT_PRICE = new Map(PROCURABLE_MATERIALS.map((material) => [material.itemId, material.unitPriceMinorUnits]));
const WALL_REQUIREMENT = BUILDABLE_REGISTRY.get(WALL)!.materialsRequired[0]!;
const WALL_COST = UNIT_PRICE.get(WALL_REQUIREMENT.itemId)! * WALL_REQUIREMENT.quantity;

function session(seed = SEED): SimulationRuntime {
  return createNewSimulationRuntime(seed);
}

function dispatch(runtime: SimulationRuntime, command: SimulationCommand): void {
  runtime.kernel.submitCommand(`cmd-${runtime.kernel.expectedSequence}`, runtime.kernel.expectedSequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

function run(runtime: SimulationRuntime, ticks: number): void {
  for (let step = 0; step < ticks; step += 1) runtime.kernel.step();
}

describe("ADR 0107: a CancelBuildOrder naming a stale revision is refused, not silently underpaid", () => {
  it('refuses a press whose revision is one transition behind the order it names', () => {
    const runtime = session();
    dispatch(runtime, { type: 'PlaceBuildOrder', orderId: 'order-a', definitionId: WALL, x: 3, y: 3, transactionId: 'txn-a' });
    // Materials land and the order reaches `assigned` -- the exact row ADR
    // 0107 Context §3 and #859 are about.
    run(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 10);
    expect(runtime.construction.getOrder('order-a')?.state).toBe('assigned');
    const staleRevision = runtime.construction.revisionOf('order-a');

    // The scheduled tick the crew takes the order: `'assigned'` -> `'in-progress'`,
    // which bumps the revision past what the row above read.
    run(runtime, 10);
    expect(runtime.construction.getOrder('order-a')?.state, 'the order moved on, which is the whole premise').toBe('in-progress');
    expect(runtime.construction.revisionOf('order-a')).toBeGreaterThan(staleRevision);

    const balanceBeforeStalePress = runtime.treasury.balanceMinorUnits;
    dispatch(runtime, { type: 'CancelBuildOrder', orderId: 'order-a', expectedRevision: staleRevision });

    expect(runtime.construction.getOrder('order-a')?.state, 'refused: the order is untouched, not cancelled').toBe('in-progress');
    expect(runtime.treasury.balanceMinorUnits, 'refused: nothing moved, not even ruling 20\'s honest 0').toBe(balanceBeforeStalePress);
    expect(runtime.refusals.last?.reason).toBe('cancel-build-order.stale-cancellation');
  });

  it('the control: a press naming the order\'s current revision is not refused and cancels normally', () => {
    const runtime = session();
    dispatch(runtime, { type: 'PlaceBuildOrder', orderId: 'order-b', definitionId: WALL, x: 3, y: 3, transactionId: 'txn-b' });
    run(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 10);
    expect(runtime.construction.getOrder('order-b')?.state).toBe('assigned');
    const currentRevision = runtime.construction.revisionOf('order-b');

    const balanceBefore = runtime.treasury.balanceMinorUnits;
    dispatch(runtime, { type: 'CancelBuildOrder', orderId: 'order-b', expectedRevision: currentRevision });

    expect(runtime.construction.getOrder('order-b')?.state).toBe('cancelled');
    expect(runtime.treasury.balanceMinorUnits - balanceBefore, 'the catalogue value of the material it was holding').toBe(WALL_COST);
    expect(runtime.refusals.last, 'a press that matched is not a refusal').toBeUndefined();
  });

  it('a later ordinary press against the same order is honoured again once the refusal is superseded', () => {
    // Issue #492's shape: a stale refusal must not stand over a press that
    // then succeeds against the order's own honest current revision.
    const runtime = session();
    dispatch(runtime, { type: 'PlaceBuildOrder', orderId: 'order-c', definitionId: WALL, x: 3, y: 3, transactionId: 'txn-c' });
    run(runtime, PROCUREMENT_DELIVERY_DELAY_TICKS + 10);
    const staleRevision = runtime.construction.revisionOf('order-c');
    run(runtime, 10);
    expect(runtime.construction.getOrder('order-c')?.state).toBe('in-progress');

    dispatch(runtime, { type: 'CancelBuildOrder', orderId: 'order-c', expectedRevision: staleRevision });
    expect(runtime.refusals.last?.reason).toBe('cancel-build-order.stale-cancellation');

    const currentRevision = runtime.construction.revisionOf('order-c');
    dispatch(runtime, { type: 'CancelBuildOrder', orderId: 'order-c', expectedRevision: currentRevision });

    expect(runtime.construction.getOrder('order-c')?.state, "'in-progress' destroys the allocation rather than releasing it (ruling 20)").toBe(
      'cancelled',
    );
    // The stale refusal is withdrawn by the later success against the same order.
    expect(runtime.refusals.last).toBeUndefined();
  });

  it("does not disturb the pre-existing idempotency: an unknown order id is still swallowed silently, revision aside", () => {
    const runtime = session();
    dispatch(runtime, { type: 'CancelBuildOrder', orderId: 'order-that-never-was', expectedRevision: 0 });
    expect(runtime.refusals.last, 'unchanged behaviour Decision §4 item 1 declines to touch').toBeUndefined();
  });
});
