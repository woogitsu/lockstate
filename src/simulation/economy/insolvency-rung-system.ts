import type { SimulationEventLog } from '../events';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { RoomInstanceRegistry } from '../prisoners/room-instance-registry';
import { rungFloorMinorUnits, type Treasury } from './treasury';

/**
 * The two rungs of ADR 0017 decision 8's insolvency ladder that this system
 * watches for a *crossing*, as opposed to `'wages'`, which
 * `SimulationEventLog.recordInsolvencyRungCrossed`'s own comment explains is
 * announced by `PayrollSystem` instead.
 */
const WATCHED_RUNGS = ['deliveries', 'construction'] as const;

/**
 * Announces the moment the treasury falls to or below the deliveries or the
 * construction rung -- the owner's ruling of 2026-09-01 on issue
 * [#767](https://github.com/matmaxalez/lockstate/issues/767), which widened
 * [ADR 0087](../../../docs/adr/0087-whether-a-refusal-is-an-event-or-a-condition.md)
 * decision 2 from a standing indicator alone into a standing indicator *and*
 * a crossing notice: *"a persistent indicator ... plus a one-off notice at
 * the moment of crossing, so a player who was looking elsewhere gets a
 * nudge."*
 *
 * ## Why a system of its own, rather than a check inside `PayrollSystem`
 *
 * #767 was found by playing a payroll tick that took the treasury from
 * −1,220 to −2,180 in one step -- past both the deliveries rung (−1,250) and
 * the construction rung (−2,000) at once, because `PayrollSystem` draws on
 * the overdraft down to the **wages** floor (deeper than both), not down to
 * either of theirs. That is the common case and the one this ADR amendment
 * names, but it is not the only route: `ProcurementSystem`'s just-in-time
 * pass for a queued build order spends under the **construction** class,
 * whose own floor (−2,000) is deeper than the deliveries rung (−1,250) --
 * `Treasury.canAfford` only ever compares against the *spending* class's own
 * floor, so a construction-class purchase that lands the balance at, say,
 * −1,400 has crossed the shallower deliveries rung as a side effect of a
 * spend that was never refused. A check living inside `PayrollSystem` would
 * miss that case entirely; a check that reads the balance after every
 * balance-changing event in the tick, regardless of which system or command
 * moved it, catches both. Every caller that spends
 * (`grep -rn "\.spend(" src/simulation`) does so from `order` 110
 * (`procurement`) or earlier (a command handler, dispatched before any
 * system runs that tick) or 130 (`payroll`); this system's `order` of 135
 * runs after all three, so it always reads the tick's *final* balance.
 *
 * ## Why this needs memory and `PrisonCondition` must not have any
 *
 * `statusCountsSchema.conditions` is recomputed from live state on every
 * publication and carries no history, by design (ADR 0087 decision 2, Cost
 * 1: a condition re-announced on every read would inflate without bound).
 * A *crossing*, by definition, is a comparison between two ticks -- "was this
 * rung standing a moment ago and is it standing now" -- which a pure,
 * memory-free read cannot answer about itself. So this class keeps exactly
 * the two-element `Set` that comparison needs, in memory only, never
 * persisted: the same shape `IncidentLog` keeps for "is an incident open" so
 * `incidents.*-opened` fires once per opening rather than once per tick an
 * incident stays open.
 *
 * **Deliberately unsnapshotted, and safely so.** `this.standing` starts empty
 * on construction and the first `update()` call only *seeds* it from the
 * treasury's actual balance -- it fires no event on that first call, however
 * the two rungs read. That is what keeps a restored session honest: by the
 * time this system's first `update()` runs, `Treasury.restore` has already
 * put the real balance back (`restoreSessionSystems`, called from
 * `restoreSimulationRuntime`, runs before the kernel ever steps), so a
 * prison that reloads already below a rung seeds `standing` with that rung
 * already in it and announces nothing -- correctly, because nothing new just
 * happened. `statusCountsSchema.conditions` still tells that player
 * immediately, on the very first publication after load, exactly as ADR
 * 0087 decision 2 intends; what this class adds is the notice for the
 * moment a rung is crossed *during* a session, which a restore is not.
 *
 * ## Determinism
 *
 * A pure comparison of two safe integers per watched rung, run every tick
 * (`schedule: { intervalTicks: 1, phaseTicks: 0 }`) so no crossing is missed
 * between two widely spaced publications. No RNG stream is taken. Two runs
 * of the same command stream read the same balance at the same tick and
 * therefore cross the same rungs on the same tick.
 *
 * ## The starter rung, added by #771 after this class predated it
 *
 * **`rungFloorMinorUnits` took a third argument, `isFreshUnfurnishedPrison`,
 * the day after this class was written, and this call site was not updated
 * to pass it.** The owner's second ruling on #771 (2026-09-01, ADR 0017's
 * "starter rung" amendment) gives a fresh, unfurnished prison a shallower
 * `'deliveries'` floor than the mature −1,250
 * (`INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS`, −1,185) so its
 * first plank is always still affordable. Omitting the argument here does
 * not throw — `rungFloorMinorUnits` defaults it to `false` — so this system
 * silently compared every fresh session's balance against the *mature*
 * floor instead: a fresh prison sinking to, say, −1,200 has in fact crossed
 * its live −1,185 floor, but this system read −1,250 and reported nothing
 * standing. **That is under-reporting, the safe direction and not the
 * dangerous one — a missed nudge, not a false alarm — but it is still wrong**,
 * and it is exactly what the pass that built #771 flagged without touching
 * (out of its own brief) and this fix confirms and closes.
 *
 * `roomInstances` is read live at the top of every `update()`, the same
 * idiom `createSessionCommandHandler`'s `'deliveries'` press uses and for the
 * same reason its own comment gives: "fresh, unfurnished" is a moment-of-read
 * fact, not a flag set once at construction and left to go stale — a prison
 * that furnishes its first bed mid-session must have this system move onto
 * the mature rung on its very next tick, not carry the starter one for the
 * rest of the run.
 *
 * **`'construction'` is unaffected either way, and the loop still shares one
 * flag between both watched rungs rather than branching per rung.**
 * `STARTER_RUNG_FLOORS_MINOR_UNITS.construction` equals
 * `INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS` — the owner's ruling moves
 * only `'deliveries'` and `'hiring'` — so passing the same
 * `isFreshUnfurnishedPrison` into both calls in the loop below is not an
 * approximation for construction, it is the identical comparison
 * `rungFloorMinorUnits('construction', floor, false)` already made.
 */
export class InsolvencyRungSystem implements SystemRegistration {
  public readonly id = 'economy.insolvency-rungs';
  /**
   * Immediately after `economy.payroll` (130) and before `navigation` (150) --
   * the same gap `economy.payroll` itself was inserted into, and for a
   * related reason: nothing that spends treasury money runs later than 130 in
   * a real session (`procurement` is 110, a command-handler spend is
   * dispatched before any system runs that tick, and `payroll` itself is
   * 130), so a system reading the balance at 135 always sees the tick's final
   * word on it.
   */
  public readonly order = 135;
  public readonly schedule = { intervalTicks: 1, phaseTicks: 0 };

  private standing = new Set<(typeof WATCHED_RUNGS)[number]>();
  private seeded = false;

  public constructor(
    private readonly treasury: Treasury,
    private readonly events: SimulationEventLog,
    private readonly roomInstances: RoomInstanceRegistry,
  ) {}

  public update(context: SimulationContext): void {
    const isFreshUnfurnishedPrison = this.roomInstances.totalResidentCapacity === 0;
    for (const rung of WATCHED_RUNGS) {
      const floor = rungFloorMinorUnits(rung, this.treasury.overdraftFloorMinorUnits, isFreshUnfurnishedPrison);
      const crossed = this.treasury.balanceMinorUnits <= floor;
      const wasStanding = this.standing.has(rung);
      if (crossed === wasStanding) continue;
      if (crossed) {
        this.standing.add(rung);
        // The seeding pass (see class comment) establishes the baseline
        // silently; only a transition discovered on a *later* call is a real
        // crossing.
        if (this.seeded) this.events.recordInsolvencyRungCrossed(rung, context.tick);
      } else {
        this.standing.delete(rung);
      }
    }
    this.seeded = true;
  }
}
