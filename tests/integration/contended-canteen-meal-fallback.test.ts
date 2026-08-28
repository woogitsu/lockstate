import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
 * Consequences, claim 3: **"Under contention the losers eat a worse meal
 * instead of nothing."**
 *
 * > **Amended for [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md),
 * > and the sentence below that says *"half the population is refused a seat
 * > in every meal block, by the ascending entity-index scan"* is no longer
 * > true of this prison.** It was exactly true while an arrival was an
 * > abstracted teleport: the six chose and arrived in the same tick, so the
 * > three seats were handed out by the scan and the other three were refused
 * > at once. Since prisoners walk, no two of them reach the canteen on the
 * > same tick from six cells at six different distances, `findAvailableForUse`
 * > has a seat to offer whenever one of them chooses, and **`action.eat-in-cell`
 * > is now absent from every row of both arms**.
 * >
 * > The ceiling has not stopped biting -- one table still caps the canteen at
 * > three at once and buys the prison 1,788 canteen ticks against the two-table
 * > control's 3,640, with a worst-off prisoner at 17.5 of `NEED_MAX` against
 * > 174.5 -- so this file now measures contention in food rather than in the
 * > fallback. Claim 3 itself is guarded by
 * > `tests/unit/prisoners-action-system.test.ts`'s *"falls back when the
 * > canteen exists but is full"*, which stands the prisoner on the room's own
 * > anchor tile so that the refusal is structural rather than a race. Every
 * > figure in the table below was taken before that change and is kept as the
 * > record of what the abstracted arrival produced.
 *
 * ## Why this file exists
 *
 * That was the last of ADR 0041's Consequences with nothing behind it.
 * `tests/integration/cell-only-meal-fallback.test.ts` measures the *base* case
 * -- one prisoner, no canteen at all -- and `furnished-prison-loop.test.ts`
 * measures the preference with a canteen that seats everybody. Neither is a
 * contention case, and the one contention fixture in the repository
 * (`tests/unit/prisoners-concurrent-room-use.test.ts`) houses nobody by design,
 * so `action.eat-in-cell` is structurally out of its reach: its own comment
 * says *"no accommodation is set for anybody here, so it could not resolve a
 * target anyway"*. ADR 0029's amendment measured only the **pre-fix**
 * starvation. So the sentence had never been run.
 *
 * ## The prison, and why it is shaped like this
 *
 * Six prisoners, six furnished cells, and one canteen holding **one** `3x2`
 * dining table. `object.dining-table` is the only object in the catalogue
 * carrying `'dining'` and `concurrentUseCapacityFor` sums footprint widths, so
 * the canteen's dining ceiling is **3** against **6** prisoners: half the
 * population is refused a seat in every meal block, by the ascending
 * entity-index scan that decides contention.
 *
 * The control is the same prison with a **second** dining table ordered --
 * every rectangle, every other placement, and the same 12 planks and 6 bricks
 * bought and paid for, so the only difference between the two runs is one
 * `PlaceObject` command and the ceiling it derives. Re-measured with the
 * materials held equal: the one-table numbers are unchanged from the run where
 * only nine planks were bought, so nothing below is a delivery-timing artefact.
 *
 * ## The result, and it holds
 *
 * Every figure below is a real run of this file's prison over 14,000 ticks,
 * with the "before" column taken by reverting the candidate walk in
 * `beginNextAction` to `selectBestAction`'s single answer -- the pre-ADR-0041
 * code -- and changing nothing else.
 *
 * | | canteen ticks | cell-meal ticks | lowest hunger |
 * | --- | --- | --- | --- |
 * | scan positions 0-2, ceiling 3 | 440 | 160 | 177.5 |
 * | scan positions 3-5, ceiling 3 | 320 | 240 | 178.5 |
 * | every prisoner, ceiling 6 | 600 | **0** | 177.5 |
 * | *before the fallback*, positions 0-2, ceiling 3 | 760 | 0 | 177.5 |
 * | *before the fallback*, positions 3-5, ceiling 3 | **40** | 0 | **0.0** |
 *
 * Three things follow, and the third is not what ADR 0041 predicted.
 *
 * 1. **The losers eat, and "instead of nothing" is close to literal.** Before
 *    the fallback the three refused prisoners performed **one** 40-tick meal
 *    between admission and tick 14,000 and then sat at hunger **0.0**; after
 *    it, all six perform both meals and none drops below 177.5 of `NEED_MAX`.
 * 2. **It is a fallback and not a replacement.** With six seats the cell meal
 *    disappears entirely, so the 160/240 ticks above are caused by the
 *    contention and not by the prison's shape.
 * 3. **The fallback also shrank the unfairness, which ADR 0041 says it does
 *    not.** Alternative A states *"It does not fix fairness: under contention
 *    the same six still get the better meal for ever"*. That was exactly true
 *    of the code it described -- 760 canteen ticks against 40 is a lockout --
 *    and it is much less true of the code that shipped: 440 against 320, about
 *    58% of the seats rather than 95%. The cause is mechanical rather than
 *    lucky. A claim ends when the *action* ends (ADR 0029, `minDurationTicks:
 *    40`), so a meal block is re-contended repeatedly, and a low-index prisoner
 *    who takes a cell meal on one of those passes hands the seat to a
 *    high-index one. The skew is real and issue #434 is still its fix; it is a
 *    smaller number than the ADR's prose implies. Recorded here rather than in
 *    `docs/adr/`, which this agent does not own.
 */

const SEED = 0x0b1ec7;

const PRISONERS = 6;

/** `room.cell`'s authored 2x3 minimum, six of them in a row along the top of the owned chunk. */
const CELLS = Array.from({ length: PRISONERS }, (_unused, n) => ({ x: n * 2, y: 0 }));
/** `room.canteen`'s authored 6x6 minimum, clear of every cell. */
const CANTEEN_RECT = { x: 8, y: 8, width: 6, height: 6 } as const;
const CANTEEN_ID = 'room.canteen:8:8';

/**
 * The bill, identical in both runs so the control differs by one command and
 * nothing else. `materialsRequired[0].quantity = footprint.width`: one plank per
 * `1x1` bed, one brick per `1x1` toilet, three planks per `3x2` dining table.
 */
const PLANKS = PRISONERS + 2 * 3;
const BRICKS = PRISONERS;

/** Every order is complete well before this; the timeline is asserted, not assumed. */
const BUILT_BY = 2_000;
/** Long enough for several full general-population days, so a meal block is contended repeatedly. */
const WATCH_UNTIL = 14_000;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Long enough that no sentence ends inside the window. */
const ADMISSION = { sentenceLengthTicks: 100_000, priorIncidents: 0 } as const;

/** `2` is `performing` in `ACTION_PHASES`; the phase names are not exported. */
const PERFORMING_PHASE = 2;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function prison(diningTables: 1 | 2): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: PLANKS }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: BRICKS }));
  for (const [n, cell] of CELLS.entries()) {
    wallRoomPerimeter(runtime.world, { x: cell.x, y: cell.y, width: 2, height: 3 }, { doors: runtime.navigation.doors });
    submit(runtime, `zone-cell-${n}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', x: cell.x, y: cell.y, width: 2, height: 3 }));
  }
  wallRoomPerimeter(runtime.world, CANTEEN_RECT, { doors: runtime.navigation.doors });
  submit(runtime, 'zone-canteen', packCommand({ type: 'ZoneRoom', roomId: 'room.canteen', ...CANTEEN_RECT }));
  for (const [n, cell] of CELLS.entries()) {
    submit(runtime, `bed-${n}`, packCommand({ type: 'PlaceObject', orderId: `o-bed-${n}`, definitionId: 'bed-wooden', x: cell.x, y: cell.y }));
    submit(runtime, `toilet-${n}`, packCommand({ type: 'PlaceObject', orderId: `o-toilet-${n}`, definitionId: 'toilet-brick', x: cell.x + 1, y: cell.y }));
  }
  for (let t = 0; t < diningTables; t += 1) {
    submit(runtime, `dining-table-${t}`, packCommand({ type: 'PlaceObject', orderId: `o-dt-${t}`, definitionId: 'dining-table-wooden', x: 8 + t * 3, y: 8 }));
  }
  return runtime;
}

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  readonly diningCeiling: number;
  /** Performing ticks per action, per prisoner, indexed by admission order -- which is the ascending entity index the contention scan runs in. */
  readonly perPrisoner: readonly Readonly<Record<string, number>>[];
  readonly maxUseClaims: number;
  readonly lowestHunger: readonly number[];
}

/**
 * Six prisoners admitted into the finished prison, every one of them watched
 * **every tick**.
 *
 * Every tick rather than every twentieth for the reason
 * `furnished-prison-loop.test.ts` records: a performed action is short and a
 * coarse sample can miss one entirely.
 */
function watched(diningTables: 1 | 2): WatchedRun {
  const runtime = prison(diningTables);
  stepTo(runtime, BUILT_BY);
  for (let n = 0; n < PRISONERS; n += 1) {
    submit(runtime, `admit-${n}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }

  const store = runtime.prisoners.entityStore;
  const perPrisoner: Record<string, number>[] = Array.from({ length: PRISONERS }, () => ({}));
  const lowestHunger = Array.from({ length: PRISONERS }, () => Number.POSITIVE_INFINITY);
  let maxUseClaims = 0;

  for (let tick = runtime.kernel.tick + 1; tick <= WATCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    for (let n = 0; n < PRISONERS; n += 1) {
      const index = store.getIndex(store.getIdByIndex(n));
      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      if (runtime.prisoners.currentAction.phase[index] === PERFORMING_PHASE && actionIndex >= 0) {
        const id = DEFAULT_ACTIONS[actionIndex]!.id;
        perPrisoner[n]![id] = (perPrisoner[n]![id] ?? 0) + 1;
      }
      const hunger = runtime.prisoners.needs.levels.hunger[index]! / NEED_SCALE;
      if (hunger < lowestHunger[n]!) lowestHunger[n] = hunger;
    }
    maxUseClaims = Math.max(maxUseClaims, runtime.prisoners.roomInstances.totalUseClaims);
  }

  const canteen = runtime.prisoners.roomInstances.getById(CANTEEN_ID)!;
  return {
    runtime,
    diningCeiling: runtime.prisoners.roomInstances.concurrentUseCapacityFor(canteen, 'dining'),
    perPrisoner,
    maxUseClaims,
    lowestHunger,
  };
}

describe('six prisoners and a canteen that seats three', () => {
  it('feeds every one of them, and the three the ceiling squeezes eat measurably less', () => {
    const run = watched(1);

    expect(run.runtime.refusals.count, 'an overlapping footprint would be a refusal, not a wrong number').toBe(0);
    expect(run.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: PRISONERS, failedCount: 0 });

    /*
     * The precondition, read off the derivation rather than restated: one
     * `3x2` table is three dining places against six prisoners, so the ceiling
     * genuinely binds -- and `maxUseClaims` is the proof that it bit, since a
     * fourth simultaneous diner would have pushed it to 4.
     */
    expect(run.diningCeiling, 'one 3-wide dining table, and nothing else in the catalogue carries `dining`').toBe(3);
    expect(run.diningCeiling).toBeLessThan(PRISONERS);
    expect(run.maxUseClaims, 'never a fourth diner: the ceiling bit rather than being advisory').toBe(3);

    /*
     * **ADR 0041 Consequences claim 3, measured.** Exact counts, because they
     * are deterministic -- one seed, one command order, no RNG on this path --
     * and they are a measurement of the loop that is supposed to move if the
     * loop changes.
     *
     * The split by scan position is the ascending entity-index contention rule
     * `docs/PRISONER_OPERATIONS.md` records: the first three admitted take more
     * of the canteen, the last three more of the cell. Both halves eat.
     *
     * **Every count here moved on
     * [ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md),
     * and the reason is one entry rather than six.** This prison has a canteen
     * and nothing else, so its three room-gated blocks -- both
     * `work`/`education` blocks and the `recreation`-only one -- resolved no
     * candidate at all and the six stood through 1,200 ticks a day.
     * `'free-association'` is now legal in those blocks, so the 4,200 ticks
     * that appear in every row are ticks that used to be nothing. The meal
     * counts moved with them because the association that fills `[1000,1200)`
     * runs one reconsideration cycle into `[1200,1300)`, which shifts who is
     * scanned first at the moment the canteen's three seats are handed out:
     * the split flattens from 440/160 and 320/240 to 200 cell meals for
     * everybody, with the first three taking 360 canteen ticks and the last
     * three 400. **The contention itself is unchanged** -- `diningCeiling` is
     * still 3, `maxUseClaims` is still 3, and every one of the six still eats
     * both meals -- and association feeds nothing, so no hunger figure moved
     * for any reason but timing.
     *
     * **Two of them moved again on
     * [ADR 0057](../../docs/adr/0057-what-a-riot-does-to-a-prisoners-day.md),
     * and this prison riots.** Six neglected prisoners with no shower room, no
     * yard, no common room and no classroom put `needsPressure` over the line
     * with no guard on the post, and `IncidentTriggerSystem` opens a
     * severity-7 riot naming all six at tick 13,450 -- 550 ticks before
     * `WATCH_UNTIL`. A riot now replaces its participants' timetable with
     * `RIOT_ALLOWED_CATEGORIES`, which does not include `hygiene`, so those
     * last 550 ticks hold no `action.use-toilet`: 100 (or 80) of it becomes
     * `action.free-association` in every row, plus the 60 (or 40) ticks the
     * same prisoners used to spend idle between reconsiderations. **`sleep`,
     * `eat-meal` and `eat-in-cell` are unchanged in all six rows**, which is
     * both why the re-baseline is attributable to the riot and why this file's
     * subject is untouched: the riot opens long after the meal blocks this
     * file is about have been contended eight days running.
     */
    expect(run.perPrisoner).toEqual([
      { 'action.sleep': 2_400, 'action.eat-meal': 344, 'action.use-toilet': 600, 'action.free-association': 3_304 },
      { 'action.sleep': 3_000, 'action.eat-meal': 144, 'action.use-toilet': 520, 'action.free-association': 3_980 },
      { 'action.sleep': 3_000, 'action.eat-meal': 336, 'action.use-toilet': 460, 'action.free-association': 3_680 },
      { 'action.sleep': 3_000, 'action.eat-meal': 132, 'action.use-toilet': 640, 'action.free-association': 3_800 },
      { 'action.sleep': 3_000, 'action.eat-meal': 468, 'action.use-toilet': 460, 'action.free-association': 3_720 },
      { 'action.sleep': 3_000, 'action.eat-meal': 364, 'action.use-toilet': 460, 'action.free-association': 3_840 },
    ]);

    /*
     * **The cell meal is gone from every row, and this is the assertion that
     * used to require it.** It read, per prisoner, `expect(counts['action.
     * eat-in-cell'] ?? 0).toBeGreaterThan(0)` under the heading *"the cell
     * meal was performed by everybody"*. That was true of an abstracted
     * arrival and is false since ADR 0059, in both arms of this file.
     *
     * What is measured: with a walk between choosing and arriving, no hungry
     * prisoner in this prison ever *chooses* at an instant when all three
     * seats are held, so `findAvailableForUse` always answers, `action.
     * eat-meal` always resolves, and ADR 0041's candidate walk never reaches
     * the lower-scoring cell meal. What is **not** established here is why the
     * instants no longer coincide -- staggered arrival is the obvious
     * candidate and this file does not separate it from the block simply
     * running out. The ceiling still bites: `maxUseClaims` is 3 above against
     * 6 in the two-table control, and the cost of that shows up in the meal
     * counts and the hunger floors rather than in a fallback.
     *
     * ADR 0041 Consequences claim 3 is therefore no longer guarded *here*. It
     * is guarded, in the same-cycle form the ADR states it in, by
     * `tests/unit/prisoners-action-system.test.ts`'s *"falls back when the
     * canteen exists but is full, and takes no seat it was refused"*, which
     * puts the prisoner on the room's own anchor tile so that selection and
     * arrival are one tick and the refusal is structural rather than a race.
     */
    const cellMeal = DEFAULT_ACTIONS.find((action) => action.id === 'action.eat-in-cell')!;
    const canteenMeal = DEFAULT_ACTIONS.find((action) => action.id === 'action.eat-meal')!;
    expect(cellMeal.target.kind, 'the fallback must be the own-accommodation meal for this to mean anything').toBe('own-accommodation');
    expect(canteenMeal.needEffectsPerTick.hunger!).toBeGreaterThan(cellMeal.needEffectsPerTick.hunger!);
    for (const [n, counts] of run.perPrisoner.entries()) {
      expect(counts['action.eat-meal'] ?? 0, `prisoner ${n} never reached the canteen`).toBeGreaterThan(0);
    }

    /*
     * And the player-visible consequence: **nobody starves**. Hunger is a
     * reservoir that only a performed meal refills, and the pre-ADR-0041 code
     * put the refused half at 0.0 -- see the header table. Every one of the six
     * stays above two thirds of `NEED_MAX` at their worst.
     */
    /*
     * Two levels lower than the 177.5 / 178.5 this recorded before ADR 0054,
     * which is 40 ticks of `NEED_DECAY_PER_TICK.hunger` -- two `ActionSystem`
     * reconsideration cadences, the delay an association running past the
     * `[1000,1200)` boundary puts in front of the first meal of the next
     * block. It is when they eat, not whether: the point of the assertion is
     * the line under it, and every one of the six is still above two thirds of
     * `NEED_MAX` at their worst.
     */
    expect(run.lowestHunger).toEqual([60.5, 17.5, 137.5, 17.5, 168.5, 137.5]);
    for (const [n, hunger] of run.lowestHunger.entries()) {
      expect(hunger, `prisoner ${n} was starved to the floor`).toBeGreaterThan(0);
    }
  });

  it('is the contention and not the prison: a second dining table doubles the food and lifts every hunger floor', () => {
    const control = watched(2);
    const squeezed = watched(1);

    // One more `PlaceObject`, the same rectangles, the same bill. The ceiling
    // is now six for six prisoners, so nobody is ever refused a seat.
    expect(control.runtime.refusals.count).toBe(0);
    expect(control.diningCeiling, 'two 3-wide tables').toBe(6);
    expect(control.maxUseClaims, 'all six in the canteen at once, which the one-table run never reached').toBe(PRISONERS);

    /*
     * **What this test asserted, and what it asserts now.** Its title was *"a
     * second dining table removes the cell meal entirely"* and its closing
     * loop required `action.eat-in-cell` to be **absent** from every row here
     * and **present** in every row of the one-table run. Since ADR 0059 it is
     * absent from both, for the reason recorded on that run: with a walk
     * between choosing and arriving, nobody in this prison chooses a meal at
     * an instant when all three seats are held, so the fallback is never
     * reached. A pair of assertions that both read "absent" would say nothing
     * about the ceiling at all.
     *
     * So the contrast is taken where the ceiling still shows: **food**. Both
     * arms are run here rather than one, because a difference is not a fact
     * about either run on its own.
     */
    expect(control.perPrisoner).toEqual([
      { 'action.sleep': 2_000, 'action.eat-meal': 728, 'action.use-toilet': 580, 'action.free-association': 2_820 },
      { 'action.sleep': 2_600, 'action.eat-meal': 540, 'action.use-toilet': 480, 'action.free-association': 3_508 },
      { 'action.sleep': 2_200, 'action.eat-meal': 784, 'action.use-toilet': 500, 'action.free-association': 3_084 },
      { 'action.sleep': 2_600, 'action.eat-meal': 540, 'action.use-toilet': 480, 'action.free-association': 3_508 },
      { 'action.sleep': 3_000, 'action.eat-meal': 524, 'action.use-toilet': 380, 'action.free-association': 3_780 },
      { 'action.sleep': 3_000, 'action.eat-meal': 524, 'action.use-toilet': 380, 'action.free-association': 3_780 },
    ]);
    for (const [n, counts] of control.perPrisoner.entries()) {
      expect(counts['action.eat-in-cell'], `prisoner ${n} fell back to a cell meal with a seat free`).toBeUndefined();
    }

    // The measured difference one ceiling makes, stated as the comparison
    // rather than as two numbers a reader has to subtract: 3,640 canteen ticks
    // against 1,788, and a worst-off prisoner at 174.5 of `NEED_MAX` against
    // **17.5**. One three-seat table is not enough to feed six prisoners who
    // have to walk to it, and that is a sharper statement of this file's
    // subject than the cell-meal contrast it replaces.
    const canteenTicks = (run: WatchedRun): number => run.perPrisoner.reduce((total, counts) => total + (counts['action.eat-meal'] ?? 0), 0);
    expect(canteenTicks(control)).toBe(3_640);
    expect(canteenTicks(squeezed)).toBe(1_788);
    expect(canteenTicks(control)).toBeGreaterThan(canteenTicks(squeezed));
    expect(Math.min(...control.lowestHunger)).toBe(174.5);
    expect(Math.min(...squeezed.lowestHunger)).toBe(17.5);
    expect(Math.min(...control.lowestHunger)).toBeGreaterThan(Math.min(...squeezed.lowestHunger));
  });

  it('spends the same money in both prisons, so the difference between them is one ceiling and not one budget', () => {
    /*
     * Read before anybody is admitted, because `StateIncomeSystem` pays per
     * occupied place per in-game day and a 14,000-tick watch with six residents
     * drowns a 1,020 purchase in income. The materials are what this asserts:
     * 12 planks at 65 and 6 bricks at 40, bought identically in both, with the
     * one-table prison simply leaving three planks in the container.
     */
    const contended = prison(1);
    const control = prison(2);
    stepTo(contended, BUILT_BY);
    stepTo(control, BUILT_BY);

    const spent = PLANKS * 65 + BRICKS * 40;
    expect(spent).toBe(1_020);
    expect(contended.treasury.balanceMinorUnits).toBe(25_000 - spent);
    expect(control.treasury.balanceMinorUnits).toBe(contended.treasury.balanceMinorUnits);

    // And both prisons really are finished: an unbuilt order would make every
    // count above a statement about construction rather than about contention.
    expect(contended.construction.allOrders().filter((order) => order.state !== 'completed')).toEqual([]);
    expect(control.construction.allOrders().filter((order) => order.state !== 'completed')).toEqual([]);
    expect(contended.placedObjects.size).toBe(PRISONERS * 2 + 1);
    expect(control.placedObjects.size).toBe(PRISONERS * 2 + 2);
  });

  it('produces the identical contended loop on a second run, so the fallback added no nondeterminism under contention', () => {
    const first = watched(1);
    const second = watched(1);

    expect(second.perPrisoner).toEqual(first.perPrisoner);
    expect(second.lowestHunger).toEqual(first.lowestHunger);
    expect(second.runtime.prisoners.actionSystem.getMetrics()).toEqual(first.runtime.prisoners.actionSystem.getMetrics());
  });
});
