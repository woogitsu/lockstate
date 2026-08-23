import type { ConstructionSnapshot } from '../construction/system';
import type { ActorIdentitySnapshot } from '../identity';
import { decodeEntityStoreSnapshot, encodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../entity/entity-codec';
import type { KernelSnapshot } from '../kernel/kernel';
import type { NamedRngStreamState } from '../rng/streams';
import type { WorldSnapshotV1 } from '../world/sparse-world';
import { SparseWorld } from '../world/sparse-world';
import { createNewSimulationRuntime, type SimulationRuntime } from './new-session';
import { captureSessionSystems, restoreSessionSystems, type EncodedSessionSystems } from './session-systems';

/**
 * The simulation state a session snapshot carries across the worker
 * protocol boundary and into a save.
 *
 * This is the *simulation's* view of a snapshot; `SavePayload`
 * (`src/persistence/save-schema.ts`) is the persistence layer's Zod-validated
 * mirror of the same shape. They are deliberately separate declarations:
 * the worker must not depend on `src/persistence`, and the save schema
 * evolves under its own version/migration contract.
 */
export interface SessionSnapshotBundle {
  readonly kernel: KernelSnapshot;
  readonly world: WorldSnapshotV1;
  readonly construction: ConstructionSnapshot;
  /**
   * JSON-safe (see `entity-codec.ts`): the worker protocol declares its
   * `structured-clone` payload as `jsonValue`, so a raw typed array here
   * would be rejected by the main thread's own message decoder before it
   * could ever reach a save.
   */
  readonly entities?: EncodedEntityStoreSnapshot;
  /**
   * Every other subsystem that holds authoritative state (issue #70):
   * prisoner components, operations, navigation doors, security, contraband
   * and incidents. See `session-systems.ts` for the encoding and
   * `docs/PERSISTENCE.md` for what is excluded and why.
   *
   * Optional because a V2 save (and a V2 worker message) does not carry it;
   * a bundle without it restores exactly as V2 did, with those subsystems
   * rebuilt empty, rather than failing.
   */
  readonly simulation?: EncodedSessionSystems;
  /**
   * Names for prisoners and staff (ADR 0015, #75).
   *
   * A **session-level** field rather than part of `simulation.prisoners` or
   * `simulation.security`, because `ActorIdentityRegistry` spans both
   * `EntityStore`s: prisoners and guards each hand out id `0`, so `kind` is
   * load-bearing and nesting it under either population would misfile half
   * of it. Already JSON-safe and canonically ordered by the registry itself
   * (declared kind order, then ascending entity id).
   *
   * Optional for the same reason `simulation` is: a V2 save genuinely
   * predates naming, and restoring it leaves an empty registry where every
   * row simply projects no name — the same state a session that never
   * registered the RNG stream is in. Nothing throws, and no migration has
   * to invent names.
   */
  readonly identity?: ActorIdentitySnapshot;
}

/** `schemaId` this bundle travels under in the worker protocol's `versionedPayload`. */
export const SESSION_SNAPSHOT_SCHEMA_ID = 'simulation-save-payload';
/**
 * Bumped to 2 by #50: `entities` changed from capacity-shaped arrays to
 * population-shaped run-length encoding. Bumped to 3 by #70: the bundle
 * gained `simulation`, carrying the twenty-odd subsystems that held real
 * state and were never persisted. ADR 0003 gives a snapshot its own
 * `schemaVersion` precisely so a payload shape change can be declared here
 * without dragging the protocol version with it -- and declaring it matters,
 * because a build that received the other shape silently would restore a
 * corrupt liveness ledger instead of faulting `snapshot-incompatible`.
 */
export const SESSION_SNAPSHOT_SCHEMA_VERSION = 3;

/**
 * What a session snapshot actually restores, stated explicitly rather
 * than implied.
 *
 * Until V3 (#70) the bundle carried the kernel, the world, construction and
 * entity-id liveness and nothing else, so a prison round-tripped through
 * save/load as terrain and walls. V3 adds every subsystem that holds
 * authoritative state; what remains in the right-hand column is state that is
 * genuinely *derived* or genuinely *in flight*, not state that was forgotten:
 *
 * - Room/topology geometry is a pure cache recomputed from `SparseWorld`.
 * - Navigation's route/flow-field caches and its pending path-request queue
 *   belong to a `NavigationSystem` instance a restored session rebuilds; the
 *   subsystems that referenced one (prisoners mid-travel, guards mid-leg,
 *   carry jobs, search legs, incident responses) each reset that reference on
 *   restore, idempotently, and re-request on their next scheduled tick.
 *
 * `docs/PERSISTENCE.md` records the reason for every exclusion.
 * `restoreSimulationRuntime` returns this summary so a caller -- and the
 * player-facing UI -- can be honest about what came back.
 */
export interface RestoredScope {
  /** Always restored by a current-version snapshot. */
  readonly restored: readonly string[];
  /** Rebuilt from scratch, because it is derived state or in-flight work rather than authoritative state. */
  readonly notCarriedByThisSaveVersion: readonly string[];
}

export const CURRENT_SAVE_RESTORED_SCOPE: RestoredScope = {
  restored: [
    'kernel tick and command queue',
    'RNG stream states',
    'world terrain and ownership',
    'construction orders and undo/redo',
    'entity id liveness',
    'prisoners, needs, actions and cell assignments',
    'jobs, containers and utility networks',
    'doors, security sectors, guards and patrols',
    'contraband, intelligence and searches',
    'incidents, gangs and tunnels',
    'prisoner and staff names',
  ],
  notCarriedByThisSaveVersion: ['room and topology caches (recomputed from the world)', 'navigation caches and in-flight path requests (re-issued on the next tick)'],
};

export interface RestoreResult {
  readonly runtime: SimulationRuntime;
  readonly scope: RestoredScope;
}

/**
 * The save schema validates RNG words as a 4-tuple (`z.tuple`), but a
 * payload that has crossed a `DeepReadonly`/JSON boundary widens that back
 * to `readonly number[]`. Re-narrowing explicitly (rather than casting the
 * whole snapshot) keeps the tuple guarantee checked at the one point it is
 * actually reconstructed, so a hand-edited save or a malformed worker
 * message fails here with a clear message instead of corrupting an RNG
 * stream.
 */
function toRngStreamState(entry: { readonly name: string; readonly state: { readonly algorithm: string; readonly version: number; readonly words: readonly number[] } }): NamedRngStreamState {
  const words = entry.state.words;
  if (words.length !== 4) {
    throw new RangeError(`RNG stream "${entry.name}" must have exactly 4 state words, got ${words.length}.`);
  }
  if (entry.state.algorithm !== 'xoshiro128**' || entry.state.version !== 1) {
    throw new RangeError(`RNG stream "${entry.name}" has an unsupported algorithm/version.`);
  }
  return {
    name: entry.name,
    state: { algorithm: 'xoshiro128**', version: 1, words: [words[0]!, words[1]!, words[2]!, words[3]!] },
  };
}

function toKernelSnapshot(kernel: SessionSnapshotBundle['kernel']): KernelSnapshot {
  return {
    tick: kernel.tick,
    expectedSequence: kernel.expectedSequence,
    rngStates: kernel.rngStates.map(toRngStreamState),
    commands: kernel.commands.map((command) => ({ id: command.id, sequence: command.sequence, executeAtTick: command.executeAtTick, payload: command.payload })),
  };
}

/**
 * Captures the current simulation state of a live runtime as a bundle
 * suitable for both the worker protocol and a save envelope. Reads only
 * the runtime's own snapshot methods -- never renderer state.
 */
export function captureSessionSnapshot(runtime: SimulationRuntime): SessionSnapshotBundle {
  return {
    kernel: runtime.kernel.snapshot(),
    world: runtime.world.snapshot(),
    construction: runtime.construction.snapshot(),
    entities: encodeEntityStoreSnapshot(runtime.prisoners.entityStore.getSnapshot()),
    simulation: captureSessionSystems(runtime),
    identity: runtime.actorIdentity.getSnapshot(),
  };
}

/**
 * Rebuilds a live `SimulationRuntime` from a session snapshot bundle.
 *
 * Restores the world first, then wires the identical system graph a new
 * session gets (via `createNewSimulationRuntime`'s `world` option, so there
 * is exactly one definition of how a session is assembled), then applies
 * the kernel and construction snapshots onto it.
 */
export function restoreSimulationRuntime(bundle: SessionSnapshotBundle, masterSeed = 0): RestoreResult {
  const world = SparseWorld.fromSnapshot(bundle.world);
  const runtime = createNewSimulationRuntime(masterSeed, { world });

  runtime.construction.restore(bundle.construction);
  runtime.kernel.restoreState(toKernelSnapshot(bundle.kernel));

  const entityStore = bundle.entities === undefined ? undefined : decodeEntityStoreSnapshot(bundle.entities);
  if (bundle.simulation !== undefined) {
    // Prisoner components are meaningless without the liveness ledger that
    // says which slots they describe, and `PrisonerOperationsRuntime` loads
    // both in one call so its query bitset is re-derived from the restored
    // store. A `simulation` section without `entities` is therefore a
    // malformed bundle, not a partial one.
    if (entityStore === undefined) {
      throw new RangeError('A session bundle carrying `simulation` must also carry `entities`: prisoner components describe entity slots.');
    }
    restoreSessionSystems(runtime, bundle.simulation, entityStore);
  } else if (entityStore !== undefined) {
    // V2 shape: liveness only, every other subsystem rebuilt empty.
    runtime.prisoners.entityStore.loadSnapshot(entityStore);
  }

  // Independent of `simulation`: the registry is keyed by `(kind, entityId)`
  // and validates its own entries, so it neither needs nor reads the
  // subsystem sections. Absent (a pre-#75 save), the registry stays empty and
  // rows project no name rather than being handed invented ones.
  if (bundle.identity !== undefined) {
    runtime.actorIdentity.loadSnapshot(bundle.identity);
  }

  return { runtime, scope: CURRENT_SAVE_RESTORED_SCOPE };
}
