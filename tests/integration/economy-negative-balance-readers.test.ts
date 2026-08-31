import { describe, expect, it } from 'vitest';
import { formatNumber } from '../../src/services/localization/format';
import { PayrollSystem, staffDailyWageMinorUnits, Treasury } from '../../src/simulation/economy';
import { Kernel } from '../../src/simulation/kernel';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { packCommand } from '../../src/simulation/protocol/commands';
import { decodeWorkerToMainMessage } from '../../src/simulation/protocol/decode';
import { SIMULATION_PROTOCOL_VERSION, statusCountsSchema } from '../../src/simulation/protocol/types';
import { HUD_VIEW_MODEL_SCHEMA_VERSION } from '../../src/simulation/presentation/view-model';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { projectStatusMetrics } from '../../src/ui/hud/projection';
import { EMPTY_HUD_VIEW_MODEL } from '../../src/ui/hud/view-model';
import { SimulationEventLog } from '../../src/simulation/events';

/**
 * **What every reader of the balance does with a negative one.**
 *
 * [ADR 0075](../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 2 is Accepted and says the balance may go negative;
 * `Treasury.setOverdraftFloor` is the one control that opens the room for it
 * and has no production caller, so **no shipped session can reach the state
 * this file measures**. That is exactly why it is worth measuring before one
 * can: the readers were all written against a floor of zero, and this file
 * establishes which of them survive the change and which do not.
 *
 * `tests/unit/economy-treasury.test.ts` covers the treasury itself,
 * `tests/migrations/save-v5-negative-balance.test.ts` the save format and
 * `tests/determinism/loan-ledger-restore-boundary.test.ts` what a reload
 * forgives. None of the three leaves the economy module. This one does: the
 * status channel the HUD is fed through, the HUD's own formatting, and the one
 * system that spends without being asked.
 */

const SEED = 0x703;

/** Brick, at the catalogue's 40 (`docs/TESTING.md`: written out rather than read from the catalogue). */
const BRICK_PRICE = 40;

function submit(runtime: SimulationRuntime, id: string, command: Parameters<typeof packCommand>[0]): void {
  const sequence = runtime.kernel.expectedSequence;
  runtime.kernel.submitCommand(id, sequence, runtime.kernel.tick, packCommand(command));
  runtime.kernel.step();
}

/**
 * A prison spent exactly `depth` minor units under water, through the real
 * command router rather than by assigning a balance.
 *
 * The floor is opened by hand because nothing in `src/` opens one. The spend
 * is a single `PurchaseMaterials` sized so the balance lands on the floor to
 * the minor unit, which is the boundary `Treasury.canAfford` decides.
 */
function prisonUnderWater(depth: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  runtime.treasury.setOverdraftFloor(-depth);
  const quantity = (runtime.treasury.balanceMinorUnits + depth) / BRICK_PRICE;
  expect(Number.isInteger(quantity), 'the probe depth has to be a whole number of bricks').toBe(true);
  submit(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-under', itemId: 'item.brick', quantity });
  expect(runtime.treasury.balanceMinorUnits).toBe(-depth);
  return runtime;
}

describe('the status channel is the one reader a negative balance breaks', () => {
  /**
   * `statusCountsSchema`'s `treasuryMinorUnits` is `countSchema`, which is
   * `z.number().int().min(0)`. The field's own comment gives the reason --
   * *"`countSchema`'s floor of 0 is the treasury's own invariant … a negative
   * balance is unreachable, and a schema that admitted one would be describing
   * a state the simulation cannot be in"* -- and ADR 0075 decision 2 falsified
   * the premise without the schema moving.
   */
  it('rejects the whole counts block, not merely the funds field', () => {
    const runtime = prisonUnderWater(2_000);
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);

    expect(counts.treasuryMinorUnits, 'the projection publishes the balance verbatim').toBe(-2_000);
    const parsed = statusCountsSchema.safeParse(counts);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['treasuryMinorUnits']);
  });

  it('is refused at the decoder every worker message passes through', () => {
    const runtime = prisonUnderWater(2_000);
    const decoded = decodeWorkerToMainMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'status-under-water',
      kind: 'simulation/status-counts',
      payload: {
        tick: runtime.kernel.tick,
        schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
        counts: projectStatusCounts(runtime, runtime.kernel.tick),
      },
    });

    expect(decoded.ok).toBe(false);
    /*
     * The whole message, which is the finding rather than a detail: the counts
     * block carries fifteen other figures, so a prison that goes one minor
     * unit under water stops telling the main thread its prisoner count, its
     * coverage, its incidents and its arrears as well as its balance. The
     * `funds` chip would not show a minus -- the strip would freeze.
     */
    expect(decoded.ok ? '' : decoded.error.code).toBe('invalid-payload');
    expect(decoded.ok ? [] : decoded.error.issues.map((issue) => issue.path)).toEqual(['payload.counts.treasuryMinorUnits']);
  });

  it('accepts the identical prison one minor unit above the boundary', () => {
    const runtime = createNewSimulationRuntime(SEED);
    runtime.treasury.setOverdraftFloor(-2_000);
    submit(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-to-zero', itemId: 'item.brick', quantity: 625 });
    expect(runtime.treasury.balanceMinorUnits).toBe(0);

    const parsed = statusCountsSchema.safeParse(projectStatusCounts(runtime, runtime.kernel.tick));
    expect(parsed.success, 'a balance of zero is the boundary the schema was written for').toBe(true);
  });
});

describe('the HUD side needs nothing new to say a prison is under water', () => {
  it('carries the negative through the metric descriptors with no tone and no badge', () => {
    const metrics = projectStatusMetrics({ ...EMPTY_HUD_VIEW_MODEL.counts, treasuryMinorUnits: -4_000 });
    const funds = metrics.find((metric) => metric.id === 'funds');

    expect(funds?.value).toBe(-4_000);
    expect(funds?.tone, 'a threshold is a balance value nobody has chosen').toBeUndefined();
    expect(funds?.badge).toBeUndefined();
  });

  it('renders it with the locale`s own sign, so no string has to be authored', () => {
    expect(formatNumber('en', -4_000)).toBe('-4,000');
  });
});

describe('payroll does not draw on the room a floor opened', () => {
  /**
   * `PayrollSystem.update` bounds the day's payment by
   * `Math.min(due, this.treasury.balanceMinorUnits)`, not by what
   * `Treasury.spend` would allow -- so opening a floor does not make the
   * payroll overdraw, and
   * [ADR 0049](../../docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md)'s
   * third rung survives a floor being open. That is the opposite of what that
   * ADR predicted a signed balance would do, and it is the property this file
   * pins rather than describes.
   */
  /** The catalogue's own figure for one guard-day, so nothing here restates a balance value. */
  const GUARD_DAY = staffDailyWageMinorUnits('staff-role.guard') ?? 0;

  function payrollDay(startingBalance: number, floor: number): { balance: number; arrears: number } {
    const treasury = new Treasury(startingBalance);
    treasury.setOverdraftFloor(floor);
    const payroll = new PayrollSystem(
      treasury,
      { allGuardIds: () => [1], getStaffRoleId: () => 'staff-role.guard' },
      new SimulationEventLog(),
    );
    const kernel = new Kernel();
    kernel.registerSystem(payroll);
    for (let tick = 0; tick < DAY_LENGTH_TICKS; tick += 1) kernel.step();
    return { balance: treasury.balanceMinorUnits, arrears: payroll.unpaidWagesMinorUnits };
  }

  it('pays what the balance holds and arrears the rest, with a thousand of room standing unused', () => {
    expect(GUARD_DAY).toBeGreaterThan(30);
    expect(payrollDay(30, -1_000)).toEqual({ balance: 0, arrears: GUARD_DAY - 30 });
  });

  it('pays nothing at all from a balance already under water and does not deepen it', () => {
    expect(payrollDay(-200, -1_000)).toEqual({ balance: -200, arrears: GUARD_DAY });
  });
});
