import type { JsonValue } from '../../src/shared/json';
import { canonicalJson, deterministicStateHash } from '../../src/simulation/determinism/canonical';
import { encodeEntityStoreSnapshot } from '../../src/simulation/entity/entity-codec';
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
 * The subset of a session snapshot that is comparable *tick for tick* across
 * a save/restore boundary: kernel tick, command queue and RNG streams, world
 * terrain/ownership, construction orders and undo/redo, and entity-id
 * liveness.
 *
 * Kept separate from `fullRuntimeState` on purpose, and narrower than
 * `CURRENT_SAVE_RESTORED_SCOPE` since save-schema V3 (#70) — the payload now
 * carries prisoners, operations, security, contraband and incidents too, but
 * several of those deliberately restart in-flight navigation work on restore
 * (a path request belongs to the previous `NavigationSystem` instance). A
 * restored session therefore reaches the same *state* and not always at the
 * same tick, so comparing those subsystems after continuing would assert a
 * documented, bounded loss rather than a determinism property.
 * `tests/determinism/snapshot-restore-fidelity.test.ts` covers them instead
 * by exactness-or-idempotence, and
 * `tests/integration/session-save-round-trip.test.ts` by behaviour.
 */
export function carriedScopeState(runtime: SimulationRuntime): JsonValue {
  return toJsonValue({
    kernel: runtime.kernel.snapshot(),
    world: runtime.world.snapshot(),
    construction: runtime.construction.snapshot(),
    // The *encoded* liveness ledger, not `EntityStore.getSnapshot()`'s raw
    // arrays. `freeIndices` is a stack whose entries above `freeCount` are
    // never read, so the store leaves stale values there; the codec writes
    // only the live prefix and `decodeEntityStoreSnapshot` restores the tail
    // as zeroes (documented in `src/simulation/entity/entity-codec.ts`).
    // The raw arrays therefore differ between a continuous and a restored
    // run without the simulations differing at all -- which means a replay
    // verifier (ADR 0009) must hash this canonical encoded form, never the
    // store's in-memory arrays.
    entityLiveness: encodeEntityStoreSnapshot(runtime.prisoners.entityStore.getSnapshot()),
  });
}

/**
 * Every snapshot and metrics surface the runtime exposes **except the
 * economy** -- the broadest state two runs can be compared on, with one
 * documented hole.
 *
 * **That sentence read "every snapshot and metrics surface the runtime
 * exposes", full stop, and it was too broad** -- flagged by an external audit
 * of 2026-08-31 and true when checked: neither the word `treasury` nor
 * `balance` occurs anywhere in this file. `SimulationRuntime` exposes
 * `treasury`, `procurement`, `justInTimeMaterials`, `stateIncome`, `loans` and
 * `payroll`, and **none of them is read here**, so two runtimes that differ in
 * nothing but money produce the same fingerprint.
 *
 * **The exclusion is deliberate and is pinned rather than accidental**, which
 * is the half the audit could not see from this file: `#697` asserts it
 * directly, with two sessions differing only in balance hashing identically as
 * runtimes. The surface that *does* see money is the **save checksum**, which
 * `#697` pins in the other direction, and `src/simulation/economy/treasury.ts`
 * carries the same measurement at its own site.
 *
 * **What was actually wrong was where that was written down.** A reader of
 * `treasury.ts` knew; a reader of this file was told the opposite by the one
 * line describing it. The exclusion is stated here now, so the two files agree
 * and so the next person to add an economy surface has to decide rather than
 * assume.
 *
 * **This is not a claim that the economy is deterministic.** It is a claim
 * about what this helper compares. If a determinism defect ever lands in
 * money, no test built on this function will notice it -- and that is the
 * decision to revisit, not this comment.
 */
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

export function hashCarriedScope(runtime: SimulationRuntime): string {
  return deterministicStateHash(carriedScopeState(runtime));
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
