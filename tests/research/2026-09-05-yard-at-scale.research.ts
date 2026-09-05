import { describe, expect, it } from 'vitest';

import { STATE_INCOME_UNMET_NEED_LEVEL, isNeedUnmetForStateIncome, stateIncomeForCompletedDay, unmetNeedCount } from '../../src/simulation/economy/income';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES } from '../../src/simulation/prisoners/components';
import { NEED_IDS, NEED_MAX, NEED_SCALE, type NeedId } from '../../src/simulation/prisoners/needs';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { TILES_PER_OPEN_GROUND_PLACE } from '../../src/simulation/prisoners/room-instance-registry';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **Issue #997: where the yard incentive breaks, measured across population.**
 *
 * NOT A GATE, and deliberately not collected by `pnpm test`:
 * `vitest.config.ts` takes `tests/**​/*.test.ts` and this file is
 * `*.research.ts`, collected only by `tests/research/vitest.research.config.ts`.
 * Its deliverable is the table it prints. The only assertions in it are that
 * the prison it built is the prison it says it built -- a refused purchase, a
 * refused zoning or a short intake would make every figure a measurement of a
 * different prison.
 *
 * ## What is being measured, and against what claim
 *
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`'s docblock
 * (`src/simulation/economy/income.ts`) promises:
 *
 * > **The cheapest repair pays for itself in days.** `room.yard` requires no
 * > object at all ... so zoning 8x8 of owned ground turns `recreation` from
 * > unmet to served and returns 40 a prisoner a day for nothing.
 *
 * `docs/research/2026-09-04-what-pressure-there-is-at-fifty.md` §6 measured
 * that true at four prisoners (`+480` against `+320`, exactly `4 x 40`) and
 * **exactly zero** at fifty, and named reachability as its strongest untested
 * candidate: the cell in both browser instruments *"is walled on four sides
 * with no doorway"*. This file separates the two candidates by building both
 * prisons -- one whose cell has a door and one whose cell has none -- and by
 * sweeping the population between them.
 *
 * ## The prison, and why it is the same prison at every population
 *
 * The issue asks for *"one yard, the rest of the prison identical, the same
 * seed, the same number of days"*. So the built prison never varies: one
 * 11x10 cell carrying **fifty** beds and one toilet, seven guards, and
 * whichever extra rooms an arm asks for. Only the number of `AdmitPrisoner`
 * commands changes. That is what makes two rows comparable -- the alternative,
 * scaling the beds with the population, would vary the prison and the
 * population together and could not attribute a difference to either.
 *
 * Fifty beds is a hundred tiles, because `object.bed` is `{ width: 1, height:
 * 2 }` and `residentCapacity` is the summed footprint *width* of the sleep
 * surfaces standing in the room (`deriveRoomCapacity`,
 * `src/simulation/objects/room-capacity.ts`). The eleventh column carries the
 * toilet and the walking room.
 *
 * ## Why the money is read from `stateIncomeForCompletedDay` and not from the treasury
 *
 * The treasury balance nets payroll, procurement and the insolvency ladder
 * against the grant. `stateIncomeForCompletedDay` is the exported production
 * function `StateIncomeSystem` itself credits from, and it is pure -- so
 * calling it at a day-boundary tick reads the same integer the treasury is
 * about to receive, with nothing else folded in. **Recovered income** in every
 * table below is that integer with the yard minus that integer without it, at
 * the same tick, on the same seed.
 */

/** Distinct from every other seed in the suite, so no shared fixture can make these figures true by accident. */
const SEED = 0x997;

/** `src/main.ts`'s `NEW_PRISON_ORIGIN_TILE`: where a hire stands and an admission arrives. */
const ARRIVAL = { x: 16, y: 16 } as const;

/** Far longer than any run here, so `PrisonerDischargeSystem` cannot release anybody mid-measurement. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

/**
 * Fifty beds and one toilet, in the one chunk a new prison owns (32x32 tiles).
 *
 * **It contains `ARRIVAL`, and that is deliberate rather than incidental.**
 * The browser instrument this file re-measures
 * (`tests/browser/playtest-2026-09-04-what-pressure-there-is-at-fifty.playtest.ts`)
 * walls its cell at columns 12..21, rows 11..20 -- the largest rectangle the
 * pointer can enclose without panning -- and `src/main.ts`'s
 * `NEW_PRISON_ORIGIN_TILE` is `(16, 16)`, *inside* it. So an admission in that
 * instrument arrives **in** the cell, and a cell with no door seals its
 * occupants in rather than out. A fixture whose cell did not contain the
 * arrival tile would seal them out instead, which is a different prison and
 * would answer a different question. This rectangle is that instrument's,
 * to the tile.
 */
const CELL = { x: 12, y: 11, width: 11, height: 10 } as const;

/**
 * The same cell widened to 21x10, for the one act that has to admit more than
 * fifty. Twenty columns of five beds is a hundred places; the twenty-first
 * column carries the toilet and the walking room, exactly as `CELL`'s
 * eleventh does. It contains `ARRIVAL` for `CELL`'s reason.
 */
const WIDE_CELL = { x: 6, y: 11, width: 21, height: 10 } as const;

/** The population every arm's cell is furnished for, whatever the population it admits. */
const BEDS = 50;
const WIDE_BEDS = 100;

/**
 * Extra 8x8 yards, on ground clear of both cells, for the arm that asks
 * whether more yards help. `YARDS[0]` doubles as the **far** placement in the
 * distance arm: 17 tiles of walking from the cell door, against 0 for
 * `yardAtTheDoor`.
 */
const YARDS = [
  { x: 1, y: 1, width: 8, height: 8 },
  { x: 12, y: 1, width: 8, height: 8 },
  { x: 21, y: 1, width: 8, height: 8 },
  { x: 21, y: 24, width: 8, height: 8 },
] as const;

/**
 * The same 8x8 yard, put **directly outside the cell's door**.
 *
 * `wallRoomPerimeter` puts the door in the rectangle's south boundary at its
 * left column, so the tile a prisoner steps onto when it leaves the cell is
 * `(CELL.x, CELL.y + CELL.height)` = `(12, 21)` -- the north-west corner of
 * this rectangle. Walking distance from the door to the yard is therefore
 * **zero tiles**, against 17 for `YARDS[0]`.
 *
 * It exists because the two browser instruments differ in exactly this way and
 * nobody had varied it deliberately: the four-prisoner one zoned its yard
 * *adjacent* to its cell, sharing the wall line, and the fifty-prisoner one
 * had to pan the camera and left three tiles of clear ground between them
 * (`docs/research/2026-09-04-what-pressure-there-is-at-fifty.md` §6,
 * candidate 3).
 */
function yardAtTheDoor(
  cell: { readonly x: number; readonly y: number; readonly height: number },
  width: number,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: cell.x, y: cell.y + cell.height, width, height: 8 };
}

/** `room.shower-room`'s authored 3x3 minimum and its two authored shower heads: 2 places for `'hygiene'`. */
const SHOWER = { x: 20, y: 21, width: 3, height: 3 } as const;
/** `room.canteen`'s authored 6x6 minimum, two dining tables and four benches: 6 places for `'dining'`. */
const CANTEEN = { x: 24, y: 21, width: 6, height: 6 } as const;

/**
 * `Math.max(scheduledGuardCount, ceil(50 / 8))` -- what the game asks for at
 * fifty (`resolveOccupancyScaledGuardCount`,
 * `src/simulation/security/sector-staffing.ts`). Fixed at the fifty figure for
 * every population, because the prison has to be the same prison.
 */
const GUARDS = 7;

/**
 * Long enough for the build queue to finish 109 objects at `+10` work per
 * scheduled tick, with margin (one crew, one order at a time --
 * `MOCK_CREW_WORKER_ID`, `src/simulation/construction/system.ts`) -- **and a day boundary**, which is the half
 * that matters to the arithmetic.
 *
 * `9_599` is `4 x DAY_LENGTH_TICKS - 1`, so `ADMIT_AT + days x DAY_LENGTH_TICKS`
 * is again a tick where `tick % DAY_LENGTH_TICKS === DAY_LENGTH_TICKS - 1` --
 * the tick `StateIncomeSystem` settles the day on. The need readout and the
 * last grant in the series are therefore taken at the *same* tick. Measured
 * with `ADMIT_AT = 4_000` first, where they were 1,601 ticks apart and the
 * printed histogram did not reconcile with the printed grant: `45 x 260 + 5 x
 * 220 = 12,800` against a reported `13,000`.
 */
const ADMIT_AT = 9_599;

type YardPlacement = 'far' | 'at-the-door';

interface PrisonOptions {
  readonly prisoners: number;
  readonly yards: number;
  /** Where the *first* yard goes. Yards 2..4 always come from `YARDS`; only the single-yard arms vary this. */
  readonly yardPlacement?: YardPlacement;
  /** `true` swaps `CELL` for `WIDE_CELL` and fifty beds for a hundred. Acts C and G use it. */
  readonly wideCell?: boolean;
  /** Width of the at-the-door yard, in tiles. `8` is `room.yard`'s authored minimum; wider is the player's "zone more ground". */
  readonly yardWidth?: number;
  readonly cellDoor?: boolean;
  readonly showerRoom?: boolean;
  readonly canteen?: boolean;
}

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/**
 * The whole prison, built through the commands a player has --
 * `PurchaseMaterials`, `ZoneRoom`, `PlaceObject`, `HireStaff`,
 * `AdmitPrisoner`. `wallRoomPerimeter` is the one shortcut and writes the
 * edges completed `wall-brick` and `door-wooden` orders would have written.
 */
function build(options: PrisonOptions): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cellDoor = options.cellDoor ?? true;
  const cell = options.wideCell === true ? WIDE_CELL : CELL;
  const beds = options.wideCell === true ? WIDE_BEDS : BEDS;

  // 1 plank a bed, 3 a dining table, 2 a bench; 1 brick a toilet and 1 a shower head.
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: beds + 14 }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 8 }));

  wallRoomPerimeter(runtime.world, cell, cellDoor ? { doors: runtime.navigation.doors } : {});
  submit(runtime, 'zone-cell', packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...cell }));

  // Fifty beds, five to a column: `object.bed` is 1 wide and 2 tall, so a
  // column of ten rows takes five. Ten columns, and the eleventh is the
  // toilet's and the walking room.
  let bed = 0;
  for (let column = cell.x; column < cell.x + cell.width - 1; column += 1) {
    for (let row = cell.y; row + 1 < cell.y + cell.height; row += 2) {
      submit(runtime, `bed-${String(bed)}`, packCommand({ type: 'PlaceObject', orderId: `bed-${String(bed)}`, definitionId: 'bed-wooden', x: column, y: row }));
      bed += 1;
    }
  }
  expect(bed, 'the cell must carry the bed count its geometry promises').toBe(beds);
  submit(runtime, 'wc', packCommand({ type: 'PlaceObject', orderId: 'wc', definitionId: 'toilet-brick', x: cell.x + cell.width - 1, y: cell.y }));

  // No walls: `room.yard` authors `outdoors`, which is the whole of what makes
  // it free -- 64 tiles of open ground, no materials and no money.
  for (let index = 0; index < options.yards; index += 1) {
    const rect = index === 0 && options.yardPlacement === 'at-the-door'
      ? yardAtTheDoor(cell, options.yardWidth ?? 8)
      : YARDS[index]!;
    submit(runtime, `zone-yard-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...rect }));
  }

  if (options.showerRoom === true) {
    wallRoomPerimeter(runtime.world, SHOWER, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
    submit(runtime, 'head-1', packCommand({ type: 'PlaceObject', orderId: 'head-1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
    submit(runtime, 'head-2', packCommand({ type: 'PlaceObject', orderId: 'head-2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
  }

  if (options.canteen === true) {
    wallRoomPerimeter(runtime.world, CANTEEN, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN }));
    submit(runtime, 'table-1', packCommand({ type: 'PlaceObject', orderId: 'table-1', definitionId: 'dining-table-wooden', x: CANTEEN.x, y: CANTEEN.y }));
    submit(runtime, 'table-2', packCommand({ type: 'PlaceObject', orderId: 'table-2', definitionId: 'dining-table-wooden', x: CANTEEN.x + 3, y: CANTEEN.y }));
    for (let index = 0; index < 4; index += 1) {
      submit(runtime, `bench-${String(index)}`, packCommand({
        type: 'PlaceObject', orderId: `bench-${String(index)}`, definitionId: 'bench-wooden',
        x: CANTEEN.x + (index % 2) * 2, y: CANTEEN.y + 2 + Math.floor(index / 2),
      }));
    }
  }

  stepTo(runtime, ADMIT_AT);

  for (let index = 0; index < GUARDS; index += 1) {
    submit(runtime, `hire-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
  for (let index = 0; index < options.prisoners; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  // A refused purchase, zoning, placement, hire or admission would make every
  // figure below a measurement of a different prison, so it is checked rather
  // than assumed.
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

interface NeedReadout {
  readonly unmet: number;
  readonly minPermille: number;
  readonly medianPermille: number;
  readonly maxPermille: number;
}

interface Measurement {
  readonly options: PrisonOptions;
  /** Population actually housed at the end -- `residentIdsWithExistingPlace().length`. */
  readonly occupiedPlaces: number;
  /** `stateIncomeForCompletedDay` at each measured day boundary, in order. */
  readonly dailyGrant: readonly number[];
  /** The last measured day's grant: the settled figure every table quotes. */
  readonly settledGrant: number;
  readonly needs: Readonly<Record<NeedId, NeedReadout>>;
  /** How many prisoners sit at each `unmetNeedCount`, indexed by count. */
  readonly unmetHistogram: readonly number[];
  /** Performing ticks per action id, summed over every prisoner and every measured tick. */
  readonly performingTicks: Readonly<Record<string, number>>;
  /** Travelling ticks per action id, on the same census: the time paid to *reach* the target rather than to use it. */
  readonly travellingTicks: Readonly<Record<string, number>>;
  /** Ticks in which a prisoner held no action at all. */
  readonly idleTicks: number;
  /** The most prisoners holding a use claim on any one yard, in any measured tick. */
  readonly peakYardUse: number;
  /** `floor(width * height / TILES_PER_OPEN_GROUND_PLACE)` for one yard, read off the registry. */
  readonly yardCapacity: number;
  readonly metrics: {
    readonly unmetDemandCycles: number;
    readonly routeFailures: number;
    readonly substitutionCycles: number;
    /** The subset of `substitutionCycles` where the prison **had** somewhere to do the first choice and this prisoner did not get it: contention, not absence. */
    readonly contendedSubstitutionCycles: number;
    readonly actionsStarted: number;
    readonly actionsCompleted: number;
  };
}

function permille(scaledLevel: number): number {
  return Math.round((scaledLevel / NEED_SCALE / NEED_MAX) * 1_000);
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : Math.round((sorted[middle - 1]! + sorted[middle]!) / 2);
}

/**
 * Runs one prison for `days` in-game days and reads it at the last day
 * boundary.
 *
 * Every tick is sampled for the performing-action census, because a performed
 * action is short and a coarse sample can miss one whole.
 */
function measure(options: PrisonOptions, days: number): Measurement {
  const runtime = build(options);
  const store = runtime.prisoners.entityStore;
  const registry = runtime.prisoners.roomInstances;

  const yardIds = registry.allByRoomCatalogId('room.yard').map((instance) => instance.instanceId);
  const yardCapacity = yardIds.length === 0
    ? 0
    : registry.concurrentUseCapacityFor(registry.getById(yardIds[0]!)!, undefined);

  const performingTicks: Record<string, number> = {};
  const travellingTicks: Record<string, number> = {};
  const dailyGrant: number[] = [];
  let peakYardUse = 0;
  let idleTicks = 0;

  const until = ADMIT_AT + DAY_LENGTH_TICKS * days;
  // The readout tick is a day boundary by construction; see `ADMIT_AT`.
  expect(until % DAY_LENGTH_TICKS, 'the readout must be taken on the tick the day is settled on').toBe(DAY_LENGTH_TICKS - 1);
  for (let tick = runtime.kernel.tick + 1; tick <= until; tick += 1) {
    stepTo(runtime, tick);
    for (let slot = 0; slot < options.prisoners; slot += 1) {
      const id = store.getIdByIndex(slot);
      if (id === undefined) continue;
      const index = store.getIndex(id);
      // `tests/integration/yard-and-common-room.test.ts`'s census, widened by
      // one phase: **the time paid to reach a room is not the time spent in
      // it**, and separating them is what tells a contended room from a
      // distant one.
      const phase = ACTION_PHASES[runtime.prisoners.currentAction.phase[index]!];
      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      if (phase === 'idle' || actionIndex < 0) {
        idleTicks += 1;
      } else {
        const actionId = DEFAULT_ACTIONS[actionIndex]!.id;
        if (phase === 'performing') performingTicks[actionId] = (performingTicks[actionId] ?? 0) + 1;
        else travellingTicks[actionId] = (travellingTicks[actionId] ?? 0) + 1;
      }
    }
    for (const yardId of yardIds) {
      const occupancy = registry.useOccupancyOf(yardId);
      if (occupancy > peakYardUse) peakYardUse = occupancy;
    }
    // The tick the day is settled on: `StateIncomeSystem`'s schedule is
    // `intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1`.
    if (tick % DAY_LENGTH_TICKS === DAY_LENGTH_TICKS - 1) dailyGrant.push(stateIncomeForCompletedDay(runtime.prisoners));
  }

  const occupied = registry.residentIdsWithExistingPlace();
  const needs = {} as Record<NeedId, NeedReadout>;
  for (const needId of NEED_IDS) {
    const levels: number[] = [];
    let unmet = 0;
    for (const entityId of occupied) {
      const index = store.getIndex(entityId);
      const scaled = runtime.prisoners.needs.levels[needId][index]!;
      levels.push(permille(scaled));
      if (isNeedUnmetForStateIncome(runtime.prisoners.needs.get(index, needId))) unmet += 1;
    }
    needs[needId] = {
      unmet,
      minPermille: levels.length === 0 ? 0 : Math.min(...levels),
      medianPermille: median(levels),
      maxPermille: levels.length === 0 ? 0 : Math.max(...levels),
    };
  }

  const unmetHistogram = new Array<number>(NEED_IDS.length + 1).fill(0);
  for (const entityId of occupied) {
    const count = unmetNeedCount(runtime.prisoners.needs, store.getIndex(entityId));
    unmetHistogram[count] = (unmetHistogram[count] ?? 0) + 1;
  }

  const metrics = runtime.prisoners.actionSystem.getMetrics();
  return {
    options,
    occupiedPlaces: occupied.length,
    dailyGrant,
    settledGrant: dailyGrant[dailyGrant.length - 1] ?? 0,
    needs,
    unmetHistogram,
    performingTicks,
    travellingTicks,
    idleTicks,
    peakYardUse,
    yardCapacity,
    metrics: {
      unmetDemandCycles: metrics.unmetDemandCycles,
      routeFailures: metrics.routeFailures,
      substitutionCycles: metrics.substitutionCycles,
      contendedSubstitutionCycles: metrics.contendedSubstitutionCycles,
      actionsStarted: metrics.actionsStarted,
      actionsCompleted: metrics.actionsCompleted,
    },
  };
}

/** Twenty in-game days after the intake. Ten was measured too short: the grant series was still moving on the tenth day. */
const DAYS = 20;

/** The eight populations the issue names. */
const POPULATIONS = [4, 8, 12, 16, 24, 32, 40, 50] as const;

function print(line: string): void {
  console.log(line);
}

function needLine(label: string, readout: NeedReadout, of: number): string {
  return `    ${label.padEnd(11)} unmet for ${String(readout.unmet).padStart(2)} of ${String(of).padStart(2)}` +
    `  permille min=${String(readout.minPermille).padStart(4)} median=${String(readout.medianPermille).padStart(4)} max=${String(readout.maxPermille).padStart(4)}`;
}

describe('#997 act A -- where the yard incentive breaks, across population', () => {
  it('sweeps n = 4, 8, 12, 16, 24, 32, 40, 50 with one yard and without, at both yard placements', () => {
    for (const placement of ['at-the-door', 'far'] as const) {
      print('');
      print(`=== ACT A [${placement}]: one 8x8 yard against no yard, identical prison, seed 0x997, ${String(DAYS)} days ===`);
      print('  n | recreation permille min/med/max | unmet rec | grant no yard | grant + yard | recovered | n x 40 | yard perform | yard travel | peak use');
      for (const population of POPULATIONS) {
        const withYard = measure({ prisoners: population, yards: 1, yardPlacement: placement }, DAYS);
        const without = measure({ prisoners: population, yards: 0 }, DAYS);
        expect(withYard.occupiedPlaces, 'every admitted prisoner must be housed').toBe(population);
        expect(without.occupiedPlaces, 'every admitted prisoner must be housed').toBe(population);

        const recreation = withYard.needs.recreation;
        const recovered = withYard.settledGrant - without.settledGrant;
        print(
          `${String(population).padStart(3)} | ${String(recreation.minPermille).padStart(4)}/${String(recreation.medianPermille).padStart(4)}/${String(recreation.maxPermille).padStart(4)}` +
          `                | ${String(recreation.unmet).padStart(2)} of ${String(population).padStart(2)}  | ` +
          `${String(without.settledGrant).padStart(13)} | ${String(withYard.settledGrant).padStart(12)} | ${String(recovered).padStart(9)} | ` +
          `${String(population * 40).padStart(6)} | ${String(withYard.performingTicks['action.yard-recreation'] ?? 0).padStart(12)} | ` +
          `${String(withYard.travellingTicks['action.yard-recreation'] ?? 0).padStart(11)} | ${String(withYard.peakYardUse)} of ${String(withYard.yardCapacity)}`,
        );
        print(`      no-yard grant series:   ${JSON.stringify(without.dailyGrant)}`);
        print(`      with-yard grant series: ${JSON.stringify(withYard.dailyGrant)}`);
        print(`      with-yard unmet histogram: ${JSON.stringify(withYard.unmetHistogram)}   metrics ${JSON.stringify(withYard.metrics)}`);
        print(`      no-yard unmet histogram:   ${JSON.stringify(without.unmetHistogram)}   metrics ${JSON.stringify(without.metrics)}`);
        print('      with a yard:');
        for (const needId of NEED_IDS) print(needLine(needId, withYard.needs[needId], withYard.occupiedPlaces));
        print('      without a yard:');
        for (const needId of NEED_IDS) print(needLine(needId, without.needs[needId], without.occupiedPlaces));
        print(`      with-yard performing ticks:  ${JSON.stringify(withYard.performingTicks)}`);
        print(`      with-yard travelling ticks:  ${JSON.stringify(withYard.travellingTicks)}  idle ${String(withYard.idleTicks)}`);
        print(`      no-yard performing ticks:    ${JSON.stringify(without.performingTicks)}`);
        print(`      no-yard travelling ticks:    ${JSON.stringify(without.travellingTicks)}  idle ${String(without.idleTicks)}`);
      }
    }
  });
});

describe('#997 act B -- the door, which is the other candidate the fifty-prisoner note named', () => {
  it('measures n=50 with one yard and a cell that has no doorway', () => {
    print('');
    print('=== ACT B: n=50, one yard, cell walled on four sides with no door ===');
    const sealed = measure({ prisoners: 50, yards: 1, cellDoor: false }, DAYS);
    const open = measure({ prisoners: 50, yards: 1, cellDoor: true }, DAYS);
    for (const [label, run] of [['no door', sealed], ['door', open]] as const) {
      print(`  ${label}: grant ${String(run.settledGrant)}  series ${JSON.stringify(run.dailyGrant)}`);
      print(`    yard performing ticks ${String(run.performingTicks['action.yard-recreation'] ?? 0)}  peak use ${String(run.peakYardUse)} of ${String(run.yardCapacity)}`);
      print(`    metrics ${JSON.stringify(run.metrics)}   unmet histogram ${JSON.stringify(run.unmetHistogram)}`);
      for (const needId of NEED_IDS) print(needLine(needId, run.needs[needId], run.occupiedPlaces));
      print(`    performing ticks: ${JSON.stringify(run.performingTicks)}`);
    }
  });
});

describe('#997 act C -- whether more yard fixes it', () => {
  it('measures more yards and more ground, at n=50 and at n=100', () => {
    print('');
    print('=== ACT C: how much yard it takes, at n=50 (11x10 cell) and n=100 (21x10 cell) ===');
    for (const [label, wide, population] of [['n=50', false, 50], ['n=100', true, 100]] as const) {
      const baseline = measure({ prisoners: population, yards: 0, wideCell: wide }, DAYS);
      print(`  --- ${label}, no yard: grant ${String(baseline.settledGrant)} over ${String(baseline.occupiedPlaces)} places, ${needLine('recreation', baseline.needs.recreation, baseline.occupiedPlaces).trim()}`);
      print(`      ${label} REMEDY 1 -- more 8x8 yards (the first at the door, the rest on the north strip):`);
      for (const yards of [1, 2, 3, 4]) {
        const run = measure({ prisoners: population, yards, yardPlacement: 'at-the-door', wideCell: wide }, DAYS);
        print(
          `        ${String(yards)} yard(s) = ${String(yards * run.yardCapacity)} places: grant ${String(run.settledGrant)} over ${String(run.occupiedPlaces)} places` +
          `  (+${String(run.settledGrant - baseline.settledGrant)})  yard perform ${String(run.performingTicks['action.yard-recreation'] ?? 0)}` +
          `  travel ${String(run.travellingTicks['action.yard-recreation'] ?? 0)}  peak use on one yard ${String(run.peakYardUse)}`,
        );
        print(`          ${needLine('recreation', run.needs.recreation, run.occupiedPlaces).trim()}   histogram ${JSON.stringify(run.unmetHistogram)}   metrics ${JSON.stringify(run.metrics)}`);
      }
      print(`      ${label} REMEDY 2 -- one yard at the door, more ground under it:`);
      for (const width of [8, 16, wide ? 24 : 20]) {
        const run = measure({ prisoners: population, yards: 1, yardPlacement: 'at-the-door', yardWidth: width, wideCell: wide }, DAYS);
        print(
          `        ${String(width)}x8 = ${String(width * 8)} tiles = ${String(run.yardCapacity)} places: grant ${String(run.settledGrant)} over ${String(run.occupiedPlaces)} places` +
          `  (+${String(run.settledGrant - baseline.settledGrant)})  yard perform ${String(run.performingTicks['action.yard-recreation'] ?? 0)}` +
          `  travel ${String(run.travellingTicks['action.yard-recreation'] ?? 0)}  peak use ${String(run.peakYardUse)} of ${String(run.yardCapacity)}`,
        );
        print(`          ${needLine('recreation', run.needs.recreation, run.occupiedPlaces).trim()}   histogram ${JSON.stringify(run.unmetHistogram)}   metrics ${JSON.stringify(run.metrics)}`);
        print(`          grant series ${JSON.stringify(run.dailyGrant)}`);
      }
    }
  });
});

describe('#997 act D -- whether the other five needs break the same way', () => {
  it('measures every need at n=4 and n=50 with the cheapest room that serves it', () => {
    print('');
    print('=== ACT D: every need, n=4 against n=50, cell + one at-the-door yard + one shower room + one canteen ===');
    print(`  STATE_INCOME_UNMET_NEED_LEVEL = ${String(STATE_INCOME_UNMET_NEED_LEVEL)} of ${String(NEED_MAX)} (${String(permille(STATE_INCOME_UNMET_NEED_LEVEL * NEED_SCALE))} permille)`);
    for (const population of [4, 50]) {
      const base = { prisoners: population, yardPlacement: 'at-the-door' } as const;
      const full = measure({ ...base, yards: 1, showerRoom: true, canteen: true }, DAYS);
      const noShower = measure({ ...base, yards: 1, showerRoom: false, canteen: true }, DAYS);
      const noCanteen = measure({ ...base, yards: 1, showerRoom: true, canteen: false }, DAYS);
      const noYard = measure({ ...base, yards: 0, showerRoom: true, canteen: true }, DAYS);

      print(`  --- n=${String(population)} ---`);
      print(`    everything built: grant ${String(full.settledGrant)} over ${String(full.occupiedPlaces)} places  series ${JSON.stringify(full.dailyGrant)}`);
      for (const needId of NEED_IDS) print(needLine(needId, full.needs[needId], full.occupiedPlaces));
      print(`    unmet histogram ${JSON.stringify(full.unmetHistogram)}`);
      print(`    performing ticks ${JSON.stringify(full.performingTicks)}`);
      print(`    travelling ticks ${JSON.stringify(full.travellingTicks)}  idle ${String(full.idleTicks)}`);
      print(`    metrics ${JSON.stringify(full.metrics)}`);
      print(`    marginal grant of the yard        : ${String(full.settledGrant - noYard.settledGrant)} (n x 40 = ${String(population * 40)})`);
      print(`      without it: ${needLine('recreation', noYard.needs.recreation, noYard.occupiedPlaces).trim()}`);
      print(`    marginal grant of the shower room : ${String(full.settledGrant - noShower.settledGrant)} (n x 40 = ${String(population * 40)})`);
      print(`      without it: ${needLine('hygiene', noShower.needs.hygiene, noShower.occupiedPlaces).trim()}`);
      print(`      with it:    ${needLine('hygiene', full.needs.hygiene, full.occupiedPlaces).trim()}`);
      print(`    marginal grant of the canteen     : ${String(full.settledGrant - noCanteen.settledGrant)} (n x 40 = ${String(population * 40)})`);
      print(`      without it: ${needLine('hunger', noCanteen.needs.hunger, noCanteen.occupiedPlaces).trim()}`);
      print(`      with it:    ${needLine('hunger', full.needs.hunger, full.occupiedPlaces).trim()}`);
    }
  });
});

describe('#997 act G -- past fifty, on a cell wide enough to hold them', () => {
  it('sweeps n = 50, 60, 70, 80, 90, 100 with one at-the-door yard', () => {
    print('');
    print('=== ACT G: 21x10 cell, a hundred beds, one 8x8 yard at the door, ' + String(DAYS) + ' days ===');
    print('  NOTE: a different prison from acts A-F (a wider cell), so its rows compare only with each other.');
    print('  n | recreation permille min/med/max | unmet rec | grant no yard | grant + yard | recovered | n x 40 | yard perform | yard travel');
    for (const population of [50, 60, 70, 80, 90, 100]) {
      const withYard = measure({ prisoners: population, yards: 1, yardPlacement: 'at-the-door', wideCell: true }, DAYS);
      const without = measure({ prisoners: population, yards: 0, wideCell: true }, DAYS);
      // **Not `toBe(population)`, and the difference is a finding rather than a
      // fixture defect.** Above fifty this prison starts losing an occupied
      // place or two over twenty days -- the grant is per occupied place, so
      // the row stays internally consistent, but a row whose `occupied` column
      // is short of its `n` is not a row about `n` prisoners. Both are printed.
      expect(withYard.occupiedPlaces, 'the intake must very nearly fill the cell').toBeGreaterThanOrEqual(population - 3);
      const recreation = withYard.needs.recreation;
      print(
        `${String(population).padStart(3)} | ${String(recreation.minPermille).padStart(4)}/${String(recreation.medianPermille).padStart(4)}/${String(recreation.maxPermille).padStart(4)}` +
        `                | ${String(recreation.unmet).padStart(2)} of ${String(withYard.occupiedPlaces).padStart(3)} | ` +
        `${String(without.settledGrant).padStart(13)} | ${String(withYard.settledGrant).padStart(12)} | ${String(withYard.settledGrant - without.settledGrant).padStart(9)} | ` +
        `${String(population * 40).padStart(6)} | ${String(withYard.performingTicks['action.yard-recreation'] ?? 0).padStart(12)} | ${String(withYard.travellingTicks['action.yard-recreation'] ?? 0).padStart(11)}`,
      );
      print(`      occupied places: with yard ${String(withYard.occupiedPlaces)} of ${String(population)} admitted, without ${String(without.occupiedPlaces)} of ${String(population)}`);
      print(`      with-yard unmet histogram: ${JSON.stringify(withYard.unmetHistogram)}   grant series ${JSON.stringify(withYard.dailyGrant)}`);
      print(`      no-yard  unmet histogram: ${JSON.stringify(without.unmetHistogram)}   grant series ${JSON.stringify(without.dailyGrant)}`);
      for (const needId of NEED_IDS) print(needLine(needId, withYard.needs[needId], withYard.occupiedPlaces));
    }
  });
});

describe('#997 act E -- the ceilings themselves, read off the registry', () => {
  it('prints the concurrent-use ceiling of every room this file builds', () => {
    print('');
    print('=== ACT E: concurrent-use ceilings, read off `RoomInstanceRegistry` ===');
    const prisons = [
      ['four 8x8 yards', build({ prisoners: 50, yards: 4 })],
      ['one 8x8 yard at the door, a shower room and a canteen', build({ prisoners: 50, yards: 1, yardPlacement: 'at-the-door', showerRoom: true, canteen: true })],
      ['one 20x8 yard at the door and nothing else (the shower room and the canteen stand on the ground it would take)', build({ prisoners: 50, yards: 1, yardPlacement: 'at-the-door', yardWidth: 20 })],
    ] as const;
    for (const [label, runtime] of prisons) {
      print(`  --- ${label} ---`);
      const registry = runtime.prisoners.roomInstances;
      for (const [catalogId, capability] of [
        ['room.yard', undefined],
        ['room.shower-room', 'hygiene'],
        ['room.canteen', 'dining'],
        ['room.cell', 'sleep-surface'],
        ['room.cell', 'sanitation'],
      ] as const) {
        for (const instance of registry.allByRoomCatalogId(catalogId)) {
          print(
            `    ${catalogId} ${instance.instanceId} capability=${capability ?? '(none)'}` +
            `  concurrentUseCapacityFor=${String(registry.concurrentUseCapacityFor(instance, capability))}` +
            `  residentCapacity=${String(instance.residentCapacity)}`,
          );
        }
      }
    }
    print(`  TILES_PER_OPEN_GROUND_PLACE = ${String(TILES_PER_OPEN_GROUND_PLACE)}; an 8x8 yard is floor(64/16) = ${String(Math.floor(64 / TILES_PER_OPEN_GROUND_PLACE))} places`);
    expect(prisons[0][1].prisoners.roomInstances.allByRoomCatalogId('room.yard')).toHaveLength(4);
  });
});
