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
 * abandoned and its resources are returned.** The incident is not resumed --
 * it lapses at its own deadline, which is issue #28's consistent-failure
 * outcome. So the assertions below split into two groups on purpose:
 *
 * - **The resource observables** -- the unassigned guard pool, the sector's
 *   control state and the state of the door that sector governs -- reach
 *   exactly what the continuous run reaches. This is the whole of #352.
 * - **The incident's own outcome** does *not*. The continuous run resolves it;
 *   a restored run lapses it. That difference is asserted, with both values
 *   written out, rather than left to be discovered.
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
const POST_TILE = { x: tileCoordinate(3), y: tileCoordinate(1) } as const;

/**
 * The reproduction from #352: six guards, one sector with one graded door, and
 * a severity-8 riot in it. Stepped until the incident leaves `'active'`, which
 * is the tick the response claims its four guards and locks the sector down.
 */
function buildRespondingPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
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
 * - A save taken at `kernel.tick` **1** is reconciled by the first scheduled
 *   `IncidentResponseSystem` update, which is tick 10, observed at **11**.
 * - A save taken at `kernel.tick` **11** is reconciled on tick 20, at **21**.
 * - A save taken at `kernel.tick` **10** is reconciled on tick 10 itself, with
 *   no delay at all -- the case a tick comparison rather than a pending flag
 *   would have stepped straight over.
 * - The interrupted incident lapses on tick 610 (`responseDeadlineTicks` is
 *   600 and the check runs on this system's cadence), and the lockdown lifts
 *   with it, at **611**.
 */
const CONTINUOUS_RELEASE_TICK = 71;
const RELEASE_TICK_SAVED_AT_1 = 11;
const RELEASE_TICK_SAVED_AT_11 = 21;
const LOCKDOWN_LIFT_TICK = 611;

describe('a save taken during an incident response releases what the response claimed', () => {
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

  it('hands every responder back on the first scheduled update after the load, and the continuous run needed 71 ticks to do the same', () => {
    const continuous = buildRespondingPrison();
    const restored = saveAndLoad(continuous);

    // The restore itself changes nothing: the claim is intact, and the release
    // is a thing that happens in play rather than during re-hydration.
    expect(observe(restored)).toEqual(observe(continuous));

    const continuousRelease = tickOfRelease(continuous, RELEASE_BUDGET_TICKS);
    expect(continuousRelease, 'the continuous run must release, or there is nothing to compare against').toBe(
      CONTINUOUS_RELEASE_TICK,
    );

    const restoredRelease = tickOfRelease(restored, RELEASE_BUDGET_TICKS);
    expect(
      restoredRelease,
      'the restored run must release the guards it inherited -- issue #352 is that it never did',
    ).toBeDefined();
    expect(restoredRelease).toBe(RELEASE_TICK_SAVED_AT_1);

    // The pin above is a distance from the save, not a magic number: the save
    // was taken at tick 1 and this system runs every 10 ticks from phase 0, so
    // the first update it gets is tick 10. Read off the system so a cadence
    // change fails here, with the reason, rather than further down.
    expect(restored.incidentResponseSystem.schedule).toEqual({ intervalTicks: 10, phaseTicks: 0 });
    expect(RELEASE_TICK_SAVED_AT_1 - 1).toBe(restored.incidentResponseSystem.schedule.intervalTicks);

    expect(observe(restored)).toEqual({
      incident: 'notified',
      // Still locked down, deliberately: the riot is still running and its
      // severity is what justifies the lockdown, not the responders.
      sectorControlState: 'lockdown',
      doorState: 'locked',
      guardPhases: ['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED,
    });
  });

  it('lifts the lockdown when the interrupted incident closes, and reaches the continuous run’s resource state exactly', () => {
    const continuous = buildRespondingPrison();
    const restored = saveAndLoad(continuous);

    expect(tickOfLockdownLift(restored, RELEASE_BUDGET_TICKS)).toBe(LOCKDOWN_LIFT_TICK);
    expect(restored.incidents.get(INCIDENT_ID)!.timeline.at(-1)).toEqual({ state: 'lapsed', atTick: LOCKDOWN_LIFT_TICK - 1 });

    step(continuous, CONTINUOUS_RELEASE_TICK - continuous.kernel.tick);
    expect(continuous.kernel.tick).toBe(CONTINUOUS_RELEASE_TICK);

    // Every resource the response claimed is back where the continuous run put
    // it: the door open, the sector normal, all six guards in the pool.
    expect(observeClaim(restored)).toEqual(observeClaim(continuous));
    expect(observeClaim(restored)).toEqual({
      sectorControlState: 'normal',
      doorState: 'open',
      guardPhases: ['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED,
    });

    // And the one thing that is *not* the same, written out rather than
    // omitted: the response was abandoned, so the incident ran its course.
    expect(continuous.incidents.get(INCIDENT_ID)!.state).toBe('resolved');
    expect(restored.incidents.get(INCIDENT_ID)!.state).toBe('lapsed');
    expect(restored.incidents.get(INCIDENT_ID)!.outcome).toEqual({
      injuredEntityIds: [1, 2, 3],
      propertyDamage: SEVERITY,
      escaped: false,
    });
    expect(continuous.incidents.get(INCIDENT_ID)!.outcome).toEqual({
      injuredEntityIds: [],
      propertyDamage: Math.floor(SEVERITY / 2),
      escaped: false,
    });
  });

  it('leaves nothing behind after 53,000 further ticks, which is where #352 measured the loss as terminal', () => {
    // The figure from the issue, kept as the statement it was: 52,000 ticks
    // past the +3,000 sample moved nothing on `origin/main`. Here the run is
    // settled long before, so what this asserts is that it *stays* settled --
    // no guard re-claimed, no lockdown returning.
    const restored = saveAndLoad(buildRespondingPrison());
    step(restored, 53_000);

    expect(observe(restored)).toEqual({
      incident: 'lapsed',
      sectorControlState: 'normal',
      doorState: 'open',
      guardPhases: ['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED,
    });
  });

  it('costs nothing extra when the responders had already arrived, and nothing at all when the save lands on a scheduled tick', () => {
    // The `'responding'` half of #352's table. There is no travel to restart
    // and no arrival to wait for, so the release is the same first-update
    // release -- the delay is the distance from the save to the next update
    // and nothing else.
    const responding = buildRespondingPrison();
    while (responding.incidents.get(INCIDENT_ID)!.state === 'notified') responding.kernel.step();
    expect(responding.incidents.get(INCIDENT_ID)!.state).toBe('responding');
    expect(responding.kernel.tick).toBe(11);

    expect(tickOfRelease(saveAndLoad(responding), RELEASE_BUDGET_TICKS)).toBe(RELEASE_TICK_SAVED_AT_11);

    // The trap `ProcurementSystem.update`'s `<=` comment names, from the other
    // side: a save taken *on* a scheduled tick must be reconciled on that tick
    // rather than skipped, which is why the sweep is owed by a pending flag and
    // not by a comparison against the tick the save was taken at.
    const onCadence = buildRespondingPrison();
    step(onCadence, 9);
    expect(onCadence.kernel.tick).toBe(10);
    expect(onCadence.kernel.tick % onCadence.incidentResponseSystem.schedule.intervalTicks).toBe(0);
    expect(tickOfRelease(saveAndLoad(onCadence), RELEASE_BUDGET_TICKS)).toBe(11);
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
    expect(captureSessionSnapshot(restored).simulation?.security.sectorControlStates).toEqual([[SECTOR_ID, 'lockdown']]);
  });

  it('is deterministic: two sessions restored from one payload agree tick for tick', () => {
    const bundle = captureSessionSnapshot(buildRespondingPrison());
    const first = loadBundle(bundle);
    const second = loadBundle(bundle);

    for (const checkpoint of [1, 10, 11, 200, 611, 700]) {
      step(first, checkpoint - first.kernel.tick);
      step(second, checkpoint - second.kernel.tick);
      expect(first.kernel.tick).toBe(checkpoint);
      expect(hashFullRuntime(first), `divergence at tick ${checkpoint}`).toBe(hashFullRuntime(second));
    }
    // Non-vacuous: the two runs really did move through the release and the
    // lapse rather than sitting still.
    expect(observe(first).unassignedGuardCount).toBe(GUARDS_HIRED);
    expect(observe(first).incident).toBe('lapsed');
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

    // The four responders are back; the searcher is still searching.
    expect(restored.securityGuards.getDeploymentPhase(4)).toBe('on-search');
    expect(restored.searchSystem.claimedGuardIds()).toEqual([4]);
    expect(restored.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2, 3, 5]);
    // And it finishes: a released searcher would have stranded the job.
    step(restored, 60);
    expect(restored.searchSystem.getMetrics().searchesCompleted).toBe(1);
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
    expect(restored.securityGuards.unassignedGuardIds()).toEqual([0, 1, 2, 3, 5]);
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
    expect(bundle.simulation?.security.sectorControlStates).toEqual([[SECTOR_ID, 'lockdown']]);
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
    expect(bundle.simulation?.security.sectorControlStates).toEqual([[SECTOR_ID, 'lockdown']]);
  });
});
