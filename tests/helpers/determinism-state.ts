import type { JsonValue } from '../../src/shared/json';
import { canonicalJson, deterministicStateHash } from '../../src/simulation/determinism/canonical';
import type { SimulationRuntime } from '../../src/simulation/runtime/new-session';

/**
 * Test-only canonicalisation of a live `SimulationRuntime` into a
 * `JsonValue`, so two runs can be compared by a single
 * `deterministicStateHash` instead of by dozens of hand-written
 * assertions.
 *
 * This is deliberately *not* production code and must never be imported by
 * `src/` (docs/TESTING.md: "production modules must not import" test
 * helpers). Its job is to read every snapshot/metrics surface a runtime
 * exposes, so a determinism regression anywhere in the reachable state
 * shows up as a hash difference rather than slipping past an assertion
 * that happened not to cover it.
 */

/** Structural conversion to strict JSON. Rejects anything it cannot canonicalise rather than silently dropping it. */
export function toJsonValue(value: unknown, path = '$'): JsonValue {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'string') return value;
  if (typeof value === 'number') {
    // A NaN/Infinity anywhere in simulation state is itself a determinism
    // hazard (it compares unequal to itself and survives no JSON round
    // trip), so surface it loudly instead of hashing over it.
    if (!Number.isFinite(value)) throw new Error(`Non-finite number in simulation state at ${path}: ${String(value)}`);
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return Array.from(value as unknown as ArrayLike<number>);
  }
  if (Array.isArray(value)) return value.map((entry, index) => toJsonValue(entry, `${path}[${index}]`));
  if (value instanceof Map) {
    return [...value.entries()]
      .map(([key, entry]) => [toJsonValue(key, `${path}.key`), toJsonValue(entry, `${path}.value`)] as const)
      .sort((left, right) => (canonicalJson(left[0]) < canonicalJson(right[0]) ? -1 : 1))
      .map(([key, entry]) => [key, entry]);
  }
  if (value instanceof Set) {
    return [...value]
      .map((entry, index) => toJsonValue(entry, `${path}[${index}]`))
      .sort((left, right) => (canonicalJson(left) < canonicalJson(right) ? -1 : 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, JsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>)) {
      result[key] = toJsonValue((value as Record<string, unknown>)[key], `${path}.${key}`);
    }
    return result;
  }
  throw new Error(`Cannot canonicalise ${typeof value} in simulation state at ${path}`);
}

/**
 * Exactly the state a V1 session snapshot claims to carry across a
 * save/restore boundary (`V1_RESTORED_SCOPE` in
 * `src/simulation/runtime/restore-session.ts`): kernel tick, command
 * queue and RNG streams, world terrain/ownership, construction orders and
 * undo/redo, and entity-id liveness.
 *
 * Kept separate from `fullRuntimeState` on purpose. The subsystems V1 does
 * not carry are rebuilt *empty* by design, so comparing them across a
 * restore would assert a limitation the save schema already documents,
 * not a determinism property.
 */
export function v1RestoredScopeState(runtime: SimulationRuntime): JsonValue {
  return toJsonValue({
    kernel: runtime.kernel.snapshot(),
    world: runtime.world.snapshot(),
    construction: runtime.construction.snapshot(),
    entityLiveness: runtime.prisoners.entityStore.getSnapshot(),
  });
}

/** Every snapshot and metrics surface the runtime exposes -- the broadest state two runs can be compared on. */
export function fullRuntimeState(runtime: SimulationRuntime): JsonValue {
  return toJsonValue({
    kernel: runtime.kernel.snapshot(),
    world: runtime.world.snapshot(),
    construction: runtime.construction.snapshot(),
    prisoners: runtime.prisoners.getSnapshot(),
    prisonerIntakeMetrics: runtime.prisoners.intakeSystem.getMetrics(),
    prisonerActionMetrics: runtime.prisoners.actionSystem.getMetrics(),
    containers: runtime.containers.getSnapshot(),
    jobs: runtime.jobs.getSnapshot(),
    jobWorkers: runtime.jobWorkers.getSnapshot(),
    guards: runtime.securityGuards.getSnapshot(),
    sectorControlStates: runtime.securitySectors.getSnapshot(),
    deploymentMetrics: runtime.deploymentSystem.getMetrics(),
    patrolMetrics: runtime.patrolSystem.getMetrics(),
    contraband: runtime.contraband.getSnapshot(),
    intelligence: runtime.intelligence.getSnapshot(),
    informants: runtime.informants.getSnapshot(),
    confiscations: runtime.confiscations.getSnapshot(),
    search: runtime.searchSystem.getSnapshot(),
    searchMetrics: runtime.searchSystem.getMetrics(),
    incidents: runtime.incidents.getSnapshot(),
    sectorRisk: runtime.sectorRisk.getSnapshot(),
    gangs: runtime.gangs.getSnapshot(),
    tunnels: runtime.tunnels.getSnapshot(),
    incidentTrigger: runtime.incidentTriggerSystem.getSnapshot(),
    incidentResponse: runtime.incidentResponseSystem.getSnapshot(),
    navigationQueue: runtime.navigation.getQueueMetrics(),
    navigationRouteCache: runtime.navigation.getRouteCacheMetrics(),
    navigationFlowFieldCache: runtime.navigation.getFlowFieldCacheMetrics(),
  });
}

export function hashV1RestoredScope(runtime: SimulationRuntime): string {
  return deterministicStateHash(v1RestoredScopeState(runtime));
}

export function hashFullRuntime(runtime: SimulationRuntime): string {
  return deterministicStateHash(fullRuntimeState(runtime));
}

/** Runs `count` ticks, collecting a checkpoint hash every `interval` ticks -- the evidence shape ADR 0009 verifies a challenge submission against. */
export function runWithCheckpoints(
  runtime: SimulationRuntime,
  count: number,
  interval: number,
  hash: (runtime: SimulationRuntime) => string = hashFullRuntime,
): readonly (readonly [number, string])[] {
  const checkpoints: (readonly [number, string])[] = [];
  for (let step = 0; step < count; step += 1) {
    runtime.kernel.step();
    if (runtime.kernel.tick % interval === 0) checkpoints.push([runtime.kernel.tick, hash(runtime)] as const);
  }
  return checkpoints;
}
