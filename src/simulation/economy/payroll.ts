import type { ContentRegistry } from '../../content/registry';
import type { StaffRoleDefinition } from '../../content/staff-role-catalog';
import { defaultStaffRoleRegistry } from '../../content/staff-role-catalog';
import type { EntityId } from '../entity/entity-store';
import type { SimulationEventLog } from '../events';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import { DAY_LENGTH_TICKS } from '../prisoners/regime';
import { TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS, type Treasury } from './treasury';
import { staffDailyWageMinorUnits } from './wages';

/**
 * Wages: the one charge the player cannot decline
 * ([ADR 0042](../../../docs/adr/0042-attaching-consequences-to-the-simulation-loop.md)
 * step 3, [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
 * decision 8's precondition,
 * [ADR 0049](../../../docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md)
 * for what an unpayable bill becomes).
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
 * ## The unpayable case, and why *this system* cannot take the balance negative
 *
 * **This heading read *"why the balance still cannot go negative"* and it was
 * exact for the life of the section under it.** Since #703 ruling A of
 * 2026-08-31 the balance can go negative in any session; what is still true, and
 * is what the section actually establishes, is that **nothing here** takes it
 * there. Both readings are kept because the argument below is what a reader
 * would otherwise reconstruct from ADR 0049 and believe.
 *
 * **The decision is
 * [ADR 0049](../../../docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md)'s,
 * not this file's**, and it is recorded there because ADR 0017 answer 3 ends
 * *"None of that is licensed to be decided in implementation code."* What
 * follows is the summary a reader of this file needs; the alternatives, the
 * comparable-sim research and the 30-day measurement that sized it are in the
 * ADR.
 *
 * The question is what happens on the day the treasury cannot cover the bill.
 * ADR 0042 assumed a signed balance (*"A debt state is
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
 * ## Both halves of that paragraph are now false, and it is kept because the
 * argument is what a reader will otherwise reconstruct and believe
 *
 * **The clause about the validators was falsified by a merge.**
 * [ADR 0075](../../../docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
 * decision 2 is Accepted and relaxed exactly those bounds: `Treasury`'s
 * constructor and `restore` now admit any safe integer, the save schema's
 * `treasury.balanceMinorUnits` is `z.number().int().safe()`, and
 * `Treasury.setOverdraftFloor` exists. The sentence stopped being true the day
 * that landed and this file was not visited.
 *
 * **And the argument itself is false of this system**, which is the half worth
 * the space, because it is the argument
 * [ADR 0049](../../../docs/adr/0049-what-a-prison-that-cannot-make-payroll-owes.md)
 * rests its whole decision on. `update` below bounds the day's payment by
 * `Math.min(due, this.treasury.balanceMinorUnits)` -- by the **balance**, not by
 * what `Treasury.spend` would allow -- so a floor being open does not make this
 * system overdraw, and rung 3 survives it untouched. Measured rather than
 * argued, in `tests/integration/economy-negative-balance-readers.test.ts`: with
 * a thousand minor units of room standing open, a balance of 30 against a bill
 * of 80 pays 30 and owes 50, and a balance already at -200 pays nothing and
 * stays at -200.
 *
 * The consequence is not that ADR 0049 was wrong to prefer arrears. It is that
 * with a floor open the *only* thing that can take a prison under water is a
 * spend the player chose -- which is what ADR 0017 decision 8's ladder says
 * should be refused **first**. That inversion, and what to do about it, is
 * [ADR 0083](../../../docs/adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md).
 *
 * **The paragraph above was written while the inversion was still hypothetical
 * -- *"with a floor open"* -- and it is kept as written because that is the
 * condition it reasons from. The condition now holds in every session.** #703
 * ruled reading A on 2026-08-31 and `createNewSimulationRuntime` opens
 * `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` on the treasury it builds, so the
 * numbered ladder above runs 3, then 1, then 2: this system stops at zero while
 * `ProcurementSystem` and `StaffHiringService` carry on to the floor.
 * `tests/integration/economy-payroll-loop.test.ts` pins that at both ends. The
 * amendment ADR 0083 §2 says is owed to decision 8 is still owed, and it is the
 * owner's.
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
 * wrong. When the bill cannot be met the balance sits **where it was** and the
 * arrears figure climbs instead -- at **0** for a prison that has not spent into
 * its overdraft, and at whatever negative figure it reached for one that has,
 * because this system pays `Math.min(due, balance)` and a negative balance pays
 * nothing. **This sentence said "sits at 0" without the qualification**, which
 * was exact while no session could be under water and is now the common case
 * rather than the only one. **This sentence carried "-- it never goes red, because
 * it cannot --" and the reason is gone**: a balance may be negative since ADR
 * 0075 decision 2. What is still true is the *behaviour* rather than the
 * impossibility, and it is true for a narrower reason -- this system stops at
 * the balance whatever room a floor has opened, so nothing **here** can turn
 * the readout red. Nothing is
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

/**
 * The one fact this system needs about residency, to compute
 * `isFreshUnfurnishedPrison` for [ADR 0096](../../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
 * decision 2 — narrow against `RoomInstanceRegistry`, exactly as
 * `PayrollStaffSource` is narrow against `GuardRoster`: this system needs to
 * know whether anything anywhere has a standing sleep surface, and nothing
 * about which room, which tile or which object.
 */
export interface PayrollResidencySource {
  readonly totalResidentCapacity: number;
}

/**
 * **[ADR 0096](../../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
 * decision 3(c), accepted by the owner 2026-09-10: arrears stop accruing at a
 * bound, and what cannot accrue is forgiven rather than deferred.**
 *
 * Measured in that ADR's own act B: 3,220 → 27,220 in six in-game days,
 * climbing 4,800/day, unbounded for as long as a prison is left alone — the
 * one accrual against a negative balance ADR 0075 decision 2's own accrual-cap
 * rider did not reach (ADR 0083 decision 1 read that rider as being about the
 * loan's fee alone, and `LoanBook.draw` applies its fee once; nothing bounded
 * this figure). ADR 0096's own words on the magnitude: *"the candidate this
 * document names is the overdraft floor's own, 2,500, on the single ground
 * that it is already the size of 'what this prison may owe' in the one other
 * place the repository states such a number."*
 *
 * **10,000 since the owner's ruling of 2026-09-23 set the opening grant to
 * 100,000 (#641)**, and that is this derivation working rather than a new
 * decision: the floor is a tenth of the grant and this is the floor's
 * magnitude, so both moved together. The 2,500 in the quotation above is the
 * figure ADR 0096 named at the 25,000 grant.
 *
 * **Derived from `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS` rather than written
 * out a second time**, for the reason every other rung in this corpus derives
 * rather than duplicates: two constants holding the same value by coincidence
 * is the shape that drifts apart the first time one of them moves. This is a
 * fixed design constant, not a read of any particular `Treasury` instance's
 * configured floor — a test `Treasury` built with no facility open (`floor`
 * at its default of `0`) still bounds arrears at this figure, because the
 * bound is a property of what a prison may owe, independent of whether this
 * particular session opened the standing overdraft at all.
 *
 * **Prospective, exactly as decision 2's reserve is** — ADR 0096 §"What the
 * owner must approve" item 6 asks whether a *restore* should write down
 * arrears already above this bound, answers itself that the save format is
 * outside any agent's mandate, and that question is **not** answered by this
 * change: `restore` below still admits any non-negative safe integer
 * unchanged. Only forward accrual, inside `update`, is capped.
 */
export const ARREARS_BOUND_MINOR_UNITS = -TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS;

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

  /**
   * `events` is the session's `SimulationEventLog`, and it is a constructor
   * dependency for the reason `RefusalLog` is one on the command handlers: the
   * fact that a payday went unpaid is known *here*, at the tick it happened,
   * and nowhere else. A watcher polling `unpaidWagesMinorUnits` from outside
   * could see the figure rise but could not tell a failed payday from a
   * restore that loaded arrears, which is the one distinction the event exists
   * to draw.
   *
   * Declared before the defaulted `staffRoles` because TypeScript forbids a
   * required parameter after an optional one, and this one is required on
   * purpose: a `PayrollSystem` with no sink would go on billing silently,
   * which is the defect issue #507 exists to close.
   *
   * **`roomInstances` is a new, required dependency, added for
   * [ADR 0096](../../../docs/adr/0096-what-a-way-back-is-and-what-guarantees-one.md)
   * decision 2 (accepted 2026-09-10).** Required rather than defaulted, the
   * same argument `SpendClass` itself makes on `Treasury`: a `PayrollSystem`
   * that silently read "mature" for a fresh, unfurnished prison would spend
   * exactly the reserve this change exists to protect, at every call site that
   * forgot to say otherwise. `InsolvencyRungSystem` takes the same dependency
   * for the same reason — see its own class comment, "The starter rung".
   */
  public constructor(
    private readonly treasury: Treasury,
    private readonly staff: PayrollStaffSource,
    private readonly events: SimulationEventLog,
    private readonly roomInstances: PayrollResidencySource,
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
    // Captured before this update overwrites `this.unpaid`, and load-bearing
    // for ADR 0096 decision 3(c) below: the bound it names caps how much
    // *this day* may add, never a figure the day inherited.
    const unpaidBeforeToday = this.unpaid;
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

    /*
     * **What the prison may spend on wages today, which is no longer its
     * balance** (the owner's ruling 19 of 2026-08-31, drafted as ADR 0017's
     * "Amendment, 2026-09-01").
     *
     * This line read `Math.min(due, this.treasury.balanceMinorUnits)`, and that
     * sentence is kept because it is what ADR 0083 measured and defended: its
     * "considered and not taken" rejected *"making the payroll draw on the
     * floor"* on the ground that `Math.min(due, balance)` *"is what keeps ADR
     * 0017 decision 8's third rung reachable"*. Under a single floor that was
     * right — a payroll that drew on the overdraft would have had no rung of
     * its own at all. Ruling 19 gives it one: **wages are unpaid below −2,500**,
     * which is the floor (−10,000 since the grant of 2026-09-23, #641; the rung
     * is the floor wherever the floor is), so the third rung is reached by drawing down to it
     * rather than by refusing to draw at all.
     *
     * `floorFor('wages')` and not `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`: the
     * floor a session actually runs on is the one `setOverdraftFloor` was given,
     * and a second copy of the constant here would disagree with it the first
     * time they differed. A treasury with no facility open returns `0` from
     * that call, which makes this line *exactly* the `Math.min(due, balance)` it
     * replaced — every `new Treasury()` in `tests/unit/economy-payroll.test.ts`
     * is unaffected, to the minor unit.
     *
     * `Math.max(0, …)` because the balance can already be below the wage rung's
     * floor when this runs — a restored save, or income withheld after a
     * construction pass — and a negative `payable` is not a refund.
     *
     * **`isFreshUnfurnishedPrison`, read live, added for ADR 0096 decision 2.**
     * The same idiom `createSessionCommandHandler`'s `'deliveries'` press and
     * `InsolvencyRungSystem` already use: a moment-of-read fact off
     * `RoomInstanceRegistry.totalResidentCapacity`, never cached, so the
     * instant a build order completes a sleep surface this system judges the
     * very next payday at the mature rung — no separate "graduation" step,
     * nothing to remember and nothing to forget.
     */
    const isFreshUnfurnishedPrison = this.roomInstances.totalResidentCapacity === 0;
    const payable = Math.max(
      0,
      Math.min(due, this.treasury.balanceMinorUnits - this.treasury.floorFor('wages', isFreshUnfurnishedPrison)),
    );
    // `spend` cannot refuse `payable` -- it is a non-negative integer bounded
    // by the room the wage rung leaves -- but the outcome is read rather than
    // discarded, so that a refusal leaves the whole bill owed instead of
    // silently vanishing.
    const paid = payable > 0 && this.treasury.spend(payable, 'wages', isFreshUnfurnishedPrison) ? payable : 0;
    /*
     * **ADR 0096 decision 3(c): arrears stop accruing at
     * `ARREARS_BOUND_MINOR_UNITS`, and what cannot accrue is forgiven rather
     * than deferred.** `due - paid` is what today's bill leaves owed before
     * the bound; a day that would have pushed arrears from, say, 2,480 to
     * 3,200 leaves it at exactly 2,500, with the 700 above the bound never
     * remembered anywhere, not on this system and not on the event this fires
     * below.
     *
     * **`Math.max(ARREARS_BOUND_MINOR_UNITS, unpaidBeforeToday)`, not the bound
     * alone — this is the whole of what keeps decision 3(c) prospective, and
     * the distinction the ADR itself draws: "a bound on arrears applies to
     * accrual rather than to a figure already accrued."** For an ordinary
     * prison that has never crossed the bound, `unpaidBeforeToday <=
     * ARREARS_BOUND_MINOR_UNITS`, so the ceiling **is** the bound and this is
     * `Math.min(due - paid, ARREARS_BOUND_MINOR_UNITS)` to the minor unit. For
     * a prison already above it — restored from a save written before this
     * change, or from one a player edited by hand (#102) — the ceiling is
     * `unpaidBeforeToday` itself: today adds nothing further (the figure does
     * not grow), and it is not reduced either, because `due - paid` can only
     * fall below `unpaidBeforeToday` through an actual payment (`paid > 0`).
     * A `Math.min(due - paid, ARREARS_BOUND_MINOR_UNITS)` alone would have
     * written such a figure down to 2,500 on this system's very next tick
     * after every restore — exactly the repair ADR 0096's own "What the owner
     * must approve" item 6 names and leaves unanswered, and exactly the
     * save-format question `AGENTS.md` reservation 2 keeps the owner's.
     */
    const arrearsCeilingMinorUnits = Math.max(ARREARS_BOUND_MINOR_UNITS, unpaidBeforeToday);
    this.unpaid = Math.min(due - paid, arrearsCeilingMinorUnits);
    /*
     * The event is the *payday*, not the condition. ADR 0049 decided
     * insolvency is a state rather than a loss condition, and a state belongs
     * on a readout; what belongs on the events channel is the moment it bit.
     *
     * So this fires on the day the bill was not met in full, and it fires
     * again on the next such day -- once per in-game day at most, because that
     * is this system's whole schedule. A prison that stays broke therefore
     * says so once a day rather than twice a second, which is the volume
     * property the channel needs and gets here for free rather than from a
     * filter downstream.
     *
     * `this.unpaid` and not `due - payable`: what the player is told is what
     * they now owe, which is the same figure the save carries and the same one
     * `unpaidWagesMinorUnits` reports. A payday met in full leaves it at 0 and
     * `recordUnpaidWages` then records nothing.
     */
    this.events.recordUnpaidWages(this.unpaid, context.tick);
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
