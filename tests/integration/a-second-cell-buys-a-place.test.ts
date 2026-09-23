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
 * - **The unhoused pair are shown to be waiting rather than failed**, because
 *   "a second cell buys you something" is only true if the prisoners it houses
 *   were still admissible. `'failed'` is terminal (ADR 0028 decision 8) and
 *   would make the second arm a different prison rather than a better one.
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

    // The same four prisoners are admitted into both prisons, and the same four
    // beds are built in both.
    expect(crowded.prisoners).toBe(PRISONERS);
    expect(subdivided.prisoners).toBe(PRISONERS);

    // **The finding, and the ruling's answer to it, in one pair of numbers.**
    expect(crowded.roomCapacity, 'four beds in one cell, and the cell holds two').toBe(2);
    expect(subdivided.roomCapacity, 'the same four beds across two cells').toBe(4);
    expect(crowded.occupiedPlaces, 'two prisoners housed and paid for').toBe(2);
    expect(subdivided.occupiedPlaces, 'all four housed and paid for').toBe(PRISONERS);
    expect(crowded.rooms).toBe(1);
    expect(subdivided.rooms).toBe(2);

    // The two the crowded prison could not house are **waiting**, not failed:
    // building the second cell is a remedy that is still available to that
    // player. `prisonersInIntake` counts an arrival that has not been housed.
    expect(crowded.prisonersInIntake, 'the two with nowhere to sleep are still in the pipeline').toBe(2);
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

    // The same four bed orders and the same spending in both arms, so the
    // difference between the two treasuries is what the two extra occupied
    // places earned: **26,340 against 27,940 after three in-game days, a gap of
    // 1,600 minor units** -- two places at `stateIncomeForPrisonerDay` over two
    // paid days, the third day's payment landing on the last tick of day three.
    // Asserted as the gap as well as the direction, so a change that paid the
    // crowded prison for places it does not have fails here.
    //
    // **1,840 since issue #586, and the extra 240 is that issue's whole point
    // measured in one fixture.** The crowded arm holds four prisoners against
    // two places -- twice its capacity, the cap of the crowding term -- so
    // its two paying residents' `safety` and `hygiene` decay faster than the
    // subdivided arm's four. This fixture hires nobody, so `safety` is
    // unopposed in both arms and crosses the unmet line inside day one for the
    // crowded pair (816 ticks from full at -50 stored units a tick) and inside
    // day two for everybody (4,080 at -10); `hygiene` crosses for the crowded
    // pair on day two (3,400 ticks at -12) and not at all for the subdivided
    // four inside three days (10,200 at -4). So the crowded arm is withheld
    // two extra 40s on each of the three paid days -- safety on day one,
    // hygiene on days two and three -- and 6 x 40 = 240. Measured rather than
    // summed, at the last tick of each day: the crowded arm's day reads 520 /
    // 440 / 440 where the tree before #586 read 600 / 520 / 520, and the
    // subdivided arm's 1,200 / 1,040 / 1,040 is unchanged. (Its `safety` is
    // not: 109 rather than 136 at the end of day one, because its four beds
    // complete one build order at a time and the prison is briefly over its
    // capacity while they do. It crosses no line a day earlier for that.)
    // The gap between
    // places is still the 1,600 above; what the second cell now also buys is
    // relief from crowding, and that is the ruling's *"a packed prison loses
    // income through the line the player is already watching"*.
    expect(subdividedFunds).toBeGreaterThan(crowdedFunds);
    expect(subdividedFunds - crowdedFunds).toBe(1_840);
  });
});
