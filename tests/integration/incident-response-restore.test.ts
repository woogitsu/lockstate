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

/**
 * Issue #352, as behaviour: **a save taken during an incident response must
 * not cost the player the responders or the lockdown.**
 *
 * Before save-schema V6, `IncidentResponseSystem` snapshotted metrics only.
 * The record it dropped is the one `releaseResponse` reads in order to *return*
 * what the response claimed, and both claims are themselves in the payload
 * (`deploymentPhase: 'on-search'`, `sectorControlStates`) -- so a restore did
 * not undo the claim, it made it permanent. Measured on `origin/main` at
 * v0.0.82, four guards and one sector were still held 53,000 ticks after the
 * restore, with no code path in `src/` able to release either.
 *
 * ## Why these assertions and not "they agree eventually"
 *
 * Final equality after enough ticks is exactly the assertion this defect would
 * have passed, in the version of it where the restored run simply never gets
 * there. So every comparison below is made **at a tick that is a function of
 * the continuous run's behaviour**: the tick the continuous session releases
 * the guards on, plus a restore delay that is *measured here and pinned* rather
 * than assumed. A restored session that never releases fails on the pin, not
 * after some arbitrary budget of ticks.
 *
 * The scenario is issue #352's own reproduction, and the four observables are
 * the ones its table names: the sector's control state, the state of the door
 * that sector governs, every guard's deployment phase, and the size of the
 * unassigned pool. The incident's own state is deliberately *also* asserted,
 * because the fix changes it: a restored response now resolves its incident
 * where before it lapsed.
 */

const PRISON_ID = 'incident-response-restore-prison';
const SEED = 0xbeef;
const DOOR_ID = 'door-1';
const SECTOR_ID = 'sector-1';
const INCIDENT_ID = 'incident-riot';
const GUARDS_HIRED = 6;
/** A severity-8 riot needs four responders and crosses the lockdown threshold. */
const SEVERITY = 8;

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
  runtime.securitySectors.register({
    id: SECTOR_ID,
    gradeId: 'grade.general',
    doorIds: [DOOR_ID],
    postTile: { x: tileCoordinate(3), y: tileCoordinate(1) },
  });
  runtime.incidentSectorIds.push(SECTOR_ID);
  for (let index = 0; index < GUARDS_HIRED; index += 1) {
    runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });
  }
  runtime.incidents.open(
    { id: INCIDENT_ID, type: 'riot', sectorId: SECTOR_ID, participantIds: [1, 2, 3], severity: SEVERITY, causeFactors: [] },
    0,
  );
  while (runtime.incidents.get(INCIDENT_ID)!.state === 'active') runtime.kernel.step();
  return runtime;
}

/** The full save path a session controller takes, including the storage round trip that destroys object identity. */
function saveAndLoad(runtime: SimulationRuntime): SimulationRuntime {
  const bundle = captureSessionSnapshot(runtime);
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

  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded).toMatchObject({ ok: true, migrated: false });
  if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SEED).runtime;
}

interface Observation {
  readonly incident: string;
  readonly sectorControlState: string;
  readonly doorState: string;
  readonly guardPhases: readonly string[];
  readonly unassignedGuardCount: number;
}

/** The four observables #352's table names, plus the incident state the fix also changes. */
function observe(runtime: SimulationRuntime): Observation {
  return {
    incident: runtime.incidents.get(INCIDENT_ID)!.state,
    sectorControlState: runtime.securitySectors.getControlState(SECTOR_ID),
    doorState: runtime.navigation.doors.getById(DOOR_ID)!.state,
    guardPhases: runtime.securityGuards.allGuardIds().map((id) => runtime.securityGuards.getDeploymentPhase(id)),
    unassignedGuardCount: runtime.securityGuards.unassignedGuardIds().length,
  };
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

/**
 * The tick a run puts every guard back in the pool on, or `undefined` if it
 * never does within `budget` ticks. Returning `undefined` rather than throwing
 * is what lets the assertions below name the failure ("never released") instead
 * of reporting a timeout.
 */
function tickOfRelease(runtime: SimulationRuntime, budget: number): number | undefined {
  for (let index = 0; index < budget; index += 1) {
    runtime.kernel.step();
    if (runtime.securityGuards.unassignedGuardIds().length === GUARDS_HIRED) return runtime.kernel.tick;
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
 * The measured cost of the one thing a save cannot carry: the path requests,
 * which belong to the previous `NavigationSystem` instance's queue.
 *
 * **One `IncidentResponseSystem` interval, and only for a response saved while
 * its responders were still travelling.** The record is restored with no
 * requests in flight, so the first scheduled update re-issues them -- putting
 * the arrival, and everything after it, exactly one interval late. Pinned as a
 * number rather than described as "small": if it grows, something has started
 * costing more than a re-request, and if it shrinks, that is an improvement
 * worth writing down here deliberately.
 */
const MID_TRAVEL_RESTORE_DELAY_TICKS = 10;

describe('a save taken during an incident response releases what the response claimed', () => {
  it('reproduces the save-time state #352 measured: four responders committed and the sector locked down', () => {
    const runtime = buildRespondingPrison();

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

  it('agrees with the continuous run on all four observables, at the tick the continuous run releases plus the pinned delay', () => {
    const continuous = buildRespondingPrison();
    const restored = saveAndLoad(continuous);

    // The bound above is the system's own cadence, read off the system rather
    // than written down twice: if the schedule changes, this fails here with
    // the reason rather than further down as an unexplained off-by-N.
    expect(MID_TRAVEL_RESTORE_DELAY_TICKS).toBe(continuous.incidentResponseSystem.schedule.intervalTicks);

    // The restore itself changes nothing observable -- the claim is intact.
    expect(observe(restored)).toEqual(observe(continuous));

    const continuousRelease = tickOfRelease(continuous, RELEASE_BUDGET_TICKS);
    expect(continuousRelease, 'the continuous run must release, or there is nothing to compare against').toBeDefined();

    const restoredRelease = tickOfRelease(restored, RELEASE_BUDGET_TICKS);
    expect(
      restoredRelease,
      'the restored run must release the guards it inherited -- issue #352 is that it never did',
    ).toBeDefined();
    expect(
      restoredRelease! - continuousRelease!,
      'a mid-travel restore costs exactly one IncidentResponseSystem interval, and nothing else',
    ).toBe(MID_TRAVEL_RESTORE_DELAY_TICKS);

    // Same tick, same state: the comparison is made where the continuous run
    // finished plus the delay that is paid for, never "after enough ticks".
    step(continuous, MID_TRAVEL_RESTORE_DELAY_TICKS);
    expect(continuous.kernel.tick).toBe(restored.kernel.tick);
    expect(observe(restored)).toEqual(observe(continuous));
    expect(observe(restored)).toEqual({
      incident: 'resolved',
      sectorControlState: 'normal',
      doorState: 'open',
      guardPhases: ['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED,
    });
  });

  it('costs nothing at all when the save is taken after the responders arrived', () => {
    // The other half of what the record carries. Once the response is
    // `'responding'` there is no travel to restart and `containmentStartedAtTick`
    // is in the payload, so the restored run releases on the *same tick* as the
    // continuous one -- exact parity, not a bounded delay.
    const continuous = buildRespondingPrison();
    while (continuous.incidents.get(INCIDENT_ID)!.state === 'notified') continuous.kernel.step();
    expect(continuous.incidents.get(INCIDENT_ID)!.state).toBe('responding');

    const restored = saveAndLoad(continuous);
    const continuousRelease = tickOfRelease(continuous, RELEASE_BUDGET_TICKS);
    const restoredRelease = tickOfRelease(restored, RELEASE_BUDGET_TICKS);

    expect(restoredRelease).toBeDefined();
    expect(restoredRelease).toBe(continuousRelease);
    expect(observe(restored)).toEqual(observe(continuous));
    expect(observe(restored).unassignedGuardCount).toBe(GUARDS_HIRED);
  });

  it('leaves nothing behind after 53,000 further ticks, which is where #352 measured the loss as terminal', () => {
    // The figure from the issue, kept as the statement it was: 52,000 ticks
    // past the +3,000 sample moved nothing on `origin/main`. Here the run is
    // already settled long before, so what this asserts is that it *stays*
    // settled -- no guard is re-claimed, no lockdown returns.
    const restored = saveAndLoad(buildRespondingPrison());
    step(restored, 53_000);

    expect(observe(restored)).toEqual({
      incident: 'resolved',
      sectorControlState: 'normal',
      doorState: 'open',
      guardPhases: ['unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned', 'unassigned'],
      unassignedGuardCount: GUARDS_HIRED,
    });
  });

  it('carries the responders and the lockdown flag in the payload, named, rather than leaving them derivable', () => {
    // The schema-level statement behind the behaviour above: the four
    // responders and the lockdown are in the save as an *attribution*, which is
    // the thing V5 lacked. Read off the encoded payload rather than the live
    // system, so a capture that stopped emitting them fails here.
    const bundle = captureSessionSnapshot(buildRespondingPrison());
    expect(bundle.simulation?.incidents.response.responses).toEqual([
      [INCIDENT_ID, { guardIds: [0, 1, 2, 3], arrivedGuardIds: [], lockdownApplied: true }],
    ]);
  });
});
