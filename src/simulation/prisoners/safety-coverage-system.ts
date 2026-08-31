import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { EntityId } from '../entity/entity-store';
import { resolveSectorCoverageState, SECTOR_COVERAGE_STATES, type SectorCoverageCounts, type SectorCoverageState } from '../security/coverage-state';
import { provisionSafety, type NeedsComponent } from './needs';

/**
 * How many prisoners are standing in a sector on each rung of the coverage
 * ladder, at the last tick this system ran.
 *
 * The status strip's `Covered N / Understaffed N / Unguarded N` (issue #588,
 * *"so the 40s are attributable"*), and the same walk that provisions the
 * need produces it -- a second pass to count what the first pass just decided
 * would be a second chance to disagree with it.
 */
export type SafetyCoverageCensus = Readonly<Record<SectorCoverageState, number>>;

export const EMPTY_SAFETY_COVERAGE_CENSUS: SafetyCoverageCensus = Object.freeze({ covered: 0, understaffed: 0, unguarded: 0 });

/** The sectors this system provisions for, and what each one's coverage is -- `DeploymentSystem.getCoverageReport`'s shape, narrowed to what is read. */
export interface SafetyCoverageReportSource {
  getCoverageReport(tick: number): readonly (SectorCoverageCounts & { readonly sectorId: string })[];
}

/**
 * **Coverage provisions the `safety` need** -- "What keeps a prisoner safe"
 * (the ADR of that title), issue #588, the reader half of
 * [ADR 0017](../../../docs/adr/0017-money-primary-resource-model.md)
 * decision 1 that was never wired, under the owner's ruling on issue #599.
 *
 * ## The mechanic, in one sentence
 *
 * Each tick a prisoner spends in a sector, `safety` is provisioned at that
 * sector's existing coverage rung: `covered` at
 * `SAFETY_COVERAGE_PROVISION_PER_TICK`, `understaffed` at half of it,
 * `unguarded` at nothing. `NeedsDecaySystem` goes on subtracting
 * `NEED_DECAY_SCALED_PER_TICK.safety` from every prisoner regardless, so what
 * coverage decides is the **sign** of the net rate and not the drain itself
 * (`provisionSafety` in `./needs.ts` argues why this never subtracts).
 *
 * ADR 0017 decision 1 pays a prison for capacity *and for the ability to keep
 * people in it safely*, and `StateIncomeSystem` already withholds 40 of the
 * 300-a-prisoner-day grant for each need at or below
 * `STATE_INCOME_UNMET_NEED_LEVEL`. Everything on both sides of that sentence
 * existed before this system: the sectors, the guards, the three-rung readout,
 * the need, the withholding. What did not exist was anything joining them, so
 * the "safely" half had no instrument at all. This is that join and nothing
 * else -- **no new income term, no incident fine**, which the source of the
 * ruling is explicit about: *"Do not also add an incident fine on top in the
 * same pass."*
 *
 * ## Where the two facts it needs come from, and why neither is decided here
 *
 * - **Which prisoners are in a sector**: `resolveOccupants`, injected, which
 *   `src/simulation/runtime/new-session.ts` satisfies with
 *   `resolveSectorOccupants` -- ADR 0048 decision 1's containment rule, in the
 *   one module that owns it. This system inventing a spatial rule of its own is
 *   the mistake `projection-catalog.ts` names in its own words.
 * - **What that sector's coverage is**: `DeploymentSystem.getCoverageReport`
 *   through `resolveSectorCoverageState`, which is the Staff panel's ladder
 *   and is documented as such in `src/simulation/security/coverage-state.ts`.
 *   A prisoner therefore cannot be provisioned at a rung the panel would not
 *   show them standing on.
 *
 * A sector missing from the report provisions nothing, and that is the same
 * answer as `unguarded` rather than a separate case: a sector nothing reports
 * on has no guards reported on it.
 *
 * ## Ordering, cadence and cost
 *
 * `order` 275 puts it after `DeploymentSystem` (270), so it reads the coverage
 * that this tick's assignments produced rather than the previous tick's, and
 * before `IncidentTriggerSystem` (285) samples `needsPressure` -- which now
 * reads a `safety` level that coverage moved, and is the whole of how coverage
 * comes to suppress incidents.
 *
 * `intervalTicks` 10 matches `NeedsDecaySystem` and `DeploymentSystem`, and is
 * a scheduling choice rather than a balance one for `decayNeed`'s reason:
 * `provisionSafety` is exactly linear in `ticksElapsed` at `NEED_SCALE`, so
 * the same ticks in one call and in ten land on the same stored level.
 *
 * One `resolveOccupants` walk per sector per ten ticks. That is the same
 * `O(sectors x population)` shape and the same cadence `DeploymentSystem`
 * already pays through `countSectorOccupants`, and
 * `src/simulation/security/sector-occupancy.ts` measures the walk at 535 us
 * for 5,000 prisoners -- about 54 us a tick amortised at the capacity ceiling,
 * a tenth of a percent of the 50 ms tick, with one sector.
 *
 * ## Determinism and persistence
 *
 * No RNG stream, no clock and no `Map`/`Set` iteration: it walks the coverage
 * report (`getCoverageReport` is sorted by sector id) and, inside each sector,
 * `resolveOccupants`'s ascending-entity-id list. **Nothing is persisted.** The
 * census is derived from state the save already carries, which is why this
 * system has no snapshot pair -- the same argument `IncidentTriggerSystem`
 * makes for reading its extra counters off the log rather than adding fields
 * to a `.strict()` schema.
 *
 * **It is rebuilt by the restore itself, not by "the first update after a
 * load", and that correction is the point of `takeCensus` below.** A restored
 * session is paused and publishes its status counts before any tick runs, so
 * there is no first update to wait for until the player presses play.
 */
export class SafetyCoverageSystem implements SystemRegistration {
  public readonly id = 'prisoners.safety-coverage';
  public readonly order = 275;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  private census: SafetyCoverageCensus = EMPTY_SAFETY_COVERAGE_CENSUS;

  public constructor(
    private readonly deployment: SafetyCoverageReportSource,
    private readonly resolveOccupants: (sectorId: string) => readonly EntityId[],
    private readonly entityStore: { getIndex(entityId: EntityId): number },
    private readonly needs: NeedsComponent,
  ) {}

  /**
   * The rungs the population stood on at the last walk.
   *
   * A **live read of the last walk's answer**, not a recomputation: the status
   * strip is projected on every publication and re-walking the population
   * there would pay `resolveOccupants` again for an answer this system already
   * has. It is at most `intervalTicks - 1` ticks old.
   *
   * **This used to end "and after a load it is the empty census until the
   * first update -- ten ticks, which is the same staleness every other
   * ten-tick cadence in the kernel carries", and that sentence was false in
   * the one place it was about.** A restored session arrives `paused`
   * (`SimulationStateMachine.handleInitialize` sets `mode: 'paused'` and then
   * publishes one `simulation/status-counts` straight away, so a prison with a
   * population is not shown as a row of zeros). Nothing steps the kernel until
   * the player presses play, so the "ten ticks" was unbounded in wall time --
   * a twelve-prisoner prison came back reading `0 COVERAGE` under the green
   * `Covered` badge `coverageBadge` prints for an all-zero census, and stood
   * there. `takeCensus`, called by `restoreSimulationRuntime`, is why the
   * clause is gone rather than merely corrected.
   */
  public getCensus(): SafetyCoverageCensus {
    return this.census;
  }

  /**
   * Re-derive the census now, at `tick`, provisioning nothing.
   *
   * For **a restore**, and `src/simulation/runtime/restore-session.ts` is the
   * only caller. The census is derived state -- `docs/PERSISTENCE.md`'s rule
   * is that derived state is recomputed rather than carried -- but "recomputed
   * on the first update after the load" is not recomputation a paused session
   * ever reaches, so the recompute has to happen at the load itself. No field
   * is added to any payload and `SAVE_SCHEMA_VERSION` does not move.
   *
   * **Zero elapsed ticks is what keeps this from being a second walk that can
   * disagree with the first.** It is `walk`, the same loop `update` runs, at
   * `ticksElapsed: 0`; `provisionSafety` is exactly linear in `ticksElapsed`
   * (`./needs.ts`), so every `setScaled` writes back the level it just read
   * and no prisoner is paid for time they did not live through. That is
   * asserted rather than assumed, in
   * `tests/integration/session-save-round-trip.test.ts` -- "takes that census
   * without paying anybody a tick of safety they did not live through".
   */
  public takeCensus(tick: number): void {
    this.census = this.walk(tick, 0);
  }

  public update(context: SimulationContext): void {
    this.census = this.walk(context.tick, this.schedule.intervalTicks);
  }

  /**
   * One pass over the sectors: count each occupant onto their sector's rung
   * and provision them for `ticksElapsed` at it.
   *
   * The counting and the provisioning are one loop on purpose, and the type
   * docblock above says why -- *"a second pass to count what the first pass
   * just decided would be a second chance to disagree with it"*. Extracting
   * the loop so a restore can run it at zero ticks keeps that property: there
   * is still exactly one place that decides which rung a prisoner is standing
   * on.
   */
  private walk(tick: number, ticksElapsed: number): SafetyCoverageCensus {
    const census: Record<SectorCoverageState, number> = { covered: 0, understaffed: 0, unguarded: 0 };

    for (const entry of this.deployment.getCoverageReport(tick)) {
      const state = resolveSectorCoverageState(entry);
      for (const entityId of this.resolveOccupants(entry.sectorId)) {
        census[state] += 1;
        const index = this.entityStore.getIndex(entityId);
        this.needs.setScaled(index, 'safety', provisionSafety(this.needs.getScaled(index, 'safety'), state, ticksElapsed));
      }
    }

    return Object.freeze(census);
  }
}

/** Every rung, in `SECTOR_COVERAGE_STATES` order -- re-exported so a reader of the census does not have to import two modules to walk it. */
export const SAFETY_COVERAGE_CENSUS_STATES = SECTOR_COVERAGE_STATES;
