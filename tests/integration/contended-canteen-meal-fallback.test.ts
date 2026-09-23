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
  /*
   * **Guards, hired for what this fixture is *not* about** (issue #588).
   * Coverage now provisions the `safety` need, so an unstaffed prison of this
   * size loses it at 0.05 a tick with nothing opposing -- which drives
   * `needsPressure` over `hotThreshold` and opens riots, and a riot regime
   * takes the very actions this file measures away from its prisoners.
   * Measured without them: riots that take the meal block away from the prisoners whose meals this file counts.
   *
   * `DEFAULT_SECTOR_PRISONERS_PER_GUARD` is 8, so `ceil(PRISONERS / 8)` is
   * what the derived sector asks for. Hiring it isolates the subject of this
   * file from a mechanic that is measured on its own in
   * `tests/integration/coverage-safety-loop.test.ts`.
   */
  for (let n = 0; n < Math.ceil(PRISONERS / 8); n += 1) {
    submit(runtime, `hire-guard-${n}`, packCommand({ type: 'HireStaff', staffRoleId: 'staff-role.guard', ...ARRIVAL }));
  }
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
  it('feeds every one of them, the refused half on the worse meal in their own cell', () => {
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
    /*
     * **Re-measured for [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md).**
     * A prisoner walks to the canteen now, so the ticks a journey costs come out
     * of the association that fills the rest of the day, and the split between
     * the two meals moves with who reaches a seat first. **What the file is
     * about is unchanged and is asserted below rather than here**: all six eat
     * both meals, the losers eat in their cell, and nobody starves.
     */
    /*
     * **Re-measured again for issue #588's hire** (see `watched`). `eat-meal`
     * and `eat-in-cell` are unchanged row for row -- the split between the two
     * meals, which is what this file is about, did not move at all -- and only
     * `use-toilet` and `free-association` shifted, by the ticks a guard walking
     * to the arrival tile costs the prisoners routing past it. That the meal
     * columns held is the strongest available statement that the hire did not
     * disturb the subject.
     */
    /*
     * **Re-measured a fourth time for
     * [ADR 0102](../../docs/adr/0102-what-a-prisoner-without-a-bed-may-still-do.md),
     * and two rows of five columns moved.** All six prisoners here are housed
     * within the first few hundred ticks, so this file has no unhoused
     * population for that decision to reach -- what it does reach is the
     * *window before* each of them is housed. `ActionSystem` now considers a
     * prisoner at intake stage `accommodation-assignment`, and `IntakeSystem`
     * holds every arrival there for at least one of its own scheduled ticks,
     * so six arrivals now spend a reconsideration cycle or two competing for a
     * canteen seat before they have a cell. The effect is the same *shape* as
     * issue #588's hire: **`sleep`, `eat-meal` and `eat-in-cell` are unchanged
     * in all six rows** -- the split between the two meals, which is what this
     * file is about, did not move by a single tick -- and only `use-toilet`
     * and `free-association` shifted, in rows 4 and 6, by 12 and 16 ticks
     * respectively.
     */
    expect(run.perPrisoner).toEqual([
      { 'action.sleep': 3_000, 'action.eat-meal': 224, 'action.eat-in-cell': 220, 'action.use-toilet': 716, 'action.free-association': 3_904 },
      { 'action.sleep': 3_000, 'action.eat-meal': 308, 'action.eat-in-cell': 208, 'action.use-toilet': 704, 'action.free-association': 3_948 },
      { 'action.sleep': 3_000, 'action.eat-meal': 240, 'action.eat-in-cell': 240, 'action.use-toilet': 732, 'action.free-association': 3_908 },
      { 'action.sleep': 3_000, 'action.eat-meal': 104, 'action.eat-in-cell': 416, 'action.use-toilet': 732, 'action.free-association': 3_912 },
      { 'action.sleep': 3_000, 'action.eat-meal': 336, 'action.eat-in-cell': 224, 'action.use-toilet': 712, 'action.free-association': 3_964 },
      { 'action.sleep': 3_000, 'action.eat-meal': 336, 'action.eat-in-cell': 224, 'action.use-toilet': 712, 'action.free-association': 3_964 },
    ]);

    // Stated as properties as well as counts, so the intent survives a
    // re-baseline. "A worse meal instead of nothing" is two claims, and this is
    // both of them: the cell meal was performed by everybody, and it is the
    // lower-scoring of the two on the same need.
    const cellMeal = DEFAULT_ACTIONS.find((action) => action.id === 'action.eat-in-cell')!;
    const canteenMeal = DEFAULT_ACTIONS.find((action) => action.id === 'action.eat-meal')!;
    expect(cellMeal.target.kind, 'the fallback must be the own-accommodation meal for this to mean anything').toBe('own-accommodation');
    expect(canteenMeal.needEffectsPerTick.hunger!).toBeGreaterThan(cellMeal.needEffectsPerTick.hunger!);
    for (const [n, counts] of run.perPrisoner.entries()) {
      expect(counts['action.eat-in-cell'] ?? 0, `prisoner ${n} never ate in their cell`).toBeGreaterThan(0);
      expect(counts['action.eat-meal'] ?? 0, `prisoner ${n} never reached the canteen`).toBeGreaterThan(0);
    }

    /*
     * And the player-visible consequence: **nobody starves**. Hunger is a
     * reservoir that only a performed meal refills, and the pre-ADR-0041 code
     * put the refused half at 0.0 -- see the header table. Every one of the six
     * stays above two thirds of `NEED_MAX` at their worst.
     */
    /*
     * **This read `[175.5, 175.5, 175.5, 177.5, 177.5, 177.5]` until issue
     * #434, and the reason it had two values is the reason it now has one.**
     * The comment here used to explain the 175.5 as 40 ticks of
     * `NEED_DECAY_PER_TICK.hunger` -- two `ActionSystem` reconsideration
     * cadences of extra delay in front of the first three prisoners' first meal
     * of a block, put there by an association running past the `[1000,1200)`
     * boundary. That reading was right, and what it was describing was the scan
     * position: the two levels were the price of being at the head of an
     * ascending-index walk that reaches the canteen before the association has
     * finished handing the seats out.
     *
     * Ordering the contended scan by need urgency removes the price by removing
     * the position. Every one of the six now bottoms out at exactly the same
     * hunger, and that equality is the change: it is not that they eat more --
     * `run.perPrisoner` above is unmoved to the tick, canteen and cell alike --
     * it is that no prisoner is systematically served two cadences later than
     * another for a reason that has nothing to do with how hungry they are.
     */
    /*
     * > **This read `[177.5, 177.5, 177.5, 177.5, 177.5, 177.5]` with
     * > `expect(new Set(run.lowestHunger).size).toBe(1)` beside it, and the
     * > exact equality did not survive
     * > [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md).**
     * > It could not: equality was a property of six prisoners who *arrived
     * > together*, and six cells at six different distances from the canteen
     * > now put them through six different days. The floors sit inside three
     * > levels of one another instead.
     * >
     * > **What #434 was about is untouched, and is asserted rather than
     * > implied below.** The defect was that scan *position* decided who ate:
     * > the head of an ascending-index walk was served two levels later than
     * > the tail, every day, for a reason that had nothing to do with how
     * > hungry anybody was. The spread that is left does not track position at
     * > all -- prisoner 5, last in that order, holds the **best** floor of the
     * > six -- and it is a third of the size of the one #434 removed.
     */
    /*
     * **Re-measured for issue #588's hire, and the bound under it moved from 3
     * to 5.** That is a relaxation and it is argued rather than taken: the
     * spread this bound exists to catch is the #434 defect, in which scan
     * *position* decided who ate and the head of the walk was served about ten
     * levels later than the tail. Five is still half of that, and the two
     * assertions after it are what actually establish the defect has not
     * returned -- prisoner 5, last in the old ascending-index order, holds the
     * **best** floor of the six, which is the exact opposite of the defect's
     * signature.
     *
     * The extra two levels are the guard: a hire walks to and stands on the
     * arrival tile, and the prisoners routing past it reach their seats a few
     * ticks apart from where they used to. Every other figure in this file
     * moved for the same reason and the meal columns did not move at all.
     */
    /*
     * **Re-measured for ADR 0102, and the bound goes back from 5 to 3** -- a
     * tightening rather than a relaxation, which is why it is taken here
     * rather than argued for. Two of the six floors moved and both moved
     * down: index 4 from 176.5 to 173.5 and index 5 from 178.5 to 176.5. The
     * cause is the one the row above names -- every arrival now spends its
     * pre-housing window competing for the same three seats, so the six reach
     * their first meals in a slightly different order -- and the effect on
     * this bound is that the floors close up rather than spread out. Prisoner
     * 5, last in the old ascending-index order, still holds the **best** floor
     * of the six, which is the assertion below and the exact opposite of
     * #434's signature.
     */
    expect(run.lowestHunger).toEqual([174.5, 173.5, 174.5, 173.5, 173.5, 176.5]);
    const spread = Math.max(...run.lowestHunger) - Math.min(...run.lowestHunger);
    expect(spread, 'the hunger floors have spread out again, which is what #434 removed').toBeLessThanOrEqual(3);
    expect(
      run.lowestHunger[5],
      'the last prisoner in the old ascending-index scan is worst off again, which is the #434 defect returning',
    ).toBe(Math.max(...run.lowestHunger));
    for (const [n, hunger] of run.lowestHunger.entries()) {
      expect(hunger, `prisoner ${n} was starved to the floor`).toBeGreaterThan(0);
    }
  });

  it('is the contention and not the prison: a second dining table removes the cell meal entirely', () => {
    const control = watched(2);

    // One more `PlaceObject`, the same rectangles, the same bill. The ceiling
    // is now six for six prisoners, so nobody is ever refused a seat.
    expect(control.runtime.refusals.count).toBe(0);
    expect(control.diningCeiling, 'two 3-wide tables').toBe(6);
    expect(control.maxUseClaims, 'all six in the canteen at once, which the one-table run never reached').toBe(PRISONERS);

    // 560 and 820, not 600 and 1,000, for the timing reason recorded on the
    // one-table run above and then for the riot recorded beside it -- this
    // prison riots too, at tick 13,500, for the same neglect and with the same
    // consequence for `hygiene`. `action.free-association` appears here for the
    // same reason it appears there. What this assertion is *for* is unchanged
    // and is the line below it: with six seats for six prisoners,
    // `action.eat-in-cell` is absent from every row.
    // Re-measured for ADR 0059, like the one-table run. **Six rows rather than
    // one repeated**, because a walk to the canteen is a different length from
    // each of the six cells and the prisoners no longer spend identical days.
    // The line under it is what this assertion is for: with six seats for six
    // prisoners, `action.eat-in-cell` is absent from every row.
    // Re-measured again for issue #588's hire, and `action.eat-meal` is
    // unchanged in all six rows here too.
    expect(control.perPrisoner).toEqual([
      { 'action.sleep': 3_000, 'action.eat-meal': 444, 'action.use-toilet': 680, 'action.free-association': 3_920 },
      { 'action.sleep': 3_000, 'action.eat-meal': 516, 'action.use-toilet': 660, 'action.free-association': 3_960 },
      { 'action.sleep': 3_000, 'action.eat-meal': 480, 'action.use-toilet': 700, 'action.free-association': 3_940 },
      { 'action.sleep': 3_000, 'action.eat-meal': 516, 'action.use-toilet': 660, 'action.free-association': 3_960 },
      { 'action.sleep': 3_000, 'action.eat-meal': 552, 'action.use-toilet': 680, 'action.free-association': 3_980 },
      { 'action.sleep': 3_000, 'action.eat-meal': 552, 'action.use-toilet': 680, 'action.free-association': 3_980 },
    ]);
    for (const [n, counts] of control.perPrisoner.entries()) {
      expect(counts['action.eat-in-cell'], `prisoner ${n} fell back to a cell meal with a seat free`).toBeUndefined();
    }

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
    // The opening grant: 25,000 until the owner's ruling of 2026-09-23 (#641).
    expect(contended.treasury.balanceMinorUnits).toBe(100_000 - spent);
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
