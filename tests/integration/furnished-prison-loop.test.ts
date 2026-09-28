import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { projectRoomDetail } from '../../src/simulation/presentation/room-projection';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * [ADR 0028](../../docs/adr/0028-object-placement-and-derived-room-capacity.md)
 * phase 4: **the prison stops being a cell and a toilet.**
 *
 * Phases 1 and 2 made `room.cell` and `room.solitary-cell` finishable and left
 * the other fifteen room types unsatisfiable, because eighteen of the twenty
 * objects in `src/content/object-catalog.ts` had no buildable that placed them.
 * `tests/integration/furnished-cell-loop.test.ts` recorded the consequence in
 * its own words -- "hygiene has no route at all until phase 4 places a shower
 * head" -- and this file is that sentence being falsified on the same real
 * path: real commands, the real kernel, the real construction system, the real
 * navigation, the real action system.
 *
 * ## The two rooms this measures, and why those two
 *
 * ADR 0028 phase 4 names them: "`action.shower` (the one need that genuinely
 * requires a placed capability), `action.eat-meal` in a canteen". They are the
 * two of the five `room-catalog-id` actions whose rooms a player can now
 * furnish, and between them they exercise both halves of the derivation --
 * `room.shower-room` is a room whose capability *is* the need, and
 * `room.canteen` is the room where the #326 amendment's capability-scoped
 * ceiling is the difference between six diners and fourteen.
 *
 * ## What is deliberately not asserted here
 *
 * That every room type is satisfiable. That is a property of two content
 * catalogues rather than of a running prison, so it is computed from them in
 * `tests/foundation/object-buildable-cost-contract.test.ts` and not
 * demonstrated seventeen times over by zoning seventeen rooms. This file's job
 * is the part a content assertion cannot reach: that the objects really get
 * built, really derive the capacity, really make the gate answer, and that a
 * prisoner really walks to the room and uses it.
 *
 * ## Every expected value below is a literal
 *
 * Measured by running the fixture and reading the numbers off, never computed
 * by the code under test (#375 records three instances of that found in one
 * day). Where a figure is arithmetic a reviewer can check -- 2*3 for the
 * dining ceiling, 15 planks and 3 bricks for the bill -- the arithmetic is
 * written in the comment beside it.
 */

const SEED = 0x0b1ec7;

/** `room.cell`'s authored minimum, and the same rectangle phases 1 and 2 measure. */
const CELL_RECT = { x: 4, y: 6, width: 2, height: 3 } as const;
/** `room.shower-room`'s authored 3x3 minimum, clear of the cell. */
const SHOWER_RECT = { x: 2, y: 12, width: 3, height: 3 } as const;
/** `room.canteen`'s authored 6x6 minimum, clear of both. */
const CANTEEN_RECT = { x: 8, y: 8, width: 6, height: 6 } as const;

const CELL_ID = 'room.cell:4:6';
const SHOWER_ID = 'room.shower-room:2:12';
const CANTEEN_ID = 'room.canteen:8:8';

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 10_000, priorIncidents: 0 } as const;

/**
 * Every object this prison is furnished with, as the ten `PlaceObject` commands
 * a player would send, in the order they are sent.
 *
 * The anchor tiles are chosen so no footprint overlaps another: the two `3x2`
 * dining tables take the canteen's top two rows whole (x 8..13, y 8..9) and the
 * four `2x1` benches take the two rows under them. A single overlap would be a
 * `place-object.tile-occupied` refusal rather than a wrong number, which is why
 * the refusal count is asserted at zero before anything else is read.
 */
const FURNISHING = [
  { orderId: 'o-bed', definitionId: 'bed-wooden', x: 4, y: 6 },
  { orderId: 'o-toilet', definitionId: 'toilet-brick', x: 5, y: 6 },
  { orderId: 'o-sh1', definitionId: 'shower-head-brick', x: 2, y: 12 },
  { orderId: 'o-sh2', definitionId: 'shower-head-brick', x: 3, y: 12 },
  { orderId: 'o-dt1', definitionId: 'dining-table-wooden', x: 8, y: 8 },
  { orderId: 'o-dt2', definitionId: 'dining-table-wooden', x: 11, y: 8 },
  { orderId: 'o-b1', definitionId: 'bench-wooden', x: 8, y: 10 },
  { orderId: 'o-b2', definitionId: 'bench-wooden', x: 10, y: 10 },
  { orderId: 'o-b3', definitionId: 'bench-wooden', x: 8, y: 11 },
  { orderId: 'o-b4', definitionId: 'bench-wooden', x: 10, y: 11 },
] as const;

/**
 * The bill, and it is the phase's cost rule doing the arithmetic rather than a
 * number chosen here.
 *
 * `materialsRequired[0].quantity = footprint.width`, so: one plank for the bed
 * (1 wide), one brick for the toilet, one brick each for two shower heads,
 * three planks each for two `3x2` dining tables, and two planks each for four
 * `2x1` benches. 1 + 6 + 8 = 15 planks and 1 + 2 = 3 bricks.
 */
const PLANKS = 15;
const BRICKS = 3;
/** 15 planks at 65 and 3 bricks at 40, from `src/content/procurement-catalog.ts`. */
const FURNISHING_COST = PLANKS * 65 + BRICKS * 40;

/** Every order is complete by tick 800; the timeline is asserted rather than assumed below. */
const BUILT_BY = 800;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** The three rooms zoned and the materials bought, but nothing ordered: the "before" reading. */
function zonedPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: PLANKS }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: BRICKS }));
  wallRoomPerimeter(runtime.world, CELL_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...CELL_RECT }));
  wallRoomPerimeter(runtime.world, SHOWER_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER_RECT }));
  wallRoomPerimeter(runtime.world, CANTEEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN_RECT }));
  return runtime;
}

/** The same prison with all ten placements ordered. */
function furnishedPrison(): SimulationRuntime {
  return prisonFurnishedWith(FURNISHING);
}

/**
 * The control for the hygiene measurement: the same prison with the two shower
 * heads left unordered, and **everything else identical** -- the same three
 * zoned rooms, the same eight other placements, the same 15 planks and 3 bricks
 * bought and paid for. Two of those bricks simply stay in the container.
 *
 * That is what makes the comparison mean something: the money spent, the
 * delivery timings and the procurement stream are the same in both prisons, so
 * a difference in a need level can only have come from the two shower heads.
 * It is the shape `furnished-cell-loop.test.ts` uses for the same reason.
 */
function prisonWithoutShowerHeads(): SimulationRuntime {
  return prisonFurnishedWith(FURNISHING.filter((placement) => !placement.orderId.startsWith('o-sh')));
}

/**
 * The control for the meal measurement, on exactly the shape above: the same
 * prison with the **two dining tables** left unordered and everything else
 * identical -- the same three zoned rooms, the same eight other placements, the
 * same 15 planks and 3 bricks bought and paid for.
 *
 * `object.dining-table` is the only object in the catalogue carrying
 * `'dining'`, so a canteen without one derives a `'dining'` ceiling of zero and
 * `action.eat-meal` has nowhere to resolve -- while the benches still stand, so
 * the room is not simply empty. That is what turns `action.eat-in-cell`'s
 * absence below from a fact about the catalogue into a fact about *this*
 * prison: see [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md).
 */
function prisonWithoutDiningTables(): SimulationRuntime {
  return prisonFurnishedWith(FURNISHING.filter((placement) => !placement.orderId.startsWith('o-dt')));
}

function prisonFurnishedWith(placements: readonly (typeof FURNISHING)[number][]): SimulationRuntime {
  const runtime = zonedPrison();
  for (const placement of placements) {
    submit(runtime, placement.orderId, packCommand({ type: 'PlaceObject', ...placement }));
  }
  return runtime;
}

/**
 * The catalogue requirement statuses a room reads, keyed by object id.
 *
 * `placedObjects` is supplied, which is what `worker/projection-catalog.ts`
 * does and what makes the authored `minQuantity` count (#528). Without it the
 * projection falls back to the room's capability list and a canteen holding one
 * dining table reads finished.
 */
function objectRequirementStatuses(runtime: SimulationRuntime, instanceId: string): Record<string, string> {
  const detail = projectRoomDetail(runtime.prisoners, instanceId, { placedObjects: runtime.placedObjects });
  const statuses: Record<string, string> = {};
  for (const requirement of detail?.requirements ?? []) {
    if (requirement.objectId === undefined) continue;
    statuses[requirement.objectId] = requirement.status;
  }
  return statuses;
}

describe('a shower room and a canteen become satisfiable for the first time', () => {
  it('reads every object requirement missing while the three rooms stand empty', () => {
    const runtime = zonedPrison();

    // The state phases 1 to 3 shipped, for these two rooms: zoned, legal, and
    // permanently unfinishable, because no buildable placed a shower head, a
    // dining table or a bench.
    expect(objectRequirementStatuses(runtime, SHOWER_ID)).toEqual({
      'object.shower-head': 'missing-capability',
    });
    expect(objectRequirementStatuses(runtime, CANTEEN_ID)).toEqual({
      'object.dining-table': 'missing-capability',
      'object.bench': 'missing-capability',
    });
    // And the two gates answer nothing, which is what made `action.shower` and
    // `action.eat-meal` unreachable in every shipped session before this phase.
    expect(runtime.prisoners.roomInstances.findAvailableForUse('room.shower-room', 'hygiene')).toBeUndefined();
    expect(runtime.prisoners.roomInstances.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
  });

  it('builds all ten objects and reads every requirement satisfied', () => {
    const runtime = furnishedPrison();
    expect(runtime.refusals.count, 'no placement may be refused: an overlap would be a refusal, not a wrong number').toBe(0);

    stepTo(runtime, BUILT_BY);

    expect(runtime.placedObjects.size).toBe(10);
    expect(runtime.construction.allOrders().filter((order) => order.state !== 'completed')).toEqual([]);

    expect(objectRequirementStatuses(runtime, CELL_ID)).toEqual({
      'object.bed': 'satisfied-by-capability',
      'object.toilet': 'satisfied-by-capability',
    });
    expect(objectRequirementStatuses(runtime, SHOWER_ID)).toEqual({
      'object.shower-head': 'satisfied-by-capability',
    });
    expect(objectRequirementStatuses(runtime, CANTEEN_ID)).toEqual({
      'object.dining-table': 'satisfied-by-capability',
      'object.bench': 'satisfied-by-capability',
    });

    // `enclosed` and `minimum-size` are evaluated at zoning time and not
    // recorded on the instance, so they still read `'not-evaluated'`
    // (`docs/HUD_PROJECTIONS.md` gap 13).
    //
    // **The sentence that stood here is now false and is kept rather than
    // deleted:** *"The canteen's two object requirements are both met and
    // neither is counted against `minQuantity`, which the same gap owns."* The
    // second half was true when it was written and stopped being true at #528 --
    // both requirements are now counted, and they read met because `FURNISHING`
    // builds exactly the authored two dining tables and four benches. The
    // room-short-of-its-quantities case is the test below.
    expect(projectRoomDetail(runtime.prisoners, CANTEEN_ID, { placedObjects: runtime.placedObjects })?.requirementSummary).toEqual({
      total: 4,
      objectRequirements: 2,
      satisfiedByCapability: 2,
      missingCapability: 0,
      notEvaluated: 2,
    });
  });

  /**
   * Issue #528, on this same real path: the canteen furnished with **one**
   * dining table and **one** bench, against `room.canteen`'s authored two and
   * four (`src/content/room-catalog.ts`).
   *
   * Before the fix both requirements read `'satisfied-by-capability'` and the
   * panel dropped its "Not ready" block, while the room's footprint-derived
   * `'dining'` ceiling seated three diners rather than six -- so the room the
   * game called finished was half a canteen.
   *
   * The ceiling is asserted alongside the verdict deliberately. The two come
   * from different rules (`deriveRoomCapacity` sums footprint widths;
   * `requirementStatus` counts objects) and the defect was that they disagreed
   * about whether the room was done, so a test that read only one of them could
   * not see it.
   */
  it('reads a canteen holding one table and one bench as unfinished, and seats three', () => {
    const runtime = prisonFurnishedWith(
      FURNISHING.filter((placement) => !['o-dt2', 'o-b2', 'o-b3', 'o-b4'].includes(placement.orderId)),
    );
    expect(runtime.refusals.count).toBe(0);
    stepTo(runtime, BUILT_BY);

    // Six of the ten objects: the cell's bed and toilet and the shower room's
    // two heads are furnished exactly as above, and only the canteen is short --
    // one of its two tables and one of its four benches.
    expect(runtime.placedObjects.size).toBe(6);

    expect(objectRequirementStatuses(runtime, CANTEEN_ID)).toEqual({
      'object.dining-table': 'missing-capability',
      'object.bench': 'missing-capability',
    });
    // The cell is untouched by the change: one bed and one toilet against an
    // authored one of each, so counting and the old capability test agree.
    expect(objectRequirementStatuses(runtime, CELL_ID)).toEqual({
      'object.bed': 'satisfied-by-capability',
      'object.toilet': 'satisfied-by-capability',
    });

    // One `3x2` dining table, so 1*3 -- half the 2*3 the finished canteen reads
    // above, which is the player-visible cost of calling this room done.
    expect(runtime.prisoners.roomInstances.concurrentUseCapacityFor(
      runtime.prisoners.roomInstances.getById(CANTEEN_ID)!,
      'dining',
    )).toBe(3);
  });

  it('charges the footprint-derived bill and nothing else', () => {
    const runtime = furnishedPrison();
    stepTo(runtime, BUILT_BY);

    // 25,000 less 15 planks at 65 and 3 bricks at 40. The point is not the
    // total but that the *rule* is what produced it: every quantity in
    // `FURNISHING` came off a `footprint.width`, so this figure moves only if a
    // footprint or a material price moves.
    expect(FURNISHING_COST).toBe(1_095);
    expect(runtime.treasury.balanceMinorUnits).toBe(100_000 - 1_095);
  });
});

describe('the capacity the three rooms derive, off the real command path', () => {
  it('derives residency from sleep surfaces and use from the capability asked for', () => {
    const runtime = furnishedPrison();
    stepTo(runtime, BUILT_BY);
    const rooms = runtime.prisoners.roomInstances;

    // The cell is phase 2's reading, unchanged by this phase, and is here as
    // the control: adding two rooms full of furniture must not move it.
    expect(rooms.getById(CELL_ID)).toMatchObject({
      residentCapacity: 1,
      concurrentUseCapacity: 2,
      concurrentUseCapacityByCapability: [['sanitation', 1], ['sleep-surface', 1]],
      objectCapabilities: ['sanitation', 'sleep-surface'],
    });

    // Two 1x1 shower heads, each carrying `'hygiene'` and `'shower'`, so both
    // ceilings are 2 and residency is 0 -- nothing here is a sleep surface, so
    // nobody lives in the shower room.
    expect(rooms.getById(SHOWER_ID)).toMatchObject({
      residentCapacity: 0,
      concurrentUseCapacity: 2,
      concurrentUseCapacityByCapability: [['hygiene', 2], ['shower', 2]],
      objectCapabilities: ['hygiene', 'shower'],
    });

    /*
     * **The canteen, and the whole of issue #326 in four numbers.**
     *
     * Two 3x2 dining tables and four 2x1 benches. The total is
     * `2*3 + 4*2 = 14`, which is ADR 0028 decision 2's worked example and is
     * **nothing's ceiling**. The ceilings are per capability: `'dining'` is
     * `2*3 = 6` because only the tables declare it, and `'seating'` and
     * `'recreation'` are `4*2 = 8` because only the benches declare those.
     *
     * The #326 amendment states this arithmetic and predicted it would become
     * observable in phase 4; these are the same numbers arrived at from ten
     * construction orders instead of from a hand-built object list, which is
     * what `tests/unit/objects-room-capacity.test.ts` already pins.
     */
    expect(rooms.getById(CANTEEN_ID)).toMatchObject({
      residentCapacity: 0,
      concurrentUseCapacity: 14,
      concurrentUseCapacityByCapability: [['dining', 6], ['recreation', 8], ['seating', 8]],
      // A union has no order, so one is chosen: ascending by code unit, never
      // `localeCompare` (`docs/DETERMINISM.md`). Insertion order would have
      // been `['dining', 'seating', 'recreation']` -- the tables were ordered
      // and finished before the benches.
      objectCapabilities: ['dining', 'recreation', 'seating'],
    });
  });

  it('seats six diners in a canteen holding fourteen tiles of furniture', () => {
    const runtime = furnishedPrison();
    stepTo(runtime, BUILT_BY);
    const rooms = runtime.prisoners.roomInstances;

    /*
     * The defect #326 was filed about, asked of a canteen the player built:
     * "nineteen diners sat in a canteen whose tables and benches seat
     * fourteen". The ceiling is now the capability's, so the answer is six --
     * the number of places at the two dining tables -- and the fourteen that
     * `concurrentUseCapacity` still reports bounds nothing.
     */
    let admitted = 0;
    for (let entity = 1; entity <= 14; entity += 1) {
      if (rooms.claimUse(CANTEEN_ID, entity as never, 'dining')) admitted += 1;
    }
    expect(admitted, 'two dining tables, three places each').toBe(6);
    expect(rooms.getById(CANTEEN_ID)?.concurrentUseCapacity, 'the total is untouched and is not what refused the seventh').toBe(14);

    // Not a vacuous refusal: the room is full of `'dining'` and not of
    // anything else, so the benches are still free to sit on. A single scalar
    // could not answer these two questions differently, which is why there are
    // two.
    expect(rooms.claimUse(CANTEEN_ID, 100 as never, 'dining')).toBe(false);
    expect(rooms.claimUse(CANTEEN_ID, 100 as never, 'recreation')).toBe(true);
  });
});

describe('the prisoner uses the rooms, which is what the phase is for', () => {
  /**
   * One prisoner, admitted once the prison is furnished, watched for the rest
   * of a long session.
   *
   * Sampled every tick rather than every twentieth, because a use claim is
   * held only for the duration of a performed action and a coarse sample can
   * miss it entirely -- which is how the first draft of this measurement
   * concluded, wrongly, that no claim was ever taken.
   */
  function watchedPrison(build: () => SimulationRuntime = furnishedPrison): {
    readonly runtime: SimulationRuntime;
    readonly performingTicks: Record<string, number>;
    readonly maxUseClaims: number;
    readonly finalHygiene: number;
    readonly hygieneEverRose: boolean;
    readonly finalHunger: number;
    readonly hungerEverRose: boolean;
  } {
    const runtime = build();
    stepTo(runtime, BUILT_BY);
    submit(runtime, 'admit', packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));

    const store = runtime.prisoners.entityStore;
    const performingTicks: Record<string, number> = {};
    let maxUseClaims = 0;
    let previousHygiene = Number.POSITIVE_INFINITY;
    let hygieneEverRose = false;
    // Hunger is read on the same terms as hygiene and for the same reason: a
    // need is a reservoir, so a level that goes *up* is a performed meal and a
    // decay curve can never produce one (ADR 0041).
    let previousHunger = Number.POSITIVE_INFINITY;
    let hungerEverRose = false;

    for (let tick = runtime.kernel.tick + 1; tick <= 9_000; tick += 1) {
      stepTo(runtime, tick);
      const index = store.getIndex(store.getIdByIndex(0));
      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      // `2` is `performing` in `ACTION_PHASES`; the phase names are not
      // exported, and what matters here is only that the action is being done
      // rather than travelled to.
      if (runtime.prisoners.currentAction.phase[index] === 2 && actionIndex >= 0) {
        const id = DEFAULT_ACTIONS[actionIndex]!.id;
        performingTicks[id] = (performingTicks[id] ?? 0) + 1;
      }
      maxUseClaims = Math.max(maxUseClaims, runtime.prisoners.roomInstances.totalUseClaims);
      const hygiene = runtime.prisoners.needs.levels.hygiene[index]! / NEED_SCALE;
      // A **rise**, sampled every tick, and that is the whole measurement. A
      // need is a reservoir here rather than a pressure: it drains on its own
      // (`NEED_DECAY_PER_TICK`) and only a performed action refills it.
      // `action.shower` is the only entry in `DEFAULT_ACTIONS` whose
      // `needEffectsPerTick` touches hygiene, so a hygiene level that goes *up*
      // is proof a shower happened, and a decay curve can never produce one.
      if (hygiene > previousHygiene) hygieneEverRose = true;
      previousHygiene = hygiene;
      const hunger = runtime.prisoners.needs.levels.hunger[index]! / NEED_SCALE;
      if (hunger > previousHunger) hungerEverRose = true;
      previousHunger = hunger;
    }

    const index = store.getIndex(store.getIdByIndex(0));
    return {
      runtime,
      performingTicks,
      maxUseClaims,
      finalHygiene: runtime.prisoners.needs.levels.hygiene[index]! / NEED_SCALE,
      hygieneEverRose,
      finalHunger: runtime.prisoners.needs.levels.hunger[index]! / NEED_SCALE,
      hungerEverRose,
    };
  }

  it('showers and eats a meal, the two actions no shipped session could reach', () => {
    const { runtime, performingTicks } = watchedPrison();

    expect(runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: 1, failedCount: 0 });

    /*
     * **The headline of ADR 0028 phase 4, measured.** Four actions are
     * performed and two of them resolve by `room-catalog-id` -- so they went
     * through `findAvailableForUse`, a real route request and a real use claim,
     * none of which could succeed for these two rooms before this change.
     *
     * `action.shower` is the one the ADR singles out as "the one need that
     * genuinely requires a placed capability", and 80 ticks of it is 80 ticks
     * more than every session shipped before this one.
     *
     * The counts are exact because they are deterministic: one seed, one
     * command order, no RNG in placement. They are a measurement of the loop
     * and they are supposed to move if the loop changes.
     *
     * **They moved once, and this is that entry.** This block read
     * `{sleep 1800, eat-meal 560, use-toilet 120, shower 80}` until
     * [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
     * decision 1 let a prisoner fall back to the next-best legal candidate when
     * the best one cannot resolve a target. Three of the eight actions in
     * `DEFAULT_ACTIONS` target rooms this prison has not zoned -- the yard, the
     * common room and the classroom -- and the two recreation blocks of the
     * general-population day allow nothing else. Before the fallback the
     * prisoner selected one of those, failed to resolve it and stood idle for
     * the whole block; now they shower or use the toilet instead, which is
     * where `shower` 80 -> 240 and `use-toilet` 120 -> 280 come from. The
     * showers run past the boundary into the meal block that follows, which
     * costs two meal blocks out of fourteen: `eat-meal` 560 -> 480. Sleep is
     * untouched, because the two sleep blocks allow nothing but `action.sleep`
     * and it always resolved.
     *
     * **They moved a second time on
     * [ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md),
     * and the second move is the two blocks the first one could not reach.**
     * ADR 0041's fallback rescued the *recreation* blocks here because they
     * also allow `hygiene`; the two `work`/`education` blocks allow neither,
     * and this prison has no classroom and no laundry, so 1,000 ticks a day
     * still resolved nothing at all. `'free-association'` is now legal in
     * them, which is the whole of the 3,160. `eat-meal` 480 -> 360 is the same
     * boundary effect the first move recorded in the other direction: an
     * association begun in `[500,1000)` or `[1300,1800)` runs one 20-tick
     * cadence past the block, so the meal block after it starts one cycle
     * late. `action.laundry-work` is absent, and deliberately: it names
     * `room.laundry`, and this prison has a cell, a shower room and a canteen.
     */
    /*
     * **Re-measured for [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md).**
     * A prisoner now walks the tiles between one room and the next instead of
     * being written onto the destination anchor in the tick their route
     * resolved, so every count here loses the ticks spent in transit. The
     * counts this replaces are named beside each entry; what the assertion is
     * *for* -- that the room-gated actions were reached at all -- is the
     * property loop below it and is unchanged.
     */
    expect(performingTicks).toEqual({
      'action.sleep': 1_224, // 1,800
      'action.eat-meal': 356, // 360
      'action.use-toilet': 228, // 280
      'action.shower': 288, // 240
      'action.free-association': 2_976, // 3,160
    });
    // Stated as a property as well as a count, so the intent survives a
    // re-baseline: the two room-gated actions really were reached.
    for (const id of ['action.shower', 'action.eat-meal'] as const) {
      const action = DEFAULT_ACTIONS.find((candidate) => candidate.id === id)!;
      expect(action.target.kind, `${id} must be the room-gated kind for this to mean anything`).toBe('room-catalog-id');
      expect(performingTicks[id] ?? 0, `${id} was never performed`).toBeGreaterThan(0);
    }
    /*
     * **`action.eat-in-cell` is still not in the list, and the sentence that
     * used to stand here was wrong about why.**
     *
     * It read: *"that is the interesting absence: with a canteen standing, the
     * prisoner walks to it. Phase 2 measured hunger at 25.0 of 255 on
     * `action.eat-in-cell`'s 3 a tick; `action.eat-meal` gains 4."* The second
     * half attributed a measurement to a mechanism that had **never executed**,
     * here or anywhere: `furnished-cell-loop.test.ts`'s 25.0 was 4,600 ticks of
     * pure decay from admission, and `action.eat-in-cell` had no performing
     * ticks in any configuration this repository had ever run. What this line
     * pinned was a defect observed and mistaken for behaviour --
     * [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
     * records the four converging readings, and
     * `tests/integration/cell-only-meal-fallback.test.ts` records the run that
     * settled it.
     *
     * So the absence is inverted rather than deleted: it stays, but it is no
     * longer allowed to stand on its own. The claim it makes now is a
     * **preference** -- the canteen wins whenever it resolves -- and a
     * preference is only meaningful against a prison where the preference has
     * nowhere to go, which is the control asserted in the test below. Before
     * ADR 0041 this same `toBeUndefined()` was true in *every* prison ever
     * built, including one with no canteen at all, and no assertion in this
     * repository could tell the two cases apart.
     */
    expect(performingTicks['action.eat-in-cell']).toBeUndefined();
    expect(performingTicks['action.eat-meal'] ?? 0, 'the canteen meal is what it ate instead').toBeGreaterThan(0);
  });

  it('eats in its cell when the canteen has no table, which is what makes the absence above a preference', () => {
    /*
     * The same prison, two dining tables lighter, and **everything else
     * identical** -- the same three zoned rooms, the same eight other
     * placements, the same bill. `object.dining-table` is the only object
     * carrying `'dining'`, so the canteen still stands, still holds its four
     * benches and still answers `'recreation'` -- but `action.eat-meal` has no
     * seat to resolve and the prisoner falls back to `action.eat-in-cell`
     * inside the same reconsideration cycle (ADR 0041 decision 1).
     *
     * This is `action.eat-in-cell`'s first appearance in this file, and the
     * first in any prison this repository runs.
     */
    const control = watchedPrison(prisonWithoutDiningTables);

    expect(control.runtime.prisoners.roomInstances.findAvailableForUse('room.canteen', 'dining')).toBeUndefined();
    // 400 / 340, not 560 / 300, plus the 3,240 ticks of association: the same
    // ADR 0054 change recorded on the run above, measured on the prison whose
    // canteen has no table.
    /*
     * **Re-measured for [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md).**
     * A prisoner now walks the tiles between one room and the next instead of
     * being written onto the destination anchor in the tick their route
     * resolved, so every count here loses the ticks spent in transit. The
     * counts this replaces are named beside each entry; what the assertion is
     * *for* -- that the room-gated actions were reached at all -- is the
     * property loop below it and is unchanged.
     */
    expect(control.performingTicks).toEqual({
      'action.sleep': 1_224, // 1,800
      'action.eat-in-cell': 560, // 400
      'action.use-toilet': 264, // 340
      'action.shower': 288, // 240
      'action.free-association': 3_316, // 3,240
    });

    // Stated as the player-visible consequence as well as a count: a hunger
    // level that rises is a meal that happened, and no decay curve can produce
    // one. Before ADR 0041 this prison's prisoner ate nothing at all.
    expect(control.hungerEverRose, 'a hunger level that rises is a meal that happened').toBe(true);
    // 231.5, unmoved by ADR 0059 at the shipped walking speed; the paragraph below -- which says the two
    // prisons end *level* at 231.5 -- is corrected there rather than here.
    expect(control.finalHunger).toBe(231.5);

    /*
     * And the cost of losing the canteen is a **worse meal**, not starvation.
     *
     * > **Re-checked for ADR 0059 at the shipped walking speed: they are level
     * > again, both at 231.5, which is where the paragraph below leaves them.**
     * > They separated at an earlier, slower speed -- 233.5 with tables against
     * > 229.5 without -- because a walk costs the cell-meal prison more than
     * > the canteen prison, and the separation closed as the walk got cheaper.
     * > The equality is therefore a **coincidence at this speed** rather than a
     * > property, exactly as the paragraph below already says of it.** The paragraph below says they *"now end level
     * > at 231.5"* and that the end level is therefore no longer what
     * > distinguishes the two prisons. That held while an arrival was
     * > instantaneous. A walk costs the cell-meal prison more than the canteen
     * > prison, because `action.eat-in-cell` is served in the prisoner's own
     * > cell but the prisoner is not always standing in it, and the canteen
     * > prison's own losses are smaller -- so the end levels separate again and
     * > the canteen prison is the better-fed one, which is the direction the
     * > catalogue's `hunger` rates predict. The paragraph is kept rather than
     * > rewritten because its *reasoning* about where meal ticks went is still
     * > the reasoning, and because a comment that silently adopts the number it
     * > was written to explain stops being readable.
     *
     * **The two now end level at 231.5, and until ADR 0054 they ended one
     * apart** (230.5 against 231.5). Nothing about either meal changed: the
     * canteen prison lost meal ticks to the association that runs past a block
     * boundary (`eat-meal` 480 -> 360) and the cell prison lost fewer
     * (`eat-in-cell` 560 -> 400), and 360 sittings at 4 a tick and 400 at 3
     * land on the same level at this horizon. **The end level is therefore no
     * longer the thing that distinguishes the two prisons, and this comment
     * says so rather than leaving a reader to infer a difference from an
     * equality.** What does distinguish them is next door: with tables
     * standing, `action.eat-in-cell` does not appear in the run at all.
     */
    const withTables = watchedPrison();
    expect(withTables.finalHunger).toBe(231.5);
    expect(control.finalHunger).toBeGreaterThan(withTables.finalHunger - 10);
  });

  it('takes a real concurrent-use claim, which no shipped session could either', () => {
    const { runtime, maxUseClaims } = watchedPrison();

    // ADR 0029 shipped the claim and said outright that nothing a player could
    // build would exercise it: "it becomes observable in phase 4, when those
    // objects become placeable". This is that becoming true. One prisoner, so
    // one claim at a time.
    expect(maxUseClaims).toBe(1);
    // And it is released: a claim held past its action would leave the room
    // permanently short of a seat.
    expect(runtime.prisoners.roomInstances.totalUseClaims).toBe(0);
    expect(runtime.prisoners.actionSystem.getMetrics()).toMatchObject({ routeFailures: 0 });
  });

  it('gives hygiene a route, which phase 2 recorded as having none', () => {
    /*
     * `tests/integration/furnished-cell-loop.test.ts` measured a bed-and-toilet
     * prison and recorded "hygiene has no route at all until phase 4 places a
     * shower head". `action.shower` is the only action in `DEFAULT_ACTIONS`
     * whose `needEffectsPerTick` touches hygiene, it resolves only in
     * `room.shower-room`, and that room could not be finished by anybody.
     *
     * This is that sentence falsified, against a control that differs by two
     * placements and nothing else.
     *
     * A need is a **reservoir** rather than a pressure, so hygiene drains on
     * its own and only a performed action refills it. So the measurement is a
     * hygiene level that goes **up**, which no decay curve can produce, and the
     * two prisons separate cleanly:
     *
     *   - no shower head: hygiene falls monotonically to **91.0** of 255 and
     *     never once rises across 8,200 sampled ticks;
     *   - two shower heads: it rises, and ends at **216.0**.
     *
     * What is deliberately *not* claimed is a clean prisoner. 216.0 of 255 is a
     * prisoner who showers sometimes, because one shower room on a regime is
     * what was built; asserting more would be the invented consequence this
     * repository spends the most effort on.
     *
     * **This figure was 162.4 until ADR 0041.** The shower did not get better;
     * the prisoner stopped standing idle through the two recreation blocks
     * whose actions this prison cannot resolve, and both of those blocks also
     * allow `hygiene`. Shower time went from 80 ticks to 240 over the same
     * 8,200. The control is untouched at 91.0, which is the right direction for
     * it to be untouched in: a prison with no shower head has no hygiene action
     * to fall back *to*, so ADR 0041 cannot move it and does not.
     */
    const withShower = watchedPrison();
    const control = watchedPrison(prisonWithoutShowerHeads);

    // The control prison cannot shower at all: its shower room is zoned, its
    // requirement reads missing, and the gate answers nothing -- which is the
    // exact state every shipped session was in before this phase.
    expect(control.performingTicks['action.shower']).toBeUndefined();
    expect(control.runtime.prisoners.roomInstances.findAvailableForUse('room.shower-room', 'hygiene')).toBeUndefined();
    expect(objectRequirementStatuses(control.runtime, SHOWER_ID)).toEqual({
      'object.shower-head': 'missing-capability',
    });
    expect(control.hygieneEverRose, 'with no shower head, hygiene can only drain').toBe(false);
    expect(control.finalHygiene).toBe(91);

    // With two shower heads it is refilled, and ends 124.6 higher.
    //
    // 215.6, not the 216 this recorded before ADR 0054, and the 0.4 is exactly
    // 20 ticks of `NEED_DECAY_PER_TICK.hygiene` -- one `ActionSystem`
    // reconsideration cadence, the delay an association running past a block
    // boundary puts in front of the day's last shower. The control is
    // unchanged at 91, because a prison with no shower head has nothing whose
    // timing could shift.
    expect(withShower.hygieneEverRose, 'a hygiene level that rises is a shower that happened').toBe(true);
    // 218.8, not the 215.6 the comment above records: ADR 0059 makes the walk
    // to the shower room cost ticks, so fewer of the window's ticks are spent
    // showering. The comparison against the control on the next line -- which
    // is what this test is for -- is unchanged.
    expect(withShower.finalHygiene).toBe(218.8);
    expect(withShower.finalHygiene).toBeGreaterThan(control.finalHygiene);

    // Both prisons bought and paid for the same 15 planks and 3 bricks -- the
    // control simply leaves two bricks in the container -- so the difference
    // above cannot have come from the money, the delivery timings or the
    // procurement stream.
    expect(control.runtime.treasury.balanceMinorUnits).toBe(withShower.runtime.treasury.balanceMinorUnits);
    expect(control.runtime.placedObjects.size).toBe(8);
    expect(withShower.runtime.placedObjects.size).toBe(10);
  });
});
