import type { StaffViewModel } from '../simulation/presentation/staff-projection';
import type { HudStaffCoverageViewModel } from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads how many guards the prison asks for against how many it has, over the
 * projection channel, and turns it into what the Staff panel's coverage block
 * renders ([ADR 0048](../../docs/adr/0048-what-a-sectors-occupants-are.md)
 * consequence 1).
 *
 * ## The gap this closes
 *
 * ADR 0048 made a riot reachable in a prison a player can build: needs cause
 * it, staffing amplifies it, and `requiredGuardCount` scales with occupancy, so
 * a prison that outgrows its guards riots about every two in-game days. Its own
 * Consequences record what that left undone:
 *
 * > `StaffCoverageRowViewModel` carries `required`/`assigned`/`shortage` per
 * > sector, and no panel renders it -- so the requirement rising from 1 to 2 at
 * > the ninth prisoner, which is the clearest warning the simulation now
 * > produces, is invisible.
 *
 * Measured on this tree, in a 12-bed prison admitting one prisoner at a time
 * with no guard hired: the report reads `required: 1, assigned: 0, shortage: 1`
 * from the first admission through the eighth, and `required: 2, assigned: 0,
 * shortage: 2` **on the tick the ninth is admitted** -- 12,788 ticks before that
 * prison's first riot at tick 13,200. So the warning is not only computed, it is
 * computed early enough to act on, which is what makes rendering it worth a
 * channel reader rather than decoration.
 *
 * ## Why it reads `hud/staff` and not `hud/security`
 *
 * Both projections carry the same `getCoverageReport` figures, and the choice is
 * about which one the *panel* is: `projectSecurity` is a sector read model --
 * grades, governed doors, patrol routes, per-sector rosters -- and the Staff
 * panel is not a sector surface. `hud/staff` is the read model of the thing this
 * panel is about, it already publishes the summed `totals` this block renders,
 * and it was catalogued with no reader from the day #104 shipped it.
 *
 * ## What it asks for, and why the window is zero
 *
 * `limit: 0`. The block draws no roster rows at all, and `StaffViewModel.totals`
 * and `coverage` are computed over the whole roster regardless of the page
 * window (`projectStaff` sums `getCoverageReport`, which never consults the
 * request), so a window of zero returns every figure this reader uses and no row
 * it would discard. It is the same rule `HeldGuardsReader` follows by naming
 * `HELD_GUARD_ROW_LIMIT` -- ask for the rows the panel can draw -- taken to its
 * floor. It bounds the *message*, not the projection: `projectStaff` still maps
 * every hired guard before paging, which is `O(staff)` and is the cost that
 * projection has always had.
 *
 * ## Why the totals and not the per-sector rows
 *
 * `StaffViewModel.coverage` is one row per sector and
 * `applyDefaultSecuritySector` derives exactly one sector for every session a
 * player can start, so a per-sector list would be a list that always has one
 * row -- a shape that reads as "here are your sectors" while being a readout of
 * the only one there is. The totals are the honest form of the same fact **and
 * they survive a second sector**: `projectStaff` sums the per-sector shortages
 * rather than netting the totals, so a prison with one sector over-staffed and
 * another short still reports a shortage. What it stops answering the day a
 * player can draw a sector is *which* sector is short -- a per-sector breakdown
 * to add then, not a readout to be broken by then.
 *
 * ## The tenth translator, and why it is a class
 *
 * It joins `simulation-clock.ts`, `simulation-counts.ts`, `simulation-alerts.ts`,
 * `simulation-zoning.ts`, `simulation-room-needs.ts`, `simulation-build-queue.ts`,
 * `simulation-intake.ts`, `simulation-pending-deliveries.ts` and
 * `simulation-held-guards.ts` outside `src/ui/hud/`, and it is here for the
 * reason they all are: the HUD imports nothing from `src/simulation/**`
 * (`AGENTS.md` boundary 1, enforced by `tests/unit/ui-hud-messages.test.ts`), so
 * a module that has to know both a projection's shape and a view model sits
 * outside it.
 *
 * A class rather than a function of a message, exactly as `HeldGuardsReader` is:
 * this is a **pull** correlated by `messageId` (ADR 0003 decision 2), so it holds
 * the requester that asks. The mapping is a pure function --
 * `staffCoverageFromProjection` -- so what the panel is told can be proven with
 * no worker, no channel and no DOM.
 *
 * ## What it computes, which is nothing
 *
 * Three numbers copied across the boundary. It does not derive `required` from
 * the population, does not recompute `shortage` from the other two, and holds no
 * threshold: `DeploymentSystem.requiredGuardCountFor` is the one place a
 * requirement is decided (ADR 0048 decision 3) and `projectStaff` is the one
 * place the per-sector rows are summed. A subtraction here would be a second
 * definition of "short" on a thread that owns no roster, and it would read
 * differently from the simulation's the day a second sector existed.
 */
export function staffCoverageFromProjection(view: StaffViewModel): HudStaffCoverageViewModel {
  return {
    required: view.totals.required,
    assigned: view.totals.assigned,
    shortage: view.totals.shortage,
    reserve: view.totals.reserve,
    available: view.totals.available,
  };
}

export class StaffCoverageReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * **One message**, however many guards are hired.
   *
   * `undefined` while another read is in flight, exactly as `HeldGuardsReader`
   * answers: a caller on a cadence must not queue a second question about a
   * prison it has not heard the answer for once.
   */
  public async read(): Promise<HudStaffCoverageViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<StaffViewModel>('hud/staff', { limit: 0 });
      if (reply.view === undefined) return undefined;
      return staffCoverageFromProjection(reply.view);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
