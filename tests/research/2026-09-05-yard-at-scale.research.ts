import { describe, expect, it } from 'vitest';

import { procurableMaterial } from '../../src/content/procurement-catalog';
import { BUILDABLE_REGISTRY } from '../../src/simulation/construction/definition';
import { STATE_INCOME_UNMET_NEED_LEVEL, isNeedUnmetForStateIncome, stateIncomeForCompletedDay, unmetNeedCount } from '../../src/simulation/economy/income';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { ACTION_PHASES, classificationGroupIdFromIndex } from '../../src/simulation/prisoners/components';
import { NEED_DECAY_PER_TICK, NEED_IDS, NEED_MAX, NEED_SCALE, type NeedId } from '../../src/simulation/prisoners/needs';
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

/**
 * **#1003.** The same 3x3 shower room put as close to the cell door as the
 * geometry allows, and the same room put across the map -- the `hygiene`
 * counterparts of `yardAtTheDoor` and `YARDS[0]`, and here for the reason
 * [#997 §1.1] gives: distance moved the yard's answer by the whole of `n x 40`
 * at four prisoners, so a hygiene sweep that fixed the distance would be
 * measuring one arbitrary point of a curve it had not looked at.
 *
 * `wallRoomPerimeter` puts a room's door in its **south** boundary at its
 * **left** column, so the walk is from the cell's own step-out tile to that
 * doorway and back in:
 *
 * - `SHOWER_NEAR` at `(9, 21)` occupies columns 9..11, rows 21..23 -- flush
 *   against the west of `CELL`'s step-out tile `(12, 21)` and clear of it. Its
 *   doorway is `(9, 24)`: three tiles south and three west, **6 tiles**.
 * - `SHOWER_FAR` at `(1, 1)` is `YARDS[0]`'s corner, **about 17 tiles**.
 * - `SHOWER` at `(20, 21)` is act D's, kept unmoved so #1003's rows and
 *   #997 act D's rows are rows about the same room. It shares `CELL`'s south
 *   wall at columns 20..22 and its doorway is `(20, 24)`: **about 11 tiles**.
 *
 * None of the three overlaps `yardAtTheDoor(CELL, 8)`, which is columns 12..19
 * of rows 21..28 -- checked by `build`'s `refusals.count === 0`, since
 * `RoomZoningService.zone` refuses an overlapping rectangle.
 */
const SHOWER_NEAR = { x: 9, y: 21, width: 3, height: 3 } as const;
const SHOWER_FAR = { x: 1, y: 1, width: 3, height: 3 } as const;

/**
 * **#1003.** Four 3x3 shower rooms in a row along the wall south of `CELL`,
 * for the arm that asks how many it takes. One tile of clear ground between
 * each pair, so a shared perimeter cannot make two rectangles one room, and
 * `SHOWER_ROOMS[0]` is `SHOWER_NEAR` -- so "one shower room" in that arm and
 * "one shower room" in the population sweep are the same room in the same
 * place. Doorways at `(9,24)`, `(5,24)`, `(1,24)`, `(24,24)`: 6, 10, 14 and
 * about 16 tiles from `CELL`'s step-out tile.
 */
const SHOWER_ROOMS = [
  SHOWER_NEAR,
  { x: 5, y: 21, width: 3, height: 3 },
  { x: 1, y: 21, width: 3, height: 3 },
  { x: 24, y: 21, width: 3, height: 3 },
] as const;

/**
 * **#1003.** One 5x5 shower room at a fixed place, so that the arm which varies
 * the number of shower heads varies **only** that.
 *
 * `concurrentUseCapacityFor(instance, 'hygiene')` sums the footprint widths of
 * the `'hygiene'`-capable objects standing in the room
 * (`room-instance-registry.ts` case 2, `deriveRoomCapacity`), and
 * `object.shower-head` is 1x1, so `k` heads is `k` places. A room that grew
 * with its heads would move the walk and the ceiling together and could not
 * attribute a difference to either -- which is exactly the confound
 * [#997 §1.1] found in the yard's distance arm.
 *
 * Columns 4..8, rows 21..25; doorway `(4, 26)`, about **13 tiles** from
 * `CELL`'s step-out tile, and that number is the same for 2 heads and for 8.
 * Heads go along rows 21 and 23, leaving rows 22, 24 and 25 clear to walk.
 */
const SHOWER_BIG = { x: 4, y: 21, width: 5, height: 5 } as const;
const SHOWER_BIG_HEAD_TILES = [
  { x: 4, y: 21 }, { x: 5, y: 21 }, { x: 6, y: 21 }, { x: 7, y: 21 }, { x: 8, y: 21 },
  { x: 4, y: 23 }, { x: 5, y: 23 }, { x: 6, y: 23 },
] as const;
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
  /**
   * Guards hired. Defaults to `GUARDS`, which is what the game asks for at
   * fifty. Acts that admit more than fifty must raise it: at 7 guards and 100
   * prisoners `safety` collapses to 2 permille, `ClassificationReviewSystem`
   * and `ClassificationEarlyWarningSystem` promote the whole population to
   * `high-risk`, and `HIGH_RISK_REGIME` allows `recreation` for 200 ticks of
   * the day instead of 600 -- so the yard measurement would be reading a
   * staffing collapse. Measured: at n=100 with 7 guards the group census was
   * `[["high-risk",99,56]]` and not one prisoner was left in general
   * population.
   */
  readonly guards?: number;
  readonly cellDoor?: boolean;
  readonly showerRoom?: boolean;
  readonly canteen?: boolean;
  /**
   * **#1003.** How many 3x3 shower rooms from `SHOWER_ROOMS`, each with the
   * two authored heads. Mutually exclusive with `showerRoom` and with
   * `showerHeads`; `showerPlacement` moves the *first* one.
   */
  readonly showerRooms?: number;
  /** **#1003.** Where the single shower room goes. `'act-d'` is `SHOWER`, unmoved, so a row here and an act D row are rows about the same room. */
  readonly showerPlacement?: 'near' | 'far' | 'act-d';
  /**
   * **#1003.** Heads placed in one `SHOWER_BIG`, 2..8. The room's rectangle
   * does not move and does not grow, so this varies the concurrent-use ceiling
   * and nothing else.
   */
  readonly showerHeads?: number;
  /**
   * **#1003.** Bricks purchased, so that every arm of an act buys the same
   * number whatever it builds.
   *
   * It has to be an option rather than a derived quantity: `PurchaseMaterials`
   * spends from the treasury, `InsolvencyRungSystem` and `PayrollSystem` read
   * the balance, and an arm that bought 8 bricks against an arm that bought 20
   * would differ in the treasury as well as in the room. Every act below hands
   * both its arms the same figure. **8 is what acts A-G bought**, so their
   * numbers are untouched by this option existing.
   */
  readonly bricks?: number;
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
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: options.bricks ?? 8 }));

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

  // **#1003's shower arms.** Deliberately a separate block from `showerRoom`
  // above rather than a generalisation of it: acts A-G's rows are `showerRoom:
  // true` and must keep building exactly the room they built.
  if (options.showerRooms !== undefined && options.showerRooms > 0) {
    for (let index = 0; index < options.showerRooms; index += 1) {
      const rect = index === 0
        ? (options.showerPlacement === 'far' ? SHOWER_FAR : options.showerPlacement === 'act-d' ? SHOWER : SHOWER_NEAR)
        : SHOWER_ROOMS[index]!;
      wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
      submit(runtime, `zone-shower-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...rect }));
      // `room.shower-room` authors `{ type: 'object', objectId:
      // 'object.shower-head', minQuantity: 2 }`, so two is the room's own
      // minimum and 2 places is the ceiling that minimum buys.
      for (let head = 0; head < 2; head += 1) {
        submit(runtime, `head-${String(index)}-${String(head)}`, packCommand({
          type: 'PlaceObject', orderId: `head-${String(index)}-${String(head)}`,
          definitionId: 'shower-head-brick', x: rect.x + head, y: rect.y,
        }));
      }
    }
  }

  if (options.showerHeads !== undefined && options.showerHeads > 0) {
    wallRoomPerimeter(runtime.world, SHOWER_BIG, { doors: runtime.navigation.doors });
    submit(runtime, 'zone-shower-big', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER_BIG }));
    for (let head = 0; head < options.showerHeads; head += 1) {
      const tile = SHOWER_BIG_HEAD_TILES[head]!;
      submit(runtime, `big-head-${String(head)}`, packCommand({
        type: 'PlaceObject', orderId: `big-head-${String(head)}`, definitionId: 'shower-head-brick', x: tile.x, y: tile.y,
      }));
    }
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

  const guards = options.guards ?? GUARDS;
  for (let index = 0; index < guards; index += 1) {
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
  /**
   * How many times a prisoner *entered* `performing` for each action id -- a
   * visit, as opposed to a tick of one.
   *
   * `performingTicks / visits` is the mean length of a visit, and it is the
   * number that turns a place into a throughput: a place occupied for
   * `minDurationTicks` serves one prisoner in that time whatever that prisoner
   * needed.
   */
  readonly visits: Readonly<Record<string, number>>;
  /** Ticks in which a prisoner held no action at all. */
  readonly idleTicks: number;
  /** The most prisoners holding a use claim on any one yard, in any measured tick. */
  readonly peakYardUse: number;
  /** `floor(width * height / TILES_PER_OPEN_GROUND_PLACE)` for one yard, read off the registry. */
  readonly yardCapacity: number;
  /**
   * **#1003.** The same pair for `room.shower-room`, read off the same
   * registry through the same accessor with `'hygiene'` handed to it -- which
   * is the whole of the difference between the two needs' ceilings: the yard's
   * comes from `openGroundCapacityOf` and the shower room's from the summed
   * footprint width of its `'hygiene'` objects.
   */
  readonly showerCapacity: number;
  /** The most prisoners holding a use claim on any one shower room, in any measured tick. */
  readonly peakShowerUse: number;
  /** How many `room.shower-room` instances the prison holds. */
  readonly showerRoomCount: number;
  /**
   * Per classification group: how many prisoners are in it, and how many of
   * them the state calls short on `recreation`.
   *
   * `GENERAL_POPULATION_REGIME` allows `recreation` for 600 ticks of the day
   * and `HIGH_RISK_REGIME` for 200 (`src/simulation/prisoners/regime.ts:104-129`),
   * so the two groups do not have the same access to the same yard and an
   * aggregate that mixed them would hide it.
   */
  readonly recreationByGroup: readonly (readonly [string, number, number])[];
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
  const showerIds = registry.allByRoomCatalogId('room.shower-room').map((instance) => instance.instanceId);
  const showerCapacity = showerIds.length === 0
    ? 0
    : registry.concurrentUseCapacityFor(registry.getById(showerIds[0]!)!, 'hygiene');
  let peakShowerUse = 0;

  const performingTicks: Record<string, number> = {};
  const travellingTicks: Record<string, number> = {};
  const visits: Record<string, number> = {};
  // Previous tick's phase index per slot, so a transition into `performing`
  // can be counted once rather than every tick of the visit. `-1` is "not
  // sampled yet".
  const previousPhase = new Int8Array(options.prisoners).fill(-1);
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
        if (phase === 'performing') {
          performingTicks[actionId] = (performingTicks[actionId] ?? 0) + 1;
          if (previousPhase[slot] !== 2) visits[actionId] = (visits[actionId] ?? 0) + 1;
        } else {
          travellingTicks[actionId] = (travellingTicks[actionId] ?? 0) + 1;
        }
      }
      previousPhase[slot] = runtime.prisoners.currentAction.phase[index]!;
    }
    for (const yardId of yardIds) {
      const occupancy = registry.useOccupancyOf(yardId);
      if (occupancy > peakYardUse) peakYardUse = occupancy;
    }
    for (const showerId of showerIds) {
      const occupancy = registry.useOccupancyOf(showerId, 'hygiene');
      if (occupancy > peakShowerUse) peakShowerUse = occupancy;
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

  const byGroup = new Map<string, { total: number; unmet: number }>();
  for (const entityId of occupied) {
    const index = store.getIndex(entityId);
    const group = classificationGroupIdFromIndex(runtime.prisoners.records.classificationGroupIndex[index]!);
    const row = byGroup.get(group) ?? { total: 0, unmet: 0 };
    row.total += 1;
    if (isNeedUnmetForStateIncome(runtime.prisoners.needs.get(index, 'recreation'))) row.unmet += 1;
    byGroup.set(group, row);
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
    visits,
    idleTicks,
    peakYardUse,
    yardCapacity,
    showerCapacity,
    peakShowerUse,
    showerRoomCount: showerIds.length,
    recreationByGroup: [...byGroup.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([group, row]) => [group, row.total, row.unmet] as const),
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
        print(`      with-yard recreation by classification group [group, housed, unmet]: ${JSON.stringify(withYard.recreationByGroup)}`);
        print(`      with-yard visits: ${JSON.stringify(withYard.visits)}`);
        print(`      yard visits ${String(withYard.visits['action.yard-recreation'] ?? 0)} = ${String(Math.round((withYard.visits['action.yard-recreation'] ?? 0) / DAYS))}/day; mean visit ${String(Math.round((withYard.performingTicks['action.yard-recreation'] ?? 0) / Math.max(1, withYard.visits['action.yard-recreation'] ?? 0)))} ticks; one visit per prisoner every ${String((population / Math.max(1, (withYard.visits['action.yard-recreation'] ?? 0) / DAYS)).toFixed(2))} days`);
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
      const guards = Math.max(GUARDS, Math.ceil(population / 8));
      const baseline = measure({ prisoners: population, yards: 0, wideCell: wide, guards }, DAYS);
      print(`  --- ${label}, ${String(guards)} guards, no yard: grant ${String(baseline.settledGrant)} over ${String(baseline.occupiedPlaces)} places, ${needLine('recreation', baseline.needs.recreation, baseline.occupiedPlaces).trim()}`);
      print(`      ${label} REMEDY 1 -- more 8x8 yards (the first at the door, the rest on the north strip):`);
      for (const yards of [1, 2, 3, 4]) {
        const run = measure({ prisoners: population, yards, yardPlacement: 'at-the-door', wideCell: wide, guards }, DAYS);
        print(
          `        ${String(yards)} yard(s) = ${String(yards * run.yardCapacity)} places: grant ${String(run.settledGrant)} over ${String(run.occupiedPlaces)} places` +
          `  (+${String(run.settledGrant - baseline.settledGrant)})  yard perform ${String(run.performingTicks['action.yard-recreation'] ?? 0)}` +
          `  travel ${String(run.travellingTicks['action.yard-recreation'] ?? 0)}  peak use on one yard ${String(run.peakYardUse)}`,
        );
        print(`          ${needLine('recreation', run.needs.recreation, run.occupiedPlaces).trim()}   histogram ${JSON.stringify(run.unmetHistogram)}   metrics ${JSON.stringify(run.metrics)}`);
      }
      print(`      ${label} REMEDY 2 -- one yard at the door, more ground under it:`);
      for (const width of [8, 16, wide ? 24 : 20]) {
        const run = measure({ prisoners: population, yards: 1, yardPlacement: 'at-the-door', yardWidth: width, wideCell: wide, guards }, DAYS);
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
    print('  NOTE: a different prison from acts A-E (a wider cell, and guards scaled to the population), so its rows compare only with each other.');
    print('  n | recreation permille min/med/max | unmet rec | grant no yard | grant + yard | recovered | n x 40 | yard perform | yard travel');
    for (const population of [50, 60, 70, 80, 90, 100]) {
      // `Math.max(scheduledGuardCount, ceil(n / DEFAULT_SECTOR_PRISONERS_PER_GUARD))`,
      // which is `resolveOccupancyScaledGuardCount` (`src/simulation/security/sector-staffing.ts:190`)
      // evaluated by hand: what the game asks for at this population.
      const guards = Math.max(GUARDS, Math.ceil(population / 8));
      const withYard = measure({ prisoners: population, yards: 1, yardPlacement: 'at-the-door', wideCell: true, guards }, DAYS);
      const without = measure({ prisoners: population, yards: 0, wideCell: true, guards }, DAYS);
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
      print(`      guards ${String(guards)}; occupied places: with yard ${String(withYard.occupiedPlaces)} of ${String(population)} admitted, without ${String(without.occupiedPlaces)} of ${String(population)}`);
      print(`      recreation by classification group [group, housed, unmet]: ${JSON.stringify(withYard.recreationByGroup)}`);
      print(`      yard performing/travelling ticks per housed prisoner per day: ${String(Math.round((withYard.performingTicks['action.yard-recreation'] ?? 0) / withYard.occupiedPlaces / DAYS))} / ${String(Math.round((withYard.travellingTicks['action.yard-recreation'] ?? 0) / withYard.occupiedPlaces / DAYS))}`);
      print(`      yard visits ${String(withYard.visits['action.yard-recreation'] ?? 0)} = ${String(Math.round((withYard.visits['action.yard-recreation'] ?? 0) / DAYS))}/day; mean visit ${String(Math.round((withYard.performingTicks['action.yard-recreation'] ?? 0) / Math.max(1, withYard.visits['action.yard-recreation'] ?? 0)))} ticks; one visit per prisoner every ${String((withYard.occupiedPlaces / Math.max(1, (withYard.visits['action.yard-recreation'] ?? 0) / DAYS)).toFixed(2))} days`);
      print(`      yard utilisation: ${String(Math.round(((withYard.performingTicks['action.yard-recreation'] ?? 0) / DAYS / (withYard.yardCapacity * 600)) * 100))}% of capacity x the 600-tick recreation window`);
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

/*
 * ============================================================================
 * Issue #1003 -- the same measurement, for the other member of the class.
 * ============================================================================
 *
 * #997's answer above ends by naming a class rather than a room:
 *
 * > **So it is not a defect of the yard. It is a property of the class "need
 * > served only by a `room-catalog-id` action", whose members today are
 * > `recreation` and `hygiene`.**
 *
 * Acts A-G measured the forgiving member. The acts below measure the other
 * one, on the same fixture, the same seed and the same twenty days, and check
 * the class census itself rather than accepting it.
 *
 * **Nothing here changes a balance constant.** `TILES_PER_OPEN_GROUND_PLACE`,
 * `room.shower-room`'s authored `minQuantity: 2`, `NEED_DECAY_PER_TICK`,
 * `STATE_INCOME_UNMET_NEED_LEVEL`, `minDurationTicks` and the regime windows
 * are all read and none is written. What varies between two rows of any table
 * below is what a *player* could vary: how many rooms they zoned, how many
 * objects they placed in them, and where.
 */

/**
 * **#1003.** The day count acts I, J, K and M read their settled figures at.
 *
 * **Twenty days is act A's number and it is not enough for `hygiene`**, which
 * is act N's finding and the reason this constant exists. `recreation` decays
 * at 0.015 a tick and act A's grant series is flat from day 6; `hygiene` decays
 * at 0.02 a tick, nobody crosses the threshold before day 4.25, and the
 * with-shower series is still climbing on day 20 -- act I's near arm reads 14
 * of 50 short at day 20, 9 at day 40, 7 at day 60, 9 at day 100 and 13 at day
 * 140. So the day-20 figure is a *transient* and the day-60 figure is the
 * middle of a band the prison oscillates in. Both are printed wherever they
 * differ, and the twenty-day column is kept rather than dropped because it is
 * the column act A's rows can be read against.
 */
const SETTLED_DAYS = 60;

/** **#1003.** The populations act I sweeps: the eight #997 named, plus 6, 10 and 20, because the shower's ceiling is half the yard's and the break was expected earlier. */
const HYGIENE_POPULATIONS = [4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 50] as const;

/**
 * **#1003.** Bricks bought by every arm of every act below.
 *
 * The most any of them places is one toilet plus eight shower heads, and a
 * head is one brick (`shower-head-brick`, `materialsRequired: [{ itemId:
 * 'item.brick', quantity: 1 }]`). 20 covers that with margin, and every arm
 * buys 20 whether it places 1 or 9 -- see `PrisonOptions.bricks` for why the
 * quantity has to be equal across arms rather than merely sufficient.
 */
const HYGIENE_BRICKS = 20;

function hygieneLine(run: Measurement): string {
  return `showers ${String(run.showerRoomCount)} x ${String(run.showerCapacity)} places, peak use on one ${String(run.peakShowerUse)}` +
    `; shower perform ${String(run.performingTicks['action.shower'] ?? 0)} travel ${String(run.travellingTicks['action.shower'] ?? 0)}` +
    ` visits ${String(run.visits['action.shower'] ?? 0)}`;
}

describe('#1003 act H -- the class census, derived from `DEFAULT_ACTIONS` rather than quoted', () => {
  it('lists every action by target kind and every need by the target kinds that can serve it', () => {
    print('');
    print('=== ACT H: which needs are served only through a `room-catalog-id` target ===');
    print('  `ActionSystem.claimUseIfNeeded` (`src/simulation/prisoners/action-system.ts`): `if (action.target.kind !== \'room-catalog-id\') return true;`');
    print('  -- so an action whose target is NOT `room-catalog-id` takes no concurrent-use claim and meets no ceiling.');
    print('');
    print('  action                            | target kind        | room               | capability       | needs served');
    for (const action of DEFAULT_ACTIONS) {
      const target = action.target;
      const room = target.kind === 'room-catalog-id' ? target.roomCatalogId : '-';
      const served = Object.entries(action.needEffectsPerTick)
        .filter(([, amount]) => (amount ?? 0) > 0)
        .map(([needId, amount]) => `${needId}+${String(amount)}/tick`);
      print(
        `  ${action.id.padEnd(33)} | ${target.kind.padEnd(18)} | ${room.padEnd(18)} | ` +
        `${(action.requiredObjectCapability ?? '-').padEnd(16)} | ${served.length === 0 ? '(none)' : served.join(', ')}` +
        `  [minDuration ${String(action.minDurationTicks)}]`,
      );
    }

    print('');
    print('  need       | decay/tick | levels lost per day | providers by target kind');
    const membersOfTheClass: NeedId[] = [];
    for (const needId of NEED_IDS) {
      const providers = DEFAULT_ACTIONS.filter((action) => (action.needEffectsPerTick[needId] ?? 0) > 0);
      const gated = providers.filter((action) => action.target.kind === 'room-catalog-id');
      const ungated = providers.filter((action) => action.target.kind !== 'room-catalog-id');
      if (providers.length > 0 && ungated.length === 0) membersOfTheClass.push(needId);
      print(
        `  ${needId.padEnd(10)} | ${String(NEED_DECAY_PER_TICK[needId]).padEnd(10)} | ${String(NEED_DECAY_PER_TICK[needId] * DAY_LENGTH_TICKS).padEnd(19)} | ` +
        `room-catalog-id: ${gated.length === 0 ? '(none)' : gated.map((action) => action.id).join(', ')}` +
        `  ||  exempt: ${ungated.length === 0 ? '(NONE -- every provider meets a ceiling)' : ungated.map((action) => `${action.id} (${action.target.kind})`).join(', ')}`,
      );
    }
    print('');
    print(`  MEMBERS OF THE CLASS (a need with at least one provider, and no provider outside \`room-catalog-id\`): ${JSON.stringify(membersOfTheClass)}`);
    const needsWithNoProviderAtAll = NEED_IDS.filter((needId) => !DEFAULT_ACTIONS.some((action) => (action.needEffectsPerTick[needId] ?? 0) > 0));
    print(`  NEEDS NO ACTION SERVES AT ALL (so outside the class for a different reason): ${JSON.stringify(needsWithNoProviderAtAll)}`);
    print(`  TARGET KINDS PRESENT IN \`DEFAULT_ACTIONS\`: ${JSON.stringify([...new Set(DEFAULT_ACTIONS.map((action) => action.target.kind))].sort())}`);

    // The one assertion this act makes is that it enumerated the whole
    // catalogue: a need in neither list would mean the partition above lost a
    // row, which would make the census a claim about some other catalogue.
    expect(new Set([...membersOfTheClass, ...needsWithNoProviderAtAll, ...NEED_IDS.filter((needId) => DEFAULT_ACTIONS.some((action) => (action.needEffectsPerTick[needId] ?? 0) > 0 && action.target.kind !== 'room-catalog-id'))]).size).toBe(NEED_IDS.length);
  });
});

describe('#1003 act I -- hygiene across population, the way act A measured recreation', () => {
  it('sweeps n = 4..50 with one 3x3 shower room and without, at two shower placements and two durations', () => {
    for (const days of [DAYS, SETTLED_DAYS]) {
      for (const placement of ['near', 'far'] as const) {
        print('');
        print(`=== ACT I [${placement}, ${String(days)} days]: one 3x3 shower room (2 heads) against none, identical prison, no yard, seed 0x997 ===`);
        print('  n | hygiene permille min/med/max | unmet hyg | grant no shower | grant + shower | recovered | n x 40 | (n-unmet) x 40 | shower perform | shower travel | peak use');
        for (const population of HYGIENE_POPULATIONS) {
          const withShower = measure({ prisoners: population, yards: 0, showerRooms: 1, showerPlacement: placement, bricks: HYGIENE_BRICKS }, days);
          const without = measure({ prisoners: population, yards: 0, bricks: HYGIENE_BRICKS }, days);
          expect(withShower.occupiedPlaces, 'every admitted prisoner must be housed').toBe(population);
          expect(without.occupiedPlaces, 'every admitted prisoner must be housed').toBe(population);

          const hygiene = withShower.needs.hygiene;
          const recovered = withShower.settledGrant - without.settledGrant;
          const showerVisits = withShower.visits['action.shower'] ?? 0;
          print(
            `${String(population).padStart(3)} | ${String(hygiene.minPermille).padStart(4)}/${String(hygiene.medianPermille).padStart(4)}/${String(hygiene.maxPermille).padStart(4)}` +
            `             | ${String(hygiene.unmet).padStart(2)} of ${String(population).padStart(2)}  | ` +
            `${String(without.settledGrant).padStart(15)} | ${String(withShower.settledGrant).padStart(14)} | ${String(recovered).padStart(9)} | ` +
            `${String(population * 40).padStart(6)} | ${String((population - hygiene.unmet) * 40).padStart(14)} | ` +
            `${String(withShower.performingTicks['action.shower'] ?? 0).padStart(14)} | ` +
            `${String(withShower.travellingTicks['action.shower'] ?? 0).padStart(13)} | ${String(withShower.peakShowerUse)} of ${String(withShower.showerCapacity)}`,
          );
          print(`      no-shower grant series:   ${JSON.stringify(without.dailyGrant)}`);
          print(`      with-shower grant series: ${JSON.stringify(withShower.dailyGrant)}`);
          print(`      with-shower unmet histogram: ${JSON.stringify(withShower.unmetHistogram)}   metrics ${JSON.stringify(withShower.metrics)}`);
          print(`      no-shower  unmet histogram: ${JSON.stringify(without.unmetHistogram)}   metrics ${JSON.stringify(without.metrics)}`);
          print('      with a shower room:');
          for (const needId of NEED_IDS) print(needLine(needId, withShower.needs[needId], withShower.occupiedPlaces));
          print('      without one:');
          for (const needId of NEED_IDS) print(needLine(needId, without.needs[needId], without.occupiedPlaces));
          print(`      with-shower performing ticks: ${JSON.stringify(withShower.performingTicks)}`);
          print(`      with-shower travelling ticks: ${JSON.stringify(withShower.travellingTicks)}  idle ${String(withShower.idleTicks)}`);
          print(`      with-shower visits: ${JSON.stringify(withShower.visits)}`);
          print(
            `      shower visits ${String(showerVisits)} = ${String(Math.round(showerVisits / days))}/day; ` +
            `mean visit ${String(Math.round((withShower.performingTicks['action.shower'] ?? 0) / Math.max(1, showerVisits)))} ticks; ` +
            `one visit per prisoner every ${String((population / Math.max(1, showerVisits / days)).toFixed(2))} days; ` +
            `${hygieneLine(withShower)}`,
          );
        }
      }
    }
  });
});

describe('#1003 act J -- past fifty, on a cell wide enough to hold them', () => {
  it('sweeps n = 50, 60, 70, 80, 90, 100 with one 3x3 shower room near the door', () => {
    print('');
    print(`=== ACT J: 21x10 cell, a hundred beds, one 3x3 shower room near the door, no yard, ${String(SETTLED_DAYS)} days ===`);
    print('  NOTE: a different prison from act I (a wider cell, and guards scaled to the population), so its rows compare only with each other.');
    print('  n | hygiene permille min/med/max | unmet hyg | grant no shower | grant + shower | recovered | n x 40 | (n-unmet) x 40 | shower perform | shower travel');
    for (const population of [50, 60, 70, 80, 90, 100]) {
      const guards = Math.max(GUARDS, Math.ceil(population / 8));
      const withShower = measure({ prisoners: population, yards: 0, showerRooms: 1, showerPlacement: 'near', wideCell: true, guards, bricks: HYGIENE_BRICKS }, SETTLED_DAYS);
      const without = measure({ prisoners: population, yards: 0, wideCell: true, guards, bricks: HYGIENE_BRICKS }, SETTLED_DAYS);
      expect(withShower.occupiedPlaces, 'the intake must very nearly fill the cell').toBeGreaterThanOrEqual(population - 3);
      const hygiene = withShower.needs.hygiene;
      print(
        `${String(population).padStart(3)} | ${String(hygiene.minPermille).padStart(4)}/${String(hygiene.medianPermille).padStart(4)}/${String(hygiene.maxPermille).padStart(4)}` +
        `             | ${String(hygiene.unmet).padStart(2)} of ${String(withShower.occupiedPlaces).padStart(3)} | ` +
        `${String(without.settledGrant).padStart(15)} | ${String(withShower.settledGrant).padStart(14)} | ${String(withShower.settledGrant - without.settledGrant).padStart(9)} | ` +
        `${String(population * 40).padStart(6)} | ${String((withShower.occupiedPlaces - hygiene.unmet) * 40).padStart(14)} | ` +
        `${String(withShower.performingTicks['action.shower'] ?? 0).padStart(14)} | ${String(withShower.travellingTicks['action.shower'] ?? 0).padStart(13)}`,
      );
      const showerVisits = withShower.visits['action.shower'] ?? 0;
      print(`      guards ${String(guards)}; occupied places: with shower ${String(withShower.occupiedPlaces)} of ${String(population)} admitted, without ${String(without.occupiedPlaces)} of ${String(population)}`);
      print(`      shower visits ${String(showerVisits)} = ${String(Math.round(showerVisits / SETTLED_DAYS))}/day; mean visit ${String(Math.round((withShower.performingTicks['action.shower'] ?? 0) / Math.max(1, showerVisits)))} ticks; one visit per prisoner every ${String((withShower.occupiedPlaces / Math.max(1, showerVisits / SETTLED_DAYS)).toFixed(2))} days`);
      print(`      ${hygieneLine(withShower)}`);
      print(`      with-shower unmet histogram: ${JSON.stringify(withShower.unmetHistogram)}   grant series ${JSON.stringify(withShower.dailyGrant)}`);
      print(`      no-shower  unmet histogram: ${JSON.stringify(without.unmetHistogram)}   grant series ${JSON.stringify(without.dailyGrant)}`);
      print(`      metrics with ${JSON.stringify(withShower.metrics)}`);
      for (const needId of NEED_IDS) print(needLine(needId, withShower.needs[needId], withShower.occupiedPlaces));
    }
  });
});

describe('#1003 act K -- how much shower it takes', () => {
  it('measures more shower rooms and more heads, at n=50 and at n=100', () => {
    print('');
    print('=== ACT K: how much shower it takes, at n=50 (11x10 cell) and n=100 (21x10 cell) ===');
    for (const [label, wide, population] of [['n=50', false, 50], ['n=100', true, 100]] as const) {
      const guards = Math.max(GUARDS, Math.ceil(population / 8));
      const base = { prisoners: population, yards: 0, wideCell: wide, guards, bricks: HYGIENE_BRICKS } as const;
      const baseline = measure(base, SETTLED_DAYS);
      print(`  --- ${label}, ${String(guards)} guards, no shower room: grant ${String(baseline.settledGrant)} over ${String(baseline.occupiedPlaces)} places, ${needLine('hygiene', baseline.needs.hygiene, baseline.occupiedPlaces).trim()}`);
      print(`      ${label} REMEDY 1 -- more 3x3 shower rooms, two heads each (the first near the door, the rest along the same wall):`);
      for (const rooms of [1, 2, 3, 4]) {
        const run = measure({ ...base, showerRooms: rooms, showerPlacement: 'near' }, SETTLED_DAYS);
        print(
          `        ${String(rooms)} room(s) = ${String(rooms * run.showerCapacity)} places: grant ${String(run.settledGrant)} over ${String(run.occupiedPlaces)} places` +
          `  (+${String(run.settledGrant - baseline.settledGrant)})  shower perform ${String(run.performingTicks['action.shower'] ?? 0)}` +
          `  travel ${String(run.travellingTicks['action.shower'] ?? 0)}  visits ${String(run.visits['action.shower'] ?? 0)}  peak use on one ${String(run.peakShowerUse)}`,
        );
        print(`          ${needLine('hygiene', run.needs.hygiene, run.occupiedPlaces).trim()}   histogram ${JSON.stringify(run.unmetHistogram)}   metrics ${JSON.stringify(run.metrics)}`);
        print(`          grant series ${JSON.stringify(run.dailyGrant)}`);
      }
      print(`      ${label} REMEDY 2 -- one 5x5 shower room at a fixed spot, more heads in it (the rectangle does not move or grow):`);
      for (const heads of [2, 4, 6, 8]) {
        const run = measure({ ...base, showerHeads: heads }, SETTLED_DAYS);
        print(
          `        ${String(heads)} head(s) = ${String(run.showerCapacity)} places: grant ${String(run.settledGrant)} over ${String(run.occupiedPlaces)} places` +
          `  (+${String(run.settledGrant - baseline.settledGrant)})  shower perform ${String(run.performingTicks['action.shower'] ?? 0)}` +
          `  travel ${String(run.travellingTicks['action.shower'] ?? 0)}  visits ${String(run.visits['action.shower'] ?? 0)}  peak use ${String(run.peakShowerUse)} of ${String(run.showerCapacity)}`,
        );
        print(`          ${needLine('hygiene', run.needs.hygiene, run.occupiedPlaces).trim()}   histogram ${JSON.stringify(run.unmetHistogram)}   metrics ${JSON.stringify(run.metrics)}`);
        print(`          grant series ${JSON.stringify(run.dailyGrant)}`);
      }
    }
  });
});

describe('#1003 act L -- what a shower room costs, against what it earns', () => {
  it('prices the cheapest repair for hygiene from the buildable registry and the procurement table', () => {
    print('');
    print('=== ACT L: the price of the cheapest hygiene repair, read from `BUILDABLE_REGISTRY` and `PROCURABLE_MATERIALS` ===');
    const price = (itemId: string): number => procurableMaterial(itemId)?.unitPriceMinorUnits ?? 0;
    const costOf = (buildableId: string): { money: number; work: number; materials: string } => {
      const definition = BUILDABLE_REGISTRY.get(buildableId)!;
      let money = 0;
      for (const requirement of definition.materialsRequired) money += price(requirement.itemId) * requirement.quantity;
      return {
        money,
        work: definition.workRequired,
        materials: definition.materialsRequired.map((requirement) => `${String(requirement.quantity)} x ${requirement.itemId}`).join(' + '),
      };
    };
    for (const buildableId of ['wall-brick', 'door-wooden', 'shower-head-brick', 'bed-wooden', 'toilet-brick']) {
      const cost = costOf(buildableId);
      print(`  ${buildableId.padEnd(18)} ${String(cost.money).padStart(4)} minor units, ${String(cost.work).padStart(3)} work  (${cost.materials})`);
    }
    print(`  item prices: item.brick ${String(price('item.brick'))}, item.wood-plank ${String(price('item.wood-plank'))}`);

    // A rectangle's perimeter is 2*(w+h) edge segments -- `wallRoomPerimeter`
    // writes a north edge for every column of the top row and of the row
    // below, and a west edge for every row of the left column and of the
    // column to the right -- and exactly one of them is the doorway.
    for (const [label, rect, heads] of [
      ['room.shower-room, authored 3x3 minimum, 2 heads', SHOWER_NEAR, 2],
      ['room.shower-room, 5x5 with 8 heads', SHOWER_BIG, 8],
    ] as const) {
      const segments = 2 * (rect.width + rect.height);
      const walls = segments - 1;
      const money = walls * costOf('wall-brick').money + costOf('door-wooden').money + heads * costOf('shower-head-brick').money;
      const work = walls * costOf('wall-brick').work + costOf('door-wooden').work + heads * costOf('shower-head-brick').work;
      print(
        `  ${label}: ${String(segments)} perimeter segments = ${String(walls)} wall-brick + 1 door-wooden, plus ${String(heads)} shower-head-brick` +
        ` => ${String(money)} minor units and ${String(work)} work`,
      );
    }
    print('  room.yard, authored 8x8 minimum: no `enclosed` requirement, no `object` requirement => 0 minor units and 0 work');

    // What the treasury actually paid, rather than what the arithmetic above
    // says it should: `build` buys materials through `PurchaseMaterials`, and
    // walls are written by `wallRoomPerimeter` rather than ordered, so this
    // number is the *objects* only and is printed beside the arithmetic rather
    // than instead of it.
    const bare = build({ prisoners: 4, yards: 0, bricks: HYGIENE_BRICKS });
    const showered = build({ prisoners: 4, yards: 0, showerRooms: 1, showerPlacement: 'near', bricks: HYGIENE_BRICKS });
    print(`  treasury after building, n=4, ${String(HYGIENE_BRICKS)} bricks bought either way: no shower ${String(bare.treasury.balanceMinorUnits)}, one shower room ${String(showered.treasury.balanceMinorUnits)} (walls are written by the fixture, not ordered, so this is the objects only)`);

    print('  against the earnings: the state pays 300 a place a day and withholds 40 a place a day per unmet need (`src/simulation/economy/income.ts`),');
    print('  so one need turned from unmet to served is worth 40 x n a day: 160 at n=4, 2000 at n=50, 4000 at n=100.');
  });
});

describe('#1003 act M -- the yard and the shower room side by side, one prison', () => {
  it('measures bare, yard only, shower only and both, across population', () => {
    print('');
    print(`=== ACT M: one prison, four arms, seed 0x997, ${String(SETTLED_DAYS)} days ===`);
    print('  yard: 8x8 at the cell door (0 tiles). shower room: 3x3 at (9,21), doorway 6 tiles from the cell door. They do not overlap.');
    print('  n | arm          | grant | recovered vs bare | recreation unmet | hygiene unmet | recreation min/med | hygiene min/med');
    for (const population of POPULATIONS) {
      const base = { prisoners: population, bricks: HYGIENE_BRICKS } as const;
      const bare = measure({ ...base, yards: 0 }, SETTLED_DAYS);
      const yardOnly = measure({ ...base, yards: 1, yardPlacement: 'at-the-door' }, SETTLED_DAYS);
      const showerOnly = measure({ ...base, yards: 0, showerRooms: 1, showerPlacement: 'near' }, SETTLED_DAYS);
      const both = measure({ ...base, yards: 1, yardPlacement: 'at-the-door', showerRooms: 1, showerPlacement: 'near' }, SETTLED_DAYS);
      for (const [label, run] of [['bare', bare], ['yard only', yardOnly], ['shower only', showerOnly], ['both', both]] as const) {
        print(
          `${String(population).padStart(3)} | ${label.padEnd(12)} | ${String(run.settledGrant).padStart(5)} | ${String(run.settledGrant - bare.settledGrant).padStart(17)} | ` +
          `${String(run.needs.recreation.unmet).padStart(3)} of ${String(population).padStart(2)}       | ${String(run.needs.hygiene.unmet).padStart(3)} of ${String(population).padStart(2)}    | ` +
          `${String(run.needs.recreation.minPermille).padStart(4)}/${String(run.needs.recreation.medianPermille).padStart(4)}      | ` +
          `${String(run.needs.hygiene.minPermille).padStart(4)}/${String(run.needs.hygiene.medianPermille).padStart(4)}`,
        );
      }
      print(
        `      both: yard visits ${String(both.visits['action.yard-recreation'] ?? 0)} (perform ${String(both.performingTicks['action.yard-recreation'] ?? 0)}, travel ${String(both.travellingTicks['action.yard-recreation'] ?? 0)});` +
        ` shower visits ${String(both.visits['action.shower'] ?? 0)} (perform ${String(both.performingTicks['action.shower'] ?? 0)}, travel ${String(both.travellingTicks['action.shower'] ?? 0)})`,
      );
      print(`      both: histogram ${JSON.stringify(both.unmetHistogram)}  metrics ${JSON.stringify(both.metrics)}  grant series ${JSON.stringify(both.dailyGrant)}`);
      print(`      both: ${hygieneLine(both)}; yard ${String(both.peakYardUse)} of ${String(both.yardCapacity)}`);
      for (const needId of NEED_IDS) print(needLine(needId, both.needs[needId], both.occupiedPlaces));
    }
  });
});

describe('#1003 act N -- whether twenty days is long enough for hygiene', () => {
  it('runs n=50 for 20, 40 and 60 days and prints the whole grant series', () => {
    print('');
    print('=== ACT N: is the twenty-day readout settled? n=50, one 3x3 shower room, no yard ===');
    print('  WHY THIS ACT EXISTS. Act A\'s recreation series is flat from day 6 onward, so its day-20 readout is a settled');
    print('  state. Act I\'s hygiene series is NOT: with a shower room it is still climbing on day 20. `hygiene` decays at');
    print('  0.02 a tick = 48 levels a day and a prisoner arrives at NEED_MAX = 255, so nobody crosses');
    print('  STATE_INCOME_UNMET_NEED_LEVEL = 51 until day (255-51)/48 = 4.25 -- and what happens after that is what this act reads.');
    for (const placement of ['near', 'far'] as const) {
      for (const days of [20, 40, 60, 100, 140]) {
        const run = measure({ prisoners: 50, yards: 0, showerRooms: 1, showerPlacement: placement, bricks: HYGIENE_BRICKS }, days);
        const visits = run.visits['action.shower'] ?? 0;
        print(
          `  [${placement}] ${String(days).padStart(2)} days: grant ${String(run.settledGrant)}  hygiene unmet ${String(run.needs.hygiene.unmet)} of ${String(run.occupiedPlaces)}` +
          `  min/med/max ${String(run.needs.hygiene.minPermille)}/${String(run.needs.hygiene.medianPermille)}/${String(run.needs.hygiene.maxPermille)}` +
          `  visits ${String(visits)} = ${String(Math.round(visits / days))}/day  perform ${String(run.performingTicks['action.shower'] ?? 0)}` +
          `  travel ${String(run.travellingTicks['action.shower'] ?? 0)}`,
        );
        // **Not a percentage of a ceiling, because it exceeds one.** 2 places x
        // the 500-tick hygiene window is 1,000 place-ticks a day, and the far
        // arm books more than that -- so a shower that begins inside the
        // window keeps performing after the block that allowed it has closed,
        // and the window is a rate limit on *starts* rather than on ticks.
        print(`      shower place-ticks a day ${String(Math.round((run.performingTicks['action.shower'] ?? 0) / days))} against ${String(run.showerCapacity * 500)} = ${String(run.showerCapacity)} places x the 500-tick hygiene window`);
        print(`      histogram ${JSON.stringify(run.unmetHistogram)}   metrics ${JSON.stringify(run.metrics)}`);
        print(`      grant series ${JSON.stringify(run.dailyGrant)}`);
      }
    }
  });
});
