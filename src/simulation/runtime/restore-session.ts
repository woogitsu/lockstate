import type { ConstructionSnapshot } from '../construction/system';
import { decodeEntityStoreSnapshot, encodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../entity/entity-codec';
import type { KernelSnapshot } from '../kernel/kernel';
import type { NamedRngStreamState } from '../rng/streams';
import type { WorldSnapshotV1 } from '../world/sparse-world';
import { SparseWorld } from '../world/sparse-world';
import { createNewSimulationRuntime, type SimulationRuntime } from './new-session';

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
}

/** `schemaId` this bundle travels under in the worker protocol's `versionedPayload`. */
export const SESSION_SNAPSHOT_SCHEMA_ID = 'simulation-save-payload';
/**
 * Bumped to 2 by #50: `entities` changed from capacity-shaped arrays to
 * population-shaped run-length encoding. ADR 0003 gives a snapshot its own
 * `schemaVersion` precisely so a payload shape change can be declared here
 * without dragging the protocol version with it -- and declaring it matters,
 * because a build that received the other shape silently would restore a
 * corrupt liveness ledger instead of faulting `snapshot-incompatible`.
 */
export const SESSION_SNAPSHOT_SCHEMA_VERSION = 2;

/**
 * What a session snapshot actually restores, stated explicitly rather
 * than implied.
 *
 * The bundle above carries the kernel (tick, command queue, RNG stream
 * states), the world, the construction system and entity-id liveness --
 * and deliberately nothing else. The simulation systems shipped after #18
 * defined that shape (navigation caches, prisoner needs/actions,
 * jobs/inventory, security sectors/guards, contraband/intelligence,
 * incidents) each own snapshot state it does not yet carry, so a restored
 * session rebuilds those subsystems *empty*, exactly as a new session does.
 *
 * That is a real, bounded limitation, not an oversight to paper over:
 * extending it is a save-schema change (a new version plus a migration, per
 * `AGENTS.md`'s "every persistent format must have a version and migration
 * strategy"), which is its own issue rather than something to smuggle in
 * here. V2 (#50) changed only how entity liveness is *written down*, not
 * which subsystems are carried, so this list is unchanged by it.
 * `restoreSimulationRuntime` returns this summary so a caller -- and the
 * player-facing UI -- can be honest about what came back.
 */
export interface RestoredScope {
  /** Always restored by a current-version snapshot. */
  readonly restored: readonly string[];
  /** Rebuilt empty because the payload does not carry them yet. */
  readonly notCarriedByThisSaveVersion: readonly string[];
}

export const CURRENT_SAVE_RESTORED_SCOPE: RestoredScope = {
  restored: ['kernel tick and command queue', 'RNG stream states', 'world terrain and ownership', 'construction orders and undo/redo', 'entity id liveness'],
  notCarriedByThisSaveVersion: ['prisoner needs and actions', 'jobs and inventory', 'security sectors, guards and patrols', 'contraband and intelligence', 'incidents and gangs'],
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
  if (bundle.entities !== undefined) {
    runtime.prisoners.entityStore.loadSnapshot(decodeEntityStoreSnapshot(bundle.entities));
  }

  return { runtime, scope: CURRENT_SAVE_RESTORED_SCOPE };
}
