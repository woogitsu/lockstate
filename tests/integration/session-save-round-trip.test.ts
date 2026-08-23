import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { NEED_IDS, NEED_MAX, type NeedId } from '../../src/simulation/prisoners/needs';
import { ACTOR_IDENTITY_RNG_STREAM } from '../../src/simulation/identity';
import { projectPrisonerRoster } from '../../src/simulation/presentation/prisoner-projection';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';

/**
 * Issue #70's acceptance criterion, stated as behaviour: *a prison with
 * prisoners, staff, an active incident and confiscated contraband survives
 * save -> load with that state intact.*
 *
 * Two deliberate choices about how it is proven:
 *
 * - **Through the real save boundary, not through `captureSessionSnapshot`
 *   alone.** Every restore below starts from a payload that was composed by
 *   `createSaveEnvelope` (Zod validation + checksum), serialized to JSON and
 *   back the way IndexedDB stores it, and re-validated by
 *   `decodeSaveEnvelope` as a save of unknown provenance. A shape the schema
 *   rejects, a field `JSON.stringify` silently drops, or a checksum that
 *   stops matching itself after a round trip all fail here.
 *
 * - **Observed by behaviour, never by comparing a snapshot to itself.**
 *   Asserting `capture(restore(x)) === x` would pass just as happily if both
 *   sides dropped the same data. So every assertion below asks the restored
 *   runtime a question a *player* could ask -- is this cell full, does this
 *   incident still progress, can this lockdown be lifted, does this guard
 *   still hold their post -- and several of them run further ticks on the
 *   restored session to see it behave rather than merely report.
 */

const PRISON_ID = 'round-trip-prison';

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

  // Exactly what a stored save is by the time it is read back: a plain value
  // of unknown provenance, fully re-validated and checksum-verified.
  const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
  expect(decoded).toMatchObject({ ok: true, migrated: false });
  if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

  return restoreSimulationRuntime(decoded.value.payload as unknown as SessionSnapshotBundle, SCENARIO_SEED).runtime;
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

/**
 * The shared determinism scenario -- a real prison with cells, prisoners,
 * doors, sectors, guards, schedules, containers, carry jobs, contraband,
 * intelligence, searches and gangs -- advanced far enough to be mid-life,
 * then given the two states the acceptance criterion names explicitly and
 * that a run this short would otherwise leave to chance.
 */
function buildPopulatedPrison(): SimulationRuntime {
  const runtime = buildDeterminismScenario(SCENARIO_SEED);
  submitScenarioCommands(runtime);
  step(runtime, 200);

  // One confiscated item and one still-concealed item, both introduced
  // explicitly rather than left to whether this seed's detection draws
  // happened to succeed -- the scenario's own two items may or may not have
  // been found by the searches it runs, and the acceptance criterion needs
  // both states present regardless.
  runtime.contraband.introduce('item-evidence', 'contraband.phone', { kind: 'cell', id: 'cell-1' }, { sourceType: 'visit', sourceId: 'visitor-2', introducedAtTick: runtime.kernel.tick });
  runtime.contraband.introduce('item-hidden', 'contraband.drug', { kind: 'cell', id: 'cell-3' }, { sourceType: 'delivery', sourceId: 'crate-7', introducedAtTick: runtime.kernel.tick });

  const view = runtime.contraband.confiscate('item-evidence');
  runtime.confiscations.record({
    itemId: view.id,
    categoryId: view.categoryId,
    provenance: view.provenance,
    foundAtHolder: view.holder,
    searchOrderId: 'search-b',
    foundByGuardId: runtime.securityGuards.allGuardIds()[0]!,
    tick: runtime.kernel.tick,
  });

  // An incident that is genuinely still open at save time.
  runtime.incidents.open(
    {
      id: 'incident-live',
      type: 'riot',
      sectorId: 'sector-a',
      participantIds: [...runtime.gangs.membersOf('gang-a')],
      severity: 6,
      causeFactors: [{ kind: 'sustained-risk', value: 0.82 }],
    },
    runtime.kernel.tick,
  );

  return runtime;
}

describe('a populated prison survives save -> load', () => {
  it('keeps its prisoners: identity, sentence, needs and cell occupancy, and does not re-run their intake', () => {
    const runtime = buildPopulatedPrison();

    const prisonerIds = runtime.prisoners.entityStore
      ? [...Array(runtime.prisoners.entityStore.maxActiveIndex + 1).keys()]
          .filter((index) => runtime.prisoners.entityStore.isIndexAlive(index))
          .map((index) => runtime.prisoners.entityStore.getIdByIndex(index))
      : [];
    expect(prisonerIds.length).toBeGreaterThan(0);

    // Not vacuous: 200 ticks of decay means these are genuinely mid-life
    // values, so restoring to a default would be visible.
    const before = prisonerIds.map((id) => {
      const index = runtime.prisoners.entityStore.getIndex(id);
      return {
        id,
        needs: Object.fromEntries(NEED_IDS.map((needId) => [needId, runtime.prisoners.needs.get(index, needId)])) as Record<NeedId, number>,
        sentenceEndTick: runtime.prisoners.records.sentenceEndTick[index]!,
        riskTier: runtime.prisoners.records.riskTier[index]!,
        accommodation: runtime.prisoners.coldState.getAccommodation(id),
      };
    });
    // Not vacuous: 200 ticks of decay means at least one need is genuinely
    // mid-life, so restoring to the `NEED_MAX` default would be visible.
    expect(before.some((entry) => NEED_IDS.some((needId) => entry.needs[needId] < NEED_MAX))).toBe(true);
    expect(before.some((entry) => entry.accommodation !== undefined)).toBe(true);

    const restored = saveAndLoad(runtime);

    for (const entry of before) {
      expect(restored.prisoners.entityStore.isAlive(entry.id)).toBe(true);
      const index = restored.prisoners.entityStore.getIndex(entry.id);
      for (const needId of NEED_IDS) expect(restored.prisoners.needs.get(index, needId)).toBe(entry.needs[needId]);
      expect(restored.prisoners.records.sentenceEndTick[index]).toBe(entry.sentenceEndTick);
      expect(restored.prisoners.records.riskTier[index]).toBe(entry.riskTier);
      expect(restored.prisoners.coldState.getAccommodation(entry.id)).toBe(entry.accommodation);
    }

    // Behavioural, not a field comparison: an occupied cell must still be
    // occupied, so the accommodation search does not hand it out twice.
    const occupied = before.find((entry) => entry.accommodation !== undefined)!.accommodation!;
    expect(restored.prisoners.roomInstances.occupancyOf(occupied)).toBe(runtime.prisoners.roomInstances.occupancyOf(occupied));

    // And intake does not start over: a restored prisoner already past
    // classification is not reclassified, which would both reset their risk
    // tier and draw from the `prisoners.classification` RNG stream.
    const completedBefore = runtime.prisoners.intakeSystem.getMetrics().completedCount;
    const rngBefore = restored.kernel.snapshot().rngStates.find((stream) => stream.name === 'prisoners.classification');
    step(restored, 20);
    expect(restored.prisoners.intakeSystem.getMetrics().completedCount).toBeLessThanOrEqual(completedBefore);
    expect(restored.kernel.snapshot().rngStates.find((stream) => stream.name === 'prisoners.classification')).toEqual(rngBefore);
  });

  it('keeps its staff on post: the roster, their sector assignment and their tile', () => {
    const runtime = buildPopulatedPrison();

    const guardIds = runtime.securityGuards.allGuardIds();
    expect(guardIds.length).toBe(5);
    const deployed = guardIds.filter((id) => runtime.securityGuards.getSectorId(id) !== undefined);
    expect(deployed.length).toBeGreaterThan(0);

    const restored = saveAndLoad(runtime);

    expect(restored.securityGuards.allGuardIds()).toEqual(guardIds);
    for (const id of deployed) {
      expect(restored.securityGuards.getSectorId(id)).toBe(runtime.securityGuards.getSectorId(id));
      expect(restored.securityGuards.getTile(id)).toEqual(runtime.securityGuards.getTile(id));
      expect(restored.securityGuards.getStaffRoleId(id)).toBe('staff-role.guard');
    }

    // Behavioural: coverage is satisfied, so the deployment system does not
    // treat the restored prison as unstaffed and report a shortage.
    const coverage = restored.deploymentSystem.getCoverageReport(restored.kernel.tick);
    expect(coverage.length).toBeGreaterThan(0);
    expect(coverage.every((entry) => entry.shortage === 0)).toBe(true);
  });

  it('keeps an active incident active, and the restored session keeps driving it to a terminal state', () => {
    const runtime = buildPopulatedPrison();
    expect(runtime.incidents.openIncidents().map((incident) => incident.id)).toContain('incident-live');

    const restored = saveAndLoad(runtime);

    const carried = restored.incidents.get('incident-live');
    expect(carried).toBeDefined();
    expect(carried?.severity).toBe(6);
    expect(carried?.causeFactors).toEqual([{ kind: 'sustained-risk', value: 0.82 }]);
    expect(restored.incidents.openIncidentsInSector('sector-a').map((incident) => incident.id)).toContain('incident-live');

    // The evidence that it is a *live* record and not an inert row: the
    // restored response system picks it up and drives it to a terminal state
    // on its own, exactly as a never-saved session would.
    step(restored, 400);
    const settled = restored.incidents.get('incident-live');
    expect(settled?.state === 'resolved' || settled?.state === 'lapsed').toBe(true);
    expect(restored.incidents.openIncidents().map((incident) => incident.id)).not.toContain('incident-live');
  });

  it('keeps confiscated contraband confiscated: out of circulation, and its evidence chain intact', () => {
    const runtime = buildPopulatedPrison();

    expect(runtime.contraband.get('item-evidence')?.state).toBe('confiscated');
    expect(runtime.contraband.get('item-hidden')?.state).toBe('concealed');
    expect(runtime.confiscations.all().map((event) => event.itemId)).toContain('item-evidence');

    const restored = saveAndLoad(runtime);

    expect(restored.contraband.all()).toEqual(runtime.contraband.all());
    expect(restored.confiscations.all()).toEqual(runtime.confiscations.all());
    // The evidence chain, not just the flag: provenance and the guard who
    // found it are what a later disciplinary/economy system reads.
    expect(restored.confiscations.all().find((event) => event.itemId === 'item-evidence')?.provenance).toEqual({
      sourceType: 'visit',
      sourceId: 'visitor-2',
      introducedAtTick: runtime.confiscations.all().find((event) => event.itemId === 'item-evidence')!.provenance.introducedAtTick,
    });

    // Behavioural: a confiscated item is removed from the holder index, so a
    // search of the cell it came from must not find it again -- the property
    // that stops one item being confiscated twice.
    expect(restored.contraband.byHolder('cell', 'cell-1').map((entry) => entry.id)).not.toContain('item-evidence');
    // ...while a still-concealed item in another cell remains findable.
    expect(restored.contraband.byHolder('cell', 'cell-3').map((entry) => entry.id)).toContain('item-hidden');
    // ...and confiscating it a second time is refused, as it is in a live run.
    expect(() => restored.contraband.confiscate('item-evidence')).toThrow(RangeError);

    // And the intelligence that pointed at it survives with its decayed
    // confidence, so a restored search is not re-run against a fresh tip.
    expect(restored.intelligence.all()).toEqual(runtime.intelligence.all());
  });

  it('keeps a lockdown liftable: doors restore locked, and returning the sector to normal restores their original state', () => {
    const runtime = buildPopulatedPrison();

    const originalState = runtime.navigation.doors.getById('door-1')?.state;
    expect(originalState).toBe('open');
    runtime.securitySectors.setControlState('sector-a', 'lockdown');
    expect(runtime.navigation.doors.getById('door-1')?.state).toBe('locked');

    const restored = saveAndLoad(runtime);

    // The lockdown itself survives...
    expect(restored.securitySectors.getControlState('sector-a')).toBe('lockdown');
    expect(restored.navigation.doors.getById('door-1')?.state).toBe('locked');

    // ...and, the part a naive "persist the live door state" would break, it
    // can still be lifted: `setControlState('normal')` restores each door to
    // its baseline, which means the save had to carry the baseline rather
    // than the locked-down state.
    restored.securitySectors.setControlState('sector-a', 'normal');
    expect(restored.navigation.doors.getById('door-1')?.state).toBe(originalState);
  });

  it('keeps its operations running: container stock, carry jobs and job workers', () => {
    const runtime = buildPopulatedPrison();

    const storeBefore = runtime.containers.require('store').quantityOf('item.brick');
    const jobsBefore = runtime.jobs.allSorted().map((job) => ({ id: job.id, state: job.state }));
    expect(jobsBefore.length).toBeGreaterThan(0);
    expect(runtime.jobWorkers.getSnapshot().workers.length).toBeGreaterThan(0);

    const restored = saveAndLoad(runtime);

    expect(restored.containers.require('store').quantityOf('item.brick')).toBe(storeBefore);
    expect(restored.jobWorkers.getSnapshot().workers).toEqual(runtime.jobWorkers.getSnapshot().workers);
    // Travel is deliberately restarted (a path request belonged to the old
    // navigation queue), so job identity and progress are what must survive,
    // not the exact lifecycle state of a job mid-leg.
    expect(restored.jobs.allSorted().map((job) => job.id)).toEqual(jobsBefore.map((job) => job.id));
    for (const job of restored.jobs.allSorted()) {
      expect(job.state).not.toBe('available'); // already claimed before the save; not handed out a second time
    }
  });

  it('keeps the names it minted, for prisoners and staff alike, and projects them after the restore', () => {
    const runtime = buildPopulatedPrison();

    // Non-vacuous: the session really did mint names, for both populations.
    // If ADR 0015's registry were still unwired this would fail here rather
    // than passing on an empty-vs-empty comparison.
    const namedRows = projectPrisonerRoster(runtime.prisoners, { limit: 50 }, { identity: runtime.actorIdentity }).rows;
    expect(namedRows.length).toBeGreaterThan(0);
    expect(namedRows.every((row) => row.name !== undefined)).toBe(true);

    const guardIds = runtime.securityGuards.allGuardIds();
    expect(guardIds.length).toBeGreaterThan(0);
    expect(guardIds.every((id) => runtime.actorIdentity.getName('staff', id) !== undefined)).toBe(true);

    const before = runtime.actorIdentity.getSnapshot();
    expect(before.entries.length).toBe(namedRows.length + guardIds.length);

    const restored = saveAndLoad(runtime);

    // Behavioural, and through the surface a player actually sees: the roster
    // panel renders the same names against the same prisoners.
    const restoredRows = projectPrisonerRoster(restored.prisoners, { limit: 50 }, { identity: restored.actorIdentity }).rows;
    expect(restoredRows.map((row) => ({ id: row.entityId, name: row.name }))).toEqual(
      namedRows.map((row) => ({ id: row.entityId, name: row.name })),
    );

    // Staff too -- the reason the section is session-level rather than nested
    // under either population. Both stores hand out id 0, so a restore that
    // lost `kind` would cross the two.
    for (const id of guardIds) {
      expect(restored.actorIdentity.getName('staff', id)).toEqual(runtime.actorIdentity.getName('staff', id));
    }
    expect(restored.actorIdentity.getSnapshot()).toEqual(before);

    // The uniqueness bookkeeping is rebuilt, not just the map: `assign` for
    // an actor that already has a name must return it *without drawing*, or
    // the next actor named after a load would get a different name than in a
    // session that was never saved.
    const rngBefore = restored.kernel.snapshot().rngStates.find((stream) => stream.name === ACTOR_IDENTITY_RNG_STREAM);
    const reassigned = restored.actorIdentity.assign('staff', guardIds[0]!, restored.kernel.rng.get(ACTOR_IDENTITY_RNG_STREAM));
    expect(reassigned).toEqual(runtime.actorIdentity.getName('staff', guardIds[0]!));
    expect(restored.kernel.snapshot().rngStates.find((stream) => stream.name === ACTOR_IDENTITY_RNG_STREAM)).toEqual(rngBefore);
  });

  it('restores names for a save whose pool no longer matches, rather than renaming the prison', () => {
    // `ActorIdentityRegistry.loadSnapshot` tolerates a `poolId` that
    // disagrees with the configured pool on purpose: stored names are
    // authoritative, so replacing the placeholder pool must rename nobody.
    // The save boundary must not undo that by validating `poolId` against
    // the current pool.
    const runtime = buildPopulatedPrison();
    const bundle = captureSessionSnapshot(runtime);
    const identity = bundle.identity;
    if (identity === undefined) throw new Error('the session must have minted names for this test to mean anything');
    expect(identity.entries.length).toBeGreaterThan(0);

    const fromRetiredPool = { ...bundle, identity: { ...identity, poolId: 'retired-pool-from-an-older-build' } };
    const { runtime: restored } = restoreSimulationRuntime(fromRetiredPool, SCENARIO_SEED);

    expect(restored.actorIdentity.getSnapshot().entries).toEqual(identity.entries);
    // The live registry reports its *own* pool; the snapshot's poolId is
    // diagnostic, and the names it carried won.
    expect(restored.actorIdentity.poolId).toBe(runtime.actorIdentity.poolId);
  });

  it('does not fabricate a populated prison out of a save that never had one', () => {
    // The mirror image of every assertion above, and the reason `simulation`
    // is optional rather than defaulted: a payload without the section must
    // restore an empty prison, not an invented one.
    const runtime = buildPopulatedPrison();
    const bundle = captureSessionSnapshot(runtime);
    const { simulation: _dropped, identity: _alsoDropped, ...withoutSystems } = bundle;

    const { runtime: restored, scope } = restoreSimulationRuntime(withoutSystems, SCENARIO_SEED);
    expect(restored.securityGuards.allGuardIds()).toEqual([]);
    expect(restored.contraband.all()).toEqual([]);
    expect(restored.incidents.openIncidents()).toEqual([]);
    // An empty registry, not invented names: a pre-#75 save genuinely has
    // none, and every row simply projects no name.
    expect(restored.actorIdentity.size).toBe(0);
    expect(restored.actorIdentity.getSnapshot().entries).toEqual([]);
    // The world and construction halves still come back, exactly as V2 did.
    expect(restored.world.snapshot()).toEqual(runtime.world.snapshot());
    expect(scope.restored.length).toBeGreaterThan(0);
  });
});
