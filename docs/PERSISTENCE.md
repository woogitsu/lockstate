# Save schema and migration contract

This document covers `src/persistence/`: the canonical save envelope, its
runtime validation, checksum and forward-migration framework, and (in
"Local persistence" below) the IndexedDB-backed repository that consumes it.
Supabase sync (#20) is a separate issue with its own document: its schema, RPC
and client-side sync/conflict policy (`src/persistence/cloud/`) are covered in
[CLOUD_SAVE.md](./CLOUD_SAVE.md), not here.

## Envelope shape (`SaveEnvelope`, currently V3)

```
{
  saveSchemaVersion: 3,
  gameVersion: string,     // build/version identifier, e.g. "lockstate-0.0.0"
  prisonId: string,
  revision: number,        // caller-managed monotonic counter; optimistic-concurrency
                            // enforcement belongs to the storage backend (#20), not this schema
  createdAt: number,       // unix ms
  updatedAt: number,       // unix ms, must not precede createdAt
  checksum: string,        // 16 hex chars, see "Checksum" below
  payload: {
    kernel: { tick, expectedSequence, rngStates, commands },  // Kernel.snapshot()
    world: { ... },                                           // SparseWorld.snapshot()
    construction: { orders, undoStack, redoStack,              // ConstructionSystem.snapshot()
                    currentTransaction?, currentTransactionId? },  // the open build gesture, #108
    entities?: { capacity, nextAvailableIndex, maxActiveIndex,
                 generations: [[value, length], ...],         // run-length encoded
                 freeIndices: [ ... ],                        // the live free-list prefix only
                 alive: [[0|1, length], ...] },               // run-length encoded
    simulation?: {                                            // V3, issue #70
      prisoners:  { components, coldState,
                    roomInstanceDefinitions, roomInstanceOccupancy },
      operations: { containers, jobs, jobWorkers, electricity, water },
      navigation: { doors },
      security:   { sectorDefinitions, sectorControlStates,
                    guards, schedules, deployment, patrol },
      contraband: { items, intelligence, informants, confiscations,
                    searchPolicies, searchContainerLocations, search },
      incidents:  { log, sectorRisk, gangs, tunnels,
                    watchedSectorIds, trigger, response },
    },
    identity?: {                                              // V3, issue #75 / ADR 0015
      version: 1, poolId,
      entries: [{ kind, entityId, givenName, familyName }],
    },
  },
}
```

`payload` is exactly the union of the existing per-subsystem snapshot
contracts (Issues #5, #12, #16/#17 and, since V3, #24–#28), re-validated at
the save boundary with Zod (`src/persistence/save-schema.ts`), not a new shape
invented for this issue. The simulation-side declaration of the same thing is
`EncodedSessionSystems` (`src/simulation/runtime/session-systems.ts`); the two
are deliberately separate, because the simulation may not import
`src/persistence` and a historical schema here is frozen while the simulation
keeps evolving.

`SaveEnvelope`/`SavePayload`/`TrustedSaveEnvelope` are the names call sites
use for "the current version"; `SaveEnvelopeV1`…`V3` name specific historical
shapes and should appear only in `save-schema.ts` and `save-migrations.ts`.
V2 exists because #50 changed the entity section; V3 because #70 added
`simulation` — see the two version sections below.

### Adding an optional field without a version bump

Three payload fields have been added since their section was first written --
`construction.orders[].edge` (#74) and `construction.currentTransaction` /
`currentTransactionId` (#108) -- and none of them bumped the schema version.
The conditions that make that correct, rather than merely convenient, are:

- **The field is optional, and absent means what the older build already
  did.** An order with no `edge` resolves to `DEFAULT_BUILD_EDGE`; a
  construction snapshot with no `currentTransaction` means "no build gesture
  is open", which is exactly what every restore assumed before the field
  existed. So an older save needs no migration step and none is added -- the
  same reasoning `migrateSaveEnvelopeV2ToV3` uses for its two optional
  sections, applied to a field instead of a section.
- **The key still has to be declared.** `buildOrderSchema` and
  `constructionSnapshotSchema` are `.strict()`, as every object in this schema
  is, so an undeclared key is not trimmed -- it fails the whole save. Both
  additions existed in `ConstructionSystem` before they were nameable in the
  schema, and until they were declared a snapshot carrying one could not be
  saved at all.
- **A version bump would be required instead if absence were ambiguous** --
  if the reader could not tell "this save predates the field" from a real
  value -- or if an existing field changed shape or meaning. That is the line
  V2 (#50) and V3 (#70) crossed and these did not.

What #108 could *not* do is repair saves already written without the field: a
save from a build that never recorded the open gesture simply has no entry for
it, so the newest gesture at the time of that save stays outside the undo
history. The fix stops the loss; it does not reconstruct it, and a migration
that invented an entry would be asserting a gesture the save never recorded.

### Chunk size is bounded, and why that is a format decision

`payload.world.chunkSize` is validated as `positive().max(WORLD_CHUNK_SIZE_LIMIT)`
rather than merely `positive()`. The limit is `64`, and it is not a number
picked for this schema: [ADR-0004](./adr/0004-chunk-size-selection.md) selects
`32×32` for production after benchmarking `16`, `32` and `64`, so `64` is the
largest chunk size the architecture has actually reasoned about. The same
limit is enforced a second time by `coordinates.chunkSize()`, which
`SparseWorld.fromSnapshot` calls before it allocates anything — so neither
gate is decorative: this one rejects the value before a restore is attempted,
that one before the first byte is allocated.

The bound exists because this field *sizes allocations*. A loaded chunk owns
four `chunkSize * chunkSize` byte planes, so a 453-byte envelope declaring
`chunkSize: 20000` used to pass Zod **and** checksum and then allocate
1,526 MiB during restore (measured here); at `500000` a single plane is 250 GB
and the allocation throws a bare `RangeError: Array buffer allocation failed`.
No payload-size cap helps: the amplification happens after the bytes are read. And the checksum is no
obstacle to producing such a save — it is an integrity check, not a signature
(see "Checksum") — but no attacker is needed either, because one corrupted
byte in a stored `chunkSize` has the same effect. Issue #102.

**This narrows what counts as a valid save, at every version.**
`worldSnapshotSchema` is shared by the V1, V2 and V3 payload schemas, so a
save declaring `chunkSize: 65` or more is now rejected as `invalid-shape`
wherever it appears, and `SparseWorld.fromSnapshot` rejects the same value as
a `WorldSnapshotError`. Under `AGENTS.md` boundary 7 that is a format
decision, so it is recorded here rather than left in a schema line:

- **No migration step is added and `SAVE_SCHEMA_VERSION` stays at 3**, because
  there is no save in the field to migrate. `chunkSize` is always written from
  a live `SparseWorld`, and the only production construction site is
  `createNewSimulationRuntime`, which uses `32`; the widest value anywhere in
  this repository, tests included, is `32`, and both checked-in V1 fixtures
  carry `32`. The set of saves this codebase has ever written is therefore
  unaffected — the narrowing removes only values no writer could produce.
- **A hand-written, corrupt or synthesised save above the limit now fails at
  the decode boundary** with `invalid-shape`, where before it decoded and
  failed (or stalled) during restore. That is the intended change: it fails
  where the repository's generation rollback can act on it, and since #103
  a restore failure is recoverable too.
- **Raising the limit later is a schema widening, not a migration**: older
  saves stay valid, and `tests/unit/persistence-save-schema.test.ts` pins the
  current value so the change has to be deliberate.

What this does **not** bound is the *number* of chunks. `worldSnapshotSchema.chunks`
and `ownedChunks` are still unbounded arrays, so a large-but-honest save still
allocates in proportion to its own size (issue #102 measured 648 MB from a
3.7 MB save with 40,000 loaded chunks). That is a cap on how big a prison may
be — a gameplay and world-extent question with no ADR behind it yet — rather
than a bound on a field that lies about its own cost, so it is deliberately
not decided here.

### What is deliberately excluded from the payload

Every entry here is an exclusion with a stated reason, not a gap. The rule
V3 applies is: **authoritative state is persisted; derived state and in-flight
work are not.**

- **Room and topology geometry** (`TopologyManager`, `RoomSystem`). Pure
  caches recomputed from `SparseWorld` geometry by `TopologyManager.update`,
  so there is no independent state to persist. Restoring the world restores
  them. (Placed *room instances* — `RoomInstanceRegistry` — are a different
  thing and **are** persisted; see V3 below.)
- **Navigation caches and the pending path-request queue** (`RouteCache`,
  flow fields, `PathRequestQueue`). ADR 0007 defines these as a budgeted
  caching layer over the world and the door registry, both of which are
  persisted; a restored session rebuilds them from the same inputs. The
  pending queue is not a cache but it is not *state* either — it is work in
  flight, owned by a `NavigationSystem` instance that no longer exists after a
  restore. Every subsystem that holds a request id (`PrisonerOperationsRuntime`,
  `GuardRoster`, `JobBoard`, `SearchSystem`, `IncidentResponseSystem`) drops it
  on restore and re-requests on its next scheduled tick, and each of those
  resets is proven idempotent in `tests/determinism/snapshot-restore-fidelity.test.ts`.
  The visible cost is a bounded delay, not lost progress; the alternative —
  persisting request ids into a queue that never received them — leaves actors
  stuck forever.
- **Per-system `requestSequence` counters** (`SearchSystem`,
  `DeploymentSystem`, `PatrolSystem`, `ActionSystem`). These only mint names
  for path requests against the queue above. Since no restored state can
  reference an old name, a restored counter and a reset one are
  indistinguishable. `IncidentTriggerSystem.sequence` is the exception and
  *is* persisted, because it names incident records that outlive the tick.
- **`JobSystem.performingSince`.** A restored `'performing'` carry job
  restarts its pickup/drop-off timer. This is the same "restart rather than
  assume arrival" convention as travel, and is a real (small) loss rather than
  a derivation — it is listed here rather than fixed because the field is
  private to `JobSystem` and exposing it is a job-system change, not a
  persistence one. Also recorded in `docs/DETERMINISM.md`.
- **`EntityQuery`'s `ComponentBitset`.** A pure function of "is this index
  alive", which the entity ledger already carries;
  `PrisonerOperationsRuntime.loadSnapshot` re-derives it. Persisting it would
  create a second source of truth for the same fact.
- **Generic per-component entity state** (`ComponentBitset`,
  `TransformComponent`, the `src/simulation/entity/prototype.ts` components).
  `entities` still covers only `EntityStore`'s own ID-liveness ledger.
  V3 persists prisoner and guard component state *explicitly*, by name, rather
  than through a generic component registry: no runtime attaches prototype
  components to an `EntityStore`, and inventing an open-ended generic
  serialization format for something nothing uses would be an unreviewed
  architecture decision. When a real generic consumer appears, that registry
  is the change to make — and it is a V4.
- **Storage backend, compression algorithm, encryption.** Out of scope per
  issue #18; see "Size hook" below for the one hook this schema does provide.

One further limitation, inherited rather than introduced: `entities.capacity`
must equal the restoring runtime's `DEFAULT_PRISONER_CAPACITY`, because
`EntityStore.loadSnapshot` refuses a differing capacity. Every save this
codebase writes satisfies that; a hand-written fixture with a smaller store
does not, and fails the restore rather than silently resizing.

## Checksum

`computeSaveChecksum` (`src/persistence/checksum.ts`) reuses
`deterministicStateHash` from `src/simulation/determinism/canonical.ts` — the
same canonical-JSON FNV-1a-style hash the simulation already uses for state
diagnostics — rather than a new algorithm. Canonicalization sorts object keys,
so the checksum is stable across equivalent key insertion order. It detects
corruption/accidental mismatch; it is **not** a cryptographic signature.

**It is verified at the version the save was written at.** A checksum covers
a payload, and a migration may rewrite that payload (V1 → V2 re-encodes the
entity ledger), so `decodeSaveEnvelope` checks the stored checksum against
`MigrationChain`'s `declaredValue` — the input as validated against its own
declared version, before any step ran — and reports `checksum-mismatch` with
`atVersion` set to that version. The alternative orderings are both wrong:
verifying after migration would report every older save as corrupt, and
verifying after a migration that had recomputed the checksum would report
every older save as intact whether or not it was. A migration therefore
recomputes the checksum for its output (so a migrated envelope is
self-consistent and indistinguishable from a natively-written one) without
that recomputation ever masking corruption in the input.

## Trusted envelopes: validating once, without weakening the boundary

Validation, not I/O, is the dominant cost of a save (`JSON.stringify` is ~2%
of one). The payload used to be walked three times per save: once by
`savePayloadV1Schema`, again by `saveEnvelopeV1Schema` re-walking it as a
nested field, and a third time by `PrisonSaveRepository.save` re-decoding an
envelope this same process had just built and checksummed. Issue #49 removed
the second and third walks. Two of the three were pure repetition; the third
is a genuine correctness boundary and is still paid by every envelope of
unknown provenance.

**The envelope's fields and its payload are now validated separately.**
`saveEnvelopeMetadataShape(version)` builds the seven scalar fields an
envelope carries around its payload. `saveEnvelopeV3Schema` (metadata +
`payload`) is what the migration chain registers for the current version and
what `decodeSaveEnvelope` therefore still runs in full;
`saveEnvelopeMetadataV3Schema` (metadata alone) is what
`createSaveEnvelope` runs, because it has just parsed the payload itself and
re-walking a multi-megabyte payload to check seven numbers is waste. Both
carry the same `updatedAt >= createdAt` refinement, so no rule is enforced on
one path and not the other.

**`save()` decides by provenance, not by a caller-supplied flag.**
`createSaveEnvelope` and `decodeSaveEnvelope` return `TrustedSaveEnvelope`
— `SaveEnvelope` branded with a `unique symbol` that is declared but never
exported, so no other module can even name the brand, let alone produce the
type. `PrisonSaveRepository.save` routes through
`decodeSaveEnvelopeUnlessTrusted`, which writes a trusted envelope as-is and
fully decodes everything else.

The brand is what the *type system* checks; it is backed at runtime by a
module-private `WeakSet` keyed on object identity, and that is what makes it
unforgeable:

- A caller who defeats the type with `as TrustedSaveEnvelope` still fails
  the identity check and gets full validation. The failure mode of every
  bypass attempt is "validate anyway", never "trust anyway".
- Identity is destroyed by every ordinary way a value leaves and re-enters
  this process — a JSON round trip, a structured clone (which is exactly what
  the IndexedDB write path performs), or a spread that rewrites one field. So
  an envelope read back from storage, imported from a file, or received from
  Supabase is structurally incapable of arriving trusted.
- A trusted envelope is shallow-frozen, so its `checksum`, `saveSchemaVersion`
  and `payload` reference cannot be swapped after this module vouched for
  them. Freezing stops at the top level deliberately: a deep freeze would
  reintroduce the per-node walk this change exists to remove, and the payload
  interior is already a fresh Zod-parsed value detached from live runtime
  state.

`decodeSaveEnvelope`'s output is trusted for the same reason and with the same
safety: it is the migration chain's own freshly parsed value, never the
caller's object, so trust is never granted to something an untrusted caller
still holds a mutable reference to. That is also why `importSave` now costs
one validation rather than two — it decodes, then hands `save()` the value it
decoded.

**What is unchanged:** `importSave`, `loadCurrent`, the recovery scan and
`PrisonSyncEngine` (cloud) all still run `decodeSaveEnvelope` in full. The
rejection tests in `tests/unit/persistence-save-schema.test.ts` and
`tests/unit/persistence-local-repository.test.ts` that prove it were not
edited by #49.

## Migration framework

`src/persistence/migration.ts` exports a generic `MigrationChain`:

- Each supported save-schema version registers exactly one `VersionSchema`
  (a `parse` function; `zod-version-schema.ts` adapts a Zod schema to this).
- Each `Vn -> Vn+1` transition registers exactly one `MigrationStep`. Steps
  must advance exactly one version; registration fails loudly otherwise.
- `chain.migrate(input, declaredVersion)` validates `input` against its
  declared version's schema, then walks every migration required to reach
  `latestVersion`, re-validating the output of every step before trusting it.
  A step never receives or returns the caller's original object reference in
  a way that lets it mutate the source fixture.

`saveMigrationChain` registers the V1, V2 and V3 schemas and the `1 -> 2` and
`2 -> 3` steps. The chain-walking, per-step validation and immutability
guarantees are also exercised against a synthetic multi-version fixture in
`tests/unit/persistence-migration.test.ts`, independent of the real save
versions; the real upgrades are covered in
`tests/migrations/save-v1-to-v2.test.ts` and
`tests/migrations/save-v2-to-v3.test.ts`, the latter including the two-hop
V1 → V2 → V3 walk a save from the first release actually takes.

### Adding a V4 later

1. Add the new interface/type and a `.strict()` Zod schema for it, alongside
   the existing ones — never edit a historical schema to match new code.
2. `saveMigrationChain.registerSchema(zodVersionSchema(4, v4Schema))`.
3. `saveMigrationChain.registerMigration({ fromVersion: 3, toVersion: 4, migrate })`,
   pure and side-effect-free, in `src/persistence/save-migrations.ts`. If it
   changes the payload, recompute `checksum` in the step (see "Checksum").
4. Bump `SAVE_SCHEMA_VERSION` to `4`. Call sites use the version-neutral
   `SaveEnvelope`/`SavePayload`/`TrustedSaveEnvelope` aliases, so this step no
   longer sweeps a rename through the repository the way V2 did.
5. Keep every older fixture in `tests/fixtures/persistence/` checked in
   unchanged, and add a test asserting they migrate to the new shape
   correctly. `tests/fixtures/persistence/` holds V1 saves only; V2 and V3
   test inputs are *derived* from those frozen V1 files by running the frozen
   migrations over them (see `save-v2-to-v3.test.ts`), which keeps
   `git diff -- tests/fixtures/` empty and keeps the inputs independent of the
   code under test. Follow that pattern rather than checking in a fixture
   generated by the build you are changing.
6. If the new version adds *simulation* state, extend `EncodedSessionSystems`
   and its Zod mirror together, and decide per subsystem whether the state is
   authoritative or derived — recording the answer under "What is deliberately
   excluded from the payload" above. An undecided subsystem is the failure
   mode #70 existed to fix.

## V3: the save carries the prison, not just the plot (#70)

Until V3, `SessionSnapshotBundle` carried four fields — `kernel`, `world`,
`construction`, `entities` — while `createNewSimulationRuntime` built about
thirty subsystems. A player could build a prison, admit prisoners, run
patrols, trigger incidents and confiscate contraband, save, reload, and get
back terrain and walls. Nothing warned them, because by its own contract the
save had succeeded.

**This was wiring, not new serialization.** Twenty-one of those subsystems
already implemented `getSnapshot`/`loadSnapshot`; they were built
snapshot-capable and never connected to a payload. V3 connects them.

### What is persisted, and why

| Section | Subsystems | Why it is authoritative |
| --- | --- | --- |
| `prisoners` | `PrisonerRecordComponent`, `NeedsComponent`, `CurrentActionComponent`, `PositionComponent`, `PrisonerColdState`, `RoomInstanceRegistry` | Nothing derives a prisoner's sentence, needs, risk tier, position or cell assignment from anything else. |
| `operations` | `Container`/`ContainerRegistry`, `JobBoard`, `JobWorkerPool`, both `UtilityNetwork`s | Stock, reservations, carry jobs and utility topology are player-caused state. |
| `navigation` | `DoorRegistry` | A door is placed, not derived: the world's edge planes say a boundary exists, the registry says it is a gated opening and how it is locked. |
| `security` | `SecuritySectorRegistry`, `GuardRoster`, `DeploymentSchedule[]`, `DeploymentSystem`, `PatrolSystem` | Hired staff, their posts, sector control state and the schedules that drive them. |
| `contraband` | `ContrabandRegistry`, `IntelligenceLedger`, `InformantRegistry`, `ConfiscationLedger`, `SearchPolicyDefinition[]`, `SearchSystem` | Concealed items, their provenance and movement history, decayed suspicion, and the evidence chain a confiscation produced. |
| `incidents` | `IncidentLog`, `SectorRiskTracker`, `GangRegistry`, `TunnelRegistry`, `IncidentTriggerSystem`, `IncidentResponseSystem` | Incident records are explicitly "simulation entities and domain events, not transient UI popups" (#28). |

| `identity` *(session-level)* | `ActorIdentityRegistry` | ADR 0015: a name is an **allocated identity**, minted once and carried — never recomputable from an entity id. |

Everything not in that table is excluded deliberately; the reason for each is
under "What is deliberately excluded from the payload" above.

### Why `identity` is session-level and not nested

`identity` sits beside `simulation`, not inside `simulation.prisoners` or
`simulation.security`, because `ActorIdentityRegistry` spans **both**
`EntityStore`s. Prisoners live in `PrisonerOperationsRuntime`'s store and staff
in `GuardRoster`'s own separate one, and both hand out entity id `0` — so the
registry is keyed by `(kind, entityId)` and `kind` is load-bearing. Filing the
section under either population would misplace the other half of it. That is
not hypothetical: collapsing every entry's `kind` to `'prisoner'` makes
`loadSnapshot` throw `Actor identity snapshot repeats prisoner 0` on the
determinism scenario — the collision the nesting would have caused silently.

Two properties the save boundary must not break, both from ADR 0015:

- **A `poolId` that disagrees with the configured pool is not an error.**
  Stored names are authoritative precisely so that replacing the placeholder
  name pool renames nobody. The schema therefore validates `poolId` as a
  non-empty string and nothing more; checking it against the current pool
  would undo that guarantee at the boundary instead of honouring it.
- **The registry's `version` is its own**, independent of
  `SAVE_SCHEMA_VERSION` — the same separation ADR 0003 gives the worker
  snapshot. It is pinned to a literal in the V3 schema, so a future registry
  shape arriving inside a V3 envelope is rejected as `invalid-shape` rather
  than half-read.

### Session wiring for identity

ADR 0015 shipped the registry **inert**: `IntakeSystem` and `GuardRoster` take
an optional minter and draw nothing without one, because
`NamedRngStreams.get` throws for a stream the session never registered. #70
completes the wiring that ADR handed to `src/simulation/runtime/**` —
`new-session.ts` registers `identity.actor-name` alongside the other three
streams, constructs the registry as `SimulationRuntime.actorIdentity`, and
passes it to `PrisonerOperationsRuntime` (which names an arrival at reception,
inside `EntityQuery`'s canonical ascending-id walk) and to `GuardRoster`
(which names a hire). Without that, `identity` would be a section that is
always empty, and a save would still lose every name.

`GuardRoster` gained the staff counterpart of the seam `IntakeSystem` already
had: an optional `ActorIdentityMinter` plus a resolver for the stream it draws
from. A resolver rather than the stream itself, because `hire` is a
session/scenario call outside any tick and has no `SimulationContext` to read
one from — the same reason `reportInformantTip` takes its stream as an
argument.

Adding a fourth RNG stream changes what a recorded command stream reproduces,
so the stream-list pins in `tests/determinism/rng-stream-isolation.test.ts`
and `session-replay.test.ts` were updated deliberately rather than
incidentally.

### Definitions, not only mutable state

Three registries snapshot *only* their mutable half, on the documented
assumption that "session/scenario setup re-registers the definitions
identically before `loadSnapshot` runs": `RoomInstanceRegistry` (occupancy
only), `SecuritySectorRegistry` (control state only) and `ContainerRegistry`
(stock only, and it *throws* on an unknown container id).

That assumption is correct for a scenario and false for a save. A save **is**
the thing doing the re-establishing; there is no scenario behind it. So the
payload carries the definitions too — room instances, sector definitions,
container ids and doors — and `restoreSessionSystems` registers them before
calling the subsystem `loadSnapshot` that references them by id. Without this,
the first prison with an occupied cell fails its restore outright.

### A lockdown must stay liftable

`SecuritySectorRegistry` records each governed door's state at `register` time
as the baseline `'normal'` restores to, and computes every transition from
that baseline rather than from the door's just-prior state. Writing the
*live* door state into the save would therefore make a lockdown permanent: on
restore, `'locked'` would become the new baseline and lifting the lockdown
would lock the door again. The baseline is not recoverable from the live state
either — `'restricted'` maps both `'open'` and `'closed'` onto `'closed'`, and
`'lockdown'` maps everything onto `'locked'`.

So `SecuritySectorRegistry` gained one read-only accessor,
`getBaselineDoorStates()`, doors are written at their baseline, and the live
state is reproduced by re-applying the sector control states after
registration. `tests/integration/session-save-round-trip.test.ts` saves a
prison mid-lockdown, restores it, and lifts the lockdown back to the door's
original `'open'`.

### Prisoner components: allocated prefix, not capacity, and not RLE

`DEFAULT_PRISONER_CAPACITY` is 5,000 slots and there are eighteen per-prisoner
arrays. Writing them at capacity would cost ~240 KiB in every save regardless
of population — the same mistake #50 removed from `entities`, at eighteen
times the size. They are written across the store's **allocated prefix**
(`maxActiveIndex + 1`) instead.

The prefix, not just the live indices, because nothing clears a component
array when an entity is destroyed: a freed index inside the prefix keeps
whatever its previous occupant left there until it is recycled. Writing those
slots is what makes a restored session's arrays *identical* to a continuous
one's rather than merely equivalent. (No test currently leaves a slot dead
across a save: `snapshot-restore-fidelity.test.ts` destroys an index and
recycles it immediately.) Slots *above* the prefix were never
allocated and hold exactly their component-constructor defaults, which
`decodePrisonerComponents` reproduces — so the restore is exact either way.

Until #111 that residue was also future behaviour: `admitPrisoner` reset five
of the eighteen arrays, so recycling a freed index handed the next prisoner
the previous one's needs, classification and action state. It now resets all
eighteen, so a dead slot's contents can no longer become a live prisoner's
starting state. Whether the payload could therefore shrink to the live indices
only is a save-format change and a decision of its own; it has not been taken,
and writing the prefix is correct either way.

Plain arrays rather than run-length encoding, which is the opposite of the
choice `entities` makes, because the data is the opposite shape: needs levels,
positions and tick stamps differ per prisoner, so RLE would spend two numbers
per prisoner where a plain array spends one. Measured at the x-large tier, RLE
came out larger overall — it wins only on the two or three uniform arrays
(`intakeStage`, `riskTier`) and loses on the twelve that are not. `entities`'
three arrays are uniform runs by construction, which is why RLE is right
there.

### Determinism

Every collection in the payload is written in a canonical order derived from
state, never `Map`/`Set` iteration order. Most subsystem `getSnapshot` methods
already sorted themselves; what V3 newly writes and therefore newly had to
sort is the set of registries and mutable configuration arrays a session
*pushes* into — doors, sector definitions, room-instance definitions,
deployment schedules, search policies, watched incident sectors and search
container locations. `tests/determinism/snapshot-restore-fidelity.test.ts`
builds the same prison with every incidental registration reversed and asserts
a byte-identical payload; before the sorts were added, it did not.

One encoding detail is load-bearing for the checksum: several subsystem
snapshots spread a record whose optional field is declared `T | undefined`, so
the key is *present* with an `undefined` value. `isJsonValue` rejects that (the
worker protocol declares its payload as `jsonValue`), `canonicalJson` throws on
it, and a `JSON.stringify`/`parse` round trip silently drops it — meaning an
envelope checksummed before storage would no longer match itself after.
`captureSessionSystems` prunes undefined-valued keys once, at the end, so the
encoded form is identical in and out of storage.

### Migration

`migrateSaveEnvelopeV2ToV3` carries the payload across **unchanged**. Both new
sections were added beside `kernel`/`world`/`construction`/`entities` rather
than folded into them, and both are optional, so there is nothing in a V2 save
to reshape — and nothing the migration may invent. An empty `simulation`
section would assert "this prison had no prisoners, guards or incidents", and
an empty `identity` section "this prison had nobody named"; an absent one says
"this save predates that state", which is the truth.
`restoreSimulationRuntime` treats an absent section exactly as V2 behaved
(those subsystems rebuild empty) and `RestoredScope` reports which of the two
happened. The checksum is recomputed anyway, so a migrated envelope is
self-consistent by construction like every other; since the payload is
unchanged the recomputed value necessarily equals the stored one, and a test
pins that so a future edit cannot start rewriting the payload unnoticed.

The V1 fixtures in `tests/fixtures/persistence/` are checked in **unchanged**
and now migrate two hops to V3.

### Measured size impact

Same four tiers and the same harness as #50's table, so the numbers are
directly comparable. These tiers populate prisoners and construction only, so
the security/contraband/incident sections are near-empty *by construction*,
not by encoding — a prison with guards and incidents pays for them
proportionally.

| tier | prisoners | envelope before (V2) | after (V3) | `simulation` | of which `prisoners` | `identity` |
| --- | --- | --- | --- | --- | --- | --- |
| small | 25 | 36.7 KiB | 42.0 KiB | 3.2 KiB (7.7%) | 1.9 KiB | 1.9 KiB (4.5%) |
| medium | 250 | 251.0 KiB | 286.8 KiB | 16.9 KiB (5.9%) | 15.6 KiB | 18.7 KiB (6.5%) |
| large | 1,000 | 997.0 KiB | 1.11 MiB | 62.7 KiB (5.5%) | 61.4 KiB | 74.9 KiB (6.6%) |
| x-large | 3,000 | 2.46 MiB | 2.86 MiB | 185.1 KiB (6.3%) | 183.8 KiB | 226.8 KiB (7.7%) |

The non-prisoner `simulation` sections are flat across every tier at this
content level: operations 283–285 B, navigation 12 B, security 358 B,
contraband 241 B, incidents 345 B. Cost is therefore proportional to
population, which is the property that matters; the world section remains the
dominant term at every tier.

`identity` is exactly **77 B per named actor** at every tier — a key, a kind
and two short strings, with no padding to shape away. These fixtures hire no
guards, so every named actor is a prisoner; a prison with staff pays the same
77 B for each of them. It is the one section of V3 whose size is irreducible
without shortening or interning the names themselves, and interning them would
trade a lookup table for the property that makes a name renameable state
rather than a derived value (ADR 0015).

What population-shaping bought, measured the same way #50's table measured its
own:

| tier | prisoners | components if capacity-shaped | as written | ratio |
| --- | --- | --- | --- | --- |
| small | 25 | 239.8 KiB | 1.9 KiB | 123.2× |
| medium | 250 | 242.7 KiB | 15.6 KiB | 15.6× |
| large | 1,000 | 252.6 KiB | 61.4 KiB | 4.1× |
| x-large | 3,000 | 279.3 KiB | 183.8 KiB | 1.5× |

Measurement only — `tests/perf/` asserts no size and no duration, per
`docs/BENCHMARKING.md`. Reproduce with
`pnpm exec vitest run --config tests/perf/vitest.perf.config.ts`.

## V2: the entity ledger follows population, not capacity (#50)

V1 wrote `EntityStore`'s three parallel arrays — `generations`, `freeIndices`
and `alive` — across the store's **full allocated capacity**. Since
`createNewSimulationRuntime` allocates `DEFAULT_PRISONER_CAPACITY` (5,000)
slots up front, the `entities` section cost a constant 29.4 KiB whether the
prison held 25 prisoners or 3,000: 45% of a small envelope, entirely padding,
and growing with the capacity constant rather than with play.

**The live store is unchanged.** ADR 0005's SoA layout is deliberate and out
of scope here; only the serialized form moved.

**The encoding.** `generations` and `alive` are run-length encoded as
`[value, length]` pairs — the same convention the world snapshot already uses
for terrain planes. That was chosen over the two alternatives the issue
listed:

- *Truncate at `maxActiveIndex`* would still write one array entry per live
  slot (≈12 KiB at 3,000 prisoners) and needs an explicit pad-on-restore step.
  RLE subsumes it: the unallocated tail is one run, so no truncation logic
  exists at all and `capacity` needs no reconstruction from a padded length.
- *Store live ids explicitly* is **larger**, not smaller, for a dense store —
  a packed id is a 6–7 digit number, so 3,000 of them cost more than the dense
  arrays did — and it forces the restore path to *infer* `nextAvailableIndex`
  and the generation of every freed slot from the id list, replacing a copy
  with an inference. Generation counters are what make stale-reference
  detection work; inferring them is exactly the wrong trade.

`freeIndices` is **not** run-length encoded — a free list is a stack of
arbitrary indices with no run structure — but only its live prefix is written.
Everything above `freeCount` is stack residue that `EntityStore.spawn`
structurally cannot read, so `freeCount` is not stored either: it *is*
`freeIndices.length`, and the two can no longer disagree. `capacity` stays an
explicit field, and the schema cross-checks that the run lengths sum to
exactly it, so a restored store allocates the same number of slots.

The encoding stays JSON-safe (plain numbers and arrays), which it must: the
same shape crosses the worker protocol boundary, whose `structured-clone`
payload is declared as `jsonValue`. `SESSION_SNAPSHOT_SCHEMA_VERSION` is
bumped to 2 alongside it — ADR 0003 gives a snapshot its own version for
exactly this, and a build handed the other shape now faults
`snapshot-incompatible` instead of restoring a corrupt ledger.

**Cost is now proportional to the structure of liveness** — the number of
live/dead runs, bounded by the live population — rather than to the
allocation. A store with no destroys is two runs; churn adds runs. Worst case
(alternating live/dead slots) is bounded by the live population, never by
capacity.

Measured with the harness below, on the same fixtures:

| tier | prisoners | `entities` before | after | envelope before | after |
| --- | --- | --- | --- | --- | --- |
| small | 25 | 29.4 KiB | 129 B | 66.0 KiB | 36.7 KiB |
| medium | 250 | 29.4 KiB | 132 B | 280.3 KiB | 251.0 KiB |
| large | 1,000 | 29.4 KiB | 134 B | 1.00 MiB | 997.0 KiB |
| x-large | 3,000 | 29.4 KiB | 135 B | 2.49 MiB | 2.46 MiB |

These fixtures admit prisoners and never release any, so their ledgers are
two or three runs and the figures are close to a floor rather than a curve;
`tests/unit/entity-liveness-codec.test.ts` covers the churned case, where run
count — and therefore size — grows with the population rather than with
`DEFAULT_PRISONER_CAPACITY`.

**Migration.** `migrateSaveEnvelopeV1ToV2`
(`src/persistence/save-migrations.ts`) re-encodes a V1 entity section by
routing it through the *same* `encodeEntityStoreSnapshot` a live store uses,
so a migrated save and a freshly captured one cannot drift into two
encodings. V1's schema never constrained the three arrays to be exactly
`capacity` long, so the migration normalises them (truncate/zero-pad) first;
for every save this codebase actually wrote, that normalisation is the
identity. The checksum is recomputed for the V2 payload, which is safe
because the V1 checksum is verified against the V1 payload first — see
"Checksum".

The two V1 fixtures in `tests/fixtures/persistence/` are checked in
**unchanged** and still load; `tests/migrations/save-v1-to-v2.test.ts` proves
they migrate, that the migrated ledger reproduces V1's generations, free list
and capacity exactly, that a tampered V1 save is still rejected as
`checksum-mismatch`, and that decoding a fixture does not mutate it.

`tests/browser/local-save-migration.spec.ts` re-proves the same upgrade from
the *other* side of a real storage boundary, off the same fixture: a V1 record
transported by structured clone rather than JSON, read back after a real page
navigation, and migrated inside the repository's own recovery scan rather than
by calling the chain directly. See `docs/TESTING.md` for why a format
migration belongs in that layer as well as in-process.

## Error taxonomy

`decodeSaveEnvelope` returns a distinct, actionable error code rather than a
single generic failure:

| Code | Meaning |
| --- | --- |
| `invalid-shape` | Not an object, missing/non-numeric `saveSchemaVersion`, or fails its declared version's schema (includes malformed/truncated saves, `updatedAt < createdAt`, and a `world.chunkSize` above `WORLD_CHUNK_SIZE_LIMIT`). |
| `unsupported-version` | `saveSchemaVersion` is newer than the latest version this build knows about. |
| `no-migration-path` | A declared or intermediate version has no registered schema/migration (e.g. version `0`, or a gap in the chain). |
| `migration-produced-invalid-output` | A migration step ran but its output failed the destination version's schema — a bug in the migration, not the input. |
| `checksum-mismatch` | The envelope parses and migrates cleanly, but its checksum does not match its payload — corruption, not a shape problem. |

## Size hook

`estimateSaveEnvelopeByteSize` (`src/persistence/size.ts`) reports the
canonical-JSON byte size of an envelope. This is the "size/version hook for
future compression/storage selection" the issue calls for: a storage backend
can decide when compression is worth it without this module picking an
algorithm.

## Performance

Directional-only measurement (not a committed benchmark or a threshold —
`docs/BENCHMARKING.md` explicitly defers "save serialization, compression,
checksum and migration cost" to its own future benchmark scenario family):
encoding+validating a synthetic 400-chunk / 2,000-build-order save
(~390 KB canonical JSON) took ~122 ms to encode/validate and ~62 ms to
decode/validate on this development container; `JSON.stringify`/`parse`
themselves were a few milliseconds. Zod validation cost scales with world
size, so it should be profiled against representative content before it
gates a pull request, per the referenced benchmark policy.

Those figures predate #49, which cut `createSaveEnvelope` by roughly a third
and a repository `save()` by roughly two thirds; "Two known costs worth their
own issue" at the end of this document carries the current, tiered numbers
from `tests/perf/`.

## Local persistence (`src/persistence/local/`)

A local-first repository around the save envelope above: create/read/list/
delete prison slots, atomic generation-rotated writes, startup corruption
recovery, autosave coalescing, and export/import. Cloud sync (#20) is not
implemented here — `PendingSyncState` only stores the bookkeeping a future
sync engine would read.

### Storage abstraction and dependency review

`LocalSaveStore`/`LocalSaveTransaction` (`store.ts`) model exactly the shape
of an IndexedDB transaction (get/put/delete against two stores, committed or
rejected as a unit), so that **all policy** — generation retention
(`generation-policy.ts`), recovery and export/import (`repository.ts`),
autosave coalescing (`autosave.ts`) — lives in `PrisonSaveRepository` and is
unit-tested against `MemoryLocalSaveStore`, an in-memory fake, with no real
or polyfilled IndexedDB involved at all.

`IndexedDbLocalSaveStore` (`indexeddb-store.ts`) is the one piece that must
call the real `indexedDB` global, and it is kept deliberately thin (open the
database with a two-store schema; wrap each request in a promise; surface
transaction completion/abort).

**Test-environment decision:** `docs/TESTING.md` gates any browser/storage
test environment behind "a dedicated dependency and architecture review."
`fake-indexeddb` (a pure-JS, dependency-free IndexedDB implementation, added
as an exact-pinned **devDependency only** — it never reaches the production
bundle) is that review's outcome for this one adapter:
`IndexedDbLocalSaveStore` is integration-tested against it in
`tests/integration/persistence-local-indexeddb.test.ts`, each test opening
its own fresh `IDBFactory` instance rather than any shared/global one, so
this stays an explicit, narrowly-scoped addition rather than a silent
environment change for the rest of the suite (the global Vitest environment
is still `node`; nothing here introduces jsdom/happy-dom/DOM globals).
Real-browser behavior is covered separately by the Chromium project
(`tests/browser/`, `pnpm test:browser` — its own command, and since the
`browser` job in `.github/workflows/ci.yml` its own CI job rather than an
opt-in one; see `docs/TESTING.md`), which
proves the three things `fake-indexeddb` structurally cannot. What that
project established:

- **Quota is verified, not assumed.** A real, CDP-capped origin produces a
  genuine `QuotaExceededError`; `classifyStoreError` returns
  `quota-exceeded`, `save()` fails cleanly, and **the last good generation
  survives intact** — the generation-rotation guarantee under a hard, real
  storage failure rather than a simulated one.
- **The `.name` classification table is correct**, now measured rather than
  guessed. Chromium's names match every branch, and `DOMException instanceof
  Error === true` — which every branch silently depends on, since if it
  were false *every* storage failure would degrade to `unknown-error`.
- **A real `QuotaExceededError` carries an empty `message`.**
  `classifyStoreError` therefore falls back to the error's name, so the
  single failure a player is most likely to see never produces blank
  evidence. Both halves are asserted — the empty raw message *and* the
  non-blank classified one — so neither the observation nor the fallback it
  justifies can go stale unnoticed.
- **A V1 save left in real origin storage still loads under a V2 build.**
  A V1 record planted directly in real IndexedDB (bypassing `save()`, which
  can only write the current version) survives a page navigation, migrates on
  read, and reproduces the V1 ledger exactly. `loadCurrent` migrates in
  memory only — the V1 record stays on disk until the next save, which then
  writes the population-shaped V2 form durably. And a *tampered* V1 record
  read back off real storage is still rejected as `checksum-mismatch` at V1,
  with recovery falling back to the previous good V1 generation: the proof
  that recomputing the checksum during migration did not cost corruption
  detection, on the storage path where it would actually matter.
- **`IDBTransaction.error` is `null` after an explicit `abort()`**, so the
  adapter's `?? new DOMException(..., 'AbortError')` fallback is
  load-bearing, not defensive padding. And when an unhandled *request*
  failure aborts a transaction, `transaction.error` is the **causal** error
  (e.g. `ConstraintError`), not `AbortError` — the classification happens to
  land correctly for quota because quota is itself the causal name.

**Private-mode behavior remains unverified.** Only Chromium is available in
this environment, and Chromium's incognito supports IndexedDB normally; the
interesting case (Firefox private browsing throwing on `indexedDB.open`) needs
a browser that isn't installed. `main.ts` therefore treats a failed database
open as non-fatal and degrades to a playable-but-unsaveable session, but that
path is reasoned, not exercised. Disk-full (as opposed to quota-exceeded) is
likewise untriggerable here; Chromium historically reports it as
`UnknownError`, which would classify as `unknown-error`.

#### Defect this found and fixed: transactions that failed to abort

`runTransaction` used to reject when `work` threw, but never called
`IDBTransaction.abort()` — so any write already staged in that transaction
**still committed**. That silently broke `LocalSaveStore`'s documented "all
operations commit or fail together" contract and diverged from
`MemoryLocalSaveStore`, the fake behind every repository policy unit test,
which discards staging when `work` throws. It was latent rather than live
(no repository path throws *after* staging a write), and only a real browser
could surface it: the fake cannot, by construction. Fixed by aborting on the
throw path — attaching a handler to the commit promise *before* aborting, so
the resulting rejection does not escape as an unhandled promise rejection.
Regression-tested in `tests/browser/local-save-errors.spec.ts`.

**Dependency review — `idb` vs. a native adapter (issue #19's required
review):** not adopted. `IndexedDbLocalSaveStore`'s entire surface is one
`runTransaction` method over a fixed two-object-store schema; `idb`'s value
(a general-purpose promise wrapper plus cursor/index helpers) is not needed
for that fixed shape, and `AGENTS.md` calls out not adding a dependency for
functionality this trivial to hand-write and review directly. Revisit if a
future issue needs cursors, indexes, or a significantly larger store schema
where `idb`'s helpers would materially reduce risk.

### Schema

Database `lockstate-saves`, version 1, two object stores:

- `prisons` (keyPath `prisonId`) — one `PrisonSlotMetadata` record per slot:
  game version, display name, `currentGenerationId`, the ordered
  (oldest-first) `generationIds` window, timestamps, optional
  `pendingSync`.
- `generations` (out-of-line key `` `${prisonId}:${generationId}` ``) — one
  validated `SaveEnvelope` per generation.

### Generation retention and recovery

`save()` validates by provenance (see "Trusted envelopes" above), then writes
the new generation, advances `currentGenerationId`, and only then deletes
whatever `applyGenerationRetention` prunes — all inside one `readwrite`
transaction, so a failed write can never destroy the last known-good
generation. The default window keeps the current generation plus
two previous ones (`keepGenerations: 3`), matching the issue's minimum.

`loadCurrent()` tries the current generation first (schema + checksum via
`decodeSaveEnvelope`, i.e. #18's validation, not a separate check). If it is
missing or fails validation, it walks the remaining generations newest-first
and adopts the first one that validates — healing `currentGenerationId` and
dropping the confirmed-corrupt generation(s) so the pointer does not force
the same recovery scan on every subsequent load. `no-valid-generation` is
returned only when nothing in the retained window validates.

#### Demotion also covers saves that decode and cannot be restored (#103)

`loadCurrent` can only judge a generation by schema, migration and checksum.
A save that passes all three and then fails *semantic* restore was returned as
`{ ok: true, outcome: 'current' }`, so `recoverToGeneration` never ran and the
bad generation stayed current for ever — every subsequent load in that tab
repeated it. Such saves are not hypothetical: this schema deliberately does
not duplicate `SparseWorld.fromSnapshot`'s semantic checks (see the note above
`worldSnapshotSchema`), so each of those checks describes a save that decodes
and cannot be restored.

`demoteGeneration(prisonId, generationId)` is the primitive that closes it. It
drops one generation from the retained window, deletes the record and — when
that generation was the current one — repoints `currentGenerationId` at the
newest survivor. Deleting rather than merely un-pointing, for the same reason
the decode path already deletes: a generation outside `generationIds` is
unreachable by every read path and would not be cleaned up by `delete()`
either. A prison whose every generation is demoted keeps its metadata row with
an empty window, which `loadCurrent` reports as `no-valid-generation` — the
player still sees the prison and is told its saves are unreadable rather than
finding it silently gone.

Who calls it is deliberately narrow: `SessionController.loadPrison` demotes
**only** on a `SnapshotRestoreRejectedError`, the error a host raises when the
*snapshot* was refused. A host that timed out, was never started or has gone
away propagates unchanged and costs no generation — demoting a good save
because the worker was busy would be the more expensive mistake.

### Autosave

`AutosaveScheduler` schedules a trailing-edge save `intervalMs` after
`markDirty(prisonId)`; further dirty markers before that timer fires are
coalesced into the same pending save. A dirty marker that arrives while a
save is already in flight schedules exactly one follow-up save once that
write settles — never a second concurrent write for the same prison. Tests
use Vitest's fake timers (`vi.useFakeTimers()`/`advanceTimersByTimeAsync`),
per `docs/TESTING.md`'s "own the complete timer lifecycle" rule, rather than
real elapsed time.

### Export/import

`exportSave` returns the current generation's already-validated envelope.
`importSave` runs an arbitrary value through `decodeSaveEnvelope` (schema +
migration + checksum) before it can reach `save()` — an invalid import never
touches storage.

### Errors

`classifyStoreError` (`errors.ts`) distinguishes `quota-exceeded` (browser
`QuotaExceededError`) and `transaction-aborted` (`AbortError` and related
transaction-lifecycle errors) from `unknown-error`, by `.name` rather than
`instanceof DOMException` — `DOMException` does not exist in the Node test
environment, so classification is exercised in unit tests with plain
`Error` objects and works identically against real browser errors.

### Performance

Directional-only (not a committed benchmark or threshold, same caveat as
above): five sequential `save()` calls against `IndexedDbLocalSaveStore`
(via `fake-indexeddb`) for a 100-chunk / 500-build-order prison took
~15–24 ms each (schema/checksum validation plus the transaction itself),
and `loadCurrent()` ~14 ms. `fake-indexeddb`'s in-process cost is not the
same as a real browser's disk-backed IndexedDB, so this is a lower bound,
not a production estimate. The validation share of that figure is what #49
removed from the in-process write path; see the tiered measurements at the
end of this document.

### What is out of scope here

Supabase execution (#20); full service-worker asset caching; simulating
elapsed time while the browser was closed; and any cross-tab/multi-writer
concurrency control beyond the single-process autosave/manual-save
coalescing above — `revision` is caller-managed and this repository does
not yet enforce optimistic concurrency on it, matching the "not this issue"
scope in `save-schema.ts`'s own documentation.

## Session wiring (`src/persistence/session/`)

The repository above is storage policy; this layer is what actually drives
it from a running game, closing issue #19's last open item ("wiring the
repository into the app — there's no session/save UI yet to drive
create/save/load").

### The worker owns authoritative state; persistence asks it for snapshots

`AGENTS.md` assigns authoritative in-session state to the simulation
worker, and ADR 0003 states that "saving is represented by a snapshot
request and correlated snapshot response" and that later issues must use
that protocol "rather than bypassing it". Issue #19 says the same thing
from the persistence side: "save creation consumes explicit Worker
snapshots, not renderer internals."

So `SessionController` owns **no** `SimulationRuntime`. It talks to a
`SessionRuntimeHost`:

```
startNew(seed) / startFromSnapshot(bundle) / capture() / stop()
```

Two implementations satisfy it:

- **`WorkerSessionHost`** (production) drives the real worker over the
  protocol. Every operation is a correlated request/response — a request
  carries a `messageId`, the reply carries it back as `replyTo`. A
  `protocol/error` naming that `replyTo` rejects the same pending request,
  and every request has a timeout, so a worker that faults or hangs
  mid-save surfaces as a **failed save with evidence** rather than a
  promise that never settles.

  That correlation only works if the worker actually sends the `replyTo`, and
  until #103 no fault did. The pending `initialize` therefore sat until its
  15 s timeout and reported "the simulation worker did not reply" for a save
  that was simply bad. Faults raised while handling a request now carry the
  request's id, which ADR 0003 has always permitted ("A protocol fault may
  optionally identify the rejected request", decision 2; "A fault that *was*
  prompted by a request is free to carry the `replyTo` its schema already
  permits", amendment). A fault with no request behind it — the tick loop, an
  undecodable message — still carries none, because it must not resolve a
  pending request that happens to share an id.

  The fault's code reaches the caller too (`WorkerFaultError`), because
  `snapshot-incompatible` is the one answer that may cost a generation: it
  becomes a `SnapshotRestoreRejectedError`, and everything else stays an
  ordinary error. Refusing a snapshot also leaves the worker usable rather
  than `faulted` — it installed no runtime, and `handleInitialize` accepts
  only `uninitialized`, so faulting it would make one bad save cost every
  later load in the tab.
- **`InProcessSessionHost`** (tests, headless tooling) runs the same
  simulation in-process. This is not a bypass of the boundary — it is the
  same boundary honoured through the same interface, for contexts where a
  `Worker` adds only flakiness. A save/load test against it proves the
  same contract the worker host satisfies.

No protocol schema change was needed: ADR 0003 already gives snapshots an
independent `schemaId`/`schemaVersion` whose evolution "does not
automatically require an envelope-version change". The session bundle
therefore travels as `simulation-save-payload` over the existing
`structured-clone` transport — at v2 since #50 changed the shape of its
`entities` field and at v3 since #70 added `simulation`, which is exactly the
change that independent version exists to declare. What *did* change on the
worker side:

- `simulation/request-snapshot` now returns the **full** session bundle
  (kernel + world + construction + entities, and since #70 `simulation`), not
  the kernel alone. A kernel-only snapshot is not a save — the world and
  construction are what make a restored prison a prison, and `simulation` is
  what makes it a populated one.
- `simulation/initialize` with `source.kind === 'snapshot'` is implemented
  (it previously threw `'Snapshot restore not yet implemented'`), and
  faults with `snapshot-incompatible` on an unknown `schemaId`/version or
  a structurally corrupt payload rather than restoring garbage.
- Entity liveness is encoded JSON-safe before it crosses the boundary. The
  protocol declares its `structured-clone` payload as `jsonValue`, so a raw
  `Uint8Array` would have been rejected by the main thread's own message
  decoder before it could reach a save. The codec moved to
  `src/simulation/entity/entity-codec.ts` (the simulation layer may not
  import persistence; persistence re-exports it).

`tests/contract/worker-snapshot-roundtrip.test.ts` pins this end to end:
correlated replies, the full bundle, JSON-stability across the boundary, a
live simulation round-tripping into a *second* worker instance with its
pending command queue intact, seed determinism, and both fault paths.

### `SessionController`

- `createPrison` creates the slot **and immediately writes generation 1**,
  so a crash right after "New prison" cannot leave a slot whose
  `loadCurrent` reports `no-valid-generation`.
- `buildEnvelope` captures from the host and wraps the result in a
  checksummed `SaveEnvelope`. The bundle's `entities` field is already in
  the JSON-safe encoded form, and `createSaveEnvelope` takes it as such —
  it does not re-encode what the worker already encoded.
- `saveNow` returns the repository's `SaveResult` unchanged, giving the UI
  durable success/failure evidence, and records `markPendingSync`
  bookkeeping for #20 to act on later. It never contacts the network. A
  capture failure (faulted or hung worker) becomes a failed `SaveResult`,
  never a thrown exception into a click handler.
- `markDirty` feeds the existing `AutosaveScheduler`. That scheduler's
  `buildEnvelope` hook is now allowed to be async, since capturing state
  means a worker round trip; the slot is claimed *before* the await so a
  dirty marker arriving during capture still coalesces into one follow-up
  rather than starting an overlapping save.
- `loadPrison` sends the validated envelope payload to the host and reports
  whether recovery fell back to an earlier generation. When the host *rejects*
  the snapshot it demotes that generation and tries the next-newest one, so
  the newest-first walk covers restore failures and not only decode failures
  (#103, and "Demotion also covers saves that decode and cannot be restored"
  above). A generation offered again after being demoted throws rather than
  looping: demotion is what makes the walk terminate.

Default autosave cadence is `DEFAULT_AUTOSAVE_INTERVAL_MS` (30s),
justified by the measurements below rather than picked by feel — issue
#19 requires that "dirty tracking/cadence must be justified by
measurements before tuning."

### What a restore actually carries

`restoreSimulationRuntime` (`src/simulation/runtime/restore-session.ts`)
returns an explicit `RestoredScope`, and the UI displays it, because a save
still carries less than the live runtime holds — though since V3 the
difference is derived and in-flight state rather than whole subsystems:

| Restored | Rebuilt from scratch |
| --- | --- |
| kernel tick and command queue | room and topology caches (recomputed from the world) |
| RNG stream states | navigation caches and in-flight path requests (re-issued on the next tick) |
| world terrain and ownership | |
| construction orders and undo/redo | |
| entity id liveness | |
| prisoner and staff names | |
| prisoners, needs, actions and cell assignments | |
| jobs, containers and utility networks | |
| doors, security sectors, guards and patrols | |
| contraband, intelligence and searches | |
| incidents, gangs and tunnels | |

Until V3 the right-hand column held five whole subsystem families, because the
envelope was defined in #18 before those systems existed — a real, bounded
limitation that #70 closed. What remains is deliberate: see "What is
deliberately excluded from the payload" for the reason attached to each entry.
The right-hand column must never go empty and quietly stop being shown; the
save panel says what a restore does *not* bring back, and a test pins that it
still does.

A save that predates V3 restores with its `simulation` section absent, and
therefore behaves exactly as V2 did — those subsystems rebuild empty. That is
reported through the same `RestoredScope`, which is why the migration does not
fabricate an empty section.

Restore reuses `createNewSimulationRuntime`'s `world` option rather than
duplicating the system graph, so there is exactly one definition of how a
session is assembled and a restored session is wired identically to a
fresh one. `Kernel.restoreState` applies serialized kernel state onto an
already-wired kernel (the static `Kernel.restore` builds kernel and system
list together, which is the wrong shape here).

### Lifecycle saves are best-effort, never load-bearing

Issue #19 requires that lifecycle events not be trusted ("browser
lifecycle events are unreliable"; "treating unload/pagehide as guaranteed"
is out of scope). `LifecycleSaveHandler` therefore:

- listens to `visibilitychange` (hidden) and `pagehide` — **never**
  `unload`/`beforeunload`, which do not fire on modern mobile browsers and
  block bfcache where they do. A test asserts no listener is ever attached
  to them.
- registers those two events on **two different targets**: `visibilitychange`
  on `document` and `pagehide` on `window`. The DOM dispatches `pagehide` at
  `Window`, and a window event does not propagate down to the document, so a
  shared `document` target cannot receive both. Issue #92 was exactly that:
  one resolved target carried both registrations and defaulted to `document`,
  so the `pagehide` listener never fired. A shared `window` target *would*
  receive both, since `visibilitychange` is dispatched at `document` with
  `bubbles: true` and reaches `window` on the way up; the pair is kept for
  explicitness rather than out of necessity, so that each listener sits on
  the object its own event is specified to be dispatched at and neither
  registration depends on the event path. `LifecycleSaveOptions.targets`
  takes a named pair (`visibility`, `pageTransition`), both required, and
  defaults to the two globals; `src/main.ts` passes nothing and gets that
  pair.
- fires a save attempt **without awaiting it**, because a lifecycle
  handler cannot hold the page open for an async IndexedDB transaction.
- swallows failures rather than throwing out of a page event handler,
  recording them on `getLastSaveResult()` for the next session to surface.

Correctness never depends on these events firing; they only narrow the
window of lost play between interval autosaves. The interval autosave
remains the actual durability mechanism.

What #92 cost, on that reading, was a notice rather than the safety net.
`pagehide` is the one specified to cover navigating away, closing the tab and
entering the bfcache while the page is still visible, and in Chromium it
arrives before the `visibilitychange` that reports the tab hidden — but on the
transition actually observed in a real browser here, a same-tab navigation,
that `visibilitychange` still arrived, so a save was still attempted even with
the `pagehide` listener sitting where it never fired. That is measured, not
reasoned: with both listeners put back on `document`,
`tests/browser/lifecycle-save.spec.ts` records `['visibility-hidden']` where
the fixed wiring records `['pagehide', 'visibility-hidden']`. Whether some
other transition delivers a `pagehide` with no `visibilitychange` behind it
has not been established here, and no test covers one; the deficit that *is*
demonstrated is the earlier notice, not an unsaved transition.

Whether each event actually reaches the handler is settled in
`tests/browser/lifecycle-save.spec.ts`, not in the unit tests. A fake event
target receives whatever a test dispatches at it, so it agrees with the
browser regardless of what the browser actually does — the unit tests passed
throughout #92, and still pass if the *default* target pair is broken. The
browser spec drives a real navigation and requires both real,
browser-generated events to arrive, in the order the browser delivered them:
`pagehide`, then the `visibilitychange` that reports the tab hidden.

It deliberately stops there and does not assert which object each listener is
registered on. Since `visibilitychange` bubbles to `window`, an
implementation that registered both listeners on `window` would be correct in
production, and a browser test that failed it would be pinning the wiring's
shape rather than its contract. Which *injected* target each listener lands
on is a statement about `LifecycleSaveOptions.targets`, and that is where the
unit tests make it.

### Save/load UI (`src/ui/save-panel.ts`)

Plain DOM beside the Phaser canvas, not a Phaser scene — `AGENTS.md`
assigns "rendering, browser UI and input orchestration" to the main thread
as separate concerns, and save/load is browser UI over persistence with no
business in the renderer's scene graph. It reads only controller
projections.

**It is laid out by the HUD, and owned by neither.** `main.ts` mounts it into
`HudHandle.asideSlot` — a slot at the top of the HUD's right rail that the HUD
positions and never renders into. The panel predates the HUD shell and used to
be a `position: fixed` layer of its own at `z-index: 10`, with no layout
relating it to anything in the HUD; issue #88 is what that cost. On the Build
tab the Build panel — inside a `z-index: 20` layer, with `pointer-events: auto`
— landed on top of it and swallowed the clicks, silently and with no console
message. Measured on that layout, with the Build panel's numeric fallback
expanded (one tap from the default, and the state the issue was reported in):
it covered 91 % of the save panel at 1280x720, 91 % at 900x600, 89 % at
1024x768, 83 % at 375x812 and 37 % at 1440x900, taking all five of New prison,
Save now, Export, Load and Delete at four of those five sizes — at 1440x900 it
took only the per-prison Load and Delete. Folded it was narrower but not
harmless — 66 % and three of the five buttons at 900x600. Sharing one flex
column with the Build panel makes the overlap impossible rather than merely
corrected.

**Its height comes from the rail, not from the viewport.** The slot asks the
rail for no height of its own and takes what the Build panel does not need,
with a floor of a quarter of the rail; the panel is a scroll container inside
it, so a long prison list scrolls in place instead of pushing anything. That
matters to this module in one concrete way: the panel is free to render as
many prison rows as the player has, and none of them can move the Build
panel. Measured on the Build tab at 1280x720 with one prison saved, the panel
is 161px tall with New prison, Save now and Export fully in view and the
per-prison Load and Delete row straddling its lower edge, which the panel
scrolls to; at 1440x900 it gets its full height and does not scroll at all. The panel used to cap itself at `60vh`
instead, which is a budget the rail never agreed to — 432px of a 603px rail
that also has to hold the Build panel.

The slot exists instead of folding the panel into `src/ui/hud/` because this
module type-imports `SaveResult`, `PrisonSlotMetadata`, `SaveEnvelope` and
`RestoredScope` from `src/persistence/**` and `src/simulation/runtime/**`, and
the HUD may import neither (`AGENTS.md` boundary 1). The HUD supplies a box;
the composition root supplies the panel.

`describeSaveResult` maps each failure code to its **own** state and
advice, satisfying "quota, private-mode and transaction-abort errors are
distinct recoverable states" — quota tells the player to free space,
abort tells them to retry, and both state that the previous save is
intact (a guarantee the repository genuinely provides). A storage-open
failure (private browsing with IndexedDB blocked) is caught in `main.ts`
and degrades to a playable-but-unsaveable session rather than a blank
screen.

### Bundle-size note

Wiring persistence into `main.ts` grew the production bundle from
1,384.01 kB to 1,607.50 kB (17 → 201 modules). This is the first time any
simulation/persistence code is actually reachable from the entry point —
every prior issue (#14–#28) shipped code that nothing imported yet, which
is why the bundle had stayed flat. The increase is real product code, not
accidental inclusion; code-splitting it is a presentation-layer concern
(#33/#34), not a persistence one.

## Two known costs worth their own issue

Profiling a representative save while closing #19 turned up two costs large
enough to own their own issues rather than be tuned in passing. Reproduce
either with the measurement harness (report-only, no timing assertions — see
`docs/BENCHMARKING.md` and `docs/TESTING.md`):

```bash
pnpm exec vitest run --config tests/perf/vitest.perf.config.ts
```

### 1. Redundant save-payload re-validation (#49) — resolved

Every save used to validate its payload three times: `savePayloadV1Schema`
inside `createSaveEnvelope`, then `saveEnvelopeV1Schema` re-walking the same
payload as a nested field, then `PrisonSaveRepository.save` re-decoding an
envelope this same process had built and checksummed moments earlier. Two
thirds of an autosave was re-proving something already proven.

"Trusted envelopes" above describes the fix: the envelope's own fields are
validated separately from its payload, and `save()` decides whether to
re-validate by *provenance* — a branded, identity-backed type — rather than
by a flag a caller could pass wrongly. Untrusted envelopes are unaffected and
still pay full validation.

Measured medians, `tests/perf/` at `4b361e3` vs. the same harness after the
change, on one developer machine (Node 24.19.0, WSL2). `fake-indexeddb` is an
in-process implementation with no disk and no quota, so these are a **CPU
lower bound**, not a production estimate — a real browser adds storage latency
on top. Absolute values are hardware-specific; the ratios are the evidence.

| tier | `createSaveEnvelope` | `save()` | autosave cycle |
| --- | --- | --- | --- |
| small | 8.19 → 5.58 ms | 7.25 → 1.26 ms | 15.6 → 7.03 ms |
| medium | 29.4 → 19.6 ms | 25.9 → 6.84 ms | 55.6 → 27.5 ms |
| large | 105 → 70.8 ms | 86.8 → 28.3 ms | 193 → 101 ms |
| x-large | 256 → 177 ms | 227 → 75.1 ms | 490 → 256 ms |

The `save()` column is the production autosave path. The harness reports an
`untrusted save` column beside it — the same envelope after a serialization
round trip, i.e. the import path — precisely so the remaining boundary cannot
be quietly lost: it measured 6.68 / 24.4 / 86.3 / 242 ms across the four
tiers, unchanged from the pre-#49 `save()` figures. `decodeSaveEnvelope`
itself is untouched and unchanged. Against the in-memory store a trusted
`save()` falls to ~0.01 ms at every tier, which is the clearest statement of
what the third walk actually cost: essentially all of it.

At the large tier the full autosave cycle is now ~0.34% of a 30 s interval
(was ~0.64%). This is the measurement #19 asked for before the cadence is
tuned; changing `DEFAULT_AUTOSAVE_INTERVAL_MS` is still a separate decision
and is not made here.

### 2. Entity snapshot serialized at capacity, not population (#50) — resolved

The `entities` section used to be a constant 29.4 KiB at every tier, because
`EntityStoreSnapshot` was serialized across the store's full allocated
capacity (`DEFAULT_PRISONER_CAPACITY`, 5,000) rather than its live
population — 45% of a small prison's 66.0 KiB envelope, and pure padding.

"V2: the entity ledger follows population, not capacity" above describes the
fix: `generations` and `alive` are run-length encoded and `freeIndices`
carries only its live prefix, behind a save-schema V2 and a V1 → V2
migration. `entities` fell to 129–135 B across all four tiers, taking a small
prison's envelope from 66.0 KiB to 36.7 KiB (−44%) and its three-generation
retained window from 198.1 KiB to 110.2 KiB. The live `EntityStore` layout
(ADR 0005) was not touched, and the V1 fixtures still load unmodified.

Two things this deliberately did **not** do, both still open if they ever
matter: per-component entity state is still excluded from the payload (see
"What is deliberately excluded" above), and general save compression remains a
storage-backend concern with `estimateSaveEnvelopeByteSize` as its hook. With
`entities` now negligible, the world and construction sections are what a
future size issue would have to address.
