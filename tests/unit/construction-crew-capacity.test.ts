import { describe, expect, it } from 'vitest';
import { ConstructionSystem, type ConstructionSnapshot } from '../../src/simulation/construction/system';
import { Kernel } from '../../src/simulation/kernel/kernel';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime } from '../../src/simulation/runtime/restore-session';
import { chunkCoordinate, tileCoordinate } from '../../src/simulation/world/coordinates';
import { SparseWorld } from '../../src/simulation/world/sparse-world';

/**
 * The build crew is a crew of one, and the queue behind it is single-file.
 *
 * Until this, money was the only thing standing between a player and a
 * finished prison: every order that reached `assigned` started immediately and
 * every `in-progress` order advanced on every scheduled tick, so ordering a
 * whole wing cost exactly what ordering one wall cost. ADR 0028 measured the
 * same thing from the object side -- "a hundred objects take the same
 * wall-clock time as one".
 *
 * **Every tick below is written as a literal, and none of it is read back out
 * of the thing under test.** The arithmetic is fixed by three numbers that are
 * not this file's to choose: `wall-brick` needs `workRequired: 50`,
 * `in-progress` advances `+10`, and `ConstructionSystem.schedule` is
 * `intervalTicks: 10, phaseTicks: 0`. So one wall ordered at tick 0 is
 * approved at 0, draws materials at 10, takes the crew at 20, works at 30, 40,
 * 50, 60 and finishes at **70**; each further wall in the queue costs one tick
 * to take the crew and five to work, so **+60** each. A fixture that asked the
 * scheduler for those numbers and then asserted them would assert nothing.
 */

const SEED = 11;

/** The tick a `wall-brick` ordered at tick 0 finishes on, with nothing ahead of it. */
const FIRST_WALL_COMPLETES_AT = 70;
/** What each further `wall-brick` in the queue costs: one scheduled tick to take the crew, five to work. */
const QUEUED_WALL_COSTS = 60;

function tile(x: number, y: number) {
  return { x: tileCoordinate(x), y: tileCoordinate(y) };
}

/** A real session with enough brick in the well-known container that materials never gate anything here. */
function session(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  stockBricks(runtime);
  return runtime;
}

/**
 * Session/scenario setup, which is deliberately not part of any save -- the
 * same convention `snapshot-restore-fidelity.test.ts` documents, and the
 * reason the round-trip test below re-applies it by hand.
 */
function stockBricks(runtime: SimulationRuntime): void {
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.brick', 500);
}

function orderWall(runtime: SimulationRuntime, orderId: string, x: number, y: number): void {
  runtime.kernel.submitCommand(
    `cmd-${orderId}`,
    runtime.kernel.expectedSequence,
    0,
    packCommand({ type: 'PlaceBuildOrder', orderId, definitionId: 'wall-brick', x, y }),
  );
}

/**
 * Runs to `untilTick` and answers the tick each order *completed on* -- the
 * tick of the scheduled update that finished it, which is one less than the
 * kernel's tick once that step returns (`Kernel.step` advances the counter
 * last).
 */
function completionTicks(
  runtime: SimulationRuntime,
  orderIds: readonly string[],
  untilTick: number,
): ReadonlyMap<string, number> {
  const completedAt = new Map<string, number>();
  while (runtime.kernel.tick < untilTick) {
    const tick = runtime.kernel.tick;
    runtime.kernel.step();
    for (const orderId of orderIds) {
      if (completedAt.has(orderId)) continue;
      if (runtime.construction.getOrder(orderId)?.state === 'completed') completedAt.set(orderId, tick);
    }
  }
  return completedAt;
}

describe('the build crew builds one order at a time', () => {
  it('finishes a single order exactly when it always did -- the crew rule costs a lone wall nothing', () => {
    // Stated first so that everything below is a claim about *queueing* and
    // not about construction having become slower across the board.
    const runtime = session();
    orderWall(runtime, 'wall-1', 3, 3);

    expect(completionTicks(runtime, ['wall-1'], 200)).toEqual(new Map([['wall-1', 70]]));
  });

  it('finishes two queued orders one after the other, not together', () => {
    const runtime = session();
    orderWall(runtime, 'wall-1', 3, 3);
    orderWall(runtime, 'wall-2', 3, 4);

    // 70 and 130, written out: the second wall waits for the first and then
    // costs its own 60. Before the crew rule both of these were 70.
    expect(completionTicks(runtime, ['wall-1', 'wall-2'], 300)).toEqual(
      new Map([
        ['wall-1', 70],
        ['wall-2', 130],
      ]),
    );
    expect(FIRST_WALL_COMPLETES_AT + QUEUED_WALL_COSTS).toBe(130);
  });

  it('leaves the waiting order at zero progress for as long as the crew is on the first one', () => {
    /*
     * The failure this guards is a queue that *looks* sequential because the
     * two orders happen to be observed at their ends. Progress is sampled
     * while the first wall is halfway up: a second order advancing in parallel
     * would be visible here even if both still reported the same completion
     * tick.
     */
    const runtime = session();
    orderWall(runtime, 'wall-1', 3, 3);
    orderWall(runtime, 'wall-2', 3, 4);

    const stepTo = (tick: number): void => {
      while (runtime.kernel.tick < tick) runtime.kernel.step();
    };
    const first = () => runtime.construction.getOrder('wall-1');
    const second = () => runtime.construction.getOrder('wall-2');

    // After the update at tick 20 the crew is taken, and it is taken by the
    // lower id. The other order holds the materials it already drew and waits
    // in `assigned` -- it is not pushed back to `materials-pending`, so the
    // queue cannot cost anybody their bricks.
    stepTo(21);
    expect(first()?.state).toBe('in-progress');
    expect(second()?.state).toBe('assigned');
    expect(second()?.materialsAllocated).toEqual([{ itemId: 'item.brick', quantity: 2 }]);

    // Halfway: 30 of the first wall's 50 done, none of the second's.
    stepTo(51);
    expect(first()?.progress).toBe(30);
    expect(second()?.progress).toBe(0);

    // The tick the first wall finishes on. The second still has not started:
    // occupancy is read once at the top of the pass, so the handover costs one
    // scheduled tick rather than depending on which id sorts first.
    stepTo(71);
    expect(first()?.state).toBe('completed');
    expect(second()?.state).toBe('assigned');
    expect(second()?.progress).toBe(0);

    // ...and it starts on the very next scheduled tick, so the crew is never
    // idle for longer than that handover.
    stepTo(81);
    expect(second()?.state).toBe('in-progress');
    expect(second()?.assignedWorkerId).toBe('mock-worker-1');
  });

  it('picks the next order by placement order, against ids that sort the other way (#722)', () => {
    /*
     * **This test asserted the opposite until 2026-08-31**, under the name
     * *"picks the next order by ascending id, not by the order the player
     * queued them in"*, and it was right about what the code did: the two ids
     * here are chosen so that ascending id and placement order disagree, and
     * the wall submitted *second* was the one that got built first.
     *
     * ADR 0082 decisions 1 and 2 changed that, and #722 is the defect it
     * closes: with `order-${crypto.randomUUID()}` ids the build schedule was a
     * uniformly random permutation of the player's own gestures. So `wall-z`,
     * drawn first, is now built first even though `wall-a` sorts before it.
     *
     * **What the old test was defending is untouched and is asserted by the
     * round trip below.** The canonical sequence still makes a restored session
     * agree with the session it came from: insertion order is a property of how
     * a session happened to be built and a restore re-inserts from a snapshot
     * rather than replaying that history (`docs/DETERMINISM.md`, "Canonical
     * iteration order"). Placement order is not insertion order -- it is
     * `QueuedCommand.sequence`, persisted on the order itself.
     *
     * The ids still disagree with the ordinal on purpose, because an
     * implementation that quietly fell back to sorting by id would pass a test
     * whose ids ascend.
     */
    const runtime = session();
    orderWall(runtime, 'wall-z', 3, 3);
    orderWall(runtime, 'wall-a', 3, 4);

    expect(completionTicks(runtime, ['wall-a', 'wall-z'], 300)).toEqual(
      new Map([
        ['wall-z', 70],
        ['wall-a', 130],
      ]),
    );
  });

  it('stamps the placement ordinal from the kernel and nowhere else', () => {
    /*
     * The ordinal is `QueuedCommand.sequence` (ADR 0082 decision 2), so it is
     * the kernel's own counter and not a number the construction system mints.
     * Asserted directly, because every other test in this file reads the
     * ordinal only through the schedule it produces -- and a stamp taken from
     * some other monotonic source would satisfy all of those.
     */
    const runtime = session();
    const first = runtime.kernel.expectedSequence;
    orderWall(runtime, 'wall-z', 3, 3);
    orderWall(runtime, 'wall-a', 3, 4);
    runtime.kernel.step();

    expect(runtime.construction.getOrder('wall-z')?.placementSequence).toBe(first);
    expect(runtime.construction.getOrder('wall-a')?.placementSequence).toBe(first + 1);
  });

  it('keeps a five-wall gesture in single file, so the whole queue is the sum of its parts', () => {
    // The player's real gesture: a run of wall segments in one drag. 70, then
    // +60 each -- 310 for five, where every one of them used to finish at 70.
    const runtime = session();
    for (let index = 0; index < 5; index += 1) orderWall(runtime, `wall-${index}`, 3, 3 + index);

    expect(completionTicks(runtime, ['wall-0', 'wall-1', 'wall-2', 'wall-3', 'wall-4'], 500)).toEqual(
      new Map([
        ['wall-0', 70],
        ['wall-1', 130],
        ['wall-2', 190],
        ['wall-3', 250],
        ['wall-4', 310],
      ]),
    );
  });
});

describe('the queue survives a save', () => {
  it('restores mid-build to the same schedule the uninterrupted run keeps', () => {
    /*
     * The rule is derived from order state -- which order is `in-progress`,
     * which are `assigned` -- and every one of those fields is already in the
     * save (`save-schema.ts`, `buildOrderSchema`). So no new field is needed
     * for the queue to survive a reload, and this is the test that says so:
     * the restored session finishes both walls on the same two ticks as the
     * session that was never interrupted.
     */
    const runtime = session();
    orderWall(runtime, 'wall-1', 3, 3);
    orderWall(runtime, 'wall-2', 3, 4);

    // Saved with the first wall half-built and the second still waiting.
    while (runtime.kernel.tick < 51) runtime.kernel.step();
    const bundle = captureSessionSnapshot(runtime);
    expect(bundle.construction.orders.map((order) => [order.id, order.state, order.progress])).toEqual([
      ['wall-1', 'in-progress', 30],
      ['wall-2', 'assigned', 0],
    ]);

    const { runtime: restored } = restoreSimulationRuntime(bundle, SEED);
    stockBricks(restored);
    expect(restored.kernel.tick).toBe(51);

    // The same two literals as the uninterrupted run above.
    expect(completionTicks(restored, ['wall-1', 'wall-2'], 300)).toEqual(
      new Map([
        ['wall-1', 70],
        ['wall-2', 130],
      ]),
    );
  });

  it('drains every order a pre-crew save left in progress, rather than pausing all but one', () => {
    /*
     * A v0.0.76 save can hold any number of `in-progress` orders, because
     * before the crew rule every assigned order started at once. This is the
     * decision that was taken about them, pinned: they all finish. The
     * alternative -- deterministically pausing all but the first -- would meet
     * a returning player with five walls stopped mid-course for a reason
     * nothing in the game explains.
     *
     * The snapshot is written out by hand rather than produced by a run,
     * because a run of *this* build can no longer produce it: two orders in
     * progress at once is exactly the state the new rule prevents. That is
     * what makes it a fixture for the old save format.
     */
    const world = new SparseWorld(32);
    const chunk = { x: chunkCoordinate(0), y: chunkCoordinate(0) };
    world.ensureMetadata(chunk);
    world.load(chunk);
    world.setOwned(chunk, true);

    const construction = new ConstructionSystem(world);
    const kernel = new Kernel();
    kernel.registerSystem(construction);

    const legacySave: ConstructionSnapshot = {
      orders: [
        { id: 'wall-a', definitionId: 'wall-brick', location: tile(3, 3), state: 'in-progress', progress: 20, materialsAllocated: [{ itemId: 'item.brick', quantity: 2 }], assignedWorkerId: 'mock-worker-1' },
        { id: 'wall-b', definitionId: 'wall-brick', location: tile(3, 4), state: 'in-progress', progress: 10, materialsAllocated: [{ itemId: 'item.brick', quantity: 2 }], assignedWorkerId: 'mock-worker-1' },
        { id: 'wall-c', definitionId: 'wall-brick', location: tile(3, 5), state: 'assigned', progress: 0, materialsAllocated: [{ itemId: 'item.brick', quantity: 2 }] },
      ],
      undoStack: [],
      redoStack: [],
    };
    construction.restore(legacySave);

    const completedAt = new Map<string, number>();
    while (kernel.tick < 200) {
      const tick = kernel.tick;
      kernel.step();
      for (const orderId of ['wall-a', 'wall-b', 'wall-c']) {
        if (completedAt.has(orderId)) continue;
        if (construction.getOrder(orderId)?.state === 'completed') completedAt.set(orderId, tick);
      }
    }

    // Both grandfathered orders keep advancing together and finish on the
    // ticks their own remaining work implies: 30 left at +10 per scheduled
    // tick for the first, 40 for the second. Neither was paused, and neither
    // lost its progress.
    //
    // The third order is the price, and it is the intended one: it starts only
    // once the last of the old work is done -- the update at tick 40, the
    // first pass that finds no order in progress -- and then costs its own
    // full 50 work. So the save drains, and the queue behind it is single-file
    // from that moment.
    expect(completedAt).toEqual(
      new Map([
        ['wall-a', 20],
        ['wall-b', 30],
        ['wall-c', 90],
      ]),
    );
  });
});
