import { describe, expect, it } from 'vitest';
import {
  STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS,
  STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS,
  stateIncomeForPrisonerDayAt,
  unmetNeedCount,
} from '../../src/simulation/economy';
import { NEED_IDS, NEED_SCALE, type NeedId } from '../../src/simulation/prisoners/needs';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * **What an unserved need costs a prison that is otherwise well run**
 * ([ADR 0064](../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md),
 * issue #443's second half, issue #477).
 *
 * ## The measurement this file exists to answer
 *
 * #477 measured that in a *staffed* prison two needs pinned at zero cap the
 * sector risk score near 0.4824 against a `hotThreshold` of 0.65, so the prison
 * never riots and neglect costs it nothing -- *"a counter running down behind
 * glass"*. `tests/integration/room-gated-needs.test.ts` pins that split and is
 * deliberately left alone: the answer here is **not** a change to the riot
 * model, and the third case below is what says so with numbers rather than with
 * a promise.
 *
 * The answer is the income line. The state pays per prisoner-day per occupied
 * place, and it now pays less for a place whose occupant the prison is leaving
 * unserved (`src/simulation/economy/income.ts`). Every one of the six needs is
 * a term in that sum, which is what closes #443's *"five of six needs have no
 * downstream reader"* on the money side.
 *
 * ## Why this is driven and not constructed
 *
 * `tests/unit/economy-state-income.test.ts` sets need levels by hand and checks
 * the arithmetic. That proves the branch exists and nothing more. What is
 * asserted here is that a prison a **player could actually build**, left alone
 * for ten in-game days, walks into the reduction on its own: a named prisoner's
 * `hygiene` and `recreation` are followed down through the threshold, day by
 * day, and the payment is asserted against the day each crosses. Every command
 * below is one a player can send -- `PurchaseMaterials`, `ZoneRoom`,
 * `PlaceObject`, `HireStaff`, `AdmitPrisoner` -- with `wallRoomPerimeter` the
 * one shortcut, exactly as `room-gated-needs.test.ts` builds its prison.
 *
 * ## The cost is suspended, 2026-09-03, and the drive is not
 *
 * The owner ruled *"usuń na razie kary, zobaczymy jak pogram i ocenię
 * łatwość"* ("remove the penalties for now, we'll see how it plays and I'll
 * judge the ease") and
 * `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` is `0` while they play.
 *
 * **What that changes here is the money and nothing else.** The finding this
 * file exists for -- that a prison a player could build walks into unmet
 * `hygiene` and `recreation` on its own, on measured days -- is a fact about
 * need decay and room gating, and every trajectory below is asserted
 * unchanged. What each day *pays* is now the flat rate, so each case asserts
 * that **and** what the same measured day would pay at ADR 0064's own `40`,
 * through `stateIncomeForPrisonerDayAt`. Nothing is deleted and no figure this
 * file measured is lost: the schedules that used to be the subject are still
 * run, against the same driven prison, at the rate the owner suspended.
 */

/** Distinct from every other seed in the suite, so no shared fixture can make these figures true by accident. */
const SEED = 0x443;

/** `src/main.ts`'s `NEW_PRISON_ORIGIN_TILE`: where a hire stands and an admission arrives. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Far longer than any run here, so `PrisonerDischargeSystem` cannot release anybody mid-measurement. */
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

const SHOWER = { x: 26, y: 1, width: 3, height: 3 } as const;
/**
 * **16x8 rather than `room.yard`'s 8x8 authored minimum, and the extra eight
 * columns are this file's subject rather than a change to it.**
 *
 * `SERVED` is *"the same prison with the two rooms ADR 0054 decision 1 rules
 * `hygiene` and `recreation` gated behind"*, and every assertion below reads
 * from a prison that genuinely serves both needs to all eight prisoners. Since
 * issue #532 a yard is bounded by its own ground -- `floor(tiles /
 * TILES_PER_OPEN_GROUND_PLACE)`, 16 tiles a place -- so the 8x8 minimum admits
 * **4** and eight prisoners no longer all get outside. Measured on this
 * prison with the 8x8 left as it was: three of the ten days paid 2,360 instead
 * of 2,400, one prisoner below `STATE_INCOME_UNMET_NEED_LEVEL` on recreation,
 * and `served - neglected` fell from 3,200 to 3,080.
 *
 * That is the new rule working, not this file breaking: a minimum yard is
 * undersized for eight. Taking the measured numbers as the new expectation
 * would have quietly renamed this suite -- *"a prison that serves every need"*
 * would have described a prison that does not -- so the fixture is corrected
 * to still be the prison its name claims. 128 tiles is 8 places, one per
 * prisoner, and it costs the player nothing but ground they already own,
 * which is the remedy the rule is designed to leave open.
 * `tests/integration/yard-and-common-room.test.ts` asserts the crowded case
 * deliberately, on a prison built to have it.
 *
 * It is anchored at x 12 rather than at the 8x8's x 20 for a reason unrelated
 * to any of the above: 20 + 16 leaves the parcel this prison owns, and every
 * command here is asserted accepted.
 */
const YARD = { x: 12, y: 20, width: 16, height: 8 } as const;
const SECTOR = 'security-sector.prison';

/**
 * **Ten in-game days**, at `DAY_LENGTH_TICKS` 2,400 -- long enough for both
 * room-gated needs to decay from full to the floor and for the reduction to
 * settle.
 *
 * Ten and not twenty: `24_000 / 2_400` is 10, and
 * `tests/integration/room-gated-needs.test.ts` called the same window "twenty
 * in-game days" in three places until the commit that added this file.
 */
const DAYS = 10;
const RUN_UNTIL = DAY_LENGTH_TICKS * DAYS;

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

interface Plan {
  /** One furnished `room.cell` per prisoner: a bed and a toilet. */
  readonly prisoners: number;
  readonly guards: number;
  readonly shower: boolean;
  readonly yard: boolean;
}

function build(plan: Plan): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  const cells = Array.from({ length: plan.prisoners }, (_unused, index) => cellRect(index));

  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: plan.prisoners }));
  submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: plan.prisoners + 2 }));

  for (const rect of cells) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  if (plan.shower) wallRoomPerimeter(runtime.world, SHOWER, { doors: runtime.navigation.doors });
  if (plan.yard) wallRoomPerimeter(runtime.world, YARD, { doors: runtime.navigation.doors });

  cells.forEach((rect, index) => submit(runtime, `zone-cell-${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  if (plan.shower) submit(runtime, 'zone-shower', packCommand({ type: 'ZoneRoom', roomId: 'room.shower-room', ...SHOWER }));
  if (plan.yard) submit(runtime, 'zone-yard', packCommand({ type: 'ZoneRoom', roomId: 'room.yard', ...YARD }));

  cells.forEach((rect, index) => {
    submit(runtime, `bed-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed-${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y }));
    submit(runtime, `wc-${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `wc-${String(index)}`, definitionId: 'toilet-brick', x: rect.x + 1, y: rect.y }));
  });
  if (plan.shower) {
    submit(runtime, 'head-1', packCommand({ type: 'PlaceObject', orderId: 'head-1', definitionId: 'shower-head-brick', x: SHOWER.x, y: SHOWER.y }));
    submit(runtime, 'head-2', packCommand({ type: 'PlaceObject', orderId: 'head-2', definitionId: 'shower-head-brick', x: SHOWER.x + 1, y: SHOWER.y }));
  }

  stepTo(runtime, 1_000);
  for (let index = 0; index < plan.guards; index += 1) {
    submit(runtime, `hire-${String(index)}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
  for (let index = 0; index < plan.prisoners; index += 1) {
    submit(runtime, `admit-${String(index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

interface DaySample {
  /** The last tick of the in-game day, which is the tick the payment is settled on. */
  readonly boundaryTick: number;
  /** What the state pays for the day just served, read from the system rather than recomputed. */
  readonly grantMinorUnits: number;
  /** How many of the watched prisoner's six needs are unmet at that moment. */
  readonly watchedUnmetNeeds: number;
  /** The watched prisoner's `hygiene` and `recreation`, in whole levels with the sub-level part kept. */
  readonly watchedHygiene: number;
  readonly watchedRecreation: number;
  readonly treasuryMinorUnits: number;
}

interface Run {
  readonly runtime: SimulationRuntime;
  readonly days: readonly DaySample[];
  /** The highest `scoreSectorRisk` the derived sector reached across the run. */
  readonly peakRisk: number;
}

/**
 * Runs the prison to `RUN_UNTIL` and samples **one named prisoner** -- the
 * occupant of slot 0, resolved once by entity id and re-resolved by id at every
 * boundary so a slot recycle could not silently swap who is being measured --
 * at each day boundary, alongside what the state pays that day.
 *
 * Risk is sampled every tick rather than at the boundary: `peakRisk` is here to
 * assert that the riot model has **not** moved, and a boundary sample could
 * step over a peak.
 */
function run(plan: Plan): Run {
  const runtime = build(plan);
  const store = runtime.prisoners.entityStore;
  stepTo(runtime, 1_100);
  const watched = store.getIdByIndex(0);

  const days: DaySample[] = [];
  let peakRisk = 0;

  for (let tick = runtime.kernel.tick + 1; tick <= RUN_UNTIL; tick += 1) {
    stepTo(runtime, tick);

    const risk = runtime.sectorRisk.getScore(SECTOR);
    if (risk > peakRisk) peakRisk = risk;

    if (tick % DAY_LENGTH_TICKS !== DAY_LENGTH_TICKS - 1) continue;
    const index = store.getIndex(watched);
    const level = (needId: NeedId): number => runtime.prisoners.needs.levels[needId][index]! / NEED_SCALE;
    days.push({
      boundaryTick: tick,
      // The system's own figure at the payment tick, which
      // `tests/unit/economy-state-income.test.ts` pins as equal to what is
      // credited. Reading it here rather than differencing the balance keeps
      // payroll out of the number.
      grantMinorUnits: runtime.stateIncome.accruedThisDay(tick),
      watchedUnmetNeeds: unmetNeedCount(runtime.prisoners.needs, index),
      watchedHygiene: level('hygiene'),
      watchedRecreation: level('recreation'),
      treasuryMinorUnits: runtime.treasury.balanceMinorUnits,
    });
  }

  return { runtime, days, peakRisk };
}

/** #477's prison: eight prisoners, eight furnished cells, one guard, no shower room and no yard. */
const NEGLECTED = { prisoners: 8, guards: 1, shower: false, yard: false } as const;
/** The same prison with the two rooms ADR 0054 decision 1 rules `hygiene` and `recreation` gated behind. */
const SERVED = { prisoners: 8, guards: 1, shower: true, yard: true } as const;

describe('a staffed prison that leaves two needs unserved is paid less for every day it does', () => {
  it('follows one prisoner`s hygiene and recreation across the line, and prices the day at each crossing', () => {
    const { days } = run(NEGLECTED);
    expect(days).toHaveLength(DAYS);

    /*
     * Read down `watchedHygiene`: 227.2 on day 1, falling by 48 a day -- 2,400
     * ticks of `NEED_DECAY_PER_TICK.hygiene` 0.02 -- with no shower room and no
     * laundry to restore it. It crosses `STATE_INCOME_UNMET_NEED_LEVEL` (51) on
     * day 5 and reaches 0 on day 6. `recreation` decays more slowly (0.015) and
     * crosses on day 7.
     *
     * So the schedule below is not a table of magic numbers: it is 8 places at
     * 300 while both needs are served, at 260 for the two days only `hygiene`
     * is unmet, and at 220 once `recreation` is too.
     */
    expect(days.map((day) => day.watchedHygiene)).toEqual([227.2, 179.2, 131.2, 83.2, 35.2, 0, 0, 0, 0, 0]);
    expect(days.map((day) => day.watchedRecreation)).toEqual([234.15, 198.15, 162.15, 126.15, 90.15, 54.15, 18.15, 0, 0, 0]);
    expect(days.map((day) => day.watchedUnmetNeeds)).toEqual([0, 0, 0, 0, 1, 1, 2, 2, 2, 2]);

    // **What the prison is paid for those days, at the rate the owner
    // suspended on 2026-09-03: the flat 2,400, every day, both needs unmet or
    // not.** This is what the game pays now, and the schedule it replaced --
    // `[2_400, 2_400, 2_400, 2_400, 2_080, 2_080, 1_760, 1_760, 1_760, 1_760]`
    // -- is not deleted, it is re-derived from the same measured days at ADR
    // 0064's own rate immediately below.
    expect(days.map((day) => day.grantMinorUnits)).toEqual(Array.from({ length: DAYS }, () => 2_400));
    expect(days.reduce((sum, day) => sum + day.grantMinorUnits, 0)).toBe(24_000);

    // The suspended schedule, priced off the *measured* unmet counts rather
    // than written down again: eight places at 300 while both needs are
    // served, at 260 for the two days only `hygiene` is unmet, and at 220 once
    // `recreation` is too. Ten days of the same eight cells would be 20,800
    // where a prison meeting its needs is paid 24,000 -- written as the total
    // rather than as a percentage, because the total is what the treasury
    // would be short.
    const atAdr0064Rate = days.map((day) => 8 * stateIncomeForPrisonerDayAt(40, day.watchedUnmetNeeds));
    expect(atAdr0064Rate).toEqual([2_400, 2_400, 2_400, 2_400, 2_080, 2_080, 1_760, 1_760, 1_760, 1_760]);
    expect(atAdr0064Rate.reduce((sum, grant) => sum + grant, 0)).toBe(20_800);

    // And the two agree exactly when the withheld rate is what it is today,
    // so restoring the constant makes the paid series become the priced one
    // with no edit here.
    expect(days.map((day) => day.grantMinorUnits)).toEqual(
      days.map((day) => 8 * stateIncomeForPrisonerDayAt(STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS, day.watchedUnmetNeeds)),
    );
  });

  it('and the neglect is real throughout, not a prison that had stopped simulating', () => {
    const { runtime, days } = run(NEGLECTED);

    // Nobody is idle and no route fails: the prisoners are living an ordinary
    // day and there is simply nowhere to wash and nowhere to exercise.
    expect(runtime.prisoners.actionSystem.getMetrics()).toMatchObject({ unmetDemandCycles: 0, routeFailures: 0 });
    // All eight are housed all the way through, so the reduction is about
    // conditions and never about an empty prison.
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(8);
    expect(runtime.prisoners.roomInstances.residentIds()).toHaveLength(8);
    expect(days.every((day) => day.treasuryMinorUnits > 0)).toBe(true);
  });
});

describe('a prison that serves every need is paid exactly what it was paid before', () => {
  it('pays the undiminished rate on all ten days', () => {
    const { days, runtime } = run(SERVED);

    // The property the withheld schedule was chosen for: at zero unmet needs
    // the rate is untouched, so this change can only ever take money off a
    // prison that is withholding something. `8 x 300` is written out rather
    // than derived from the production expression (#375).
    expect(days.map((day) => day.grantMinorUnits)).toEqual(Array.from({ length: DAYS }, () => 2_400));
    expect(STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS * 8).toBe(2_400);
    expect(days.map((day) => day.watchedUnmetNeeds)).toEqual(Array.from({ length: DAYS }, () => 0));

    /*
     * And no need of the watched prisoner comes close to the line at the end of
     * the run, which is the margin `STATE_INCOME_UNMET_NEED_LEVEL` was chosen
     * against: a served need must not trip the threshold merely by being
     * sampled at the bottom of its own cycle.
     */
    const index = runtime.prisoners.entityStore.getIndex(runtime.prisoners.entityStore.getIdByIndex(0));
    for (const needId of NEED_IDS) {
      expect(runtime.prisoners.needs.get(index, needId), `${needId} at the end of the run`).toBeGreaterThan(100);
    }
  });

  it('is worth nothing more over ten days than the same prison without the two rooms while the cost is suspended, and 3,200 at ADR 0064`s rate', () => {
    const servedDays = run(SERVED).days;
    const neglectedDays = run(NEGLECTED).days;
    const served = servedDays.reduce((sum, day) => sum + day.grantMinorUnits, 0);
    const neglected = neglectedDays.reduce((sum, day) => sum + day.grantMinorUnits, 0);

    // **The incentive is gone for now, and this is the measurement of that.**
    // With nothing withheld the two prisons are paid the same, so the two
    // rooms return nothing at all on the income line -- which is the thing the
    // owner is about to judge by playing, and the reason it is asserted rather
    // than left to be inferred.
    expect(served - neglected).toBe(0);

    // The incentive at ADR 0064's own rate, stated as the number a player
    // would weigh a build order against, and priced off the same measured
    // unmet counts. `room.yard` needs no object at all, so half of this is the
    // return on zoning 16x8 of ground the prison already owns -- see the
    // `YARD` comment for why the rectangle is twice the authored minimum and
    // what it costs (nothing) to make it so.
    const atRate = (days: readonly { readonly watchedUnmetNeeds: number }[]): number =>
      days.reduce((sum, day) => sum + 8 * stateIncomeForPrisonerDayAt(40, day.watchedUnmetNeeds), 0);
    expect(atRate(servedDays) - atRate(neglectedDays)).toBe(3_200);
  });
});

describe('the riot model is untouched, which is the point of putting the cost on the income line', () => {
  it('leaves #477`s staffed row where the coverage reader put it: peak 0.4742, no riot, no incident', () => {
    const { runtime, peakRisk } = run(NEGLECTED);

    /*
     * `tests/integration/room-gated-needs.test.ts` pins this same split on its
     * own seed and its own window, and would fail the moment
     * `DEFAULT_SECTOR_RISK_POLICY` moved. It is asserted a second time here, on
     * a different seed, because this file is the one that *adds* a consequence
     * to an unmet need and the standing hazard is doing it by quietly making
     * the riot easier. ADR 0061 declined to feed `contrabandPressure` into the
     * score for exactly this reason.
     */
    /*
     * **0.4824 until issue #588, and the move is downward**, which is the
     * direction that keeps the hazard this case guards against unrealised. The
     * sixth of the mean that `safety` contributes went to zero: this prison's
     * one guard covers its sector, so `SafetyCoverageSystem` holds `safety` at
     * `NEED_MAX` where a bed used to hold it around 240. A staffed prison got
     * quieter, not easier to riot.
     */
    expect(peakRisk).toBeCloseTo(0.4742, 4);
    expect(runtime.incidents.all()).toEqual([]);
    expect(runtime.incidentTriggerSystem.getMetrics().riotsTriggered).toBe(0);
    expect(runtime.deploymentSystem.getCoverageReport(runtime.kernel.tick)).toEqual([
      { sectorId: SECTOR, required: 1, assigned: 1, shortage: 0 },
    ]);
  });
});

describe('the readout beside the balance says what the boundary will actually pay', () => {
  /**
   * The "earned today" chip is an existing promise to the player
   * (`docs/HUD_PROJECTIONS.md`, `src/ui/hud/messages.ts`), and it is derived on
   * the simulation side by `projectStatusStrip`. Deriving it from
   * `totalOccupancy` and the flat rate -- which is what it did until this
   * change -- would make it promise money the day boundary then declines to
   * pay, which is the one thing `AGENTS.md` puts outside an agent's mandate.
   *
   * So this is not an extra readout. It is the assertion that the readout the
   * player already has did not become a lie.
   *
   * **That is a promise about agreement, not about a figure**, which is why
   * the suspension of the withheld rate leaves this case's subject intact: the
   * chip must say whatever the boundary will pay. It said `1_760` for the
   * neglected prison while the rate was `40`; today both prisons are paid
   * 2,400 and the chip must say 2,400 for both. The agreement is asserted
   * against the system's own figure so that it holds at either rate.
   */
  it('reports what the boundary will actually pay through the real projection, not a rate of its own', () => {
    const neglected = run(NEGLECTED).runtime;
    const served = run(SERVED).runtime;

    // Projected at the last tick of a day, which is where the accrual equals
    // the whole day's payment. Both runtimes are past their tenth day, so what
    // is read is what tomorrow pays at today's conditions.
    const boundary = DAY_LENGTH_TICKS - 1;
    expect(projectStatusCounts(neglected, boundary).stateIncomeAccruedTodayMinorUnits).toBe(
      neglected.stateIncome.accruedThisDay(boundary),
    );
    expect(projectStatusCounts(served, boundary).stateIncomeAccruedTodayMinorUnits).toBe(
      served.stateIncome.accruedThisDay(boundary),
    );
    expect(projectStatusCounts(neglected, boundary).stateIncomeAccruedTodayMinorUnits).toBe(2_400);
    expect(projectStatusCounts(served, boundary).stateIncomeAccruedTodayMinorUnits).toBe(2_400);

    // Same eight occupied places in both, so the difference is conditions and
    // nothing else -- which is exactly what a chip driven off the count could
    // not have said.
    expect(projectStatusCounts(neglected, boundary).roomOccupants).toBe(projectStatusCounts(served, boundary).roomOccupants);
  });
});

describe('determinism', () => {
  it('two runs from one seed produce one grant series and one treasury series', () => {
    const first = run(NEGLECTED);
    const second = run(NEGLECTED);
    expect(second.days).toEqual(first.days);
    expect(second.runtime.treasury.balanceMinorUnits).toBe(first.runtime.treasury.balanceMinorUnits);
  });
});
