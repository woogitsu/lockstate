import type { LocalizationKey } from '../content/localization';
import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type { StaffViewModel } from '../simulation/presentation/staff-projection';
import { STAFF_ROSTER_ROW_LIMIT, type HudStaffRosterRowViewModel, type HudStaffRosterViewModel } from './hud';
import type { StaffRoleLabelLookup } from './simulation-held-guards';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads who is on the payroll, over the projection channel, and turns it into
 * what the Staff panel's roster block renders (issue #533, the owner's decision
 * on issue #535 decision 4).
 *
 * ## The gap this closes
 *
 * `DismissStaff` names one staff `EntityId`, and until this reader **no staff id
 * reached this thread except through `hud/held-guards`** -- which carries the
 * *held subset*. That is the wrong subset for this command, and not by a little:
 * the state issue #533 was measured in is three guards hired into a prison that
 * requires none, every one of them `'unassigned'`, so not one of them appears on
 * a held row. A dismiss control fed by `HeldGuardsReader` would have been a
 * control that could not reach the case it exists for.
 *
 * So the missing piece was a read model rather than a button, which is the same
 * diagnosis `CancelBuildOrder` waited on until #367 and `CancelMaterialPurchase`
 * until #285. The read model already existed: `hud/staff` has been catalogued
 * since #104, `HeldGuardsReader`'s own header records that it was *"catalogued
 * and unread"*, and `StaffCoverageReader` reads it with `limit: 0` -- for the
 * totals and none of the rows. This reader is the first to ask it for rows.
 *
 * ## The eleventh translator
 *
 * It joins the ten `simulation-*.ts` modules outside `src/ui/hud/` and is here
 * for the reason they all are: the HUD imports nothing from
 * `src/simulation/**` (`AGENTS.md` boundary 1, enforced by
 * `tests/unit/ui-hud-messages.test.ts`), so a module that has to know both a
 * projection's shape and a view model sits outside it. A class rather than a
 * function of a message, because this is a **pull** correlated by `messageId`
 * (ADR 0003 decision 2); the mapping is the pure `staffRosterFromProjection`,
 * so what the panel is told can be proven with no worker, no channel and no DOM
 * -- which matters more than usual here, because `vitest.config.ts` is
 * `environment: 'node'` and nothing headless can call `createStaffPanel`.
 *
 * ## Where the row's second word comes from, and why no string was drafted
 *
 * `deriveSimulationMessageKey('deployment-phase', row.assignment.deploymentPhase)`
 * -- the namespace `src/content/simulation-message-keys.ts` already declares over
 * `GuardRoster.DeploymentPhase`, with `Unassigned`, `Travelling`, `On Post` and
 * `On Search` already authored. So the status word on every roster row is a
 * string that already shipped, and this reader adds none.
 *
 * **Not `guard-claim`**, which is what the held rows use. That vocabulary
 * answers *which claimant is holding this guard* and its resolution needs both
 * `'on-search'` claimants asked live inside the simulation (ADR 0033 decision
 * 4). This block asks a different and cheaper question -- what is this person
 * doing -- which the roster answers by itself. Using the claim vocabulary here
 * would have meant either a second live resolution per row or this thread
 * guessing, and the phase is what the projection already carries.
 *
 * ## What it caches, and what it must not
 *
 * Nothing, for `HeldGuardsReader`'s reason and more sharply: the ids in it are
 * what a press *dismisses*, and a dismissal destroys an entity. A row surviving
 * one publication too long is a control offering to sack somebody who is already
 * gone -- which the simulation refuses honestly as `dismiss.unknown-staff`,
 * reaching the alerts list. The refusal is what makes the race survivable rather
 * than a reason to cause one.
 */

/**
 * What the panel renders, from one projection reply.
 *
 * Pure, and it decides nothing the simulation decided: the rows are the
 * projection's own window in the projection's own order (ascending entity id,
 * which is the order the roster itself reports), the total is the projection's,
 * and the only things added are two message keys.
 */
export function staffRosterFromProjection(
  view: StaffViewModel,
  labelKeyOf: StaffRoleLabelLookup,
): HudStaffRosterViewModel {
  const staff: HudStaffRosterRowViewModel[] = view.roster.rows.map((row) => {
    const roleLabelKey = labelKeyOf(row.staffRoleId);
    return {
      entityId: row.entityId,
      statusLabelKey: deriveSimulationMessageKey('deployment-phase', row.assignment.deploymentPhase) as LocalizationKey,
      // Spread rather than passed as `undefined`: `exactOptionalPropertyTypes`
      // is on, so "the host names no role" has to be an absent property and not
      // a present one holding nothing.
      ...(roleLabelKey === undefined ? {} : { roleLabelKey }),
    };
  });

  return { hired: view.totals.hired, staff };
}

export class StaffRosterReader {
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
   * **One message**, however many staff are hired.
   *
   * The window is the panel's own row budget rather than the projection's
   * default hundred, exactly as `HeldGuardsReader` names `HELD_GUARD_ROW_LIMIT`:
   * asking for more would build rows nothing can render, twice a second.
   * `totals.hired` still comes back over the whole roster, so the overflow line
   * tells the truth about the prison while the rows tell the truth about the
   * panel.
   *
   * `undefined` while another read is in flight: a caller on a cadence must not
   * queue a second question about a prison it has not heard the answer for once.
   */
  public async read(): Promise<HudStaffRosterViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<StaffViewModel>('hud/staff', { limit: STAFF_ROSTER_ROW_LIMIT });
      if (reply.view === undefined) return undefined;
      return staffRosterFromProjection(reply.view, this.labelKeyOf);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
