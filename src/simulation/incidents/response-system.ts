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
    /**
     * The guards some *other* system is holding on the shared `'on-search'`
     * deployment phase, read live rather than passed as a set.
     *
     * This is the one fact `releaseOrphanedClaims` cannot derive from the
     * state this system owns, and it is what makes the rule below sound:
     * exactly two things in `src/` ever set `'on-search'` -- this system and
     * `SearchSystem` (`grep -rn "setDeploymentPhase(" src/`) -- so an
     * `'on-search'` guard this resolver does not name and no live response
     * record claims was a responder. `SearchSystem` is the resolver
     * `new-session.ts` supplies;
     * `tests/integration/incident-response-restore.test.ts` pins the premise
     * behaviourally and
     * `tests/foundation/deployment-phase-producer-contract.test.ts` fails if a
     * third producer of the phase appears.
     *
     * **Live, not captured**, and that is a correctness requirement rather
     * than a style: the sweep runs on this system's first scheduled update
     * after a restore, and `SearchSystem` (order 290) updates *before* this
     * system (order 295) on that very tick. A queued search order staffed in
     * that earlier pass claims guards onto `'on-search'` after the restore and
     * before the sweep, and a set captured at load time would not name them.
     *
     * Defaults to naming nobody, which is correct for a system constructed
     * without a session: with no `SearchSystem` in the graph there is no other
     * producer of the phase.
     */
    private readonly guardsClaimedByOtherSystems: () => readonly EntityId[] = () => [],
  ) {}

  /**
   * Set by `loadSnapshot`, cleared by the first `update` after it: the
   * restore-time reconciliation issue #352 needs, owed once per restore.
   *
   * A flag consumed on the first update, never a comparison against the tick
   * the save was taken at. `ProcurementSystem.update` states the trap that
   * makes the difference: a restored session resumes at the save's tick and a
   * scheduled system does not run on every tick, so the restore tick itself
   * can be stepped straight over. This system's cadence is 10 ticks, so a save
   * taken at tick 71 is reconciled at tick 80 and a save taken at tick 80 is
   * reconciled at tick 80 -- in both cases on the first update that happens,
   * never silently never.
   */
  private orphanedClaimSweepPending = false;

  public getMetrics(): IncidentResponseMetrics {
    return { incidentsResolved: this.incidentsResolved, incidentsLapsed: this.incidentsLapsed, respondersDispatched: this.respondersDispatched, routeFailures: this.routeFailures };
  }

  public requiredResponderCount(severity: number): number {
    return Math.max(1, Math.ceil(severity * this.policy.respondersPerSeverityPoint));
  }

  public update(context: SimulationContext): void {
    // Before the incident pass, so responders this sweep hands back are in the
    // unassigned pool in time for `tryDispatch` to send them to an incident
    // that is still `'active'` on this same tick.
    //
    // Release first, then dispatch anew, and the order is load-bearing twice
    // over: ADR 0033 decision 1's release is what refills the pool the
    // re-dispatch draws from, and it is also the decision that stays -- the
    // interrupted response is abandoned, and what follows is a *new* response
    // rather than a resumption of it. Both steps are owed by the one flag
    // `loadSnapshot` sets, so both happen exactly once per restore, on the same
    // scheduled update, at a tick the kernel drove.
    if (this.orphanedClaimSweepPending) {
      this.orphanedClaimSweepPending = false;
      this.releaseOrphanedClaims();
      this.redispatchInterruptedResponses(context.tick);
    }

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

    const guardIds = this.claimableResponders(incident);
    if (guardIds === undefined) return; // observable understaffing -- incident keeps running until its deadline

    this.mountResponse(incident, guardIds, tick);
    this.incidents.transition(incident.id, 'notified', tick);
  }

  /**
   * The `required` lowest-id unassigned guards, or `undefined` when the pool
   * cannot fill the response.
   *
   * Split out of `tryDispatch` so that `redispatchInterruptedResponses` claims
   * responders by exactly the same rule -- ascending entity id, from the same
   * finite shared pool `DeploymentSystem` and `SearchSystem` draw from. A second
   * selection rule for the re-dispatch path would be a second thing to keep
   * deterministic.
   */
  private claimableResponders(incident: IncidentRecord): readonly EntityId[] | undefined {
    const required = this.requiredResponderCount(incident.severity);
    const available = this.guards.unassignedGuardIds();
    if (available.length < required) return undefined;
    return available.slice(0, required);
  }

  /**
   * Claims `guardIds`, applies the lockdown the severity calls for, routes
   * whoever is not already there, and records the response.
   *
   * **It performs no lifecycle transition**, and that is the whole reason it is
   * a method rather than the body of `tryDispatch`. Dispatching and *notifying*
   * are two things, and only the first of them is available for an incident
   * that is already past `'active'` -- which is the obstacle ADR 0033's open
   * question 1 names ("re-dispatching means creating a record for an incident in
   * a state `tryDispatch` never sees"). Separating the claim from the transition
   * is the whole of what that question needed: the claim is legal from any open
   * state, the transition is not, and `IncidentLog.transition` rejects an
   * illegal one rather than being asked to allow it. The forward-only lifecycle
   * is untouched and `LEGAL_TRANSITIONS` is not widened by a single edge.
   *
   * `containmentStartedAtTick` is set here for an incident already
   * `'responding'`, and that is the restarted containment timer ADR 0033's open
   * question 1 prices. It is set rather than left `undefined` because
   * `advanceResponse`'s `'responding'` branch reads
   * `record.containmentStartedAtTick ?? tick` into a *local* -- an undefined
   * field is re-defaulted to the current tick on every update and the elapsed
   * check can therefore never pass, so a record without it would hold the
   * incident open for ever instead of restarting its clock.
   */
  private mountResponse(incident: IncidentRecord, guardIds: readonly EntityId[], tick: number): void {
    for (const guardId of guardIds) this.guards.setDeploymentPhase(guardId, 'on-search');
    this.respondersDispatched += guardIds.length;

    const record: ResponseRecord = { incidentId: incident.id, guardIds, pathRequestIdsByGuard: new Map(), arrivedGuardIds: new Set(), containmentStartedAtTick: undefined, lockdownApplied: false };

    if (incident.severity >= this.policy.lockdownSeverityThreshold) {
      this.sectors.setControlState(incident.sectorId, 'lockdown');
      record.lockdownApplied = true;
    }

    const destination = this.incidentTile(incident);
    for (const guardId of guardIds) {
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

    if (incident.state === 'responding') record.containmentStartedAtTick = tick;

    this.responses.set(incident.id, record);
  }

  /**
   * Mounts a **fresh** response to every still-open incident whose response a
   * save interrupted -- ADR 0033 open question 1, built.
   *
   * Runs immediately after `releaseOrphanedClaims`, on the same update, and the
   * order is the semantics: 0033 decision 1 stands, the interrupted response
   * really is abandoned and everything it held really is handed back, and only
   * then is a new response mounted out of the pool the release refilled. There
   * is no resumption anywhere in here and nothing guesses which incident a
   * restored responder served -- which is the guess 0033 open question 2
   * declines to make and this path still does not have to make.
   *
   * What it recovers is the *outcome*. 0033 measured the cost of abandoning one
   * on #352's own reproduction: the riot lapsed with `injuredEntityIds: [1,2,3]`
   * and `propertyDamage: 8` where a continuous run resolved it with `[]` and
   * `4`. A fresh response reaches the continuous run's outcome instead, and the
   * price is the one that question named -- a containment timer that restarts --
   * plus two costs it did not, both measured in
   * `tests/integration/incident-response-restore.test.ts`: the responders are
   * committed again rather than idle from the sweep onward, so they come back
   * when the *new* response closes rather than one interval after the load; and
   * `respondersDispatched` counts the second dispatch, because a second dispatch
   * is what happened.
   *
   * Three conditions, each of them a refusal to invent something:
   *
   * - **An `'active'` incident is skipped**, because `tryDispatch` owns it and
   *   runs on this very update, a few lines below. Dispatching here as well
   *   would double-claim.
   * - **An incident past its deadline is skipped**, so the deadline still
   *   decides. `responseDeadlineTicks` is measured from `startedAtTick`, which
   *   is in the payload, so a save loaded long after the incident began finds it
   *   already too late and lapses on the incident pass exactly as 0033 says.
   * - **An incident whose sector this registry does not hold is skipped.** This
   *   is a restore-path hazard rather than a hypothetical:
   *   `SecuritySectorRegistry.loadSnapshot` skips a sector session setup did not
   *   re-register, and `mountResponse` reaches `requireDefinition` through both
   *   `setControlState` and `incidentTile`, which throws -- out of
   *   `Kernel.step()`. `lapse` already tolerates exactly this case for exactly
   *   this reason (`liftLockdownNoOpenIncidentJustifies` returns silently), and
   *   this path tolerates it the same way instead of turning a tolerated
   *   restore into a crash.
   *
   * And one more for an incident already `'responding'`: every claimed responder
   * must **already be standing on the incident's post tile**. That state asserts
   * that responders arrived, and `advanceResponse`'s `'responding'` branch reads
   * no route results at all -- so a re-mounted response that had to walk
   * somebody in would leave a navigation request nothing ever collects and
   * contain the incident with a responder still in transit. When the pool cannot
   * offer a set that is already there, the incident falls back to 0033's
   * behaviour and lapses. Measured on #352's reproduction: the four guards the
   * sweep just released are the four lowest ids in the pool and are standing on
   * the post tile, so the condition is met rather than merely tested for.
   *
   * Deterministic: `openIncidents()` is sorted by id, `claimableResponders`
   * draws ascending entity id, and nothing here touches an RNG stream.
   */
  private redispatchInterruptedResponses(tick: number): void {
    for (const incident of this.incidents.openIncidents()) {
      if (incident.state === 'active') continue;
      // Empty immediately after `loadSnapshot`, and checked rather than assumed
      // for the reason `releaseOrphanedClaims` checks the same thing: a payload
      // that one day carries response records must narrow this pass instead of
      // being fought by it.
      if (this.responses.has(incident.id)) continue;
      if (this.isPastDeadline(incident, tick)) continue;
      if (this.sectors.getDefinition(incident.sectorId) === undefined) continue;

      const guardIds = this.claimableResponders(incident);
      if (guardIds === undefined) continue;
      if (incident.state === 'responding') {
        const destination = this.incidentTile(incident);
        if (!guardIds.every((guardId) => sameTile(this.guards.getTile(guardId), destination))) continue;
      }

      this.mountResponse(incident, guardIds, tick);
    }
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
    const hadRecord = this.responses.has(incident.id);
    this.releaseResponse(incident.id, incident.sectorId);
    this.incidents.transition(incident.id, 'lapsed', tick, outcome);
    this.incidentsLapsed += 1;

    // The one close `releaseResponse` cannot serve, because there is no record
    // for it to read: an incident whose response was interrupted by a save
    // (issue #352). Its responders were already handed back by
    // `releaseOrphanedClaims`, and the lockdown was deliberately *not* lifted
    // there while this incident still justified one. This transition is where
    // that justification ends, so this is where the lockdown lifts.
    if (!hadRecord) this.liftLockdownNoOpenIncidentJustifies(incident.sectorId);
  }

  /**
   * Whether any incident still open in `sectorId` is severe enough that
   * `tryDispatch` would have locked the sector down for it.
   *
   * Read off `lockdownSeverityThreshold` rather than off a persisted flag,
   * which is what makes `lockdownApplied` recoverable at runtime for an
   * incident a save interrupted: the threshold is policy, the severity is in
   * the payload, and the two together say whether a recorded `'lockdown'`
   * belongs to a response or is residue.
   */
  private openIncidentJustifiesLockdown(sectorId: string): boolean {
    return this.incidents.openIncidentsInSector(sectorId).some((open) => open.severity >= this.policy.lockdownSeverityThreshold);
  }

  /**
   * Lifts `sectorId` out of `'lockdown'` unless an open incident still
   * justifies it.
   *
   * Deliberately **not** `releaseResponse`'s condition, which refuses to lift
   * while *any* other incident is open in the sector regardless of severity.
   * That condition is about a record this system is holding and stays exactly
   * as it was; this one is about a control state no record owns.
   *
   * Silent on a sector the registry does not hold: an incident may name a
   * sector session setup never registered, and `lapse` already runs for such
   * an incident today (`isPastDeadline` is checked before `incidentTile`), so
   * throwing here would turn a tolerated case into a crash.
   */
  private liftLockdownNoOpenIncidentJustifies(sectorId: string): void {
    if (this.sectors.getDefinition(sectorId) === undefined) return;
    if (this.sectors.getControlState(sectorId) !== 'lockdown') return;
    if (this.openIncidentJustifiesLockdown(sectorId)) return;
    this.sectors.setControlState(sectorId, 'normal');
  }

  /**
   * Hands back what a response a save was taken during is still holding, and
   * which no record in this system claims any more (issue #352).
   *
   * A save records a response's two claims -- each responder's `'on-search'`
   * deployment phase, and the incident sector's `'lockdown'` control state --
   * but not the attribution that says they belong together, so a restored
   * session inherits the claims with nothing able to release them. Measured on
   * `origin/main`: four responders and one sector still held 53,000 ticks
   * after the restore, with `GuardRoster.unassign` unreachable for an
   * `'on-search'` guard and no dismiss command in the game.
   *
   * What the payload cannot say is *which* incident each responder served, and
   * this sweep does not need to know: it releases rather than resumes. So the
   * semantics are stated plainly -- **a restored session does not inherit an
   * emergency response; the response is abandoned and its resources are
   * returned** -- and the ambiguity that would make a resumption a guess never
   * arises. The incident itself is untouched and lapses at its own deadline,
   * which is issue #28's consistent-failure outcome rather than a hidden
   * success.
   *
   * Deterministic: ascending guard id (`allGuardIds`) and sector id (`all`),
   * both canonical orders derived from state, and no RNG draw of any kind.
   */
  private releaseOrphanedClaims(): void {
    const claimedElsewhere = new Set(this.guardsClaimedByOtherSystems());
    // Empty immediately after `loadSnapshot`, which clears the map -- and
    // checked rather than assumed, so that a payload which one day *does*
    // carry response records (a save-schema bump this change deliberately does
    // not make) narrows this sweep instead of silently fighting it.
    //
    // Sorted incident ids, not `Map` iteration order: the result is a set and
    // could not observe the difference, but
    // `tests/determinism/canonical-iteration-contract.test.ts` gates the
    // *enumeration* rather than its effect, and correctly -- an exemption here
    // would be one a reviewer had to re-audit every time this loop grew a side
    // effect.
    const claimedByLiveResponse = new Set<EntityId>();
    for (const incidentId of [...this.responses.keys()].sort()) {
      for (const guardId of this.responses.get(incidentId)!.guardIds) claimedByLiveResponse.add(guardId);
    }

    for (const guardId of this.guards.allGuardIds()) {
      if (this.guards.getDeploymentPhase(guardId) !== 'on-search') continue;
      if (claimedElsewhere.has(guardId) || claimedByLiveResponse.has(guardId)) continue;
      this.guards.unassign(guardId);
    }

    for (const sector of this.sectors.all()) {
      if (this.sectors.getControlState(sector.id) !== 'lockdown') continue;
      // Left standing while an open incident still justifies it. A lockdown is
      // a consequence of an incident's severity, not of the responders, so
      // lifting it here would unlock a sector with a severe incident still
      // running in it. `lapse` lifts it when that incident closes.
      if (this.openIncidentJustifiesLockdown(sector.id)) continue;
      this.sectors.setControlState(sector.id, 'normal');
    }
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
      // No live record for an open incident. Since #352 that was the ordinary
      // restore path; since ADR 0033's amendment it is the *residue* of it --
      // `redispatchInterruptedResponses` has already run on this system's first
      // update after the load and mounted a fresh response to every interrupted
      // incident it could, so what reaches this branch is one it could not: the
      // deadline had already passed, the pool could not fill the response, the
      // sector is not registered, or (for an incident already `'responding'`)
      // the responders it could claim were not at the scene.
      //
      // The sentence this comment used to carry -- *"re-dispatch is impossible
      // from here"* -- was the obstacle ADR 0033 open question 1 stated, and it
      // was wrong in one word: re-dispatch is impossible *from `tryDispatch`*,
      // which runs only from `'active'`, and the thing that made it look
      // impossible altogether was that dispatching and notifying were one
      // method. They are two now. The lifecycle is still forward-only and
      // `LEGAL_TRANSITIONS` is unchanged.
      //
      // So the deadline still decides here, and the incident lapses rather than
      // silently resolving (issue #28's consistent-failure outcome). `lapse`
      // lifts the sector's lockdown on the way out.
      if (this.isPastDeadline(incident, tick)) this.lapse(incident, tick);
      return;
    }

    if (incident.state === 'notified') {
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

  public getSnapshot(): { readonly metrics: IncidentResponseMetrics } {
    return { metrics: this.getMetrics() };
  }

  /**
   * Only metrics survive a restore, and the restored session therefore owes a
   * reconciliation, which this schedules (issue #352).
   *
   * Live response bookkeeping references the *previous* `NavigationSystem`
   * instance's request queue, exactly like #25's jobs and #26's guards, so a
   * restored open incident has no active response and is driven by
   * `advanceResponse`'s no-record path above: it lapses at its deadline rather
   * than silently resolving, which is the consistent-failure outcome issue #28
   * requires rather than a hidden success. That much the predecessor of this
   * docstring said, and it was true.
   *
   * What it did not account for is that the discarded record is also what
   * `releaseResponse` reads in order to **return** what the response claimed,
   * and that both claims -- `deploymentPhase: 'on-search'` on each responder,
   * `'lockdown'` on the incident's sector -- are themselves in the payload. So
   * dropping the attribution did not undo the claim; it made it permanent.
   * `releaseOrphanedClaims` is the answer, and it runs on the first scheduled
   * update rather than here: a snapshot load is re-hydration, and the state
   * change it owes belongs on a tick that the kernel drives.
   */
  public loadSnapshot(snapshot: ReturnType<IncidentResponseSystem['getSnapshot']>): void {
    this.responses.clear();
    this.orphanedClaimSweepPending = true;
    this.incidentsResolved = snapshot.metrics.incidentsResolved;
    this.incidentsLapsed = snapshot.metrics.incidentsLapsed;
    this.respondersDispatched = snapshot.metrics.respondersDispatched;
    this.routeFailures = snapshot.metrics.routeFailures;
  }
}
