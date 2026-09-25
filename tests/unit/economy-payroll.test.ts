import { SimulationEventLog } from '../../src/simulation/events';
import { describe, expect, it } from 'vitest';
import { loadStaffRoleCatalog } from '../../src/content/staff-role-catalog';
import { PayrollSystem, Treasury, dailyWageBillMinorUnits, staffDailyWageMinorUnits } from '../../src/simulation/economy';
import { Kernel } from '../../src/simulation/kernel';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { GuardRoster } from '../../src/simulation/security';
import { tileCoordinate } from '../../src/simulation/world/coordinates';

/**
 * [ADR 0042](../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * step 3: **the one charge a player cannot decline.**
 *
 * Wages are billed once per in-game day, for everybody on the roster, at the
 * authored `wageBand.minPerDay`. When the treasury cannot meet the bill it pays
 * what it holds and the remainder becomes arrears -- the balance never goes
 * negative, which is a decision rather than a limitation and is argued in
 * `src/simulation/economy/payroll.ts`.
 *
 * ## Every wage here is authored by this file, and every expected balance is a
 * literal
 *
 * The catalogue's own guard band is 80 and it is deliberately **not** what most
 * of this file bills. A test that read the shipped wage and then multiplied it
 * by the headcount would be asserting that multiplication works: it would pass
 * against any implementation that used the same field, including one that
 * charged once a week or once for ever. So the two roles below carry wages
 * chosen here, and every balance is written out.
 *
 * `tests/integration/economy-payroll-loop.test.ts` is where the *shipped*
 * figures are exercised, through the real command path, because "does the
 * catalogue's guard actually cost 80 a day in a real session" is a different
 * question from "does the arithmetic hold".
 */

/**
 * Two roles with wages this file chose: one that divides nothing and one dear
 * enough to bankrupt a small treasury quickly.
 *
 * `loadStaffRoleCatalog` is the real loader over hand-written rows, so these
 * pass the same Zod schema the shipped catalogue does -- including the
 * `.int()` on the band, which exists because these figures are money.
 */
const ROLES = loadStaffRoleCatalog([
  {
    schemaVersion: 1, id: 'staff-role.test-clerk', numericId: 1, nameKey: 'staff-role.test-clerk.name',
    department: 'administration', baseSecurityClearance: 1, permissions: [],
    wageBand: { minPerDay: 50, maxPerDay: 90 }, skills: [],
  },
  {
    schemaVersion: 1, id: 'staff-role.test-chief', numericId: 2, nameKey: 'staff-role.test-chief.name',
    department: 'security', baseSecurityClearance: 8, permissions: [],
    wageBand: { minPerDay: 700, maxPerDay: 900 }, skills: [],
  },
]);

const CLERK = 'staff-role.test-clerk';
const CHIEF = 'staff-role.test-chief';
const TILE = { x: tileCoordinate(3), y: tileCoordinate(4) };

function rosterOf(...roleIds: readonly string[]): GuardRoster {
  const roster = new GuardRoster(32);
  for (const roleId of roleIds) roster.hire(roleId, TILE);
  return roster;
}

/**
 * A room-instance stand-in reporting a mature, furnished prison
 * (`totalResidentCapacity` of `1`), so every test in this file exercises the
 * ladder `PayrollSystem` used before ADR 0096 decision 2 existed — a bare
 * `Treasury` never opens a facility (`floor` stays `0`), so the starter
 * reserve added by that decision cannot fire here regardless: `Math.max(rung,
 * 0)` is `0` for every rung, fresh or mature alike. Reported as mature anyway,
 * because this file's subject is the mature ladder and a fresh fixture would
 * say so falsely.
 */
const MATURE_ROOM_INSTANCES = { totalResidentCapacity: 1 };

/** A kernel carrying only the payroll, so nothing else in the world can move the balance. */
function payrollOnlyKernel(
  roster: GuardRoster,
  startingBalance: number,
): { kernel: Kernel; treasury: Treasury; payroll: PayrollSystem; events: SimulationEventLog } {
  const treasury = new Treasury(startingBalance);
  // Returned rather than swallowed so a payday test can assert what the prison
  // *said*, not only what it now owes (issue #507).
  const events = new SimulationEventLog();
  const payroll = new PayrollSystem(treasury, roster, events, MATURE_ROOM_INSTANCES, ROLES.registry);
  const kernel = new Kernel();
  kernel.registerSystem(payroll);
  return { kernel, treasury, payroll, events };
}

function step(kernel: Kernel, ticks: number): void {
  for (let index = 0; index < ticks; index += 1) kernel.step();
}

describe('the catalogue is loadable and its wages are whole minor units', () => {
  it('accepts the two roles this file authors', () => {
    expect(ROLES.errors).toEqual([]);
    expect(staffDailyWageMinorUnits(CLERK, ROLES.registry)).toBe(50);
    expect(staffDailyWageMinorUnits(CHIEF, ROLES.registry)).toBe(700);
  });

  it('refuses a fractional wage, because a wage is money and money is an integer here', () => {
    // Not a style rule. `Treasury.spend` requires a safe integer and refuses
    // anything else, so a wage of 80.5 would have made every hire of that role
    // answer `insufficient-funds` with a full treasury -- and it now sums into
    // a daily bill that lands in a balance the save carries and the determinism
    // fingerprint hashes.
    const broken = loadStaffRoleCatalog([
      {
        schemaVersion: 1, id: 'staff-role.test-fractional', numericId: 3, nameKey: 'staff-role.test-fractional.name',
        department: 'operations', baseSecurityClearance: 0, permissions: [],
        wageBand: { minPerDay: 80.5, maxPerDay: 140 }, skills: [],
      },
    ]);
    expect(broken.errors.length).toBe(1);
    expect(broken.registry.getById('staff-role.test-fractional')).toBeUndefined();
  });
});

describe('what a day of the roster costs', () => {
  it('sums the authored wage of everybody employed', () => {
    // Three clerks at 50 and one chief at 700: 850, written out rather than
    // computed from the same fields the implementation reads.
    expect(dailyWageBillMinorUnits(rosterOf(CLERK, CLERK, CLERK, CHIEF), ROLES.registry)).toBe(850);
  });

  it('is zero for a prison that has hired nobody', () => {
    expect(dailyWageBillMinorUnits(rosterOf(), ROLES.registry)).toBe(0);
  });

  it('bills nothing for a role this build`s catalogue does not declare', () => {
    // Reachable from a save written against a catalogue that has since dropped
    // a role. Inventing a price would bill a player for content this build
    // cannot see; the two clerks beside it are still billed, so the unknown
    // role is skipped rather than the whole bill being abandoned.
    const roster = rosterOf(CLERK, 'staff-role.deleted-in-a-later-build', CLERK);
    expect(dailyWageBillMinorUnits(roster, ROLES.registry)).toBe(100);
  });
});

describe('the charge, and the boundary it fires on', () => {
  it('takes the day`s wages at the end of the day, and not before', () => {
    const { kernel, treasury } = payrollOnlyKernel(rosterOf(CLERK, CLERK), 1_000);

    // One tick short of the boundary: nothing has been billed. A payroll that
    // fired on tick 0 would have charged for a day nobody had worked, which is
    // the same defect `StateIncomeSystem` documents rejecting phase 0 for.
    step(kernel, DAY_LENGTH_TICKS - 1);
    expect(kernel.tick).toBe(DAY_LENGTH_TICKS - 1);
    expect(treasury.balanceMinorUnits).toBe(1_000);

    // The boundary tick: two clerks at 50.
    step(kernel, 1);
    expect(treasury.balanceMinorUnits).toBe(900);
  });

  it('fires once per day, not twice and not once for ever', () => {
    const { kernel, treasury } = payrollOnlyKernel(rosterOf(CLERK, CLERK), 1_000);

    // Every balance below is written out. A second firing inside one day, or a
    // charge that stopped after the first day, moves one of them.
    const expected = [900, 800, 700, 600, 500];
    for (let day = 1; day <= expected.length; day += 1) {
      step(kernel, DAY_LENGTH_TICKS);
      expect(treasury.balanceMinorUnits, `end of day ${String(day)}`).toBe(expected[day - 1]);
    }

    // And nothing moves between boundaries: half a day later the balance is
    // still what the last boundary left.
    step(kernel, DAY_LENGTH_TICKS / 2);
    expect(treasury.balanceMinorUnits).toBe(500);
  });

  it('declares the schedule the income line uses, so the two settle on the same tick', () => {
    const { payroll } = payrollOnlyKernel(rosterOf(), 0);
    expect(payroll.schedule).toEqual({ intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 });
    // And after it, so the day just served can pay for the staff who served it.
    expect(payroll.order).toBeGreaterThan(120);
  });

  it('charges nothing, and spends nothing, for a prison with no staff', () => {
    const { kernel, treasury } = payrollOnlyKernel(rosterOf(), 25_000);
    step(kernel, DAY_LENGTH_TICKS * 3);
    expect(treasury.balanceMinorUnits).toBe(25_000);
  });

  it('bills a staff member hired after the session started, from the next boundary', () => {
    const roster = rosterOf(CLERK);
    const { kernel, treasury } = payrollOnlyKernel(roster, 1_000);
    step(kernel, DAY_LENGTH_TICKS);
    expect(treasury.balanceMinorUnits).toBe(950);

    // The roster is read live rather than captured at construction, so a hire
    // between two boundaries joins the next bill without anything having to be
    // told about it.
    roster.hire(CHIEF, TILE);
    step(kernel, DAY_LENGTH_TICKS);
    expect(treasury.balanceMinorUnits).toBe(200);
  });
});

describe('the day the treasury cannot pay', () => {
  it('pays what it holds, floors the balance at zero and carries the rest as arrears', () => {
    // 500 in the treasury against a 700 chief: 500 goes, 200 is owed, and the
    // balance stops at 0 rather than going to -200.
    const { kernel, treasury, payroll } = payrollOnlyKernel(rosterOf(CHIEF), 500);
    step(kernel, DAY_LENGTH_TICKS);

    expect(treasury.balanceMinorUnits).toBe(0);
    expect(payroll.unpaidWagesMinorUnits).toBe(200);
  });

  it('adds the next day`s wages to what is already owed', () => {
    const { kernel, treasury, payroll } = payrollOnlyKernel(rosterOf(CHIEF), 500);
    step(kernel, DAY_LENGTH_TICKS);
    expect(payroll.unpaidWagesMinorUnits).toBe(200);

    step(kernel, DAY_LENGTH_TICKS);
    expect(payroll.unpaidWagesMinorUnits).toBe(900);
    step(kernel, DAY_LENGTH_TICKS);
    expect(payroll.unpaidWagesMinorUnits).toBe(1_600);
    expect(treasury.balanceMinorUnits).toBe(0);
  });

  it('pays the arrears down before anything else, out of money that arrives later', () => {
    // ADR 0017 decision 8 calls digging out the interesting part of insolvency,
    // so this is the assertion that says it can be done at all -- and that the
    // debt is paid before the prison gets its balance back, which is what makes
    // money owed to staff money that cannot be spent on bricks.
    const { kernel, treasury, payroll } = payrollOnlyKernel(rosterOf(CHIEF), 0);
    step(kernel, DAY_LENGTH_TICKS);
    expect(payroll.unpaidWagesMinorUnits).toBe(700);

    // A windfall of 1,000 against 700 owed plus 700 for the day just served:
    // all 1,000 goes to wages and 400 is still owed.
    treasury.credit(1_000);
    step(kernel, DAY_LENGTH_TICKS);
    expect(treasury.balanceMinorUnits).toBe(0);
    expect(payroll.unpaidWagesMinorUnits).toBe(400);

    // Enough to clear it: 400 owed plus 700 for the day, out of 2,000.
    treasury.credit(2_000);
    step(kernel, DAY_LENGTH_TICKS);
    expect(payroll.unpaidWagesMinorUnits).toBe(0);
    expect(treasury.balanceMinorUnits).toBe(900);
  });

  it('never lets the balance go negative, however long the prison is insolvent', () => {
    const { kernel, treasury, payroll } = payrollOnlyKernel(rosterOf(CHIEF, CHIEF), 100);
    for (let day = 0; day < 30; day += 1) {
      step(kernel, DAY_LENGTH_TICKS);
      expect(treasury.balanceMinorUnits, `day ${String(day)}`).toBeGreaterThanOrEqual(0);
    }
    expect(treasury.balanceMinorUnits).toBe(0);
    /*
     * **Bounded at `ARREARS_BOUND_MINOR_UNITS` since ADR 0096 decision 3(c)
     * (accepted 2026-09-10).** 30 days at 1,400 is 42,000, less the 100 the
     * treasury actually had, is 41,900 -- what this asserted before that
     * decision, quoted rather than silently replaced: *"30 days at 1,400 is
     * 42,000, less the 100 the treasury actually had."* The bound forgives
     * everything past 2,500 rather than deferring it, so this file's own
     * subject -- arrears climbing without limit while the prison is left
     * alone -- now stops at the bound on day 2 (2,500 of a 1,400-a-day bill is
     * under two days) and stays there for the other twenty-eight. #641 raises
     * the opening grant and its linked facility, so the current derived bound
     * is 10,000; this same 30-day case reaches that bound instead.
     */
    expect(payroll.unpaidWagesMinorUnits).toBe(10_000);
  });

  it('stops accruing at the bound and forgives what a day would have added past it (ADR 0096 decision 3(c))', () => {
    // One chief at 700/day against a treasury with nothing in it: arrears
    // climbs 700 a day until it would cross the current derived 10,000 cap.
    const { kernel, payroll } = payrollOnlyKernel(rosterOf(CHIEF), 0);
    const expected = [700, 1_400, 2_100, 2_800, 3_500, 4_200, 4_900, 5_600, 6_300, 7_000, 7_700, 8_400, 9_100, 9_800, 10_000, 10_000];
    for (let day = 1; day <= expected.length; day += 1) {
      step(kernel, DAY_LENGTH_TICKS);
      expect(payroll.unpaidWagesMinorUnits, `end of day ${String(day)}`).toBe(expected[day - 1]);
    }
  });

  it('owes nothing while it can pay, so the arrears figure is a state and not a counter', () => {
    const { kernel, payroll } = payrollOnlyKernel(rosterOf(CLERK), 10_000);
    step(kernel, DAY_LENGTH_TICKS * 5);
    expect(payroll.unpaidWagesMinorUnits).toBe(0);
  });
});

describe('what survives a save', () => {
  it('snapshots the arrears and restores them', () => {
    const first = payrollOnlyKernel(rosterOf(CHIEF), 500);
    step(first.kernel, DAY_LENGTH_TICKS);
    expect(first.payroll.snapshot()).toEqual({ unpaidWagesMinorUnits: 200 });

    const second = payrollOnlyKernel(rosterOf(CHIEF), 0);
    second.payroll.restore(first.payroll.snapshot());
    expect(second.payroll.unpaidWagesMinorUnits).toBe(200);

    // And the restored debt is charged forward rather than merely remembered:
    // 200 owed plus 700 for the next day, against an empty treasury.
    step(second.kernel, DAY_LENGTH_TICKS);
    expect(second.payroll.unpaidWagesMinorUnits).toBe(900);
  });

  it('refuses a restored figure that is not a non-negative safe integer', () => {
    const { payroll } = payrollOnlyKernel(rosterOf(), 0);
    expect(() => payroll.restore({ unpaidWagesMinorUnits: -1 })).toThrow(RangeError);
    expect(() => payroll.restore({ unpaidWagesMinorUnits: 1.5 })).toThrow(RangeError);
    expect(() => payroll.restore({ unpaidWagesMinorUnits: Number.NaN })).toThrow(RangeError);
  });

  it('saturates rather than throwing when a hand-edited save leaves no room to add a day', () => {
    // A crashed tick out of a scheduled system update on a session that has
    // already loaded is the failure ADR 0038 measures; a figure that stops
    // growing at a number no session can reach is not.
    const { kernel, payroll } = payrollOnlyKernel(rosterOf(CHIEF), 0);
    payroll.restore({ unpaidWagesMinorUnits: Number.MAX_SAFE_INTEGER });
    expect(() => step(kernel, DAY_LENGTH_TICKS)).not.toThrow();
    expect(payroll.unpaidWagesMinorUnits).toBe(Number.MAX_SAFE_INTEGER);
  });
});
