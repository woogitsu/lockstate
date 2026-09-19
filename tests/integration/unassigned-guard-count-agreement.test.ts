import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { DAY_LENGTH_TICKS } from '../../src/simulation/prisoners/regime';
import { createGradedDoor } from '../../src/simulation/security/sector';
import { displayedDeploymentPhase } from '../../src/simulation/security/deployment-phase';
import type { DeploymentPhase } from '../../src/simulation/security/guard-roster';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { PROJECTION_CATALOG } from '../../src/simulation/worker/projection-catalog';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
import { withoutDefaultSectorDeploymentDemand } from '../helpers/default-security-sector';

/**
 * **How many guards are unassigned, asked of the three surfaces that answer
 * it, in the state that was supposed to make them disagree** (issue #870's
 * 2026-09-03 hypothesis).
 *
 * ## The hypothesis this file was written to test, and what it turned out to be
 *
 * #870 recorded that the same quantity is computed three times by three
 * predicates that are written differently:
 *
 * | where | how it decides a guard is unassigned |
 * | --- | --- |
 * | `status-strip-projection.ts` | `getDeploymentPhase(entityId) === 'unassigned'` |
 * | `guard-release-projection.ts` | `hired - held`, where held means *has a claim* |
 * | `staff-projection.ts` | `countsByPhase.get('unassigned')` |
 *
 * and proposed that a guard **holding a claim while its phase is still
 * `'unassigned'`** would be counted as held by the second and as unassigned by
 * the first. The state it named as the way in was an `'unattributed'` claim,
 * the one `GUARD_CLAIM_KINDS` member no live system names.
 *
 * **The three predicates are the same predicate, and it is not a coincidence
 * that has to be re-checked by hand.** `GuardReleaseService.claimOf` does not
 * read a stored claim -- there is no such field. It *derives* the claim from
 * the phase, and its first line is `if (phase === 'unassigned') return
 * undefined`. So "has a claim" and "is not phase `'unassigned'`" are one
 * sentence written twice, and the divergence the hypothesis describes is not
 * reachable but *unconstructible*: a guard cannot hold a claim while its phase
 * is `'unassigned'`, because the phase is what the claim is read off.
 * `displayedDeploymentPhase` closes the third: it rewrites `'on-post'` and
 * nothing else, so an `'unassigned'` row still counts as `'unassigned'`.
 *
 * That is what the assertions below pin, in the order a reader needs them:
 * the invariant that makes the three equal, then the three actually read
 * together in the state that was supposed to break them.
 *
 * ## Why the state is built by a save round trip and not by `setDeploymentPhase`
 *
 * Because the second half of #870's question was whether `'unattributed'` is
 * dead vocabulary, and a test that reaches it by writing the phase directly
 * cannot answer that -- it proves only that the resolution rule has a fourth
 * branch. `tests/integration/security-guard-release.test.ts` already does that
 * deliberately, and says so, because its subject is the release rather than the
 * restore.
 *
 * Here the claim is produced the way a player produces it: a save taken while
 * an incident response holds four guards. `IncidentResponseSystem.getSnapshot`
 * emits metrics only, so the restored session has four guards on
 * `'on-search'` and no response record naming them -- which is
 * [ADR 0033](../../docs/adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)'s
 * residue, and exactly `'unattributed'`. It lasts until that system's first
 * scheduled update hands them back, so **no kernel step happens between the
 * load and the readings below**; a step would close the window this file is
 * about.
 *
 * So the answer to #870's second half is that the vocabulary is live: the kind
 * has a producer in `src/`, reached without a test writing a phase.
 */

const SEED = 0x870;
const PRISON_ID = 'prison-870';
const SECTOR_ID = 'sector-1';
const DOOR_ID = 'door-1';
const INCIDENT_ID = 'incident-riot';
const GUARDS_HIRED = 6;
/** A severity-8 riot crosses `lockdownSeverityThreshold` and needs four responders. */
const SEVERITY = 8;
const REQUIRED_RESPONDERS = 4;
const ORIGIN = { x: tileCoordinate(0), y: tileCoordinate(0) } as const;
const POST_TILE = { x: tileCoordinate(3), y: tileCoordinate(1) } as const;

/**
 * Every `DeploymentPhase` the simulation stores, as a `Record` so `tsc` fails
 * here when a fifth member is added rather than the loop below silently
 * skipping it. The value is the phase's own name, so the iteration yields the
 * union's members and not `string`s that happen to match.
 */
const DEPLOYMENT_PHASES: Readonly<Record<DeploymentPhase, DeploymentPhase>> = {
  unassigned: 'unassigned',
  travelling: 'travelling',
  'on-post': 'on-post',
  'on-search': 'on-search',
};

/** #352's reproduction: six guards, one sector with one graded door, a severity-8 riot in it. */
function buildRespondingPrison(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  // Every session carries a derived default sector asking for one guard all day
  // (ADR 0036). It would post one of these six before the riot could claim it,
  // which would change the headcount every assertion below states. Zeroed
  // rather than deleted so it says the same thing on both sides of the save.
  withoutDefaultSectorDeploymentDemand(runtime);
  runtime.navigation.doors.register(
    createGradedDoor(DOOR_ID, { x: tileCoordinate(2), y: tileCoordinate(1) }, 'left', 'open', 'grade.general'),
  );
  runtime.securitySectors.register({ id: SECTOR_ID, gradeId: 'grade.general', doorIds: [DOOR_ID], postTile: POST_TILE });
  runtime.incidentSectorIds.push(SECTOR_ID);
  for (let index = 0; index < GUARDS_HIRED; index += 1) runtime.securityGuards.hire('staff-role.guard', ORIGIN);
  runtime.incidents.open(
    { id: INCIDENT_ID, type: 'riot', sectorId: SECTOR_ID, participantIds: [1, 2, 3], severity: SEVERITY, causeFactors: [] },
    0,
  );
  while (runtime.incidents.get(INCIDENT_ID)!.state === 'active') runtime.kernel.step();
  return runtime;
}

/** The full save path a session controller takes, including the round trip that destroys object identity. */
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

/**
 * The three answers, read through the **production wiring** rather than by
 * calling the projections with hand-built sources.
 *
 * That is the point of going through `PROJECTION_CATALOG` and
 * `projectStatusCounts`: #870's subject is three numbers a session publishes,
 * so a fixture that handed each projection its own roster could agree while the
 * session disagreed. Here all three read `runtime.securityGuards`, because that
 * is what the catalog binds them to.
 *
 * One `tick` for all three, so the readings are the same instant. `limit: 0`
 * on the two paged projections builds no rows and changes no total: both carry
 * their counts outside the window, which is the property the hypothesis
 * mis-read as a windowing defect.
 */
interface UnassignedReadings {
  readonly statusStrip: number;
  readonly heldGuards: number;
  readonly staff: number;
}

function readUnassigned(runtime: SimulationRuntime): UnassignedReadings {
  const tick = runtime.kernel.tick;
  const heldGuards = PROJECTION_CATALOG['hud/held-guards'].project(runtime, tick, { limit: 0 }).view as unknown as {
    readonly totals: { readonly unassigned: number };
  };
  const staff = PROJECTION_CATALOG['hud/staff'].project(runtime, tick, { limit: 0 }).view as unknown as {
    readonly totals: { readonly unassigned: number };
  };
  return {
    statusStrip: projectStatusCounts(runtime, tick).staffUnassigned,
    heldGuards: heldGuards.totals.unassigned,
    staff: staff.totals.unassigned,
  };
}

describe('the invariant that makes the three unassigned counts one quantity', () => {
  it('gives a guard a claim exactly when its phase is not `unassigned`', () => {
    /*
     * The load-bearing assertion of this file. `claimOf` returning `undefined`
     * and the phase being `'unassigned'` are the same fact, so
     * `guard-release-projection.ts`'s `hired - held` and
     * `status-strip-projection.ts`'s phase test cannot report different
     * numbers about the same roster -- and a future claim kind added without a
     * phase would be caught here rather than by a player reading a header.
     *
     * Asserted over a roster holding three phases at once (four responders on
     * `'on-search'`, one posted guard, one free), because a run in which every
     * guard is free would satisfy it vacuously.
     */
    const runtime = buildRespondingPrison();
    runtime.securityGuards.assignToSector(4, SECTOR_ID);
    runtime.securityGuards.setDeploymentPhase(4, 'on-post');

    const byPhase = runtime.securityGuards
      .allGuardIds()
      .map((id) => [runtime.securityGuards.getDeploymentPhase(id), runtime.guardRelease.claimOf(id)] as const);

    expect(byPhase).toEqual([
      ['on-search', 'incident-response'],
      ['on-search', 'incident-response'],
      ['on-search', 'incident-response'],
      ['on-search', 'incident-response'],
      ['on-post', 'deployment'],
      ['unassigned', undefined],
    ]);
    for (const [phase, claim] of byPhase) expect(claim === undefined).toBe(phase === 'unassigned');
  });

  it('never shows a stored `unassigned` phase as any other word', () => {
    /*
     * The third predicate's half. `staff-projection.ts` counts
     * `DisplayedDeploymentPhase`, not `DeploymentPhase`, so its
     * `totals.unassigned` is only the same quantity as the other two while the
     * derivation leaves `'unassigned'` alone -- it rewrites `'on-post'` to
     * `'returning'` for a guard standing off its post and nothing else.
     *
     * Driven over every stored phase with the derivation's inputs at their most
     * provocative -- a sector whose post tile the guard is *not* standing on,
     * which is the case that produces `'returning'` -- so the one phase that
     * moves is named and the other three are pinned as fixed points.
     */
    const sectors = { getDefinition: () => ({ postTile: POST_TILE }) };
    const offPost = { x: tileCoordinate(9), y: tileCoordinate(9) } as const;

    const displayed = Object.values(DEPLOYMENT_PHASES).map(
      (phase) => [phase, displayedDeploymentPhase(phase, SECTOR_ID, offPost, sectors)] as const,
    );

    expect(displayed).toEqual([
      ['unassigned', 'unassigned'],
      ['travelling', 'travelling'],
      ['on-post', 'returning'],
      ['on-search', 'on-search'],
    ]);
  });
});

describe('#870’s decisive reading, taken in the state the hypothesis named', () => {
  it('produces an `unattributed` claim from a save taken during a response, without writing a phase', () => {
    /*
     * The second half of #870's question, answered: the kind is not dead
     * vocabulary. Reached through the real save path, so what makes it
     * `'unattributed'` is that the response record is absent from the payload
     * -- ADR 0033's residue -- rather than a test having set the phase.
     *
     * No kernel step after the load. `IncidentResponseSystem`'s first
     * scheduled update releases these four and dispatches afresh, so a single
     * step would close the window.
     */
    const restored = saveAndLoad(buildRespondingPrison());

    expect(restored.incidentResponseSystem.claimedGuardIds()).toEqual([]);
    expect(restored.searchSystem.claimedGuardIds()).toEqual([]);
    expect(restored.securityGuards.allGuardIds().map((id) => restored.guardRelease.claimOf(id))).toEqual([
      'unattributed',
      'unattributed',
      'unattributed',
      'unattributed',
      undefined,
      undefined,
    ]);
  });

  it('reads the same number off all three surfaces in the same tick', () => {
    /*
     * The measurement #870 asked for. Four guards hold an `'unattributed'`
     * claim; two are free. If the hypothesis were right the status strip would
     * say six here -- four claim-holders whose phase it read as
     * `'unassigned'`, plus the two -- and the held-guards projection would say
     * two.
     *
     * It says two. All three do, and the assertion is written as one object so
     * a failure names which surface drifted instead of which line ran first.
     */
    const restored = saveAndLoad(buildRespondingPrison());

    expect(readUnassigned(restored)).toEqual({
      statusStrip: GUARDS_HIRED - REQUIRED_RESPONDERS,
      heldGuards: GUARDS_HIRED - REQUIRED_RESPONDERS,
      staff: GUARDS_HIRED - REQUIRED_RESPONDERS,
    });
  });

  it('keeps the three in step through the release, the re-dispatch and a deployment', () => {
    /*
     * Agreement at one instant is agreement at one instant, so the same
     * reading is taken across a run rather than at four hand-built fixtures:
     * these are states a session actually passes through, so whatever the
     * systems do to the roster on the way is included rather than assumed.
     *
     * A schedule is pushed *after* the load so the run covers the deployment
     * claim and the derived `'returning'` word as well as the restore residue
     * -- `DeploymentSystem` posts two guards to `SECTOR_ID`, which is the third
     * predicate's only moving part. Two rather than the whole roster, so a
     * reading in which some guards are held and some are free exists.
     *
     * The figures themselves are not asserted -- what they are is
     * `incident-response-restore.test.ts`'s subject and it owns them. What is
     * asserted is that the three surfaces never disagree, which is this
     * file's, plus that the run moved the roster through at least three
     * distinct counts so the agreement is not agreement about a constant.
     */
    const restored = saveAndLoad(buildRespondingPrison());
    restored.securitySchedules.push({
      sectorId: SECTOR_ID,
      blocks: [{ startTickOfDay: 0, endTickOfDay: DAY_LENGTH_TICKS, requiredGuardCount: 2 }],
    });

    const readings = [readUnassigned(restored)];
    for (let index = 0; index < 8; index += 1) {
      for (let step = 0; step < 25; step += 1) restored.kernel.step();
      readings.push(readUnassigned(restored));
    }

    for (const reading of readings) {
      expect(reading.heldGuards).toBe(reading.statusStrip);
      expect(reading.staff).toBe(reading.statusStrip);
    }
    expect(new Set(readings.map((reading) => reading.statusStrip)).size).toBeGreaterThanOrEqual(3);
  });
});
