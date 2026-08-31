import { describe, expect, it } from 'vitest';
import { stateIncomeAccruedByTick, stateIncomeForCompletedDay } from '../../src/simulation/economy';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Issue #585: an occupied place must mean a bed that currently exists.**
 *
 * ADR 0017 decision 6 pays the state's grant *per occupied place*, and
 * `StateIncomeSystem` reads that count out of `RoomInstanceRegistry`. Residency
 * there is an **assignment**, and ADR 0028 decision 2 deliberately keeps an
 * assignment alive when the bed under it is taken away -- *"nobody is evicted,
 * the room stops accepting new occupants"*. Those two decisions are each right
 * and together they were a faucet: an assignment that survives its bed is a
 * revenue-bearing place that no longer exists.
 *
 * ## The exploit, and it goes through the real command router
 *
 * One `item.wood-plank` buys one `object.bed`. `Undo` cancels the completed
 * order, `ConstructionSystem.cancelOrder` releases the order's
 * `materialsAllocated` back into the construction container, and the plank is
 * available again -- while the prisoner the bed housed stays assigned to the
 * now-bedless cell. Repeat into the next cell.
 *
 * Nothing below reaches into a registry, a treasury or a construction order by
 * hand: every step is a packed command through `Kernel.submitCommand`, which is
 * what makes the numbers a statement about what a player can do rather than
 * about what a fixture can build.
 */

const SEED = 0x0b1ec7;
const CELL = 'room.cell';
/** The tile `src/main.ts`'s Intake control admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 };
/** A sentence long enough that `PrisonerDischargeSystem` cannot release anybody inside the window measured here. */
const ADMISSION = { sentenceLengthTicks: 1_000_000, priorIncidents: 0 };

/** Three cells in a row, each `room.cell`'s authored 2x3 minimum, clear of the arrival tile. */
const CELL_RECTS = [
  { x: 4, y: 6, width: 2, height: 3 },
  { x: 7, y: 6, width: 2, height: 3 },
  { x: 10, y: 6, width: 2, height: 3 },
] as const;

const bedTileOf = (index: number) => ({ x: CELL_RECTS[index]!.x, y: CELL_RECTS[index]!.y });
const instanceIdOf = (index: number) => `${CELL}:${CELL_RECTS[index]!.x}:${CELL_RECTS[index]!.y}`;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepBy(runtime: SimulationRuntime, ticks: number): void {
  const target = runtime.kernel.tick + ticks;
  while (runtime.kernel.tick < target) runtime.kernel.step();
}

/** Three zoned, walled, empty cells and exactly one wooden plank bought. */
function prisonWithThreeCellsAndOnePlank(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 1 }));
  CELL_RECTS.forEach((rect, index) => {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: CELL, ...rect }));
  });
  stepBy(runtime, 200);
  return runtime;
}

/** Builds a bed in cell `index` out of the one plank, admits one prisoner, and waits until intake has housed them. */
function furnishAndAdmit(runtime: SimulationRuntime, index: number): void {
  submit(runtime, `place-bed-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', ...bedTileOf(index) }));
  stepBy(runtime, 400);
  expect(runtime.construction.getOrder(`bed-${String(index)}`)?.state, 'the one plank must have become a bed').toBe('completed');
  expect(runtime.prisoners.roomInstances.getById(instanceIdOf(index))?.residentCapacity).toBe(1);
  submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  stepBy(runtime, 200);
  expect(runtime.prisoners.roomInstances.occupancyOf(instanceIdOf(index)), 'intake must have housed the arrival in the cell just furnished').toBe(1);
}

interface PlaceReport {
  /** Prisoners holding a residency assignment anywhere, whether or not a bed is under them. */
  readonly assignedResidents: number;
  /** Objects standing in the whole prison. */
  readonly objectsStanding: number;
  /** Summed `residentCapacity` of the three cells: how many places the prison has actually furnished. */
  readonly residencyCapacity: number;
  /** What `StateIncomeSystem` would credit for a whole day right now. */
  readonly dayGrant: number;
}

function placeReport(runtime: SimulationRuntime): PlaceReport {
  let residencyCapacity = 0;
  for (let index = 0; index < CELL_RECTS.length; index += 1) {
    residencyCapacity += runtime.prisoners.roomInstances.getById(instanceIdOf(index))?.residentCapacity ?? 0;
  }
  return {
    assignedResidents: runtime.prisoners.roomInstances.residentIds().length,
    objectsStanding: runtime.placedObjects.size,
    residencyCapacity,
    dayGrant: stateIncomeForCompletedDay(runtime.prisoners),
  };
}

/**
 * The exploit: furnish, house, undo the build order to get the plank back,
 * repeat into the next cell. The last bed is left standing, so the prison ends
 * with exactly the one place the one plank paid for.
 */
function cycleOnePlankThroughThreeCells(): SimulationRuntime {
  const runtime = prisonWithThreeCellsAndOnePlank();
  for (let index = 0; index < CELL_RECTS.length; index += 1) {
    furnishAndAdmit(runtime, index);
    if (index === CELL_RECTS.length - 1) break;
    // `Undo` and not `RemoveObject`: a removal leaves the completed order
    // alone, and it is `cancelOrder` -- which `undo()` delegates to -- that
    // releases `materialsAllocated` back into the container. Measured: with
    // `RemoveObject` here the second bed order sits in `materials-pending` for
    // ever, so the plank really does come back only down this path.
    submit(runtime, `undo-${String(index)}`, packCommand({ type: 'Undo' }));
    expect(runtime.refusals.count, 'undoing a completed bed order must not be refused').toBe(0);
    stepBy(runtime, 60);
  }
  return runtime;
}

/** The honest play: the same plank, spent once and left alone. */
function spendOnePlankOnce(): SimulationRuntime {
  const runtime = prisonWithThreeCellsAndOnePlank();
  furnishAndAdmit(runtime, 0);
  return runtime;
}

function earnedOverOneDay(runtime: SimulationRuntime): number {
  const before = runtime.treasury.balanceMinorUnits;
  stepBy(runtime, DAY_LENGTH_TICKS);
  return runtime.treasury.balanceMinorUnits - before;
}

describe('one plank, cycled through three cells, against the same plank spent once', () => {
  it('leaves three prisoners assigned to one furnished place', () => {
    const exploit = cycleOnePlankThroughThreeCells();

    // The prison the player actually built: one bed, one place.
    expect(placeReport(exploit)).toMatchObject({ objectsStanding: 1, residencyCapacity: 1 });
    // And the prison the registry believes in. **All three are still housed**,
    // which is ADR 0028 decision 2 and is not what #585 changed: nobody is
    // evicted, and `residentIds` still says so.
    expect(placeReport(exploit).assignedResidents).toBe(3);
    // What changed is that two of the three are not places.
    expect(exploit.prisoners.roomInstances.residentIdsWithExistingPlace()).toHaveLength(1);
  });

  it('REPRODUCTION (#585): pays for all three, three times the control', () => {
    const exploit = cycleOnePlankThroughThreeCells();
    const control = spendOnePlankOnce();

    // Both prisons have furnished exactly one place out of exactly one plank.
    expect(placeReport(exploit).residencyCapacity).toBe(placeReport(control).residencyCapacity);

    // **The defect, and what it now pays.** Measured at `05640b6` (v0.0.210)
    // before the fix: the exploit's `dayGrant` and its one-day treasury delta
    // were both **900**, three times the control's 300, off the same one plank
    // and the same one furnished place. The control is untouched by the fix --
    // that is the property that matters, because a change to the income line
    // that also moved an honest prison's earnings would be a nerf and not a
    // patch.
    expect(placeReport(exploit).dayGrant).toBe(300);
    expect(earnedOverOneDay(exploit)).toBe(300);
    expect(placeReport(control).dayGrant).toBe(300);
    expect(earnedOverOneDay(control)).toBe(300);
  });
});

/**
 * The same rule inside **one** room, which the three-cell reproduction above
 * cannot show.
 *
 * That measurement moves a whole cell from one place to none, so it is
 * satisfied by an all-or-nothing rule as much as by the clamp the code
 * actually implements: `min(occupancy, residentCapacity)` **per room instance**
 * ([ADR 0076](../../docs/adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
 * decision A(ii), refined by `RoomInstanceRegistry.residentIdsWithExistingPlace`
 * so that *which* resident keeps the place is decided too). A cell holding two
 * residents over one remaining bed is the case where the two rules disagree --
 * the clamp pays 300, all-or-nothing pays 0, and paying by assignment pays 600
 * -- and no test drove it through real commands. `tests/unit/economy-state-income.test.ts`
 * pins the arithmetic on a hand-built registry; this pins that a player pressing
 * `RemoveObject` reaches it.
 *
 * ## And it is where the two published notions of "occupant" come apart
 *
 * `SimulationStatusCounts.roomOccupants` is the summed `occupancyOf` of every
 * catalog-known instance -- **assignments**, which ADR 0028 decision 2 keeps
 * alive when a bed goes. `residentIdsWithExistingPlace()` is places. Before
 * #585 those were the same number by construction and the income line read the
 * first; they are now different questions, and the only thing keeping the money
 * off the wrong one is which accessor `stateIncomeForCompletedDay` names. This
 * case asserts both figures from one prison state so the divergence is a
 * measurement rather than a claim, and so that deriving a payout from the
 * published count would fail here rather than in a balance nobody is watching.
 */
describe('two residents over one remaining bed, in one cell', () => {
  /** One 3x3 cell -- `room.cell`'s authored minimum is 2x3 -- with room for two beds side by side. */
  const SHARED = { x: 4, y: 6, width: 3, height: 3 } as const;
  const SHARED_ID = `${CELL}:${SHARED.x}:${SHARED.y}`;
  const FIRST_BED = { x: SHARED.x, y: SHARED.y };
  const SECOND_BED = { x: SHARED.x + 1, y: SHARED.y };

  /** Two beds standing, two prisoners housed in them, and the second bed then taken away by `RemoveObject`. */
  function twoResidentsAndOneBedLeft(): SimulationRuntime {
    const runtime = createNewSimulationRuntime(SEED);
    submit(runtime, 'buy', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: 4 }));
    wallRoomPerimeter(runtime.world, SHARED, { doors: runtime.navigation.doors });
    submit(runtime, 'zone', packCommand({ type: 'ZoneRoom', roomId: CELL, ...SHARED }));
    stepBy(runtime, 200);

    submit(runtime, 'bed-a', packCommand({ type: 'PlaceObject', orderId: 'bed-a', definitionId: 'bed-wooden', ...FIRST_BED }));
    submit(runtime, 'bed-b', packCommand({ type: 'PlaceObject', orderId: 'bed-b', definitionId: 'bed-wooden', ...SECOND_BED }));
    stepBy(runtime, 600);
    expect(runtime.prisoners.roomInstances.getById(SHARED_ID)?.residentCapacity, 'two beds must furnish two places').toBe(2);

    submit(runtime, 'admit-1', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepBy(runtime, 200);
    submit(runtime, 'admit-2', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
    stepBy(runtime, 200);
    expect(runtime.prisoners.roomInstances.occupancyOf(SHARED_ID), 'intake must have housed both in the one cell').toBe(2);
    expect(stateIncomeForCompletedDay(runtime.prisoners), 'and a furnished prison pays for both').toBe(600);

    // `RemoveObject` and not `Undo`: this is a player taking a bed back out of
    // a room they built correctly, which refunds nothing. The exploit above
    // needs `Undo` because only `cancelOrder` releases `materialsAllocated`;
    // here the plank is irrelevant and the bed simply stops existing.
    //
    // The middle clause is narrower since the owner's ruling 20 of 2026-08-31
    // (ADR 0076's amendment) and is still true of the path it is about:
    // `cancelOrder` releases an allocation only for a `completed` order now,
    // which is exactly the order the `Undo` above cancels. In the states the
    // ruling covers it pays money instead.
    submit(runtime, 'remove-second-bed', packCommand({ type: 'RemoveObject', ...SECOND_BED }));
    stepBy(runtime, 5);
    return runtime;
  }

  it('pays for the one bed that is left, and neither for both residents nor for neither', () => {
    const runtime = twoResidentsAndOneBedLeft();

    // The prison the player built: one bed standing in a cell that furnishes
    // one place, with two prisoners living in it.
    expect(runtime.placedObjects.size).toBe(1);
    expect(runtime.prisoners.roomInstances.getById(SHARED_ID)?.residentCapacity).toBe(1);
    expect(runtime.prisoners.roomInstances.occupancyOf(SHARED_ID), 'nobody is evicted -- ADR 0028 decision 2').toBe(2);

    // One place, not two and not none. 600 would be paying by assignment, which
    // is the defect #585 removed; 0 would be an all-or-nothing rule the code
    // does not implement and would over-punish an honest player who took one
    // bed out of a two-bed cell.
    expect(runtime.prisoners.roomInstances.residentIdsWithExistingPlace()).toHaveLength(1);
    expect(stateIncomeForCompletedDay(runtime.prisoners)).toBe(300);
    expect(earnedOverOneDay(runtime), 'and the treasury is credited what the walk says').toBe(300);
  });

  it('publishes two occupants and one occupied place off the same prison state', () => {
    const runtime = twoResidentsAndOneBedLeft();
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);

    // Assignments, over a capacity that is now smaller than they are. Both
    // numbers are honest about their own question and they are not the same
    // question, which is the whole of what this asserts.
    expect(counts.roomOccupants, 'the strip publishes assignments').toBe(2);
    expect(counts.roomCapacity, 'against the places the prison has furnished').toBe(1);

    // The count the money is a multiple of, published beside the other one
    // rather than instead of it (issue #585). Asserted against the registry as
    // well as against the literal, so a projection that started reporting the
    // assignment count would fail here even if somebody moved the literal.
    expect(counts.occupiedPlaces, 'and the places the state actually pays for').toBe(1);
    expect(counts.occupiedPlaces).toBe(runtime.prisoners.roomInstances.residentIdsWithExistingPlace().length);
    expect(counts.occupiedPlaces, 'which is not the assignment count').not.toBe(counts.roomOccupants);

    // And the accrual chip is folded from the same walk, so the published
    // count and the published money cannot describe two different prisons:
    // one place, 300 a day, prorated by how much of the day has been served.
    expect(counts.stateIncomeAccruedTodayMinorUnits).toBe(
      stateIncomeAccruedByTick(stateIncomeForCompletedDay(runtime.prisoners), runtime.kernel.tick),
    );
  });
});
