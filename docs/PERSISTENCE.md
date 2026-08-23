# Save schema and migration contract

This document covers `src/persistence/`: the canonical save envelope, its
runtime validation, checksum and forward-migration framework, and (in
"Local persistence" below) the IndexedDB-backed repository that consumes it.
Supabase sync (#20) is a separate, not-yet-implemented issue.

## Envelope shape (`SaveEnvelope`, currently V2)

```
{
  saveSchemaVersion: 2,
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
    entities?: { capacity, nextAvailableIndex, maxActiveIndex,
                 generations: [[value, length], ...],         // run-length encoded
                 freeIndices: [ ... ],                        // the live free-list prefix only
                 alive: [[0|1, length], ...] },               // run-length encoded
  },
}
```

`payload` is exactly the union of the existing per-subsystem snapshot
contracts (Issues #5, #12, #16/#17), re-validated at the save boundary with
Zod (`src/persistence/save-schema.ts`), not a new shape invented for this
issue.

`SaveEnvelope`/`SavePayload`/`TrustedSaveEnvelope` are the names call sites
use for "the current version"; `SaveEnvelopeV1` and `SaveEnvelopeV2` name
specific historical shapes and should appear only in `save-schema.ts` and
`save-migrations.ts`. V2 exists because #50 changed the entity section — see
"V2: the entity ledger follows population, not capacity" below.

### What is deliberately excluded from the payload

- **Per-component entity state** (`ComponentBitset`, `TransformComponent`,
  future components). `entities` covers only `EntityStore`'s own ID-liveness
  ledger, in V1 and V2 alike. No runtime currently attaches components to an
  `EntityStore` — the first real consumer (prisoner/staff entities, Phase 7)
  should introduce a component registry and extend the payload deliberately,
  rather than this issue inventing an open-ended generic serialization format
  nothing yet needs. `entities` is optional for the same reason: a fresh
  prison has none.
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
envelope carries around its payload. `saveEnvelopeV2Schema` (metadata +
`payload`) is what the migration chain registers for the current version and
what `decodeSaveEnvelope` therefore still runs in full;
`saveEnvelopeMetadataV2Schema` (metadata alone) is what
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

`saveMigrationChain` registers V1 and V2 schemas and one `1 -> 2` step. The
chain-walking, per-step validation and immutability guarantees are also
exercised against a synthetic multi-version fixture in
`tests/unit/persistence-migration.test.ts`, independent of the real save
versions, and the real V1 → V2 upgrade is covered in
`tests/migrations/save-v1-to-v2.test.ts`.

### Adding a V3 later

1. Add the new interface/type and a `.strict()` Zod schema for it, alongside
   the existing ones — never edit a historical schema to match new code.
2. `saveMigrationChain.registerSchema(zodVersionSchema(3, v3Schema))`.
3. `saveMigrationChain.registerMigration({ fromVersion: 2, toVersion: 3, migrate })`,
   pure and side-effect-free, in `src/persistence/save-migrations.ts`. If it
   changes the payload, recompute `checksum` in the step (see "Checksum").
4. Bump `SAVE_SCHEMA_VERSION` to `3`. Call sites use the version-neutral
   `SaveEnvelope`/`SavePayload`/`TrustedSaveEnvelope` aliases, so this step no
   longer sweeps a rename through the repository the way V2 did.
5. Keep every older fixture in `tests/fixtures/persistence/` checked in
   unchanged, and add a test asserting they migrate to the new shape
   correctly.

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
Real-browser behavior is covered separately by the opt-in Chromium project
(`tests/browser/`, `pnpm test:browser` — see `docs/TESTING.md`), which
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
`entities` field, which is exactly the change that independent version exists
to declare. What *did* change on the worker side:

- `simulation/request-snapshot` now returns the **full** session bundle
  (kernel + world + construction + entities), not the kernel alone. A
  kernel-only snapshot is not a save — the world and construction are what
  make a restored prison a prison.
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
  whether recovery fell back to an earlier generation.

Default autosave cadence is `DEFAULT_AUTOSAVE_INTERVAL_MS` (30s),
justified by the measurements below rather than picked by feel — issue
#19 requires that "dirty tracking/cadence must be justified by
measurements before tuning."

### What a restore actually carries

`restoreSimulationRuntime` (`src/simulation/runtime/restore-session.ts`)
returns an explicit `RestoredScope`, and the UI displays it, because a save
carries **less than the current simulation contains**:

| Restored | Rebuilt empty |
| --- | --- |
| kernel tick and command queue | prisoner needs and actions |
| RNG stream states | jobs and inventory |
| world terrain and ownership | security sectors, guards, patrols |
| construction orders and undo/redo | contraband and intelligence |
| entity id liveness | incidents and gangs |

The right-hand column is a real, bounded limitation, not an oversight: the
envelope was defined in #18, before the systems in that column existed.
Extending the payload is a save-schema change — a new version plus a
migration, per `AGENTS.md`'s "every persistent format must have a version
and migration strategy before release" — so it belongs in its own issue
rather than being smuggled in here. V2 (#50) changed only *how* entity
liveness is written down, not which subsystems are carried, so this table is
unchanged by it. Stating the gap in the type, in the UI and in this table is
the honest interim contract.

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
- fires a save attempt **without awaiting it**, because a lifecycle
  handler cannot hold the page open for an async IndexedDB transaction.
- swallows failures rather than throwing out of a page event handler,
  recording them on `getLastSaveResult()` for the next session to surface.

Correctness never depends on these events firing; they only narrow the
window of lost play between interval autosaves. The interval autosave
remains the actual durability mechanism.

### Save/load UI (`src/ui/save-panel.ts`)

Plain DOM beside the Phaser canvas, not a Phaser scene — `AGENTS.md`
assigns "rendering, browser UI and input orchestration" to the main thread
as separate concerns, and save/load is browser UI over persistence with no
business in the renderer's scene graph. It reads only controller
projections.

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
