import { deriveSimulationMessageKey } from '../content/simulation-message-keys';
import {
  INCIDENT_PROPERTY_DAMAGE_MAX,
  INCIDENT_SEVERITY_MAX,
  type IncidentDetailViewModel,
  type IncidentRowViewModel,
  type IncidentsViewModel,
} from '../simulation/presentation/incident-projection';
import type { HudIncidentDetailViewModel, HudIncidentRowViewModel, HudIncidentsViewModel } from './hud';
import {
  SimulationProjectionRequester,
  type ProjectionMessageChannel,
  type ProjectionRequesterOptions,
} from './simulation-projections';

/**
 * Reads what has gone wrong in the prison, over the projection channel, and
 * turns it into what the Security panel's incidents block renders.
 *
 * ## The gap this closes, and why it is two ids in one module
 *
 * `hud/incidents` and `hud/incident-detail` were both unread, and the
 * reachability gate's entry for the detail route named the list route as its
 * blocker in as many words: *"it waits on the LIST half rather than on a
 * selection model ... there is no row for a player to press."* So one module
 * reads both, exactly as `simulation-room-needs.ts` reads `hud/room-list` and
 * `hud/room-detail`, because splitting them would make the second module's
 * whole subject a row the first one produced.
 *
 * What sat behind them is the consequence chain #450 built and nothing
 * surfaced. `IncidentLog` records an assault, an escape attempt, a gang
 * retaliation or a riot; the response system dispatches guards to it; the
 * outcome writes injuries, property damage and, for an escape, whether it
 * succeeded. The only thing that had ever reached a player was
 * `activeIncidents`, one integer on one stat tile -- so a prison in which four
 * separate assaults had been lapsed for want of responders reported the same
 * number as one in which four were being handled.
 *
 * ## The shape of the request, which is the decision in this file
 *
 * `IncidentsViewModel` has exactly one paged list, `resolved`, and its rows are
 * ascending incident id -- **oldest first**. Showing the first four terminal
 * incidents of a long session shows the four a player has least reason to look
 * at, and showing the last four needs the total before the request that would
 * use it. So this asks with `limit: 0`: the projection builds no terminal rows
 * at all, `summary` and `countsByType` arrive whole, and what the block renders
 * is the open incidents -- which `IncidentLog` indexes and the projection does
 * not window -- and the per-type counts.
 *
 * `HudIncidentsViewModel`'s own docblock states what that costs and where the
 * fix would have to live.
 */

/**
 * One incident, in the two forms the panel renders it.
 *
 * Shared between the list and the inspector for the reason `formatPrisonerName`
 * is shared between the roster row and its detail: the detail is the same
 * incident read again, and two mappings would be two ways of saying that an
 * incident is a riot.
 */
function incidentRowFromProjection(row: IncidentRowViewModel): HudIncidentRowViewModel {
  return {
    incidentId: row.incidentId,
    // Derived, never hand-authored (ADR 0011): both namespaces are declared in
    // `simulation-message-keys.ts` against `src/simulation/incidents/incident.ts`.
    typeLabelKey: deriveSimulationMessageKey('incident-type', row.type),
    stateLabelKey: deriveSimulationMessageKey('incident-state', row.state),
    sectorId: row.sectorId,
    severity: row.severity,
    // The scale's own ceiling, carried across rather than written into the
    // panel: `incident.ts` documents `0-10` and `INCIDENT_SEVERITY_MAX` is
    // where that is declared, so a sentence reading "severity 8 of 10" is true
    // by construction and stays true if the scale ever moves. The HUD may not
    // import `src/simulation/**` (`AGENTS.md` boundary 1) and this module may.
    severityMax: INCIDENT_SEVERITY_MAX,
    participantCount: row.participantCount,
    terminal: row.terminal,
  };
}

export function incidentsFromProjection(view: IncidentsViewModel): HudIncidentsViewModel {
  return {
    open: view.active.map(incidentRowFromProjection),
    total: view.summary.total,
    stillOpen: view.summary.stillOpen,
    resolved: view.summary.resolved,
    lapsed: view.summary.lapsed,
    injured: view.summary.totalInjured,
    escapes: view.summary.escapes,
    byType: view.countsByType
      // A kind nothing has produced is dropped rather than drawn as a zero --
      // `HudIncidentsViewModel.byType` carries the reason, which is
      // `intakePipelineFromProjection`'s about its six stages.
      .filter((entry) => entry.count > 0)
      .map((entry) => ({ typeLabelKey: deriveSimulationMessageKey('incident-type', entry.type), count: entry.count })),
  };
}

export function incidentDetailFromProjection(view: IncidentDetailViewModel): HudIncidentDetailViewModel {
  return {
    ...incidentRowFromProjection(view),
    timeline: view.timeline.map((entry) => ({
      stateLabelKey: deriveSimulationMessageKey('incident-state', entry.state),
      atTick: entry.atTick,
    })),
    // `outcome` is absent while the incident is still open, and an open
    // incident has hurt nobody *yet* -- which is a different fact from "the
    // outcome recorded no injuries" and renders identically. The block says
    // which by drawing the outcome line only for a terminal incident.
    injuredCount: view.outcome?.injuredCount ?? 0,
    propertyDamage: view.outcome?.propertyDamage ?? 0,
    propertyDamageMax: INCIDENT_PROPERTY_DAMAGE_MAX,
    escaped: view.outcome?.escaped ?? false,
    ...(view.requiredResponders === undefined ? {} : { requiredResponders: view.requiredResponders }),
  };
}

/**
 * What the worker answered about one incident.
 *
 * `'gone'` is the worker saying there is no such incident, which is a fact
 * about the prison and not about this thread -- the same three-way answer
 * `PrisonerDetailReader` gives, and for the same reason: a panel that cannot
 * tell "the request failed" from "that incident does not exist" either keeps a
 * dead selection for ever or drops a live one on a dropped message.
 *
 * `IncidentLog` never deletes a record, so `'gone'` is reachable only for an id
 * that was never minted. It is still declared, because the alternative is a
 * panel that would paint nothing and say nothing if it ever happened.
 */
export type IncidentDetailAnswer = HudIncidentDetailViewModel | 'gone' | undefined;

export class IncidentsReader {
  private readonly requester: SimulationProjectionRequester;
  private reading = false;
  private readingDetail = false;

  public constructor(channel: ProjectionMessageChannel, options: ProjectionRequesterOptions = {}) {
    this.requester = new SimulationProjectionRequester(channel, options);
  }

  /**
   * The list, with **no terminal rows asked for** -- see this module's header.
   *
   * `limit: 0` rather than an absent window: `hud/incidents` is declared
   * `paged: true`, so the window is legal, and `resolvePageRequest` defaults an
   * absent `limit` to `DEFAULT_VIEW_MODEL_PAGE_LIMIT` rows this panel would
   * build and never render.
   */
  public async read(): Promise<HudIncidentsViewModel | undefined> {
    if (this.reading) return undefined;
    this.reading = true;
    try {
      const reply = await this.requester.request<IncidentsViewModel>('hud/incidents', { limit: 0 });
      if (reply.view === undefined) return undefined;
      return incidentsFromProjection(reply.view);
    } finally {
      this.reading = false;
    }
  }

  /**
   * One incident, by the id the player pressed.
   *
   * A separate in-flight flag from `read()`'s, because the two are different
   * questions about different things and a list refresh must not silence the
   * inspector's -- the arrangement `RoomNeedsReader` uses for its own pair.
   */
  public async readDetail(incidentId: string): Promise<IncidentDetailAnswer> {
    if (this.readingDetail) return undefined;
    this.readingDetail = true;
    try {
      const reply = await this.requester.request<IncidentDetailViewModel>('hud/incident-detail', {
        target: { kind: 'id', id: incidentId },
      });
      // The envelope carries no view when the worker found no such incident;
      // `projectIncidentDetail` returns `undefined` for an unknown id and the
      // catalog entry sends `{}`. That is the prison's answer, not a failure.
      if (reply.view === undefined) return 'gone';
      return incidentDetailFromProjection(reply.view);
    } finally {
      this.readingDetail = false;
    }
  }

  /** Fails every request still in flight. For a page or a session that is going away. */
  public dispose(): void {
    this.requester.dispose();
  }
}
