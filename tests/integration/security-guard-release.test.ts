import { describe, expect, it } from 'vitest';
import { packCommand, simulationCommandSchema } from '../../src/simulation/protocol/commands';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { createGradedDoor } from '../../src/simulation/security/sector';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { withoutDefaultSectorDeploymentDemand } from '../helpers/default-security-sector';
import { hashFullRuntime } from '../helpers/determinism-state';
import { useSearchPolicy } from '../helpers/search-policy';

/**
 * `ReleaseGuardAssignment`, end to end through the real kernel
 * ([ADR 0034](../../docs/adr/0034-releasing-a-claimed-guard.md), answering
 * [ADR 0033](../../docs/adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)
 * open question 3).
 *
 * ## What was actually missing, and what these tests are therefore about
 *
 * `GuardRoster.unassign` is complete and has been since #26. **Every caller of
 * it in `src/` sits inside the system that made the claim being released**, and
 * each of those fires only when that system decides the claim is over. So a
 * claim whose owner had lost track of it was permanent -- which is exactly what
 * issue #352 was, and ADR 0033 recorded the general form: *"the absence of one is
 * what made this defect terminal rather than merely slow, and it will make the
 * next resource-claiming system's equivalent bug terminal too."*
 *
 * So the interesting assertions here are **not** "a guard becomes unassigned".
 * A one-line `unassign` would satisfy that and would be a worse bug than the one
 * it fixes: the claim lives in the *claimant's* bookkeeping -- a search job's
 * `guardIds`, a response record's `guardIds` and `arrivedGuardIds` -- so a
 * release that told the roster and not the claimant would leave a search job
 * routing a guard that `DeploymentSystem` had since sent to a post, and a
 * response counting a guard toward its arrival quorum that somebody else had
 * claimed.
 *
 * Every test below therefore asserts the *claimant's* state as well as the
 * roster's, and steps the kernel far enough afterwards for a stranded claimant
 * to show itself.
 *
 * ## The three claimants, and why one command
 *
 * `'on-search'` is a **shared** deployment phase with exactly two producers, so
 * the roster cannot say what is holding a guard (ADR 0033 decision 4). A command
 * per claimant would put that resolution on the main thread, which holds a
 * cadence-old copy and cannot answer it. So the command names the guard, the
 * simulation resolves the claim, and `GuardReleaseService.claimOf` is the one
 * rule that does it -- the same rule `hud/held-guards` reports with, so a row and
 * the press on it can never disagree.
 */

const SEED = 0x34;
const SECTOR_ID = 'sector-1';
const DOOR_ID = 'door-1';
const INCIDENT_ID = 'incident-riot';
const CONTAINER_ID = 'construction-materials';
const ORIGIN = { x: tileCoordinate(0), y: tileCoordinate(0) } as const;
const POST_TILE = { x: tileCoordinate(3), y: tileCoordinate(1) } as const;
/** A severity-8 riot crosses `lockdownSeverityThreshold` and needs four responders. */
const SEVERITY = 8;

const SEARCH_POLICY = {
  scope: 'delivery',
  requiredGuardCount: 1,
  dwellTicksPerTarget: 5,
  baseDetectionProbability: 0.5,
  concealmentPenaltyPerPoint: 0,
  intelligenceConfidenceBonus: 0,
} as const;

/** Submits one command to the kernel and runs the tick it executes on. */
function submitRelease(runtime: SimulationRuntime, sequence: number, guardId: number): void {
  runtime.kernel.submitCommand(
    `cmd-${String(sequence)}`,
    sequence,
    runtime.kernel.tick,
    packCommand({ type: 'ReleaseGuardAssignment', guardId }),
  );
  runtime.kernel.step();
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

function phases(runtime: SimulationRuntime): readonly string[] {
  return runtime.securityGuards.allGuardIds().map((id) => runtime.securityGuards.getDeploymentPhase(id));
}

/** A prison with one sector, one graded door, and `guards` guards hired at the origin. */
function buildPrison(guards: number): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  /*
   * Every session now carries a derived default sector that asks for one guard
   * all day ([ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md),
   * closing #396). `DeploymentSystem` fills it from the same unassigned pool
   * every claimant here draws from, so without this the first guard hired below
   * would be posted rather than claimable and every guard id in this file's
   * eighteen assertions would shift by one -- which would say nothing about
   * `ReleaseGuardAssignment`, this file's subject. The sector stays registered;
   * only its demand is zeroed. See the helper for why zero rather than deleted.
   */
  withoutDefaultSectorDeploymentDemand(runtime);
  runtime.navigation.doors.register(
    createGradedDoor(DOOR_ID, { x: tileCoordinate(2), y: tileCoordinate(1) }, 'left', 'open', 'grade.general'),
  );
  runtime.securitySectors.register({ id: SECTOR_ID, gradeId: 'grade.general', doorIds: [DOOR_ID], postTile: POST_TILE });
  runtime.incidentSectorIds.push(SECTOR_ID);
  for (let index = 0; index < guards; index += 1) runtime.securityGuards.hire('staff-role.guard', ORIGIN);
  return runtime;
}

/** The #352 reproduction: a severity-8 riot with a response committed to it. */
function buildRespondingPrison(guards = 6): SimulationRuntime {
  const runtime = buildPrison(guards);
  runtime.incidents.open(
    { id: INCIDENT_ID, type: 'riot', sectorId: SECTOR_ID, participantIds: [1, 2, 3], severity: SEVERITY, causeFactors: [] },
    0,
  );
  while (runtime.incidents.get(INCIDENT_ID)!.state === 'active') runtime.kernel.step();
  return runtime;
}

/** A prison with a search job staffed and running. */
function buildSearchingPrison(guards = 2): SimulationRuntime {
  const runtime = buildPrison(guards);
  useSearchPolicy(runtime, { ...SEARCH_POLICY });
  runtime.searchContainerLocations.set(CONTAINER_ID, { x: tileCoordinate(5), y: tileCoordinate(5) });
  runtime.searchSystem.submitOrder({ id: 'search-1', scope: 'delivery', targets: [{ holderKind: 'container', holderId: CONTAINER_ID }] });
  while (runtime.searchSystem.claimedGuardIds().length === 0) runtime.kernel.step();
  return runtime;
}

describe('the command exists on the wire and carries a guard id', () => {
  it('round-trips through pack/unpack with the guard id and nothing else', () => {
    expect(packCommand({ type: 'ReleaseGuardAssignment', guardId: 3 }).data).toEqual({
      type: 'ReleaseGuardAssignment',
      guardId: 3,
    });
  });

  it('refuses a negative or fractional guard id at the boundary rather than in a system', () => {
    // `EntityStore` mints from zero upward, so neither is an id anything could
    // have handed out -- and the decoder is where a value that could never name
    // a guard is stopped, rather than `GuardReleaseService` having to have an
    // opinion about it.
    for (const guardId of [-1, 1.5]) {
      expect(simulationCommandSchema.safeParse({ type: 'ReleaseGuardAssignment', guardId }).success).toBe(false);
    }
    expect(simulationCommandSchema.safeParse({ type: 'ReleaseGuardAssignment', guardId: 0 }).success).toBe(true);
  });

  it('carries no claim, so the simulation is the only thing that decides what held the guard', () => {
    // ADR 0034's shape, asserted on the schema rather than described: a claim on
    // the wire would be the main thread guessing from a cadence-old projection,
    // and `.strict()` is what makes adding one a decision rather than a slip.
    expect(
      simulationCommandSchema.safeParse({ type: 'ReleaseGuardAssignment', guardId: 0, claim: 'search' }).success,
    ).toBe(false);
  });
});

describe('releasing a responder tells the response, not only the roster', () => {
  it('hands one responder back and drops it from the response, so the response keeps looking for a quorum', () => {
    const runtime = buildRespondingPrison();
    expect(runtime.incidentResponseSystem.claimedGuardIds()).toEqual([0, 1, 2, 3]);
    expect(phases(runtime)).toEqual(['on-search', 'on-search', 'on-search', 'on-search', 'unassigned', 'unassigned']);

    submitRelease(runtime, 0, 1);

    // The roster half, and the half a bare `unassign` would also have got right.
    expect(runtime.securityGuards.getDeploymentPhase(1)).toBe('unassigned');
    expect(runtime.refusals.last).toBeUndefined();
    // **The claimant half, which is the point.** The response no longer names
    // guard 1, so it is not counted toward the arrival quorum and it is not
    // unassigned a second time when the response closes.
    expect(runtime.incidentResponseSystem.claimedGuardIds()).toEqual([0, 2, 3]);
  });

  it('costs the incident its containment, because a response below quorum never reaches `responding`', () => {
    // The consequence, priced. Four responders are required; three remain, so
    // `advanceResponse` never transitions and the incident lapses at its
    // deadline -- issue #28's consistent-failure outcome, and the honest cost of
    // pulling somebody off a riot.
    const runtime = buildRespondingPrison();
    submitRelease(runtime, 0, 1);
    step(runtime, 700);

    const incident = runtime.incidents.get(INCIDENT_ID)!;
    expect(incident.state).toBe('lapsed');
    expect(incident.outcome).toEqual({ injuredEntityIds: [1, 2, 3], propertyDamage: SEVERITY, escaped: false });

    // And the *other* three came back with the lapse, so nothing is stranded --
    // which is what would have gone wrong if the record still named the guard
    // this command released.
    expect(runtime.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('lifts the lockdown when the last responder is released and the incident then closes', () => {
    /*
     * The branch that makes this safe to ship at all, and it is reused rather
     * than written again: releasing every responder deletes the record, so the
     * incident becomes a record-less open incident -- exactly the state ADR 0033
     * added `liftLockdownNoOpenIncidentJustifies` for. Without that reuse, a
     * player who released a severity-8 riot's whole response would have left the
     * sector dark for ever, which is #352 again with a different cause.
     */
    const runtime = buildRespondingPrison();
    expect(runtime.securitySectors.getControlState(SECTOR_ID)).toBe('lockdown');
    expect(runtime.navigation.doors.getById(DOOR_ID)!.state).toBe('locked');

    for (const [sequence, guardId] of [0, 1, 2, 3].entries()) submitRelease(runtime, sequence, guardId);

    // Every responder back, and the response gone.
    expect(runtime.incidentResponseSystem.claimedGuardIds()).toEqual([]);
    expect(runtime.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2, 3, 4, 5]);
    // The lockdown is deliberately still standing: the riot is still running and
    // its *severity* is what justifies a lockdown, not the responders. ADR 0033
    // decision 2's asymmetry, reached from a new direction.
    expect(runtime.securitySectors.getControlState(SECTOR_ID)).toBe('lockdown');

    step(runtime, 700);
    expect(runtime.incidents.get(INCIDENT_ID)!.state).toBe('lapsed');
    expect(runtime.securitySectors.getControlState(SECTOR_ID)).toBe('normal');
    expect(runtime.navigation.doors.getById(DOOR_ID)!.state).toBe('open');
  });

  it('does not close the incident, because a staffing decision is not a verdict on the riot', () => {
    const runtime = buildRespondingPrison();
    for (const [sequence, guardId] of [0, 1, 2, 3].entries()) submitRelease(runtime, sequence, guardId);

    // Still open, still `'notified'`, with no outcome written. A command that
    // resolved or lapsed the incident here would be writing an outcome the
    // simulation had not reached.
    const incident = runtime.incidents.get(INCIDENT_ID)!;
    expect(incident.state).toBe('notified');
    expect(incident.outcome).toBeUndefined();
    expect(runtime.incidents.openIncidents().map((open) => open.id)).toEqual([INCIDENT_ID]);
  });
});

describe('releasing a searcher tells the search job, not only the roster', () => {
  it('cancels a job left with no guards rather than letting it dwell on targets with nobody present', () => {
    const runtime = buildSearchingPrison();
    expect(runtime.searchSystem.claimedGuardIds()).toEqual([0]);
    expect(runtime.searchSystem.getJobState('search-1')).toBeDefined();
    const before = runtime.searchSystem.getMetrics();

    submitRelease(runtime, 0, 0);

    expect(runtime.securityGuards.getDeploymentPhase(0)).toBe('unassigned');
    // **The claimant half.** The job named exactly one guard, so it is cancelled
    // rather than left active with an empty `guardIds` -- which
    // `beginTravelToCurrentTarget` would march through every target of, dwelling
    // on each with nobody there, and which `runDetectionForCurrentTarget` reads
    // `job.guardIds[0]!` from on every confiscation it records.
    expect(runtime.searchSystem.getJobState('search-1')).toBeUndefined();
    expect(runtime.searchSystem.getMetrics().searchesCancelled).toBe(before.searchesCancelled + 1);
    expect(runtime.searchSystem.claimedGuardIds()).toEqual([]);

    // And it stays cancelled: no confiscation is recorded and no search is
    // completed, however long the session runs.
    step(runtime, 500);
    expect(runtime.searchSystem.getMetrics().searchesCompleted).toBe(before.searchesCompleted);
    expect(runtime.confiscations.all()).toEqual([]);
  });

  it('leaves a job that still has guards running, and it completes', () => {
    // The other direction, and the one that shows the release is per-guard rather
    // than per-job. A two-guard policy loses one guard and keeps going.
    const runtime = buildPrison(3);
    useSearchPolicy(runtime, { ...SEARCH_POLICY, requiredGuardCount: 2 });
    runtime.searchContainerLocations.set(CONTAINER_ID, { x: tileCoordinate(5), y: tileCoordinate(5) });
    runtime.searchSystem.submitOrder({ id: 'search-2', scope: 'delivery', targets: [{ holderKind: 'container', holderId: CONTAINER_ID }] });
    while (runtime.searchSystem.claimedGuardIds().length === 0) runtime.kernel.step();
    expect(runtime.searchSystem.claimedGuardIds()).toEqual([0, 1]);

    submitRelease(runtime, 0, 0);

    expect(runtime.searchSystem.claimedGuardIds()).toEqual([1]);
    expect(runtime.searchSystem.getJobState('search-2')).toBeDefined();
    expect(runtime.searchSystem.getMetrics().searchesCancelled).toBe(0);

    step(runtime, 200);
    expect(runtime.searchSystem.getMetrics().searchesCompleted).toBe(1);
    // Both back in the pool: the released one immediately, the remaining one when
    // the job finished. Nothing double-unassigned and nothing stranded.
    expect(runtime.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2]);
  });

  it('tells the two `on-search` claimants apart, releasing a searcher without touching a responder', () => {
    /*
     * The premise ADR 0033 decision 4 rests on, exercised from the release side:
     * a session holding both kinds of `'on-search'` guard at once, and one
     * command that picks the right claimant. A resolution that read the phase
     * and guessed would pass half of this test and fail the other half.
     */
    const runtime = buildRespondingPrison();
    useSearchPolicy(runtime, { ...SEARCH_POLICY });
    runtime.searchContainerLocations.set(CONTAINER_ID, { x: tileCoordinate(5), y: tileCoordinate(5) });
    runtime.searchSystem.submitOrder({ id: 'search-3', scope: 'delivery', targets: [{ holderKind: 'container', holderId: CONTAINER_ID }] });
    while (runtime.searchSystem.claimedGuardIds().length === 0) runtime.kernel.step();

    expect(runtime.incidentResponseSystem.claimedGuardIds()).toEqual([0, 1, 2, 3]);
    expect(runtime.searchSystem.claimedGuardIds()).toEqual([4]);
    expect(runtime.guardRelease.claimOf(0)).toBe('incident-response');
    expect(runtime.guardRelease.claimOf(4)).toBe('search');

    submitRelease(runtime, 0, 4);

    // The searcher went, and the search job went with it.
    expect(runtime.securityGuards.getDeploymentPhase(4)).toBe('unassigned');
    expect(runtime.searchSystem.claimedGuardIds()).toEqual([]);
    // The response is untouched -- all four responders still named and still held.
    expect(runtime.incidentResponseSystem.claimedGuardIds()).toEqual([0, 1, 2, 3]);
    expect(phases(runtime)).toEqual(['on-search', 'on-search', 'on-search', 'on-search', 'unassigned', 'unassigned']);
  });
});

describe('releasing a deployed guard needs no claimant, and says so honestly', () => {
  it('takes a posted guard off its sector, and `DeploymentSystem` may fill the shortage again', () => {
    /*
     * The limit ADR 0034 records rather than hides. `DeploymentSystem` holds no
     * per-guard record -- the sector id and the phase *are* the record, both on
     * the roster -- so `unassign` is the whole of the release. And it reads
     * `unassignedGuardIds()` afresh every cycle against a schedule that still
     * asks for a guard, so releasing a *deployed* guard is a re-shuffle rather
     * than a dismissal.
     */
    const runtime = buildPrison(2);
    // One block covering the whole day -- `assertGaplessDeploymentSchedule`'s
    // shape, so this asks for one guard at every tick rather than at some.
    runtime.securitySchedules.push({
      sectorId: SECTOR_ID,
      blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, requiredGuardCount: 1 }],
    });
    while (runtime.securityGuards.getDeploymentPhase(0) === 'unassigned') runtime.kernel.step();
    expect(runtime.guardRelease.claimOf(0)).toBe('deployment');
    expect(runtime.securityGuards.getSectorId(0)).toBe(SECTOR_ID);

    submitRelease(runtime, 0, 0);

    // Released, sector and all: `unassign` clears the sector id, the phase, the
    // path request and both patrol fields.
    expect(runtime.securityGuards.getDeploymentPhase(0)).toBe('unassigned');
    expect(runtime.securityGuards.getSectorId(0)).toBeUndefined();
    expect(runtime.guardRelease.claimOf(0)).toBeUndefined();
    expect(runtime.refusals.last).toBeUndefined();

    // And the honest consequence, asserted rather than described: the schedule
    // still asks for one guard, so somebody is posted again on the next cycle.
    step(runtime, 20);
    expect(runtime.securityGuards.unassignedGuardIds().length).toBeLessThan(2);
  });

  it('releases a guard nothing live claims, which is ADR 0033’s residue given an immediate route out', () => {
    /*
     * `'on-search'` with neither claimant naming it. `releaseOrphanedClaims`
     * would hand such a guard back on this system's next scheduled update
     * anyway, so this is not the only route out of that state -- but it is the
     * only *immediate* one, and it is a state a player can see, in the window
     * between loading a save taken during a response and that update.
     *
     * Reached here by setting the phase directly, which is the honest way to
     * build it: a session cannot produce an unattributed claim without a
     * save/load, and this test is about the release rather than about the
     * restore (`tests/integration/incident-response-restore.test.ts` owns that).
     */
    const runtime = buildPrison(2);
    runtime.securityGuards.setDeploymentPhase(0, 'on-search');
    expect(runtime.searchSystem.claimedGuardIds()).toEqual([]);
    expect(runtime.incidentResponseSystem.claimedGuardIds()).toEqual([]);
    expect(runtime.guardRelease.claimOf(0)).toBe('unattributed');

    submitRelease(runtime, 0, 0);

    expect(runtime.securityGuards.getDeploymentPhase(0)).toBe('unassigned');
    expect(runtime.guardRelease.claimOf(0)).toBeUndefined();
    expect(runtime.refusals.last).toBeUndefined();
  });
});

describe('a refused release reaches the player', () => {
  it('records `release-guard.not-held` for a guard that is already free', () => {
    // The reachable refusal, and the reason `release` answers an outcome rather
    // than a boolean: `hud/held-guards` is published on a cadence, so a response
    // can close between the publication and the press. A control that silently
    // did nothing here would be the failure #82 and #207 are about.
    const runtime = buildPrison(2);
    expect(runtime.securityGuards.getDeploymentPhase(0)).toBe('unassigned');

    submitRelease(runtime, 0, 0);

    expect(runtime.refusals.last).toEqual({ sequence: 1, tick: 0, reason: 'release-guard.not-held' });
  });

  it('records `release-guard.unknown-guard` for an id the roster never handed out', () => {
    const runtime = buildPrison(2);
    submitRelease(runtime, 0, 99);

    expect(runtime.refusals.last?.reason).toBe('release-guard.unknown-guard');
  });

  it('refuses a second release of the same guard rather than answering quietly twice', () => {
    // Not idempotent-by-silence. The first press is a release and the second is
    // a refusal the player is told about, so a race is distinguishable from a
    // success.
    const runtime = buildRespondingPrison();
    submitRelease(runtime, 0, 1);
    expect(runtime.refusals.last).toBeUndefined();

    submitRelease(runtime, 1, 1);
    expect(runtime.refusals.last?.reason).toBe('release-guard.not-held');
    expect(runtime.refusals.count).toBe(1);
  });

  it('says nothing about a release the simulation carried out', () => {
    // The direction that makes the assertions above mean something.
    const runtime = buildRespondingPrison();
    submitRelease(runtime, 0, 0);
    submitRelease(runtime, 1, 1);

    expect(runtime.refusals.last).toBeUndefined();
    expect(runtime.refusals.count).toBe(0);
  });
});

describe('the release is a claim release and not a dismissal', () => {
  it('keeps the guard hired, on the roster and countable', () => {
    // `ReleaseGuardAssignment` rather than `DismissGuard`: ADR 0033's open
    // question 3 asks for a *"dismiss/fire command"*, and the narrower half of
    // it is the half that closes the defect. Firing destroys an entity, which is
    // ADR 0026's subject and needs its own decision about id reuse.
    const runtime = buildRespondingPrison();
    const before = runtime.securityGuards.allGuardIds();

    submitRelease(runtime, 0, 1);

    expect(runtime.securityGuards.allGuardIds()).toEqual(before);
    expect(runtime.securityGuards.getStaffRoleId(1)).toBe('staff-role.guard');
    // And it is back in the pool the three claimants draw from, which is the
    // point: a released guard is available, not gone.
    expect(runtime.securityGuards.unassignedGuardIds()).toContain(1);
  });
});

describe('releasing is deterministic', () => {
  it('produces byte-identical state for the same seed and the same command sequence', () => {
    // `docs/DETERMINISM.md`: the release draws no RNG, iterates claimants in
    // sorted id order and performs one roster write, so two runs of the same
    // commands are hash-identical at every checkpoint.
    const run = (): SimulationRuntime => {
      const runtime = buildRespondingPrison();
      submitRelease(runtime, 0, 1);
      submitRelease(runtime, 1, 2);
      return runtime;
    };

    const first = run();
    const second = run();
    for (const checkpoint of [10, 100, 610, 700]) {
      step(first, checkpoint - first.kernel.tick);
      step(second, checkpoint - second.kernel.tick);
      expect(hashFullRuntime(first), `divergence at tick ${checkpoint}`).toBe(hashFullRuntime(second));
    }
    // Non-vacuous: the runs really did release and really did reach the lapse.
    expect(first.incidents.get(INCIDENT_ID)!.state).toBe('lapsed');
    expect(first.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

/**
 * **SIM-002: a claim teardown that forgets the route the claim was walking.**
 *
 * A read-only simulation audit of `4c18bc4` reported *"claim teardown can
 * orphan navigation requests/results indefinitely"* and added the clause that
 * makes it worth acting on: *the same ownership pattern appears elsewhere*.
 * It does. Six systems in `src/` call `NavigationSystem.requestRoute` and
 * store the id somewhere of their own; two teardown paths gave it back
 * (`prisoners/release.ts`, `staff/dismissal.ts`, each having discovered the
 * hazard independently and each saying so in its own comment) and five simply
 * deleted the id:
 *
 * - `IncidentResponseSystem.releaseResponder` and `releaseResponse`,
 * - `SearchSystem.releaseGuard` and the target-advance that cleared the whole
 *   map,
 * - `GuardReleaseService.release`, whose `unassign` clears the roster's own
 *   `pathRequestId` -- which `staff/dismissal.ts` had already written down as
 *   *"`GuardRoster.unassign` drops the request id without telling
 *   navigation"*, from the other side of the same hole.
 *
 * ## Why a forgotten id is not harmless
 *
 * `SearchSystem`'s comment asserted it was: *"a result nothing collects is
 * garbage the queue ages out"*. Both clauses are false. `PathRequestQueue`'s
 * aging raises a waiting request's **effective priority** and never evicts it,
 * so an abandoned request is searched at full budget cost; and nothing expires
 * a resolved result at all -- `NavigationSystem.clearResult`'s own comment
 * says *"the system never expires results on its own"*. So the entry is
 * retained for the life of the session.
 *
 * Measured before the fix, on this file's own `buildRespondingPrison`:
 * releasing one of four riot responders mid-travel left
 * `incidents.respond.incident-riot.1.2` in the result map, still there 500
 * ticks later, while the three responders that were **not** released collected
 * and cleared theirs. That contrast is what makes it a leak rather than a
 * slow drain: the same run disposes of three and keeps one, and the one it
 * keeps is the one the player acted on.
 */
describe('a released claim gives back the route it was walking', () => {
  it('leaves nothing waiting in navigation after a responder is released mid-travel', () => {
    const runtime = buildRespondingPrison();

    // Non-vacuity: there is something to lose. The four responders are
    // `'travelling'` with route requests in flight, so a release that forgot
    // one would have one to forget.
    const inFlight = runtime.navigation.pendingCount() + runtime.navigation.resultCount();
    expect(inFlight, 'no responder had a route in flight, so this run could not have leaked one').toBeGreaterThan(0);
    expect(runtime.incidentResponseSystem.claimedGuardIds()).toContain(1);

    submitRelease(runtime, 0, 1);
    step(runtime, 500);

    // **The assertion the defect fails**, with `1` before the fix: the released
    // guard's resolved route. The other three are disposed of by the response
    // itself, which is why a count is a fair question to ask here at all.
    expect(runtime.navigation.resultCount(), 'a released responder left its resolved route behind').toBe(0);
    expect(runtime.navigation.pendingCount(), 'a released responder left a request queued').toBe(0);
  });

  it('leaves nothing waiting in navigation after a searcher is released mid-travel', () => {
    const runtime = buildSearchingPrison();

    const inFlight = runtime.navigation.pendingCount() + runtime.navigation.resultCount();
    expect(inFlight, 'no searcher had a route in flight, so this run could not have leaked one').toBeGreaterThan(0);
    const claimed = runtime.searchSystem.claimedGuardIds();
    expect(claimed.length).toBeGreaterThan(0);

    submitRelease(runtime, 0, claimed[0]!);
    step(runtime, 500);

    expect(runtime.navigation.resultCount(), 'a released searcher left its resolved route behind').toBe(0);
    expect(runtime.navigation.pendingCount(), 'a released searcher left a request queued').toBe(0);
  });

  it('leaves nothing waiting in navigation after a deployed guard is released mid-travel', () => {
    // The third claimant, and the one whose id lives on the *roster* rather
    // than in a claimant's own bookkeeping -- `GuardRoster.unassign` clears it,
    // so `release` has to read it first or it is gone.
    const runtime = buildPrison(2);
    runtime.securitySectors.register({ id: 'sector-2', gradeId: 'grade.general', doorIds: [DOOR_ID], postTile: { x: tileCoordinate(9), y: tileCoordinate(9) } });
    runtime.securitySchedules.push({ sectorId: 'sector-2', blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, requiredGuardCount: 1 }] });

    let travelling: number | undefined;
    for (let n = 0; n < 200 && travelling === undefined; n += 1) {
      runtime.kernel.step();
      travelling = runtime.securityGuards.allGuardIds().find((id) => runtime.securityGuards.getPathRequestId(id) !== undefined);
    }
    expect(travelling, 'no guard was ever sent to the new post, so this run could not have leaked a route').toBeDefined();

    submitRelease(runtime, 0, travelling!);
    // Not stepped on afterwards: `DeploymentSystem` re-assigns a released guard
    // on its next cycle (ADR 0034 records that as a limit of this command), so
    // the question has to be asked about the release itself rather than about
    // the prison a second later.
    expect(runtime.navigation.resultCount(), 'a released deployment left its resolved route behind').toBe(0);
    expect(runtime.navigation.pendingCount(), 'a released deployment left a request queued').toBe(0);
  });
});
