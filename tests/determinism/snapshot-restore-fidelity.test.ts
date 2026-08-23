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
 * A scenario whose entire *live* state sits inside `CURRENT_SAVE_RESTORED_SCOPE`, so
 * "restore then continue" and "just continue" are comparable without
 * asserting anything the save schema never promised.
 *
 * Entities are spawned straight on the `EntityStore` rather than through
 * `admitPrisoner`: the save carries entity-id liveness (indices, generations,
 * free list) but no prisoner components, and `restoreSimulationRuntime`
 * loads the store without re-deriving the query bitset -- so a prisoner
 * admitted through the runtime would legitimately not resume. Spawning
 * directly exercises exactly the liveness bookkeeping the save does carry,
 * including recycled indices and bumped generations.
 */
function buildCarriedScopeSession(): SimulationRuntime {
  const runtime = createNewSimulationRuntime(SEED);
  reapplySessionSetup(runtime);

  const ids = [runtime.prisoners.entityStore.spawn(), runtime.prisoners.entityStore.spawn(), runtime.prisoners.entityStore.spawn()];
  runtime.prisoners.entityStore.destroy(ids[1]!);
  runtime.prisoners.entityStore.spawn(); // recycles index 1 with a bumped generation

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
  runtime.containers.require('construction-materials').deposit('brick', 500);
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

  it('a captured bundle survives a restore byte-identically, including pending commands and RNG stream states', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(runtime);
    step(runtime, 55); // stops with the tick-70 command still queued

    const bundle = captureSessionSnapshot(runtime);
    expect(bundle.kernel.commands.length).toBeGreaterThan(0);

    const { runtime: restored } = restoreSimulationRuntime(bundle, SCENARIO_SEED);
    expect(toJsonValue(captureSessionSnapshot(restored))).toEqual(toJsonValue(bundle));
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

  it('states plainly which subsystems the current save version cannot resume, so a schema bump must update this pin deliberately', () => {
    // Not a wish list: this is the executable form of the limitation
    // `restore-session.ts` documents. A replay verifier (ADR 0009) may not
    // assume any of these resume from a save payload.
    expect([...CURRENT_SAVE_RESTORED_SCOPE.restored].sort()).toEqual([
      'RNG stream states',
      'construction orders and undo/redo',
      'entity id liveness',
      'kernel tick and command queue',
      'world terrain and ownership',
    ]);
    expect([...CURRENT_SAVE_RESTORED_SCOPE.notCarriedByThisSaveVersion].sort()).toEqual([
      'contraband and intelligence',
      'incidents and gangs',
      'jobs and inventory',
      'prisoner needs and actions',
      'security sectors, guards and patrols',
    ]);

    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(runtime);
    step(runtime, 200);
    expect(runtime.searchSystem.getMetrics().searchesCompleted).toBeGreaterThan(0);

    const { runtime: restored } = restoreSimulationRuntime(captureSessionSnapshot(runtime), SCENARIO_SEED);
    expect(restored.searchSystem.getMetrics()).toEqual({ itemsDiscovered: 0, itemsMissed: 0, searchesCompleted: 0, searchesCancelled: 0, searchesQueued: 0 });
    expect(restored.contraband.all()).toEqual([]);
    expect(restored.securityGuards.allGuardIds()).toEqual([]);
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

    runtime.prisoners.roomInstances.register({ instanceId: 'cell-a', roomCatalogId: 'room.cell', anchorTile: tile, capacity: 1, objectCapabilities: [] });
    runtime.prisoners.roomInstances.register({ instanceId: 'cell-b', roomCatalogId: 'room.cell', anchorTile: tile, capacity: 1, objectCapabilities: [] });
    runtime.contraband.introduce('item-a', 'contraband.phone', { kind: 'cell', id: 'cell-a' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 0 });
    runtime.contraband.introduce('item-b', 'contraband.phone', { kind: 'cell', id: 'cell-b' }, { sourceType: 'room-object', sourceId: 'workshop', introducedAtTick: 0 });
    runtime.searchPolicies.push({ scope: 'cell', requiredGuardCount: 1, dwellTicksPerTarget: 5, baseDetectionProbability: 0.5, concealmentPenaltyPerPoint: 0, intelligenceConfidenceBonus: 0 });
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

  it('subsystems with no in-flight travel state round-trip their snapshot unchanged', () => {
    const runtime = buildDeterminismScenario(SCENARIO_SEED);
    submitScenarioCommands(runtime);
    step(runtime, 200);

    const roundTripIsExact = <T>(label: string, read: () => T, write: (value: T) => void): void => {
      const before = toJsonValue(read());
      write(read());
      expect(toJsonValue(read()), label).toEqual(before);
    };

    roundTripIsExact('contraband', () => runtime.contraband.getSnapshot(), (value) => runtime.contraband.loadSnapshot(value));
    roundTripIsExact('intelligence', () => runtime.intelligence.getSnapshot(), (value) => runtime.intelligence.loadSnapshot(value));
    roundTripIsExact('confiscations', () => runtime.confiscations.getSnapshot(), (value) => runtime.confiscations.loadSnapshot(value));
    roundTripIsExact('incidents', () => runtime.incidents.getSnapshot(), (value) => runtime.incidents.loadSnapshot(value));
    roundTripIsExact('gangs', () => runtime.gangs.getSnapshot(), (value) => runtime.gangs.loadSnapshot(value));
    roundTripIsExact('sectorRisk', () => runtime.sectorRisk.getSnapshot(), (value) => runtime.sectorRisk.loadSnapshot(value));
    roundTripIsExact('tunnels', () => runtime.tunnels.getSnapshot(), (value) => runtime.tunnels.loadSnapshot(value));
    roundTripIsExact('containers', () => runtime.containers.getSnapshot(), (value) => runtime.containers.loadSnapshot(value));
    roundTripIsExact('jobWorkers', () => runtime.jobWorkers.getSnapshot(), (value) => runtime.jobWorkers.loadSnapshot(value));
    roundTripIsExact('roomInstances', () => runtime.prisoners.roomInstances.getSnapshot(), (value) => runtime.prisoners.roomInstances.loadSnapshot(value));
    roundTripIsExact('incidentTrigger', () => runtime.incidentTriggerSystem.getSnapshot(), (value) => runtime.incidentTriggerSystem.loadSnapshot(value));
    roundTripIsExact('incidentResponse', () => runtime.incidentResponseSystem.getSnapshot(), (value) => runtime.incidentResponseSystem.loadSnapshot(value));
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

    const resetIsIdempotent = <T>(label: string, read: () => T, write: (value: T) => void): void => {
      write(read());
      const afterFirst = toJsonValue(read());
      write(read());
      expect(toJsonValue(read()), label).toEqual(afterFirst);
    };

    // Guard travel really is in flight here, so the reset path is exercised
    // rather than trivially satisfied by an idle roster.
    expect(runtime.securityGuards.allGuardIds().some((id) => runtime.securityGuards.getPathRequestId(id) !== undefined)).toBe(true);

    resetIsIdempotent('securityGuards', () => runtime.securityGuards.getSnapshot(), (value) => runtime.securityGuards.loadSnapshot(value));
    resetIsIdempotent('jobs', () => runtime.jobs.getSnapshot(), (value) => runtime.jobs.loadSnapshot(value));
    resetIsIdempotent('prisoners', () => runtime.prisoners.getSnapshot(), (value) => runtime.prisoners.loadSnapshot(value));
    resetIsIdempotent('search', () => runtime.searchSystem.getSnapshot(), (value) => runtime.searchSystem.loadSnapshot(value));
  });
});
