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
 * **no number in that sequence is this system's**: V5 belongs to ADR 0028
 * phase 1, which took `capacity` off a room instance and put a rectangle on it,
 * and V6 belongs to #352, which put the in-flight incident-response record into
 * the payload so a restore could release the guards and the lockdown it had
 * claimed. What this file asserts is unchanged and is the part that matters --
 * `StateIncomeSystem` holds no state at all
 * -- no accumulator, no last-paid tick -- so it adds no field to the payload,
 * changes no field's units and changes no field's meaning, which are the three
 * things V2, V3 and V4 were each bumped for. The test below does not take that
 * on trust: it reads the serialized envelope and requires that nothing in it
 * mentions this system, which is what makes "derived, not stored" a fact about
 * the save rather than a claim about the code.
 *
 * The only economy state in a save is the treasury balance itself, and the
 * balance is a *result* of past payments rather than a record of a pending one.
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
  // V6 since #352, and the assertion is kept pinned rather than deleted: what
  // it guards is that a bump has a *reason*, not that the number never moves.
  // Two bumps have happened under it now and neither is this system's -- V5 was
  // object placement (a room instance stopped carrying its capacity and started
  // carrying its rectangle) and V6 is the incident-response record (a save
  // carries the guards and the lockdown a response claimed, so a restore can
  // release them). Neither adds a field for the income line, which still adds
  // none of its own. The two paragraphs below the version check are what
  // actually enforce that.
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

describe('a mid-day save neither loses the partial day nor pays for it twice', () => {
  it('settles at the occupied places intake actually produced, which is fewer than the prisoners admitted', () => {
    const runtime = sessionAtTick(40);
    expect(runtime.prisoners.roomInstances.totalOccupancy).toBe(OCCUPIED_PLACES);
    expect(
      runtime.treasury.balanceMinorUnits,
      'nothing has been paid yet: the first day boundary is at tick 2,399',
    ).toBe(25_000);
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
    expect(original.treasury.balanceMinorUnits).toBe(25_000 + ONE_DAY_PAYMENT);
    expect(
      restored.treasury.balanceMinorUnits,
      'the restored session paid the same one day: not zero (the partial day lost) and not two days (the boundary replayed)',
    ).toBe(25_000 + ONE_DAY_PAYMENT);
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
    expect(original.treasury.balanceMinorUnits, 'the payment has not run yet').toBe(25_000);

    const { restored } = saveAndLoad(original);
    expect(restored.kernel.tick).toBe(DAY_LENGTH_TICKS - 1);

    step(restored, 1);
    expect(restored.treasury.balanceMinorUnits, 'the pending boundary runs after the restore, once').toBe(
      25_000 + ONE_DAY_PAYMENT,
    );

    // And it does not run a second time on the next tick.
    step(restored, 1);
    expect(restored.treasury.balanceMinorUnits).toBe(25_000 + ONE_DAY_PAYMENT);
  });

  it('does not re-pay a boundary the save was taken just after', () => {
    const original = sessionAtTick(DAY_LENGTH_TICKS);
    expect(original.treasury.balanceMinorUnits).toBe(25_000 + ONE_DAY_PAYMENT);

    const { restored } = saveAndLoad(original);
    expect(restored.kernel.tick).toBe(DAY_LENGTH_TICKS);
    expect(restored.treasury.balanceMinorUnits).toBe(25_000 + ONE_DAY_PAYMENT);

    // The next payment is a whole day away, not immediate: the restored tick
    // is 2,400 and the predicate is `tick % 2,400 === 2,399`.
    step(restored, DAY_LENGTH_TICKS - 1);
    expect(restored.kernel.tick).toBe(DAY_LENGTH_TICKS * 2 - 1);
    expect(restored.treasury.balanceMinorUnits, 'still one day paid on the tick before the second boundary').toBe(
      25_000 + ONE_DAY_PAYMENT,
    );
    step(restored, 1);
    expect(restored.treasury.balanceMinorUnits).toBe(25_000 + ONE_DAY_PAYMENT * 2);
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

      expect(original.treasury.balanceMinorUnits, `day ${String(day)}`).toBe(25_000 + ONE_DAY_PAYMENT * day);
      expect(restored.treasury.balanceMinorUnits, `day ${String(day)}, restored`).toBe(
        25_000 + ONE_DAY_PAYMENT * day,
      );
    }
  });
});
