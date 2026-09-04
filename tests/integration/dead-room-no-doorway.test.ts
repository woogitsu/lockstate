import { describe, expect, it } from 'vitest';
import { projectRoomDetail, projectRoomList } from '../../src/simulation/presentation/room-projection';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { NEED_MAX, NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { roomPerimeterEnclosure } from '../../src/simulation/rooms/enclosure';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { roomNeedsFromProjections, unfinishedRoomIds } from '../../src/ui/simulation-room-needs';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **A room with no doorway is accepted, counted, and dead** -- issue #938,
 * found by playing (`playtest/is-there-anything-to-do`) and re-measured here.
 *
 * ## What the defect was, in one pair of numbers
 *
 * Two prisons that differ by **one edge**. Both zone a `room.shower-room` and
 * place both of its shower heads; one has a wooden door in the wall line and
 * one does not. On the same seed, after ten in-game days:
 *
 * | | with a door | without |
 * | --- | --- | --- |
 * | `hygiene`, both prisoners | 254.8 / 253.2 of 255 | **0 / 0** |
 * | `roomPerimeterEnclosure` | `'sealed'` | `'sealed'` |
 * | `requirementSummary.missingCapability` | 0 | **0** |
 *
 * The middle row is what a player was told -- `hud.rooms.enclosure-sealed`,
 * *"Walled in on every side"*, rendered from that enum and identical in both
 * columns -- and the bottom row is the readout that names what a room is
 * short, silent in both. Every published signal agreed the dead room was
 * finished, while the need it was built for sat on the floor.
 *
 * ## Why the assertions are shaped this way
 *
 * The behavioural half is a **measurement**, not a proxy: `hygiene` only ever
 * falls unless something restores it, so a level near the ceiling after
 * 24,000 ticks is proof the shower was used and `0` is proof it never was.
 * Nothing here asks `ActionSystem` whether it thinks it served anything, which
 * is #375's rule.
 *
 * The projection half is asserted **in both directions on purpose**. Pinning
 * only "`access` is `'no-way-in'` for the sealed room" would pass for an
 * implementation that answered `'no-way-in'` for every room, and the working
 * prison is the sample that refutes it. `missingCapability` is pinned at 0 in
 * both columns for the same reason in reverse: it is the figure that *cannot*
 * tell them apart, and an implementation that started reporting the doorway as
 * an unmet object requirement -- widening the closed requirement vocabulary at
 * `src/simulation/rooms/definition.ts`, which is #938 §6 option 1 and needs an
 * ADR -- would move it and should fail here rather than pass quietly.
 *
 * ## The diagnostic that already existed
 *
 * `ActionMetrics.unmetDemandCycles` separates the two prisons, and #938 is
 * right that it reaches no surface (no reader in `src/ui/`, `src/main.ts`,
 * `src/rendering/` or `src/simulation/presentation/`). It is pinned below with
 * the correction that matters: it is **exactly equal to `routeFailures`**, so
 * every count in this run comes from `continueTravelling`'s route-failure arm
 * rather than from the candidate walk running out -- which is what
 * `beginNextAction`'s own docblock predicts, *"in a prison with a housed
 * population it is therefore 0"*. It is also a population aggregate with no
 * room in it, so it could never have said *which* room was dead. That is why
 * the fix is a per-room signal on the projection and not a published counter.
 */

/** Distinct from every other seed in the suite, so no shared fixture can make these figures true by accident. */
const SEED = 0x938;
/** `src/main.ts`'s `NEW_PRISON_ORIGIN_TILE`: where a hire stands and an admission arrives. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Far longer than this run, so `PrisonerDischargeSystem` cannot release anybody mid-measurement. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;
/** `room.shower-room`'s authored 3x3 minimum, clear of the cells. */
const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
/** Ten in-game days at `DAY_LENGTH_TICKS` 2,400: long enough for a shower a day to have happened ten times. */
const RUN_UNTIL = 24_000;
const PRISONERS = 2;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Cells in a row along the top of the one chunk a prison owns, three tiles apart so no two share a wall. */
function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

/**
 * The whole prison, built with the commands a player has --
 * `PurchaseMaterials`, `ZoneRoom`, `PlaceObject`, `HireStaff`,
 * `AdmitPrisoner`. `wallRoomPerimeter` is the one shortcut and writes the
 * edges completed `wall-brick` and `door-wooden` orders would have written;
 * its own header records why a door is not optional in practice.
 *
 * **The cells always get a door**, in both columns. Without one the prisoners
 * could not reach their own beds either, and the run would be measuring a
 * prison where nothing works rather than one where exactly one room does not.
 */
function build(showerDoor: boolean): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: PRISONERS }, (_unused, index) => cellRect(index));

  // One plank per bed; one brick per toilet, plus two for the shower heads.
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: PRISONERS }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: PRISONERS + 2 }));

  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  // The one edge the two prisons differ by.
  wallRoomPerimeter(runtime.world, SHOWER, showerDoor ? { doors: runtime.navigation.doors } : {});

  cells.forEach((rect, index) => submit(runtime, `zone-cell-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));

  cells.forEach((rect, index) => {
    submit(runtime, `bed-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `wc-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `wc-${String(index)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  submit(runtime, 'head-1', packCommand({ type: 'PlaceObject', orderId: 'head-1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
  submit(runtime, 'head-2', packCommand({ type: 'PlaceObject', orderId: 'head-2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));

  // Delivery delay plus build progress; every order is standing well before this.
  stepTo(runtime, 1_000);
  submit(runtime, 'hire-0', packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  for (let index = 0; index < PRISONERS; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  // A refused purchase, zoning, placement, hire or admission would make every
  // figure below a measurement of a different prison, so it is checked rather
  // than assumed.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

interface Prison {
  readonly runtime: SimulationRuntime;
  /** Every living prisoner's `hygiene`, in whole levels, read off the stored array rather than through the rounding accessor. */
  readonly hygiene: readonly number[];
}

/** Built once per column and shared, because both columns are read by every case below. */
const prisons = new Map<boolean, Prison>();

function prison(showerDoor: boolean): Prison {
  const cached = prisons.get(showerDoor);
  if (cached !== undefined) return cached;

  const runtime = build(showerDoor);
  stepTo(runtime, RUN_UNTIL);
  const store = runtime.prisoners.entityStore;
  const hygiene: number[] = [];
  for (let slot = 0; slot < PRISONERS; slot += 1) {
    const index = store.getIndex(store.getIdByIndex(slot));
    hygiene.push(runtime.prisoners.needs.levels.hygiene[index]! / NEED_SCALE);
  }
  const built: Prison = { runtime, hygiene };
  prisons.set(showerDoor, built);
  return built;
}

/** The list and the one detail per unfinished room the Rooms panel's reader asks for, projected the way the worker projects them. */
function readout(prisonUnderTest: Prison): ReturnType<typeof roomNeedsFromProjections> {
  const { runtime } = prisonUnderTest;
  const options = {
    placedObjects: runtime.placedObjects,
    perimeter: { edges: runtime.world, doors: runtime.navigation.doors },
  };
  const list = projectRoomList(runtime.prisoners, {}, options);
  const details = unfinishedRoomIds(list)
    .map((instanceId) => projectRoomDetail(runtime.prisoners, instanceId, options))
    .filter((detail): detail is NonNullable<typeof detail> => detail !== undefined);
  return roomNeedsFromProjections(list, details);
}

function showerRow(prisonUnderTest: Prison): ReturnType<typeof projectRoomList>['rooms']['rows'][number] {
  const { runtime } = prisonUnderTest;
  const list = projectRoomList(runtime.prisoners, {}, {
    placedObjects: runtime.placedObjects,
    perimeter: { edges: runtime.world, doors: runtime.navigation.doors },
  });
  const row = list.rooms.rows.find((candidate) => candidate.roomCatalogId === 'room.shower-room');
  expect(row, 'the shower room must be registered in both prisons').not.toBeUndefined();
  return row!;
}

describe('a shower room with a door serves the need it was built for', () => {
  it('washes both prisoners nearly to the ceiling', () => {
    const withDoor = prison(true);
    // 254.8 and 253.2 of 255 when this landed. Asserted as a floor rather than
    // as those two figures, because the number that matters is "the need is
    // served" and pinning a decimal would make an unrelated need-decay change
    // fail here instead of where it belongs.
    for (const level of withDoor.hygiene) expect(level).toBeGreaterThan(NEED_MAX * 0.9);
  });

  it('reports the room finished, and the readout says nothing about it', () => {
    const withDoor = prison(true);
    expect(showerRow(withDoor).requirementSummary.missingCapability).toBe(0);
    expect(showerRow(withDoor).access).toBe('doorway');
    // Nothing at all: three rooms, all of them finished, so the panel draws no
    // block. `unfinishedRooms === 0` is the state that keeps this readout from
    // becoming furniture.
    expect(readout(withDoor)).toMatchObject({ unfinishedRooms: 0, totalNeeds: 0, needs: [] });
  });
});

describe('the same room with no door is dead, and now says so (#938)', () => {
  it('leaves both prisoners at hygiene 0 after ten days', () => {
    const noDoor = prison(false);
    expect(noDoor.hygiene).toEqual([0, 0]);
  });

  it('is still `sealed`, which is why one enclosure sentence could not tell the two prisons apart', () => {
    // The fact `hud.rooms.enclosure-sealed` is rendered from, identical in both
    // columns. Left true and left rendering the same sentence: the perimeter
    // really is closed in both, so that sentence is not the false one.
    expect(roomPerimeterEnclosure(prison(true).runtime.world, SHOWER)).toEqual({ enclosure: 'sealed' });
    expect(roomPerimeterEnclosure(prison(false).runtime.world, SHOWER)).toEqual({ enclosure: 'sealed' });
  });

  it('still satisfies every object requirement, so the requirement verdict could not tell them apart either', () => {
    expect(showerRow(prison(false)).requirementSummary).toEqual(showerRow(prison(true)).requirementSummary);
    expect(showerRow(prison(false)).requirementSummary.missingCapability).toBe(0);
  });

  it('publishes `access: no-way-in`, which is the signal that does tell them apart', () => {
    expect(showerRow(prison(false)).access).toBe('no-way-in');
    expect(projectRoomDetail(prison(false).runtime.prisoners, showerRow(prison(false)).instanceId, {
      placedObjects: prison(false).runtime.placedObjects,
      perimeter: { edges: prison(false).runtime.world, doors: prison(false).runtime.navigation.doors },
    })?.access).toBe('no-way-in');
  });

  it('names the room in the needs readout and says a door is what it is short', () => {
    const noDoor = prison(false);
    const needs = readout(noDoor);
    expect(needs.unfinishedRooms).toBe(1);
    expect(needs.totalRooms).toBe(3);
    expect(needs.totalNeeds).toBe(1);
    expect(needs.needs).toEqual([
      {
        kind: 'doorway',
        instanceId: 'room.shower-room:26:1',
        roomLabelKey: 'room.shower-room.name',
        tile: { x: SHOWER.x, y: SHOWER.y },
      },
    ]);
    // No object name and no numeral on a doorway entry: `exactOptionalPropertyTypes`
    // is on and the panel branches on `kind`, but a stray key here would be a
    // sentence about an object the room is not short.
    expect(Object.hasOwn(needs.needs[0] ?? {}, 'objectLabelKey')).toBe(false);
    expect(Object.hasOwn(needs.needs[0] ?? {}, 'missingQuantity')).toBe(false);
  });
});

describe('the worker asks the question, so a real session gets the answer', () => {
  /*
   * The wiring and not the rule, which is the shape
   * `tests/unit/hud-projections.test.ts` pins for `placedObjects` in its own
   * words: *"`projection-catalog.ts` must hand the registry over, or every
   * session a player runs takes the fallback above ... while every test here
   * passes"*. The same trap is one line wider here, because `access` is
   * *absent* without the option rather than merely weaker -- so a catalog entry
   * that forgot to pass `perimeter` would leave the readout silent in exactly
   * the prison this whole file is about, with every other assertion above still
   * green.
   *
   * Both entries, because the readout needs both: the list is what decides a
   * room is unfinished and the detail is what names what it is short.
   */
  it('passes the world and the door registry to both room projections', () => {
    const noDoor = prison(false).runtime;

    const list = PROJECTION_CATALOG['hud/room-list'].project(noDoor, noDoor.kernel.tick, {})
      .view as unknown as ReturnType<typeof projectRoomList>;
    const row = list.rooms.rows.find((candidate) => candidate.roomCatalogId === 'room.shower-room');
    expect(row?.access, 'the list entry must ask about the walls').toBe('no-way-in');

    const detail = PROJECTION_CATALOG['hud/room-detail'].project(noDoor, noDoor.kernel.tick, {
      target: { kind: 'id', id: 'room.shower-room:26:1' },
    }).view as unknown as ReturnType<typeof projectRoomDetail>;
    expect(detail?.access, 'the detail entry must ask too').toBe('no-way-in');

    // And the same two entries answer the other way for the prison that works,
    // so this is a test of the wiring rather than of a constant.
    const withDoor = prison(true).runtime;
    const workingList = PROJECTION_CATALOG['hud/room-list'].project(withDoor, withDoor.kernel.tick, {})
      .view as unknown as ReturnType<typeof projectRoomList>;
    expect(workingList.rooms.rows.find((candidate) => candidate.roomCatalogId === 'room.shower-room')?.access).toBe(
      'doorway',
    );
  });
});

describe('what the simulation already knew and published to nobody', () => {
  it('counts the wasted journeys, as route failures and not as an exhausted candidate walk', () => {
    const withDoor = prison(true).runtime.prisoners.actionSystem.getMetrics();
    const noDoor = prison(false).runtime.prisoners.actionSystem.getMetrics();

    expect(withDoor).toMatchObject({ unmetDemandCycles: 0, routeFailures: 0 });
    // 162 when this landed. Asserted as "the same number, and more than none"
    // rather than as 162: the equality is the finding -- every unmet cycle in
    // this prison is a route that could not be built, which is the prisoner
    // selecting the shower room, being sent to it and never arriving -- and the
    // absolute figure is a function of the reconsideration cadence.
    expect(noDoor.routeFailures).toBeGreaterThan(0);
    expect(noDoor.unmetDemandCycles).toBe(noDoor.routeFailures);
  });
});
