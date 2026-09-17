import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS } from '../../src/simulation/economy';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';

/**
 * The subtle half of #29: the state pays at the **end** of the in-game day, so
 * what happens to a player who saves in the middle of one?
 *
 * Three outcomes were possible and only one of them is correct. A partial day
 * could be **lost** (the accrual is thrown away and the restored session
 * starts the day again), it could be **paid twice** (the boundary tick is
 * replayed after the restore), or it could be **neither**. This file asserts
 * neither, through the real save boundary, and asserts the reason as well as
 * the result: the accrual is *derived from the tick*, not stored, so there is
 * no partial-day accumulator for a save to mishandle.
 *
 * ## Why this needs no save-version bump, asserted rather than claimed
 *
 * `SAVE_SCHEMA_VERSION` was 4 when this file was written and is 6 now, and
 * **no number in that sequence is this system's**: 5 belongs to ADR 0028 phase
 * 1, which took `capacity` off a room instance and put a rectangle on it, and 6
 * to ADR 0113, which put each classification group's timetable in the save so a
 * command could edit it. What
 * this file asserts is unchanged and is the part that matters --
 * `StateIncomeSystem` holds no state at all
 * -- no accumulator, no last-paid tick -- so it adds no field to the payload,
 * changes no field's units and changes no field's meaning, which are the three
 * things V2, V3 and V4 were each bumped for. The test below does not take that
 * on trust: it reads the serialized envelope and requires that nothing in it
 * mentions this system, which is what makes "derived, not stored" a fact about
 * the save rather than a claim about the code.
 *
 * **The economy state in a save is no longer only the treasury balance**, and
 * this paragraph used to say it was: *"The only economy state in a save is the
 * treasury balance itself, and the balance is a result of past payments rather
 * than a record of a pending one."* The second clause is still true and is
 * still this file's subject. The first stopped being true with ADR 0042 step 3,
 * which added `simulation.economy.payroll` -- arrears, which genuinely are a
 * record rather than a result, because nothing in a restored session could
 * recompute the fact that a day's wages went unpaid. That field is
 * `tests/integration/economy-payroll-save.test.ts`'s subject, not this one's;
 * what it costs this file is the netting below, because the scenario's five
 * guards are now billed every day the income pays.
 *
 * ## Why this is an integration test and not a unit test
 *
 * `tests/unit/economy-state-income.test.ts` pins the arithmetic and the
 * cadence against a bare kernel. What it cannot show is that a real session's
 * occupied places survive a round trip through Zod, JSON and a checksum, or
 * that the restored kernel's tick lands the next payment where it belongs.
 * Both of those are properties of the save path, so they are proven on the
 * save path.
 *
 * ## The population, and where it comes from
 *
 * `buildDeterminismScenario` admits prisoners through `admitPrisoner` -- the
 * real entry point -- and `IntakeSystem` houses them in registered cells on
 * its own schedule. Nothing here calls `assign` by hand, so the occupied
 * places being paid for are the ones intake actually produced. **Nothing in
 * `src/` can do this**: no caller of `admitPrisoner` exists outside tests, so
 * a real session has no occupied place and this income line pays nothing.
 * That is why the population is injected at the simulation level here, and it
 * is not a demo of a working feature.
 */

const PRISON_ID = 'state-income-prison';

/** The full save path a session controller takes, including the storage round trip that destroys object identity. */
function saveAndLoad(runtime: SimulationRuntime): { restored: SimulationRuntime; serialized: string } {
  const bundle = captureSessionSnapshot(runtime);

  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: PRISON_ID,
    revision: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
  expect(
    envelope.saveSchemaVersion,
    'the income line adds no save field, so it must not have moved the save version',
  ).toBe(SAVE_SCHEMA_VERSION);
  // V5 since ADR 0028 phase 1, and the assertion is kept pinned rather than
  // deleted: what it guards is that a bump has a *reason*, not that the number
  // never moves. The reason for the latest one is ADR 0113 -- `simulation`
  // gains a required `regimeSchedules` section, because a timetable that can be
  // edited cannot be recovered from an absent field -- and it is nothing to do
  // with the income line, which still adds no field to the payload. The two
  // paragraphs below the version check are what actually enforce that.
  expect(SAVE_SCHEMA_VERSION, 'a bump needs its own reason; the income line is not one').toBe(6);

  const serialized = JSON.stringify(envelope);
  const decoded = decodeSaveEnvelope(JSON.parse(serialized) as unknown);
  expect(decoded).toMatchObject({ ok: true, migrated: false });
  if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

  return {
    restored: restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SCENARIO_SEED).runtime,
    serialized,
  };
}

/** A scenario stepped to `tick`, with intake having had time to house its arrivals. */
function sessionAtTick(tick: number): SimulationRuntime {
  const runtime = buildDeterminismScenario();
  submitScenarioCommands(runtime);
  for (let index = 0; index < tick; index += 1) runtime.kernel.step();
  expect(runtime.kernel.tick).toBe(tick);
  return runtime;
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

/**
 * How many occupied places this scenario actually settles at, read rather than
 * assumed.
 *
 * Four, and the model this figure defends is unchanged: the state pays for
 * occupied *places*, not for admitted prisoners (ADR 0017 decision 6), so this
 * is read off `totalOccupancy` and never derived from a prisoner count. A test
 * that hard-coded "four prisoners means four payments" would still be
 * asserting the wrong model even now that the two numbers agree, which is why
 * the first case below reads the registry rather than counting arrivals.
 *
 * It was 3 while the two numbers disagreed, and the reason they disagreed was
 * a defect rather than the model: the second arrival classified `high-risk`,
 * `DEFAULT_ACCOMMODATION_POLICY` sent that group to `room.solitary-cell`, this
 * scenario registers no instance of one, and the arrival landed in the
 * **terminal** `'failed'` stage -- a permanent, inert record the status strip
 * still counted as a prisoner. The policy now names an ordinary cell as
 * high-risk's fallback when the prison holds no solitary cell at all, so that
 * arrival is housed and the scenario settles at four occupied places.
 *
 * The two numbers agreeing here is a property of this scenario, not a rule: it
 * registers five cells for four arrivals. Nothing below assumes it.
 */
const OCCUPIED_PLACES = 4;
const ONE_DAY_PAYMENT = STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS * OCCUPIED_PLACES;

/**
 * What the scenario's own staff cost, which this file has to net off since
 * ADR 0042 step 3.
 *
 * `buildDeterminismScenario` hires five guards straight onto the roster
 * (`tests/helpers/determinism-scenario.ts:160`) rather than through
 * `StaffHiringService`, so no engagement charge is taken -- but `PayrollSystem`
 * reads the roster and bills all five at the catalogue's 80 a day on the same
 * boundary tick this file's income lands on. **Both figures are written out
 * here rather than read from the catalogue**, so a change to either is a
 * deliberate edit to this file and not a silent re-derivation; the first case
 * below asserts them against the runtime, so a literal that stops being true
 * fails where it is legible instead of turning every balance below into a
 * puzzle.
 *
 * Netting rather than removing the guards: the scenario is shared with the
 * determinism suite, and changing it to suit this file would move a fixture
 * several other files pin.
 */
const SCENARIO_STAFF = 5;
const ONE_DAY_WAGES = 400;
/**
 * What the scenario's four wall orders bought for themselves, which this file
 * has to net off since #627.
 *
 * `SCENARIO_COMMANDS` places four `wall-brick` orders against a prison whose
 * construction container starts empty, and ADR 0017 decision 7 -- *"materials
 * are just-in-time by default; holding is permitted, never required"* -- means
 * an order now buys what it needs at the moment it is placed. Measured on this
 * tree: **three** of the four buy, for 2 `item.brick` each at 40, and the
 * fourth buys nothing because the scenario's own carry jobs have moved bricks
 * into that container by the time it is placed. So 6 x 40 = 240, once, at tick
 * 0, and never again.
 *
 * That the fourth buys nothing is the *"holding is permitted"* half working,
 * and it is why this constant is 240 rather than 320. It is written out here
 * rather than read off the runtime for `ONE_DAY_WAGES`'s reason -- a figure
 * derived from the code under test agrees with any implementation -- and the
 * first case below anchors it against the scenario that produces it.
 *
 * **It is no longer spent all at once, and that is the second thing ADR 0093
 * moved here.** At tick 40 three orders have bought (240); the fourth buys its
 * two bricks later in the first day, as the container drains and the carry has
 * still not delivered, taking the settled figure to 320. So this file needs two
 * constants where it needed one, and the pair is the measurement: the
 * by-tick-40 figure anchors the first case and the settled figure anchors every
 * balance from tick 1,200 onwards. Nothing buys after that -- the day-two assertions hold against the
 * same settled figure.
 *
 * **This constant was 160 until
 * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md), and the old value is
 * kept here rather than overwritten because the *reason* it moved is the
 * decision.** Two of the four used to buy nothing, because the scenario's two
 * carry jobs had moved *twelve* bricks into the container by the time the
 * fourth order was placed: `operations.jobs` ran at order 260 every five ticks
 * and resolved each leg into a teleport, so both jobs finished almost
 * immediately whatever the regime said. A carry is an action now -- chosen by
 * an idle prisoner whose block allows `work`, and **walked** -- so fewer bricks
 * have arrived by tick 0 and one more wall pays for its own.
 *
 * ADR 0093 decision 6 names the files whose numbers move for exactly this
 * reason and says why it is acceptable: *"determinism is a promise of
 * reproducibility, not of stability across a decided change in behaviour"*. It
 * names `tests/helpers/determinism-scenario.ts` and its determinism
 * dependants; **this file is a fourth dependant it did not name**, reached
 * through the same helper, and that is worth recording rather than silently
 * fixing.
 */
const SCENARIO_JUST_IN_TIME_MATERIALS_BY_TICK_40 = 240;
/** And what the four of them have spent by the time the first day settles. */
const SCENARIO_JUST_IN_TIME_MATERIALS_SETTLED = 320;
/** What the scenario holds at tick 40, with one wall still to pay for itself. */
const BALANCE_AT_TICK_40 = 25_000 - SCENARIO_JUST_IN_TIME_MATERIALS_BY_TICK_40;
/** What the scenario holds once every wall has paid for itself. */
const OPENING_BALANCE = 25_000 - SCENARIO_JUST_IN_TIME_MATERIALS_SETTLED;
/** What one settled in-game day actually moves the balance by: 1,200 in, 400 out. */
const ONE_DAY_NET = ONE_DAY_PAYMENT - ONE_DAY_WAGES;

describe('a mid-day save neither loses the partial day nor pays for it twice', () => {
  it('settles at the occupied places intake actually produced, which is fewer than the prisoners admitted', () => {
    const runtime = sessionAtTick(40);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(OCCUPIED_PLACES);
    // The two literals every balance below is netted with, anchored to the
    // scenario that produces them rather than trusted.
    expect(runtime.securityGuards.allGuardIds().length, 'the scenario hires its staff on the roster directly').toBe(
      SCENARIO_STAFF,
    );
    expect(runtime.payroll.dailyWageBillMinorUnits(), 'five guards at the catalogue`s 80 a day').toBe(ONE_DAY_WAGES);
    expect(
      runtime.treasury.balanceMinorUnits,
      'no state income has been paid yet: the first day boundary is at tick 2,399 -- but three of the walls have bought their bricks (#627)',
    ).toBe(BALANCE_AT_TICK_40);
    // The anchor for the literal above: exactly three just-in-time purchases at
    // this tick, for the three orders placed before the carry jobs had
    // delivered anything. A fourth here would mean the deficit stopped netting
    // off stock already held.
    expect(
      runtime.procurement.pendingDeliveries.map((delivery) => [delivery.itemId, delivery.quantity, delivery.paidMinorUnits]),
      'three orders bought two bricks each; the fourth found bricks already in the container',
    ).toEqual([
      ['item.brick', 2, 80],
      ['item.brick', 2, 80],
      ['item.brick', 2, 80],
    ]);
  });

  it('restores the same accrual it had mid-day, because the accrual is recomputed from the tick', () => {
    const original = sessionAtTick(1_200);
    const accruedBefore = original.stateIncome.accruedThisDay(original.kernel.tick);
    // Half a day at four places: `floor(300 x 4 x 1,201 / 2,400)`. Not half of
    // `ONE_DAY_PAYMENT` exactly, because the day is prorated by ticks *served*
    // including the one in progress, and the floor takes the trailing half
    // minor unit -- which is the arithmetic the unit test pins and the reason
    // this figure is spelled out rather than computed here.
    expect(accruedBefore).toBe(600);

    const { restored } = saveAndLoad(original);
    expect(restored.kernel.tick).toBe(1_200);
    expect(restored.prisoners.roomInstances.totalOccupancy).toBe(OCCUPIED_PLACES);
    expect(
      restored.stateIncome.accruedThisDay(restored.kernel.tick),
      'the partial day is neither lost nor restored from a stored figure -- it is derived again from the restored tick and occupancy',
    ).toBe(accruedBefore);
  });

  it('carries no accrual field in the save at all, which is why there is nothing to lose', () => {
    const { serialized } = saveAndLoad(sessionAtTick(1_200));

    // The positive control first: the balance *is* in there, so a scan that
    // found nothing would be a broken scan rather than a clean save.
    expect(serialized).toContain('treasury');

    for (const forbidden of ['stateIncome', 'accrued', 'accrual', 'lastPaidDay', 'occupiedPlaceTicks']) {
      expect(
        serialized.toLowerCase().includes(forbidden.toLowerCase()),
        `the save carries "${forbidden}". An income line that stored a partial day would need a migration and a version bump; this one derives it, and this assertion is what keeps that true`,
      ).toBe(false);
    }
  });

  it('pays the day exactly once across a mid-day save, and the restored session matches the one that never stopped', () => {
    const original = sessionAtTick(1_200);
    const { restored } = saveAndLoad(original);

    // Both run to the first day boundary and one tick past it.
    const remaining = DAY_LENGTH_TICKS - 1_200;
    step(original, remaining);
    step(restored, remaining);

    expect(original.kernel.tick).toBe(DAY_LENGTH_TICKS);
    expect(restored.kernel.tick).toBe(DAY_LENGTH_TICKS);
    expect(original.treasury.balanceMinorUnits).toBe(OPENING_BALANCE + ONE_DAY_NET);
    expect(
      restored.treasury.balanceMinorUnits,
      'the restored session paid the same one day: not zero (the partial day lost) and not two days (the boundary replayed)',
    ).toBe(OPENING_BALANCE + ONE_DAY_NET);
  });

  it('pays once, not twice, when the save is taken on the very tick the payment is due', () => {
    /*
     * The sharpest case, and the one the research record named as a hazard:
     * "a snapshot taken after the system loop but before the increment would
     * replay the payment tick and pay twice."
     *
     * It cannot happen, and the reason is structural rather than careful.
     * `Kernel.step()` runs the systems and increments the tick inside one
     * call, so there is no moment between them at which a caller could
     * snapshot. A save is therefore always taken between steps, and tick
     * 2,399 is either still pending -- as it is here -- or already stepped
     * past. There is no third state, so the record's hazard closes without
     * the last-paid-day field it suggested recording.
     */
    const original = sessionAtTick(DAY_LENGTH_TICKS - 1);
    expect(original.treasury.balanceMinorUnits, 'the payment has not run yet').toBe(OPENING_BALANCE);

    const { restored } = saveAndLoad(original);
    expect(restored.kernel.tick).toBe(DAY_LENGTH_TICKS - 1);

    step(restored, 1);
    expect(restored.treasury.balanceMinorUnits, 'the pending boundary runs after the restore, once').toBe(
      OPENING_BALANCE + ONE_DAY_NET,
    );

    // And it does not run a second time on the next tick.
    step(restored, 1);
    expect(restored.treasury.balanceMinorUnits).toBe(OPENING_BALANCE + ONE_DAY_NET);
  });

  it('does not re-pay a boundary the save was taken just after', () => {
    const original = sessionAtTick(DAY_LENGTH_TICKS);
    expect(original.treasury.balanceMinorUnits).toBe(OPENING_BALANCE + ONE_DAY_NET);

    const { restored } = saveAndLoad(original);
    expect(restored.kernel.tick).toBe(DAY_LENGTH_TICKS);
    expect(restored.treasury.balanceMinorUnits).toBe(OPENING_BALANCE + ONE_DAY_NET);

    // The next payment is a whole day away, not immediate: the restored tick
    // is 2,400 and the predicate is `tick % 2,400 === 2,399`.
    step(restored, DAY_LENGTH_TICKS - 1);
    expect(restored.kernel.tick).toBe(DAY_LENGTH_TICKS * 2 - 1);
    expect(restored.treasury.balanceMinorUnits, 'still one day paid on the tick before the second boundary').toBe(
      OPENING_BALANCE + ONE_DAY_NET,
    );
    step(restored, 1);
    expect(restored.treasury.balanceMinorUnits).toBe(OPENING_BALANCE + ONE_DAY_NET * 2);
  });

  it('pays a restored session over two further days at the same rate as one that was never saved', () => {
    // The cumulative form: repeated save/load must not drift the balance, in
    // either direction, over more than one boundary.
    const original = sessionAtTick(600);
    let restored = saveAndLoad(original).restored;

    for (let day = 1; day <= 2; day += 1) {
      const target = DAY_LENGTH_TICKS * day;
      step(original, target - original.kernel.tick);
      step(restored, target - restored.kernel.tick);
      // Saved again mid-flight, every day, so the round trip is exercised
      // repeatedly rather than once.
      restored = saveAndLoad(restored).restored;

      expect(original.treasury.balanceMinorUnits, `day ${String(day)}`).toBe(OPENING_BALANCE + ONE_DAY_NET * day);
      expect(restored.treasury.balanceMinorUnits, `day ${String(day)}, restored`).toBe(
        OPENING_BALANCE + ONE_DAY_NET * day,
      );
    }
  });
});
