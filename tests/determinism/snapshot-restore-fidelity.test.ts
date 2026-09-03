import { describe, expect, it } from 'vitest';
import { packCommand } from '../../src/simulation/protocol/commands';
import {
  captureSessionSnapshot,
  restoreSimulationRuntime,
  CURRENT_SAVE_RESTORED_SCOPE,
} from '../../src/simulation/runtime/restore-session';
import { createNewSimulationRuntime, type SimulationRuntime } from '../../src/simulation/runtime/new-session';
import { tileCoordinate } from '../../src/simulation/world/coordinates';
import { buildDeterminismScenario, SCENARIO_SEED, submitScenarioCommands } from '../helpers/determinism-scenario';
import { toJsonValue, carriedScopeState } from '../helpers/determinism-state';
import { useSearchPolicy } from '../helpers/search-policy';

/**
 * `snapshot() -> restore() -> run N ticks` must land on exactly the state
 * `run N ticks` lands on. ADR 0009 verifies challenge submissions by
 * re-executing a recorded stream on a trusted runner and comparing state
 * hashes, so any divergence introduced by the round trip is not a cosmetic
 * difference -- it silently invalidates stored evidence.
 *
 * These tests deliberately compare at the scope the save schema actually
 * claims (`CURRENT_SAVE_RESTORED_SCOPE`): kernel tick/command queue/RNG streams,
 * world, construction and entity-id liveness. The subsystems the current save version does not
 * carry are rebuilt empty *by design*, and the last test in this file pins
 * that limitation so it cannot drift unnoticed.
 */

const SEED = 7;
const TOTAL_TICKS = 300;

/**
 * A scenario with no in-flight navigation work, so "restore then continue"
 * and "just continue" are comparable tick for tick: the one loss a restore
 * still takes is a path request belonging to the previous `NavigationSystem`
 * instance, and a session with no travelling actor has none.
 *
 * Prisoners are admitted through `admitPrisoner`, the real entry point.
 * Before #70 this scenario spawned entities straight on the `EntityStore`,
 * because the save carried liveness but no prisoner components and a real
 * prisoner therefore could not resume. It now can, so the artificial spawn
 * would test a state production never produces. One index is destroyed and
 * recycled so the liveness bookkeeping (free list, bumped generation) is
 * still exercised.
 */
function buildCarriedScopeSession(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  reapplySessionSetup(runtime);

  runtime.prisoners.roomInstances.register({ instanceId: 'cell-1', roomCatalogId: 'room.cell', anchorTile: { x: tileCoordinate(6), y: tileCoordinate(6) }, residentCapacity: 4, concurrentUseCapacity: 4, objectCapabilities: ['sleep-surface', 'sanitation'] });

  const ids = [
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 900, priorIncidents: 0 }, { x: tileCoordinate(1), y: tileCoordinate(1) }),
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 4_000, priorIncidents: 6 }, { x: tileCoordinate(2), y: tileCoordinate(1) }),
    runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 2_200, priorIncidents: 2 }, { x: tileCoordinate(3), y: tileCoordinate(1) }),
  ];
  runtime.prisoners.entityStore.destroy(ids[1]!);
  // Recycles index 1 with a bumped generation.
  runtime.prisoners.admitPrisoner({ sentenceLengthTicks: 600, priorIncidents: 9 }, { x: tileCoordinate(1), y: tileCoordinate(2) });

  return runtime;
}

/**
 * Session/scenario setup that is *not* part of any save and is re-applied
 * identically by the caller on restore -- the same convention
 * `RoomInstanceRegistry.getSnapshot` and `SecuritySectorRegistry` document
 * for their own static definitions. Here it is the construction material
 * stock the build orders draw from.
 */
function reapplySessionSetup(runtime: SimulationRuntime): void {
  runtime.containers.require('construction-materials').deposit('item.brick', 500);
}

const CARRIED_SCOPE_COMMANDS: readonly { readonly id: string; readonly executeAtTick: number; readonly payload: ReturnType<typeof packCommand> }[] = [
  { id: 'b-0', executeAtTick: 0, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-c', definitionId: 'wall-brick', x: 3, y: 3 }) },
  { id: 'b-1', executeAtTick: 0, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-a', definitionId: 'wall-brick', x: 3, y: 4 }) },
  { id: 'b-2', executeAtTick: 40, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-b', definitionId: 'wall-brick', x: 3, y: 5 }) },
  { id: 'b-3', executeAtTick: 120, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-d', definitionId: 'door-wooden', x: 3, y: 6 }) },
  { id: 'b-4', executeAtTick: 220, payload: packCommand({ type: 'PlaceBuildOrder', orderId: 'wall-e', definitionId: 'wall-brick', x: 3, y: 7 }) },
];

function submitCarriedScopeCommands(runtime: SimulationRuntime): void {
  CARRIED_SCOPE_COMMANDS.forEach((command, sequence) => {
    runtime.kernel.submitCommand(command.id, sequence, command.executeAtTick, command.payload);
  });
}

function step(runtime: SimulationRuntime, count: number): void {
  for (let index = 0; index < count; index += 1) runtime.kernel.step();
}

describe('session snapshot / restore fidelity', () => {
  it('restoring mid-run and continuing lands on the same state as never restoring at all', () => {
    const continuous = buildCarriedScopeSession();
    submitCarriedScopeCommands(continuous);
    step(continuous, TOTAL_TICKS);

    for (const restoreAtTick of [1, 35, 100, 175, 260]) {
      const interrupted = buildCarriedScopeSession();
      submitCarriedScopeCommands(interrupted);
      step(interrupted, restoreAtTick);

      const bundle = captureSessionSnapshot(interrupted);
      const { runtime: restored } = restoreSimulationRuntime(bundle, SEED);
      reapplySessionSetup(restored);
      step(restored, TOTAL_TICKS - restoreAtTick);

      expect(restored.kernel.tick, `restored at tick ${restoreAtTick}`).toBe(TOTAL_TICKS);
      expect(carriedScopeState(restored), `restored at tick ${restoreAtTick}`).toEqual(carriedScopeState(continuous));
    }
  });

  it('restoring twice in a row still lands on the same state -- the round trip is idempotent', () => {
    const continuous = buildCarriedScopeSession();
    submitCarriedScopeCommands(continuous);
    step(continuous, TOTAL_TICKS);

    let current = buildCarriedScopeSession();
    submitCarriedScopeCommands(current);
    for (const segment of [60, 90, 70, 80]) {
      step(current, segment);
      const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(current), SEED);
      reapplySessionSetup(restored);
      current = restored;
    }

    expect(current.kernel.tick).toBe(TOTAL_TICKS);
    expect(carriedScopeState(current)).toEqual(carriedScopeState(continuous));
  });

  it('the scenario really advances the state it compares -- not a comparison of two empty sessions', () => {
    const runtime = buildCarriedScopeSession();
    submitCarriedScopeCommands(runtime);
    step(runtime, TOTAL_TICKS);

    const orders = runtime.construction.snapshot().orders;
    expect(orders).toHaveLength(CARRIED_SCOPE_COMMANDS.length);
    expect(orders.some((order) => order.state === 'completed')).toBe(true);

    // The liveness ledger really does carry a recycled index and a bumped
    // generation, so the entity part of the comparison is not trivial.
    const liveness = runtime.prisoners.entityStore.getSnapshot();
    expect(liveness.maxActiveIndex).toBeGreaterThanOrEqual(2);
    expect(liveness.generations[1]).toBe(1);
    expect(liveness.freeCount).toBe(0);
    // ...and the raw store keeps a stale free-list entry above `freeCount`
    // that a restore normalises away. Nothing reads it, but it is exactly
    // why the comparison hashes the encoded ledger and not these arrays --
    // see `carriedScopeState`.
    expect(liveness.freeIndices[0]).toBe(1);
  });

  it('a captured bundle survives a restore with only the documented in-flight travel reset, and that reset is a fixed point', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(runtime);
    step(runtime, 55); // stops with the tick-70 command still queued

    const bundle = captureSessionSnapshot(runtime);
    expect(bundle.kernel.commands.length).toBeGreaterThan(0);

    const { runtime: restored } = restoreSimulationRuntime(bundle, SCENARIO_SEED);
    const afterFirst = captureSessionSnapshot(restored);

    // Everything except the subsystems that deliberately drop a path request
    // belonging to the previous `NavigationSystem` instance crosses
    // unchanged. Before #70 the whole bundle did, because it carried none of
    // those subsystems at all.
    expect(toJsonValue(afterFirst.kernel)).toEqual(toJsonValue(bundle.kernel));
    expect(toJsonValue(afterFirst.world)).toEqual(toJsonValue(bundle.world));
    expect(toJsonValue(afterFirst.construction)).toEqual(toJsonValue(bundle.construction));
    expect(toJsonValue(afterFirst.entities)).toEqual(toJsonValue(bundle.entities));
    expect(toJsonValue(afterFirst.identity)).toEqual(toJsonValue(bundle.identity));
    expect(toJsonValue(afterFirst.simulation?.incidents)).toEqual(toJsonValue(bundle.simulation?.incidents));
    expect(toJsonValue(afterFirst.simulation?.navigation)).toEqual(toJsonValue(bundle.simulation?.navigation));
    expect(toJsonValue(afterFirst.simulation?.security.sectorDefinitions)).toEqual(toJsonValue(bundle.simulation?.security.sectorDefinitions));
    expect(toJsonValue(afterFirst.simulation?.contraband.items)).toEqual(toJsonValue(bundle.simulation?.contraband.items));

    // The reset really fired here, so the idempotence check below is not
    // trivially satisfied by a session with nothing in flight.
    expect(toJsonValue(afterFirst.simulation?.security.guards)).not.toEqual(toJsonValue(bundle.simulation?.security.guards));

    // And it is a fixed point: restoring the restored bundle changes nothing
    // more. Without this a save written by an already-restored session would
    // drift further from the run it came from on every load.
    const { runtime: twice } = restoreSimulationRuntime(afterFirst, SCENARIO_SEED);
    expect(toJsonValue(captureSessionSnapshot(twice))).toEqual(toJsonValue(afterFirst));
  });

  it('a restored session re-runs a pending command at its original tick, not at the restore tick', () => {
    const runtime = createNewSimulationRuntime(SEED);
    reapplySessionSetup(runtime);
    // Tick 95 is deliberately not a multiple of `ConstructionSystem`'s
    // 10-tick interval, so this observes command dispatch alone rather than
    // dispatch plus the same tick's system pass.
    runtime.kernel.submitCommand('late', 0, 95, packCommand({ type: 'PlaceBuildOrder', orderId: 'late-wall', definitionId: 'wall-brick', x: 2, y: 2 }));
    step(runtime, 20);

    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(runtime), SEED);
    reapplySessionSetup(restored);
    expect(restored.construction.getOrder('late-wall')).toBeUndefined();

    step(restored, 75); // `step()` dispatches for the current tick then advances, so this ends *at* tick 95 with the command still queued
    expect(restored.kernel.tick).toBe(95);
    expect(restored.construction.getOrder('late-wall')).toBeUndefined();
    step(restored, 1); // the tick-95 step dispatches it
    expect(restored.construction.getOrder('late-wall')?.state).toBe('approved');
  });

  it('states plainly what the current save version does and does not resume, so a schema bump must update this pin deliberately', () => {
    // Not a wish list: this is the executable form of what
    // `restore-session.ts` documents. A replay verifier (ADR 0009) may rely
    // on the left-hand list and may not rely on the right-hand one.
    //
    // Pinned as message keys since #226, which moved the English into
    // `src/content/default-locale-en.ts` (ADR 0011: the simulation tier is the
    // one place translated text may never live). The pin is the same deliberate
    // gate it was -- eleven entries and two, each named -- and the English half
    // is pinned character for character in `tests/unit/restored-scope.test.ts`,
    // resolved through the real bundled catalog.
    expect(CURRENT_SAVE_RESTORED_SCOPE.restored.map((entry) => entry.labelKey).sort()).toEqual([
      'save.scope.construction',
      'save.scope.contraband',
      'save.scope.entity-liveness',
      'save.scope.incidents',
      'save.scope.kernel',
      'save.scope.names',
      'save.scope.operations',
      'save.scope.prisoners',
      'save.scope.rng-streams',
      'save.scope.security',
      'save.scope.world',
    ]);
    expect(CURRENT_SAVE_RESTORED_SCOPE.notCarriedByThisSaveVersion.map((entry) => entry.labelKey).sort()).toEqual([
      'save.scope.navigation-caches',
      'save.scope.room-caches',
    ]);

    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(runtime);
    step(runtime, 200);
    expect(runtime.searchSystem.getMetrics().searchesCompleted).toBeGreaterThan(0);

    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(runtime), SCENARIO_SEED);
    // The left-hand list, proven rather than asserted: before #70 every one
    // of these came back empty.
    expect(restored.searchSystem.getMetrics().searchesCompleted).toBe(runtime.searchSystem.getMetrics().searchesCompleted);
    expect(restored.contraband.all()).toEqual(runtime.contraband.all());
    expect(restored.securityGuards.allGuardIds()).toEqual(runtime.securityGuards.allGuardIds());

    // The right-hand list, likewise: a restored session's navigation is a
    // fresh instance, not the one the save was taken against, so its queue
    // and caches start from zero.
    expect(runtime.navigation.getQueueMetrics().resolvedCount).toBeGreaterThan(0);
    expect(restored.navigation.getQueueMetrics().resolvedCount).toBe(0);
  });
});

describe('the save payload is written in canonical order, not registration order', () => {
  /**
   * `docs/DETERMINISM.md`: "anything that feeds simulation state must iterate
   * in a canonical order derived from state -- never `Map`/`Set` insertion
   * order." A save payload feeds simulation state by definition: it is
   * re-inserted on the other side of a restore.
   *
   * Most subsystem snapshots already sorted themselves and are covered by
   * `iteration-order.test.ts` through `fullRuntimeState`. What that helper
   * does *not* read -- and what #70's payload newly carries -- is the set of
   * registries and mutable configuration arrays a session pushes into:
   * doors, sector definitions, room-instance definitions, deployment
   * schedules, search policies, watched incident sectors and search container
   * locations. Building the same prison with those registrations reversed
   * must produce a byte-identical payload; if any of them were written in
   * push order it would not.
   */
  it('produces an identical payload when every incidental registration happens in the opposite order', () => {
    const asBuilt = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(asBuilt);
    step(asBuilt, 250);

    const reversed = buildDeterminismScenario(SCENARIO_SEED, { reverseIncidentalRegistrationOrder: true });
    submitScenarioCommands(reversed);
    step(reversed, 250);

    const built = captureSessionSnapshot(asBuilt);
    // Not vacuous: the sections whose ordering this guards are actually
    // populated by this scenario.
    expect(built.simulation?.navigation.doors.length).toBeGreaterThan(1);
    expect(built.simulation?.security.sectorDefinitions.length).toBeGreaterThan(1);
    expect(built.simulation?.security.schedules.length).toBeGreaterThan(1);
    expect(built.simulation?.prisoners.roomInstanceDefinitions.length).toBeGreaterThan(1);
    expect(built.simulation?.incidents.watchedSectorIds.length).toBeGreaterThan(1);
    expect(built.simulation?.contraband.searchContainerLocations.length).toBeGreaterThan(1);
    // Identity spans both entity stores, so its canonical order (declared
    // kind, then ascending id) has to hold across the two.
    expect(built.identity?.entries.length).toBeGreaterThan(1);
    expect(new Set(built.identity?.entries.map((entry) => entry.kind)).size).toBe(2);

    expect(toJsonValue(captureSessionSnapshot(reversed))).toEqual(toJsonValue(built));
  });
});

describe('subsystem snapshot / restore fidelity', () => {
  /**
   * The defect this pins, in full: `SearchSystem.update` used to iterate
   * `this.active` in `Map` insertion order (the order orders were staffed),
   * while `getSnapshot` emits jobs sorted by id and `loadSnapshot`
   * re-inserts them in that sorted order. Each active job's detection check
   * draws from the shared `contraband.detection` stream, so the round trip
   * silently reassigned draws to different jobs and changed which
   * contraband was discovered -- proven before the fix: a plain run
   * confiscated `item-b`, the same run with a snapshot round trip
   * confiscated `item-a`.
   */
  function buildSearchSession(orderIds: readonly [string, string]): SimulationRuntime {
    const runtime = createNewSimulationRuntime(10);
    const tile = { x: tileCoordinate(5), y: tileCoordinate(5) };

    runtime.prisoners.roomInstances.register({ instanceId: 'cell-a', roomCatalogId: 'room.cell', anchorTile: tile, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
    runtime.prisoners.roomInstances.register({ instanceId: 'cell-b', roomCatalogId: 'room.cell', anchorTile: tile, residentCapacity: 1, concurrentUseCapacity: 1, objectCapabilities: [] });
    runtime.contraband.introduce('item-a', 'contraband.phone', { kind: 'cell', id: 'cell-a' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 0 });
    runtime.contraband.introduce('item-b', 'contraband.phone', { kind: 'cell', id: 'cell-b' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 0 });
    useSearchPolicy(runtime, { scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 0.5, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 });
    /*
     * **Three guards for two one-guard jobs, and the third one is the point.**
     *
     * Since [ADR 0036](../../docs/adr/0036-a-derived-default-security-sector.md)
     * every session carries a derived sector asking for one guard all day, and
     * `DeploymentSystem` (order 270) runs before `SearchSystem` (order 295) and
     * claims the lowest-id unassigned guard. With two hires only one is left for
     * the search queue, so the two jobs run *sequentially* -- and then the FIFO
     * queue's order decides which of them draws from `contraband.detection`
     * first, which is exactly the submission-order dependence the second test
     * below asserts is absent. Measured with two: `['search-a','search-b']`
     * confiscated `item-a` and `['search-b','search-a']` confiscated `item-b`.
     *
     * That is not a determinism defect -- submission order is recorded input
     * (`determinism-scenario.ts` says so of its own queue) -- but it is a
     * different fixture from the one these tests are about, which needs both
     * jobs staffed on the same tick so that job *id* order decides the draws.
     * The third hire restores that condition rather than papering over it.
     */
    runtime.securityGuards.hire('staff-role.guard', tile);
    runtime.securityGuards.hire('staff-role.guard', tile);
    runtime.securityGuards.hire('staff-role.guard', tile);

    for (const orderId of orderIds) {
      runtime.searchSystem.submitOrder({ id: orderId, scope: 'cell', targets: [{ holderKind: 'cell', holderId: orderId === 'search-a' ? 'cell-a' : 'cell-b' }] });
    }
    return runtime;
  }

  const confiscated = (runtime: SimulationRuntime): readonly string[] =>
    runtime.contraband.all().filter((item) => item.state === 'confiscated').map((item) => item.id);

  const runToCompletion = (runtime: SimulationRuntime): void => {
    for (let index = 0; index < 400 && runtime.searchSystem.getMetrics().searchesCompleted < 2; index += 1) runtime.kernel.step();
  };

  it('round-tripping active search jobs through their own snapshot does not change which contraband is found', () => {
    const plain = buildSearchSession(['search-b', 'search-a']);
    plain.kernel.step(); // both orders staffed and dwelling
    runToCompletion(plain);

    const roundTripped = buildSearchSession(['search-b', 'search-a']);
    roundTripped.kernel.step();
    roundTripped.searchSystem.loadSnapshot(roundTripped.searchSystem.getSnapshot());
    runToCompletion(roundTripped);

    expect(plain.searchSystem.getMetrics().searchesCompleted).toBe(2);
    // Not vacuous: the policy's 0.5 detection probability against this
    // seed's first two draws (0.088, 0.555) means exactly one of the two
    // items is found, so whichever job draws first decides the outcome.
    expect(confiscated(plain)).toHaveLength(1);
    expect(confiscated(roundTripped)).toEqual(confiscated(plain));
  });

  it('the order two search orders were submitted in does not change which contraband is found', () => {
    const forwards = buildSearchSession(['search-a', 'search-b']);
    runToCompletion(forwards);
    const backwards = buildSearchSession(['search-b', 'search-a']);
    runToCompletion(backwards);

    expect(confiscated(backwards)).toEqual(confiscated(forwards));
  });

  /**
   * What `write(read())` alone does *not* prove, and why every case below
   * carries a donor state (issue #264 S11).
   *
   * This test used to read `const before = toJsonValue(read()); write(read());
   * expect(toJsonValue(read())).toEqual(before)` for all twelve subsystems --
   * a round trip against its own inverse, which **`write` being a no-op
   * satisfies**, for every one of them. Measured on this file alone: gutting
   * `ConfiscationLedger.loadSnapshot` to `return;` left it 11/11 green, and so did
   * gutting `TunnelRegistry.loadSnapshot`. Both are killed elsewhere in the
   * suite, so the mutation is not a survivor -- but this test, the one that
   * names those subsystems, contributed nothing to the kill. That is the shape
   * `camera-coordinates.test.ts` records as having let #115 ship.
   *
   * So each case now supplies a state the subsystem can hold that this run does
   * *not* hold, from a source the subsystem under test did not produce, and the
   * assertions are ordered: the donor really differs, loading it is observed in
   * full, and only then is the run's own snapshot restored and required to come
   * back exactly. A `loadSnapshot` that ignores its argument fails the second
   * assertion; one that drops a field fails it too, because the whole donor
   * document has to reappear.
   *
   * Nine donors are the snapshot of an *independent* session -- the same
   * scenario, never stepped -- which is a valid state of the same subsystem
   * that nothing in the run under test computed. Two are literals, because
   * this scenario leaves `tunnels` and `incidentResponse` in exactly the state
   * a fresh session has: an empty tunnel registry, four zero counters. Those
   * were the most vacuous cases of all -- `tunnels` was `[] -> [] -> []` -- and
   * a literal is the strongest available fix, since the expected document is
   * then written out rather than read back from anything.
   *
   * **This paragraph said "Three are literals" and named `jobWorkers` as one
   * of them** (*"the same four idle workers"*), and
   * [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) decision 4 retired
   * `JobWorkerPool` -- so there is no such snapshot to round-trip and the
   * third literal is gone with it. Corrected rather than overwritten, because
   * what it recorded about the *scenario* is still true: the scenario has never
   * busied a worker, and what it now leaves on the board is two carry jobs
   * whose `assignedWorkerId` the `jobs` case round-trips.
   */
  it('subsystems with no in-flight travel state round-trip their snapshot unchanged', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(runtime);
    step(runtime, 200);

    /** An independent session, never stepped: a donor of states this run does not hold. */
    const donorSession = buildDeterminismScenario(SCENARIO_SEED);

    const roundTripIsExact = <T>(label: string, read: () => T, write: (value: T) => void, donor: T): void => {
      const original = read();
      const before = toJsonValue(original);
      const foreign = toJsonValue(donor);

      // Non-vacuity first: a donor equal to the run's own state would make the
      // adoption assertion below true for a `loadSnapshot` that does nothing.
      expect(foreign, `${label}: the donor state does not differ from this run's own`).not.toEqual(before);

      // The write is real, and complete: the whole donor document has to be
      // readable back, so ignoring the argument or dropping a field fails here.
      write(donor);
      expect(toJsonValue(read()), `${label}: loadSnapshot did not adopt the snapshot it was given`).toEqual(foreign);

      // And only now the property this test is named for, on a subsystem that
      // has demonstrably been overwritten in between.
      write(original);
      expect(toJsonValue(read()), label).toEqual(before);
    };

    roundTripIsExact('contraband', () => runtime.contraband.getSnapshot(), (value) => runtime.contraband.loadSnapshot(value), donorSession.contraband.getSnapshot());
    roundTripIsExact('intelligence', () => runtime.intelligence.getSnapshot(), (value) => runtime.intelligence.loadSnapshot(value), donorSession.intelligence.getSnapshot());
    roundTripIsExact('confiscations', () => runtime.confiscations.getSnapshot(), (value) => runtime.confiscations.loadSnapshot(value), donorSession.confiscations.getSnapshot());
    roundTripIsExact('incidents', () => runtime.incidents.getSnapshot(), (value) => runtime.incidents.loadSnapshot(value), donorSession.incidents.getSnapshot());
    roundTripIsExact('gangs', () => runtime.gangs.getSnapshot(), (value) => runtime.gangs.loadSnapshot(value), donorSession.gangs.getSnapshot());
    roundTripIsExact('sectorRisk', () => runtime.sectorRisk.getSnapshot(), (value) => runtime.sectorRisk.loadSnapshot(value), donorSession.sectorRisk.getSnapshot());
    roundTripIsExact('containers', () => runtime.containers.getSnapshot(), (value) => runtime.containers.loadSnapshot(value), donorSession.containers.getSnapshot());
    roundTripIsExact('roomInstances', () => runtime.prisoners.roomInstances.getSnapshot(), (value) => runtime.prisoners.roomInstances.loadSnapshot(value), donorSession.prisoners.roomInstances.getSnapshot());
    roundTripIsExact('incidentTrigger', () => runtime.incidentTriggerSystem.getSnapshot(), (value) => runtime.incidentTriggerSystem.loadSnapshot(value), donorSession.incidentTriggerSystem.getSnapshot());

    // The two the scenario itself cannot distinguish, with the donor written
    // out instead. Each is a state its subsystem's own API can reach --
    // `TunnelRegistry.start`/`advance`, four resolved and lapsed incidents --
    // so it is a document a real save can carry, not a shape invented to make
    // an assertion fire.
    //
    // **There were three, and `jobWorkers` was the third.** It wrote
    // `{ workers: [0, 2, 5], busy: [2] }` through `JobWorkerPool.setBusy`, and
    // [ADR 0093](../../docs/adr/0093-a-carry-is-an-action.md) decision 4
    // retired that class: eligibility is the regime's, busyness is the board's,
    // and `operations.jobWorkers` is written empty and ignored on read
    // (decision 5). There is no round trip left to be exact about -- the fact
    // it carried is `assignedWorkerId` on each job, which `jobs` below already
    // round-trips.
    roundTripIsExact('tunnels', () => runtime.tunnels.getSnapshot(), (value) => runtime.tunnels.loadSnapshot(value), [
      { id: 'tunnel-donor', startTile: { x: tileCoordinate(2), y: tileCoordinate(2) }, targetTile: { x: tileCoordinate(9), y: tileCoordinate(3) }, progress: 0.25 },
    ]);
    roundTripIsExact('incidentResponse', () => runtime.incidentResponseSystem.getSnapshot(), (value) => runtime.incidentResponseSystem.loadSnapshot(value), {
      metrics: { incidentsResolved: 3, incidentsLapsed: 2, respondersDispatched: 7, routeFailures: 1 },
    });

    // The scenario is what makes the nine donors above differ at all, so the
    // two literals are here because it produces *nothing* for those
    // subsystems -- not because their donors were awkward to obtain. Pinned, so
    // a scenario that later digs a tunnel is a failure that asks for the
    // literal to be dropped rather than a case that silently goes back to
    // comparing a fresh session against itself.
    expect(donorSession.tunnels.getSnapshot(), 'the scenario now populates tunnels; use its snapshot as the donor').toEqual([]);
    expect(
      toJsonValue(donorSession.incidentResponseSystem.getSnapshot()),
      'the scenario now moves the response metrics; use its snapshot as the donor',
    ).toEqual(toJsonValue(runtime.incidentResponseSystem.getSnapshot()));
  });

  /**
   * `GuardRoster`, `JobBoard`, `PrisonerOperationsRuntime` and
   * `SearchSystem` all *deliberately* reset in-flight travel on restore:
   * a mid-leg path request belongs to the previous `NavigationSystem`
   * instance's queue, which a restored session never received and would
   * never resolve. That is a documented, bounded loss, not a defect -- so
   * the property to pin is not "unchanged" but **idempotent**: whatever the
   * reset produces, restoring the result again must produce exactly the
   * same thing. Without that, a save written by an already-restored session
   * would keep drifting further from the run it came from every time it was
   * loaded.
   */
  it('subsystems that reset in-flight travel on restore do so idempotently', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(runtime);
    step(runtime, 200);

    /**
     * The same donor session the exactness test above uses, and for the same
     * reason (#264 S11): `write(read())` then "the second write changes
     * nothing" is satisfied by `write` doing nothing at all, so idempotence on
     * its own is not evidence that anything was loaded. Measured: gutting
     * `JobBoard.loadSnapshot` to a no-op left this file green even with the
     * exactness test above already strengthened.
     *
     * Never stepped, which is what makes the strong form of the adoption
     * assertion available here despite the reset: a session with no in-flight
     * travel has nothing for `loadSnapshot` to reset, so its snapshot must come
     * back *exactly*. That premise is asserted rather than assumed, by the
     * second of the two `expect` lines below `resetIsIdempotent` -- every
     * guard in `donorSession` answers `undefined` to `getPathRequestId`. (This
     * paragraph named a `hasNoInFlightTravel`, which has never existed in this
     * file or anywhere else in the repository; the assertion is inline and has
     * no name to grep for.)
     */
    const donorSession = buildDeterminismScenario(SCENARIO_SEED);

    const resetIsIdempotent = <T>(label: string, read: () => T, write: (value: T) => void, donor: T): void => {
      const original = read();
      const before = toJsonValue(original);
      const foreign = toJsonValue(donor);
      expect(foreign, `${label}: the donor state does not differ from this run's own`).not.toEqual(before);

      write(donor);
      expect(toJsonValue(read()), `${label}: loadSnapshot did not adopt the snapshot it was given`).toEqual(foreign);

      write(original);
      const afterFirst = toJsonValue(read());
      write(read());
      expect(toJsonValue(read()), label).toEqual(afterFirst);
    };

    // Guard travel really is in flight here, so the reset path is exercised
    // rather than trivially satisfied by an idle roster.
    expect(runtime.securityGuards.allGuardIds().some((id) => runtime.securityGuards.getPathRequestId(id) !== undefined)).toBe(true);
    // And the premise the donor rests on: nothing in the donor session is
    // travelling, so its snapshot is a fixed point of the reset.
    expect(donorSession.securityGuards.allGuardIds().every((id) => donorSession.securityGuards.getPathRequestId(id) === undefined)).toBe(true);

    resetIsIdempotent('securityGuards', () => runtime.securityGuards.getSnapshot(), (value) => runtime.securityGuards.loadSnapshot(value), donorSession.securityGuards.getSnapshot());
    resetIsIdempotent('jobs', () => runtime.jobs.getSnapshot(), (value) => runtime.jobs.loadSnapshot(value), donorSession.jobs.getSnapshot());
    resetIsIdempotent('prisoners', () => runtime.prisoners.getSnapshot(), (value) => runtime.prisoners.loadSnapshot(value), donorSession.prisoners.getSnapshot());
    resetIsIdempotent('search', () => runtime.searchSystem.getSnapshot(), (value) => runtime.searchSystem.loadSnapshot(value), donorSession.searchSystem.getSnapshot());
  });
});
