import { describe, expect, it } from 'vitest';
import { DEFAULT_ACTIONS } from '../../src/simulation/prisoners/actions';
import { NEED_SCALE } from '../../src/simulation/prisoners/needs';
import { packCommand } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { wallRoomPerimeter } from '../helpers/room-walls';

/**
 * Issue #434: **under contention the same prisoners lost the same room for
 * ever**, and this is the run that says they no longer do.
 *
 * [ADR 0041](../../docs/adr/0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
 * decision 2 and the fairness half of
 * [ADR 0029](../../docs/adr/0029-concurrent-room-use-claims.md) decision 5 both
 * name ordering the contended scan by need urgency as the fix, and
 * [ADR 0062](../../docs/adr/0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)
 * is the decision that took it. The numbers below are its Context and its
 * Consequences; this file is where they are re-derived on every run. ADR 0029
 * decision 5 states the defect in its own words: *"a low-index prisoner is
 * systematically favoured, and sustained contention can starve a high-index
 * one"*, because *"the need raises their score against their own other options,
 * never against another prisoner -- nothing in `selectBestAction` or in the
 * scan compares two prisoners"*.
 *
 * ## Why a shower room and not a canteen
 *
 * The canteen is the scenario ADR 0029's amendment measured, and since ADR 0041
 * it is **no longer the sharp case**: a prisoner refused a seat eats in their
 * cell instead, at 3 hunger a tick against the canteen's 4, and hunger is
 * therefore never actually starved. Re-run on `origin/main` at `c00b641` with
 * 24 prisoners and a six-seat canteen over 30,000 ticks, prisoners 12 to 23
 * entered the canteen **zero** times on every one of the twelve days -- and
 * every one of the 24 sat at exactly `36300` stored hunger units at the moment
 * each meal block opened. The incumbency was total and its need cost was nil,
 * which is worth recording precisely because it is not what the issue's title
 * implies.
 *
 * `action.shower` has no `own-accommodation` sibling and gets none by design
 * ([ADR 0054](../../docs/adr/0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
 * decision 1: `hygiene` and `recreation` stay room-gated so that an unmet need
 * is what makes building the room worth doing). A lost shower is therefore a
 * need that goes unserved, which is the case where the ordering decides
 * something a player can be cheated by.
 *
 * ## The prison
 *
 * 24 prisoners in one furnished dormitory -- 24 beds and 24 toilets, so every
 * `own-accommodation` action always resolves and nothing here is about
 * accommodation scarcity -- a canteen with two dining tables, and a
 * `room.shower-room` at its authored 3x3 minimum. `object.shower-head` is `1x1`
 * and `concurrentUseCapacityFor` sums footprint widths, so **two heads is a
 * hygiene ceiling of two against 24 prisoners**. The ceiling is derived from the
 * content catalogues, not supplied by this file.
 *
 * ## The result
 *
 * Every figure below is a real run of this prison over 40,000 ticks, with the
 * "before" column taken by reverting `ActionSystem.update` to the single
 * ascending-index pass and changing nothing else.
 *
 * | | prisoners who never showered | prisoners who reached hygiene 0.0 | worst final hygiene | shower ticks, lowest .. highest |
 * | --- | --- | --- | --- | --- |
 * | *before*, ascending index | **2** (p22, p23) | 8 | **0.0** (six of them) | 0 .. 480 |
 * | after, by need urgency | 0 | **0** | **166.4** | 240 .. 400 |
 *
 * The two highest-index prisoners went from **0 showers in 40,000 ticks** to
 * six each, and the lowest hygiene any prisoner touched at any tick went from
 * 0.0 to 96.8. Nobody was made worse off to pay for it: the population took
 * *more* showers in total, because ordering the arrivals also stops two
 * prisoners walking to the same last free head and one of them wasting the trip
 * (`unmetDemandCycles` 1,364 -> 978, `actionsCompleted` 8,758 -> 9,114).
 *
 * ## What this file is careful not to be
 *
 * Issue #375 catalogues four shapes of "the fixture supplies both side of the
 * comparison". Two of them are live hazards here and are answered rather than
 * hoped about:
 *
 * - **It does not assert the order the comparator returns.** Nothing here reads
 *   `needUrgency`, `compareByNeedUrgency` or the scan. Every assertion is about
 *   what a **named prisoner received** -- how many showers, how filthy they were
 *   allowed to get -- so a change that reorders the callers and loses the
 *   fairness fails here even though the comparator is untouched.
 * - **Its expected values are literals read off the run**, never computed from
 *   the catalogue by the same expression the production code uses. The one
 *   arithmetic figure -- a ceiling of two from two `1x1` heads -- is asserted
 *   *against* the registry rather than handed to it.
 */

const SEED = 0x0b1ec7;

const PRISONERS = 24;

/** One dormitory: `room.cell`'s authored 2x3 minimum is far exceeded, and 24 beds make its resident capacity 24. */
const DORM = { x: 0, y: 0, width: 12, height: 6 } as const;
/** `room.canteen`'s authored 6x6 minimum, given 8x8 so its two `3x2` tables and four `2x1` benches never overlap. */
const CANTEEN = { x: 16, y: 0, width: 8, height: 8 } as const;
/** `room.shower-room`'s authored 3x3 minimum, clear of both. */
const SHOWER = { x: 0, y: 10, width: 3, height: 3 } as const;
const SHOWER_ID = 'room.shower-room:0:10';

/**
 * The bill, and it is the phase-4 cost rule doing the arithmetic:
 * `materialsRequired[0].quantity = footprint.width`. 24 `1x1` beds at one plank,
 * two `3x2` dining tables at three, four `2x1` benches at two; 24 `1x1` toilets
 * and **eight** `1x1` shower heads at one brick each.
 *
 * Eight heads' worth of brick in **both** runs, so the control differs from the
 * contended run by six `PlaceObject` commands and by nothing else -- not by a
 * purchase, not by a delivery, not by a treasury balance. The contended prison
 * simply leaves six bricks in the container.
 */
const PLANKS = 24 + 2 * 3 + 4 * 2;
const BRICKS = 24 + 8;

/** Every order is complete well before this; the timeline is asserted, not assumed. */
const BUILT_BY = 6_000;
/** Sixteen full general-population days after the admissions, so a hygiene block is contended many times over. */
const WATCH_UNTIL = 40_000;
const DAY_LENGTH_TICKS = 2_400;

/** The tile `src/main.ts` admits at: the middle of the one chunk a new prison owns. */
const ARRIVAL = { x: 16, y: 16 } as const;
/** Long enough that no sentence ends inside the window. */
const ADMISSION = { sentenceLengthTicks: 1_000_000, priorIncidents: 0 } as const;

/** `2` is `performing` in `ACTION_PHASES`; the phase names are not exported. */
const PERFORMING_PHASE = 2;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

function prison(showerHeads: 2 | 8): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  submit(runtime, 'buy-plank', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-1', itemId: 'item.wood-plank', quantity: PLANKS }));
  submit(runtime, 'buy-brick', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-2', itemId: 'item.brick', quantity: BRICKS }));

  for (const [id, rect, roomId] of [
    ['dorm', DORM, 'room.cell'],
    ['canteen', CANTEEN, 'room.canteen'],
    ['shower', SHOWER, 'room.shower-room'],
  ] as const) {
    wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
    submit(runtime, `zone-${id}`, packCommand({ type: 'ZoneRoom', roomId, ...rect }));
  }

  let placed = 0;
  for (const y of [0, 2]) {
    for (let x = 0; x < 12; x += 1) {
      submit(runtime, `bed-${placed}`, packCommand({ type: 'PlaceObject', orderId: `o-bed-${placed}`, definitionId: 'bed-wooden', x, y }));
      placed += 1;
    }
  }
  placed = 0;
  for (const y of [4, 5]) {
    for (let x = 0; x < 12; x += 1) {
      submit(runtime, `toilet-${placed}`, packCommand({ type: 'PlaceObject', orderId: `o-toilet-${placed}`, definitionId: 'toilet-brick', x, y }));
      placed += 1;
    }
  }
  submit(runtime, 'dt-0', packCommand({ type: 'PlaceObject', orderId: 'o-dt-0', definitionId: 'dining-table-wooden', x: 17, y: 1 }));
  submit(runtime, 'dt-1', packCommand({ type: 'PlaceObject', orderId: 'o-dt-1', definitionId: 'dining-table-wooden', x: 17, y: 3 }));
  for (let bench = 0; bench < 4; bench += 1) {
    submit(runtime, `bench-${bench}`, packCommand({ type: 'PlaceObject', orderId: `o-bench-${bench}`, definitionId: 'bench-wooden', x: 21, y: 1 + bench }));
  }
  for (let head = 0; head < showerHeads; head += 1) {
    const x = SHOWER.x + (head % 3);
    const y = SHOWER.y + Math.floor(head / 3);
    submit(runtime, `head-${head}`, packCommand({ type: 'PlaceObject', orderId: `o-head-${head}`, definitionId: 'shower-head-brick', x, y }));
  }
  return runtime;
}

interface WatchedRun {
  readonly runtime: SimulationRuntime;
  readonly hygieneCeiling: number;
  /** `action.shower` performing ticks per prisoner, indexed by admission order -- the ascending entity index the scan used to run in. */
  readonly showerTicks: readonly number[];
  /** The same, split by in-game day, so a named prisoner's own history is readable. */
  readonly showerTicksByDay: readonly (readonly number[])[];
  readonly lowestHygiene: readonly number[];
  readonly finalHygiene: readonly number[];
  readonly maxSimultaneousShowerUsers: number;
}

function watched(showerHeads: 2 | 8): WatchedRun {
  const runtime = prison(showerHeads);
  stepTo(runtime, BUILT_BY);
  /*
   * **Guards, hired for what this fixture is *not* about** (issue #588).
   * Coverage now provisions the `safety` need, so an unstaffed prison of this
   * size loses it at 0.05 a tick with nothing opposing -- which drives
   * `needsPressure` over `hotThreshold` and opens riots, and a riot regime
   * takes the very actions this file measures away from its prisoners.
   * Measured without them: six riots in the 40,000-tick watch, total shower time halved from 7,488 ticks to 3,816, and twelve of the 24 prisoners touching hygiene 0.
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
  const days = Math.ceil(WATCH_UNTIL / DAY_LENGTH_TICKS);
  const showerTicks = Array.from({ length: PRISONERS }, () => 0);
  const showerTicksByDay = Array.from({ length: PRISONERS }, () => Array.from({ length: days }, () => 0));
  const lowestHygiene = Array.from({ length: PRISONERS }, () => Number.POSITIVE_INFINITY);
  let maxSimultaneousShowerUsers = 0;

  // Every tick rather than every twentieth, for the reason
  // `furnished-prison-loop.test.ts` records: a performed action is short and a
  // coarse sample can miss one entirely.
  for (let tick = runtime.kernel.tick + 1; tick <= WATCH_UNTIL; tick += 1) {
    stepTo(runtime, tick);
    const day = Math.floor(tick / DAY_LENGTH_TICKS);
    for (let n = 0; n < PRISONERS; n += 1) {
      const index = store.getIndex(store.getIdByIndex(n));
      const actionIndex = runtime.prisoners.currentAction.actionIndex[index]!;
      if (runtime.prisoners.currentAction.phase[index] === PERFORMING_PHASE && actionIndex >= 0 && DEFAULT_ACTIONS[actionIndex]!.id === 'action.shower') {
        showerTicks[n] = showerTicks[n]! + 1;
        showerTicksByDay[n]![day] = showerTicksByDay[n]![day]! + 1;
      }
      const hygiene = runtime.prisoners.needs.levels.hygiene[index]! / NEED_SCALE;
      if (hygiene < lowestHygiene[n]!) lowestHygiene[n] = hygiene;
    }
    maxSimultaneousShowerUsers = Math.max(maxSimultaneousShowerUsers, runtime.prisoners.roomInstances.useOccupancyOf(SHOWER_ID, 'hygiene'));
  }

  const shower = runtime.prisoners.roomInstances.getById(SHOWER_ID)!;
  return {
    runtime,
    hygieneCeiling: runtime.prisoners.roomInstances.concurrentUseCapacityFor(shower, 'hygiene'),
    showerTicks,
    showerTicksByDay,
    lowestHygiene,
    finalHygiene: Array.from({ length: PRISONERS }, (_unused, n) =>
      runtime.prisoners.needs.levels.hygiene[store.getIndex(store.getIdByIndex(n))]! / NEED_SCALE),
    maxSimultaneousShowerUsers,
  };
}

describe('twenty-four prisoners and a shower room with two heads', () => {
  it('lets the prisoners scanned last wash, which they never once did while the scan ran in entity-index order', () => {
    const run = watched(2);

    expect(run.runtime.refusals.count, 'an overlapping footprint would be a refusal, not a wrong number').toBe(0);
    expect(run.runtime.prisoners.intakeSystem.getMetrics()).toMatchObject({ completedCount: PRISONERS, failedCount: 0 });

    /*
     * The precondition, read off the derivation rather than restated: two `1x1`
     * shower heads are two hygiene places against 24 prisoners, and
     * `maxSimultaneousShowerUsers` is the proof the ceiling *bit* rather than
     * being advisory -- a third simultaneous user would have made it 3.
     */
    expect(run.hygieneCeiling, 'two 1x1 shower heads, and `concurrentUseCapacityFor` sums footprint widths').toBe(2);
    expect(run.hygieneCeiling).toBeLessThan(PRISONERS);
    expect(run.maxSimultaneousShowerUsers, 'never a third: the ceiling bit').toBe(2);

    /*
     * **The fairness claim, as a named prisoner's own history.** Prisoner 23 is
     * last in the entity-index order the scan used to run in, and on
     * `origin/main` at `c00b641` this array was sixteen zeroes: 40,000 ticks, a
     * shower room standing the whole time, and not one wash. Prisoner 22's was
     * the same. The literal below is the measured run, not a lower bound
     * dressed up as one, and the two assertions under it are what it is *for*
     * -- a re-baseline that quietly returned either of them to zero would fail
     * the second one.
     */
    /*
     * **Re-measured for [ADR 0059](../../docs/adr/0059-how-an-actor-gets-from-one-tile-to-the-next.md),
     * which moved every figure in this file without touching what it claims.**
     * This array read `[0, 0, 0, 0, 0, 40, 0, 40, 0, 40, 0, 40, 0, 40, 0, 40,
     * 0]` when the scan ordering landed. A prisoner now walks to the shower
     * room instead of appearing in it, so a wash costs part of the block it is
     * taken in -- 36 ticks rather than the action's full 40 -- and which days a
     * given prisoner wins moves with the staggering. Day 13's 72 is two washes
     * in one day, which the alternation assertion below is happy with and the
     * old literal never showed. **Both of the assertions under it are
     * unchanged and are what this literal is for**: a re-baseline that quietly
     * returned prisoner 22 or 23 to zero fails them.
     */
    /*
     * **Re-measured again for issue #588**, and for the *hire* rather than for
     * the need: this prison now employs three guards (see `watched`), because
     * an unstaffed one of this size riots six times inside the watch and a
     * riot regime takes the shower away from everybody. The array read
     * `[0, 0, 0, 0, 0, 36, 36, 0, 36, 36, 36, 36, 0, 72, 0, 36, 0]` before it.
     * **Both of the assertions under it are unchanged and are still what this
     * literal is for.**
     */
    expect(run.showerTicksByDay[23]).toEqual([0, 0, 36, 0, 0, 36, 36, 0, 72, 36, 0, 0, 36, 0, 0, 72, 0]);
    expect(run.showerTicks[23], 'the last prisoner scanned took no shower at all before #434').toBeGreaterThan(0);
    expect(run.showerTicks[22], 'and neither did the one before them').toBeGreaterThan(0);

    /*
     * **The losing set reopens**, which is the property ADR 0029 decision 5
     * says nothing had: prisoner 23 goes without on one day and washes on a
     * later one, repeatedly, rather than being permanently outside the set that
     * gets in. Read off the same history, as an alternation rather than a
     * total, so a prisoner who simply showered every day would not satisfy it
     * either.
     */
    const lastPrisonersDays = run.showerTicksByDay[23]!;
    const firstLostDay = lastPrisonersDays.findIndex((ticks, day) => day > 0 && ticks === 0);
    const wonLater = lastPrisonersDays.findIndex((ticks, day) => day > firstLostDay && ticks > 0);
    expect(firstLostDay, 'a day the last-scanned prisoner got no shower').toBeGreaterThan(0);
    expect(wonLater, 'and a later day on which they did').toBeGreaterThan(firstLostDay);

    /*
     * **And the player-visible consequence: nobody is left filthy.** `hygiene`
     * has no cell-side route, so before #434 the losers simply decayed: eight
     * of the 24 touched 0.0 at some tick and six were still there at 40,000.
     * Every one of them still comes off the floor, and the per-prisoner loop
     * below is where that is asserted.
     *
     * **The sentence that stood here said they stay "well above a third of
     * `NEED_MAX`", and that is no longer true.** The worst floor is 24.4 of
     * 255 -- a tenth, not a third -- and it fell there with issue #588's
     * hire (see `watched`): three guards walking to and standing on the
     * arrival tile change how 24 prisoners route to a two-head shower room,
     * and one of them now cuts it much finer than before. The claim is
     * narrowed to what is measured rather than kept at a level the run does
     * not support: **nobody reaches the floor**, and the run is much closer to
     * it than it was.
     */
    // 24.4 since issue #588's hire; 90.4 and 125.2 since ADR 0059, against
    // 96.8 and 166.4 before that.
    expect(Math.min(...run.lowestHygiene)).toBe(24.4);
    expect(Math.min(...run.finalHygiene)).toBe(125.2);
    for (const [n, hygiene] of run.lowestHygiene.entries()) {
      expect(hygiene, `prisoner ${n} was left to reach the hygiene floor`).toBeGreaterThan(0);
    }
    for (const [n, ticks] of run.showerTicks.entries()) {
      expect(ticks, `prisoner ${n} never washed`).toBeGreaterThan(0);
    }
  });

  it('is the ceiling and not the prison: eight heads and the same bill remove the contention entirely', () => {
    const control = watched(8);
    const watchedTwoHead = watched(2);

    // Six more `PlaceObject` commands, the same rectangles, the same purchase.
    expect(control.runtime.refusals.count).toBe(0);
    expect(control.hygieneCeiling, 'eight 1x1 shower heads').toBe(8);
    expect(control.maxSimultaneousShowerUsers, 'more than two at once, which the two-head run never reached').toBeGreaterThan(2);

    // With the ceiling above what the population ever asks for, the spread that
    // the two-head run is about is gone: every prisoner washes as often as the
    // regime lets them and nobody is refused.
    // 612 / 756 / 186.4 since issue #588's hire (see `watched`); 612 / 828 /
    // 185 since ADR 0059, against 760 / 1,000 / 203.6 before that. The number
    // this test is actually for -- the least-washed prisoner in an eight-head
    // room against the best-washed in a two-head one -- did not move at all.
    expect(Math.min(...control.showerTicks), 'the least-washed prisoner here beats the best-washed one in the two-head run').toBe(612);
    expect(Math.max(...control.showerTicks)).toBe(756);
    expect(Math.min(...control.lowestHygiene)).toBe(186.4);
    expect(Math.min(...control.showerTicks)).toBeGreaterThan(Math.max(...watchedTwoHead.showerTicks));
  });

  it('spends the same money in both prisons, so the difference between them is one ceiling and not one budget', () => {
    /*
     * Read before anybody is admitted, because `StateIncomeSystem` pays per
     * occupied place per in-game day and a 40,000-tick watch with 24 residents
     * drowns the purchase in income.
     */
    const contended = prison(2);
    const control = prison(8);
    stepTo(contended, BUILT_BY);
    stepTo(control, BUILT_BY);

    // 38 planks at 65 and 32 bricks at 40, from `src/content/procurement-catalog.ts`.
    const spent = PLANKS * 65 + BRICKS * 40;
    expect(spent).toBe(3_750);
    expect(contended.treasury.balanceMinorUnits).toBe(25_000 - spent);
    expect(control.treasury.balanceMinorUnits).toBe(contended.treasury.balanceMinorUnits);

    // And both prisons really are finished: an unbuilt order would make every
    // count above a statement about construction rather than about contention.
    expect(contended.construction.allOrders().filter((order) => order.state !== 'completed')).toEqual([]);
    expect(control.construction.allOrders().filter((order) => order.state !== 'completed')).toEqual([]);
    expect(contended.placedObjects.size).toBe(PRISONERS * 2 + 6 + 2);
    expect(control.placedObjects.size).toBe(PRISONERS * 2 + 6 + 8);
  });

  it('produces the identical contended run twice from the same seed, so the reordering added no nondeterminism', () => {
    const first = watched(2);
    const second = watched(2);

    expect(second.showerTicks).toEqual(first.showerTicks);
    expect(second.showerTicksByDay).toEqual(first.showerTicksByDay);
    expect(second.lowestHygiene).toEqual(first.lowestHygiene);
    expect(second.runtime.prisoners.actionSystem.getMetrics()).toEqual(first.runtime.prisoners.actionSystem.getMetrics());
  });
});
