import type { ContentRegistry } from '../../content/registry';
import type { StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry } from '../../content/staff-role-catalog';
import type { EntityId } from '../entity/entity-store';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { DAY_LENGTH_TICKS } from '../prisoners/regime';
import type { Treasury } from './treasury';
import { staffDailyWageMinorUnits } from './wages';

/**
 * Wages: the one charge the player cannot decline
 * ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * step 3, [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
 * decision 8's precondition).
 *
 * ## What this closes
 *
 * Every debit in the prison was a *purchase*: `ProcurementSystem.purchase` and
 * `StaffHiringService.hire` were the only two callers of `Treasury.spend`
 * anywhere in `src/`, and both are one-off and both are refusable. So a prison
 * could not run out of money by being run badly -- only by being spent badly --
 * and ADR 0017 decision 8's degradation ladder had nothing to respond to,
 * which that ADR says in its own words: *"Answer 3 is not reachable yet.
 * `Treasury.spend` refuses rather than overdrawing, so there is no negative
 * balance for a degradation ladder to respond to. It becomes reachable when a
 * recurring charge exists that the player cannot decline."*
 *
 * This is that charge.
 *
 * ## The unpayable case, and why the balance still cannot go negative
 *
 * The decision that matters here is what happens on the day the treasury
 * cannot cover the bill. ADR 0042 assumed a signed balance (*"A debt state is
 * either a sign change on a persisted field or a new persisted arrears
 * field"*) and it is the sign change that is wrong, for a reason that comes out
 * of ADR 0017 decision 8 rather than out of taste.
 *
 * Decision 8's ladder is *"deliveries refused first, then construction halted,
 * then staff unpaid with the morale and incident consequences that follow"*.
 * With the balance floored at zero those three rungs are not three policy gates
 * somebody has to build -- they are what one balance running out already does,
 * in the authored order, because every *discretionary* spend is refused before
 * the undeclinable one is:
 *
 * 1. **Deliveries refused.** `Treasury.spend` refuses a purchase it cannot
 *    cover, so `ProcurementSystem.purchase` answers `insufficient-funds`.
 * 2. **Construction halted.** With nothing bought, nothing is deposited into
 *    `CONSTRUCTION_MATERIALS_CONTAINER_ID`, so `ConstructionSystem` leaves the
 *    order at `materials-pending` -- issue #89's own symptom, arrived at
 *    honestly this time.
 * 3. **Staff unpaid.** Which is this system, and the rung that did not exist.
 *
 * **A negative balance would delete rung 3.** If the treasury could overdraw,
 * the payroll would always pay in full out of debt and staff would never be
 * unpaid -- so the bottom of decision 8's own ladder would become unreachable
 * in exactly the way it is unreachable today, for a new reason. That is the
 * argument against the sign change, and it is why the four non-negative
 * validators on `Treasury` and the `nonnegative()` on the save schema are left
 * standing rather than relaxed.
 *
 * What is carried instead is **arrears**: the part of the bill the prison could
 * not pay, in the same minor units, owed until it is earned. Decision 8 calls
 * the interesting part of insolvency *"digging out"*, and digging out needs a
 * hole -- a prison that simply forgot an unpayable day would let a player keep
 * any number of staff permanently unpaid at no cost at all.
 *
 * ## What a player experiences
 *
 * The balance falls by the bill every in-game day, so a hire is a standing cost
 * rather than a one-off, and the Funds readout says so before anything goes
 * wrong. When the bill cannot be met the balance sits at **0** -- it never goes
 * red, because it cannot -- and the arrears figure climbs instead. Nothing is
 * confiscated, nobody is dismissed, and no run ends: ADR 0017 decision 8 is
 * explicit that insolvency is a state and not a loss condition.
 *
 * Recovery needs no command. Arrears are added to the next day's bill and paid
 * before it, out of whatever the state has paid in the same tick
 * (`StateIncomeSystem` is order 120 and this is order 130), so a prison that
 * earns more than it owes clears itself; and because the treasury is emptied
 * into wages first, money owed to staff is money that cannot be spent on
 * bricks. That is the trade-off the debit exists to create.
 *
 * ## Determinism
 *
 * Integer minor units throughout and **no division at all** -- unlike
 * `StateIncomeSystem`, which has one and documents why it is exact. The bill is
 * a sum of authored integers over `allGuardIds()`, which is sorted ascending by
 * entity id; `Math.min` and `-` are exact on safe integers. No RNG stream is
 * taken, because nothing here draws.
 */

/**
 * Who is on the payroll.
 *
 * A narrow shape rather than `GuardRoster` itself, exactly as
 * `OccupiedPlaceSource` is narrow against `RoomInstanceRegistry`: this system
 * needs to know who is employed and in what role, and nothing about posts,
 * patrol legs or tiles.
 *
 * **`GuardRoster` is the only staff store there is**, so "every guard" is
 * "every employee" -- a warden and a kitchen hand are both on it
 * (`StaffHiringService.hire` puts all eight catalogue roles there). If a
 * separate non-security staff store ever exists, it is a second source here
 * rather than a second payroll.
 */
export interface PayrollStaffSource {
  /** Deterministic: ascending entity id. */
  allGuardIds(): readonly EntityId[];
  getStaffRoleId(entityId: EntityId): string;
}

export interface PayrollSnapshot {
  /** Wages billed and not paid, in the treasury's minor units. `0` for a prison that has always paid. */
  readonly unpaidWagesMinorUnits: number;
}

/**
 * What one in-game day of the current roster costs.
 *
 * Exported so a producer can show the standing cost of a prison before it
 * charges it -- the figure that makes over-hiring visible in advance rather
 * than only in arrears.
 *
 * **A role the registry does not declare contributes nothing**, and that is the
 * honest answer rather than a lenient one: `staffDailyWageMinorUnits` has no
 * price for it, and inventing one would bill a player for content this build
 * cannot see. It is unreachable from `StaffHiringService`, which resolves the
 * role before it hires; it is reachable from a save written against a
 * catalogue that has since dropped a role.
 */
export function dailyWageBillMinorUnits(
  staff: PayrollStaffSource,
  staffRoles: ContentRegistry<StaffRoleDefinition> = defaultStaffRoleRegistry,
): number {
  let total = 0;
  for (const entityId of staff.allGuardIds()) {
    total += staffDailyWageMinorUnits(staff.getStaffRoleId(entityId), staffRoles) ?? 0;
  }
  return total;
}

export class PayrollSystem implements SystemRegistration {
  public readonly id = 'economy.payroll';
  /**
   * Immediately after `economy.state-income` (120) and before `navigation`
   * (150), so no existing system moves.
   *
   * **After the income, and that is a decision rather than a slot.** Both run
   * on the same tick -- the day's last -- so the order between them decides
   * whether the day the prison has just served can pay for the staff who
   * served it. Before the income, a prison living hand to mouth would fall
   * into arrears every day and clear them every day; after it, the day settles.
   * Declared order is part of ADR 0020's determinism contract and ADR 0009's
   * replay guarantee, so `tests/determinism/kernel-system-order.test.ts` pins
   * it and this addition had to be a reviewed edit there.
   */
  public readonly order = 130;
  /** Once per in-game day, on its last tick -- the same boundary `StateIncomeSystem` pays on, for the same reason it gives. */
  public readonly schedule = { intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 };

  private unpaid = 0;

  public constructor(
    private readonly treasury: Treasury,
    private readonly staff: PayrollStaffSource,
    private readonly staffRoles: ContentRegistry<StaffRoleDefinition> = defaultStaffRoleRegistry,
  ) {}

  /** Wages billed and not paid. `0` while the prison is solvent, and the measure of how deep the hole is when it is not. */
  public get unpaidWagesMinorUnits(): number {
    return this.unpaid;
  }

  /** What tomorrow will cost at the current headcount. A read: it touches nothing. */
  public dailyWageBillMinorUnits(): number {
    return dailyWageBillMinorUnits(this.staff, this.staffRoles);
  }

  public update(context: SimulationContext): void {
    void context;
    const accrued = this.unpaid + this.dailyWageBillMinorUnits();
    /*
     * Saturating rather than throwing, and it is a guard against a *file*
     * rather than against a session.
     *
     * No reachable session gets near this: the bill is bounded by
     * `DEFAULT_GUARD_CAPACITY` roles at the catalogue's dearest wage, so
     * arrears would need billions of in-game days to leave the safe range. A
     * save is a file the player's browser produced and could have edited
     * (#102), and the schema admits any `.safe()` integer -- so the arrears a
     * restore hands this system can be one day away from the boundary, where
     * `+` stops being exact and the figure would silently start lying.
     *
     * A throw here would be a crashed tick out of a scheduled system update on
     * a session that had already loaded, which is the failure ADR 0038 §1
     * measures and is worse than a number that stops growing.
     */
    const due = Number.isSafeInteger(accrued) ? accrued : Number.MAX_SAFE_INTEGER;
    // An empty payroll bills nothing, and says so by doing nothing rather than
    // by spending zero -- the same reading `StateIncomeSystem` takes of an
    // empty prison, and for the same reason: a future ledger (#29) should not
    // have to filter out entries for no money.
    if (due === 0) return;

    const payable = Math.min(due, this.treasury.balanceMinorUnits);
    // `spend` cannot refuse `payable` -- it is a non-negative integer bounded
    // by the balance -- but the outcome is read rather than discarded, so that
    // a refusal leaves the whole bill owed instead of silently vanishing.
    const paid = payable > 0 && this.treasury.spend(payable) ? payable : 0;
    this.unpaid = due - paid;
  }

  public snapshot(): PayrollSnapshot {
    return { unpaidWagesMinorUnits: this.unpaid };
  }

  public restore(snapshot: PayrollSnapshot): void {
    if (!Number.isSafeInteger(snapshot.unpaidWagesMinorUnits) || snapshot.unpaidWagesMinorUnits < 0) {
      throw new RangeError('Restored unpaid wages must be a non-negative safe integer of minor units.');
    }
    this.unpaid = snapshot.unpaidWagesMinorUnits;
  }
}
