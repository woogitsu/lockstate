import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { DEFAULT_INCIDENT_RESPONSE_POLICY } from '../../src/simulation/incidents/response-system';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { createGradedDoor } from '../../src/simulation/security/sector';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { DEFAULT_SECURITY_SECTOR_ID } from '../../src/simulation/security/default-sector';
import { withoutDefaultSectorDeploymentDemand } from '../helpers/default-security-sector';
import { hashFullRuntime, toJsonValue } from '../helpers/determinism-state';

/**
 * Issue #352, as behaviour: **a save taken during an incident response must
 * not cost the player the responders or the lockdown.**
 *
 * `IncidentResponseSystem.getSnapshot` emits metrics only. The record it drops
 * is the one `releaseResponse` reads in order to *return* what the response
 * claimed, and both claims are themselves in the payload
 * (`deploymentPhase: 'on-search'`, `sectorControlStates`) -- so a restore did
 * not undo the claim, it made it permanent. Measured on `origin/main` at
 * v0.0.104 by the fixture below: four guards and one sector were still held
 * 53,000 ticks after the restore, with no code path in `src/` able to release
 * either.
 *
 * ## What this fixes it with, and what it deliberately does not do
 *
 * The restore path notices the claim and **releases** it at runtime, on the
 * first scheduled `IncidentResponseSystem` update after the load. No save
 * schema version is bumped, no migration writes anything, and the file on disk
 * is untouched -- which the round-trip test below asserts rather than asserts
 * of itself.
 *
 * The semantics that buys, stated so the tests can be read against it: **a
 * restored session does not inherit an emergency response. The response is
 * abandoned and its resources are returned** -- and then, since ADR 0033's
 * amendment (open question 1, built), **a fresh response is mounted to the
 * still-open incident out of the pool the release just refilled.** Release
 * first, dispatch anew second, both owed by the one flag `loadSnapshot` sets,
 * both on the same scheduled update.
 *
 * The incident is *not resumed*: no responder is attributed to the incident it
 * used to serve, no containment progress is inherited, and nothing guesses
 * anything (which is what ADR 0033 open question 2 declines to do and this path
 * still never has to). What is recovered is the **outcome**.
 *
 * ## What each group of assertions below is for
 *
 * - **The resource observables** -- the unassigned guard pool, the sector's
 *   control state and the state of the door that sector governs -- reach
 *   exactly what the continuous run reaches. This is the whole of #352, and it
 *   is unchanged by the amendment. What *did* change is when: the responders are
 *   handed back and immediately committed again, so they return to the pool when
 *   the **new** response closes rather than one interval after the load.
 * - **The incident's own outcome** now reaches the continuous run's too, and it
 *   is asserted **against a continuous run executed live on the same seed**,
 *   never against a literal copied out of a previous run.
 * - **The price** is asserted as a number rather than described: the fresh
 *   response's clocks start at the re-dispatch tick, so the incident closes
 *   later, and `respondersDispatched` counts the second dispatch because a
 *   second dispatch is what happened.
 * - **The boundary** is asserted too. Re-dispatch is not always possible, and
 *   the one case a session can reach without being forced into it -- two open
 *   incidents, where the responders the pool offers are standing at the *other*
 *   incident's post tile -- falls back to ADR 0033 decision 1 exactly, with the
 *   lapse and its outcome written out.
 *
 * ## Why these tick pins and not "they agree eventually"
 *
 * Final equality after enough ticks is exactly the assertion this defect would
 * have passed in the version of it where the restored run simply never gets
 * there. Every comparison below is made at a tick that is either the tick the
 * continuous run acts on or a pinned distance from the save, and a run that
 * never releases fails on `toBeDefined()` rather than on a tick budget.
 */

const PRISON_ID = 'incident-response-restore-prison';
const SEED = 0xbeef;
const DOOR_ID = 'door-1';
const SECTOR_ID = 'sector-1';
const INCIDENT_ID = 'incident-riot';
const GUARDS_HIRED = 6;
/** A severity-8 riot needs four responders and crosses the lockdown threshold. */
const SEVERITY = 8;
/** #352's reproduction hires every guard on the same origin tile. */
const GUARD_ORIGIN = { x: tileCoordinate(0), y: tileCoordinate(0) } as const;
/**
 * `respondersPerSeverityPoint` is 0.5 and the requirement rounds up, so a
 * severity-8 riot needs four.
 *
 * **A literal, and it used to be derived** -- `Math.max(1, Math.ceil(SEVERITY *
 * DEFAULT_INCIDENT_RESPONSE_POLICY.respondersPerSeverityPoint))`, under a
 * comment approving of the derivation. That is `IncidentResponseSystem`'s own
 * expression copied into the test, and what it costs is precise, so it is
 * worth stating precisely rather than overstating (#416): most assertions
 * using this constant compare it against *observed* runtime state -- guard
 * phases, dispatch metrics -- so they do bite when the requirement changes
 * (measured: halving the requirement turns ten cases in this file red, with
 * the derivation still in place). What a self-derived constant cannot do is
 * notice a change to the *rule that computes it*: it re-derives, follows, and
 * the comparison holds. `Math.ceil` -> `Math.floor` was a whole-suite survivor
 * at v0.0.121, and this file could never have been the one to catch it --
 * `SEVERITY` is 8, and half of an even number needs no rounding at all.
 *
 * The rule is now pinned where it belongs, in
 * `tests/unit/incident-response.test.ts`, at odd severities where ceiling and
 * floor differ. Here the policy inputs this figure was read from are asserted
 * instead, so a changed policy fails loudly rather than silently re-deriving a
 * number that no longer describes the scenario this file sets up.
 */
const REQUIRED_RESPONDERS = 4;
const POST_TILE = { x: tileCoordinate(3), y: tileCoordinate(1) } as const;
/**
 * The whole `security.sectorControlStates` payload while `SECTOR_ID` is locked
 * down, and it has **two** rows since [ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md).
 *
 * The second is the derived default sector every session carries, sitting at its
 * baseline. It is written out rather than filtered away because this file's
 * subject is what a payload says about a lockdown, and a payload that quietly
 * dropped a sector's control state would be the #352 defect's own shape. Sorted
 * by sector id, which is the order `SecuritySectorRegistry.getSnapshot` emits:
 * `'sector-1'` before `'security-sector.prison'`.
 */
const SECTOR_CONTROL_STATES_IN_LOCKDOWN = [
  [SECTOR_ID, 'lockdown'],
  [DEFAULT_SECURITY_SECTOR_ID, 'normal'],
] as const;

/**
 * The reproduction from #352: six guards, one sector with one graded door, and
 * a severity-8 riot in it. Stepped until the incident leaves `'active'`, which
 * is the tick the response claims its four guards and locks the sector down.
 */
function buildRespondingPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  /*
   * #352's reproduction counts guards exactly -- four responders committed and
   * two left in the pool -- and every session now carries a derived default
   * sector asking for one guard all day
   * ([ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md)). That
   * would post one of these six before the riot could claim it, changing the
   * reproduction rather than the defect. Zeroed rather than deleted so it says
   * the same thing on both sides of this file's save round trips.
   */
  withoutDefaultSectorDeploymentDemand(runtime);
  runtime.navigation.doors.register(
    createGradedDoor(DOOR_ID, { x: tileCoordinate(2), y: tileCoordinate(1) }, 'left', 'open', 'grade.general'),
  );
  runtime.securitySectors.register({ id: SECTOR_ID, gradeId: 'grade.general', doorIds: [DOOR_ID], postTile: POST_TILE });
  runtime.incidentSectorIds.push(SECTOR_ID);
  for (let index = 0; index < GUARDS_HIRED; index += 1) {
    runtime.securityGuards.hire('staff-role.guard', GUARD_ORIGIN);
  }
  runtime.incidents.open(
    { id: INCIDENT_ID, type: 'riot', sectorId: SECTOR_ID, participantIds: [1, 2, 3], severity: SEVERITY, causeFactors: [] },
    0,
  );
  while (runtime.incidents.get(INCIDENT_ID)!.state === 'active') runtime.kernel.step();
  return runtime;
}

function envelopeFor(bundle: SessionSnapshotBundle): ReturnType<typeof createSaveEnvelope> {
  const envelope = createSaveEnvelope({
    gameVersion: 'lockstate-0.0.0',
    prisonId: PRISON_ID,
    revision: 1,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_001,
    kernel: bundle.kernel,
    world: bundle.world,
    construction: bundle.construction,
    ...(bundle.entities === undefined ? {} : { entities: bundle.entities }),
    ...(bundle.simulation === undefined ? {} : { simulation: bundle.simulation }),
    ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
  });
  expect(envelope.saveSchemaVersion).toBe(SAVE_SCHEMA_VERSION);
  return envelope;
}

/** The full save path a session controller takes, including the storage round trip that destroys object identity. */
function loadBundle(bundle: SessionSnapshotBundle): SimulationRuntime {
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelopeFor(bundle))) as unknown);
  expect(decoded).toMatchObject({ ok: true, migrated: false });
  if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');
  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;
}

function saveAndLoad(runtime: SimulationRuntime): SimulationRuntime {
  return loadBundle(captureSessionSnapshot(runtime));
}

interface Observation {
  readonly incident: string;
  readonly sectorControlState: string;
  readonly doorState: string;
  readonly guardPhases: readonly string[];
  readonly unassignedGuardCount: number;
}

/** The four observables #352's table names, plus the incident state. */
function observe(runtime: SimulationRuntime): Observation {
  return {
    incident: runtime.incidents.get(INCIDENT_ID)!.state,
    sectorControlState: runtime.securitySectors.getControlState(SECTOR_ID),
    doorState: runtime.navigation.doors.getById(DOOR_ID)!.state,
    guardPhases: runtime.securityGuards.allGuardIds().map((id) => runtime.securityGuards.getDeploymentPhase(id)),
    unassignedGuardCount: runtime.securityGuards.unassignedGuardIds().length,
  };
}

/** The three observables that are purely about the resources a response claimed -- the whole of #352. */
function observeClaim(runtime: SimulationRuntime): Omit<Observation, 'incident'> {
  const { incident: _incident, ...claim } = observe(runtime);
  return claim;
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

/**
 * The tick a run puts every guard back in the pool on, or `undefined` if it
 * never does within `budget` ticks. Returning `undefined` rather than throwing
 * is what lets the assertions below name the failure ("never released")
 * instead of reporting a timeout.
 */
function tickOfRelease(runtime: SimulationRuntime, budget: number): number | undefined {
  for (let index = 0; index < budget; index += 1) {
    runtime.kernel.step();
    if (runtime.securityGuards.unassignedGuardIds().length === GUARDS_HIRED) return runtime.kernel.tick;
  }
  return undefined;
}

/** The tick a run leaves `'lockdown'` on, or `undefined` if it never does. */
function tickOfLockdownLift(runtime: SimulationRuntime, budget: number): number | undefined {
  for (let index = 0; index < budget; index += 1) {
    runtime.kernel.step();
    if (runtime.securitySectors.getControlState(SECTOR_ID) !== 'lockdown') return runtime.kernel.tick;
  }
  return undefined;
}

/**
 * The tick a run reaches a terminal incident state on, either one, or
 * `undefined` if it never does.
 *
 * Deliberately blind to *which* terminal state: the whole point of the
 * comparisons below is that a restored run and a continuous one now agree on
 * that, so a helper that only recognised one of them would be asserting the
 * answer in the question.
 */
function tickOfIncidentClose(runtime: SimulationRuntime, budget: number): number | undefined {
  for (let index = 0; index < budget; index += 1) {
    runtime.kernel.step();
    const state = runtime.incidents.get(INCIDENT_ID)!.state;
    if (state === 'resolved' || state === 'lapsed') return runtime.kernel.tick;
  }
  return undefined;
}

/**
 * Generous enough that a run which is merely slow is distinguished from one
 * that is stuck: `responseDeadlineTicks` is 600, so a response that lapses
 * instead of resolving still releases inside this budget. On `origin/main` the
 * restored run consumed all of it and released nothing.
 */
const RELEASE_BUDGET_TICKS = 2_000;

/**
 * Measured, not derived. Every tick below is `kernel.tick` *after* the step
 * that produced the observation, which is one past the tick that ran -- the
 * same convention `tickOfRelease` returns and the one #352's own table used.
 *
 * - The continuous run releases everything on **71** (dispatch at tick 0,
 *   `'responding'` at 10, sixty containment ticks, resolved on 70).
 * - A save taken at `kernel.tick` **1**, **10** or **11** is reconciled by the
 *   first scheduled `IncidentResponseSystem` update it gets -- tick 10, tick 10
 *   again (the case a tick comparison rather than a pending flag would have
 *   stepped straight over) and tick 20 -- and the fresh response mounted there
 *   closes the incident on **81** in all three, which is the continuous run's
 *   71 plus one system interval.
 * - **The interrupted incident no longer lapses.** ADR 0033 measured the lapse
 *   at 610 with the lockdown lifting at **611**; the amendment recovers the
 *   outcome instead, so the lockdown lifts when the *new* response resolves the
 *   incident. 611 survives below only as the tick the one reachable fall-back
 *   case still lapses on.
 */
const CONTINUOUS_RELEASE_TICK = 71;
/**
 * Where a re-dispatched response puts every guard back, for a save taken
 * anywhere inside the first interval: the fresh response's clocks start at the
 * re-dispatch tick, so the whole response runs one interval late.
 *
 * The same number for a save at 1, at 10 and at 11 -- and not by coincidence.
 * For a `'notified'` save the fresh response redoes the travel from the
 * re-dispatch tick; for a `'responding'` save it restarts the containment timer
 * from it. Both stages take the same ten ticks to reach in this reproduction, so
 * both cost the same ten here. `RESOLVE_TICKS_LATE_BY_CONTAINMENT_PROGRESS`
 * below is the general statement.
 */
const REDISPATCHED_RESOLVE_TICK = 81;
/**
 * What a restarted containment timer costs, as a table rather than a sentence:
 * `[tick the save was taken at, tick the restored run resolves on]` for a save
 * taken while the incident is `'responding'`.
 *
 * The cost is **the containment progress the save discards**, rounded up to this
 * system's cadence and capped at `containmentTicks` -- a save one tick before
 * containment completes throws away the whole sixty and no more, because there
 * was never more than sixty to throw away. Each pair is measured; the shape is
 * asserted against `DEFAULT_INCIDENT_RESPONSE_POLICY` in the test that reads it.
 */
const RESOLVE_TICKS_LATE_BY_CONTAINMENT_PROGRESS = [
  [11, 81],
  [21, 91],
  [31, 101],
  [51, 121],
  [61, 131],
  [69, 131],
] as const;
/** The tick ADR 0033's abandoned incident lapsed on, kept because one fall-back case still reaches it. */
const LAPSE_TICK = 611;

describe('a save taken during an incident response releases what the response claimed', () => {
  it('is set up on the policy this file assumes, so REQUIRED_RESPONDERS stays a description of it', () => {
    // The half a derived constant used to hide (#416). `REQUIRED_RESPONDERS` is
    // now the literal 4, so the inputs it was read from have to be pinned
    // somewhere or a changed policy would leave nine assertions quietly
    // describing a scenario that no longer happens. This is that somewhere --
    // and unlike the derivation it replaces, it fails when the policy moves
    // instead of following it.
    expect(SEVERITY).toBe(8);
    expect(DEFAULT_INCIDENT_RESPONSE_POLICY.respondersPerSeverityPoint).toBe(0.5);
    expect(REQUIRED_RESPONDERS).toBe(4);
    expect(GUARDS_HIRED).toBeGreaterThan(REQUIRED_RESPONDERS); // the pool can fill two responses over
  });

  it('reproduces the save-time state #352 measured: four responders committed and the sector locked down', () => {
    const runtime = buildRespondingPrison();

    expect(runtime.kernel.tick).toBe(1);
    expect(observe(runtime)).toEqual({
      incident: 'notified',
      sectorControlState: 'lockdown',
      doorState: 'locked',
      guardPhases: ['on-search', 'on-search', 'on-search', 'on-search', 'unassigned', 'unassigned'],
      unassignedGuardCount: 2,
    });
    // The claim the response has made, priced: four of six guards and the whole
    // sector, which is what a restore used to keep forever.
    expect(runtime.incidents.get(INCIDENT_ID)!.severity).toBeGreaterThanOrEqual(
      DEFAULT_INCIDENT_RESPONSE_POLICY.lockdownSeverityThreshold,
    );
  });

  it('releases the claim it inherited and mounts a fresh response out of the pool that refilled, on one update', () => {
    const continuous = buildRespondingPrison();
    const restored = saveAndLoad(continuous);

    // The restore itself changes nothing: the claim is intact, and both the
    // release and the re-dispatch are things that happen in play rather than
    // during re-hydration. This is the assertion that keeps the file on disk
    // unchanged, and the round-trip test below is its other half.
    expect(observe(restored)).toEqual(observe(continuous));
    expect(restored.incidentResponseSystem.getMetrics().respondersDispatched).toBe(REQUIRED_RESPONDERS);

    // The pin below is a distance from the save, not a magic number: the save
    // was taken at tick 1 and this system runs every 10 ticks from phase 0, so
    // the first update it gets is tick 10. Read off the system so a cadence
    // change fails here, with the reason, rather than further down.
    expect(restored.incidentResponseSystem.schedule).toEqual({ intervalTicks: 10, phaseTicks: 0 });
    step(restored, restored.incidentResponseSystem.schedule.intervalTicks);
    expect(restored.kernel.tick).toBe(11);

    // **Both halves happened, on that one update, and this is what proves it.**
    // Four responders were handed back and four were claimed again, so the
    // dispatch counter has moved by exactly the required count a second time --
    // which is only reachable through `unassignedGuardIds()`, and the four
    // inherited responders were not in it until the release put them there.
    expect(restored.incidentResponseSystem.getMetrics().respondersDispatched).toBe(REQUIRED_RESPONDERS * 2);
    expect(observe(restored)).toEqual({
      incident: 'notified',
      // Still locked down, deliberately -- and now for two reasons rather than
      // one: the riot is still running and its severity is what justifies a
      // lockdown, and the fresh response has applied one of its own.
      sectorControlState: 'lockdown',
      doorState: 'locked',
      guardPhases: ['on-search', 'on-search', 'on-search', 'on-search', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED - REQUIRED_RESPONDERS,
    });

    // And the guards do come back -- which is the whole of #352 -- when the new
    // response closes rather than one interval after the load. That is the cost
    // the amendment accepts in exchange for the outcome, and it is a *bounded*
    // wait rather than #352's permanent one.
    const continuousRelease = tickOfRelease(continuous, RELEASE_BUDGET_TICKS);
    expect(continuousRelease, 'the continuous run must release, or there is nothing to compare against').toBe(
      CONTINUOUS_RELEASE_TICK,
    );
    const restoredRelease = tickOfRelease(restored, RELEASE_BUDGET_TICKS);
    expect(
      restoredRelease,
      'the restored run must release the guards it inherited -- issue #352 is that it never did',
    ).toBeDefined();
    expect(restoredRelease).toBe(REDISPATCHED_RESOLVE_TICK);
  });

  it('reaches the continuous run’s outcome as well as its resource state, compared against that run rather than a literal', () => {
    // **The assertion ADR 0033's open question 1 is about.** Both runs are
    // executed here, from the same seed, and the restored run's outcome is
    // compared against whatever the continuous run actually produced -- not
    // against a value copied out of an earlier run of this suite, which is the
    // fixture class #375 documents six instances of. If the continuous run's
    // outcome changes for any reason, this test follows it instead of pinning a
    // stale copy of it.
    const continuous = buildRespondingPrison();
    const restored = saveAndLoad(continuous);

    const continuousClose = tickOfIncidentClose(continuous, RELEASE_BUDGET_TICKS);
    const restoredClose = tickOfIncidentClose(restored, RELEASE_BUDGET_TICKS);
    expect(continuousClose, 'the continuous run must close the incident, or there is nothing to compare against').toBe(
      CONTINUOUS_RELEASE_TICK,
    );
    expect(restoredClose, 'the restored run must close the incident it re-dispatched to').toBe(REDISPATCHED_RESOLVE_TICK);

    const continuousIncident = continuous.incidents.get(INCIDENT_ID)!;
    const restoredIncident = restored.incidents.get(INCIDENT_ID)!;

    // The outcome, recovered. ADR 0033 measured the cost of abandoning it as
    // `injuredEntityIds: [1,2,3]` and `propertyDamage: 8` against the continuous
    // run's `[]` and `4`; there is no such difference left to measure.
    expect(restoredIncident.state).toBe(continuousIncident.state);
    expect(restoredIncident.outcome).toEqual(continuousIncident.outcome);
    // Non-vacuous: the shared value really is the contained one, and it really
    // is not the lapse ADR 0033 recorded.
    expect(continuousIncident.state).toBe('resolved');
    expect(continuousIncident.outcome).toEqual({ injuredEntityIds: [], propertyDamage: Math.floor(SEVERITY / 2), escaped: false });
    expect(restoredIncident.outcome).not.toEqual({ injuredEntityIds: [1, 2, 3], propertyDamage: SEVERITY, escaped: false });

    // Every resource the response claimed is back where the continuous run put
    // it: the door open, the sector normal, all six guards in the pool. This is
    // ADR 0033 decision 1's own guarantee, unchanged.
    expect(observeClaim(restored)).toEqual(observeClaim(continuous));
    expect(observeClaim(restored)).toEqual({
      sectorControlState: 'normal',
      doorState: 'open',
      guardPhases: ['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED,
    });

    // And the two things that are *not* the same, written out rather than
    // omitted, because they are the price.
    expect(restoredClose! - continuousClose!).toBe(restored.incidentResponseSystem.schedule.intervalTicks);
    expect(restored.incidentResponseSystem.getMetrics().respondersDispatched).toBe(
      continuous.incidentResponseSystem.getMetrics().respondersDispatched * 2,
    );
  });

  it('prices the restarted containment timer: the cost is the progress the save discarded, capped at the containment window', () => {
    // ADR 0033 open question 1 named this cost and did not measure it. The table
    // is what it costs, and the arithmetic below is what the table *means*, so a
    // policy change moves the assertion rather than leaving six stale pairs.
    const continuous = buildRespondingPrison();
    expect(tickOfIncidentClose(continuous, RELEASE_BUDGET_TICKS)).toBe(CONTINUOUS_RELEASE_TICK);

    for (const [saveTick, expectedClose] of RESOLVE_TICKS_LATE_BY_CONTAINMENT_PROGRESS) {
      const run = buildRespondingPrison();
      step(run, saveTick - run.kernel.tick);
      expect(run.kernel.tick).toBe(saveTick);
      expect(run.incidents.get(INCIDENT_ID)!.state, `the save at ${saveTick} must be taken mid-containment`).toBe('responding');

      const restored = saveAndLoad(run);
      expect(tickOfIncidentClose(restored, RELEASE_BUDGET_TICKS), `save at ${saveTick}`).toBe(expectedClose);
      // The outcome is recovered at every one of these, which is the point of
      // the table: the price is paid in *ticks* and never in the outcome.
      expect(restored.incidents.get(INCIDENT_ID)!.outcome).toEqual(continuous.incidents.get(INCIDENT_ID)!.outcome);
    }

    // The cap, asserted rather than described: the last two rows are the same
    // close tick because a save one tick before containment completes discards
    // sixty ticks of progress and a save nine ticks before it discards sixty
    // too. Sixty is `containmentTicks`, read off the policy.
    const worst = RESOLVE_TICKS_LATE_BY_CONTAINMENT_PROGRESS.at(-1)!;
    expect(worst[1] - CONTINUOUS_RELEASE_TICK).toBe(DEFAULT_INCIDENT_RESPONSE_POLICY.containmentTicks);
    expect(RESOLVE_TICKS_LATE_BY_CONTAINMENT_PROGRESS.at(-2)![1]).toBe(worst[1]);
  });

  it('leaves nothing behind after 53,000 further ticks, which is where #352 measured the loss as terminal', () => {
    // The figure from the issue, kept as the statement it was: 52,000 ticks
    // past the +3,000 sample moved nothing on `origin/main`. Here the run is
    // settled long before, so what this asserts is that it *stays* settled --
    // no guard re-claimed, no lockdown returning, and **no second re-dispatch**:
    // the pass is owed by a flag consumed once per restore, so a settled session
    // cannot start mounting responses to incidents that are already closed.
    const restored = saveAndLoad(buildRespondingPrison());
    step(restored, 53_000);

    expect(observe(restored)).toEqual({
      incident: 'resolved',
      sectorControlState: 'normal',
      doorState: 'open',
      guardPhases: ['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED,
    });
    expect(restored.incidentResponseSystem.getMetrics()).toEqual({
      incidentsResolved: 1,
      incidentsLapsed: 0,
      respondersDispatched: REQUIRED_RESPONDERS * 2,
      routeFailures: 0,
    });
  });

  it('costs one interval when the save lands on a scheduled tick, which is the trap a tick comparison would have fallen into', () => {
    // The trap `ProcurementSystem.update`'s `<=` comment names, from the other
    // side: a save taken *on* a scheduled tick must be reconciled on that tick
    // rather than skipped, which is why both the sweep and the re-dispatch are
    // owed by a pending flag and not by a comparison against the tick the save
    // was taken at. A comparison would step straight over tick 10 here and this
    // run would never re-dispatch at all.
    const onCadence = buildRespondingPrison();
    step(onCadence, 9);
    expect(onCadence.kernel.tick).toBe(10);
    expect(onCadence.kernel.tick % onCadence.incidentResponseSystem.schedule.intervalTicks).toBe(0);

    const restored = saveAndLoad(onCadence);
    expect(tickOfIncidentClose(restored, RELEASE_BUDGET_TICKS)).toBe(REDISPATCHED_RESOLVE_TICK);
    expect(restored.incidents.get(INCIDENT_ID)!.state).toBe('resolved');
    // Re-dispatched on tick 10 itself, with nothing lost to the cadence: the
    // second dispatch is already counted by the time the tick is observed.
    expect(restored.incidentResponseSystem.getMetrics().respondersDispatched).toBe(REQUIRED_RESPONDERS * 2);
  });

  it('falls back to ADR 0033 decision 1 exactly when the pool cannot offer responders who are already at the scene', () => {
    /*
     * **The boundary, and it is reachable rather than forced.** With two
     * incidents open, `openIncidents()` is sorted by id and
     * `unassignedGuardIds()` is ascending, so the incident whose id sorts first
     * claims the lowest-id guards in the pool. When the incident that sorts
     * *last* is the one already `'responding'`, the guards left for it are the
     * other incident's ex-responders -- standing at the other incident's post
     * tile, not at its own.
     *
     * A `'responding'` incident's own state asserts that responders arrived, and
     * `advanceResponse`'s `'responding'` branch reads no route results at all,
     * so a response re-mounted from guards who are somewhere else would contain
     * the incident with a responder still in transit and leave a navigation
     * request nothing ever collects. It is refused instead, and the incident
     * gets ADR 0033 decision 1's outcome: abandoned, resources returned, lapsed
     * at its own deadline.
     *
     * This is ADR 0033 open question 2's un-recoverable fact -- *"which incident
     * each responder served when two are open with responders committed"* --
     * reappearing as a bound on what a re-dispatch can recover. It is not solved
     * here and it is not guessed at either.
     */
    const runtime = createNewSimulationRuntime(SEED);
    // Two sectors, and only the two: the derived default's one-guard demand
    // would post guard 0 to its own post tile and break the id arithmetic the
    // rest of this case rests on (ADR 0036).
    withoutDefaultSectorDeploymentDemand(runtime);
    runtime.securitySectors.register({ id: 'sector-a', gradeId: 'grade.general', doorIds: [], postTile: POST_TILE });
    runtime.securitySectors.register({ id: 'sector-z', gradeId: 'grade.general', doorIds: [], postTile: { x: tileCoordinate(9), y: tileCoordinate(9) } });
    runtime.incidentSectorIds.push('sector-a', 'sector-z');
    for (let index = 0; index < 10; index += 1) runtime.securityGuards.hire('staff-role.guard', GUARD_ORIGIN);

    // `'incident-z'` sorts last and is the one that reaches `'responding'`
    // first, so it is the one whose ex-responders are at the far post tile.
    runtime.incidents.open({ id: 'incident-z', type: 'riot', sectorId: 'sector-z', participantIds: [1, 2], severity: SEVERITY, causeFactors: [] }, 0);
    while (runtime.incidents.get('incident-z')!.state !== 'responding') runtime.kernel.step();
    runtime.incidents.open({ id: 'incident-a', type: 'riot', sectorId: 'sector-a', participantIds: [3, 4], severity: SEVERITY, causeFactors: [] }, runtime.kernel.tick);
    while (runtime.incidents.get('incident-a')!.state === 'active') runtime.kernel.step();

    // The setup really is the one this test is about, checked rather than
    // assumed: one incident mid-containment with its responders at its post
    // tile, one mid-travel with its responders still at the origin.
    expect(runtime.incidents.get('incident-z')!.state).toBe('responding');
    expect(runtime.incidents.get('incident-a')!.state).toBe('notified');
    expect(runtime.securityGuards.getTile(0)).toEqual({ x: 9, y: 9 });
    expect(runtime.securityGuards.getTile(REQUIRED_RESPONDERS)).toEqual(GUARD_ORIGIN);

    const restored = loadBundle(captureSessionSnapshot(runtime));
    step(restored, RELEASE_BUDGET_TICKS);

    // The `'notified'` incident is recovered -- it has no arrival to honour, so
    // any four guards will do and the travel is simply redone.
    expect(restored.incidents.get('incident-a')!.state).toBe('resolved');
    expect(restored.incidents.get('incident-a')!.outcome).toEqual({
      injuredEntityIds: [],
      propertyDamage: Math.floor(SEVERITY / 2),
      escaped: false,
    });

    // The `'responding'` one is not, and this is ADR 0033's outcome verbatim.
    expect(restored.incidents.get('incident-z')!.state).toBe('lapsed');
    expect(restored.incidents.get('incident-z')!.outcome).toEqual({
      injuredEntityIds: [1, 2],
      propertyDamage: SEVERITY,
      escaped: false,
    });
    expect(restored.incidents.get('incident-z')!.timeline.at(-1)).toEqual({ state: 'lapsed', atTick: LAPSE_TICK - 1 });

    // #352 is still fixed for it either way: nothing is held.
    expect(restored.securityGuards.unassignedGuardIds().length).toBe(10);
    // Three sectors, not two: `'sector-a'`, `'sector-z'` and the derived default
    // every session carries (ADR 0036). All three back at their baseline.
    expect(restored.securitySectors.all().map((sector) => restored.securitySectors.getControlState(sector.id))).toEqual([
      'normal',
      'normal',
      'normal',
    ]);
  });

  it('re-dispatches nothing for a closed incident, and nothing at all on a second update', () => {
    // The lifecycle is forward-only and this change does not widen it. A
    // terminal incident is not in `openIncidents()`, so it can never be
    // re-dispatched to -- and the flag is consumed on the first update, so even
    // a still-open incident gets exactly one attempt.
    const restored = saveAndLoad(buildRespondingPrison());
    expect(tickOfIncidentClose(restored, RELEASE_BUDGET_TICKS)).toBe(REDISPATCHED_RESOLVE_TICK);
    const settled = restored.incidentResponseSystem.getMetrics();

    step(restored, 1_000);
    expect(restored.incidentResponseSystem.getMetrics()).toEqual(settled);
    expect(restored.incidents.get(INCIDENT_ID)!.timeline.filter((entry) => entry.state === 'notified')).toHaveLength(1);
  });

  it('rewrites nothing: the payload a restored session re-captures is the payload it was given', () => {
    // The property this fix exists to keep. #361 fixes the same defect with a
    // save-schema V6 whose migration writes `security.guards.records` and
    // `security.sectorControlStates` -- sections its version did not change --
    // the first time a stored save is loaded, and cannot then unmake it. Here
    // the load is a pure re-hydration and the release happens on a later tick,
    // so a player who loads and closes the game has an unchanged file.
    const bundle = captureSessionSnapshot(buildRespondingPrison());
    const restored = loadBundle(bundle);

    expect(toJsonValue(captureSessionSnapshot(restored))).toEqual(toJsonValue(bundle));
    // Named explicitly as well, because these are the two sections #361's
    // migration rewrites and a whole-bundle comparison would not say which.
    expect(toJsonValue(captureSessionSnapshot(restored).simulation?.security.guards)).toEqual(
      toJsonValue(bundle.simulation?.security.guards),
    );
    expect(captureSessionSnapshot(restored).simulation?.security.sectorControlStates).toEqual(SECTOR_CONTROL_STATES_IN_LOCKDOWN);
  });

  it('is deterministic: two sessions restored from one payload agree tick for tick', () => {
    const bundle = captureSessionSnapshot(buildRespondingPrison());
    const first = loadBundle(bundle);
    const second = loadBundle(bundle);

    // The checkpoints straddle every state change the amendment introduced: the
    // release-and-re-dispatch update (10), the arrival and second `'responding'`
    // transition (20), the fresh containment window (21-80) and the resolution
    // (81).
    for (const checkpoint of [1, 10, 11, 20, 21, 80, 81, 200, 700]) {
      step(first, checkpoint - first.kernel.tick);
      step(second, checkpoint - second.kernel.tick);
      expect(first.kernel.tick).toBe(checkpoint);
      expect(hashFullRuntime(first), `divergence at tick ${checkpoint}`).toBe(hashFullRuntime(second));
    }
    // Non-vacuous: the two runs really did move through the release, the
    // re-dispatch and the resolution rather than sitting still.
    expect(observe(first).unassignedGuardCount).toBe(GUARDS_HIRED);
    expect(observe(first).incident).toBe('resolved');
    expect(first.incidentResponseSystem.getMetrics().respondersDispatched).toBe(REQUIRED_RESPONDERS * 2);
  });
});

/**
 * The premise the release rests on: **an `'on-search'` guard that no active
 * search job names was a responder.**
 *
 * `SearchSystem` is the only other producer of that phase in `src/`, and its
 * jobs are in the payload, so it can say which guards are its own. These are
 * the tests that make the premise measured rather than cited -- one for the
 * ordinary case and one for the ordering hazard, which is the case a set
 * captured at load time instead of read live would lose.
 */
describe('a search job’s guards are not a response’s to release', () => {
  const CONTAINER_ID = 'construction-materials';
  const SEARCH_POLICY = {
    scope: 'delivery',
    requiredGuardCount: 1,
    dwellTicksPerTarget: 5,
    baseDetectionProbability: 0.5,
    concealmentPenaltyPerPoint: 0,
    intelligenceConfidenceBonus: 0,
  } as const;

  function withSearchDuty(runtime: SimulationRuntime): SimulationRuntime {
    runtime.searchPolicies.push({ ...SEARCH_POLICY });
    runtime.searchContainerLocations.set(CONTAINER_ID, { x: tileCoordinate(5), y: tileCoordinate(5) });
    return runtime;
  }

  function submitSearch(runtime: SimulationRuntime, id: string): void {
    runtime.searchSystem.submitOrder({ id, scope: 'delivery', targets: [{ holderKind: 'container', holderId: CONTAINER_ID }] });
  }

  it('leaves a guard already on a search job alone, and hands back only the responders', () => {
    const runtime = withSearchDuty(buildRespondingPrison());
    submitSearch(runtime, 'search-1');
    // One scheduled `SearchSystem` pass staffs the order from what the response
    // left in the pool, so the session holds both kinds of `'on-search'` guard
    // at once -- which is what makes this a control rather than a restatement.
    step(runtime, 10);
    const searchGuards = runtime.searchSystem.claimedGuardIds();
    expect(searchGuards).toEqual([4]);
    expect(runtime.securityGuards.allGuardIds().filter((id) => runtime.securityGuards.getDeploymentPhase(id) === 'on-search')).toEqual([
      0, 1, 2, 3, 4,
    ]);

    const restored = saveAndLoad(runtime);
    step(restored, 10);

    // The searcher is still searching -- the premise this whole describe block
    // exists to pin, and the amendment does not touch it. The four responders
    // were handed back and then claimed by the fresh response, so they are
    // `'on-search'` again for a *different* reason, which the dispatch counter
    // is what distinguishes.
    expect(restored.securityGuards.getDeploymentPhase(4)).toBe('on-search');
    expect(restored.searchSystem.claimedGuardIds()).toEqual([4]);
    expect(restored.incidentResponseSystem.getMetrics().respondersDispatched).toBe(REQUIRED_RESPONDERS * 2);
    // **Guard 4 was never available to the re-dispatch and guard 5 was not
    // needed**, which is the load-bearing half: the fresh response claimed the
    // four ex-responders and nothing else, so the search job kept its guard.
    expect(restored.securityGuards.unassignedGuardIds()).toEqual([5]);
    // And the job finishes: a released *or re-claimed* searcher would have
    // stranded it.
    step(restored, 60);
    expect(restored.searchSystem.getMetrics().searchesCompleted).toBe(1);
    // Everything back, from both claimants.
    step(restored, 60);
    expect(restored.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('leaves alone a guard a search order claims on the very tick the sweep runs', () => {
    // The ordering hazard, and the reason the claim view is read live rather
    // than captured when the snapshot is loaded. `SearchSystem` is order 290
    // and `IncidentResponseSystem` is order 295 on the same 10-tick cadence, so
    // on the first update after a restore the search pass runs *first* and can
    // staff a queued order out of the pool. A guard claimed in that pass is
    // `'on-search'` by the time the sweep looks, and was not `'on-search'` when
    // the payload was written.
    const runtime = withSearchDuty(buildRespondingPrison());
    submitSearch(runtime, 'search-late');
    expect(runtime.searchSystem.isQueued('search-late')).toBe(true);
    expect(runtime.searchSystem.claimedGuardIds()).toEqual([]);

    const restored = saveAndLoad(runtime);
    expect(restored.searchSystem.isQueued('search-late')).toBe(true);
    expect(restored.searchSystem.order).toBeLessThan(restored.incidentResponseSystem.order);

    step(restored, 10); // the tick both systems run on

    expect(restored.searchSystem.claimedGuardIds()).toEqual([4]);
    expect(restored.securityGuards.getDeploymentPhase(4)).toBe('on-search');
    // The pool the re-dispatch drew from is what the sweep left after honouring
    // the search claim, so guard 4 is not in it and guard 5 was not needed.
    expect(restored.securityGuards.unassignedGuardIds()).toEqual([5]);
    step(restored, 60);
    expect(restored.searchSystem.getMetrics().searchesCompleted).toBe(1);
  });
});

/**
 * The saves that already exist.
 *
 * A player's stored save may already have been through the unfixed load path
 * once: the incident is terminal, the four guards are still `'on-search'` and
 * the sector is still `'lockdown'`, with nothing in `src/` able to reverse any
 * of it. #361 repairs that case by writing the release into the payload during
 * a V5 -> V6 migration, irreversibly, on first load. The release below reaches
 * the same outcome without touching the file.
 *
 * The input is a real capture with the incident record replaced by the terminal
 * one the unfixed build writes -- values measured on `origin/main` at v0.0.104,
 * not produced by the code under test.
 */
describe('a save the unfixed build already stranded', () => {
  /** Exactly what `origin/main` leaves in the log: lapsed at tick 610, every participant injured, damage equal to severity. */
  const STRANDED_TIMELINE = [
    { state: 'active', atTick: 0 },
    { state: 'notified', atTick: 0 },
    { state: 'lapsed', atTick: 610 },
  ] as const;

  function strandedBundle(): SessionSnapshotBundle {
    const bundle = captureSessionSnapshot(buildRespondingPrison());
    const simulation = bundle.simulation!;
    return {
      ...bundle,
      kernel: { ...bundle.kernel, tick: 700 },
      simulation: {
        ...simulation,
        incidents: {
          ...simulation.incidents,
          log: simulation.incidents.log.map(([id, record]) => [
            id,
            {
              ...record,
              state: 'lapsed' as const,
              timeline: STRANDED_TIMELINE.map((entry) => ({ ...entry })),
              outcome: { injuredEntityIds: [1, 2, 3], propertyDamage: SEVERITY, escaped: false },
            },
          ] as const),
        },
      },
    };
  }

  it('describes the state #352 called terminal, before anything is loaded', () => {
    // Guards the two tests below: an input that did not actually hold the claim
    // would make them pass on nothing.
    const bundle = strandedBundle();
    expect(bundle.simulation?.security.sectorControlStates).toEqual(SECTOR_CONTROL_STATES_IN_LOCKDOWN);
    expect(bundle.simulation?.security.guards.records.map(([, record]) => record.deploymentPhase)).toEqual([
      'on-search',
      'on-search',
      'on-search',
      'on-search',
      'unassigned',
      'unassigned',
    ]);
    expect(bundle.simulation?.incidents.log.map(([, record]) => record.state)).toEqual(['lapsed']);
    expect(bundle.simulation?.contraband.search.active).toEqual([]);
  });

  it('returns the guards and unlocks the sector on the first scheduled update, and leaves the incident log as history', () => {
    const restored = loadBundle(strandedBundle());
    expect(restored.kernel.tick).toBe(700);
    expect(observe(restored)).toEqual({
      incident: 'lapsed',
      sectorControlState: 'lockdown',
      doorState: 'locked',
      guardPhases: ['on-search', 'on-search', 'on-search', 'on-search', 'unassigned', 'unassigned'],
      unassignedGuardCount: 2,
    });

    step(restored, 10);

    expect(restored.kernel.tick).toBe(710);
    expect(observe(restored)).toEqual({
      // The lapse stays in the log. Ending the response early is a play
      // outcome; rewriting a closed incident's history would not be.
      incident: 'lapsed',
      sectorControlState: 'normal',
      doorState: 'open',
      guardPhases: ['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED,
    });
    expect(restored.incidents.get(INCIDENT_ID)!.timeline).toEqual(STRANDED_TIMELINE);
  });

  it('reverses nothing on disk to do it: the same file loads to the same repair every time', () => {
    // The whole argument for a runtime release over a migration. The bundle is
    // loaded twice and neither load changed it, so a player who dislikes the
    // outcome still has the save they had.
    const bundle = strandedBundle();
    const first = loadBundle(bundle);
    const second = loadBundle(bundle);
    step(first, 10);
    step(second, 10);

    expect(hashFullRuntime(first)).toBe(hashFullRuntime(second));
    expect(toJsonValue(bundle.simulation?.security.guards.records.map(([, record]) => record.deploymentPhase))).toEqual([
      'on-search',
      'on-search',
      'on-search',
      'on-search',
      'unassigned',
      'unassigned',
    ]);
    expect(bundle.simulation?.security.sectorControlStates).toEqual(SECTOR_CONTROL_STATES_IN_LOCKDOWN);
  });
});
