import type { EntityId } from '../entity/entity-store';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import { resolveStaffRouteContext } from '../security/access-policy';
import type { GuardRoster } from '../security/guard-roster';
import type { SecuritySectorRegistry } from '../security/sector';
import type { TilePosition } from '../world/coordinates';
import type { IncidentRecord, IncidentOutcome } from './incident';
import { IncidentLog } from './incident';

export interface IncidentResponsePolicy {
  /** Guards required per severity point, rounded up -- a severity-8 riot pulls far more staff than a severity-2 scuffle. */
  readonly respondersPerSeverityPoint: number;
  /** Ticks after `startedAtTick` by which responders must have *arrived*, or the incident lapses with an un-contained outcome. */
  readonly responseDeadlineTicks: number;
  /** Ticks an arrived response takes to contain the incident. */
  readonly containmentTicks: number;
  /** Sector control state applied while an incident of at least `lockdownSeverityThreshold` is open. */
  readonly lockdownSeverityThreshold: number;
}

export const DEFAULT_INCIDENT_RESPONSE_POLICY: IncidentResponsePolicy = {
  respondersPerSeverityPoint: 0.5,
  responseDeadlineTicks: 600,
  containmentTicks: 60,
  lockdownSeverityThreshold: 6,
};

export interface IncidentResponseMetrics {
  readonly incidentsResolved: number;
  readonly incidentsLapsed: number;
  readonly respondersDispatched: number;
  readonly routeFailures: number;
}

interface ResponseRecord {
  readonly incidentId: string;
  readonly guardIds: readonly EntityId[];
  pathRequestIdsByGuard: Map<EntityId, string>;
  arrivedGuardIds: Set<EntityId>;
  containmentStartedAtTick: number | undefined;
  lockdownApplied: boolean;
  /**
   * Whether this record has issued its travel requests against the *current*
   * `NavigationSystem` instance. Not persisted, and deliberately so: a request
   * id names a slot in a queue that a restored session never received, so a
   * restored record starts `false` and re-issues on its first scheduled
   * update. `SearchSystem`'s `travelInFlight` is the same field for the same
   * reason.
   */
  travelIssued: boolean;
}

/**
 * One in-flight response, as a save carries it. The live record's
 * `pathRequestIdsByGuard` is absent (see `travelIssued`) and `travelIssued`
 * itself is absent (it is a statement about the live navigation instance, not
 * about the response), so what remains is exactly what `releaseResponse`
 * needs in order to return what the response claimed.
 */
export interface EncodedIncidentResponse {
  readonly guardIds: readonly EntityId[];
  readonly arrivedGuardIds: readonly EntityId[];
  readonly containmentStartedAtTick?: number;
  readonly lockdownApplied: boolean;
}

function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Issue #28's response half: dispatches real guards, moves them through
 * the real `NavigationSystem` (never teleporting into an incident), drives
 * the incident's validated lifecycle, applies a real `'lockdown'` control
 * state through #26's `SecuritySectorRegistry` (which cascades onto #21's
 * `DoorRegistry`), and produces a *worse but consistent* outcome when the
 * response is too slow or too thin -- "failed/late response produces
 * consistent outcomes rather than hidden success."
 *
 * Guards are claimed from `GuardRoster.unassignedGuardIds()`, the same
 * finite shared pool `DeploymentSystem` and #27's `SearchSystem` draw
 * from, so emergency response is a real staffing diversion. Like search
 * duty, a responding guard sits in the `'on-search'` phase -- neither
 * `DeploymentSystem` nor `PatrolSystem` acts on that phase, so no changes
 * to either were needed here (see `docs/CONTRABAND.md`'s note).
 */
export class IncidentResponseSystem implements SystemRegistration {
  public readonly id = 'incidents.response';
  public readonly order = 295;
  public readonly schedule = { intervalTicks: 10, phaseTicks: 0 };

  private readonly responses = new Map<string, ResponseRecord>();
  private requestSequence = 0;
  private incidentsResolved = 0;
  private incidentsLapsed = 0;
  private respondersDispatched = 0;
  private routeFailures = 0;

  public constructor(
    private readonly incidents: IncidentLog,
    private readonly sectors: SecuritySectorRegistry,
    private readonly guards: GuardRoster,
    private readonly navigation: NavigationSystem,
    private readonly policy: IncidentResponsePolicy = DEFAULT_INCIDENT_RESPONSE_POLICY,
    /**
     * Responders route with `emergencyOverride` -- #21's `checkDoorAccess`
     * treats `'locked'` as an absolute block short of exactly this flag,
     * and this system's own lockdown locks every door in the incident's
     * sector. Without the override, dispatching a lockdown would seal
     * responders *out* of the incident they were sent to contain, and
     * every severe incident would lapse (a real bug this system's tests
     * caught before it shipped). The override bypasses `'locked'` only --
     * clearance and permission requirements still apply, so a responder
     * still cannot enter somewhere their role was never cleared for.
     */
    private readonly routeContextResolver: (staffRoleId: string) => RouteContext = (staffRoleId) => resolveStaffRouteContext(staffRoleId, { emergencyOverride: true }),
  ) {}

  public getMetrics(): IncidentResponseMetrics {
    return { incidentsResolved: this.incidentsResolved, incidentsLapsed: this.incidentsLapsed, respondersDispatched: this.respondersDispatched, routeFailures: this.routeFailures };
  }

  public requiredResponderCount(severity: number): number {
    return Math.max(1, Math.ceil(severity * this.policy.respondersPerSeverityPoint));
  }

  public update(context: SimulationContext): void {
    for (const incident of this.incidents.openIncidents()) {
      if (incident.state === 'active') this.tryDispatch(incident, context.tick);
      else this.advanceResponse(incident, context.tick);
    }
  }

  private incidentTile(incident: IncidentRecord): TilePosition {
    return this.sectors.requireDefinition(incident.sectorId).postTile;
  }

  private tryDispatch(incident: IncidentRecord, tick: number): void {
    if (this.isPastDeadline(incident, tick)) {
      this.lapse(incident, tick);
      return;
    }

    const required = this.requiredResponderCount(incident.severity);
    const available = this.guards.unassignedGuardIds();
    if (available.length < required) return; // observable understaffing -- incident keeps running until its deadline

    const guardIds = available.slice(0, required);
    for (const guardId of guardIds) this.guards.setDeploymentPhase(guardId, 'on-search');
    this.respondersDispatched += guardIds.length;

    const record: ResponseRecord = { incidentId: incident.id, guardIds, pathRequestIdsByGuard: new Map(), arrivedGuardIds: new Set(), containmentStartedAtTick: undefined, lockdownApplied: false, travelIssued: false };

    if (incident.severity >= this.policy.lockdownSeverityThreshold) {
      this.sectors.setControlState(incident.sectorId, 'lockdown');
      record.lockdownApplied = true;
    }

    this.beginTravelToIncident(record, incident, tick);

    this.responses.set(incident.id, record);
    this.incidents.transition(incident.id, 'notified', tick);
  }

  /**
   * Routes every responder that has not already arrived to the incident's
   * post tile, and marks the record as having live requests.
   *
   * Called at dispatch and again on the first scheduled update after a
   * restore, which is what makes the second call the whole cost of a restore
   * for a response that was mid-travel: the requests a save cannot carry are
   * re-issued rather than reconstructed. A responder already standing on the
   * destination needs no request and is counted as arrived immediately -- the
   * same `sameTile` short-circuit `SearchSystem.beginTravelToCurrentTarget`
   * makes, which is why a restored `'responding'` response re-issues nothing.
   */
  private beginTravelToIncident(record: ResponseRecord, incident: IncidentRecord, tick: number): void {
    const destination = this.incidentTile(incident);
    for (const guardId of record.guardIds) {
      if (record.arrivedGuardIds.has(guardId)) continue;
      const currentTile = this.guards.getTile(guardId);
      if (sameTile(currentTile, destination)) {
        record.arrivedGuardIds.add(guardId);
        continue;
      }
      this.requestSequence += 1;
      const requestId = `incidents.respond.${incident.id}.${guardId}.${this.requestSequence}`;
      this.navigation.requestRoute(requestId, currentTile, destination, this.routeContextResolver(this.guards.getStaffRoleId(guardId)), 2, tick);
      record.pathRequestIdsByGuard.set(guardId, requestId);
    }
    record.travelIssued = true;
  }

  private isPastDeadline(incident: IncidentRecord, tick: number): boolean {
    return tick - incident.startedAtTick > this.policy.responseDeadlineTicks;
  }

  /** A lapsed incident is materially worse than a contained one: every participant is injured and property damage scales with severity. */
  private lapse(incident: IncidentRecord, tick: number): void {
    const outcome: IncidentOutcome = {
      injuredEntityIds: [...incident.participantIds].sort((a, b) => a - b),
      propertyDamage: Math.min(10, incident.severity),
      escaped: incident.type === 'escape-attempt',
    };
    this.releaseResponse(incident.id, incident.sectorId);
    this.incidents.transition(incident.id, 'lapsed', tick, outcome);
    this.incidentsLapsed += 1;
  }

  private releaseResponse(incidentId: string, sectorId: string): void {
    const record = this.responses.get(incidentId);
    if (record === undefined) return;
    for (const guardId of record.guardIds) this.guards.unassign(guardId);
    if (record.lockdownApplied && this.incidents.openIncidentsInSector(sectorId).every((open) => open.id === incidentId)) {
      this.sectors.setControlState(sectorId, 'normal');
    }
    this.responses.delete(incidentId);
  }

  private advanceResponse(incident: IncidentRecord, tick: number): void {
    const record = this.responses.get(incident.id);
    if (record === undefined) {
      // An open incident with no response record at all. Since V6 a save carries
      // the record (see `getSnapshot`), so this is no longer the restore path it
      // used to be -- it is the residual case of a payload that names a notified
      // incident and no response for it, which the V5 -> V6 migration produces
      // only when it cannot attribute responders (see `save-migrations.ts`).
      // Re-dispatch from 'notified' is impossible because the lifecycle is
      // forward-only, so the deadline decides: the incident lapses rather than
      // silently resolving, which is issue #28's consistent-failure outcome.
      // Nothing is stranded by this path -- with no record there is nothing the
      // response ever claimed.
      if (this.isPastDeadline(incident, tick)) this.lapse(incident, tick);
      return;
    }

    if (incident.state === 'notified') {
      if (!record.travelIssued) this.beginTravelToIncident(record, incident, tick);

      const destination = this.incidentTile(incident);
      for (const guardId of record.guardIds) {
        const requestId = record.pathRequestIdsByGuard.get(guardId);
        if (requestId === undefined) continue;
        const outcome = this.navigation.getResult(requestId);
        if (outcome === undefined) continue;
        this.navigation.clearResult(requestId);
        record.pathRequestIdsByGuard.delete(guardId);
        if (!outcome.result.ok) {
          this.routeFailures += 1;
          continue; // this responder never makes it; the incident may still lapse below
        }
        this.guards.setTile(guardId, destination);
        record.arrivedGuardIds.add(guardId);
      }

      if (record.arrivedGuardIds.size >= this.requiredResponderCount(incident.severity)) {
        record.containmentStartedAtTick = tick;
        this.incidents.transition(incident.id, 'responding', tick);
        return;
      }
      if (this.isPastDeadline(incident, tick)) this.lapse(incident, tick);
      return;
    }

    // incident.state === 'responding'
    const startedAt = record.containmentStartedAtTick ?? tick;
    if (tick - startedAt < this.policy.containmentTicks) return;

    const outcome: IncidentOutcome = {
      injuredEntityIds: [],
      propertyDamage: Math.min(10, Math.floor(incident.severity / 2)),
      escaped: false,
    };
    this.releaseResponse(incident.id, incident.sectorId);
    this.incidents.transition(incident.id, 'resolved', tick, outcome);
    this.incidentsResolved += 1;
  }

  /**
   * Metrics **and every in-flight response** (save schema V6, issue #352).
   *
   * Emitting metrics alone was a silent resource leak rather than the bounded
   * loss its predecessor's docstring described. The record this map holds is
   * what `releaseResponse` reads in order to *return* what the response
   * claimed -- the responders and the sector lockdown -- and both of those are
   * themselves persisted (`deploymentPhase: 'on-search'` in the guard roster,
   * `sectorControlStates` in the security section). Dropping only the
   * attribution therefore did not undo the claim; it made it permanent, with
   * no code path left in `src/` able to reverse it.
   *
   * Responses are emitted sorted by incident id, never `Map` insertion order,
   * for the reason `SearchSystem.activeJobsInCanonicalOrder` states: insertion
   * order is a property of this instance's history, and a payload that carries
   * history rather than state does not round-trip. `arrivedGuardIds` is sorted
   * for the same reason -- a `Set` iterates in insertion order, which here is
   * the order routes happened to resolve in.
   */
  public getSnapshot(): {
    readonly metrics: IncidentResponseMetrics;
    readonly responses: readonly (readonly [string, EncodedIncidentResponse])[];
  } {
    return {
      metrics: this.getMetrics(),
      responses: [...this.responses.keys()].sort().map((incidentId) => {
        const record = this.responses.get(incidentId)!;
        return [
          incidentId,
          {
            guardIds: [...record.guardIds],
            arrivedGuardIds: [...record.arrivedGuardIds].sort((a, b) => a - b),
            ...(record.containmentStartedAtTick === undefined ? {} : { containmentStartedAtTick: record.containmentStartedAtTick }),
            lockdownApplied: record.lockdownApplied,
          },
        ] as const;
      }),
    };
  }

  /**
   * Restores the response bookkeeping, minus the one part of it a save cannot
   * carry: the path requests. Those named slots in the *previous*
   * `NavigationSystem` instance's queue, which a fresh one never received and
   * would never resolve, so `travelIssued` starts `false` and the first
   * scheduled `advanceResponse` re-issues them -- the same "restart the leg,
   * keep the job" convention `SearchSystem.loadSnapshot`, `JobBoard` and
   * `GuardRoster` all follow.
   *
   * The cost of that restart is one `IncidentResponseSystem` interval on a
   * response saved mid-travel, and nothing at all on one saved after its
   * responders arrived (`containmentStartedAtTick` is carried, so containment
   * neither restarts nor double-counts, and a responder already on the post
   * tile issues no request). Measured and pinned by
   * `tests/integration/incident-response-restore.test.ts`.
   */
  public loadSnapshot(snapshot: ReturnType<IncidentResponseSystem['getSnapshot']>): void {
    this.responses.clear();
    for (const [incidentId, response] of snapshot.responses) {
      this.responses.set(incidentId, {
        incidentId,
        guardIds: [...response.guardIds],
        pathRequestIdsByGuard: new Map(),
        arrivedGuardIds: new Set(response.arrivedGuardIds),
        containmentStartedAtTick: response.containmentStartedAtTick,
        lockdownApplied: response.lockdownApplied,
        travelIssued: false,
      });
    }
    this.incidentsResolved = snapshot.metrics.incidentsResolved;
    this.incidentsLapsed = snapshot.metrics.incidentsLapsed;
    this.respondersDispatched = snapshot.metrics.respondersDispatched;
    this.routeFailures = snapshot.metrics.routeFailures;
  }
}
