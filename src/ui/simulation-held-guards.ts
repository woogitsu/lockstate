import type { LocalizationKey } from '../content/localization';
import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type { HeldGuardsViewModel } from '../simulation/presentation/guard-release-projection';
import { HELD_GUARD_ROW_LIMIT, type HudHeldGuardViewModel, type HudHeldGuardsViewModel } from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads which guards are held and by what, over the projection channel, and
 * turns it into what the Staff panel's held list renders
 * ([ADR 0034](../../docs/adr/0034-releasing-a-claimed-guard.md)).
 *
 * ## The gap this closes
 *
 * `GuardRoster.unassign` is complete and has been since #26, and until ADR 0034
 * **every caller of it in `src/` was inside the system that made the claim being
 * released** — so a claim whose owner had lost track of it was permanent. ADR
 * 0033 measured that as a terminal defect and its open question 3 says it will
 * recur for the next resource-claiming system.
 *
 * A command fixes it only if something can name a guard, and the missing piece
 * is the one `CancelBuildOrder` was blocked on until #367 and
 * `CancelMaterialPurchase` until #285: **a read model, not a button.** The
 * difference here is what the read model has to carry. An id alone is not
 * enough, because `'on-search'` is a *shared* deployment phase — a row saying
 * "On Search" would leave a player to guess whether they were about to pull
 * somebody off a contraband search or out of a riot. So `hud/held-guards`
 * carries the resolved *claim*, resolved by the same rule the release uses.
 *
 * ## The fifth translator, and why it is a class
 *
 * It joins `simulation-clock.ts`, `simulation-counts.ts`, `simulation-alerts.ts`,
 * `simulation-zoning.ts`, `simulation-room-needs.ts`, `simulation-build-queue.ts`,
 * `simulation-intake.ts` and `simulation-pending-deliveries.ts` outside
 * `src/ui/hud/`, and it is here for the reason they all are: the HUD imports
 * nothing from `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`), so a module that has to know both a
 * projection's shape and a view model sits outside it.
 *
 * A class rather than a function of a message, exactly as `PendingDeliveriesReader`
 * is: this is a **pull** correlated by `messageId` (ADR 0003 decision 2), so it
 * holds the requester that asks. The mapping is a pure function —
 * `heldGuardsFromProjection` — so what the panel is told can be proven with no
 * worker, no channel and no DOM.
 *
 * ## Where the claim's word comes from
 *
 * `deriveSimulationMessageKey('guard-claim', claim)`, the same mechanical rule
 * every other projected simulation enum's label is derived by
 * (`src/content/simulation-message-keys.ts`). So the simulation sends a stable id,
 * this module derives the key the catalog was built with, and the HUD resolves
 * the key to text at render time — ADR 0011's three namespaces kept apart at
 * exactly this line, and no sentence crossing the worker boundary.
 *
 * The *role's* word is injected instead, as a function, for
 * `PendingDeliveriesReader`'s reason: a staff role's `nameKey` is
 * `src/content/staff-role-catalog.ts`'s, which the HUD may not read and the
 * projection may not resolve, so the composition root supplies the answer across
 * both boundaries.
 *
 * ## What it caches, and what it must not
 *
 * Nothing, for `PendingDeliveriesReader`'s reason, and it is just as sharp here:
 * the ids in it are what a press *releases*, so a row surviving one publication
 * too long is a control offering to free a guard that is already free. The
 * simulation refuses that honestly — it records `release-guard.not-held`, which
 * reaches the alerts list — and a refusal the player can read is what makes the
 * race survivable, not a reason to cause one.
 */

/**
 * The staff-role-name lookup this reader is handed.
 *
 * A **function**, not a table, and the composition root supplies it — see this
 * module's header. `undefined` is a real answer and not a failure: a guard hired
 * with a role id the catalogue does not define is still a held guard, and the
 * panel names it by entity id instead of dropping the only control that frees it.
 */
export type StaffRoleLabelLookup = (staffRoleId: string) => LocalizationKey | undefined;

/**
 * What the panel renders, from one projection reply.
 *
 * Pure, and it decides nothing the simulation decided: the rows are the
 * projection's own window in the projection's own order (ascending entity id,
 * which is the order the roster itself reports), the counts are the
 * projection's, and the only things added are two message keys.
 */
export function heldGuardsFromProjection(
  view: HeldGuardsViewModel,
  labelKeyOf: StaffRoleLabelLookup,
): HudHeldGuardsViewModel {
  const guards: HudHeldGuardViewModel[] = view.held.rows.map((row) => {
    const roleLabelKey = labelKeyOf(row.staffRoleId);
    return {
      entityId: row.entityId,
      claimLabelKey: deriveSimulationMessageKey('guard-claim', row.claim),
      // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
      // is on, so "the host names no role" has to be an absent property and not
      // a present one holding nothing.
      ...(roleLabelKey === undefined ? {} : { roleLabelKey }),
    };
  });

  return {
    held: view.totals.held,
    unassigned: view.totals.unassigned,
    guards,
  };
}

export class HeldGuardsReader {
  private readonly requester: SimulationProjectionRequester;
  private readonly labelKeyOf: StaffRoleLabelLookup;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(
    channel: ProjectionMessageChannel,
    labelKeyOf: StaffRoleLabelLookup,
    options: ProjectionRequesterOptions = {},
  ) {
    this.requester = new SimulationProjectionRequester(channel, options);
    this.labelKeyOf = labelKeyOf;
  }

  /**
   * **One message**, however many guards are held.
   *
   * The window is named rather than defaulted, and it is the panel's own row
   * budget: `HELD_GUARD_ROW_LIMIT` is how many rows the section can show, so
   * asking for the projection's default hundred would build ninety-odd rows
   * nothing can render, twice a second. `totals.held` and `totals.unassigned`
   * still come back over the whole roster, so the header tells the truth about
   * the prison while the rows tell the truth about the panel.
   *
   * `undefined` while another read is in flight, exactly as
   * `PendingDeliveriesReader` answers: a caller on a cadence must not queue a
   * second question about a prison it has not heard the answer for once.
   */
  public async read(): Promise<HudHeldGuardsViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<HeldGuardsViewModel>('hud/held-guards', {
        limit: HELD_GUARD_ROW_LIMIT,
      });
      if (reply.view === undefined) return undefined;
      return heldGuardsFromProjection(reply.view, this.labelKeyOf);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
