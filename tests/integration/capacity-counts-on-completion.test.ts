import { describe, expect, it } from 'vitest';
import { projectBuildQueue } from '../../src/simulation/presentation/construction-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Issue #1031, and the owner's ruling of 2026-09-06 on it: "Świat ma rację --
 * licz po ukończeniu" ("The world is right -- count on completion").**
 *
 * An ordered-but-unbuilt object must not raise a capacity. Nothing in this
 * repository asserted that: the issue's own closing section names the gap
 * exactly -- *"there is no assertion that pairs a projection's capacity against
 * the construction state of the objects it counts"* -- and says the assertion
 * could not be written before the ruling, because it would first have had to
 * decide which of the two readouts was right. The ruling decides it, so this
 * file is that assertion.
 *
 * ## What the ruling asks for, and what it found when it got here
 *
 * The ruling was made from a play-test that measured `roomCapacity` and
 * `accommodationCapacity` going 1 -> 2 -> 3 -> 4 on four presses of *place
 * bed* while the world drew the fourth bed as a construction ghost
 * (`docs/research/2026-09-06-the-first-furnished-cell.md` §5). **The kernel
 * already counts on completion, and this file is what establishes that** --
 * every tick of a real session is sampled below, and no capacity ever leads the
 * order that supplies it by a single tick.
 *
 * The chain is short and every link is a `file:line` a reader can open:
 *
 * 1. `ObjectPlacementService.place` (`src/simulation/objects/object-placement-service.ts:497`)
 *    submits a `BuildOrder` and writes **no** `PlacedObject`.
 * 2. The only call that writes one is `onOrderCompleted`
 *    (`:798`), whose only caller is `ConstructionSystem.finalizeConstruction`
 *    (`src/simulation/construction/system.ts:1917`), reached from
 *    `this.setState(order, 'completed')` on the adjacent line (`:1746-1747`) --
 *    that call read `order.state = 'completed'` when this chain was written.
 * 3. `RoomCapacityResolver.deriveFor` (`src/simulation/objects/room-capacity.ts:314`)
 *    derives every capacity from `PlacedObjectRegistry.inRect`, and
 *    `deriveRoomCapacity` (`:172`) reads nothing else -- no order book, no
 *    construction phase.
 *
 * So the answer to the issue's "where does an ordered object enter a room
 * instance's capacity" is **nowhere, and that is already the ruling's answer**.
 * What the play-test read as the count leading the world is the *world* lagging
 * the count: a completed order reaches the renderer only on the 30 s
 * consistency poll, measured at 22.0-28.0 s across five runs in
 * `tests/integration/completed-edge-structures-arrive-with-their-edge.test.ts`'s
 * commit. Its own four samples were taken at ticks 6,744, 7,193, 7,642 and
 * 8,091 -- **449 ticks apart** -- and a bed measured here takes **151** from the
 * press to `completed`, so every one of those readings was taken after the bed
 * it reported had actually been built. The count was honest and the picture was
 * stale, which is the same disagreement #1027 records with the sign the other
 * way round.
 *
 * ## Why the sampling is per tick and not at the ends
 *
 * The play-test's own weakest claim is that it "photographed the two ends and
 * did not poll the transition". A gate that sampled only before and after would
 * repeat that mistake at test speed. Every tick of the window is compared here
 * against the construction states standing *at that tick*, so a capacity that
 * moved even one tick early names the tick it moved on.
 */

const SEED = 0x0b1ec7;
const CELL = 'room.cell';

/**
 * `room.cell`'s authored resident ceiling (issue #961, the owner's ruling of
 * 2026-09-17): `maxResidents: 2` in `src/content/room-catalog.ts`.
 *
 * Written out as a literal and **not** read from the catalogue, for
 * `docs/TESTING.md`'s reason: a fixture that asks the content for the number it
 * then checks against the content holds for any content. The number is checked
 * against the catalogue in `tests/unit/content-room-catalog-ceilings.test.ts`,
 * which is where a change to it is supposed to be noticed.
 *
 * It is why the expectations below cap at two while the *use* ceiling does not:
 * the ruling bounds who may **live** in the room, and a third and fourth bed
 * still stand, still cost their planks and still raise
 * `concurrentUseCapacity`.
 */
const CELL_MAX_RESIDENTS = 2;

/** Four bed anchors wide, and tall enough for the 1x2 footprint plus `room.cell`'s authored minimum of 3. */
const CELL_RECT = { x: 4, y: 6, width: 4, height: 3 } as const;

/** One per column of the cell's top row, so all four 1x2 footprints lie wholly inside it and none overlaps. */
const BED_TILES = [
  { x: 4, y: 6 },
  { x: 5, y: 6 },
  { x: 6, y: 6 },
  { x: 7, y: 6 },
] as const;

const BED_ORDER_IDS = ['bed-1', 'bed-2', 'bed-3', 'bed-4'] as const;

const cellInstanceId = `${CELL}:${CELL_RECT.x}:${CELL_RECT.y}`;

/** The window sampled: comfortably past every completion measured below, and not a boundary. */
const SAMPLE_UNTIL_TICK = 600;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * The play-test's act 4, through the real kernel: one zoned cell and four beds
 * ordered into it, one press each.
 *
 * **No `PurchaseMaterials`.** A player does not buy the plank; the press does
 * (`src/simulation/runtime/session-commands.ts:809`, the just-in-time purchase
 * #627 added), and going the long way round here would make the fixture's
 * timings something other than the ones a player gets.
 */
function prisonWithFourBedsOrdered(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_RECT }));
  for (const [index, tile] of BED_TILES.entries()) {
    submit(
      runtime,
      `place-${BED_ORDER_IDS[index]!}`,
      packCommand({ type: 'PlaceObject', orderId: BED_ORDER_IDS[index]!, definitionId: 'bed-wooden', ...tile }),
    );
  }
  return runtime;
}

/** How many of the four bed orders have reached `completed` at this instant. */
function completedBeds(runtime: SimulationRuntime): number {
  return BED_ORDER_IDS.reduce(
    (count, orderId) => (runtime.construction.getOrder(orderId)?.state === 'completed' ? count + 1 : count),
    0,
  );
}

/** The bed orders still pending -- the set the Build panel's queue block draws, in the projection's own order. */
function pendingBedTiles(runtime: SimulationRuntime): readonly string[] {
  return projectBuildQueue(runtime.construction, { limit: 100 }, runtime.justInTimeMaterials)
    .orders.rows.filter((row) => row.definitionId === 'bed-wooden')
    .map((row) => `${row.tile.x},${row.tile.y}`);
}

describe('a capacity counts an object on completion and never before it', () => {
  it('never moves a capacity ahead of the order that supplies it, at any tick', () => {
    const runtime = prisonWithFourBedsOrdered();

    expect(runtime.refusals.count, 'none of the five commands may be refused').toBe(0);
    expect(completedBeds(runtime), 'four orders in flight and nothing built').toBe(0);

    /** The tick each capacity first read `n`, so a failure can say *when* as well as *what*. */
    const roomCapacityFirstReached = new Map<number, number>();
    const completionFirstReached = new Map<number, number>();

    while (runtime.kernel.tick < SAMPLE_UNTIL_TICK) {
      runtime.kernel.step();
      const tick = runtime.kernel.tick;
      const built = completedBeds(runtime);
      if (!completionFirstReached.has(built)) completionFirstReached.set(built, tick);

      const counts = projectStatusCounts(runtime, tick);
      const instance = runtime.prisoners.roomInstances.getById(cellInstanceId);
      // Thrown rather than asserted: an unregistered cell would make every
      // comparison below vacuous, and a gate that passes because its subject
      // vanished is the failure this file exists to refuse.
      if (instance === undefined) throw new Error(`The cell ${cellInstanceId} was not registered at tick ${tick}.`);
      if (!roomCapacityFirstReached.has(counts.roomCapacity)) roomCapacityFirstReached.set(counts.roomCapacity, tick);

      // The four numbers #1031 names, all against the same construction state.
      // `roomCapacity` and `accommodationCapacity` are the two the play-test
      // measured; `concurrentUseCapacity` and the per-capability total are the
      // two it named as unchecked.
      const housed = Math.min(built, CELL_MAX_RESIDENTS);
      expect(counts.roomCapacity, `roomCapacity at tick ${tick} in ${cellInstanceId}`).toBe(housed);
      expect(counts.accommodationCapacity, `accommodationCapacity at tick ${tick} in ${cellInstanceId}`).toBe(housed);
      expect(instance.residentCapacity, `residentCapacity at tick ${tick} in ${cellInstanceId}`).toBe(housed);
      expect(instance.concurrentUseCapacity, `concurrentUseCapacity at tick ${tick} in ${cellInstanceId}`).toBe(built);
      // Through `concurrentUseCapacityFor` rather than off the row's optional
      // breakdown, because that accessor is the ceiling `findAvailableForUse`
      // and `claimUse` gate against (#326) -- so this pins the number that
      // decides who may use the room, not a field beside it.
      expect(
        runtime.prisoners.roomInstances.concurrentUseCapacityFor(instance, 'sleep-surface'),
        `the 'sleep-surface' ceiling at tick ${tick} in ${cellInstanceId}`,
      ).toBe(built);
      expect(
        instance.objectCapabilities.includes('sleep-surface'),
        `the 'sleep-surface' capability at tick ${tick} in ${cellInstanceId}`,
      ).toBe(built > 0);
    }

    // **The window this gate needs in order to be a gate.** If every order
    // completed on the tick it was placed there would be nothing above for a
    // premature capacity to be premature *by*, and the loop would pass against
    // a kernel that counted at order time. Measured here: the four presses land
    // by tick 6, the first bed completes at 151 -- 100 ticks of delivery delay
    // (`PROCUREMENT_DELIVERY_DELAY_TICKS`) and then work on a ten-tick schedule
    // -- and the rest follow 40 ticks apart, because the crew builds one order
    // at a time (#348). So there are **145 consecutive ticks in which four beds
    // are ordered and no capacity counts any of them**, and 265 in which at
    // least one is outstanding.
    expect(completionFirstReached.get(1)).toBe(151);
    expect(completionFirstReached.get(4)).toBe(271);
    expect(roomCapacityFirstReached.get(1)).toBe(151);
    // **Two rather than four since issue #961**, and the tick is the second
    // bed's completion rather than the fourth's: the ceiling stops the room
    // counting residents there, and the third and fourth orders complete into a
    // capacity that does not move. The `.get(4)` this line read is now
    // `undefined` for `roomCapacity` and unchanged for the completions above,
    // which is the pair that says the ceiling bounds residency and not building.
    expect(roomCapacityFirstReached.get(2)).toBe(191);
    expect(roomCapacityFirstReached.get(4)).toBeUndefined();
    expect(runtime.prisoners.roomInstances.getById(cellInstanceId)).toMatchObject({
      residentCapacity: CELL_MAX_RESIDENTS,
      concurrentUseCapacity: 4,
      objectCapabilities: ['sleep-surface'],
    });
  });

  it('names every ordered bed in the queue readout for as long as no capacity counts it', () => {
    // The ruling's second half: *"whatever a player has ordered must be visible
    // somewhere"*. Under the first half the capacity says nothing about an
    // ordered bed, so the queue readout is the only place one can appear -- and
    // "somewhere" has to be pinned or it is a sentence with no test behind it.
    //
    // `projectBuildQueue` is what the Build panel's queue block draws from
    // (`src/ui/simulation-build-queue.ts:202`), and the block is drawn while
    // `queue.total > 0` (`src/ui/hud/build-panel.ts:2656`). So the invariant is
    // that the two sets partition the four presses at *every* tick: a bed is
    // either standing in the room's capacity or named in the queue, never
    // neither.
    const runtime = prisonWithFourBedsOrdered();
    const ordered = BED_TILES.map((tile) => `${tile.x},${tile.y}`);

    while (runtime.kernel.tick < SAMPLE_UNTIL_TICK) {
      runtime.kernel.step();
      const tick = runtime.kernel.tick;
      const built = completedBeds(runtime);
      const queued = pendingBedTiles(runtime);

      expect(queued.length + built, `every ordered bed is either built or queued, at tick ${tick}`).toBe(ordered.length);
      // Not merely the count: the *tiles* the player pressed, so a queue that
      // named some other order the right number of times would not pass.
      expect(
        [...queued].sort(),
        `the queue names the tiles that are not yet capacity, at tick ${tick}`,
      ).toStrictEqual(ordered.filter((_, index) => runtime.construction.getOrder(BED_ORDER_IDS[index]!)?.state !== 'completed').sort());
    }

    expect(pendingBedTiles(runtime), 'and it says nothing once every press is standing in the room').toStrictEqual([]);
  });
});
