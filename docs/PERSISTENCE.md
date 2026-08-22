# Save schema and migration contract

This document covers `src/persistence/`: the canonical save envelope, its
runtime validation, checksum and forward-migration framework, and (in
"Local persistence" below) the IndexedDB-backed repository that consumes it.
Supabase sync (#20) is a separate, not-yet-implemented issue.

## Envelope shape (`SaveEnvelopeV1`)

```
{
  saveSchemaVersion: 1,
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
    construction: { orders, undoStack, redoStack },           // ConstructionSystem.snapshot()
    entities?: { capacity, nextAvailableIndex, maxActiveIndex, freeCount, generations, freeIndices, alive },
  },
}
```

`payload` is exactly the union of the existing per-subsystem snapshot
contracts (Issues #5, #12, #16/#17), re-validated at the save boundary with
Zod (`src/persistence/save-schema.ts`), not a new shape invented for this
issue.

### What is deliberately excluded from V1

- **Per-component entity state** (`ComponentBitset`, `TransformComponent`,
  future components). `entities` covers only `EntityStore`'s own ID-liveness
  ledger. No runtime currently attaches components to an `EntityStore` — the
  first real consumer (prisoner/staff entities, Phase 7) should introduce a
  component registry and extend the payload deliberately, rather than this
  issue inventing an open-ended generic serialization format nothing yet
  needs. `entities` is optional for the same reason: a fresh prison has none.
- **Room/topology state.** `TopologyManager` and `RoomSystem` hold no
  independent state — they are pure caches recomputed from `SparseWorld`
  geometry (`TopologyManager.update`) — so nothing to persist exists there.
- **Storage backend, compression algorithm, encryption.** Out of scope per
  the issue; see "Size hook" below for the one hook this schema does provide.

## Checksum

`computeSaveChecksum` (`src/persistence/checksum.ts`) reuses
`deterministicStateHash` from `src/simulation/determinism/canonical.ts` — the
same canonical-JSON FNV-1a-style hash the simulation already uses for state
diagnostics — rather than a new algorithm. Canonicalization sorts object keys,
so the checksum is stable across equivalent key insertion order. It detects
corruption/accidental mismatch; it is **not** a cryptographic signature.

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

Only V1 exists today, so `saveMigrationChain` has zero registered migrations
— `decodeSaveEnvelope` still routes through the same dispatcher a future V2
will use. The chain-walking, per-step validation and immutability guarantees
are exercised against a synthetic multi-version fixture in
`tests/unit/persistence-migration.test.ts`, independent of whether a second
real save-schema version exists yet.

### Adding a V2 later

1. Add the new interface/type and a `.strict()` Zod schema for it, alongside
   V1's — never edit the V1 schema to match new code.
2. `saveMigrationChain.registerSchema(zodVersionSchema(2, v2Schema))`.
3. `saveMigrationChain.registerMigration({ fromVersion: 1, toVersion: 2, migrate })`,
   pure and side-effect-free.
4. Bump `SAVE_SCHEMA_VERSION` to `2` and update `SaveEnvelopeV1`-typed call
   sites to the new type.
5. Keep the V1 fixtures in `tests/fixtures/persistence/` checked in unchanged,
   and add a test asserting they migrate to the new shape correctly.

## Error taxonomy

`decodeSaveEnvelope` returns a distinct, actionable error code rather than a
single generic failure:

| Code | Meaning |
| --- | --- |
| `invalid-shape` | Not an object, missing/non-numeric `saveSchemaVersion`, or fails its declared version's schema (includes malformed/truncated saves and `updatedAt < createdAt`). |
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

This sidesteps rather than resolves the "approved browser test environment"
`docs/TESTING.md` requires before browser-specific code can be tested, and
that gap is deliberate: `IndexedDbLocalSaveStore` (`indexeddb-store.ts`) is
the one piece that must call the real `indexedDB` global, and it is kept
deliberately thin (open the database with a two-store schema; wrap each
request in a promise; surface transaction completion/abort) so it can be
reviewed by inspection against the fake it mirrors, rather than requiring
this issue to introduce jsdom/happy-dom or a polyfill like `fake-indexeddb`
into the test suite's approved environment set.

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
  validated `SaveEnvelopeV1` per generation.

### Generation retention and recovery

`save()` writes the new generation, advances `currentGenerationId`, and only
then deletes whatever `applyGenerationRetention` prunes — all inside one
`readwrite` transaction, so a failed write can never destroy the last
known-good generation. The default window keeps the current generation plus
two previous ones (`keepGenerations: 3`), matching the issue's minimum.

`loadCurrent()` tries the current generation first (schema + checksum via
`decodeSaveEnvelope`, i.e. #18's validation, not a separate check). If it is
missing or fails validation, it walks the remaining generations newest-first
and adopts the first one that validates — healing `currentGenerationId` and
dropping the confirmed-corrupt generation(s) so the pointer does not force
the same recovery scan on every subsequent load. `no-valid-generation` is
returned only when nothing in the retained window validates.

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

### What is out of scope here

Supabase execution (#20); full service-worker asset caching; simulating
elapsed time while the browser was closed; and any cross-tab/multi-writer
concurrency control beyond the single-process autosave/manual-save
coalescing above — `revision` is caller-managed and this repository does
not yet enforce optimistic concurrency on it, matching the "not this issue"
scope in `save-schema.ts`'s own documentation.
