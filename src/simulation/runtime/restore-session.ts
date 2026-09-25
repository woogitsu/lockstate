import type { JsonValue } from '../../shared/json';
import type { ConstructionSnapshot } from '../construction/system';
import type { ActorIdentitySnapshot } from '../identity';
import { decodeEntityStoreSnapshot, encodeEntityStoreSnapshot, type EncodedEntityStoreSnapshot } from '../entity/entity-codec';
import type { KernelSnapshot } from '../kernel/kernel';
import type { NamedRngStreamState } from '../rng/streams';
import type { WorldSnapshotV1 } from '../world/sparse-world';
import { SparseWorld } from '../world/sparse-world';
import { createNewSimulationRuntime, type SimulationRuntime } from './new-session';
import { SnapshotRefusedError } from './restore-refusal';
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
  /**
   * The u32 the writing session's named RNG streams were derived from
   * (issue #412, ADR 0038 §4).
   *
   * Optional, and **absence means 0** -- not "unknown". That is a statement of
   * fact about the corpus rather than a convention: until issue #479,
   * production never supplied another value (`src/main.ts` constructed
   * `SessionController` with no `masterSeed`, and `session-controller.ts` took
   * `?? 0`), so every save written before #479 was written by a session
   * seeded at 0. #479 gave `src/main.ts` a real `generateMasterSeed`
   * (`crypto.getRandomValues`), so a save written by a build carrying that fix
   * records whatever seed its prison actually drew -- this field's own
   * meaning did not change, only what production feeds it. It is therefore
   * the optional-field pattern `entities` / `simulation` / `identity` already
   * use, `SAVE_SCHEMA_VERSION` stays 5, and no migration step fabricates it.
   *
   * It was inert until #415: the seed's only job was deriving the four initial
   * stream states, and `Kernel.restoreState` overwrote all four. Now that a
   * stream the bundle omits is re-seeded rather than discarded, the seed is the
   * only input that stream has, so a restore has to know it.
   */
  readonly masterSeed?: number;
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
 *
 * **Not bumped by `masterSeed` (#412).** The rule is the same one
 * `docs/PERSISTENCE.md` states for an optional save field and ADR 0038 §4
 * applies to this one: the field is optional, its absence has exactly one
 * meaning (0), and no existing field changed meaning -- so a build that
 * receives a bundle without it restores exactly as it did before rather than
 * mis-reading anything. A bump would only relabel a refusal nobody is making.
 */
export const SESSION_SNAPSHOT_SCHEMA_VERSION = 3;

/**
 * One line of a restore report: a **message key, never text** (ADR 0011).
 *
 * These entries used to be English prose authored right here, in the one tier
 * ADR 0011 says translated text may never live in (issue #226). What a scope
 * carries now is a stable identifier the simulation may hold, resolved to text
 * by the UI at the last possible moment -- the rule `docs/HUD_PROJECTIONS.md`
 * contract 3 states for every projection. `describeRestoredScope` in
 * `src/ui/save-panel.ts` is the resolver; nothing under `src/simulation/**`
 * reads the text.
 *
 * Two naming decisions, both forced rather than preferred:
 *
 * - **The field is `labelKey`**, not `scopeKey` or `entryKey`.
 *   `tests/foundation/localization-key-completeness.test.ts` finds keys by
 *   matching `<name>Key: '<literal>'` and *pins the exact set* of field names
 *   its scan produces (`descriptionKey`, `labelKey`, `nameKey`). Reusing
 *   `labelKey` puts these thirteen keys inside that gate instead of requiring
 *   it to be widened -- the same call PR #234 made for
 *   `HudUnavailableNotice.labelKey`.
 * - **The type is `string`**, not `LocalizationKey`.
 *   `LocalizationKey` is declared in `src/content/localization.ts`, and
 *   `tests/unit/services-layer-boundaries.test.ts` fails any module under
 *   `src/simulation/**` that imports from a specifier ending in
 *   `localization`. `LocalizationKey` is `string`, so the alias would buy a
 *   documentation nicety at the cost of the import that gate exists to
 *   refuse; this comment carries the meaning instead.
 */
export interface RestoredScopeEntry {
  readonly labelKey: string;
}

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
 *   carry jobs, search legs) each reset that reference on restore,
 *   idempotently, and re-request on their next scheduled tick.
 *
 *   **`IncidentResponseSystem` used to be named in that list and does not
 *   belong** (#352, ADR 0033): it cannot re-request, because the incident
 *   lifecycle is forward-only and it holds no record to re-request against.
 *   What a restored session does instead is *release* the claim the interrupted
 *   response was holding -- the responders and the sector lockdown, both of
 *   which the payload carries -- on its first scheduled update. See
 *   `IncidentResponseSystem.releaseOrphanedClaims`.
 *
 *   **Superseded by #1373:** current saves carry pending path requests and
 *   cache membership keys in `simulation.inFlight`. The answers are rebuilt
 *   from the saved world and doors; older saves still follow the old reset.
 *
 * `docs/PERSISTENCE.md` records the reason for every exclusion.
 * `restoreSimulationRuntime` returns this summary so a caller -- and the
 * player-facing UI -- can be honest about what came back.
 */
export interface RestoredScope {
  /** Restored by the bundle this scope describes. */
  readonly restored: readonly RestoredScopeEntry[];
  /**
   * Not restored, for either of two reasons: it is derived state or in-flight
   * work rather than authoritative state, or the bundle simply does not carry
   * the section that holds it because it was written by an older save version.
   *
   * Both belong here, because the player-facing question is the same one --
   * "is this in my prison or not" -- and the answer is no either way. Which of
   * the two applies is a distinction for `docs/PERSISTENCE.md`, not for a
   * status line.
   */
  readonly notCarriedByThisSaveVersion: readonly RestoredScopeEntry[];
}

/**
 * The scope a bundle carrying every section restores.
 *
 * `restoredScopeFor` derives from this rather than from a second list, so the
 * two cannot disagree about what a complete save contains.
 *
 * Eleven keys and two, thirteen in all -- one for each English line this
 * constant used to hold, authored in `src/content/default-locale-en.ts` under
 * `save.scope.*`. The mapping is one-for-one and the strings there are the
 * ones that stood here, character for character: #226's owner decision moved
 * them without touching what a restore reports, so the granularity below
 * (`save.scope.operations` covering three subsystems, `save.scope.names`
 * covering one) is inherited rather than chosen. Regrouping the report is a
 * product change and stays a decision of its own.
 *
 * The slug after `save.scope.` names the *message key* and nothing else.
 * There is no content id behind it and none is persisted -- `docs/CONTENT.md`
 * gains no vocabulary from this, exactly as `save.status.*` adds none.
 */
export const CURRENT_SAVE_RESTORED_SCOPE: RestoredScope = {
  restored: [
    { labelKey: 'save.scope.kernel' },
    { labelKey: 'save.scope.rng-streams' },
    { labelKey: 'save.scope.world' },
    { labelKey: 'save.scope.construction' },
    { labelKey: 'save.scope.entity-liveness' },
    { labelKey: 'save.scope.prisoners' },
    { labelKey: 'save.scope.operations' },
    { labelKey: 'save.scope.security' },
    { labelKey: 'save.scope.contraband' },
    { labelKey: 'save.scope.incidents' },
    { labelKey: 'save.scope.names' },
  ],
  notCarriedByThisSaveVersion: [{ labelKey: 'save.scope.room-caches' }, { labelKey: 'save.scope.navigation-caches' }],
};

/**
 * The three sections a V3 payload may omit, and what each one carries.
 *
 * `entities`, `simulation` and `identity` are `.optional()` in
 * `savePayloadV3Schema`, and a migrated V1/V2 save really does arrive without
 * them -- the migration deliberately does not fabricate an empty section. So
 * the entries below are the ones whose presence in `restored` depends on the
 * bundle rather than on the save version alone.
 *
 * Every `entries` key must appear in `CURRENT_SAVE_RESTORED_SCOPE.restored`,
 * which `tests/unit/restored-scope.test.ts` asserts -- otherwise a rename here
 * would silently stop moving anything.
 *
 * `RestoredScopeEntry` rather than a bare key string, so these declarations are
 * `labelKey: '...'` too and the completeness gate checks this second copy of
 * each key as well as the canonical one above.
 */
const OPTIONAL_SECTION_SCOPE: readonly {
  readonly section: string;
  readonly carries: (bundle: SessionSnapshotBundle) => boolean;
  readonly entries: readonly RestoredScopeEntry[];
}[] = [
  { section: 'entities', carries: (bundle) => bundle.entities !== undefined, entries: [{ labelKey: 'save.scope.entity-liveness' }] },
  {
    section: 'simulation',
    carries: (bundle) => bundle.simulation !== undefined,
    entries: [
      { labelKey: 'save.scope.prisoners' },
      { labelKey: 'save.scope.operations' },
      { labelKey: 'save.scope.security' },
      { labelKey: 'save.scope.contraband' },
      { labelKey: 'save.scope.incidents' },
    ],
  },
  { section: 'identity', carries: (bundle) => bundle.identity !== undefined, entries: [{ labelKey: 'save.scope.names' }] },
];

/**
 * What a *particular* bundle restores.
 *
 * This exists because the scope used to be a module constant returned on every
 * path, including the legacy one thirteen lines below it -- so a V2 save that
 * carried no prisoners at all was reported to the player as having restored
 * "prisoners, needs, actions and cell assignments" (issue #109). The absent-
 * rather-than-empty migration design is deliberate and well argued in
 * `docs/PERSISTENCE.md`; what was missing is the part that reads which
 * sections actually arrived.
 *
 * Order is preserved from `CURRENT_SAVE_RESTORED_SCOPE`, so the sentence the
 * save panel builds reads the same way whichever sections are present.
 */
export function restoredScopeFor(bundle: SessionSnapshotBundle): RestoredScope {
  // Keyed by `labelKey`, not by object identity: `OPTIONAL_SECTION_SCOPE`
  // declares its own `RestoredScopeEntry` literals, so the two lists share
  // keys and never share references.
  const absent = new Set<string>();
  for (const section of OPTIONAL_SECTION_SCOPE) {
    if (section.carries(bundle)) continue;
    for (const entry of section.entries) absent.add(entry.labelKey);
  }
  if (absent.size === 0) return CURRENT_SAVE_RESTORED_SCOPE;

  return {
    restored: CURRENT_SAVE_RESTORED_SCOPE.restored.filter((entry) => !absent.has(entry.labelKey)),
    notCarriedByThisSaveVersion: [
      ...CURRENT_SAVE_RESTORED_SCOPE.notCarriedByThisSaveVersion,
      ...CURRENT_SAVE_RESTORED_SCOPE.restored.filter((entry) => absent.has(entry.labelKey)),
    ],
  };
}

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
    throw new SnapshotRefusedError('damaged-payload', `RNG stream "${entry.name}" must have exactly 4 state words, got ${words.length}.`);
  }
  if (entry.state.algorithm !== 'xoshiro128**' || entry.state.version !== 1) {
    // An algorithm this build does not implement is a save a build that does
    // would read, so it is not the row above (#431).
    throw new SnapshotRefusedError('unsupported-by-this-build', `RNG stream "${entry.name}" has an unsupported algorithm/version.`);
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
    // Read off the runtime, which either was created at this seed or was
    // restored from a bundle that recorded it -- so a save taken after a load
    // reports the seed the session was originally played at, and the value
    // survives any number of round trips.
    masterSeed: runtime.masterSeed,
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
 *
 * ### Which seed the rebuilt runtime is given
 *
 * The bundle's own `masterSeed` where it records one, and the `masterSeed`
 * argument only where it does not. That ordering is the point of #412: the
 * save is the authority on what run it is, and the argument is the default for
 * a save written before the field existed -- which, by the corpus fact
 * recorded on `SessionSnapshotBundle.masterSeed`, is 0 for every such save.
 * Production restores therefore stop taking the `= 0` default by accident and
 * start taking a recorded value, without a caller having to know the seed to
 * pass it in.
 *
 * The seed is load-bearing here rather than cosmetic: `Kernel.restoreState`
 * merges the bundle's streams **over** the four this call has just derived
 * from it (#415), so it is what any stream the bundle omits is seeded from.
 */
export function restoreSimulationRuntime(bundle: SessionSnapshotBundle, masterSeed = 0): RestoreResult {
  const world = SparseWorld.fromSnapshot(bundle.world);
  const runtime = createNewSimulationRuntime(bundle.masterSeed ?? masterSeed, { world });

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
      throw new SnapshotRefusedError(
        'damaged-payload',
        'A session bundle carrying `simulation` must also carry `entities`: prisoner components describe entity slots.',
      );
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

  /*
   * Last, after every population this reads is in place: the guard coverage
   * census, re-derived rather than restored.
   *
   * `SafetyCoverageSystem` holds no snapshot -- its census is a pure function
   * of the sectors, the guards on them and where the prisoners are standing,
   * all three of which the bundle carries -- so `docs/PERSISTENCE.md`'s rule
   * ("authoritative state is persisted; derived state and in-flight work are
   * not") is kept exactly as it was, and no field is added to any payload.
   * What changes is *when* the derivation happens.
   *
   * It used to happen on the system's first scheduled update, ten ticks in,
   * and for every other ten-tick cadence in the kernel that is the right
   * answer. It is the wrong one here because **a restored session does not
   * tick**: `SimulationWorkerStateMachine.handleInitialize` transitions to `paused`
   * and then publishes one `simulation/status-counts` immediately -- on
   * purpose, so that a prison with a population is not shown as a row of
   * zeros -- and the next tick is whenever the player presses play. So the
   * strip's coverage chip read `0` on a prison holding twelve people, under
   * the green `Covered` badge `coverageBadge` prints whenever no rung is
   * short, for as long as the player left it paused. Measured in
   * `tests/integration/session-save-round-trip.test.ts`.
   *
   * `takeCensus` provisions nothing: no time passed between the save and the
   * load, and the same test asserts no prisoner's `safety` moves across it.
   */
  runtime.safetyCoverage.takeCensus(runtime.kernel.tick);

  return { runtime, scope: restoredScopeFor(bundle) };
}

/**
 * The one place a transport payload becomes a `SessionSnapshotBundle`.
 *
 * **This is a declared unsafe step, not a check**, and the point of giving it
 * a name and a signature is that the unsafety stops being invisible. Three
 * call sites used to spell `snapshot.data as unknown as SessionSnapshotBundle`
 * inline -- `src/ui/simulation-commands.ts`,
 * `src/rendering/feed/simulation-snapshot-feed.ts` and
 * `src/simulation/worker/state-machine.ts` -- and all three now call this. The
 * fourth site of the same seam is the save reader, which has a typed payload
 * rather than a transport one and goes through `bundleFromSavePayload` in
 * `src/persistence/session/session-controller.ts` instead.
 *
 * `as unknown as` erases the argument's type as well as the result's, so those
 * three sites would have accepted *any* expression at all, including one that
 * had stopped being a snapshot payload. Here the argument is typed, so the
 * compiler checks that what is handed over is at least a `JsonValue`.
 *
 * **Why the cast cannot be removed.** `JsonValue` is a recursive union that
 * carries no structural information about the object inside it, so TypeScript
 * refuses even a single-step `as` here (TS2352, *"neither type sufficiently
 * overlaps"*) and names `unknown` as the required intermediate. The type-level
 * relationship that *is* checkable is the one between the save schema's
 * inferred payload type and this interface, and
 * `tests/foundation/save-payload-snapshot-bundle-shape-contract.test.ts` pins
 * it.
 *
 * **What makes the claim true at runtime, per call site.** Every caller has
 * already validated the value: the worker protocol decoder re-validates a
 * `structured-clone` snapshot against `versionedPayloadSchema`, and the save
 * reader validates against `decodeSaveEnvelope` and its checksum. This
 * function adds nothing to that and must not be read as if it did.
 */
export function sessionSnapshotBundleFromTransport(data: JsonValue): SessionSnapshotBundle {
  return data as unknown as SessionSnapshotBundle;
}
