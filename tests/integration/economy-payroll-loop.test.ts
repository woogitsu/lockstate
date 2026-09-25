import { createHistoricalOpeningRuntime } from '../helpers/historical-opening-treasury';

import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE } from '../../src/content/localization';
import { SIMULATION_PROTOCOL_VERSION, workerToMainMessageSchema, type WorkerToMainMessage } from '../../src/simulation/protocol/types';
import { Localizer, defaultMessageCatalogEn } from '../../src/services/localization';
import { hudEventNoticeFromWorkerMessage } from '../../src/ui/simulation-events';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { packCommand } from '../../src/simulation/protocol/commands';
import { type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { staffHireCostMinorUnits } from '../../src/simulation/staff';
import { wallRoomPerimeter } from '../helpers/room-walls';

/** Historical 25,000-grant scenario, kept to measure its original economy boundary. */
const SCENARIO_STARTING_BALANCE_MINOR_UNITS = 25_000;

/**
 * **The prison now costs money to run.**
 * ([ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * step 3, [ADR 0017](../../docs/adr/0017-money-primary-resource-model.md)
 * decision 8's precondition.)
 *
 * `tests/unit/economy-payroll.test.ts` pins the arithmetic against wages it
 * authors itself. This file asks the questions a unit test cannot:
 *
 * - Is the system **wired**? A deleted call site that leaves everything green
 *   is this repository's most-found defect, and a payroll nobody registered
 *   looks exactly like a payroll that charges nothing.
 * - Does the **shipped** guard band actually reach the treasury once a day in a
 *   session built from real commands?
 * - Can a prison a player could build actually run out of money, and does the
 *   ladder ADR 0017 decision 8 authors follow from it -- deliveries refused
 *   first, then staff unpaid?
 * - Can it dig back out through a command a player has?
 *
 * Every command here is one the interface can send: `PurchaseMaterials`,
 * `ZoneRoom`, `PlaceObject`, `HireStaff`, `AdmitPrisoner`. The one shortcut is
 * `wallRoomPerimeter`, for the reason that helper states about itself.
 *
 * ## Where the figures come from
 *
 * Read off runs of this fixture and written out. `WAGE` and the opening balance
 * are read from content and from `SCENARIO_STARTING_BALANCE_MINOR_UNITS`, so
 * moving the guard band moves this file with it rather than breaking it -- but
 * every *balance* is a literal, so an implementation that charged twice, or
 * once, or never would move one of them.
 */

const SEED = 0x9a6e5;
const GUARD = 'staff-role.guard';
const ARRIVAL = { x: 16, y: 16 } as const;
const ADMISSION = { sentenceLengthTicks: 400_000, priorIncidents: 0 } as const;

/** The catalogue's guard wage: one day's worth, and also what one hire costs up front (ADR 0025 decision 2). */
const WAGE = staffHireCostMinorUnits(GUARD)!;
/** The catalogue's brick, written out: a wall order is two of them. */
const BRICK_PRICE = 40;

function submit(runtime: SimulationRuntime, id: string, payload: ReturnType<typeof packCommand>): void {
  runtime.kernel.submitCommand(id, runtime.kernel.expectedSequence, runtime.kernel.tick, payload);
  runtime.kernel.step();
}

function stepTo(runtime: SimulationRuntime, tick: number): void {
  while (runtime.kernel.tick < tick) runtime.kernel.step();
}

/** Cells in a row along the top of the one chunk a new prison owns, three tiles apart so no two share a wall. */
function cellRect(index: number): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } {
  return { x: 1 + index * 3, y: 1, width: 2, height: 3 };
}

/** A prison of `cells` furnished cells, built through the real command path and standing by tick 1,000. */
function beddedPrison(cells: number): SimulationRuntime {
  const runtime = createHistoricalOpeningRuntime(SEED);
  const rects = Array.from({ length: cells }, (_unused, index) => cellRect(index));
  // One plank per bed: `materialsRequired[0].quantity` is the object's
  // footprint width and `bed-wooden` is one tile wide.
  submit(runtime, 'buy-planks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-p', itemId: 'item.wood-plank', quantity: cells }));
  for (const rect of rects) wallRoomPerimeter(runtime.world, rect, { doors: runtime.navigation.doors });
  rects.forEach((rect, index) => submit(runtime, `zone${String(index)}`, packCommand({ type: 'ZoneRoom', roomId: 'room.cell', ...rect })));
  rects.forEach((rect, index) =>
    submit(runtime, `bed${String(index)}`, packCommand({ type: 'PlaceObject', orderId: `bed${String(index)}`, definitionId: 'bed-wooden', x: rect.x, y: rect.y })),
  );
  stepTo(runtime, 1_000);
  expect(runtime.refusals.count, 'the fixture must build the prison it says it builds').toBe(0);
  return runtime;
}

function hire(runtime: SimulationRuntime, count: number, offset = 0): void {
  for (let index = 0; index < count; index += 1) {
    submit(runtime, `hire-${String(offset + index)}`, packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
  }
}

function admit(runtime: SimulationRuntime, count: number, offset = 0): void {
  for (let index = 0; index < count; index += 1) {
    submit(runtime, `admit-${String(offset + index)}`, packCommand({ type: 'AdmitPrisoner', ...ADMISSION, ...ARRIVAL }));
  }
}

describe('the payroll is on the kernel of a session a player can start', () => {
  it('is registered, at the order the determinism pin records', () => {
    // The wiring, asserted directly. Everything else in this file measures a
    // balance, and a balance that failed to move is indistinguishable from a
    // prison that owed nothing -- so the registration is checked where it
    // cannot be confused with an arithmetic result.
    const runtime = createHistoricalOpeningRuntime(SEED);
    expect(runtime.kernel.systemExecutionOrder).toContainEqual({ id: 'economy.payroll', order: 130 });
  });

  it('bills the catalogue`s wage per guard per in-game day, out of a real hire', () => {
    const runtime = createHistoricalOpeningRuntime(SEED);
    expect(runtime.treasury.balanceMinorUnits).toBe(SCENARIO_STARTING_BALANCE_MINOR_UNITS);

    hire(runtime, 2);
    // Two engagement charges of one day's wage each, before any day has ended.
    expect(runtime.treasury.balanceMinorUnits).toBe(SCENARIO_STARTING_BALANCE_MINOR_UNITS - 2 * WAGE);

    // One tick short of the first boundary the payroll has not run.
    stepTo(runtime, DAY_LENGTH_TICKS - 1);
    expect(runtime.treasury.balanceMinorUnits).toBe(SCENARIO_STARTING_BALANCE_MINOR_UNITS - 2 * WAGE);

    // 25,000 less two hires at 80 and then two wages at 80: 24,680. Written
    // out, because an implementation that charged the roster once at session
    // start would produce 24,840 and one that charged per tick would produce a
    // number nothing here would recognise.
    stepTo(runtime, DAY_LENGTH_TICKS);
    expect(runtime.treasury.balanceMinorUnits).toBe(24_680);

    // And again the next day, and the next: 160 a day, for ever, declined by
    // nobody.
    stepTo(runtime, DAY_LENGTH_TICKS * 2);
    expect(runtime.treasury.balanceMinorUnits).toBe(24_520);
    stepTo(runtime, DAY_LENGTH_TICKS * 3);
    expect(runtime.treasury.balanceMinorUnits).toBe(24_360);
  });

  it('publishes what the roster costs and what it owes, on the channel the HUD reads', () => {
    const runtime = createHistoricalOpeningRuntime(SEED);
    expect(projectStatusCounts(runtime, runtime.kernel.tick).dailyWageBillMinorUnits).toBe(0);

    hire(runtime, 3);
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    // Three guards at the catalogue's 80.
    expect(counts.dailyWageBillMinorUnits).toBe(240);
    expect(counts.unpaidWagesMinorUnits).toBe(0);
    expect(counts.staff).toBe(3);
  });
});

describe('hiring before there is anybody to guard is a decision the balance now punishes', () => {
  it('falls every day in a prison with no population, which nothing could make it do before', () => {
    // The trade-off this whole step exists to create, in its plainest form: an
    // empty prison earns nothing (`StateIncomeSystem` pays per *occupied
    // place*) and three guards cost 240 a day.
    const runtime = createHistoricalOpeningRuntime(SEED);
    hire(runtime, 3);

    const balances = [24_520, 24_280, 24_040, 23_800];
    for (let day = 1; day <= balances.length; day += 1) {
      stepTo(runtime, DAY_LENGTH_TICKS * day);
      expect(runtime.treasury.balanceMinorUnits, `day ${String(day)}`).toBe(balances[day - 1]);
    }

    // Thirty days of it: 25,000 less three hires at 80 and thirty days at 240.
    stepTo(runtime, DAY_LENGTH_TICKS * 30);
    expect(runtime.treasury.balanceMinorUnits).toBe(17_560);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
  });

  it('is paid for out of the same day`s income once the beds are occupied', () => {
    // The same three guards in a prison that houses eight: the state pays per
    // occupied place per day, so the day settles well ahead and the balance
    // climbs. Payroll runs *after* the income on the same tick, which is what
    // makes this one settlement rather than a dip and a recovery.
    const runtime = beddedPrison(8);
    hire(runtime, 3);
    admit(runtime, 8);

    stepTo(runtime, DAY_LENGTH_TICKS * 10);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(8);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
    /*
     * 42,640 on day 10, from 24,240 after the build.
     *
     * **This read 45,840 until the state grant became conditional on the
     * conditions a prisoner is held in**
     * ([ADR 0064](../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md)),
     * and the 3,200 between
     * the two figures is the whole of what this prison is now charged for
     * being a row of cells and nothing else. `beddedPrison` builds no shower
     * room and no yard, so `hygiene` crosses the unmet line on day 5 and
     * `recreation` on day 7: the day's income is 2,400 for four days, 2,080
     * for two and 1,760 for four (measured; the day-by-day series and the need
     * levels behind it are in
     * `tests/integration/needs-state-grant-loop.test.ts`).
     *
     * The 2.5%-of-income shape of the wage bill that this step used to report
     * is unchanged -- 240 a day against income that starts at 2,400 -- and it
     * is still the finding rather than a defect.
     *
     * **It reads 45,840 again since the owner's ruling of 2026-09-03**, which
     * set `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to `0` while they
     * play and judge difficulty -- *"usuń na razie kary, zobaczymy jak pogram
     * i ocenię łatwość"*. That is the *same figure* the paragraph above says
     * this assertion carried before ADR 0064, to the minor unit, and it is
     * kept as a whole rather than rewritten because the two readings are now
     * the two sides of one suspended decision: 45,840 with nothing withheld,
     * 42,640 with 3,200 withheld over ten days for being a row of cells and
     * nothing else. `tests/integration/needs-state-grant-loop.test.ts` prices
     * that same 3,200 off its own measured days at ADR 0064's rate, so the
     * figure this arm gives up is not lost.
     *
     * **And it reads 42,640 again since the owner restored the rate to `40` on
     * 2026-09-04**, after the four-prisoner and fifty-prisoner measurements
     * they made the restoration conditional on. Both directions are marked
     * rather than overwritten (`docs/AGENT_WORKFLOW.md` §4), and the whole
     * point of the paragraph above is that this number had already been both
     * of its values: the suspension moved it to a figure it had held before
     * ADR 0064, and the restoration moves it back to the one ADR 0064 gave it.
     * Nothing else in this fixture moved on either date -- same seed, same
     * build, same eight admissions, same ten days.
     */
    expect(runtime.treasury.balanceMinorUnits).toBe(42_640);
  });
});

describe('a prison can run out of money, and ADR 0017 decision 8`s ladder follows from one balance', () => {
  /**
   * The fixture: eight furnished cells, two prisoners in them, twelve guards --
   * four times what `DEFAULT_SECTOR_PRISONERS_PER_GUARD` asks for at this
   * population -- and then the rest of the treasury spent on bricks.
   *
   * **Spending it on bricks is the point, not a shortcut.** It is the trade-off
   * this step exists to create, taken by a real command: money committed to
   * materials is money that is not there on payday.
   */
  function overcommitted(): SimulationRuntime {
    const runtime = beddedPrison(8);
    hire(runtime, 12);
    admit(runtime, 2);
    // 550 bricks at 40: 22,000 of the remaining balance, leaving too little to
    // meet a 960 payroll for long.
    submit(runtime, 'buy-bricks', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-b', itemId: 'item.brick', quantity: 550 }));
    expect(runtime.refusals.count, 'the fixture must be able to afford the bricks it buys').toBe(0);
    return runtime;
  }

  /**
   * The question this asks is the player's: **the prison ran out of money --
   * was I told, and was I told who is owed and how much?**
   *
   * Measured before this change, in a played prison at the moment it hit zero,
   * the status strip read `0 Prisoners · 3 Staff · 0 Funds · 0 Earned today`
   * and nothing else. `dailyWageBillMinorUnits` and `unpaidWagesMinorUnits`
   * both cross the protocol and neither had a reader anywhere under `src/ui/`.
   * ADR 0017's stated cost of its answer 3 is that *"degradation has to be
   * authored and surfaced, or insolvency becomes the same invisible stall as
   * #89"*, and this is the surfacing half.
   *
   * The fixture supplies none of what it measures: the day the prison first
   * fails to make payroll is decided by the kernel out of real hires, a real
   * purchase and a real income, and the test reads that day off the arrears
   * rather than choosing it.
   */
  it('says so when payday cannot be met, and names what is owed', () => {
    const runtime = overcommitted();

    /*
     * Days 1-9 are met in full, so the prison has nothing to say about wages.
     * Asserted before the failure, so a producer that announced every payday
     * -- or every tick -- could not pass this.
     *
     * **This read *"days 1-4"* and *"day 5 is the first it cannot meet"* until
     * the owner's ruling 19 of 2026-08-31.** Ruling 19 -- drafted as ADR 0017's
     * "Amendment, 2026-09-01" -- puts ADR 0017 decision 8's third rung at the
     * overdraft floor rather than at a balance of zero, so a payday is met out
     * of the overdraft until -2,500. The prison now takes five more in-game days
     * to miss one; nothing else about what it says, or how often, has moved.
     */
    stepTo(runtime, DAY_LENGTH_TICKS * 9);
    expect(runtime.payroll.unpaidWagesMinorUnits, 'nine paydays must have been met for this test to mean anything').toBe(0);
    /*
     * **Not `[]` any more, and that is the finding rather than a defect.**
     * This assertion read `toEqual([])` and the comment here read "a prison
     * that has paid its staff every day has nothing to say about payday"
     * until issue #767 (ADR 0087 decision 2's amendment,
     * `InsolvencyRungSystem`). It is still true of *payday* -- neither event
     * below is `economy.wages-unpaid` -- and it is exactly the ladder ADR
     * 0017 decision 8 authors that this fixture's own heading names:
     * deliveries are refused and construction is halted **while wages are
     * still being paid in full out of the overdraft**, because
     * `PayrollSystem` draws all the way to the wages rung (the floor, -2,500)
     * and the other two rungs sit above it. A prison that "has nothing to say
     * about payday" for nine days has, in this same window, already lost the
     * ability to buy and the ability to fund construction -- the exact shape
     * #767 measured being told to nobody before this system existed.
     *
     * **This read "deliveries are refused (tick 16,799, day 7) and
     * construction is halted (tick 21,599, day 9)", two days apart, and the
     * owner's ruling on #771 (2026-09-01, ADR 0017's equalisation amendment)
     * closed that gap.** `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` now
     * equals `INSOLVENCY_RUNG_DELIVERIES_FLOOR_MINOR_UNITS`, so a balance
     * sinking past the shared -1,250 crosses both in the same tick -- 16,799,
     * day 7, exactly where deliveries already fires, not two days later.
     *
     * **The shared rung is crossed on day 8 since the owner's ruling of
     * 2026-09-03, not day 7, and the day it moved by is the measurement.**
     * With `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` at `0` this
     * prison's income no longer falls as its needs go unserved, so it sinks at
     * a flat 360 a day instead of accelerating: 1,520 - 360n, past -1,250 on
     * day 8 (-1,360) rather than on day 7. Everything the sentence above says
     * about *which* rungs fire and about their firing together is untouched --
     * only when. Kept rather than rewritten for that reason
     * (`docs/AGENT_WORKFLOW.md` §4).
     *
     * **It is day 7 again since the owner restored the rate to `40` on
     * 2026-09-04**, at -1,320, exactly where the paragraph above says it was
     * before the suspension. The sink accelerates again, and the one day
     * between the two readings is this mechanic's whole effect on this prison
     * -- which is a smaller thing than "the shared rung" and is worth having
     * measured either way. Both directions are marked rather than overwritten.
     */
    /*
     * **Both sides of a 2026-09-05 merge conflict are kept here, because each
     * was right about a different thing and neither alone is.** The filter and
     * the dropped ordinals are #966 site 2's (an accepted `ZoneRoom` now speaks,
     * so `sequence: 1` and `2` stopped being facts about the ladder). The tick
     * is #986's: restoring `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`
     * to `40` moved the crossing from day 8 to day 7, which is the whole point
     * of that change and is asserted elsewhere in this file.
     */
    /*
     * **Narrowed to the `economy.*` family on 2026-09-04 (#966 site 2), and the
     * old line is quoted rather than deleted** (`docs/AGENT_WORKFLOW.md` §4):
     *
     * > expect(runtime.events.since(0), '…').toEqual([
     * >   { sequence: 1, tick: DAY_LENGTH_TICKS * 7 - 1, type: 'economy.deliveries-refused' },
     * >   { sequence: 2, tick: DAY_LENGTH_TICKS * 7 - 1, type: 'economy.construction-refused' },
     * > ]);
     *
     * An accepted `ZoneRoom` now says so, and this fixture zones its cells
     * through the real command -- so the two crossings are no longer the first
     * two things the session said, and the ordinals `1` and `2` were a fact
     * about the fixture rather than about the ladder. The claim in the message
     * is *which* rungs fire and that they fire **together**, and the shared
     * tick is what carries "together"; the ordinals never did. What is dropped
     * with them is nothing this case asserted: the filter still fails a ladder
     * that fires a third `economy.*` event, in the wrong order, or on two
     * different ticks.
     */
    expect(
      runtime.events
        .since(0)
        .filter((event) => event.type.startsWith('economy.'))
        .map((event) => ({ tick: event.tick, type: event.type })),
      'the two rungs above the wages floor, crossed together before any payday is missed',
    ).toEqual([
      { tick: DAY_LENGTH_TICKS * 7 - 1, type: 'economy.deliveries-refused' },
      { tick: DAY_LENGTH_TICKS * 7 - 1, type: 'economy.construction-refused' },
    ]);

    // **Day 10 is the first it cannot meet, at 140 of room and 380 owed.**
    // Between 2026-09-03 and 2026-09-04, with nothing withheld, it was day 12
    // at 60 of room and 300 owed: a prison no longer charged for its unserved
    // needs took two more in-game days to miss a payday. The owner restored
    // the rate on 2026-09-04 and both readings are kept
    // (`docs/AGENT_WORKFLOW.md` §4) -- two days and 80 of arrears is what the
    // mechanic is worth to this fixture, measured in both directions.
    stepTo(runtime, DAY_LENGTH_TICKS * 10);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(380);

    // The two rung crossings above are still the only two of their kind: this
    // is one missed payday, not one event overall, now that the ladder's
    // upper rungs have their own channel entries.
    const afterFirstMiss = runtime.events.since(0).filter((event) => event.type === 'economy.wages-unpaid');
    expect(afterFirstMiss.length, 'one missed payday is one wages-unpaid sentence').toBe(1);
    // The figure the player is told is the arrears the save also carries, not
    // the day's shortfall by some other arithmetic.
    expect(afterFirstMiss[0]).toMatchObject({ type: 'economy.wages-unpaid', unpaidWagesMinorUnits: 380 });

    const message = workerToMainMessageSchema.parse({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: '00000000-0000-4000-8000-000000000509',
      kind: 'simulation/event',
      payload: { tick: runtime.kernel.tick, event: afterFirstMiss[0]! },
    }) as WorkerToMainMessage;
    const notice = hudEventNoticeFromWorkerMessage(message);
    if (notice === undefined || notice === 'none') throw new Error('the band must be given something to say');

    /*
     * `'warning'`, and it is the first `'warning'` in the repository that is
     * not a refusal of something the player asked for -- nobody pressed
     * anything, the prison ran out of money on its own.
     *
     * Not `'danger'`: ADR 0049 decided insolvency is a recoverable state
     * rather than a loss condition, and this HUD says what `'danger'` means --
     * "stop trusting what you are looking at".
     */
    expect(notice.severity).toBe('warning');

    const localizer = new Localizer({ locale: DEFAULT_LOCALE, catalogs: [defaultMessageCatalogEn] });
    const sentence = localizer.format(notice.labelKey, notice.labelParameters);
    expect(sentence, 'the player must not be shown a raw message key').not.toContain('hud.alert.event');
    expect(sentence, 'and the sentence must name what is owed').toContain('380');

    /*
     * **Once a day while it stays broke, not twice a second.** This is the
     * volume rule, asserted against three more in-game days rather than
     * described: `PayrollSystem`'s whole schedule is one tick a day, so the
     * ceiling is a property of where the producer sits and not of a filter
     * downstream.
     */
    stepTo(runtime, DAY_LENGTH_TICKS * 15);
    /*
     * **380 owed on day 10 and 520 a day compounding after it -- the 960 bill
     * less the 440 this prison still earns with both needs unserved -- is
     * 2,980 on day 15, and that is what this asserted for the whole life of
     * the ladder before ADR 0096 decision 3(c) (accepted 2026-09-10).** This
     * read `1_380` (300 owed from day 12, then 360 a day) while the withheld
     * share was suspended between 2026-09-03 and 2026-09-04, and both readings
     * are kept (`docs/AGENT_WORKFLOW.md` §4).
     *
     * **Superseded by the arrears bound, `ARREARS_BOUND_MINOR_UNITS` (2,500).**
     * Day 14 reaches 2,460 (still under the bound, unaffected); day 15 would
     * add the 960 bill's usual 520 and land on 2,980, and decision 3(c) caps
     * the *carried* figure at exactly 2,500 instead -- the 480 above the bound
     * forgiven rather than deferred, per that decision's own words. Since
     * #641, the shipped grant and its derived facility move the shared arrears
     * cap to 10,000. This historical 25,000-grant scenario now carries the
     * full measured 2,980 on day 15.
     */
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(2_980);
    // Filtered to `economy.wages-unpaid` for the reason the first check above
    // is: the two rung-crossing events from day 8 are still on the channel
    // (nothing here retires them) and are not paydays. **This comment said
    // "day 7 and day 9" while `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`
    // sat above the deliveries floor, and both rungs have shared one day since
    // the owner's ruling on #771; the day itself moved from 7 to 8 with the
    // ruling of 2026-09-03.**
    //
    // **Between 2026-09-03 and 2026-09-04, with the withheld share suspended,
    // the run to day 15 started missing paydays on day 12 rather than on day
    // 10 and compounded at 360 a day rather than 520: four missed paydays
    // totalling 1,380 where the withheld schedule gives six totalling 2,980.**
    // Both readings are kept (`docs/AGENT_WORKFLOW.md` §4). What this checks
    // is one sentence per payday, and that is a property of where the producer
    // sits rather than of any of those figures -- which is why the count moves
    // with the rate and the rule does not.
    const afterMisses = runtime.events.since(0).filter((event) => event.type === 'economy.wages-unpaid');
    expect(
      afterMisses.length,
      'a prison that stays broke says so once per payday -- six missed paydays, six sentences',
    ).toBe(6);
    // 2,980 uncapped, kept above; the arrears bound (ADR 0096 decision 3(c))
    // caps the sentence's own figure at 2,500, same as `unpaidWagesMinorUnits`.
    expect(afterMisses.at(-1)).toMatchObject({ type: 'economy.wages-unpaid', unpaidWagesMinorUnits: 2_980 });
    // And the ladder's whole shape in one assertion: two rung crossings while
    // solvent, then one wages-unpaid sentence per missed payday thereafter --
    // eight events for eight real things that happened, none of them repeated.
    // This list carried four `wages-unpaid` entries, for six events in all,
    // while the withheld share was suspended between 2026-09-03 and 2026-09-04;
    // restoring it to `40` (#986) put the other two back.
    //
    // **Filtered to the `economy.*` family on 2026-09-04 (#966 site 2)**: an
    // accepted `ZoneRoom` now says so, and this fixture zones eight cells
    // through the real command, so the whole log is no longer this case's
    // subject. The ladder's shape is, and the filter is what keeps this case
    // about the ladder while the log grows around it.
    expect(runtime.events.since(0).map((event) => event.type).filter((type) => type.startsWith('economy.'))).toEqual([
      'economy.deliveries-refused',
      'economy.construction-refused',
      'economy.wages-unpaid',
      'economy.wages-unpaid',
      'economy.wages-unpaid',
      'economy.wages-unpaid',
      'economy.wages-unpaid',
      'economy.wages-unpaid',
    ]);
  });

  it('spends the overdraft on wages, stops at the wage rung and starts owing there', () => {
    /*
     * **This case was titled *"empties the treasury, floors it at zero and
     * starts owing wages instead of overdrawing"*, and the owner's ruling 19 of
     * 2026-08-31 made that title its opposite.** What stood here:
     *
     * > Day 5 is the first the prison cannot meet ... 80 in hand plus 520
     * > against a 960 bill: it pays 600, the balance stops at 0 rather than
     * > going to -360, and 360 is owed.
     *
     * > ```
     * > stepTo(runtime, DAY_LENGTH_TICKS * 5);
     * > expect(runtime.treasury.balanceMinorUnits).toBe(0);
     * > expect(runtime.payroll.unpaidWagesMinorUnits).toBe(360);
     * > stepTo(runtime, DAY_LENGTH_TICKS * 8);
     * > expect(runtime.treasury.balanceMinorUnits).toBe(0);
     * > expect(runtime.payroll.unpaidWagesMinorUnits).toBe(1_840);
     * > ```
     *
     * Ruling 19 -- drafted as ADR 0017's "Amendment, 2026-09-01" -- puts ADR
     * 0017 decision 8's third rung at the overdraft floor: *wages unpaid below
     * -2,500*, which means **paid down to it**. The prison therefore overdraws
     * for five more days and floors at the rung instead of at zero. Everything
     * else here is arithmetic that has not changed: the same bill, the same
     * income, the same conditional grant.
     */
    const runtime = overcommitted();
    // 25,000 less 8 planks at 65 (520), 12 hires at 80 (960) and 550 bricks at
    // 40 (22,000): 1,520 in hand against 960 a day.
    expect(runtime.treasury.balanceMinorUnits).toBe(1_520);

    // Day 1: 600 of income for two occupied places, 960 of wages. 1,520 + 600
    // - 960 = 1,160. Days 2, 3 and 4 take 360 more each: 800, 440, 80.
    stepTo(runtime, DAY_LENGTH_TICKS);
    expect(runtime.treasury.balanceMinorUnits).toBe(1_160);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
    stepTo(runtime, DAY_LENGTH_TICKS * 4);
    expect(runtime.treasury.balanceMinorUnits).toBe(80);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);

    /*
     * Day 5 is the first day the state pays the prison less, and the first the
     * balance goes under water. `beddedPrison` has no shower room, so `hygiene`
     * crosses `STATE_INCOME_UNMET_NEED_LEVEL` on day 5 and the day's income
     * falls from 600 to 520 (two places at 260). 80 in hand plus 520 against a
     * 960 bill: the whole bill is met out of the overdraft and the balance goes
     * to -360, owing nothing.
     *
     * **The 520 read 280 before the grant became conditional**
     * ([ADR 0064](../../docs/adr/0064-what-an-unmet-need-costs-a-prison.md)).
     * The direction is still the one worth stating: a prison that is failing its
     * prisoners reaches insolvency sooner and digs out of it more slowly.
     *
     * **And it reads 600 again since the owner's ruling of 2026-09-03**, which
     * set `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to `0` while they
     * play. Day 5 is no longer the first day the state pays this prison less
     * -- there is no such day -- so it is simply the day the balance goes under
     * water: 80 in hand plus 600 against a 960 bill, the whole bill met out of
     * the overdraft, -280 and owing nothing. The paragraph above is kept as it
     * stands because it is what the withheld schedule does to this same
     * prison, and because the direction it states is exactly what the owner is
     * now judging by playing.
     *
     * **The owner judged it, and it reads 520 again since they restored the
     * rate on 2026-09-04.** Day 5 is once more the first day the state pays
     * this prison less: 80 plus 520 against 960, met out of the overdraft,
     * **-360** and owing nothing. Both directions are marked rather than
     * overwritten, and the 80 between -280 and -360 is one day of one need on
     * two places -- the smallest unit of this mechanic there is.
     */
    stepTo(runtime, DAY_LENGTH_TICKS * 5);
    expect(runtime.treasury.balanceMinorUnits).toBe(-360);
    expect(runtime.payroll.unpaidWagesMinorUnits, 'the overdraft is what pays it, so nothing is owed').toBe(0);

    /*
     * And down it goes: 440 more on day 6, then 520 a day once `recreation`
     * crosses the line on day 7 as well -- the 960 bill less an income that is
     * itself falling. -800, -1,320, -1,840, -2,360.
     *
     * **Between the ruling of 2026-09-03 and its reversal on 2026-09-04 it
     * went down at a flat 360 a day, and the accelerating series above is what
     * the withheld schedule does to it.** With nothing withheld the income did
     * not fall, so the balance was 1,520 - 360n exactly: -640, -1,000, -1,360,
     * -1,720. Both series are kept (`docs/AGENT_WORKFLOW.md` §4), because the
     * difference between them -- a prison sinking faster the worse it treats
     * its prisoners, against one sinking at the rate of its own payroll -- is
     * the whole of what the owner asked to feel while they played, and the
     * accelerating one is what they chose after playing it.
     */
    stepTo(runtime, DAY_LENGTH_TICKS * 9);
    expect(runtime.treasury.balanceMinorUnits).toBe(-2_360);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);

    /*
     * Day 12 is the first payday the prison cannot meet, and the rung is what
     * says so: 60 of room against a 960 bill. It pays 660, lands exactly on
     * -2,500 and owes 300. From there the balance does not move again -- the
     * rung holds -- and the debt compounds at 360 a day.
     *
     * **It is day 10 again since the owner restored the rate on 2026-09-04**:
     * 140 of room against a 960 bill, 380 owed. Every figure in the paragraph
     * above is the suspended schedule's and is kept rather than overwritten
     * (`docs/AGENT_WORKFLOW.md` §4) -- two extra in-game days of solvency is
     * what the suspension bought this prison, and it is what the restoration
     * takes back.
     */
    stepTo(runtime, DAY_LENGTH_TICKS * 10);
    expect(runtime.treasury.balanceMinorUnits, 'exactly the wage rung, which is the floor').toBe(-2_500);
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(380);

    stepTo(runtime, DAY_LENGTH_TICKS * 15);
    expect(runtime.treasury.balanceMinorUnits, 'and no payday may pass it').toBe(-2_500);
    /*
     * **Five days of debt after the first miss, at 520 a day rather than the
     * suspended schedule's 360, is `380 + 5 x 520` = 2,980 -- this read `1_380`
     * between 2026-09-03 and 2026-09-04, and both are kept.** Superseded by
     * ADR 0096 decision 3(c)'s arrears bound (accepted 2026-09-10): day 14 is
     * 2,460, day 15's usual +520 would reach 2,980, and it is capped at
     * `ARREARS_BOUND_MINOR_UNITS` (2,500) instead -- forgiven, not deferred.
     * With #641's derived 10,000 cap, the historical scenario carries 2,980.
     */
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(2_980);
  });

  /**
   * **This case was titled *"refuses a delivery first, which is the ladder's top
   * rung and needed no new code"*, then *"refuses a delivery only once the
   * overdraft is gone, which runs ADR 0017 decision 8's ladder backwards"*. The
   * owner's ruling 19 of 2026-08-31 turns it back the right way round, and all
   * three readings are kept because the case is the record of the ladder being
   * broken and repaired.**
   *
   * What stood here first, and every line of it was measured:
   *
   * > ```
   * > stepTo(runtime, DAY_LENGTH_TICKS * 5);
   * > expect(runtime.treasury.balanceMinorUnits).toBe(0);
   * > submit(... PurchaseMaterials, quantity: 1);
   * > expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
   * > submit(... HireStaff);
   * > expect(runtime.refusals.last?.reason).toBe('hire.insufficient-funds');
   * > ```
   *
   * [ADR 0017](../../docs/adr/0017-money-primary-resource-model.md) decision 8
   * reads *"At a negative balance the state stops paying for discretionary
   * things in a defined order"* -- deliveries refused, then construction
   * halted, then wages unpaid. The old assertions are that ladder's first two
   * rungs firing at a balance of zero, which is where they had to fire while
   * `Treasury`'s floor was zero.
   *
   * What stood here second, under #703 ruling A:
   *
   * > **`Treasury.canAfford` is one comparison over every spend**
   * > (`balance - amount >= floor`), so a standing overdraft moves *all* of the
   * > discretionary refusals to the floor at once. A prison that cannot pay its
   * > staff now buys bricks and hires guards for another 2,500 -- the third rung
   * > fires first, because `PayrollSystem` is bounded by the balance and the
   * > other two are bounded by the floor. The ladder runs backwards.
   *
   * > ```
   * > expect(runtime.refusals.count, 'a delivery is bought out of the overdraft, with wages owed').toBe(before);
   * > expect(runtime.treasury.balanceMinorUnits).toBe(-40);
   * > submit(... 59 bricks); expect(runtime.treasury.balanceMinorUnits).toBe(-2_480);
   * > ```
   *
   * ADR 0083 §2 recorded that an amendment to decision 8 was owed and that it
   * was the owner's to sign. **Ruling 19 is that amendment's source** --
   * *"Dać szczeblom własne progi wewnątrz debetu"*, give the rungs their own
   * thresholds inside the overdraft, at -1,250, -2,000 and -2,500. It is
   * recorded at `docs/adr/0017-money-primary-resource-model.md` ("Amendment,
   * 2026-09-01") and was **Accepted 2026-09-01**.
   *
   * So this case measured the ladder running **forwards**, three rungs deep,
   * and it did it the way decision 8 describes: not by positioning a balance
   * three times, but by letting one prison sink and watching which rung it
   * meets first.
   *
   * **The owner's ruling on #771, the same day, retired the middle step.**
   * #771 found a 750-wide band in which a purchase the shop refused was still
   * funded for a queued build order needing the same materials, and the owner
   * ruled *"buying and building stop at the same place"*:
   * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` now reads the same
   * -1,250 the delivery rung does. This prison's sink is unaffected --
   * nothing about income, wages or the purchase that overcommits it moved --
   * so the day the balance first passes -1,250 is still day 7, at -1,320. What
   * moved is that **both** discretionary rungs fire that day rather than one
   * of them waiting until day 9, and the case below is corrected to measure
   * two rungs meeting together where it used to measure three meeting in
   * sequence. The reads are still `canAfford` and the arrears, so watching
   * costs nothing and the walk is still the fixture's own.
   */
  it('meets the two discretionary rungs together in ADR 0017 decision 8`s ladder, then wages unpaid last, as one prison sinks', () => {
    const runtime = overcommitted();

    /** The ladder's two remaining depths, as questions asked of the treasury rather than of a balance. */
    const rungs = (): { deliveries: boolean; construction: boolean; wages: number } => ({
      // One brick, which is the smallest thing a player can press Buy for.
      deliveries: runtime.treasury.canAfford(BRICK_PRICE, 'deliveries'),
      // One wall order's materials, which is the smallest thing the queue buys.
      construction: runtime.treasury.canAfford(2 * BRICK_PRICE, 'construction'),
      wages: runtime.payroll.unpaidWagesMinorUnits,
    });

    const firstDayThat = (predicate: (state: ReturnType<typeof rungs>) => boolean): number => {
      for (let day = 1; day <= 13; day += 1) {
        stepTo(runtime, DAY_LENGTH_TICKS * day);
        if (predicate(rungs())) return day;
      }
      return -1;
    };

    // Day 7 (-1,320): the shared rung. A player pressing Buy is refused, and the
    // sentence they are shown is `AGENTS.md`'s fourth exclusion -- see the four
    // keys named at `src/content/default-locale-en.ts`. Construction fires with
    // it, the same day, at the same balance -- this is #771's own finding, read
    // off a real sink rather than probed as a boundary.
    //
    // **Day 8 (-1,360) between the owner's ruling of 2026-09-03 and their
    // restoration of the rate on 2026-09-04.** With nothing withheld the sink
    // was a flat 360 a day and the shared rung one day later; both readings
    // are kept (`docs/AGENT_WORKFLOW.md` §4). What this case measures is the
    // *order* of the rungs, and that did not move on either date -- which is
    // the property, and the days are the fixture.
    const deliveriesStopped = firstDayThat((state) => !state.deliveries);
    expect(deliveriesStopped, 'deliveries are refused first').toBe(7);
    expect(rungs().construction, 'and construction is refused with it, not two days later').toBe(false);
    expect(rungs().wages, 'and the staff are still being paid').toBe(0);

    /*
     * Construction never gets a day of its own to stop on any more, so it is
     * read at the same tick rather than searched for with a second
     * `firstDayThat` -- calling that again here would restart its loop at
     * day 1 while the clock has already reached day 7, and because the
     * predicate is already true at that already-elapsed tick it would return
     * day 1 without advancing anything, which is a false positive rather than
     * a finding. `deliveriesStopped` is the true day both rungs share.
     */
    const constructionStopped = deliveriesStopped;

    // Day 10 (-2,500): wages. The payday takes the 140 of room the rung
    // leaves, pays 820 out of the overdraft and owes the other 380. **Day 12,
    // 60 of room and 300 owed, between the owner's ruling of 2026-09-03 and
    // their restoration of the rate on 2026-09-04.**
    const wagesUnpaid = firstDayThat((state) => state.wages > 0);
    expect(wagesUnpaid, 'wages go unpaid last').toBe(10);
    expect(runtime.treasury.balanceMinorUnits).toBe(-2_500);

    // The ordering itself, stated as the assertion it is rather than left to be
    // read off the numbers: the two discretionary rungs are equal, and both
    // precede wages.
    expect([deliveriesStopped, constructionStopped, wagesUnpaid]).toEqual([7, 7, 10]);
    expect(deliveriesStopped).toBe(constructionStopped);
    expect(constructionStopped).toBeLessThan(wagesUnpaid);

    // And the presses themselves, so this is a refusal a player meets and not
    // only a predicate: both are past their rung by day 10.
    const before = runtime.refusals.count;
    submit(runtime, 'buy-more', packCommand({ type: 'PurchaseMaterials', orderId: 'buy-more', itemId: 'item.brick', quantity: 1 }));
    expect(runtime.refusals.last?.reason).toBe('purchase.insufficient-funds');
    submit(runtime, 'hire-more', packCommand({ type: 'HireStaff', staffRoleId: GUARD, ...ARRIVAL }));
    expect(runtime.refusals.last?.reason).toBe('hire.insufficient-funds');
    expect(runtime.refusals.count).toBe(before + 2);
    expect(runtime.treasury.balanceMinorUnits, 'and neither refusal took a minor unit').toBe(-2_500);
  });

  it('says so on the status channel rather than accruing an invisible debt', () => {
    // Day 5 and `0 / 360` until the owner's ruling 19 of 2026-08-31 moved the
    // third rung to the floor; the channel carries the same three figures.
    //
    // **Day 12 and `300` between the owner's ruling of 2026-09-03, which set
    // `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to `0`, and their
    // restoration of it to `40` on 2026-09-04.** Both readings are kept
    // (`docs/AGENT_WORKFLOW.md` §4). The subject here is that a debt is *on
    // the channel* rather than invisible, so the measurement sits on the first
    // day there is a debt to carry, and that day moves with the rate: day 10
    // owing 380 at `40`, day 12 owing 300 at `0`. Reading the wrong one of the
    // two asserts `0` and stops testing anything, which is why the day is
    // written beside the reason rather than left as a constant.
    const runtime = overcommitted();
    stepTo(runtime, DAY_LENGTH_TICKS * 10);
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    expect(counts.treasuryMinorUnits).toBe(-2_500);
    expect(counts.unpaidWagesMinorUnits).toBe(380);
    expect(counts.dailyWageBillMinorUnits).toBe(960);
  });

  it('digs out when the player fills the beds they already built', () => {
    /*
     * The recovery lever, and it is a command rather than a mechanic invented
     * for this: six more prisoners into six empty beds takes the income from
     * 440 a day to 2,240 against a 960 payroll. ADR 0017 decision 8 says the
     * interesting part of insolvency is digging out; this is it happening.
     *
     * **Every figure moved with the owner's ruling 19 of 2026-08-31 and the
     * lever did not.** What stood here:
     *
     * > ```
     * > stepTo(runtime, DAY_LENGTH_TICKS * 8);
     * > expect(runtime.payroll.unpaidWagesMinorUnits).toBe(1_840);
     * > admit(runtime, 6, 2);
     * > stepTo(runtime, DAY_LENGTH_TICKS * 9);
     * > expect(runtime.payroll.unpaidWagesMinorUnits).toBe(560);
     * > expect(runtime.treasury.balanceMinorUnits).toBe(0);
     * > stepTo(runtime, DAY_LENGTH_TICKS * 10);
     * > expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
     * > expect(runtime.treasury.balanceMinorUnits).toBe(720);
     * > ```
     *
     * On day 8 the prison now owes **nothing** -- the overdraft has been paying
     * the wages since day 5 -- and is at -1,840 instead. So the recovery is a
     * balance climbing out of the overdraft rather than arrears being cleared,
     * which is the same recovery seen from the other side of ruling 19's third
     * rung. It is still unconditional and still needs no command beyond the
     * admissions.
     *
     * **The hole is 480 shallower since the owner's ruling of 2026-09-03**:
     * -1,360 on day 8 rather than -1,840, because a flat 360 a day sinks this
     * prison instead of an accelerating one. **And the lever got weaker at the
     * same time, which is the part worth reporting.** Six arrivals used to take
     * the income from 440 a day to 2,240 -- their six undiminished 300s beside
     * the two long-standing prisoners' 220s -- and the *reason* the lever
     * worked so well was that the prison had been earning so little. With
     * nothing withheld the same six take it from 600 to 2,400, so the climb is
     * 1,440 a day against 1,280: faster in absolute terms, and a far smaller
     * multiple of what the prison was already earning. Every figure in the
     * quoted block above and in this paragraph is kept, because the pair of
     * them is the clearest statement in this file of what the suspended
     * mechanic was doing to the game's difficulty.
     *
     * **The owner restored the rate on 2026-09-04, so the hole is 480 deeper
     * again -- -1,840 on day 8 -- and the lever is back to being worth 1,280 a
     * day against a prison earning 440.** Both directions are marked. The
     * pairing above is the reason this case is worth reading twice: the
     * mechanic makes the prison worse off *and* makes the recovery lever
     * matter more, and neither half is visible from one rate alone.
     */
    const runtime = overcommitted();
    stepTo(runtime, DAY_LENGTH_TICKS * 8);
    expect(runtime.payroll.unpaidWagesMinorUnits, 'the overdraft has met every payday so far').toBe(0);
    expect(runtime.treasury.balanceMinorUnits).toBe(-1_840);

    admit(runtime, 6, 2);
    stepTo(runtime, DAY_LENGTH_TICKS * 9);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(8);
    /*
     * Six arrivals start at `NEED_MAX` on every need. **They used to be paid
     * the undiminished 300 while the two long-standing prisoners were paid
     * 220 -- 2,240 of income against a 960 bill, 1,280 towards the hole** --
     * and between the ruling of 2026-09-03 and its reversal on 2026-09-04 all
     * eight were paid 300: 2,400 against the same bill, 1,440 towards a hole
     * that was itself shallower, and this assertion read `80`. The rate is
     * `40` again, so the six are paid 300 and the two are paid 220 once more:
     * 2,240 against 960, 1,280 towards a hole of -1,840, which lands on -560
     * -- still under water on day 9, where the suspended schedule had already
     * crossed. Both directions are marked (`docs/AGENT_WORKFLOW.md` §4).
     */
    expect(runtime.payroll.unpaidWagesMinorUnits).toBe(0);
    expect(runtime.treasury.balanceMinorUnits).toBe(-560);

    // Day 10 is where the prison crosses zero, and it keeps climbing after
    // that, so the recovery is a recovery rather than a pause. **It crossed on
    // day 9 and read 1,520 on day 10, then 2,960 on day 11, while the withheld
    // share was suspended between 2026-09-03 and 2026-09-04**; both readings
    // are kept (`docs/AGENT_WORKFLOW.md` §4). The restored schedule costs the
    // climb one in-game day, 800 at the day-10 sample and 960 at the day-11
    // one -- the prison rises 1,280 a day here against the suspended
    // schedule's 1,440, because two of the eight places are priced at 220.
    // That is what the mechanic does to *recovery* rather than to the sink,
    // and this case is the only place in the suite it can be read.
    stepTo(runtime, DAY_LENGTH_TICKS * 10);
    expect(runtime.treasury.balanceMinorUnits).toBe(720);
    stepTo(runtime, DAY_LENGTH_TICKS * 11);
    expect(runtime.treasury.balanceMinorUnits).toBe(2_000);
  });
});
