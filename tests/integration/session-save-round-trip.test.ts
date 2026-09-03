import { describe, expect, it } from 'vitest';
import { createSaveEnvelope, decodeSaveEnvelope, SAVE_SCHEMA_VERSION } from '../../src/persistence/save-schema';
import {
  DEFAULT_PRISONER_CAPACITY,
  createNewSimulationRuntime,
  type SimulationRuntime,
} from '../../src/simulation/runtime/new-session';
import { EntityStore } from '../../src/simulation/entity/entity-store';
import { encodeEntityStoreSnapshot } from '../../src/persistence/entity-codec';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  type SessionSnapshotBundle,
} from '../../src/simulation/runtime/restore-session';
import { NEED_IDS, NEED_MAX, NEED_MAX_SCALED, type NeedId } from '../../src/simulation/prisoners/needs';
import { ACTOR_IDENTITY_RNG_STREAM } from '../../src/simulation/identity';
import { projectPrisonerRoster } from '../../src/simulation/presentation/prisoner-projection';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { projectStatusCounts } from '../../src/simulation/worker/status-counts';
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
    // What `SessionController.buildEnvelope` now writes: the captured bundle's
    // own seed (#412), so this helper stays the full save path it claims to be.
    ...(bundle.masterSeed === undefined ? {} : { masterSeed: bundle.masterSeed }),
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

  /*
   * A sixth guard, because the scenario's five no longer leave a quorum.
   *
   * Since [ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md)
   * every session carries a derived default sector asking for one guard all
   * day, so the scenario's five guards cover three sectors (`sector-a`,
   * `sector-b`, `security-sector.prison`) and leave two unassigned. A
   * severity-6 riot needs three responders (`respondersPerSeverityPoint` is
   * 0.5), so with five the incident below could not be staffed at all and would
   * simply run to its 600-tick deadline and lapse -- which the assertion allows
   * and would therefore have hidden. Six guards keep this case measuring what it
   * says it measures: a restored session *containing* a live incident.
   */
  runtime.securityGuards.hire('staff-role.guard', { x: tileCoordinate(0), y: tileCoordinate(0) });

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
    // The scenario's five, plus the sixth `buildPopulatedPrison` hires so a
    // severity-6 riot still has a quorum once the derived default sector has
    // taken one (ADR 0036).
    expect(guardIds.length).toBe(6);
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

  /**
   * **The status strip's coverage figure is right on the tick the load
   * finishes, not ten ticks later.**
   *
   * `SafetyCoverageSystem` holds a census rather than deriving one per read,
   * and it is the only projection source on this strip that does. A restored
   * session arrives `paused` and `handleInitialize` publishes one
   * `simulation/status-counts` immediately -- deliberately, so a prison with a
   * population is not shown as a row of zeros -- so the census has to be true
   * at that moment. Nothing steps the kernel until the player presses play, so
   * "the first scheduled update fixes it" is not a bound here: it is a state a
   * player can sit in for as long as they like.
   *
   * Asserted through `projectStatusCounts` rather than `getCensus`, because
   * what a player meets is a chip and a badge: with all three rungs at 0
   * `coverageTone` returns `undefined` and `coverageBadge` prints the green
   * "Covered" pill (`src/ui/hud/projection.ts`), so an empty census does not
   * read as missing information -- it reads as a reassurance.
   */
  it('publishes the coverage the prison actually has on the tick it is restored, before any tick runs', () => {
    const runtime = buildPopulatedPrison();

    const before = projectStatusCounts(runtime, runtime.kernel.tick);
    // Not vacuous: this prison has people standing on a covered rung, so a
    // reset census is visible rather than indistinguishable from the truth.
    expect(before.prisonersCovered).toBeGreaterThan(0);

    const restored = saveAndLoad(runtime);
    const after = projectStatusCounts(restored, restored.kernel.tick);

    expect(after.prisoners).toBe(before.prisoners);
    expect(after.prisonersCovered).toBe(before.prisonersCovered);
    expect(after.prisonersUnderstaffed).toBe(before.prisonersUnderstaffed);
    expect(after.prisonersUnguarded).toBe(before.prisonersUnguarded);
  });

  /**
   * The census walk is the provisioning walk, so taking one at restore must
   * not provision anything: no time passed between the save and the load, and
   * a prisoner whose `safety` moved across a reload would be a prisoner the
   * save and the reload disagree about.
   */
  it('takes that census without paying anybody a tick of safety they did not live through', () => {
    const runtime = buildPopulatedPrison();

    const ids = [...Array(runtime.prisoners.entityStore.maxActiveIndex + 1).keys()]
      .filter((index) => runtime.prisoners.entityStore.isIndexAlive(index))
      .map((index) => runtime.prisoners.entityStore.getIdByIndex(index));
    expect(ids.length).toBeGreaterThan(0);

    /*
     * Put every prisoner's `safety` well below `NEED_MAX_SCALED` first, and
     * this line is the whole test.
     *
     * A covered prison holds `safety` at the ceiling -- provisioning is
     * 0.08 a tick against a 0.05 decay -- and `provisionSafety` clamps, so at
     * the ceiling a spurious ten ticks of provisioning is invisible. Measured:
     * without this line the mutant that hands `takeCensus` the system's own
     * `intervalTicks` instead of 0 passes. Half of the range is arbitrary and
     * only has to be far enough from the clamp that ten ticks of either rung's
     * provisioning would show.
     */
    for (const id of ids) runtime.prisoners.needs.setScaled(runtime.prisoners.entityStore.getIndex(id), 'safety', Math.floor(NEED_MAX_SCALED / 2));

    const safetyBefore = ids.map((id) => runtime.prisoners.needs.getScaled(runtime.prisoners.entityStore.getIndex(id), 'safety'));
    expect(safetyBefore.every((level) => level < NEED_MAX_SCALED)).toBe(true);

    const restored = saveAndLoad(runtime);

    for (const [position, id] of ids.entries()) {
      expect(restored.prisoners.needs.getScaled(restored.prisoners.entityStore.getIndex(id), 'safety')).toBe(safetyBefore[position]);
    }
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

  it('keeps its operations running: container stock and carry jobs, with their carriers derived', () => {
    const runtime = buildPopulatedPrison();

    const storeBefore = runtime.containers.require('store').quantityOf('item.brick');
    const jobsBefore = runtime.jobs.allSorted().map((job) => ({ id: job.id, state: job.state, worker: job.assignedWorkerId }));
    expect(jobsBefore.length).toBeGreaterThan(0);
    /*
     * **The worker pool used to be asserted here and is gone**
     * ([ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) decision 4).
     * This read `expect(runtime.jobWorkers.getSnapshot().workers.length)
     * .toBeGreaterThan(0)` and then compared the restored pool against it;
     * `JobWorkerPool` is retired, `operations.jobWorkers` is written empty and
     * ignored on read (decision 5), and the fact the pool carried -- which
     * prisoner is on which errand -- is `assignedWorkerId` on the job. So the
     * assertion moved to the job rather than being dropped, and it is a
     * stronger one: the link comes back **derived**, rebuilt by
     * `JobBoard.loadSnapshot` from a field the save already held.
     */
    const carriersBefore = jobsBefore.filter((job) => job.worker !== undefined);
    expect(carriersBefore.length, 'the fixture is only meaningful if some job actually has a carrier').toBeGreaterThan(0);

    const restored = saveAndLoad(runtime);

    expect(restored.containers.require('store').quantityOf('item.brick')).toBe(storeBefore);
    expect(restored.jobs.allSorted().map((job) => job.assignedWorkerId)).toEqual(jobsBefore.map((job) => job.worker));
    for (const job of carriersBefore) {
      expect(restored.jobs.activeJobFor(job.worker!)?.id, `the carrier of ${job.id} came back from the board`).toBe(job.id);
    }
    // Travel is deliberately restarted (a path request belonged to the old
    // navigation queue), so job identity and progress are what must survive,
    // not the exact lifecycle state of a job mid-leg.
    expect(restored.jobs.allSorted().map((job) => job.id)).toEqual(jobsBefore.map((job) => job.id));
    for (const job of restored.jobs.allSorted()) {
      expect(job.state).not.toBe('available'); // already claimed before the save; not handed out a second time
    }
  });

  it('keeps the patrol record and the deployment failures the prison earned, which no test read across a save before (#375)', () => {
    /*
     * The seam issue #375 found unguarded. `DeploymentSystem.loadSnapshot` and
     * `PatrolSystem.loadSnapshot` are called by exactly one place in `src/` --
     * `restoreSimulationRuntime` -- and, until #375, by nothing in `tests/`;
     * `tests/unit/security-snapshot-restore.test.ts` now drives the two methods
     * directly and this is the same fact through the real save envelope, which
     * is what proves the two sections survive Zod validation, `JSON.stringify`
     * and `decodeSaveEnvelope` rather than only an in-process call.
     *
     * Why the session-level guards missed it: `carriedScopeState`
     * (`tests/helpers/determinism-state.ts`) omits both metric surfaces on
     * purpose, and `snapshot-restore-fidelity.test.ts`'s bundle comparison
     * names its fields one at a time and names neither of these two.
     */
    const runtime = buildPopulatedPrison();

    const patrolBefore = runtime.patrolSystem.getMetrics();
    const deploymentBefore = runtime.deploymentSystem.getMetrics();
    // Non-vacuous, and this is the whole of it: a prison whose patrol had
    // completed nothing could not tell a restore that carries the counter from
    // one that leaves a fresh system's zero in place.
    expect(patrolBefore.loopsCompletedOnTime + patrolBefore.loopsCompletedLate).toBeGreaterThan(0);

    // The deployment half is **vacuous here and says so**: `deploymentFailures`
    // only moves when a guard's route to its post fails, which this scenario
    // never does, so the equality below holds for a restore that carries the
    // counter and for one that leaves a fresh zero. Pinned rather than left
    // implicit, so a scenario that later strands a guard fails here and asks for
    // this comment to go instead of quietly making the assertion mean something.
    // The non-vacuous guard on that counter is the literal donor in
    // `tests/unit/security-snapshot-restore.test.ts`.
    expect(deploymentBefore).toEqual({ deploymentFailures: 0 });

    const restored = saveAndLoad(runtime);

    expect(restored.patrolSystem.getMetrics()).toEqual(patrolBefore);
    expect(restored.deploymentSystem.getMetrics()).toEqual(deploymentBefore);
  });

  it('keeps the utility networks a prison wired, nodes, connections and the failed one (#375)', () => {
    /*
     * `runtime.electricity`/`runtime.water` are captured into every save and
     * restored on every load, and **nothing anywhere populated them** -- no
     * production path and no fixture -- so both were always empty on both
     * sides of the boundary. Measured at v0.0.98: deleting the two
     * `loadSnapshot` calls from `restoreSimulationRuntime` left **217 files /
     * 2,463 tests green**, because an empty network restored onto an empty
     * network is the same answer either way. That is #375's fourth shape:
     * a fixture that builds an empty instance of the thing whose non-empty
     * behaviour is the subject.
     *
     * The nodes are wired here rather than in `buildPopulatedPrison` because no
     * other case in this file is about them, and through the network's own
     * `addNode`/`connect`/`setFailed` -- the same calls `#25`'s unit tests make
     * -- so this is a document a real save can carry rather than a shape
     * invented to make an assertion fire. A failed producer is included
     * deliberately: `failedNodeIds` is the one section of the payload whose loss
     * changes an *evaluation* rather than only a listing.
     */
    const runtime = buildPopulatedPrison();
    runtime.electricity.addNode({ id: 'generator-0', kind: 'producer', capacityOrDemand: 10 });
    runtime.electricity.addNode({ id: 'lighting-0', kind: 'consumer', capacityOrDemand: 4 });
    runtime.electricity.connect('generator-0', 'lighting-0');
    runtime.water.addNode({ id: 'pump-0', kind: 'producer', capacityOrDemand: 6 });
    runtime.water.addNode({ id: 'shower-0', kind: 'consumer', capacityOrDemand: 6 });
    runtime.water.connect('pump-0', 'shower-0');
    runtime.water.setFailed('pump-0', true);

    // The premise, asserted rather than assumed: the two networks are in
    // different states, and one of them is disabled by the failure.
    expect(runtime.electricity.evaluate().states.get('lighting-0')).toBe('powered');
    expect(runtime.water.evaluate().states.get('shower-0')).toBe('disabled-no-supply');

    const restored = saveAndLoad(runtime);

    // The graph, written out rather than read back off the source network.
    expect(restored.electricity.getSnapshot()).toEqual({
      type: 'electricity',
      nodes: [
        { id: 'generator-0', kind: 'producer', capacityOrDemand: 10 },
        { id: 'lighting-0', kind: 'consumer', capacityOrDemand: 4 },
      ],
      connections: [['generator-0', 'lighting-0']],
      failedNodeIds: [],
    });
    expect(restored.water.getSnapshot()).toEqual({
      type: 'water',
      nodes: [
        { id: 'pump-0', kind: 'producer', capacityOrDemand: 6 },
        { id: 'shower-0', kind: 'consumer', capacityOrDemand: 6 },
      ],
      connections: [['pump-0', 'shower-0']],
      failedNodeIds: ['pump-0'],
    });

    // And behaviourally, which is the half a listing cannot give: the restored
    // prison still has light and still has no water, because the failure came
    // back with the graph.
    expect(restored.electricity.evaluate().states.get('lighting-0')).toBe('powered');
    expect(restored.water.isFailed('pump-0')).toBe(true);
    expect(restored.water.evaluate().states.get('shower-0')).toBe('disabled-no-supply');
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

  /**
   * The positive half of the case above, and until now the branch had none.
   *
   * `restoreSimulationRuntime`'s `else if (entityStore !== undefined)` arm --
   * the one a migrated V1 or a native V2 save restores through -- was covered
   * only by assertions that everything *else* comes back empty, and by
   * `tests/integration/session-restore-failure.test.ts`'s case asserting that
   * a V1 save **cannot** restore at all. Gutted to a no-op, that failure was
   * the only attributable one in the suite: nothing asserted the branch
   * restores anything.
   *
   * So this asserts the ledger itself, through the real save boundary.
   *
   * ### Why the ids are built here rather than taken from a session
   *
   * They are written out as literals -- `0`, `2`, and `0x10_0001` -- so the
   * restored store cannot agree with the fixture by having computed both
   * sides. `0x10_0001` is the interesting one: index 1 was destroyed and
   * respawned, so its generation is 1, and an entity id is
   * `(generation << 20) | index`. A restore that brought back the liveness
   * bitmap but not the generation counters would hand out `1` again and fail
   * here, while agreeing with any assertion phrased as "two entities are
   * alive".
   *
   * This is the matched-capacity case. **The sentence that stood here said
   * #433 still owed the capacity *mismatch*, and that a real V1 save's 8
   * slots against this build's 5,000 was "the case
   * `session-restore-failure.test.ts` pins as a refusal".** It is no longer
   * one: `EntityStore.loadSnapshot` compares the written prefix rather than
   * the allocation, so that V1 save restores, and what
   * `session-restore-failure.test.ts` pins as a refusal is a ledger whose
   * *prefix* is wider than this build can address. The case below is the
   * other direction #433 asked for.
   */
  it('brings a V2-shape save back with its entity ledger alive, ids and generations included', () => {
    const source = new EntityStore(DEFAULT_PRISONER_CAPACITY);
    const first = source.spawn();
    const retired = source.spawn();
    const third = source.spawn();
    source.destroy(retired);
    const reusedSlot = source.spawn();

    // The fixture's own arithmetic, pinned before it is used as an
    // expectation: index in the low 20 bits, generation above it.
    expect([first, retired, third, reusedSlot]).toEqual([0, 1, 2, 0x10_0001]);

    // A V2-shape payload: kernel, world, construction and `entities`, with no
    // `simulation` and no `identity` -- exactly what the V1 -> V5 chain
    // produces and what a native V2 build wrote.
    const donor = createNewSimulationRuntime(SCENARIO_SEED);
    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: PRISON_ID,
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      kernel: donor.kernel.snapshot(),
      world: donor.world.snapshot(),
      construction: donor.construction.snapshot(),
      entities: encodeEntityStoreSnapshot(source.getSnapshot()),
    });
    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');

    const payload = decoded.value.payload as unknown as SessionSnapshotBundle;
    expect(payload.simulation).toBeUndefined();
    const { runtime: restored } = restoreSimulationRuntime(payload);
    const store = restored.prisoners.entityStore;

    expect(store.isAlive(0)).toBe(true);
    expect(store.isAlive(2)).toBe(true);
    expect(store.isAlive(0x10_0001)).toBe(true);
    // The generation, not merely the slot: index 1 answers with its *second*
    // id, and the id it retired is refused.
    expect(store.getIdByIndex(1)).toBe(0x10_0001);
    expect(store.isAlive(1)).toBe(false);
    // The allocator's own position, so a further spawn continues the writing
    // session's sequence instead of colliding with it.
    expect(store.maxActiveIndex).toBe(2);
    expect(store.spawn()).toBe(3);
  });

  /**
   * The reverse direction, and the one that costs more than a ledger to get
   * right (#433): a **populated** save -- every subsystem section present --
   * whose writing build allocated more prisoner slots than this one does.
   *
   * The ledger is the visible half, and `EntityStore.loadSnapshot`'s written
   * prefix covers it. The half underneath is `restoreSessionSystems`, which
   * used to size the prisoner component arrays from the *save's* capacity and
   * then copy them into this runtime's: fine while the two builds agreed, and
   * a bare `RangeError` out of `TypedArray.set` the moment they did not, with
   * nothing said about capacity at all. They are sized to this runtime's store
   * now, and the payload is a prefix, so the copy is well-defined either way.
   *
   * Asserted on the prisoners the *source* runtime holds -- their ids and a
   * component value each -- rather than on a re-captured bundle, and never on
   * a count: an id folds the slot index into it, so a restore that re-homed a
   * slot would renumber them (ADR 0005, ADR 0026) while agreeing with any
   * assertion phrased as "the prisoners are still there".
   */
  it('restores a populated save whose ledger was written at a wider capacity than this build allocates', () => {
    const source = buildPopulatedPrison();
    const bundle = captureSessionSnapshot(source);
    const ledger = bundle.entities;
    if (ledger === undefined || bundle.simulation === undefined) {
      throw new Error('a populated prison must capture both an entity ledger and a simulation section');
    }

    // What the source prison actually holds, read before anything is
    // rewritten, so the expectations below come from a live runtime rather
    // than from the payload under test.
    const liveIndices = [...Array(source.prisoners.entityStore.maxActiveIndex + 1).keys()].filter((index) =>
      source.prisoners.entityStore.isIndexAlive(index),
    );
    expect(liveIndices.length).toBeGreaterThan(1);
    const expected = liveIndices.map((index) => ({
      id: source.prisoners.entityStore.getIdByIndex(index),
      sentenceEndTick: source.prisoners.records.sentenceEndTick[index]!,
    }));

    // The same save, written by a build with 8,000 prisoner slots. Only the
    // ledger's *allocation* changes: the runs the writing build wrote are
    // untouched and the unallocated tail grows, which is exactly the
    // difference between two builds' `DEFAULT_PRISONER_CAPACITY`.
    const widerCapacity = DEFAULT_PRISONER_CAPACITY + 3_000;
    const padded = (runs: readonly (readonly [number, number])[]): readonly (readonly [number, number])[] => [
      ...runs,
      [0, widerCapacity - DEFAULT_PRISONER_CAPACITY] as const,
    ];
    const envelope = createSaveEnvelope({
      gameVersion: 'lockstate-0.0.0',
      prisonId: PRISON_ID,
      revision: 1,
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_001,
      kernel: bundle.kernel,
      world: bundle.world,
      construction: bundle.construction,
      entities: { ...ledger, capacity: widerCapacity, generations: padded(ledger.generations), alive: padded(ledger.alive) },
      simulation: bundle.simulation,
      ...(bundle.identity === undefined ? {} : { identity: bundle.identity }),
    });

    const decoded = decodeSaveEnvelope(JSON.parse(JSON.stringify(envelope)) as unknown);
    expect(decoded).toMatchObject({ ok: true, migrated: false });
    if (!decoded.ok) throw new Error('the envelope must decode for this test to mean anything');
    expect(decoded.value.payload.entities?.capacity).toBe(widerCapacity);

    const { runtime: restored } = restoreSimulationRuntime(
      decoded.value.payload as unknown as SessionSnapshotBundle,
      SCENARIO_SEED,
    );

    expect(restored.prisoners.entityStore.capacity).toBe(DEFAULT_PRISONER_CAPACITY);
    for (const { id, sentenceEndTick } of expected) {
      expect(restored.prisoners.entityStore.isAlive(id), `entity ${id}`).toBe(true);
      expect(restored.prisoners.records.sentenceEndTick[restored.prisoners.entityStore.getIndex(id)]).toBe(sentenceEndTick);
    }
  });
});

/**
 * #108, stated as the thing a player does: build a wall, save, load, undo.
 *
 * This is separate from the populated-prison block above because it needs a
 * session whose *only* interesting state is the build history, and because it
 * has to drive `Undo` as a real command through the kernel rather than
 * calling `ConstructionSystem.undo()` directly -- the restored runtime has to
 * wire the construction command handler for the undo to reach anything at
 * all.
 */
describe('a build history survives save -> load', () => {
  it('undoes the gesture the player made last, not the one before it', () => {
    const runtime = createNewSimulationRuntime(SCENARIO_SEED);

    // Two gestures, the newest of two orders. The newest one is the case that
    // was silently dropped: it is still in `ConstructionSystem`'s open buffer
    // at save time, and nothing flushes that buffer except the next gesture
    // or an undo.
    const placements: readonly { readonly id: string; readonly y: number; readonly transactionId: string }[] = [
      { id: 'wall-a1', y: 3, transactionId: 'gesture-a' },
      { id: 'wall-b1', y: 4, transactionId: 'gesture-b' },
      { id: 'wall-b2', y: 5, transactionId: 'gesture-b' },
    ];
    placements.forEach((placement, sequence) => {
      runtime.kernel.submitCommand(
        `place-${sequence}`,
        sequence,
        0,
        packCommand({ type: 'PlaceBuildOrder', orderId: placement.id, definitionId: 'wall-brick', x: 3, y: placement.y, transactionId: placement.transactionId }),
      );
    });
    step(runtime, 1);
    for (const placement of placements) {
      expect(runtime.construction.getOrder(placement.id)?.state).not.toBe('cancelled');
    }

    const restored = saveAndLoad(runtime);
    for (const placement of placements) {
      expect(restored.construction.getOrder(placement.id), placement.id).toBeDefined();
    }

    // `Undo` through the kernel, at the restored session's own tick and
    // sequence -- the same path a keybinding or an undo button would take.
    restored.kernel.submitCommand('undo-1', placements.length, restored.kernel.tick, packCommand({ type: 'Undo' }));
    step(restored, 1);

    expect(restored.construction.getOrder('wall-b1')?.state).toBe('cancelled');
    expect(restored.construction.getOrder('wall-b2')?.state).toBe('cancelled');
    expect(restored.construction.getOrder('wall-a1')?.state).not.toBe('cancelled');

    // The older gesture is still there to be taken back next, rather than
    // having been consumed by the first undo.
    restored.kernel.submitCommand('undo-2', placements.length + 1, restored.kernel.tick, packCommand({ type: 'Undo' }));
    step(restored, 1);
    expect(restored.construction.getOrder('wall-a1')?.state).toBe('cancelled');

    // ...and redo brings them back in the reverse order, so the save carried
    // a working stack and not just a list.
    restored.kernel.submitCommand('redo-1', placements.length + 2, restored.kernel.tick, packCommand({ type: 'Redo' }));
    step(restored, 1);
    expect(restored.construction.getOrder('wall-a1')?.state).toBe('approved');
    expect(restored.construction.getOrder('wall-b1')?.state).toBe('cancelled');
  });
});
