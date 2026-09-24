import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Issue #961, and the owner's ruling of 2026-09-17 on it: a resident ceiling
 * per room type in the catalogue.**
 *
 * The finding the ruling answers is one sentence long: *"nothing caps how many
 * beds a room holds, so there is never a reason to build a second cell"*. It
 * was measured by playing -- twelve prisoners went into the starter 6x6 cell
 * with `rooms` still 1 -- and what it costs is the mid-game's only growth
 * decision: a second cell, a wing or a layout is asked for by no rule in the
 * simulation.
 *
 * So this file is the measurement of the thing the ruling is supposed to buy,
 * driven through the real kernel and the real commands rather than argued:
 *
 * | arm | rooms | beds | planks | **prisoners housed** |
 * | --- | --- | --- | --- | --- |
 * | four beds in one cell | 1 | 4 | 4 | **2** |
 * | two beds in each of two cells | 2 | 4 | 4 | **4** |
 *
 * **The two arms differ by one `ZoneRoom` command and by where two
 * `PlaceObject` commands point.** Same seed, same four admissions, same four
 * bed orders, same four planks, same tick budget. Before the ruling both arms
 * housed four, and the first arm is what a player actually did.
 *
 * ## What it is careful not to be
 *
 * - **It does not read the ceiling to decide what to expect of the ceiling.**
 *   Nothing here imports `room-catalog.ts`. The expectation is a count of
 *   *housed prisoners* read off the published status counts, so a ceiling that
 *   stopped binding fails here even though this file names no number from the
 *   content.
 * - **The surplus pair wait outside in #590's queue.** A second furnished cell
 *   admits them; it does not merely change an internal classification stage.
 */

const SEED = 0x0b1ec7;

/** Four bed anchors wide and `room.cell`'s authored minimum of 3 tall, so every 1x2 footprint lies inside. */
const CELL_A = { x: 4, y: 6, width: 4, height: 3 } as const;
/** The second cell: the same rectangle, three tiles further down, clear of the first and of its walls. */
const CELL_B = { x: 4, y: 12, width: 4, height: 3 } as const;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Long enough that no sentence ends inside the window. */
const ADMISSION = { sentenceLengthTicks: 1_000_000, priorIncidents: 0 } as const;

const PRISONERS = 4;
/** Past every completion: a bed takes 151 ticks from the press and the crew builds one order at a time (measured in `capacity-counts-on-completion.test.ts`). */
const SETTLED_BY = 3_000;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

/**
 * `cells` is how the same four beds are distributed: `[4]` puts them all in one
 * cell, `[2, 2]` zones a second and splits them.
 */
function prison(cells: readonly number[]): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const rects = [CELL_A, CELL_B].slice(0, cells.length);

  for (const [index, rect] of rects.entries()) {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect }));
  }

  let placed = 0;
  for (const [index, beds] of cells.entries()) {
    const rect = rects[index]!;
    for (let bed = 0; bed < beds; bed += 1) {
      submit(
        runtime,
        `bed-${String(placed)}`,
        packCommand({ type: 'PlaceObject', orderId: `o-bed-${String(placed)}`, definitionId: 'bed-wooden', x: rect.x + bed, y: rect.y }),
      );
      placed += 1;
    }
    // One toilet per cell, so each is a cell a designation panel would call
    // complete rather than a rectangle with beds in it.
    submit(
      runtime,
      `toilet-${String(index)}`,
      packCommand({ type: 'PlaceObject', orderId: `o-toilet-${String(index)}`, definitionId: 'toilet-brick', x: rect.x, y: rect.y + 2 }),
    );
  }

  for (let prisoner = 0; prisoner < PRISONERS; prisoner += 1) {
    submit(runtime, `admit-${String(prisoner)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  while (runtime.kernel.tick < SETTLED_BY) runtime.kernel.step();
  return runtime;
}

function counts(runtime: SimulationRuntime): ReturnType<typeof projectStatusCounts> {
  return projectStatusCounts(runtime, runtime.kernel.tick);
}

describe('what a second cell buys, now that a room type may author a resident ceiling (#961)', () => {
  it('houses two of four in one cell with four beds, and all four when the same four beds are two cells', () => {
    const oneCell = prison([4]);
    const twoCells = prison([2, 2]);

    expect(oneCell.refusals.count, 'no command in either arm may be refused').toBe(0);
    expect(twoCells.refusals.count).toBe(0);

    const crowded = counts(oneCell);
    const subdivided = counts(twoCells);

    // The same four arrivals are requested in both prisons. A capped cell
    // admits only two and queues the other two outside until capacity opens.
    expect(crowded.prisoners).toBe(2);
    expect(subdivided.prisoners).toBe(PRISONERS);
    expect(oneCell.prisoners.delayedIntakeCount).toBe(2);
    expect(twoCells.prisoners.delayedIntakeCount).toBe(0);

    // **The finding, and the ruling's answer to it, in one pair of numbers.**
    expect(crowded.roomCapacity, 'four beds in one cell, and the cell holds two').toBe(2);
    expect(subdivided.roomCapacity, 'the same four beds across two cells').toBe(4);
    expect(crowded.occupiedPlaces, 'two prisoners housed and paid for').toBe(2);
    expect(subdivided.occupiedPlaces, 'all four housed and paid for').toBe(PRISONERS);
    expect(crowded.rooms).toBe(1);
    expect(subdivided.rooms).toBe(2);

    // They wait outside, not in the prisoner intake pipeline.
    expect(crowded.prisonersInIntake).toBe(0);
    expect(subdivided.prisonersInIntake).toBe(0);
    expect(oneCell.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 2, failedCount: 0 });
    expect(twoCells.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: PRISONERS, failedCount: 0 });
  });

  it('pays the state income for the places the second cell added, which is what growth is for', () => {
    // `StateIncomeSystem` pays per occupied place at the end of an in-game day,
    // so the two arms are run to the same day boundary and compared there.
    const oneCell = prison([4]);
    const twoCells = prison([2, 2]);
    const DAY_LENGTH_TICKS = 2_400;
    const untilTick = 3 * DAY_LENGTH_TICKS;
    while (oneCell.kernel.tick < untilTick) oneCell.kernel.step();
    while (twoCells.kernel.tick < untilTick) twoCells.kernel.step();

    const crowdedFunds = counts(oneCell).treasuryMinorUnits;
    const subdividedFunds = counts(twoCells).treasuryMinorUnits;

    // Both arms buy four beds. The capped one-cell arm admits only two; the
    // second cell admits and pays two more. No crowding surcharge is triggered
    // by the two queued arrivals outside.
    expect(subdividedFunds).toBeGreaterThan(crowdedFunds);
    expect(subdividedFunds - crowdedFunds).toBe(1_600);
  });
});
