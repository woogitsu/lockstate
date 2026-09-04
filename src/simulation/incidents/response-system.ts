import type { EntityId } from '../entity/entity-store';
import type { SimulationEventLog } from '../events';
import type { SimulationContext, SystemRegistration } from '../kernel/system';
import type { NavigationSystem } from '../navigation/navigation-system';
import type { RouteContext } from '../navigation/route-context';
import { resolveStaffRouteContext } from '../security/access-policy';
import type { GuardRoster } from '../security/guard-roster';
import { claimableGuardIds } from '../security/post-eligibility';
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
  /**
   * Mutable since ADR 0034: `GuardReleaseService` can take one responder off a
   * response without abandoning it, so the list a record names is no longer
   * fixed for the response's life.
   */
  guardIds: EntityId[];
  pathRequestIdsByGuard: Map<EntityId, string>;
  arrivedGuardIds: Set<EntityId>;
  containmentStartedAtTick: number | undefined;
  lockdownApplied: boolean;
}

function sameTile(a: TilePosition, b: TilePosition): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Who the prison just lost, as the departure itself reports them
 * ([#683](https://github.com/matmaxalez/lockstate/issues/683)).
 *
 * The return of `IncidentResponseSystem`'s `onPrisonerEscaped` port. Carries
 * only the name, because the entity id is already what the caller passed in;
 * absent for a session wired without an identity registry, exactly as
 * `PrisonerRosterRowViewModel.name` is absent for the same session.
 */
export interface EscapedPrisoner {
  readonly name?: { readonly givenName: string; readonly familyName: string };
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
    /**
     * The session's `SimulationEventLog`. Required rather than defaulted, for
     * the reason `IncidentTriggerSystem`'s is: this system owns the only two
     * places an incident becomes terminal, so it is the only thing that can
     * say the prison is calm again, and one constructed without a sink would
     * leave a `'danger'` band standing over a prison that is (#555).
     *
     * Declared before `policy` because TypeScript forbids a required
     * parameter after an optional one; there are three call sites in the
     * repository and each is a reviewed edit.
     */
    private readonly events: SimulationEventLog,
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
    /**
     * What happens to a prisoner who gets out
     * ([ADR 0061](../../../docs/adr/0061-what-the-prison-produces-on-its-own.md)
     * decision 5).
     *
     * `lapse` has always written `escaped: incident.type === 'escape-attempt'`,
     * and until ADR 0061 nothing could produce an `'escape-attempt'`, so the
     * flag had never been true in a running prison. The moment there is a
     * producer it can be -- and a HUD row reading *escaped: yes* beside a
     * prisoner still asleep in their cell is precisely the class of defect
     * `AGENTS.md` reserves to the owner: a promise the code does not keep. So
     * the producer and the departure ship together, and this port is the
     * departure.
     *
     * A narrow injected callback rather than the prisoner runtime, for the
     * reason `DisciplinaryEvidenceSource` is a port one module over:
     * `PrisonerOperationsRuntime` is constructed *before* this system in
     * `new-session.ts`, so a hard dependency would invert the order. Defaults
     * to naming nobody, which is right for a fixture with no prisoner slice.
     *
     * **It answers with who left, and that return value is not a convenience
     * (#683).** The prison now says a sentence naming the escapee, and the
     * name is readable for exactly as long as the prisoner exists:
     * `releasePrisoner` calls `identity.release('prisoner', entityId)` on its
     * way through. So the one piece of code that may read the name is the one
     * that destroys it, and this port is that code. A separate name-resolving
     * port called beside this one would work only while somebody remembered
     * which of the two lines came first -- and would degrade silently to
     * *"Prisoner 3 broke out"* the day they were swapped. Returning it makes
     * the order impossible to get wrong.
     *
     * `undefined` means **nobody left**: `releasePrisoner` answers `false` for
     * an entity that is not a live prisoner, and this system does not say the
     * prison lost somebody it did not lose. An empty object means they left
     * and the session mints no names, which is the case
     * `hud.regime.roster-unnamed` covers for a roster row.
     */
    private readonly onPrisonerEscaped: (entityId: EntityId, tick: number) => EscapedPrisoner | undefined = () => undefined,
    /**
     * What an assault costs the prisoner it was scored against (issue #80,
     * ADR 00XX -- number not yet assigned). Called once, for `'assault'`
     * incidents that carry an `instigatorId`, the moment the incident reaches
     * either terminal state -- `lapse` below and the `'resolved'` branch of
     * `advanceResponse` are the *only* two places an incident becomes
     * terminal, exactly as `onPrisonerEscaped` above is called from both. A
     * riot, a gang-retaliation and an escape-attempt never carry an
     * `instigatorId` (`IncidentTriggerSystem` only ever sets one on an
     * assault), so this is silently a no-op for the other three types rather
     * than a branch this system has to maintain.
     *
     * The same narrow injected-port shape `onPrisonerEscaped` is, for the same
     * reason: `PrisonerOperationsRuntime` is constructed before this system in
     * `new-session.ts`, so a hard dependency would invert that order. Defaults
     * to doing nothing, so a fixture with no prisoner slice -- and every
     * existing test of this system -- is unchanged.
     */
    private readonly onAssaultAdjudicated: (entityId: EntityId, tick: number) => void = () => {},
  ) {}

  /**
   * Says the prison is under control again, if this transition is what made it
   * true (#555).
   *
   * Called from the same two places `adjudicateAssaultIfAny` is, and *after*
   * the `transition` in both, which is what makes the check readable at all:
   * `transition` is the call that drops a terminal incident out of `openIds`,
   * so asking before it would always find at least this one still open.
   *
   * **"All clear", not "that incident ended", and the guard is the whole
   * design.** Two properties fall out of asking `openIncidentCount === 0`
   * rather than emitting per closure. Two incidents that close on the same
   * tick produce one line rather than two, because only the second leaves the
   * count at zero -- which is also the only honest sentence, since after the
   * first the prison is still not calm. And the number of these events is
   * bounded above by the number of openings in any session whatever, so this
   * producer cannot outpace the one in `IncidentTriggerSystem` that it exists
   * to close off.
   *
   * It read *"it is also the only true thing to say after a **lapse**"*, and
   * that is the claim issue #914 measured and this method no longer makes; the
   * section at the end of this docblock carries the numbers. The paragraph as
   * it stood: *"An incident that ran its course was not 'resolved' --
   * participants were injured, and an escape attempt means somebody is gone --
   * but the prison does have nothing open, and that is all this claims. What
   * it cost is `IncidentOutcome`, which the `hud/incidents` projection renders
   * per incident."* The last clause defers to a projection **nothing under
   * `src/ui/` requests** (`tests/foundation/projection-reachability-contract.test.ts`
   * names it in `UNPAINTED_PROJECTION_IDS`), so on the shipped screen the
   * deferral resolved to nothing at all.
   *
   * **That paragraph was true about this method and false about the screen,
   * and the owner ruled on it on 2026-08-31 (#703, ruling 6).** "Nothing is
   * open" is honest; what the player reads is not. The HUD's event band keeps
   * the newest event only, so on a tick where `lapse` recorded an escape and
   * then called this, the escape sentence -- the owner's own approved
   * `hud.alert.event.incidents.escape-succeeded`, *"{name} broke out -- no
   * guard reached them in time."* -- was overwritten in the same tick by a line
   * saying the prison is under control. Measured: written three times, painted
   * zero times. So the paragraph above stands as a claim about
   * `openIncidentCount` and this one scopes it: the count being zero does not
   * make "all clear" the only true thing to *say*, because a sentence competes
   * with whatever shares its tick.
   *
   * `escapeAnnounced` is the gate, and it is the emission rather than the
   * outcome. `lapse` sets `escaped: true` for every escape-attempt it closes,
   * but `onPrisonerEscaped` can answer `undefined` -- nobody actually left --
   * and in that case no sentence was written and there is nothing for the
   * all-clear to overwrite (#683). Gating on `outcome.escaped` would suppress
   * a true all-clear for an escape the prison never announced; gating on the
   * announcement suppresses it exactly when a competing sentence exists.
   *
   * **The suppression is silence, not a substitute sentence.** No wording is
   * invented here: the owner rejected a new "incident closed, the prisoner is
   * gone" line in favour of removing the contradicting one, so this method
   * emits one event fewer rather than a different one. A future route to
   * `escaped: true` that wants its own closing sentence owes the owner that
   * sentence first, exactly as `lapse`'s own comment says of the escape line.
   *
   * ## The two endings say two things now (issue #914's finding 4)
   *
   * **The paragraph above beginning "It is also the only true thing to say
   * after a lapse" is kept and is superseded, in that order, because it is the
   * claim that was measured.**
   * `docs/research/2026-09-04-does-anyone-answer-an-incident.md` played the
   * same prison twice: with six guards, **15 incidents out of 15** ended
   * `'resolved'` with **zero injuries**; with none, **19 out of 19** ended
   * `'lapsed'` with **114 prisoner-injuries and three escapes** -- and both
   * alert columns held the same rows in the same order saying the same
   * sentence. "Nothing is open" was honest about `openIncidentCount` and the
   * screen was not honest about the prison.
   *
   * So `endedByLapse` chooses between two events rather than gating one. It is
   * a parameter and not a field read off the incident for the reason
   * `escapeAnnounced` is one: **this method is called from the two terminal
   * transitions and from nowhere else**, each of which knows which of the two
   * it is by construction, and threading it means the `'resolved'` branch
   * cannot accidentally claim a lapse or the reverse. `lapse` passes `true`
   * and `advanceResponse`'s `'resolved'` branch passes the literal `false`,
   * exactly as it already passes `escapeAnnounced`'s.
   *
   * **What the lapse row may claim is bounded by `lapse` itself**, which
   * writes `injuredEntityIds: [...incident.participantIds]` unconditionally
   * while the `'resolved'` branch writes `[]`. That is why the sentence can
   * assert that everyone caught in it was hurt: the cost is a property of the
   * transition. No count crosses the wire -- see the schema in
   * `src/simulation/protocol/types.ts` for why a figure would need a plural
   * rule this catalogue's HUD localizer does not expose.
   *
   * **Still at most one row per return to calm.** The `openIncidentCount`
   * guard is untouched and runs first, so two incidents closing on the same
   * tick produce one sentence, and it describes the transition that emptied
   * the log. The `escapeAnnounced` gate is untouched too and suppresses either
   * one.
   */
  private reportAllClearIfCalm(tick: number, escapeAnnounced: boolean, endedByLapse: boolean): void {
    if (this.incidents.openIncidentCount > 0) return;
    if (escapeAnnounced) return;
    if (endedByLapse) {
      this.events.recordIncidentsAllClearAfterLapse(tick);
      return;
    }
    this.events.recordIncidentsAllClear(tick);
  }

  /** The one thing both terminal transitions below do identically, so the two call sites cannot drift about which incidents earn a sanction or which participant it lands on. */
  private adjudicateAssaultIfAny(incident: IncidentRecord, tick: number): void {
    if (incident.type !== 'assault' || incident.instigatorId === undefined) return;
    this.onAssaultAdjudicated(incident.instigatorId, tick);
  }

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

  /**
   * The guards this system is currently holding on the `'on-search'` deployment
   * phase ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)).
   *
   * The counterpart of `SearchSystem.claimedGuardIds`, and it exists for the
   * same reason: `'on-search'` is a shared phase with exactly two producers, so
   * neither the release surface nor the read model behind it can tell a
   * responder from a searcher without asking each claimant which guards are its
   * own. Before this method the *other* claimant could be asked and this one
   * could not, which is why `releaseOrphanedClaims` had to define a responder
   * negatively -- "an `'on-search'` guard no search job names" -- rather than
   * positively. That definition stays exactly as it is: it is what makes the
   * sweep able to release a claim whose record the save destroyed, which is
   * precisely the case this method cannot see.
   *
   * So the two are not redundant and the difference is worth stating: this
   * answers *"which guards does a live response record name"*, and
   * `releaseOrphanedClaims` answers *"which `'on-search'` guards does nothing
   * live name at all"*.
   *
   * Deterministic: ascending entity id, over response records enumerated in
   * sorted incident-id order.
   */
  public claimedGuardIds(): readonly EntityId[] {
    const claimed = new Set<EntityId>();
    for (const incidentId of [...this.responses.keys()].sort()) {
      for (const guardId of this.responses.get(incidentId)!.guardIds) claimed.add(guardId);
    }
    return [...claimed].sort((a, b) => a - b);
  }

  /**
   * Takes `guardId` off whatever response holds it, and answers whether one did
   * ([ADR 0034](../../../docs/adr/0034-releasing-a-claimed-guard.md)).
   *
   * **The roster is not touched here** -- `GuardReleaseService` owns that call,
   * for the reason `SearchSystem.releaseGuard` states: unassigning a responder
   * without telling this system would leave the record naming a guard back in
   * the unassigned pool, so `releaseResponse` would later `unassign` a guard
   * some other system had since claimed, and `advanceResponse` would keep
   * counting it toward `arrivedGuardIds`.
   *
   * **A response left with no responders is abandoned, and the incident is
   * left open.** The record is deleted and nothing is transitioned: the incident
   * keeps running and lapses at its own deadline, which is issue #28's
   * consistent-failure outcome and exactly what `advanceResponse`'s no-record
   * path already does for an interrupted response. `lapse` then lifts the
   * lockdown through `liftLockdownNoOpenIncidentJustifies`, the branch ADR 0033
   * added for a record-less incident -- so a player who releases the last
   * responder from a severity-8 riot does not leave the sector dark for ever.
   * That branch is reused rather than duplicated, which is what makes this safe
   * to add.
   *
   * **What it does not do is resolve or lapse the incident early.** A release is
   * a staffing decision, not a verdict on the riot, and a command that closed an
   * incident would be writing an outcome the simulation had not reached.
   *
   * Deterministic: sorted incident ids, no RNG draw.
   */
  /**
   * Gives back the route one responder had in flight, and forgets the id.
   *
   * Both halves, through `NavigationSystem.abandonRequest`: the request may be
   * still queued or already resolved and waiting, and which one it is on any
   * given tick is a race this system cannot win. Dropping the id alone --
   * which is what this line used to be -- leaves the resolved route in the
   * navigation system's result map for the rest of the session, because
   * nothing there expires a result and the queue's aging raises priority
   * rather than evicting. Measured through the real `ReleaseGuardAssignment`
   * command: `incidents.respond.incident-riot.1.2` outlived its guard's
   * release by 500 ticks and every tick after that.
   */
  private abandonRoute(record: ResponseRecord, guardId: EntityId): void {
    const requestId = record.pathRequestIdsByGuard.get(guardId);
    if (requestId !== undefined) this.navigation.abandonRequest(requestId);
    record.pathRequestIdsByGuard.delete(guardId);
  }

  /** The same, for every responder still named by a record that is about to be discarded. */
  private abandonResponseRoutes(record: ResponseRecord): void {
    for (const requestId of record.pathRequestIdsByGuard.values()) this.navigation.abandonRequest(requestId);
    record.pathRequestIdsByGuard.clear();
  }

  public releaseResponder(guardId: EntityId): boolean {
    for (const incidentId of [...this.responses.keys()].sort()) {
      const record = this.responses.get(incidentId)!;
      const index = record.guardIds.indexOf(guardId);
      if (index === -1) continue;
      record.guardIds.splice(index, 1);
      record.arrivedGuardIds.delete(guardId);
      this.abandonRoute(record, guardId);
      if (record.guardIds.length === 0) this.abandonResponseRoutes(record);
      if (record.guardIds.length === 0) this.responses.delete(incidentId);
      return true;
    }
    return false;
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
    /*
     * `claimableGuardIds`, not `unassignedGuardIds()`: answering a riot is a
     * security duty, so only a post-eligible role counts towards `required`
     * (ADR 0053). Before it, a roster of nurses satisfied a severity-7
     * response and the pipeline reported `respondersDispatched: 4` -- which
     * is exactly the "true and meaningless" completion issue #457 warns this
     * issue may be blocking.
     */
    const available = claimableGuardIds(this.guards);
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

    const record: ResponseRecord = { incidentId: incident.id, guardIds: [...guardIds], pathRequestIdsByGuard: new Map(), arrivedGuardIds: new Set(), containmentStartedAtTick: undefined, lockdownApplied: false };

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
      // **This line is the whole of what the player is told, and a sentence
      // depends on it (#683).** `lapse` is the path an incident takes when it
      // times out without sufficient responders, and it is the *only* route to
      // `escaped: true` -- `advanceResponse`'s `'resolved'` branch, the other
      // and only other terminal transition, writes `false`. That is why the
      // owner's approved sentence can assert a cause rather than only a fact:
      // "{name} broke out -- no guard reached them in time."
      // (`hud.alert.event.incidents.escape-succeeded`).
      //
      // **So if a second route to `escaped: true` ever appears -- a tunnel
      // that completes, an escape during a transfer, a resolved response that
      // still loses somebody -- that sentence becomes a claim the code does
      // not keep**, which `AGENTS.md` reserves to the owner. Whoever writes
      // that route owes the owner a new sentence before it ships, not
      // afterwards. Recorded here rather than only in the catalogue because
      // this is the line such a change would be written next to.
      escaped: incident.type === 'escape-attempt',
    };
    const hadRecord = this.responses.has(incident.id);
    this.releaseResponse(incident.id, incident.sectorId);
    this.incidents.transition(incident.id, 'lapsed', tick, outcome);
    this.incidentsLapsed += 1;

    // The one outcome that removes somebody from the prison. After the
    // transition, never before: the record is what says they escaped, and the
    // departure is a consequence of the record rather than a condition of it --
    // so a reader of the log sees a terminal incident naming a participant who
    // has left, exactly as it would for a prisoner discharged the same tick.
    // The participant list is what it is scanned over rather than
    // `injuredEntityIds`: the two are the same list here, and the first is the
    // one that means "was in this incident".
    // Whether this transition actually *told the player* somebody left, which
    // is not the same question as `outcome.escaped` -- see
    // `reportAllClearIfCalm`, which is the only reader.
    let escapeAnnounced = false;
    if (outcome.escaped) {
      for (const entityId of incident.participantIds) {
        // The departure first, then the sentence about it, and the return
        // value is why they are in that order: the escapee's name is readable
        // only until `releasePrisoner` releases it, so the port that performs
        // the departure is what hands it back. An `undefined` answer means
        // nobody actually left and the prison says nothing (#683).
        const escapee = this.onPrisonerEscaped(entityId, tick);
        if (escapee === undefined) continue;
        this.events.recordEscapeSucceeded({ entityId, ...(escapee.name === undefined ? {} : { name: escapee.name }) }, tick);
        escapeAnnounced = true;
      }
    }

    this.adjudicateAssaultIfAny(incident, tick);
    // `true`: this is the lapse, so the row a calm prison gets from here is
    // the one that says the last incident ran out of time rather than the one
    // that says it was contained.
    this.reportAllClearIfCalm(tick, escapeAnnounced, true);

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
    // Before the roster writes, because `unassign` clears the roster's own
    // `pathRequestId` and this record's map is the only other place the id
    // survives; after both, nothing knows what to give back.
    this.abandonResponseRoutes(record);
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
    this.adjudicateAssaultIfAny(incident, tick);
    // `false` and not a variable: this is the `'resolved'` branch, the other
    // and only other terminal transition, and it writes `escaped: false` by
    // construction a few lines above -- so it can never have announced an
    // escape. Written as the literal rather than threaded from a variable so
    // that anyone adding an escape route to this branch has to touch this line
    // to keep it honest, instead of a `false` flowing through unexamined.
    //
    // The second `false` is the same argument about the same line: this branch
    // is a containment, and `injuredEntityIds` a few lines above is `[]`
    // because of it.
    this.reportAllClearIfCalm(tick, false, false);
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
   * restored open incident has no active response and no record of the one it
   * lost.
   *
   * **What this docstring used to say next, kept beside the correction rather
   * than overwritten:** *"it is driven by `advanceResponse`'s no-record path
   * above: it lapses at its deadline rather than silently resolving, which is
   * the consistent-failure outcome issue #28 requires rather than a hidden
   * success."* That was true of the predecessor of this docstring and it stayed
   * true of ADR 0033's first four decisions, and it is **no longer the ordinary
   * restore outcome.** ADR 0033's amendment (its open question 1, built) has
   * the same update that runs the sweep mount a *fresh* response to every
   * still-open incident no record claims, so a restored session reaches the
   * continuous run's own outcome -- measured on issue #352's reproduction,
   * `'resolved'` with `injuredEntityIds: []` and `propertyDamage: 4`, one
   * system interval later than the continuous run rather than a lapse with
   * `[1,2,3]` and `8`. The no-record lapse is what is left when the re-dispatch
   * is *refused*, and `redispatchInterruptedResponses` lists the four refusals.
   * Nothing about the lifecycle changed to allow it: it is still forward-only,
   * `LEGAL_TRANSITIONS` is untouched, and what was separated is dispatching
   * from notifying.
   *
   * What the predecessor did not account for at all is that the discarded
   * record is also what `releaseResponse` reads in order to **return** what the
   * response claimed, and that both claims -- `deploymentPhase: 'on-search'` on
   * each responder, `'lockdown'` on the incident's sector -- are themselves in
   * the payload. So dropping the attribution did not undo the claim; it made it
   * permanent. `releaseOrphanedClaims` is the answer, and it runs on the first
   * scheduled update rather than here: a snapshot load is re-hydration, and the
   * state change it owes belongs on a tick that the kernel drives. The
   * re-dispatch follows it on that same update, out of the pool the release
   * refilled.
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
