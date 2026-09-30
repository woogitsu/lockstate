import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  CONSTRUCTION_MATERIALS_CONTAINER_ID,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';

/**
 * **Build orders are carried out in the order the player placed them**
 * ([ADR 0082](../../docs/adr/0082-what-order-build-orders-are-carried-out-in.md),
 * issue [#722](https://github.com/matmaxalez/lockstate/issues/722)).
 *
 * ## What this file is for that the re-pinned tests are not
 *
 * Four tests elsewhere changed direction when this landed --
 * `construction-crew-capacity`, `construction-build-queue-projection`,
 * `economy-refund-survives-the-clock` and
 * `construction-just-in-time-materials`. Each of them pins one consequence of
 * the new walk inside a file about something else. This file pins the decision
 * itself, and the two properties nothing else asks about:
 *
 * - **that the ordinal survives the save boundary**, through the real
 *   `createSaveEnvelope`/`decodeSaveEnvelope` pair rather than through
 *   `captureSessionSnapshot` alone, because the field is new in a `.strict()`
 *   schema and an undeclared key fails the whole save rather than being
 *   trimmed; and
 * - **that `KernelSnapshot.expectedSequence` keeps the ordinal monotonic
 *   across a reload**, which is decision 2's load-bearing claim. If it did
 *   not, an order placed after a load would collide with one in the save and
 *   the queue would interleave the two sessions.
 *
 * ## Why every id here sorts against the order it is placed in
 *
 * Because the defect was invisible to a fixture whose ids ascend. A real
 * session mints `order-${crypto.randomUUID()}` (`src/main.ts`), so the walk
 * this replaced -- ascending id -- was a uniformly random permutation of the
 * player's own gestures: ADR 0082 measured 21, 17, 14, 17 and 25 inversions
 * out of 45 on a ten-segment perimeter, against the 22.5 a random permutation
 * predicts. `wall-e`, `wall-d`, `wall-c`, `wall-b`, `wall-a` placed in that
 * order is the same disagreement written so that a test can state it.
 *
 * ## The arithmetic, written out rather than read back
 *
 * `wall-brick` needs `workRequired: 50`, `in-progress` advances `+10`, and
 * `ConstructionSystem.schedule` is `intervalTicks: 10, phaseTicks: 0`. So one
 * wall ordered at tick 0 finishes at **70**, and each further wall in the
 * queue costs one scheduled tick to take the crew and five to work: **+60**.
 * Those three numbers are not this file's to choose, which is why they are
 * literals here and are asked of nothing.
 */

const SEED = 11;
const PRISON_ID = 'placement-order-prison';
const WALL = 'wall-brick';

/** A real session with enough brick in the well-known container that materials never gate anything here. */
function session(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  stockBricks(runtime);
  return runtime;
}

/** Session/scenario setup, deliberately not part of any save -- so a restore re-applies it by hand. */
function stockBricks(runtime: SimulationRuntime): void {
  runtime.containers.require(CONSTRUCTION_MATERIALS_CONTAINER_ID).deposit('item.brick', 500);
}

function orderWall(runtime: SimulationRuntime, orderId: string, x: number, y: number): void {
  runtime.kernel.submitCommand(
    `cmd-${orderId}`,
    runtime.kernel.expectedSequence,
    runtime.kernel.tick,
    packCommand({ type: 'PlaceBuildOrder', orderId, definitionId: WALL, x, y }),
  );
}

/** The ids in the order the crew actually finished them, which is the schedule and not an enumeration of it. */
function completionOrder(runtime: SimulationRuntime, orderIds: readonly string[], untilTick: number): readonly string[] {
  const completed: string[] = [];
  while (runtime.kernel.tick < untilTick) {
    runtime.kernel.step();
    for (const orderId of orderIds) {
      if (completed.includes(orderId)) continue;
      if (runtime.construction.getOrder(orderId)?.state === 'completed') completed.push(orderId);
    }
  }
  return completed;
}

/**
 * The bundle a build that never had `placementSequence` would have written:
 * the same save with the key removed from every order.
 *
 * Stripped from a real captured bundle rather than hand-written, so every
 * other field is exactly what this build writes and the only difference is the
 * one under test.
 */
function withoutPlacementOrdinals(bundle: SessionSnapshotBundle): SessionSnapshotBundle {
  const orders = bundle.construction.orders.map((order) => {
    const { placementSequence: _dropped, ...withoutOrdinal } = order;
    return withoutOrdinal;
  });
  // The strip has to actually strip, or these tests would pass by asserting
  // nothing -- a fixture supplying both sides of its own comparison is the
  // form `docs/TESTING.md` names.
  expect(orders.some((order) => 'placementSequence' in order)).toBe(false);
  return { ...bundle, construction: { ...bundle.construction, orders } };
}

/** The full save path a session controller takes, including the storage round trip that destroys object identity. */
function saveAndLoad(
  runtime: SimulationRuntime,
  transform: (bundle: SessionSnapshotBundle) => SessionSnapshotBundle = (bundle) => bundle,
): SimulationRuntime {
  const bundle = transform(captureSessionSnapshot(runtime));

  const envelope = createSaveEnvelope({
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
    gameVersion: 'lockstate-0.0.0',
    prisonId: PRISON_ID,
    revision: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
  // Stated rather than assumed: ADR 0082's save-format argument is that one
  // optional key costs no version bump, and a test that let the version drift
  // would be the first place that argument stopped being true.
  //
  // The number moved 5 -> 6 on ADR 0113, which is a different section entirely
  // (`simulation.regimeSchedules`, required, because a timetable a command can
  // edit cannot be recovered from an absent field). ADR 0082's own claim is
  // unchanged: the placement ordinal is still an optional key that cost no
  // bump, and it is the surrounding assertions rather than this literal that
  // establish it.
  expect(envelope.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
  // V7 relocates travel fields (#1459), likewise independent of this ordinal.
  expect(SAVE_SCHEMA_VERSION).toBe(8);

  // Exactly what a stored save is by the time it is read back: a plain value
  // of unknown provenance, fully re-validated and checksum-verified.
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded).toMatchObject({ ok: true, migrated: false });
  if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

  const restored = restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;
  stockBricks(restored);
  return restored;
}

describe('build orders are carried out in placement order (ADR 0082, #722)', () => {
  it('reaches five walls in the order they were drawn, against ids that sort the other way', () => {
    /*
     * The whole decision in one case. Drawn e, d, c, b, a -- so ascending id
     * is the exact reverse of the gesture -- and the crew finishes them e, d,
     * c, b, a.
     *
     * **Red without the change**: with the walk sorted by id alone this
     * answers `['wall-a', 'wall-b', 'wall-c', 'wall-d', 'wall-e']`, the drag
     * played backwards.
     */
    const runtime = session();
    const drawn = ['wall-e', 'wall-d', 'wall-c', 'wall-b', 'wall-a'] as const;
    drawn.forEach((orderId, index) => {
      orderWall(runtime, orderId, 3, 3 + index);
    });

    expect(completionOrder(runtime, drawn, 500)).toEqual([...drawn]);

    // And the ordinals are the kernel's own counter, consecutive and starting
    // where the session's command sequence started -- not a number the
    // construction system minted for itself.
    expect(drawn.map((orderId) => runtime.construction.getOrder(orderId)?.placementSequence)).toEqual([0, 1, 2, 3, 4]);
  });

  it('keeps the placement order across a save, a JSON round trip and a reload', () => {
    /*
     * `placementSequence` is persisted, so the restored session's queue is the
     * *player's* queue and not a re-derivation of it. This is the half that
     * needs the real save boundary: `buildOrderSchema` is `.strict()`, so an
     * undeclared key does not get trimmed on the way out -- it fails the whole
     * save, and the prison would be unsaveable rather than merely unordered.
     *
     * **Red without the change**: the restored session builds `wall-a` first.
     */
    const runtime = session();
    const drawn = ['wall-e', 'wall-d', 'wall-c', 'wall-b', 'wall-a'] as const;
    drawn.forEach((orderId, index) => {
      orderWall(runtime, orderId, 3, 3 + index);
    });
    // One step, so the orders exist and are queued but the crew has finished
    // nothing: the save is of a standing queue, which is the case a player
    // reaches by closing the tab on a drag.
    runtime.kernel.step();
    expect(runtime.construction.allOrders().every((order) => order.state !== 'completed')).toBe(true);

    const restored = saveAndLoad(runtime);
    expect(restored.construction.allOrders().map((order) => order.id)).toEqual([...drawn]);
    expect(restored.construction.allOrders().map((order) => order.placementSequence)).toEqual([0, 1, 2, 3, 4]);
    expect(completionOrder(restored, drawn, 500)).toEqual([...drawn]);
  });

  it('puts an order placed after a reload behind every order the save carried', () => {
    /*
     * Decision 2's load-bearing claim, and the reason no new counter was
     * introduced: `KernelSnapshot.expectedSequence` is persisted and
     * `Kernel.restoreState` restores it, so the ordinal is monotonic **across**
     * a restore. Without that the reloaded session would start counting from
     * zero again and the wall drawn after the load would collide with -- and,
     * with the id tie-break, could jump ahead of -- the ones in the save.
     *
     * `wall-a` is drawn last on purpose: it holds the *lowest* id of the six,
     * so an implementation whose restored ordinals collided at 0 would build
     * it first.
     *
     * **Red without the change**: the queue finishes `wall-a` first, because
     * without the ordinal every one of the six sorts by id.
     */
    const runtime = session();
    const beforeSave = ['wall-e', 'wall-d', 'wall-c', 'wall-b'] as const;
    beforeSave.forEach((orderId, index) => {
      orderWall(runtime, orderId, 3, 3 + index);
    });
    runtime.kernel.step();

    const restored = saveAndLoad(runtime);
    const highestRestored = Math.max(
      ...restored.construction.allOrders().map((order) => order.placementSequence ?? -1),
    );
    expect(restored.kernel.expectedSequence).toBeGreaterThan(highestRestored);

    orderWall(restored, 'wall-a', 3, 8);
    restored.kernel.step();
    expect(restored.construction.getOrder('wall-a')?.placementSequence).toBeGreaterThan(highestRestored);

    expect(completionOrder(restored, [...beforeSave, 'wall-a'], 600)).toEqual([...beforeSave, 'wall-a']);
  });

  it('loads a save written before the ordinal existed and behaves exactly as that build did', () => {
    /*
     * `docs/PERSISTENCE.md`, *"Adding an optional field without a version
     * bump"*: absent must mean what the older build already did. For this
     * field that is the ascending-id walk, whole -- so the assertion below is
     * the one the suite made before ADR 0082, made against a save that carries
     * no ordinals.
     *
     * The save is produced by stripping the key from a real captured bundle
     * rather than by hand-writing a fixture, so every other field is exactly
     * what this build writes and the *only* difference is the one under test.
     * It still goes through `createSaveEnvelope` and `decodeSaveEnvelope`,
     * because "an older save still decodes" is half of what is being claimed.
     *
     * **This one is green without the change**, and that is its point: it is
     * the guard that the change did not move behaviour it promised not to.
     */
    const runtime = session();
    const drawn = ['wall-e', 'wall-d', 'wall-c', 'wall-b', 'wall-a'] as const;
    drawn.forEach((orderId, index) => {
      orderWall(runtime, orderId, 3, 3 + index);
    });
    runtime.kernel.step();

    const restored = saveAndLoad(runtime, withoutPlacementOrdinals);

    expect(restored.construction.allOrders().every((order) => order.placementSequence === undefined)).toBe(true);
    // Ascending id, which is the reverse of the gesture -- the behaviour #722
    // is about, preserved for a save that predates the fix rather than
    // retrofitted onto one.
    expect(restored.construction.allOrders().map((order) => order.id)).toEqual([
      'wall-a',
      'wall-b',
      'wall-c',
      'wall-d',
      'wall-e',
    ]);
    expect(completionOrder(restored, drawn, 500)).toEqual(['wall-a', 'wall-b', 'wall-c', 'wall-d', 'wall-e']);
  });

  it('puts a wall drawn after loading a pre-ordinal save behind the work already queued', () => {
    /*
     * The mixed order book, which is what every existing player's next session
     * actually is: five orders with no ordinal and one with `expectedSequence`.
     * Absence sorts ahead of every stamped order, so the old work is finished
     * first -- in the ascending id it would have been finished in -- and the
     * new wall waits behind it. That is what "absent means what the older
     * build did" buys: nothing already queued is reordered by the upgrade.
     *
     * `wall-0` sorts before all five old ids, so an implementation that
     * ignored the ordinal and sorted on id alone would build it first.
     */
    const runtime = session();
    ['wall-e', 'wall-d', 'wall-c', 'wall-b', 'wall-a'].forEach((orderId, index) => {
      orderWall(runtime, orderId, 3, 3 + index);
    });
    runtime.kernel.step();

    const restored = saveAndLoad(runtime, withoutPlacementOrdinals);

    orderWall(restored, 'wall-0', 3, 9);
    restored.kernel.step();
    expect(restored.construction.getOrder('wall-0')?.placementSequence).toBeTypeOf('number');

    expect(completionOrder(restored, ['wall-a', 'wall-b', 'wall-c', 'wall-d', 'wall-e', 'wall-0'], 700)).toEqual([
      'wall-a',
      'wall-b',
      'wall-c',
      'wall-d',
      'wall-e',
      'wall-0',
    ]);
  });
});
