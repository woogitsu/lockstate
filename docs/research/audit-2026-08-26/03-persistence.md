# Lockstate audit — Persistence & data integrity

Scope: `src/persistence/**`, `src/simulation/runtime/{session-systems,restore-session}.ts`,
`src/simulation/{codec,entity}/*codec*`, `src/simulation/worker/state-machine.ts`,
`supabase/migrations/*`, `src/main.ts` persistence boot.
Read-only audit. Every CONFIRMED finding below was either read directly in the
cited lines or reproduced by executing the repository's own code from a
scratch Vitest project outside the repo (no repo files were modified).

## Findings

| ID | Title | Severity | Status |
|----|-------|----------|--------|
| PER-01 | Any restore-time throw deletes **every** retained save generation | Critical | CONFIRMED |
| PER-02 | One capture failure permanently wedges autosave, silently | Critical | CONFIRMED |
| PER-03 | Autosave fires only on accepted player commands — simulated time is not durable | High | CONFIRMED |
| PER-04 | `decodeSaveEnvelope` **throws** on a V1 save: `entities.capacity` is unbounded at V1 | High | CONFIRMED |
| PER-05 | A pending autosave is discarded when the player creates/loads another prison | High | CONFIRMED |
| PER-06 | A failed load leaves the session pointing at a prison whose worker is gone | High | CONFIRMED |
| PER-07 | A V1/V2 entity ledger restores live-but-invisible prisoner slots | Medium | CONFIRMED |
| PER-08 | A decode-clean save with a foreign `entities.capacity` is deleted, not reported | Medium | CONFIRMED |
| PER-09 | `saveNow()` bypasses the single-writer guarantee; two writes share one `revision` | Medium | CONFIRMED |
| PER-10 | No `onblocked` / `onversionchange` on the IndexedDB connection | Medium | CONFIRMED |
| PER-11 | `loadCurrent` spans three transactions; no cross-tab coordination anywhere | Medium | CONFIRMED |
| PER-12 | Cloud sync is unwired; `pendingSync` is half-written and never cleared | Medium | CONFIRMED |
| PER-13 | No client-side payload-size check; the server's LS002 refusal collapses to `'error'` | Medium | CONFIRMED |
| PER-14 | `downloadVersion` fabricates envelope metadata (`createdAt`, `gameVersion`) | Low-Med | CONFIRMED |
| PER-15 | `save()`/`importSave()` never check `envelope.prisonId` against the slot key | Low-Med | CONFIRMED |
| PER-16 | Quota-exceeded has no self-healing: every later autosave fails forever | Low | CONFIRMED |
| PER-17 | Newer systems' counters are unpersisted while every peer system's metrics are | Low | CONFIRMED |
| PER-18 | `pruneUndefined` covers only `simulation`; the invariant is unenforced elsewhere | Low | CONFIRMED |
| PER-19 | A non-finite number makes `createSaveEnvelope` throw (feeds PER-02) | Low | CONFIRMED |
| PER-20 | `MemoryLocalSaveStore` is less faithful than the real store in two ways | Low | CONFIRMED |

---

## PER-01 — Any restore-time throw deletes every retained save generation
**Critical · CONFIRMED**

`src/simulation/worker/state-machine.ts:557-561`

```ts
try {
  this._runtime = restoreSimulationRuntime(snapshot.data as unknown as SessionSnapshotBundle).runtime;
} catch (error) {
  return this.fault('snapshot-incompatible', `Snapshot could not be restored: ...`, rejectedSnapshotFault(msg.messageId));
}
```

That `catch` is unconditional. `src/persistence/session/worker-session-host.ts:130`
turns `snapshot-incompatible` into `SnapshotRestoreRejectedError`;
`src/persistence/session/session-controller.ts:205-208` treats that error as
"this generation is bad" and calls `demoteGeneration`, which **deletes the
record** (`src/persistence/local/repository.ts:266`). `loadPrison`'s loop
(`session-controller.ts:182-218`) then repeats for the next-newest generation.

`SnapshotRestoreRejectedError`'s own docstring
(`src/persistence/session/runtime-host.ts:9-15`) states the rule this violates:
"a hung, dead or mid-shutdown host must *not* raise it, or one broken worker
would delete a player's newest good saves one load at a time." The worker's
catch-all raises it for **any** exception, whether or not the snapshot is at
fault. `docs/PERSISTENCE.md:1372-1377` repeats the same (now false) assurance.

Reachable throws that are *not* the snapshot's fault:
- `RangeError: Array buffer allocation failed` — a big world under memory pressure.
- `room-instance-registry.ts:163` duplicate-instance-id `RangeError`; the schema
  (`save-schema.ts:502`) permits duplicate `instanceId` rows.
- `room-instance-registry.ts:836` `Snapshot references unknown room instance id`.
- `entity-store.ts:252-253` `Cannot load snapshot with different capacity` (see PER-08).
- `restore-session.ts:277,280,336`, `session-systems.ts:362,438`.
- Any invariant `throw` a future subsystem `loadSnapshot` adds — i.e. any restore bug.

**What the player loses:** the entire prison, permanently. Reproduced with the
real `SessionController`/`PrisonSaveRepository` and a host that throws
`SnapshotRestoreRejectedError`: three retained generations → `generationIds: []`,
`currentGenerationId: undefined`, `{ok:false, reason:'no-valid-generation'}` —
and a second load **with the failure removed** still returns
`no-valid-generation`, because the saves have been deleted. One restore bug
shipped in one release destroys every affected player's save on their next load,
and a patch cannot bring it back.

**Fix.** (a) Split the worker's fault: raise `snapshot-incompatible` only for the
checks at `state-machine.ts:546-555` plus a small, explicit allow-list of
"this payload is unrestorable" errors that subsystems tag (e.g. a
`SnapshotRejected` error class thrown deliberately by `loadSnapshot` paths);
report everything else as a distinct recoverable fault code that costs no
generation. (b) Make demotion non-destructive: keep the record and move the id
to a `quarantinedGenerationIds` list on the slot, so `delete()` can still clean
it up and a fixed build can retry it. (c) Cap demotions per load (never demote
the last remaining generation without an explicit user confirmation).

## PER-02 — One capture failure permanently wedges autosave, silently
**Critical · CONFIRMED**

`src/persistence/local/autosave.ts:66` and `:69-79`

```ts
void this.performSave(prisonId);          // :66 — no .catch
...
private async performSave(prisonId: string): Promise<void> {
  const envelope = await this.deps.buildEnvelope(prisonId);   // :70 — may reject
  ...
  this.settle(prisonId);                                       // :78 — never reached
}
```

`performSave` has no `try`/`finally`. If `buildEnvelope` rejects, the per-prison
entry stays in state `'saving'` for ever: `settle()` never runs, so no follow-up
timer is scheduled, and `markDirty` (`:45-47`) only flips `'saving'` →
`'saving-with-pending-dirty'`, which nothing ever consumes.

`buildEnvelope` rejects on: the 15 s worker reply timeout
(`worker-session-host.ts:83-86`), `The simulation session was stopped`
(`worker-session-host.ts:189` — which is exactly what a prison switch does),
a snapshot schema-id mismatch (`worker-session-host.ts:167-169`), and any Zod
throw from `createSaveEnvelope` (`save-schema.ts:1389`, see PER-19).

Executed against the real `AutosaveScheduler`: after one rejecting capture,
`isPending('p') === true` for ever, `saves.length === 0` after the dependency
recovers and the prison is dirtied again, and the failure surfaced only as **one
unhandled promise rejection**. `onResult` never fires, so
`SessionController.lastSaveResult` is never set and
`SavePanel.reportBackgroundSave` (`src/main.ts:2102`) is never told — the player
sees no error and believes autosave is running.

**What the player loses:** every minute of play after the first transient
capture failure, for the rest of the page's life, with no warning.

**Fix.** Wrap `performSave` in `try/catch/finally`, always `settle()`, and route
the caught error through `onResult` as
`{ok:false, error:{code:'unknown-error', message}}` so the panel reports it.
Add a scheduler test that dirties again after a rejected capture and asserts a
save happens.

## PER-03 — Autosave fires only on accepted player commands
**High · CONFIRMED**

`src/main.ts:2129` — `commandSender?.onCommandAccepted(() => controller.markDirty());`
is the **only** `markDirty` caller in `src/`.

`AutosaveScheduler` is purely dirty-driven (its own docstring, and
`main.ts:2113-2118` records that nothing called it at all until #146). Wiring it
to command acceptance means simulated time that passes without a player command
is never marked dirty and therefore never autosaved: an hour of a prison running
— income accruing daily (`economy/income.ts:309`), needs decaying, incidents
triggering and resolving, build orders completing, deliveries arriving — produces
no autosave at all. `docs/PERSISTENCE.md`'s justification for the lifecycle save
being fire-and-forget ("the interval autosave is the durability mechanism") is
only true for command-driven play.

**What the player loses:** all unsaved simulated progress on a crash/OS kill,
however long the session, if they were watching rather than building.

**Fix.** Mark dirty on simulated progress as well as on commands — e.g. on the
worker's periodic `simulation/status-counts` publication, rate-limited, or a
tick-count threshold. Cheap and additive; the scheduler already coalesces.

## PER-04 — `decodeSaveEnvelope` throws: V1 `entities.capacity` is unbounded
**High · CONFIRMED**

`src/persistence/save-schema.ts:225-235` — `entityStoreSnapshotV1Schema` has
`capacity: z.number().int().min(0)` with **no maximum and no `superRefine`**,
while V2's equivalent is bounded (`:248`, `max(0xf_ffff)`) and cross-checked
(`:256-284`). `src/persistence/save-migrations.ts:43-53` then allocates from the
unbounded number *before* any bound applies:

```ts
const generations = new Uint16Array(capacity);   // :43
const alive = new Uint8Array(capacity);          // :46
const freeIndices = new Uint32Array(capacity);   // :52
```

Measured by executing `decodeSaveEnvelope` on the repository's own
`save-v1-in-progress.json` fixture with `entities.capacity` edited and the
checksum recomputed:

| `capacity` | outcome |
|---|---|
| `3_000_000_000` | **10.7 s** of blocking work and ~18 GB of transient allocation, then `migration-produced-invalid-output` |
| `5_000_000_000` | **uncaught** `RangeError: Array buffer allocation failed` |
| `Number.MAX_SAFE_INTEGER` | **uncaught** `RangeError: Invalid typed array length` |

This is the exact defect class `docs/PERSISTENCE.md:99-152` closed for
`world.chunkSize` ("a field that lies about its own cost"), left open one
version down. A thrown `RangeError` escapes every result-typed boundary:
`repository.ts:209` (`loadCurrent`, so the generation walk and rollback never
run — the prison becomes unloadable while two good generations sit on disk),
`repository.ts:314` (`importSave`, so the UI gets an exception instead of a
`rejected` decode error), `repository.ts:159` — which sits **outside** the
`try` at `:166` — and `sync-engine.ts:46`. One corrupted byte in a stored
`capacity`, or one hostile imported file, is enough.

**Fix.** Bound V1's `capacity` at the same `0xf_ffff` and add the same
cross-field `superRefine` V2 has (this narrows only values no writer could
produce — every real V1 save carries `DEFAULT_PRISONER_CAPACITY`). Independently,
wrap `step.migrate(...)` at `migration.ts:160` in a `try/catch` that returns
`{code:'migration-produced-invalid-output'}`, and wrap the
`decodeSaveEnvelopeUnlessTrusted` call at `repository.ts:159` inside the existing
`try`, so no decode path can ever throw at a caller expecting a result.

## PER-05 — A pending autosave is discarded on prison switch
**High · CONFIRMED**

`src/persistence/session/session-controller.ts:221-224` — `adoptSession` calls
`this.autosave.dispose()`, and `autosave.ts:94-99` clears every timer **without
flushing**. `createPrison` (`:113`) and `loadPrison` (`:211`) both adopt.

Executed with the real controller, `InProcessSessionHost` and
`MemoryLocalSaveStore`: create prison A, advance 500 ticks, `markDirty()`
(`hasPendingAutosave() === true`), then `createPrison('B')` inside the interval
and wait well past it — prison A's stored generation is still at **tick 0**.

**What the player loses:** up to one full autosave interval (30 s default) of
play in the prison they are leaving, every time they switch or start a prison,
with no prompt and no indication.

**Fix.** Make `adoptSession` await a flush of the outgoing prison's pending save
before disposing (or call `saveNow()` for the old session first). `dispose()`
should keep its current meaning only for teardown.

## PER-06 — A failed load leaves the session pointing at a dead worker
**High · CONFIRMED**

`src/persistence/session/worker-per-session-host.ts:106-124` — `beginSession()`
does `await this.stop()` **first**, unconditionally destroying the current
session's worker, and only then claims and initialises a replacement. If
`claimForSession()` throws (`:112`) or `startFromSnapshot` fails with anything
other than a rejected snapshot, `SessionController.loadPrison` rethrows at
`session-controller.ts:205` **without clearing `this.session`**.

Result: `getActiveSession()` still names the old prison, the save panel still
shows it as active, `markDirty()` still schedules autosaves for it — and every
one of them calls `capture()` on a host with no session, which rejects
(`worker-session-host.ts:153`) and wedges the scheduler via PER-02. The player
has a session that looks live, is not, and can never be saved again.

**Fix.** Treat a failed `startNew`/`startFromSnapshot` as closing the session:
call `closeSession()` (or re-adopt nothing) on the non-rejected error path, and
surface "no simulation is loaded" rather than leaving a phantom active session.
Also claim the replacement worker *before* stopping the old one where possible,
so a claim failure is survivable.

## PER-07 — A V1/V2 entity ledger restores invisible prisoner slots
**Medium · CONFIRMED**

`src/simulation/runtime/restore-session.ts:339-341` — the "V2 shape" branch calls
only `runtime.prisoners.entityStore.loadSnapshot(entityStore)`. The full path
(`prisoner-operations-runtime.ts:172-187`) is what re-derives the query bitset
from restored liveness; this branch never runs it.

Executed on the V1 fixture with its ledger re-sized to
`DEFAULT_PRISONER_CAPACITY` and two live slots: `maxActiveIndex === 1`,
`isIndexAlive(0) === true`, `isIndexAlive(1) === true`, and
`runtime.prisoners.query.execute() === []`. Two slots are permanently alive,
consume `nextAvailableIndex`, are iterated by nothing and can never be released
(nothing destroys entities).

Mitigated by `restoredScopeFor`, which correctly reports
`entity-liveness restored` / `prisoners not carried by this save version`, so the
player is told. Still an internally inconsistent store.

**Fix.** In the liveness-only branch, either re-derive the bitset (one loop,
identical to `prisoner-operations-runtime.ts:184-187`) or deliberately restore an
empty ledger for a save with no `simulation` section — and say which in
`docs/PERSISTENCE.md`, because both are defensible and neither is currently
chosen.

## PER-08 — A decode-clean save with a foreign `entities.capacity` is deleted
**Medium · CONFIRMED**

`src/simulation/entity/entity-store.ts:252-253` throws
`Cannot load snapshot with different capacity`. `docs/PERSISTENCE.md:330-337`
records this as an inherited limitation whose consequence is that such a save
"fails the restore rather than silently resizing". Via PER-01 the real
consequence is worse: the save is **deleted**.

Executed: the repository's own `tests/fixtures/persistence/save-v1-in-progress.json`
(capacity 8) migrates V1→V5 cleanly, passes checksum, and then throws on restore.
`tests/migrations/save-v2-to-v3.test.ts:100-105` documents that this is why the
in-progress fixture is excluded from the restore test — so **no test anywhere
restores a V1 save that carries live entities**, and the claim that a first-release
save "actually gets" migrated the whole way is proven for decode only.

`DEFAULT_PRISONER_CAPACITY` has only ever been `5_000` (`new-session.ts:206`;
`git log -S` finds one introduction and no change), so the specific trigger is
latent — but it is one constant edit away from destroying every existing save on
first load, and the mechanism is proven by the checked-in fixture.

**Fix.** Reject a capacity mismatch as an explicit, non-demoting decode error
before restore is attempted (validate `entities.capacity === DEFAULT_PRISONER_CAPACITY`
in the save schema, or resize in the codec), and add a restore test that walks a
V1 fixture with live entities end to end.

## PER-09 — `saveNow()` bypasses the single-writer guarantee
**Medium · CONFIRMED**

`AutosaveScheduler` promises "at most one in-flight write per prison", but
`SessionController.saveNow` calls `this.repository.save` directly
(`session-controller.ts:287`) and is reached from the Save button *and* from
`LifecycleSaveHandler.attempt` (`lifecycle.ts:109`). A lifecycle save on
`visibilitychange` therefore routinely races an in-flight autosave.

Both callers build with `revision: session.revision + 1`
(`session-controller.ts:254`) and increment only after success
(`:74` and `:290`), so two concurrent saves produce two generations carrying the
**same** `revision` with different payloads. IndexedDB serialises the
transactions, so nothing corrupts — but the pointer ends up on whichever
transaction commits last, which is not necessarily the newer snapshot, and the
cloud's `(revision, checksum)` idempotency key (`create_save_version` RPC) now
has two legitimate claimants for one revision.

**Fix.** Route `saveNow()` through the scheduler's per-prison mutex (or take an
explicit in-flight lock in the controller), and allocate the revision at write
time from the value being written rather than optimistically.

## PER-10 — No `onblocked` / `onversionchange` on the IndexedDB connection
**Medium · CONFIRMED**

`src/persistence/local/indexeddb-store.ts:20-35` handles only `onupgradeneeded`,
`onsuccess` and `onerror`. There is no `request.onblocked`, and the resulting
`IDBDatabase` never gets `db.onversionchange = () => db.close()` — a grep for
`onblocked|versionchange` across `src/` returns nothing.

`DATABASE_VERSION` is `1` today, so this is latent. The first bump makes it
live in two directions: a second open tab holding the v1 connection blocks the
new tab's upgrade, `onblocked` fires with no handler, the promise **never
settles**, and `main.ts:2072`'s `await openLockstateDatabase()` hangs for ever
inside a `try` that can only report a rejection — so the tab silently runs with
no save panel, no autosave and no message (`main.ts:2105-2108` is never reached).

**Fix.** Add `request.onblocked` → reject with a distinguishable error the boot
path can surface ("close other Lockstate tabs"), set
`db.onversionchange = () => db.close()` on every opened connection, and put a
timeout around the open so boot can never hang.

## PER-11 — `loadCurrent` spans three transactions; no cross-tab coordination
**Medium · CONFIRMED**

`repository.ts:203` reads metadata in one `readonly` transaction, `:208` reads
each candidate generation in another, and `recoverToGeneration` (`:279`) writes in
a third. Between them the candidate list is stale. Concretely, with two tabs on
one slot: tab A reads the window, tab B autosaves (new generation, pointer
advanced, oldest pruned), tab A then finds its newest candidate missing
(`raw === undefined` → `continue` at `:210`) and can adopt an older generation
and repoint `currentGenerationId` **backwards** past tab B's newer save. It also
means a slot can report `no-valid-generation` while a valid current generation
exists.

`docs/PERSISTENCE.md:1470-1477` puts cross-tab concurrency explicitly out of
scope, which makes this a known gap rather than an oversight — but nothing warns
the player, no lock or `BroadcastChannel` exists, and the single-transaction fix
for `loadCurrent` is cheap regardless.

**Fix.** Read metadata and candidate generations in one `readonly` transaction
(the store already supports it) and perform recovery in a transaction that
re-reads and re-validates the pointer. Longer term, take a `navigator.locks`
lock per prison id, or detect a second writer via `BroadcastChannel` and refuse
to autosave from the non-owning tab.

## PER-12 — Cloud sync is unwired; `pendingSync` is half-written, never cleared
**Medium · CONFIRMED**

Nothing in `src/` constructs `PrisonSyncEngine` or `SupabaseCloudSaveClient`
(grep: only doc comments reference them). So today no conflict resolution, no
retry, no offline behaviour and no size handling exist at runtime — every cloud
row of the failure matrix is "no code runs".

The one piece of cloud bookkeeping that *is* wired is inconsistent:
`markPendingSync` is called only from `saveNow` (`session-controller.ts:291`),
never from the autosave path (`:71-77`), so a prison whose progress arrived by
autosave is never marked dirty for the cloud; and `clearPendingSync`
(`repository.ts:334`) has no caller in `src/`, so once set, `dirtySinceRevision`
is a permanently stale number.

**Fix.** Either mark pending sync in the shared `onResult`/`save` path so both
save routes behave identically, or drop the field until #20 lands — a
half-maintained sync marker will be read as authoritative by whoever wires the
engine.

## PER-13 — No client-side payload-size check; LS002 collapses to `'error'`
**Medium · CONFIRMED**

The server bound is sound: `enforce_save_version_size`
(`supabase/migrations/20260823100000_bound_free_tier_capacity.sql:205-233`)
measures `octet_length(new.payload::text)`, **overwrites** the client's
`byte_size` claim, and refuses over `max_save_payload_bytes()` (4 MiB) with
`LS002`.

The client does not participate. `supabase-client.ts:153-168` serialises the
whole payload, sends it, and maps any RPC error — LS002 included — to
`{status:'error', message}`, which `sync-engine.ts:35` flattens to
`reason:'error'`. The RPC's own header
(`20260822190300_create_save_version_rpc.sql:46-52`) names the correct follow-up
("adding the status alone would be a silent `undefined`") and it has not been
done. `estimateSaveEnvelopeByteSize` (`size.ts:20`) — the documented "size hook"
— has **no callers**, so nothing warns a player approaching the cap.

**Fix.** Check `estimateSaveEnvelopeByteSize` against a client-side mirror of
the limit before upload and refuse locally with a specific message; add a
`payload-too-large` outcome to `UploadOutcome` and branch on the LS002 SQLSTATE.

## PER-14 — `downloadVersion` fabricates envelope metadata
**Low-Medium · CONFIRMED**

`supabase-client.ts:209-219` rebuilds the envelope with
`createdAt = updatedAt = Date.parse(version.created_at)` and
`gameVersion` read from the **prisons** row, not from the version that was
written. The checksum still verifies (it covers `payload` only), so the loss is
silent: a local→cloud→local round trip changes the session's `createdAt`
(adopted at `session-controller.ts:211`) and can attribute a save to a
`gameVersion` that did not write it — the one field a future migration or
telemetry decision would key off.

**Fix.** Persist `created_at`/`updated_at`/`game_version` per save version and
return them, or state explicitly in `docs/CLOUD_SAVE.md` that envelope metadata
is not round-trip stable and that no consumer may depend on it.

## PER-15 — No `prisonId` agreement check between envelope and slot
**Low-Medium · CONFIRMED**

`repository.ts:158` (`save`) and `:313` (`importSave`) never compare
`envelope.prisonId` with the `prisonId` key the record is filed under.
Importing prison B's exported file into slot A stores a generation whose envelope
claims B; `loadPrison('A')` then adopts B's `revision` and `createdAt`
(`session-controller.ts:211`), and the next export of slot A is offered to the
player as `B.lockstate.json` (`save-panel.ts:655`). Mostly self-healing, but the
adopted revision can put the slot permanently out of step with its cloud
revision sequence.

**Fix.** In `importSave`, rewrite `prisonId` (and reset `revision`) to the
destination slot, or refuse the import with a distinct reason. In `save()`,
assert agreement.

## PER-16 — Quota-exceeded never self-heals
**Low · CONFIRMED**

`repository.ts:167-186` writes the new generation, advances the pointer and
deletes pruned generations in **one** transaction. That is what makes a failed
write safe (the old generation survives — verified by
`tests/browser/local-save-quota.spec.ts:64`), but it also means a
`QuotaExceededError` frees nothing: the retention deletes abort with the write.
An at-quota prison then fails every autosave forever, reporting
`quota-exceeded` each time, with no path back other than the player clearing
site data.

**Fix.** On `quota-exceeded`, retry once with a reduced retention window (prune
first in its own transaction, then write), and tell the player how much space
the prison needs.

## PER-17 — Newer systems' counters are unpersisted while peers' are
**Low · CONFIRMED**

`security.deployment.metrics`, `security.patrol.metrics`,
`incidents.trigger.metrics`, `incidents.response.metrics` and
`contraband.search.metrics` are all in the payload (`save-schema.ts:629-641`,
`:794-817`, `:732-739`). `ClassificationReviewSystem`'s
`reviewsCompleted`/`tierIncreases`/`tierDecreases`/`groupChanges`
(`classification-review-system.ts:147-150`) and `IntakeSystem`'s
`completedCount`/`failedCount`/`accommodationBacklogTicks`
(`intake-system.ts:96-98`) are not, and are not listed under
`docs/PERSISTENCE.md`'s "What is deliberately excluded from the payload".

Small loss (session counters reset to zero on load), but it is exactly the
"undecided subsystem" failure mode `docs/PERSISTENCE.md:626-631` names as the
thing V3 existed to fix.

**Fix.** Either add them as optional fields (no version bump needed — absence
means zero, which is what an older save meant) or record the exclusion and its
reason in the doc's exclusion list.

## PER-18 — The no-undefined-keys invariant is enforced for one section only
**Low · CONFIRMED**

`session-systems.ts:462-487` explains the hazard precisely — an `undefined`-valued
key survives `structuredClone` and the checksum but is dropped by
`JSON.stringify`, so an exported save would no longer match its own checksum —
and `pruneUndefined` is applied at `:493`, to the `simulation` section only.
`kernel`, `world`, `construction`, `entities` and `identity` rely on each
producer remembering to use a conditional spread
(`sparse-world.ts:625-628,640`, `construction/system.ts:691-692`).
Zod 4 preserves an explicitly-present `undefined` for an `.optional()` field
(verified), so a single regression to `field: value ?? undefined` in any of
those producers makes every exported save fail re-import as
`checksum-mismatch`.

Measured today: a fresh session and a rich 800-tick scenario both produce
**zero** undefined-valued keys in the parsed payload, and the JSON round trip
re-decodes cleanly. The invariant currently holds; nothing guards it.

**Fix.** Either apply `pruneUndefined` to the whole payload in
`captureSessionSnapshot`, or add a test that walks a populated payload and
asserts no key holds `undefined` (and that `JSON.parse(JSON.stringify(env))`
re-decodes).

## PER-19 — A non-finite number makes `createSaveEnvelope` throw
**Low · CONFIRMED**

Zod 4's `z.number()` rejects `Infinity`, `-Infinity` and `NaN` (verified), and
the payload has many unconstrained `z.number()` leaves (`severity`, `progress`,
`basePrice`, `confidence`, `reliability`, `capacityOrDemand`, `priority`,
`propertyDamage`, `latestScore`, gang reputation/grudges). So one non-finite
value anywhere makes `savePayloadV5Schema.parse` throw at
`save-schema.ts:1389`. `saveNow` catches it (`session-controller.ts:275-282`);
the **autosave path does not**, and lands squarely in PER-02's permanent wedge.

**Fix.** Fixing PER-02 removes the wedge. Additionally, use `.finite()` on those
leaves so the failure is a validation error at the field that produced it rather
than a thrown parse of the whole payload.

## PER-20 — The in-memory store is less faithful than the real one
**Low · CONFIRMED**

`memory-store.ts:149-152` stores the caller's object **by reference**, where the
real store structured-clones on write — so an aliasing regression that the
IndexedDB path would hide is invisible to the fake, and vice versa.
`memory-store.ts:161-166` publishes by clearing and refilling the whole map,
so a concurrent transaction's writes are clobbered rather than serialised.

Since all repository policy tests run against this fake
(`repository.ts:80-87`), both gaps mean a class of defect cannot be caught
where the tests actually run.

**Fix.** `structuredClone` on `putGeneration`/`putMetadata`, and publish by
applying a recorded write-set rather than replacing the maps.

---

## Failure matrix — what happens today

| Scenario | What the code actually does | Path | Acceptable? |
|---|---|---|---|
| **Corrupt blob** (payload bytes damaged) | `decodeSaveEnvelope` returns `checksum-mismatch` or `invalid-shape`; `loadCurrent` walks the window newest-first, adopts the first valid generation, deletes the confirmed-bad ones and heals the pointer | `save-schema.ts:1329-1338`, `repository.ts:206-225`, `:270-291` | **Yes** — this is the design working |
| **Corrupt blob (a lying `entities.capacity` at V1)** | Multi-GB allocation and up to a 10.7 s freeze, then either `migration-produced-invalid-output` or an **uncaught `RangeError`** that escapes `loadCurrent` and skips the whole recovery walk | PER-04 | **No** |
| **Unknown / future version** | `unsupported-version` with `atVersion`, rendered as its own message; nothing is written or deleted | `migration.ts:113-127`, `save-panel.ts:181` | **Yes** |
| **Downgrade** (a V5 save in a V4 build) | Same `unsupported-version` refusal — forward-only chain, no down-migrations exist | `migration.ts:116` | **Yes**, and correctly so |
| **Truncated blob** (no `saveSchemaVersion`) | `invalid-shape` with no `atVersion`, distinguished in the UI from a versioned shape failure | `save-schema.ts:1310-1315`, `save-panel.ts:149-155` | **Yes** |
| **Version field lies about the shape** | Declared version's own schema runs first and fails as `invalid-shape at N`; a payload that happens to satisfy the wrong version's `.strict()` schema is migrated as that version (accepted risk — nothing in the payload identifies its own version) | `migration.ts:130-140` | **Yes**, with the caveat noted |
| **Migration throws** | `migration.ts:160` does not wrap `step.migrate`, so the throw escapes `decodeSaveEnvelope` and every result-typed caller: no demotion, no recovery, an exception into the click handler (and past `save()`'s `try`) | PER-04 fix (b) | **No** |
| **Quota full** | `QuotaExceededError` → transaction aborts → nothing written, previous generation intact, classified as `quota-exceeded` with a non-empty message and surfaced in the panel. But nothing is freed, so every later autosave fails identically for ever | `indexeddb-store.ts:89-110`, `errors.ts:186-206`, `repository.ts:187-189`; PER-16 | **Mostly** — safe, not recoverable |
| **Two tabs on one slot** | No lock, no `BroadcastChannel`, no `versionchange` handling. Writes serialise (IDB), so no torn record; but `loadCurrent`'s three transactions can adopt a stale generation and repoint `current` backwards past the other tab's newer save | PER-11, PER-10 | **Known gap**, documented out of scope |
| **Crash mid-write** | Single `readwrite` transaction writes the generation, advances the pointer and prunes together, so a crash leaves the previous generation current and intact; verified in a real browser | `repository.ts:167-186`, `tests/browser/local-save-quota.spec.ts:64` | **Yes** — genuinely solid |
| **Crash mid-play, no command issued** | Nothing was ever autosaved, because `markDirty` is wired only to accepted commands | PER-03 | **No** |
| **Cloud newer than local** | **No code runs** — nothing constructs `PrisonSyncEngine`. If wired: `push` returns `conflict` with `cloudCurrent`, and `resolveSyncConflict` requires an explicit user choice (never silent last-write-wins) | `sync-engine.ts:31,68-82`; PER-12 | Design is right; **unbuilt** |
| **Cloud older than local** | **No code runs.** `pull()` never compares revisions — a caller that pulls unconditionally would adopt an older save; the comparison is left entirely to the (nonexistent) caller | `sync-engine.ts:39-48` | **Gap** to close before wiring |
| **No network** | Local-first throughout: nothing in `SessionController`/`PrisonSaveRepository` touches Supabase, so create/save/load/export/import all work offline | `session-controller.ts:44-49` | **Yes** |
| **Restore fails (bug, OOM, duplicate id, capacity mismatch)** | Every retained generation is demoted **and deleted**, one per loop iteration, and the prison is unloadable even after the cause is fixed | PER-01, PER-08 | **No — worst outcome in the system** |
| **Worker times out / never started** | Propagates as an ordinary `Error`, costs no generation (correct) — but wedges autosave for ever and, on the load path, leaves a phantom active session | PER-02, PER-06 | **No** |
| **Corrupt slot metadata** | `CorruptSlotMetadataError`; nothing is deleted, demoted or rewritten. `list()` refuses the whole list (documented availability trade-off) | `slot-metadata-schema.ts:167-181`, `repository.ts:102-109` | **Yes** — conservative and well argued |

---

## What is genuinely solid

- **Write atomicity.** One `readwrite` transaction per save writes the new
  generation, advances the pointer and prunes; a prior good generation cannot be
  destroyed by a failed write. Proven against real Chromium, not just the fake
  (`tests/browser/local-save-quota.spec.ts`, `local-save-errors.spec.ts`).
- **`IndexedDbLocalSaveStore.runTransaction`** attaches `oncomplete`/`onerror`/
  `onabort` synchronously before issuing any request, and explicitly aborts on a
  throw from `work` so staged writes cannot land — a real bug found and fixed
  (`indexeddb-store.ts:54-113`), with the microtask-liveness constraint stated
  in a comment rather than assumed.
- **Checksum verification order.** Verified against `declaredValue` — the input
  as parsed at its own declared version, before any step ran — so a migration
  that recomputes the checksum can never mask corruption in the input
  (`save-schema.ts:1320-1338`). The reasoning for rejecting both alternative
  orderings is written down and correct.
- **Trusted-envelope branding.** A `unique symbol` brand backed by an
  identity-keyed `WeakSet`, so a cast fails at runtime and the failure mode of
  every bypass is "validate anyway" — and identity is destroyed by exactly the
  boundaries that matter (JSON, structured clone, spread)
  (`save-schema.ts:1227-1294`).
- **Migration framework discipline.** One schema and one step per version,
  registration fails loudly on a skipped version or a duplicate, and every
  step's output is re-validated against the destination schema before it is
  trusted (`migration.ts:83-183`). Historical schemas are frozen and shared
  through parameterised factories (`sessionSystemsShapeFor`), so V3/V4/V5 cannot
  drift in anything but the axis they differ on.
- **Refusal to invent data.** V2→V3 and V4→V5 decline to fabricate `simulation`,
  `identity`, `objects` or a room rectangle, and `RestoredScope` tells the player
  which sections a legacy save actually carried — verified end-to-end here on the
  real V1 fixture.
- **The `undefined`-key / checksum hazard is understood and currently closed.**
  `pruneUndefined` plus conditional spreads in every producer; measured zero
  undefined-valued keys and a clean JSON round trip on both a fresh and an
  800-tick populated payload.
- **One run-length codec** with per-plane `maxValue`, so a corrupt run can no
  longer be laundered through `TypedArray.fill` coercion, and length mismatches
  fail loudly (`codec/run-length.ts:100-127`).
- **Slot-metadata validation** is deliberately permissive with three named
  narrowings rejected for stated reasons, validated on the way *in* as well as
  out, and backed by a compile-time schema/interface equivalence proof
  (`slot-metadata-schema.ts:28-110`).
- **The database tier.** Payload size is measured server-side and the client's
  claim overwritten; slot capacity is a trigger, not a blessed door; save-version
  reads are scoped to their prison. This half is in better shape than the client.
- **Bounded, adversarial thinking about untrusted numbers** — `chunkSize`,
  `MAX_PENDING_DELIVERIES`, `MAX_ZONE_DIMENSION_TILES`, `.safe()` on money — is
  the right instinct; PER-04 is the one place it was not applied consistently.

## Prioritized top 5

1. **PER-01** — stop any restore-time throw from deleting save generations.
   Narrow `snapshot-incompatible` to genuinely-unrestorable payloads and make
   demotion quarantine rather than delete. This is the only finding that
   destroys data irrecoverably, and one restore bug in one release triggers it
   for every affected player.
2. **PER-02** — `try/catch/finally` in `AutosaveScheduler.performSave`, always
   `settle()`, always report through `onResult`. One transient worker hiccup
   currently disables autosave for the rest of the session, silently.
3. **PER-03** — mark dirty on simulated progress, not only on accepted commands,
   so idle-but-running play is durable at all.
4. **PER-04** — bound V1's `entities.capacity` (and add V2's cross-field
   refinement), wrap `step.migrate` and `repository.save`'s decode so no decode
   path can throw at a caller expecting a result.
5. **PER-05 / PER-06** — flush the outgoing prison's pending save before
   `adoptSession`, and close the session when a load fails, so switching prisons
   neither loses 30 s of play nor leaves a phantom active session.
