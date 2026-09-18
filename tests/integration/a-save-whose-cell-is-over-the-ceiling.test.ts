import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { captureSessionSnapshot, restoreSimulationRuntime, type SessionSnapshotBundle } from '../../src/simulation/runtime/restore-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What happens to a prison that was already built the old way** -- the
 * blast-radius half of issue #961's ruling of 2026-09-17.
 *
 * The ruling was priced as content-only: a number in the catalogue, no
 * save-format change. That premise is checkable and this file checks it, on the
 * one case where it could fail -- a save whose cell holds **more residents than
 * the ceiling now allows**, which is every prison the finding was measured in
 * (twelve prisoners in the starter cell, `rooms` still 1).
 *
 * ## How the save is made, and why it is made this way
 *
 * A build carrying the ceiling cannot *produce* an over-ceiling cell, so one is
 * constructed the way a hand-edited or older save arrives: a live session with
 * two cells and four housed prisoners is snapshotted, and the bundle's own
 * `roomInstanceOccupancy` and `accommodationInstanceId` are rewritten to put
 * all four in the four-bed cell. That is exactly the payload a pre-ruling
 * session of that prison would have written -- `roomInstanceSchemaV5` carries
 * identity, anchor and rectangle and **no capacity** (ADR 0028 decision 6), so
 * nothing else in the file would differ.
 *
 * ## What it must do, and the ADR that already decided it
 *
 * [ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A settled this for the bed-removal case, and a ceiling arriving
 * under a standing resident is the same state reached by another route:
 * **nobody is evicted**, the residents over the capacity are the excess, and
 * the state declines to pay for them.
 *
 * **Where the two routes come apart, measured below rather than assumed.** The
 * relocation half of decision A is triggered by the *removal event* and by
 * nothing else, so a restore does not fire it: the excess residents stay put,
 * unpaid, until the player touches that room. This file pins both -- the
 * standing cost, and that a single `RemoveObject` on a surplus bed clears it
 * and moves them next door.
 */

const SEED = 0x0b1ec7;
/** Four bed anchors wide and `room.cell`'s authored minimum of 3 tall. Four beds, a ceiling of two. */
const CELL_A = { x: 4, y: 6, width: 4, height: 3 } as const;
/** Two beds, and somewhere for the excess to be relocated into. */
const CELL_B = { x: 4, y: 12, width: 4, height: 3 } as const;
const CELL_A_ID = 'room.cell:4:6';
const CELL_B_ID = 'room.cell:4:12';

const ARRIVAL = { x: 16, y: 16 } as const;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/** Two zoned cells, six beds between them (four and two), four prisoners admitted and housed two and two. */
function livePrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  for (const [index, rect] of [CELL_A, CELL_B].entries()) {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
  }
  for (let bed = 0; bed < 4; bed += 1) {
    submit(runtime, `a-bed-${String(bed)}`, packCommand({ type: 'PlaceObject', orderId: `a${String(bed)}`, definitionId: 'bed-wooden', x: CELL_A.x + bed, y: CELL_A.y }));
  }
  for (let bed = 0; bed < 2; bed += 1) {
    submit(runtime, `b-bed-${String(bed)}`, packCommand({ type: 'PlaceObject', orderId: `b${String(bed)}`, definitionId: 'bed-wooden', x: CELL_B.x + bed, y: CELL_B.y }));
  }
  for (let prisoner = 0; prisoner < 4; prisoner += 1) {
    submit(runtime, `admit-${String(prisoner)}`, packCommand({ type: 'AdmitPrisoner', sentenceLengthTicks: 1_000_000, priorIncidents: 0, ...ARRIVAL }));
  }
  while (runtime.kernel.tick < 3_000) runtime.kernel.step();
  return runtime;
}

describe('a save whose cell holds more residents than the ceiling now allows (#961)', () => {
  it('loads, keeps everybody, pays for the ceiling and relocates the excess', () => {
    const live = livePrison();
    expect(live.prisoners.roomInstances.occupancyOf(CELL_A_ID), 'the live session houses two and two').toBe(2);
    expect(live.prisoners.roomInstances.occupancyOf(CELL_B_ID)).toBe(2);

    const bundle = captureSessionSnapshot(live);
    const captured = bundle.simulation;
    // Thrown rather than asserted: a bundle with no session systems would make
    // every comparison below vacuous.
    if (captured === undefined) throw new Error('the snapshot carried no session systems');
    const everybody = [0, 1, 2, 3];
    const overCeiling: SessionSnapshotBundle = {
      ...bundle,
      simulation: {
        ...captured,
        prisoners: {
          ...captured.prisoners,
          // The payload a pre-ruling session of this prison would have written:
          // four residents in the four-bed cell, the two-bed cell empty.
          roomInstanceOccupancy: [[CELL_A_ID, everybody] as const, [CELL_B_ID, [] as readonly number[]] as const],
          coldState: {
            ...captured.prisoners.coldState,
            accommodationInstanceId: everybody.map((index) => [index, CELL_A_ID] as const),
          },
        },
      },
    };

    const restored = restoreSimulationRuntime(overCeiling).runtime;
    const rooms = restored.prisoners.roomInstances;

    // **Nobody is evicted by the load.** All four are still residents of the
    // cell, and the room still knows it is over its capacity rather than
    // silently dropping two.
    expect(rooms.occupancyOf(CELL_A_ID), 'the save is honoured: four residents').toBe(4);
    expect(rooms.getById(CELL_A_ID)?.residentCapacity, 'four beds, capped at the authored ceiling').toBe(2);
    // The state pays for the places that exist and not for the residents that
    // do not fit -- ADR 0076 decision A(ii), reached here by a ceiling instead
    // of by a removed bed.
    expect(rooms.residentIdsWithExistingPlace(), 'two of the four hold a place that exists').toHaveLength(2);

    /*
     * **And the remedy does not arrive on its own, which is the finding this
     * case exists to record rather than a defect it reports.**
     * `relocateExcessResidentsOf` has exactly one production caller --
     * `ObjectPlacementService.relocateResidentsLeftWithoutAPlace`
     * (`src/simulation/objects/object-placement-service.ts:873`), reached from
     * a removal and from an undo -- because ADR 0076 was written about a bed
     * being *taken away*. A ceiling arriving under a standing resident reaches
     * the same state by a route that fires no such event, so the two excess
     * residents sit where they are, unpaid, for as long as nothing touches the
     * room. Three thousand ticks of it:
     */
    while (restored.kernel.tick < live.kernel.tick + 3_000) restored.kernel.step();
    expect(rooms.occupancyOf(CELL_A_ID), 'nobody moved on their own').toBe(4);
    expect(rooms.occupancyOf(CELL_B_ID), 'and the empty cell stayed empty').toBe(0);
    expect(rooms.residentIdsWithExistingPlace(), 'still two of four paid for').toHaveLength(2);

    // What does reach it is the gesture ADR 0076 was written about. Taking one
    // of the surplus beds out of the crowded cell runs the relocation, and the
    // excess go next door -- so the prison is recoverable by a player who acts,
    // and the state above is a standing cost rather than a trap.
    submit(restored, 'remove-surplus-bed', packCommand({ type: 'RemoveObject', x: CELL_A.x + 3, y: CELL_A.y }));
    while (restored.kernel.tick < live.kernel.tick + 6_000) restored.kernel.step();
    expect(rooms.occupancyOf(CELL_A_ID), 'the cell is down to what it can hold').toBe(2);
    expect(rooms.occupancyOf(CELL_B_ID), 'and the excess are housed next door').toBe(2);
    expect(rooms.residentIdsWithExistingPlace(), 'every prisoner holds a place again').toHaveLength(4);
  });
});
