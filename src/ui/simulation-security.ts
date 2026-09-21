import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import type { SecurityViewModel } from '../simulation/presentation/security-projection';
import type { HudSecuritySectorRowViewModel, HudSecurityViewModel } from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads what the prison's security sectors are, over the projection channel,
 * and turns it into what the Security panel's first block renders.
 *
 * ## The gap this closes
 *
 * `hud/security` has been catalogued, routed and unread since the read-model
 * layer existed. ADR 0036 says so in as many words at
 * `docs/adr/0036-a-derived-default-security-sector.md:508` -- *"no panel reads
 * `hud/security` at all"* -- and the reachability gate carried that sentence as
 * this id's `UNPAINTED_PROJECTION_IDS` entry. This module is what deletes it.
 *
 * What it costs a player is a specific number rather than a category of thing.
 * `SectorControlState` is `'normal' | 'restricted' | 'lockdown'`, and a sector
 * under lockdown is a sector whose doors refuse everybody below its clearance;
 * nothing in the interface said which state a sector was in, so a prison that
 * had locked itself down looked exactly like one that had not. The staff
 * coverage block one tab over publishes the *summed* requirement and gives no
 * way to tell which sector is short.
 *
 * ## What it narrows away, and why
 *
 * `SecurityViewModel` is the widest of the four read models this section
 * paints. Three things are deliberately left on it:
 *
 * - **`accessPolicy`**, the whole clearance and permission table for every
 *   classification group, staff role and grade. It is a *rule book*, not a
 *   state readout -- it says the same thing in an empty prison and a full one
 *   -- and a panel is the wrong surface for something that never changes.
 * - **`doors`**, per sector, each with a tile. `docs/HUD_PROJECTIONS.md` gaps
 *   10 and 11 record that a tile coordinate does not answer *where is this*,
 *   and a door list that cannot point at a door is a list of ids.
 * - **`patrol.waypoints`**, for the same reason, and `expectedLoopTicks`,
 *   which is a duration in ticks that would need a sentence to mean anything.
 *
 * ## The eleventh translator, and why it is a class
 *
 * It joins the ten outside `src/ui/hud/` for the reason every one of them is
 * there: the HUD imports nothing from `src/simulation/**` (`AGENTS.md`
 * boundary 1, enforced by `tests/unit/ui-hud-messages.test.ts`), so a module
 * that has to know both a projection's shape and a view model sits outside it.
 *
 * A class because the read is a **pull**, correlated by `messageId` (ADR 0003
 * decision 2), so this holds the requester that asks. The mapping is a pure
 * function -- `securityFromProjection` -- so what the panel is told can be
 * proven with no worker, no channel and no DOM.
 */
export function securityFromProjection(view: SecurityViewModel): HudSecurityViewModel {
  const sectors: HudSecuritySectorRowViewModel[] = view.sectors.map((sector) => ({
    sectorId: sector.sectorId,
    // Derived, never hand-authored (ADR 0011). The grade's own `nameKey` is
    // content and arrives on the projection; the control state is an enum and
    // its word is derived from the namespace `simulation-message-keys.ts`
    // declares for `src/simulation/security/sector.ts`.
    ...(sector.gradeNameKey === undefined ? {} : { gradeLabelKey: sector.gradeNameKey }),
    controlStateLabelKey: deriveSimulationMessageKey('sector-control-state', sector.controlState),
    underLockdown: sector.controlState === 'lockdown',
    required: sector.staffing.required,
    assigned: sector.staffing.assigned,
    shortage: sector.staffing.shortage,
    openIncidentCount: sector.openIncidentCount,
  }));

  return {
    sectors,
    // Carried straight through, never recounted here: `projectSecurity` sums
    // the same fields in the same pass that builds the rows, and a second
    // count on this thread would be a second definition of "how many sectors
    // are locked down" that disagrees with the first the day the projection's
    // own rule moves.
    sectorsUnderLockdown: view.totals.sectorsUnderLockdown,
    sectorsRestricted: view.totals.sectorsRestricted,
    shortage: view.totals.shortage,
  };
}

export class SecurityReader {
  private readonly requester: SimulationProjectionRequester;
  /** True while a `read()` is in flight, so a cadence cannot stack requests. */
  private reading = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * **One message with no window on it**, whatever the prison holds.
   *
   * `hud/security` is declared `paged: false`, and the worker refuses
   * `offset`/`limit` on a projection that has no list rather than ignoring them
   * -- so a window here would be an `invalid-payload` and a readout that never
   * paints. It needs none: a session derives exactly one sector
   * (`applyDefaultSecuritySector`), and the registry is a closed list rather
   * than a population.
   *
   * `undefined` while another read is in flight, exactly as every other reader
   * on this channel answers.
   */
  public async read(): Promise<HudSecurityViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<SecurityViewModel>('hud/security');
      if (reply.view === undefined) return undefined;
      return securityFromProjection(reply.view);
    } finally {
      this.reading = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
