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
 * decision 2 is Accepted and says the balance may go negative.
 *
 * **This file was written as a characterisation of a state no shipped session
 * could reach, and the sentence that said so is kept because the tables in
 * [ADR 0083](../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md)
 * were measured under it:**
 *
 * > `Treasury.setOverdraftFloor` is the one control that opens the room for it
 * > and has no production caller, so **no shipped session can reach the state
 * > this file measures**.
 *
 * **That stopped being true on 2026-08-31.** #703 ruled reading A -- a standing
 * overdraft every prison has -- and `createNewSimulationRuntime` now opens
 * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` on the `Treasury` it builds, so every
 * session reaches this state the moment a player overspends. The floor is still
 * opened by hand in the probes below, because a probe that read the shipped
 * constant would move silently when that constant did.
 *
 * The point of the file is unchanged and the reason it survives the ruling: the
 * readers were all written against a floor of zero, and this establishes which
 * of them survive the change and which do not.
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
 * The floor is opened by hand rather than read from
 * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`, so the depths this file measures stay
 * the depths ADR 0083 recorded even if the shipped magnitude moves.
 * **The sentence here used to be *"because nothing in `src/` opens one"*, and
 * that reason expired with #703 ruling A** -- the reason above is the one that
 * still holds.
 *
 * **And the route changed with the owner's ruling 19 of 2026-08-31.** This used
 * to read:
 *
 * > The spend is a single `PurchaseMaterials` sized so the balance lands on the
 * > floor to the minor unit, which is the boundary `Treasury.canAfford` decides.
 *
 * > ```
 * > const quantity = (runtime.treasury.balanceMinorUnits + depth) / BRICK_PRICE;
 * > expect(Number.isInteger(quantity), 'the probe depth has to be a whole number of bricks').toBe(true);
 * > submit(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-under', itemId: 'item.brick', quantity });
 * > ```
 *
 * **A press cannot reach these depths any more, and that is the ruling working
 * rather than the fixture breaking.** Ruling 19 gives ADR 0017 decision 8's
 * rungs their own thresholds inside the overdraft, and a `PurchaseMaterials` is
 * the `'deliveries'` rung -- refused below -1,250 (ADR 0017's "Amendment,
 * 2026-09-01"). The wage rung is the one whose threshold *is* the floor, so a
 * payday is what actually takes a prison to the bottom of its facility, and
 * `Treasury.spend(…, 'wages')` is the production call a payday makes. Still not
 * an assigned balance: this is the same method `PayrollSystem` reaches.
 */
function prisonUnderWater(depth: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  runtime.treasury.setOverdraftFloor(-depth);
  expect(runtime.treasury.spend(runtime.treasury.balanceMinorUnits + depth, 'wages')).toBe(true);
  expect(runtime.treasury.balanceMinorUnits).toBe(-depth);
  return runtime;
}

describe('the status channel carries a negative balance instead of refusing the block', () => {
  /**
   * **Two assertions in this describe were inverted by #703 ruling A, and the
   * inversion is the contract moving rather than the evidence being removed.**
   *
   * What this file measured before the ruling: `statusCountsSchema`'s
   * `treasuryMinorUnits` was `countSchema` -- `z.number().int().min(0)` -- so a
   * prison one minor unit under water published a `simulation/status-counts`
   * the decoder refused `invalid-payload`, and the `.strict()` object's fifteen
   * *other* figures went down with it. Those two assertions read
   * `expect(parsed.success).toBe(false)` and `expect(decoded.ok).toBe(false)`,
   * and each is now its own opposite because the field is
   * `signedMinorUnitsSchema` (`z.number().int().safe()`).
   *
   * **What is deliberately not weakened, and is why this is not a deletion.**
   * The finding the old assertions carried was never *"a negative is refused"*
   * -- that was the defect. It was *"the refusal takes fifteen unrelated
   * figures with it"*, and that is now pinned from the other side: the decoded
   * message is walked for those figures rather than merely being asked whether
   * it parsed. And the third test below is new: it holds `countSchema` itself
   * to its floor, so widening the shared schema instead of the one field --
   * the loosening ADR 0083 rejects by name -- goes red here.
   */
  it('admits the balance the projection publishes, and refuses nothing else in the block', () => {
    const runtime = prisonUnderWater(2_000);
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);

    expect(counts.treasuryMinorUnits, 'the projection publishes the balance verbatim').toBe(-2_000);
    const parsed = statusCountsSchema.safeParse(counts);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.')) ?? []).toEqual([]);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.treasuryMinorUnits, 'and the parse does not clamp it').toBe(-2_000);
  });

  it('is accepted at the decoder every worker message passes through, with the whole block intact', () => {
    const runtime = prisonUnderWater(2_000);
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    const decoded = decodeWorkerToMainMessage({
      protocolVersion: SIMULATION_PROTOCOL_VERSION,
      messageId: 'status-under-water',
      kind: 'simulation/status-counts',
      payload: {
        tick: runtime.kernel.tick,
        schemaVersion: HUD_VIEW_MODEL_SCHEMA_VERSION,
        counts,
      },
    });

    expect(decoded.ok ? null : decoded.error.code).toBe(null);
    expect(decoded.ok).toBe(true);
    /*
     * The fifteen other figures, walked rather than assumed. This is the half
     * of the old assertion that was the finding: the block is `.strict()`, so
     * before the widening a single out-of-range member took the prisoner count,
     * the coverage, the incidents and the arrears down with the balance, and a
     * player would have watched the whole strip freeze rather than seen a minus.
     * Asserting `decoded.ok` alone would not say that; comparing the delivered
     * block to the projected one member by member does.
     */
    const delivered = decoded.ok && decoded.value.kind === 'simulation/status-counts'
      ? decoded.value.payload.counts
      : undefined;
    expect(delivered).toEqual(counts);
    expect(Object.keys(counts).length, 'the balance is one member of a block that carries the rest of the strip')
      .toBeGreaterThan(15);
  });

  it('still accepts the identical prison one minor unit above the boundary', () => {
    const runtime = createNewSimulationRuntime(SEED);
    runtime.treasury.setOverdraftFloor(-2_000);
    submit(runtime, 'buy', { type: 'PurchaseMaterials', orderId: 'buy-to-zero', itemId: 'item.brick', quantity: 625 });
    expect(runtime.treasury.balanceMinorUnits).toBe(0);

    const parsed = statusCountsSchema.safeParse(projectStatusCounts(runtime, runtime.kernel.tick));
    expect(parsed.success, 'a balance of zero was the old bound`s boundary and is still valid').toBe(true);
  });

  /**
   * The guard on *how* the field was widened, and the reason it is here rather
   * than in a schema unit test: ADR 0083's "considered and not taken" rejects
   * widening `countSchema` itself, because fourteen other members of this
   * object are counts whose floor of `0` is a real invariant. This asserts the
   * floor is still enforced on one of them, so a future pass that reaches for
   * the shared schema fails on this file instead of on nothing.
   */
  it('leaves the floor of zero standing on the counts that are counts', () => {
    const runtime = prisonUnderWater(2_000);
    const counts = projectStatusCounts(runtime, runtime.kernel.tick);
    const parsed = statusCountsSchema.safeParse({ ...counts, prisoners: -1 });

    expect(parsed.success, 'a negative prisoner count is not a state the simulation can be in').toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join('.'))).toEqual(['prisoners']);
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

describe('payroll draws on the room a floor opened, down to the wage rung and no further', () => {
  /**
   * **This describe was titled *"payroll does not draw on the room a floor
   * opened"* and every assertion in it has been inverted by the owner's ruling
   * 19 of 2026-08-31. The old text is kept because it is the measurement the
   * ruling was made against.**
   *
   * What stood here:
   *
   * > `PayrollSystem.update` bounds the day's payment by
   * > `Math.min(due, this.treasury.balanceMinorUnits)`, not by what
   * > `Treasury.spend` would allow -- so opening a floor does not make the
   * > payroll overdraw, and
   * > [ADR 0049](../../docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md)'s
   * > third rung survives a floor being open. That is the opposite of what that
   * > ADR predicted a signed balance would do, and it is the property this file
   * > pins rather than describes.
   *
   * > ```
   * > expect(payrollDay(30, -1_000)).toEqual({ balance: 0, arrears: GUARD_DAY - 30 });
   * > expect(payrollDay(-200, -1_000)).toEqual({ balance: -200, arrears: GUARD_DAY });
   * > ```
   *
   * That was true, and ADR 0083's "considered and not taken" defended it by
   * name -- *"making the payroll draw on the floor … would delete the rung"*.
   * Ruling 19 -- *"Dać szczeblom własne progi wewnątrz debetu"* -- moves the
   * third rung **to** the floor instead of deleting it: wages are unpaid below
   * -2,500, which means paid down to it. So the payroll draws, and the rung is
   * the far edge of the draw rather than the balance reaching zero. Drafted as
   * ADR 0017's "Amendment, 2026-09-01" and **awaiting the owner's signature**.
   *
   * The property that did *not* change is the one ADR 0049 owns: what is not
   * paid is **arrears**, not a skipped wage. Both cases below still read the
   * arrears, and the two that reach the rung show it.
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

  it('pays the day in full out of the room the floor opened, rather than arrearing what the balance is short', () => {
    expect(GUARD_DAY).toBeGreaterThan(30);
    // 30 held and 1,030 of room: the whole guard-day is paid and the balance
    // goes under water by the difference. Before ruling 19 this arreared
    // `GUARD_DAY - 30` and left the balance at 0.
    expect(payrollDay(30, -1_000)).toEqual({ balance: 30 - GUARD_DAY, arrears: 0 });
  });

  it('goes on paying from a balance already under water, while the room lasts', () => {
    // Before ruling 19 this paid nothing at all and arreared the whole day.
    expect(payrollDay(-200, -1_000)).toEqual({ balance: -200 - GUARD_DAY, arrears: 0 });
  });

  it('pays what the rung leaves and arrears the rest, which is the third rung firing', () => {
    // Half a guard-day of room left: the payroll takes it, lands exactly on the
    // wage rung, and owes the other half. This is ADR 0017 decision 8's third
    // rung, at the threshold ruling 19 gives it.
    const room = Math.trunc(GUARD_DAY / 2);
    expect(payrollDay(-1_000 + room, -1_000)).toEqual({ balance: -1_000, arrears: GUARD_DAY - room });
  });

  it('pays nothing from a balance already at the rung, and does not deepen it', () => {
    expect(payrollDay(-1_000, -1_000)).toEqual({ balance: -1_000, arrears: GUARD_DAY });
  });

  it('pays nothing from a balance already past the rung, and does not deepen it either', () => {
    // A restored save can carry one: `Treasury.restore` writes any safe integer.
    expect(payrollDay(-1_200, -1_000)).toEqual({ balance: -1_200, arrears: GUARD_DAY });
  });
});
