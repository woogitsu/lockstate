import { describe, expect, it } from 'vitest';
import { intakeStageFromIndex } from '../../src/simulation/prisoners/components';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #372: **the shipped `AdmitPrisoner` path really does reach
 * `rateCellSharing`, and its answer really does decide which cell a prisoner
 * lands in.**
 *
 * `tests/unit/prisoners-cell-sharing.test.ts` proves the function computes
 * what it computes -- it builds `CellSharingView`s by hand and hands them
 * straight to `rateCellSharing`. That is a guard on the rating, not on the
 * allocation, and it would still be green if `IntakeSystem` had stopped
 * calling `findBestAvailable` with it, or never started. This file is the
 * missing half: two zoned, furnished cells, two prisoners admitted through
 * the real command path, and an assertion about which cell each one is
 * actually found in afterwards.
 *
 * ## The case, and why it can fail
 *
 * Both cells are zoned 2x3 with **two** beds each (`residentCapacity: 2`), not
 * one -- that is load-bearing. With one-bed cells the second admission would
 * be forced into the second cell by capacity alone, and the test would prove
 * nothing about the rating: a first-fit allocator with no notion of occupants
 * would land there too. With two beds each, cell A still has a free bed when
 * the second prisoner is classified, so **capacity cannot explain the
 * outcome** -- only a preference over who is already inside it can.
 *
 * `cellAId` (`room.cell:4:6`) sorts before `cellBId` (`room.cell:8:6`)
 * (`'4' < '8'`, the comparator `allByRoomCatalogId`/`findBestAvailable` use),
 * so:
 *
 * - **The naive answer** -- `findAvailableResidence`'s, and what a scan that
 *   never asked who was already in the room would produce -- is cell A for
 *   *both* prisoners: it is sorted first, is never full, and its `.find`
 *   never looks at occupants at all.
 * - **The rated answer**, if `rateCellSharing` is actually consulted, differs
 *   for the second prisoner. The first prisoner classifies at `riskTier` 0 and
 *   is the cell's only occupant when the second is classified. Every
 *   `sentenceLengthTicks: 10_000, priorIncidents: 1` admission classifies at
 *   riskTier 0, 1 or 2 (`tests/unit/prisoners-classification.test.ts`'s
 *   `reachableTiers` for that input), and at seed 1 the screening draw lands
 *   the second prisoner at riskTier 2 -- a worst-pairing rating of `|0-2| = 2`
 *   for cell A against a rating of `0` for the untouched, empty cell B. `0` is
 *   the floor `findBestAvailable` cannot be beaten below, so cell B wins and
 *   the second prisoner lands there instead of in cell A's second bed.
 *
 * That is the divergence this file measures: not "some room got chosen", but
 * "cell A specifically, which is both closer in sort order and has a free
 * bed, was passed over for cell B because of who was already inside it". A
 * rating that had stopped being consulted -- or was reachable but wrong --
 * would send the second prisoner to cell A along with the first, and the
 * assertion on `acc2` below would fail.
 *
 * ## Nothing hand-registered
 *
 * Every room instance below is built the way a player builds one: `ZoneRoom`
 * over a walled-and-doored rectangle, then two `PlaceObject` bed orders paid
 * for with purchased planks, exactly as `object-placement-loop.test.ts`
 * establishes for a single bed. No `RoomInstanceRegistry.register` call
 * appears anywhere in this file.
 *
 * ## Seed choice
 *
 * Seed 1, chosen after enumerating seeds 0-59 against this exact command
 * sequence (buy 4 planks, zone both cells, place all four beds, admit both
 * prisoners) and reading the real `riskTier` and accommodation each one
 * produced. Seed 0 was rejected because both prisoners land at riskTier 1 --
 * same tier, rating 0 both ways, no divergence. Seed 1 is not a special or
 * fragile draw: roughly half the 60 seeds surveyed produced some nonzero
 * riskTier gap and sent the second prisoner to cell B for the same reason;
 * seed 1 is simply the first one tried and kept.
 */

const SEED = 1;
const CELL = 'room.cell';
const CELL_A_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
const CELL_B_RECT = { x: 8, y: 6, width: 2, height: 3 } as const;
const cellAId = `${CELL}:${CELL_A_RECT.x}:${CELL_A_RECT.y}`;
const cellBId = `${CELL}:${CELL_B_RECT.x}:${CELL_B_RECT.y}`;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 };
/**
 * Two `AdmitPrisoner` requests whose reachable-tier ranges
 * (`tests/unit/prisoners-classification.test.ts`) both stay under 3, so both
 * prisoners are certainly `general-population` and therefore certainly target
 * `room.cell` -- no admission here can be diverted to a solitary cell by the
 * screening draw.
 */
const ADMISSION_ONE = { sentenceLengthTicks: 10_000, priorIncidents: 0 };
const ADMISSION_TWO = { sentenceLengthTicks: 10_000, priorIncidents: 1 };

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepBy(runtime: SimulationRuntime, ticks: number): void {
  const target = runtime.kernel.tick + ticks;
  while (runtime.kernel.tick < target) runtime.kernel.step();
}

/** Two zoned, walled, doored 2x3 cells, each furnished with two beds -- entirely through the real command path. */
function twoTwoBedCells(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);

  // Four beds, one plank each (`bed-wooden`'s footprint width is 1, and a
  // `materialsRequired` quantity is authored as that footprint), bought in one
  // order so both cells' orders can be satisfied off one delivery.
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 4 }));

  wallRoomPerimeter(runtime.world, CELL_A_RECT, { doors: runtime.navigation.doors });
  wallRoomPerimeter(runtime.world, CELL_B_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-a', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_A_RECT }));
  submit(runtime, 'zone-b', packCommand({ type: 'ZoneRoom', roomId: CELL, ...CELL_B_RECT }));

  // Two 1x2-footprint beds side by side in each 2-wide cell.
  submit(runtime, 'bed-a1', packCommand({ type: 'PlaceObject', orderId: 'bed-a1', definitionId: 'bed-wooden', x: CELL_A_RECT.x, y: CELL_A_RECT.y }));
  submit(runtime, 'bed-a2', packCommand({ type: 'PlaceObject', orderId: 'bed-a2', definitionId: 'bed-wooden', x: CELL_A_RECT.x + 1, y: CELL_A_RECT.y }));
  submit(runtime, 'bed-b1', packCommand({ type: 'PlaceObject', orderId: 'bed-b1', definitionId: 'bed-wooden', x: CELL_B_RECT.x, y: CELL_B_RECT.y }));
  submit(runtime, 'bed-b2', packCommand({ type: 'PlaceObject', orderId: 'bed-b2', definitionId: 'bed-wooden', x: CELL_B_RECT.x + 1, y: CELL_B_RECT.y }));

  // 100 ticks' procurement delay plus construction progress for four orders,
  // comfortably cleared.
  stepBy(runtime, 300);
  return runtime;
}

function stageOf(runtime: SimulationRuntime, index: number): string {
  return intakeStageFromIndex(runtime.prisoners.records.intakeStage[index]!);
}

describe('occupant-aware cell allocation reached through AdmitPrisoner (#372)', () => {
  it('zones and furnishes both cells with no refusal and a two-bed capacity each', () => {
    const runtime = twoTwoBedCells();
    expect(runtime.refusals.count, 'zoning and furnishing must not be refused').toBe(0);
    expect(runtime.prisoners.roomInstances.getById(cellAId)).toMatchObject({ residentCapacity: 2, objectCapabilities: ['sleep-surface'] });
    expect(runtime.prisoners.roomInstances.getById(cellBId)).toMatchObject({ residentCapacity: 2, objectCapabilities: ['sleep-surface'] });
  });

  it('sends the second, badly-matched arrival to the empty cell instead of the free bed in the first', () => {
    const runtime = twoTwoBedCells();

    submit(runtime, 'admit-1', packCommand({ type: 'AdmitPrisoner', ...ADMISSION_ONE, ...ARRIVAL }));
    stepBy(runtime, 40);

    const firstId = runtime.prisoners.entityStore.getIdByIndex(0)!;
    const firstIndex = runtime.prisoners.entityStore.getIndex(firstId);
    expect(runtime.refusals.count, 'the first admission must succeed').toBe(0);
    expect(stageOf(runtime, firstIndex)).toBe('completed');
    // The lone occupant, in the cell that sorts first because both cells were
    // empty and the rating is a tie (0 vs 0) -- exactly what a naive scan
    // would also have done, which is the point: nothing distinguishes the
    // allocators yet.
    expect(runtime.prisoners.coldState.getAccommodation(firstId)).toBe(cellAId);
    const firstTier = runtime.prisoners.records.riskTier[firstIndex]!;

    submit(runtime, 'admit-2', packCommand({ type: 'AdmitPrisoner', ...ADMISSION_TWO, ...ARRIVAL }));
    stepBy(runtime, 40);

    const secondId = runtime.prisoners.entityStore.getIdByIndex(1)!;
    const secondIndex = runtime.prisoners.entityStore.getIndex(secondId);
    expect(runtime.refusals.count, 'the second admission must succeed too').toBe(0);
    expect(stageOf(runtime, secondIndex)).toBe('completed');
    const secondTier = runtime.prisoners.records.riskTier[secondIndex]!;

    // The premise the whole file depends on: the two prisoners must actually
    // have been classified apart, or every assertion below would pass by
    // accident (a rating that always returns 0 would place them exactly the
    // same way). Recorded at seed 1: tier 0 and tier 2.
    expect({ firstTier, secondTier }).toEqual({ firstTier: 0, secondTier: 2 });
    expect(firstTier).not.toBe(secondTier);

    // The measurement. Cell A has a free bed and sorts first -- a scan blind
    // to occupants lands here, same as the first prisoner did. The rated scan
    // instead prefers cell B, which is empty and therefore rates 0 (the floor)
    // against cell A's rating of `|0 - 2| = 2`.
    expect(
      runtime.prisoners.coldState.getAccommodation(secondId),
      'a rating-aware allocation must prefer the empty cell over a worse-matched free bed',
    ).toBe(cellBId);

    // Stated the other way too, so the divergence is explicit rather than
    // implied: not full, not refused, just passed over.
    expect(runtime.prisoners.roomInstances.occupancyOf(cellAId)).toBe(1);
    // `findAvailableResidence` -- the naive, occupant-blind query -- still
    // names cell A as the first free residence in the prison, confirming
    // capacity never ruled cell A out. Only the rating did.
    expect(runtime.prisoners.roomInstances.findAvailableResidence(CELL, 'sleep-surface')?.instanceId).toBe(cellAId);
  });
});
