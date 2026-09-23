# Save schema and migration contract

This document covers `src/persistence/`: the canonical save envelope, its
runtime validation, checksum and forward-migration framework, and (in
"Local persistence" below) the IndexedDB-backed repository that consumes it.
Supabase sync (#20) is a separate issue with its own document: its schema, RPC
and client-side sync/conflict policy (`src/persistence/cloud/`) are covered in
[CLOUD_SAVE.md](./CLOUD_SAVE.md), not here.

## Envelope shape (`SaveEnvelope`, currently V5)

```
{
  saveSchemaVersion: 5,
  gameVersion: string,     // build/version identifier, e.g. "lockstate-0.0.0"
  prisonId: string,
  revision: number,        // allocated by the local store at write time, inside the
                            // transaction that compares it (ADR 0109); see below
  createdAt: number,       // unix ms
  updatedAt: number,       // unix ms, must not precede createdAt
  checksum: string,        // 16 hex chars, see "Checksum" below
  payload: {
    masterSeed?: number,                                      // u32, #412; absent means 0
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
      economy?:   { treasury, procurement },                  // #96 / #249
      objects?:   { placedObjects },                          // V5, ADR 0028
      inFlight?:  { navigation, prisoners, guards, search },   // V6, #1373
    },
    identity?: {                                              // V3, issue #75 / ADR 0015
      version: 1, poolId,
      entries: [{ kind, entityId, givenName, familyName }],
    },
  },
}
```

**The `revision` comment above used to say something else, and ADR 0109 made
it false.** It read:

> `revision: number,  // caller-managed monotonic counter; optimistic-concurrency
> enforcement belongs to the storage backend (#20), not this schema`

Both halves are now wrong, and the second is the one worth naming: it deferred
enforcement to "the storage backend (#20)", i.e. to Supabase, which left the
**local** store — the one every offline player actually writes to — with no
enforcement at all, and `docs/CLOUD_SAVE.md` holding the only copy of a rule
this document said belonged elsewhere. `PrisonSaveRepository` now enforces it
too, so both sides of the boundary hold one position rather than two. The old
comment is kept here rather than deleted because ADR 0105 quotes this
document's exclusion as evidence that the asymmetry was deliberate.

**`revision` is still outside the checksum**, which is what makes write-time
allocation cost nothing: `createSaveEnvelope` hashes the payload only
(`checksum: computeSaveChecksum(payload as JsonValue)`), so re-stamping the
number invalidates no checksum and moves no schema version. See "What is out of
scope here" below for the mechanism and its one fail-open case.

`payload` is exactly the union of the existing per-subsystem snapshot
contracts (Issues #5, #12, #16/#17 and, since V3, #24–#28), re-validated at
the save boundary with Zod (`src/persistence/save-schema.ts`), not a new shape
invented for this issue. The simulation-side declaration of the same thing is
`EncodedSessionSystems` (`src/simulation/runtime/session-systems.ts`); the two
are deliberately separate, because the simulation may not import
`src/persistence` and a historical schema here is frozen while the simulation
keeps evolving.

`SaveEnvelope`/`SavePayload`/`TrustedSaveEnvelope` are the names call sites
use for "the current version"; `SaveEnvelopeV1`…`V4` name specific historical
shapes and should appear only in `save-schema.ts` and `save-migrations.ts`.
V2 exists because #50 changed the entity section; V3 because #70 added
`simulation`; V4 because #259 changed the *units* of the need levels inside
it — see the three version sections below.

### Adding an optional field without a version bump

Nine payload fields have been added since their section was first written --
`construction.orders[].edge` (#74), `construction.currentTransaction` /
`currentTransactionId` (#108), `masterSeed` (#412),
`simulation.contraband.intelligenceSequence` and `simulation.economy.payroll`
(ADR 0042 step 3), `construction.orders[].placementSequence`
([ADR 0082](./adr/0082-what-order-build-orders-are-carried-out-in.md), #722)
`simulation.alerts`
([ADR 0084](./adr/0084-what-the-alerts-channel-owes-a-player.md), the owner's
decision of 2026-09-01), `simulation.prisoners.components.injured` (issue
#589, the owner's ruling of 2026-09-17) and `simulation.inFlight` (issue
#1373, the owner's ruling of 2026-09-23 on ADR 0059 open question 3)
-- and none of them bumped the schema version. **This sentence read "Six" until
2026-08-31, "Seven" until 2026-09-01, "Eight" until 2026-09-17 and "Nine"
until 2026-09-23, and the count is the part of it that rots**; the list is what
to read.

**`simulation.inFlight` is the tenth, and the first that is V6-only.** It is
declared on `sessionSystemsV6Schema` rather than in the shared
`sessionSystemsShapeFor`, because no V3-V5 build could write it and those
shapes are frozen. The three conditions below hold: the section is optional;
absent means exactly what every earlier build did on load -- walks cleared,
`'travelling'` prisoners dropped to `idle`, `'travelling'` guards settled,
search jobs restarting their leg, the navigation queue empty -- and that reset
is kept verbatim as the restore path for such a save; and no existing field
changes shape or meaning. Absence is unambiguous as a fact about the corpus, on
`masterSeed`'s terms: a live capture writes the section unconditionally, empty
lists and all. ADR 0038 §4's cost applies unchanged: an older V6 build refuses
a save carrying it as `invalid-shape`. `tests/determinism/restore-mid-walk-exactness.test.ts`
proves the new path through the real envelope; the tests that pinned the old
reset (`job-performing-restart-bound`, `snapshot-restore-fidelity`,
`carry-restore-resumes-the-errand`, `security-returning-after-restore`) now run
their original assertions against a bundle with the section removed, which is
the older-save proof.

**The ninth is the one whose bump was authorised and not spent, which is the
case this section had not yet had.** The owner's #589 ruling said
`SAVE_SCHEMA_VERSION` would move by one field. It does not, because the three
conditions below hold and because [ADR 0038](./adr/0038-what-makes-a-save-compatible.md)
rejected a V6 bump for `masterSeed` on the ground that the migration step's only
content would be fabricating a value the save does not record -- which is
exactly what a `false`-per-slot step would be here. Doing less than was
authorised, in the form this document prescribes, is the narrower change and
the reversible one. The conditions that make that correct, rather than merely
convenient, are:

- **The field is optional, and absent means what the older build already
  did.** An order with no `edge` resolves to `DEFAULT_BUILD_EDGE`; a
  construction snapshot with no `currentTransaction` means "no build gesture
  is open", which is exactly what every restore assumed before the field
  existed; an order with no `placementSequence` sorts ahead of every stamped
  one and tie-breaks by id, so a save in which no order carries the key walks
  in the ascending id that *was* the whole rule before ADR 0082
  (`compareBuildOrderExecution` in
  `src/simulation/construction/build-order.ts`). So an older save needs no migration step and none is added -- the
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

`masterSeed` (#412) is the fourth, and the one whose absence is unambiguous as
a matter of *fact about the corpus* rather than of convention: production went
without supplying another value for long enough that every save written before
the field existed was written by a session seeded at 0. The cost of not
bumping is worth recording, because "no bump is needed" is true and "no bump
costs nothing" is not: `.strict()` means an *older* build reading a save that
carries the key refuses it as `invalid-shape`, where a V6 bump would have
given the same refusal the label `unsupported-version`. Both builds refuse it;
only the diagnosis differs. See [ADR 0038](./adr/0038-what-makes-a-save-compatible.md) §4.

**Until #479, "production never supplied another value" held for every save,
not only the ones written before this field existed** — `src/main.ts`
constructed `SessionController` with no `masterSeed` at all, and the
controller took `?? 0`, so a new prison was always seeded at 0 regardless of
when it was created. #479 fixed that at the source rather than in this schema:
`src/main.ts` now passes a `generateMasterSeed` drawn from
`crypto.getRandomValues`, and `SessionController.createPrison` draws a fresh
seed from it per call. Nothing above changed by that fix — absence still means
0, `SAVE_SCHEMA_VERSION` is still 5 — only the value a *new* save's `masterSeed`
actually holds did.

`simulation.contraband.intelligenceSequence` is the fifth, and its absence is
unambiguous for the plainest reason of the six: it is what the reader already
did. `IntelligenceLedger.loadSnapshot` derived the counter from the maximum
surviving `intel.<n>` suffix unconditionally, so a save without the key gets
exactly that, and the key exists because the derivation is *wrong* — `decayAll`
deletes expired records, so the surviving maximum is a lower bound on what has
been minted and a restored session re-minted an id the writing session had
already used. `contrabandSectionSchema` is shared by the V3, V4 and V5
session-systems shapes, so the key is equally valid in all three and no
migration step has to add it. ADR 0012 category 1 is what requires the counter
to be in the snapshot at all; `docs/DETERMINISM.md` records the divergence that
remains for a save written before it was.

`simulation.economy.payroll` is the sixth
([ADR 0049](./adr/0049-what-a-prison-that-cannot-make-payroll-owes.md),
[ADR 0042](./adr/0042-attaching-consequences-to-the-simulation-loop.md) step 3),
and its absence is unambiguous for the same *fact about the corpus* reason
`masterSeed`'s is. It carries the wages a prison has been billed and could not
pay, and no build that could write a V5 save had a recurring charge at all --
`Treasury.spend` was called only by `ProcurementSystem.purchase` and
`StaffHiringService.hire`, both of which refuse rather than owe. So no save
written before this key existed can be hiding a real debt behind a missing one,
and absent means zero rather than unknown. `economySectionSchema` is shared by
the V3, V4 and V5 session-systems shapes, exactly as `contrabandSectionSchema`
is, so no migration step has to add it there either.

**Not every ADR 0038 §1 change is a new key.** ADR 0061 widened
`simulation.contraband.items[].state` from `'concealed' | 'confiscated'` to
include `'departed'` -- a prisoner who leaves takes what they were concealing --
and `SAVE_SCHEMA_VERSION` stayed 5. The three conditions hold for a *widened
enum* the same way they hold for an added key, and each was checked rather than
assumed: every older save still validates, because no payload written before the
change can carry a value the enum did not have; the value's absence has exactly
one meaning, that no holder of that item has ever left; and no existing member
changed meaning. It carries §4's cost identically -- the section is `.strict()`
and the enum is closed, so an *older* build reading a save that has recorded a
departure refuses it as `invalid-shape`. **A narrowing would be a different
question entirely** and is not what this precedent covers: removing a member
makes every save that recorded one unreadable, which is a migration.

**Proven rather than argued.** `tests/integration/economy-payroll-save.test.ts`
decodes a real V5 save with the key removed and a real V4 save that predates the
field, and restores both to zero arrears -- and refuses a hand-edited save that
carries a negative one, with a valid checksum, so the refusal is the shape's and
not the integrity check's. ADR 0042's own *Persistence* paragraph says step 3
*"must carry a version and a migration before release (`AGENTS.md` boundary
7)"*; boundary 7 asks for *"a version and a migration strategy"*, and this
section is the strategy that already covers this shape. The sentence in ADR 0042
was written before the field's shape was chosen and reads that requirement as
demanding a new version; it is left standing there and corrected here, because
the reason it was written -- a signed balance *would* have needed a migration --
is the durable half.

### What makes a save compatible, and where a named RNG stream fits

[ADR 0038](./adr/0038-what-makes-a-save-compatible.md) states the rule the
section above is one instance of:

> A save is compatible with a build when the build can interpret every section
> the save carries, and every section the build needs and the save omits has
> exactly one meaning. Absence is a fact about the save's age and is honoured
> with the value the writing build would have held; a *value* the build cannot
> interpret is a fact about the blob and is refused.

`kernel.rngStates` is the place that rule had to be extended to, because a
section can be **short** as well as absent (#415). A save that omits a named
stream this build registers used to restore silently and then throw
`RangeError: Unknown RNG stream` out of `Kernel.step()` at the first draw --
between 5 and 600 ticks later depending on what the player did, and never at
the load that caused it. `Kernel.restoreState` now **merges** the snapshot's
streams over the ones the freshly built runtime already holds instead of
replacing the instance:

- a stream the bundle carries wins, so a restore is still exact;
- a stream this build registers and the bundle omits keeps the state
  `deriveXoshiroState(masterSeed, name)` gave it -- which is why `masterSeed`
  stopped being inert, and why the two issues were answered together;
- a stream the bundle carries and this build does not register is **kept**, so
  loading a save never loses a stream. The repository's own
  `save-v1-in-progress.json` carries `world.terrain`, which nothing registers.

The expected set is not declared anywhere and deliberately so: the kernel
being restored onto already holds exactly the streams this build registers,
correctly derived, because `restoreSimulationRuntime` builds the runtime
first. There is no registry of stream names and no second list to keep in step
with `new-session.ts`.

Two consequences for this document's own rules. Adding a named RNG stream is
no longer a save-format change, which is what makes named streams usable as
`docs/DETERMINISM.md` intends. And a save that is corrupted by *losing* a
stream it genuinely had is now silently repaired rather than reported -- an
accepted loss of signal, because the checksum is what detects a corrupted
payload and a payload that passes it did not lose a stream in transit.

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
`worldSnapshotSchema` is shared by every payload schema, V1 through V4, so a
save declaring `chunkSize: 65` or more is now rejected as `invalid-shape`
wherever it appears, and `SparseWorld.fromSnapshot` rejects the same value as
a `WorldSnapshotError`. Under `AGENTS.md` boundary 7 that is a format
decision, so it is recorded here rather than left in a schema line:

- **No migration step was added and `SAVE_SCHEMA_VERSION` was not bumped for
  it** (it stood at 3 when #102 landed), because there is no save in the field
  to migrate. `chunkSize` is always written from
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

### Entity capacity is bounded at every version, for the same reason

`chunkSize` was the first field found to size an allocation before anything
checked it. It was not the only one.

`payload.entities.capacity` sizes three typed arrays inside
`upgradeEntityLiveness` (`src/persistence/save-migrations.ts`) — a
`Uint16Array`, a `Uint8Array` and a `Uint32Array`, **7 bytes per slot** — and
V1's schema never required the three JSON arrays to be `capacity` long, so an
*empty* array set reaches that allocation. `decodeSaveEnvelope` runs the whole
migration chain **before** verifying the checksum, so the checksum is no
obstacle here either. Measured on the shipped
`tests/fixtures/persistence/save-v1-in-progress.json` with only that field
changed:

```
capacity 10000000   -> +70.0 MB of ArrayBuffer from a 1,566-byte envelope,
                       then refused as migration-produced-invalid-output
capacity 4294967295 -> RangeError: Array buffer allocation failed
```

The second line is the one that mattered. The `RangeError` escaped
`decodeSaveEnvelope`, and `PrisonSaveRepository.loadCurrent` calls that
unguarded once per generation — so a corrupt newest generation did not fail and
let the walk continue, it **aborted the walk**, and the older good generation
was never reached. `importSave` threw at the player for the same reason.

V2's `entityStoreSnapshotV2Schema` has always bounded `capacity` at `0xf_ffff`;
V1's did not. The fix mirrors V2's bound onto V1, and it narrows nothing that
was loadable: above `0xf_ffff` a refusal was already certain, one step later,
as `migration-produced-invalid-output`. All that moves is *when* the refusal
happens — before the allocation instead of after it — and its label.

- **`0xf_ffff` is not a number invented for a schema.** It is `INDEX_MASK`
  (`src/simulation/entity/entity-store.ts`), the entity-id index ceiling
  `EntityStore`'s own constructor enforces, so a store larger than this could
  not address its own slots.
- **No migration step and no version bump**, on #102's precedent and ADR 0038
  §1: a *value* the build cannot interpret is a fact about the blob and is
  refused, where an *absent section* is a fact about the save's age and is
  honoured. The widest capacity any writer in this repository produces is
  `DEFAULT_PRISONER_CAPACITY`, 5,000; a sweep of every `capacity` assignment in
  `src/` and `tests/` finds nothing above it, and both checked-in V1 fixtures
  carry 8. The narrowing removes only values no writer produced.
- **How reachable this was is genuinely open.** There is no evidence a V1 save
  exists in any player's IndexedDB, and if none ever shipped this has the
  standing #102 has: a hand-edited, corrupted or synthesised file — which is
  still a real route, through the save panel's Import control.

### A save's entity capacity is the writer's allocation, not a restore precondition

The section above bounds `capacity` because it *sizes an allocation* during
migration. This one is about what it does **not** decide, which is whether the
save can be restored at all (#433).

`payload.entities.capacity` is how many prisoner slots the writing build had
allocated. `EntityStore.loadSnapshot` used to compare it against the receiving
store's `capacity` and throw `Cannot load snapshot with different capacity` on
any difference — so a ledger carrying two live prisoners was refused because
the array they were written into was eight long and this build allocates
`DEFAULT_PRISONER_CAPACITY` (5,000). `tests/fixtures/persistence/save-v1-in-progress.json`
is exactly that save: it migrates V1 → V5, its checksum verifies, `importSave`
accepts it, `loadCurrent` returns it, and every gate before the restore passed,
so nothing warned the player.

**What must fit is the written prefix** — `max(maxActiveIndex + 1,
nextAvailableIndex, freeCount)`, the slots the writing build actually used.
A ledger whose prefix exceeds the receiving store's capacity is still refused,
and that refusal is real rather than conservative: this build could not
address those indices, and `packEntityId` could not name them. The message
says which two numbers disagreed.

This is [ADR 0038](adr/0038-what-makes-a-save-compatible.md) §1 applied
unchanged — *"a **value** the build cannot interpret is a fact about the blob
and is refused"* — and the capacity comparison was the same rule misapplied to
a value the build can interpret perfectly well. It is not a schema change and
not a version bump: the bytes already carry everything needed, which is the
condition that ADR made the test.

Two consequences worth stating, because both were checked rather than assumed:

- **No entity id moves.** The prefix is copied at the offsets it was written
  at and `generations` crosses untouched, so `packEntityId(index, generation)`
  reproduces every id the writing build issued. ADR 0005 and ADR 0026 both
  depend on a slot index not being re-homed, and nothing here renumbers
  anything.
- **The prisoner *components* are sized to the receiving store, not to the
  save.** `restoreSessionSystems` decoded them at the save's capacity and then
  copied them into this runtime's arrays, which worked only while the two
  builds agreed — a save from a *wider* build threw a bare `RangeError` out of
  `TypedArray.set` with nothing said about capacity at all. The payload is an
  allocated *prefix* (see "Prisoner components: allocated prefix, not
  capacity, and not RLE"), so decoding it at this runtime's capacity is
  well-defined in both directions.

`tests/unit/entity-snapshot.test.ts` covers the store in isolation (both
directions, the refusal, and the tail a shorter ledger leaves behind),
`tests/integration/session-save-round-trip.test.ts` covers a populated save
written at a wider capacity, and
`tests/integration/session-restore-failure.test.ts` covers the V1 fixture
restoring with both its entities' own ids.

### A migration step that throws is a verdict, not an exception

The class behind that instance, and the more valuable half.
`MigrationChain.migrate` called `step.migrate(currentValue)` unwrapped, so a
step that threw for *any* reason broke three stated contracts at once:
`decodeSaveEnvelope`'s "unknown or future versions, structural corruption and
checksum mismatches each fail with a distinct, actionable error code",
`loadCurrent`'s promise to "walk the remaining generations newest-first and
adopt the first one that validates", and the taxonomy table below.

Steps are contracted to be pure total functions, so reaching that catch means
one is defective — but a defective step must still produce a *refusal the
recovery walk can act on*, because the alternative is that one bad generation
costs the player every older good one. `migrate` now returns
`migration-step-threw` at the version the step started from, with the thrown
value's own words in the message.

`migration-step-threw` is its own code rather than a reuse of
`migration-produced-invalid-output`, whose meaning is precisely "the step *ran*
and its output failed the destination schema" — a step that threw produced no
output for a schema to reject. Adding it is additive: every consumer of the
union is non-exhaustive (`describeImportResult` ends in a `default:` arm,
`loadCurrent` treats any `ok !== true` alike), and the player-facing sentence
is unchanged.

This is ADR 0038 §5 applied one boundary earlier: *"whatever is refused is
refused at restore, and is never an `internal-error`"* — a save-compatibility
condition is a declared verdict. §5 says it for the restore boundary; the
decode boundary owes its caller the same thing.

### What is deliberately excluded from the payload

**#1373 amendment (2026-09-25).** The pending route queue and resolved results
described below are now included in new saves, together with prisoner and guard
locomotion, held request ids and request sequences. Enqueue ticks survive so
priority aging continues from the same tick. Search travel state also resumes.
Older saves, which lack these optional fields, still use the reset behavior
documented below. Navigation route and flow caches remain derived and are not
saved; diagnostic counters may therefore differ after a restore without
changing simulation decisions. Incident response requests are excluded from
the saved queue because that system deliberately reconstructs its response.
No save schema version bump is needed under ADR 0038's additive-field rule.

Every entry here is an exclusion with a stated reason, not a gap. The rule
V3 applies is: **authoritative state is persisted; derived state and in-flight
work are not.**

- **Topology geometry** (`TopologyManager`). A pure cache recomputed from
  `SparseWorld` geometry by `TopologyManager.update`, so there is no
  independent state to persist. Restoring the world restores it. (Placed
  *room instances* — `RoomInstanceRegistry` — are a different thing and
  **are** persisted; see V3 below.)
- **Navigation caches and the pending path-request queue** (`RouteCache`,
  flow fields, `PathRequestQueue`). ADR 0007 defines these as a budgeted
  caching layer over the world and the door registry, both of which are
  persisted; a restored session rebuilds them from the same inputs. The
  pending queue is not a cache but it is not *state* either — it is work in
  flight, owned by a `NavigationSystem` instance that no longer exists after a
  restore. Four of the five subsystems that hold a request id
  (`PrisonerOperationsRuntime`, `GuardRoster`, `JobBoard`, `SearchSystem`) drop
  it on restore and re-request on their next scheduled tick, and each of those
  resets is proven idempotent in `tests/determinism/snapshot-restore-fidelity.test.ts`.
  For those four the visible cost is a bounded delay, not lost progress; the
  alternative — persisting request ids into a queue that never received them —
  leaves actors stuck forever.

  **CORRECTED 2026-09-23, AND THE PENDING QUEUE IS NO LONGER EXCLUDED (issue
  #1373).** The paragraph above is kept as written because it is still the
  exact description of how a save written *before* that date is restored.
  Two of its claims were wrong, and each wrong part is named:

  - **"A bounded delay, not lost progress" was true of one journey and false
    of the prison.** Measured on `main` at `ceb6865e` on #1373's fixture:
    **41 of the 41 saves taken while somebody was walking** restored to a
    prison that had not reconverged by day 6, and 0 of the 24 taken with
    nobody walking diverged. The first difference was on the restore tick
    itself. The delay was bounded; the divergence it started was not, because
    timing and shared-object use drifted apart and compounded.
  - **The alternative was not "a queue that never received them".** Persisting
    the queue *with* the ids is what the owner ruled for (ADR 0059 open
    question 3, option 5, *"Zapisuj marsz (zalecane)"*, an option label and so
    the weaker provenance). A save now carries it in `simulation.inFlight`,
    next to the walks and ids that name it. See ADR 0059's amendment under
    "Determinism" for why the queue is persisted rather than re-queued by its
    owners.

  **What is still excluded:** the caches (`RouteCache`, flow fields, the region
  graph), unchanged. Also a carried result's `expansions`, `usedFlowField` and
  `waitedTicks`: they are functions of cache warmth, nothing reads them, and
  carrying them measurably put cache state into the save.

  **Per subsystem:**

  - `JobBoard`: its reset is a legacy-save path only, since no build after ADR
    0093 writes a `'travelling'` job.
  - `IncidentResponseSystem`: it still carries no records (ADR 0033). The
    requests it had in flight come back with the queue, and its owed
    first-update reconciliation gives them back before re-dispatching
    (`abandonOrphanedRequests`).

  **The remaining inexactness, stated rather than discovered:** a restored
  route cache is cold. A restored session's searches therefore spend more of
  `workBudgetPerTick` than the continuous one's cache hits did. When the budget
  binds, that can move a request's service by a tick. It did not bind on any
  save the exactness test takes.

  **CORRECTED 2026-09-23, the same day: that inexactness was real, and it is
  closed.** At 24 and 36 prisoners the budget binds at block changes, and a
  save taken before one served a different set of requests. The cause was
  removed rather than carried: the budget is now charged what a request costs
  cold, whatever the caches hold. The caches stay out of the save. See ADR
  0007's amendment of that date and the two pinned budget cases in
  `tests/determinism/restore-mid-walk-exactness.test.ts`.

  **`IncidentResponseSystem` was listed here as a fifth and does not belong,
  which was measured rather than reasoned (#352).** It cannot re-request: the
  incident lifecycle is forward-only, so `advanceResponse`'s no-record path can
  never return to `tryDispatch`, and the incident lapses instead. That much its
  own docstring states and intends. What the reset also discards is the record
  `releaseResponse` reads to *return* what the response claimed — and both of
  those things are persisted, so the loss is permanent rather than delayed. A
  save taken one tick after a severity-8 dispatch comes back with its four
  responders still `'on-search'` and its sector still `'lockdown'` (doors still
  `'locked'`), unchanged 52,000 ticks later, while the continuous run resolves
  the incident, lifts the lockdown and returns all six guards. `GuardRoster`'s
  own `unassign` has no reachable caller for an `'on-search'` guard, and there
  is no dismiss command, so the guards were unrecoverable. `SearchSystem` sets
  the same phase and does *not* leak, because its active jobs are in the
  payload and a restored job releases its guards — the difference is only
  whether the record that owns the release survives the save.

  **The restore-semantics half of #352's choice is now taken (ADR 0033), and
  this entry stays corrected rather than reverted.** A restored session releases
  the claim instead of inheriting it: `IncidentResponseSystem.loadSnapshot`
  marks a reconciliation as owed, and the system's first scheduled `update`
  after the load hands back every `'on-search'` guard that no active search job
  names and no live response record claims, and returns to `'normal'` every
  `'lockdown'` sector no open incident justifies. Nothing is written to the save
  and no version is bumped — the repair is recomputed from the payload on every
  load, so a player who dislikes the outcome still has the file they had.

  **And the outcome is recovered too, which is ADR 0033's amendment (its open
  question 1, built).** On the same update, immediately after the release, the
  system mounts a **fresh** response to every still-open incident that no record
  claims. Nothing is resumed and nothing is guessed: no responder is attributed
  to the incident it used to serve, and no containment progress is inherited.
  What that buys is exact agreement with a continuous run on the incident's own
  outcome as well as on every resource the response claimed — measured on #352's
  reproduction, the restored run now *resolves* the riot with
  `injuredEntityIds: []` and `propertyDamage: 4`, where before the amendment it
  lapsed with `[1,2,3]` and `8`.

  So `IncidentResponseSystem` still does **not** belong in the group above, and
  the reason is worth stating precisely rather than filed as fixed. The other
  four pay *"a bounded delay, not lost progress"*. This one loses progress on
  purpose — the interrupted response really is abandoned, not resumed — and then
  redoes it, so what a player pays is **time, not the outcome**:

  - **The fresh response's clocks start at the re-dispatch tick.** For a save
    taken while the incident is `'notified'` the travel is redone; for a save
    taken while it is `'responding'` the containment timer restarts. So the
    incident closes later by *the progress the save discarded*, rounded up to
    this system's cadence and capped at `containmentTicks` (**60 ticks**,
    because there was never more than sixty of it to discard). Measured:
    a save at tick 1, 10 or 11 closes on 81 against the continuous run's 71; a
    save at 69 closes on 131.
  - **The responders come back when the new response closes**, not one interval
    after the load. That is the one promise the amendment weakens, and it is
    still bounded where #352's was permanent.
  - **`respondersDispatched` counts the second dispatch**, because a second
    dispatch is what happened. A restored session's counter is twice a
    continuous one's for the same incident.
  - **Re-dispatch is refused rather than guessed at** when the pool cannot offer
    an incident already `'responding'` a set of responders who are *already at
    its post tile* — which is reachable with two incidents open, because the
    incident whose id sorts first takes the lowest guard ids. Such an incident
    falls back to the paragraph above exactly: abandoned, resources returned,
    lapsed at its deadline. It is ADR 0033 open question 2's un-recoverable fact
    ("which incident each responder served") re-appearing as a bound on what a
    re-dispatch can recover.

  `tests/integration/incident-response-restore.test.ts` measures all of it, and
  compares the restored outcome against a **continuous run executed on the same
  seed** rather than against a copied literal. Carrying the record in the payload
  instead would recover the containment *progress* as well, and is a save-schema
  version and a migration over stored saves — the trade ADR 0033 records and PR
  #361 takes the other side of.
- **Per-system `requestSequence` counters** (`SearchSystem`,
  `DeploymentSystem`, `PatrolSystem`, `ActionSystem`). These only mint names
  for path requests against the queue above. Since no restored state can
  reference an old name, a restored counter and a reset one are
  indistinguishable. `IncidentTriggerSystem.sequence` is the exception and
  *is* persisted, because it names incident records that outlive the tick.

  **No longer excluded since issue #1373, for the four systems named.** The
  premise ("no restored state can reference an old name") stopped holding when
  the queue and the ids were carried, and a reset counter would mint names the
  saved session never minted, so the next capture would disagree with it. The
  four counters travel in `simulation.inFlight`, and `DeploymentSystem`'s is
  one of them. `IncidentResponseSystem.requestSequence` is the one that stays
  excluded, on the old reasoning, because its records are not carried either.
- **`JobSystem.performingSince` — GONE, and this entry is kept because the
  measurement it carried is the reason it could go.**
  [ADR 0093](./adr/0093-a-carry-is-an-action.md) decision 5 retired both the
  field and the class: a carry is an `ActionDefinition` now, so the dwell timer
  is `CurrentActionComponent.phaseStartedAtTick`, **which this payload already
  carries**. There is no exclusion left to list.

  **What is measured now, and it is not the same shape.**
  `tests/determinism/job-performing-restart-bound.test.ts` was rewritten with
  the decision and measures the new profile on a prison built through commands:

  - **A save taken mid-dwell costs nothing at all.** `phaseStartedAtTick` comes
    back with the prisoner, so `continuePerforming`'s
    `elapsed >= action.minDurationTicks` test resumes where it was.
  - **A save taken mid-walk costs at most two `ActionSystem` reconsideration
    cycles — 40 ticks.** *(True since #1373 of a save written before the walk
    was saved and of no other: a current save costs nothing mid-walk, measured
    at every walking tick of that test's scenario.)* `PrisonerOperationsRuntime.loadSnapshot` drops every
    traveller to `idle`, so up to 20 ticks pass before the carrier re-selects,
    and re-selecting re-does the request-then-collect handshake for up to
    another 20. **ADR 0093 decision 5 predicted one cycle; the measurement is
    two**, and the prediction is corrected rather than the code, because this is
    the exclusion *every* action already has under ADR 0059 open question 3 and
    not a property of the carry.

  **The old reading is kept below rather than deleted**, because "the cost was
  five ticks and is now zero" is a claim a reader can only check if the five is
  written down. It read:

  > A restored `'performing'` carry job restarts its pickup/drop-off timer.
  > This is the same "restart rather than assume arrival" convention as travel,
  > and is a real loss rather than a derivation — it is listed here rather than
  > fixed because the field is private to `JobSystem` and exposing it is a
  > job-system change, not a persistence one.
  >
  > - **One `JobSystem` interval — 5 ticks — on the leg that was in flight**,
  >   and that is the whole cost of the field. It does not depend on where
  >   inside the 5-tick window the save was taken.
  > - **The same 5 ticks, once, on every job queued behind the delayed one.**
  >   It does not compound and it does not reorder.
  > - **One full `ConstructionSystem` interval — 10 ticks — on a build order
  >   waiting for the delivery**, because the deposit slips across a boundary
  >   of a system with a 10-tick cadence of its own.
  > - **Nothing else.** Every state surface a save carries is identical again
  >   from the delayed build completion onwards.
  >
  > The reason this stays an exclusion rather than becoming a V6 field is also
  > measured. Saving five ticks *earlier*, while the same job is
  > `'travelling'` rather than `'performing'`, produces the identical profile
  > ... Carrying `performingSince` would narrow the window in which a save
  > costs anything; it would not remove the cost, because the window either
  > side of it already does. A schema version is the wrong instrument for
  > that, and the test is the right one.

  **That last paragraph was right and is the reason nothing here needed a
  schema version.** The field was not carried; the *class* was removed, and the
  dwell landed on a field the payload already held. `SAVE_SCHEMA_VERSION` is
  still 5.
- **`operations.jobWorkers`, which is in the payload and is written empty.**
  ADR 0093 decision 4 retired `JobWorkerPool` — eligibility is the regime's
  and busyness is the board's — so there is nothing to put in it. The key
  stays because **removing it would be the save bump the decision refuses to
  spend**: an older build refuses a save on a missing required key, and
  `save-schema.ts` validates this one as required. Two empty arrays against a
  `SAVE_SCHEMA_VERSION` move is the same trade
  [ADR 0038](./adr/0038-what-makes-a-save-compatible.md) decision 4 makes for
  keeping `masterSeed` optional.

  An older save with a non-empty pool loads cleanly and is *ignored*: a listed
  worker who holds an assigned job is resumed from the board — their own active
  job makes `action.carry` providable again — and one who does not was merely
  *eligible*, which is now a question the regime answers every cycle rather
  than a stored fact.
- **The prisoner → job link.** Derived from each job's own `assignedWorkerId`,
  which the payload carries, and rebuilt into `JobBoard`'s worker index by
  `loadSnapshot`. The same standing a use claim has under ADR 0029 decision 6,
  for the same reason: storing it would put a value in the payload that can
  disagree with the state that produced it.
- **The bay-to-container and storeroom-to-container bindings.** Functions of
  the room registry, which the payload carries (ADR 0093 decision 2). What
  *is* stored is the bay container's **stock**, which appears in the existing
  `containers` array the moment the container is registered — so a delivery
  waiting in a bay survives a save without one new key.
- **`SafetyCoverageSystem`'s census** (`Covered N / Understaffed N /
  Unguarded N`, issue #588). A pure function of the sectors, the guards
  assigned to them and where the prisoners are standing, all three of which
  the payload carries, so there is no independent state to persist and the
  system has no snapshot pair.

  **Where this entry is not a repetition of the two above it is *when* the
  derivation happens, and the answer used to be wrong.** The census was
  rebuilt on the system's first scheduled `update`, ten ticks after the load —
  the same bound "Navigation caches" accepts, and the right answer for every
  cache that no one is looking at. This one is looked at immediately: a
  restored session arrives `paused` and
  `SimulationWorkerStateMachine.handleInitialize` publishes one
  `simulation/status-counts` before any tick runs, deliberately, *"so a prison
  that has a population on screen [is not] the same row of zeros this channel
  exists to remove"*. Nothing then steps the kernel until the player presses
  play, so the ten ticks were unbounded in wall time — and what stood there was
  worse than a stale number, because `coverageBadge`
  (`src/ui/hud/projection.ts`) prints the green **Covered** pill whenever no
  rung is short, and an all-zero census is not short. A twelve-prisoner prison
  came back reading `0 COVERAGE` under a green *Covered*
  (§13 of the playtest record *"the alerts log was opened, and every sentence in
  it is cut to thirteen characters"*, 2026-08-31 — on the unmerged branch
  `playtest/play-the-twelve`, so it is cited by title rather than by path;
  reproduced headlessly in `tests/integration/session-save-round-trip.test.ts`).

  So `restoreSimulationRuntime` now calls `SafetyCoverageSystem.takeCensus`
  after every population is in place. **Nothing is written to the save and no
  version is bumped** — this is `IncidentResponseSystem`'s shape above, a
  repair recomputed from the payload on every load — and the census walk is
  run at zero elapsed ticks, so it provisions nobody a tick of `safety` they
  did not live through.

  **The general rule this entry adds to the list, because it is the one the
  list did not have:** "derived state is recomputed rather than persisted"
  needs a second half where the deriving system is scheduled — *and recomputed
  by the restore itself where a paused session would otherwise show the
  underived value*. Every other entry above satisfies that second half by
  accident: a route cache, a bitset and a request-sequence counter have no
  readout, and `IncidentResponseSystem`'s reconciliation is invisible until the
  clock runs. A census on the status strip is the first derived value with a
  chip of its own.
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
- **`RefusalLog`** (`SimulationRuntime.refusals`, #261). What the simulation
  last refused — an out-of-bounds wall, a purchase the treasury cannot cover —
  and how many refusals a session has made, published to the HUD on
  `simulation/status-counts` and rendered as an alert row. It is a notice
  about an action the player took moments ago rather than a condition of the
  prison, so a restored session starting with none is the correct reading of
  it: an alert re-raised on load would be about a wall somebody failed to
  place before the save, with no order left to point at (a failed order *is*
  persisted, in `construction.orders`, but its `failReason` says only that it
  failed and when it is loaded it is already history). Carrying it would be
  cheap — an optional field, no version bump, exactly how `simulation` and
  `identity` arrived — which is why this entry is about what it would *buy*
  rather than what it would cost. Also recorded in
  `docs/HUD_PROJECTIONS.md` gap 33.
- **`SimulationEventLog`** (`SimulationRuntime.events`, #507). **No longer
  excluded since 2026-09-01: the alerts log is in the payload, as an optional
  `simulation.alerts` section**
  ([ADR 0084](./adr/0084-what-the-alerts-channel-owes-a-player.md), the owner's
  decision 3 of that day). The entry below is kept in full rather than deleted,
  because everything it argues is still true of the *events band* and is the
  reason a restored record announces nothing, and because a correction is no
  more durable than the claim it corrected
  (`docs/AGENT_WORKFLOW.md` section 4).

  What changed is the separation of two surfaces this entry treated as one. The
  **band** carries what just happened, and a restored record did not; the
  **log** is what a player scrolls back through, and the owner decided they
  keep it. So the records come back and are republished with `restored: true`,
  which rebuilds the list and is ignored by the band -- the "loaded prison
  announcing last week's discharges" this entry refuses is still refused.

  What the section carries: the retained buffer (at most
  `MAX_BUFFERED_SIMULATION_EVENTS` records), the ordinals of the rows a player
  dismissed, and the log's own sequence counter, which must not rewind or two
  different facts would share a row identity. **No `SAVE_SCHEMA_VERSION`
  bump**, under the "Adding an optional field without a version bump" rule
  above: absence is unambiguous as a fact about the corpus, because no build
  that wrote a save could record a log at all, and every one of those saves
  restored to exactly the empty log an absent section restores to now.

  **The dismissals are in the save for a reason worth stating separately**, and
  it is why the owner's decisions 2 and 3 could not have been built apart: a row
  a player retired that came back on the next load would make the two undo one
  another, and the only place a fact can be put to survive a load is this
  payload.

  **What is bounded rather than complete.** The buffer keeps the newest 64
  records and the alerts list keeps eight rows chosen by *severity*, so a
  `danger` row the live list had kept whose record had already left the buffer
  is gone across a reload. That is a real limit of carrying the log rather than
  the rows: the rows are on the main thread, and the main thread contributes
  nothing to a save.

  **`RefusalLog` above is unchanged and stays out of the payload.** The owner
  ruled on this log and not on that one, and the two stop being siblings in this
  one respect.

  **One clause of the kept entry is false rather than narrowed**, and it is
  named here so a reader does not have to spot it: *"this channel has no
  dismissal either"*. It has one since the same day -- the owner's decision 2 --
  and the dismissals are part of what this section carries. The clause was one
  of the two legs the exclusion stood on, which is why removing it is part of
  what the ruling did rather than a detail.

  **The test the kept entry names still exists and now asserts both halves.**
  `tests/integration/sentence-end-release.test.ts` saved a prison that had just
  released somebody and required the restored one to announce nothing; it now
  requires the restored one to *carry the record* and still announce nothing,
  which is the property that could have been lost by accident and is the reason
  that test was re-pinned rather than replaced.

  The entry as it stood:

  > What the prison
  > just did — a sentence that ended, a payday it could not meet, a prisoner
  > moved into a bed that exists after the player took theirs away
  > ([ADR 0076](./adr/0076-what-happens-to-a-resident-whose-bed-is-taken-away.md)
  > decision A(i)) — published on `simulation/event` and rendered on the events
  > band and in the alerts list.
  > Excluded on `RefusalLog`'s reasoning above and one addition of its own: an
  > event is a statement that something happened *now*, so a loaded prison
  > announcing last week's discharges would be describing a tick the player is
  > not looking at, and this channel has no dismissal either.
  > What makes the exclusion cost nothing is that the *conditions* behind the
  > events are persisted independently. Arrears are carried in
  > `simulation.payroll.unpaidWagesMinorUnits` ([ADR 0049](./adr/0049-what-a-prison-that-cannot-make-payroll-owes.md),
  > "arrears are *history*"), so a restored prison that is still broke says so
  > again at its next payday rather than replaying the one before the save;
  > sentence ticks are carried in the prisoner component arrays, so a sentence
  > that ends after a load is announced when it ends. The log is therefore
  > derivable-forward rather than lost.
  > ADR 0076's relocation notice is the one member where the *outcome* rather
  > than the condition is what persists — the resident's new accommodation is in
  > the save — so a restored prison has nothing to re-announce and nothing to
  > say: the move already happened and the player was told at the time, or the
  > session it happened in has gone.
  > **#703 ruling 13's `contraband.discovered` is a second member on the
  > relocation notice's terms rather than the arrears'**, and it needs no
  > argument of its own: the *outcome* is what the save carries. The item is
  > `'confiscated'` in `simulation.contraband.items`, the evidence is in
  > `simulation.contraband.confiscations`, and the figure the status chip reads is
  > `...search.metrics.itemsDiscovered` — so a restored prison has nothing to
  > re-announce and says nothing, exactly as it says nothing about a relocation
  > that already happened. No field is added anywhere for it and
  > `SAVE_SCHEMA_VERSION` does not move; the event exists only on the wire and in
  > the unsnapshotted log.
  >
  > **The incident events of issue #555 are the one member of the channel this
  > argument holds less neatly for, and it is worth stating rather than
  > discovering.** `IncidentLog` *is* persisted, so an incident that was open
  > when the save was taken is open again on load — but its
  > `incidents.riot-opened` was not, and nothing re-announces an opening that
  > already happened. What the restored player has is the status strip's
  > incidents badge, which names the kind (issue #506 finding 2) and is a level
  > rather than an occurrence, so it does carry across a save; and, when the
  > restored incident reaches a terminal state, `incidents.all-clear` — and, if
  > that terminal state is a lapsed escape attempt,
  > `incidents.escape-succeeded` naming the prisoner who got out (#683). So the
  > sequence a restored session shows is the end of an incident it never
  > announced the start of. That is a smaller version of the same shape the
  > arrears case has, and the same reasoning covers it: the *condition* is on
  > screen throughout, and only the sentence marking the moment is missing.
  > Asserted rather than described: `tests/integration/sentence-end-release.test.ts`
  > saves a prison that has just released somebody and requires the restored one
  > to announce nothing. Also recorded in `docs/HUD_PROJECTIONS.md` gap 33.

  **Since #749 this channel also carries what the prison did because the
  *player* asked** — a queued build order cancelled, a delivery cancelled, the
  build history walked back or forward — and those five members are in the
  section on the same terms as every other, with the argument the branch first
  gave for them withdrawn. It read:

  > those five members make the exclusion below *stronger* rather than weaker,
  > because they have no condition behind them at all: "you cancelled that
  > order" is a notice about a press, which is exactly `RefusalLog`'s own
  > reason for not being saved.

  The half of that which survives is the half about the **band**: a reloaded
  prison must not confirm a press from a session that has ended, and
  `restored: true` is what stops it. The half that does not is the inference to
  the payload — the log is a scrollback now, so the row belongs in it. Nothing
  filters a member of `SIMULATION_EVENT_TYPES` out of the capture, and adding
  one that had to be filtered would be a new decision rather than a new member.

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
  reintroduce the per-node walk this change exists to remove. Freezing is not
  what detaches the interior from live state — the schema is; and neither one
  makes the interior immutable to whoever holds the envelope. See "The payload
  interior is detached, and once was not" below.

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

### The payload interior is detached, and once was not

This section exists because the sentence it replaces was false for a while,
and a false comment about a safety property is worse than none. Both
`markTrusted` and this document claimed the payload interior was "a fresh
Zod-parsed value detached from live runtime state" long before it was.

`jsonValueSchema` (`src/simulation/protocol/types.ts`) is `z.custom`: it
validates by predicate (`isJsonValue`) and returns **the input object
itself**. Zod rebuilds every other node it parses, so the aliasing was exactly
as wide as the `jsonValue` fields in the schema — in the save payload, one:
`payload.kernel.commands[].payload`. It had two consequences, both established
by execution (#105 from the SQL side, #106 independently from the persistence
side):

- `decodeSaveEnvelope`'s result shared those objects with the value it was
  given, so a caller that kept a reference to what it decoded could mutate the
  interior of a *trusted* envelope afterwards and leave `checksum !==
  computeSaveChecksum(payload)`.
- `createSaveEnvelope`'s result shared them with the **live kernel**:
  `Kernel.snapshot()` shallow-copies each queued command (`{ ...c }`), so the
  payload object inside the snapshot was the one the command queue still held.
  This is the part the old wording denied most directly.

**It is now detached.** `save-schema.ts` declares

```ts
const detachedJsonValueSchema = jsonValueSchema.transform((value) => structuredClone(value) as JsonValue);
```

and `queuedCommandSchema.payload` uses it. One line closes both trust entry
points across **every** payload version and the whole migration chain, because
`kernelSnapshotSchema` is shared by all of them — `grep -c kernelSnapshotSchema
src/persistence/save-schema.ts` counts one use per version and
`grep -nE '^export function migrateSaveEnvelopeV' src/persistence/save-migrations.ts`
is the chain.

**Three different numbers stood for this one fact, two of them in this file.**
This sentence said "all four payload versions and the V1 → V2 → V3 → V4
migration chain"; the bullet under "Two further things decided it" below said
"all three payload versions"; and `src/persistence/save-schema.ts`'s own
docblock said "all three payload versions and the V1 -> V2 -> V3 migration
chain". Re-derived 2026-09-15 there are **six** payload schemas and five
migration functions, so all three were stale and no diff could have found the
pair in this file, because neither half moved on the day the other did. The
number is deleted rather than set to six for the reason
`docs/AGENT_WORKFLOW.md` §4 gives: the sentence's subject is that the schema is
*shared*, and "every version" is true of any number of them.

`tests/unit/persistence-save-schema-aliasing.test.ts` pins the detachment from
both entry points, and also pins a rule about the *module*: no object-literal
field in `save-schema.ts` may use the pass-through `jsonValueSchema`. That
second check is the one that matters over time — a new `jsonValue`-typed
payload section would reopen the hole as an aliased subtree with the rest of
the suite green, which is precisely how the original defect survived.

Elsewhere the pass-through schema is correct and unchanged:
`versionedPayloadSchema.data` and `src/services/challenges/evidence.ts` both
use it, and neither is covered by a checksum this module vouches for.

**What is still not guaranteed, and never was:** an envelope's interior is not
immutable to whoever holds the envelope. Detachment is about the *caller's*
objects and the live simulation, not a deep freeze — #49 rejected that on
cost. So `checksum` remains a statement about the payload at the moment this
module vouched for it. `tests/unit/persistence-save-schema.test.ts` pins that
narrower promise.

#### Why the copy, and where it goes

The choice was made twice, and the second answer overrode the first, so both
arguments are recorded.

The measurement is in `tests/perf/persistence-decode-aliasing.perf.ts`
(report-only, per `docs/BENCHMARKING.md`), on this container — Node 24.19.0,
4× Xeon @ 2.10 GHz:

| tier | payload | queued commands | detached bytes | decode | copy just those fields | copy the whole payload | protocol bundle: `isJsonValue` | + `structuredClone` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| small | 42.2 KiB | 4 | 908 B | 9.0–10.3 ms | 0.01 ms | 1.2–1.3 ms | 2.3–2.7 ms | 0.80–0.85 ms |
| medium | 288.6 KiB | 16 | 3.6 KiB | 47.8–50.0 ms | 0.03–0.04 ms | 7.8–9.4 ms | 13.2–17.3 ms | 4.7–6.9 ms |
| large | 1.12 MiB | 64 | 14.4 KiB | 173–187 ms | 0.13–0.15 ms | 38.5–40.2 ms | 62.3–65.7 ms | 27.5–31.1 ms |
| x-large | 2.88 MiB | 128 | 28.8 KiB | 460–484 ms | 0.21–0.29 ms | 114–117 ms | 137–171 ms | 66.5–85.6 ms |

Ranges are three consecutive runs, not a claimed precision. The `decode`
column moves by 24 ms at the x-large tier between runs of *identical* code on
this container, so **no before/after decode delta can be read off it** and none
is claimed. The cost this change actually adds is the "copy just those fields"
column, measured directly: **0.01–0.29 ms**, ≤ 0.1 % of a decode. It runs once
per parse, so at most twice per `decodeSaveEnvelope` (the declared value and
the migrated value).

**The first answer was to correct the comment and not copy**, on three grounds
(#105 finding, implemented in #164). Two of the three survive and are why the
copy is placed where it is:

- **A copy inside `jsonValueSchema` itself is not cheap.** That schema also
  types `versionedPayloadSchema.data`, which carries an entire
  `SessionSnapshotBundle` on every worker snapshot and every restore
  (`src/simulation/worker/state-machine.ts`,
  `src/persistence/session/worker-session-host.ts`). Cloning there costs
  0.80–85.6 ms per message, on a boundary `postMessage` has *already*
  structured-cloned. **Still true, and it is the reason
  `detachedJsonValueSchema` lives in `save-schema.ts` rather than in the
  protocol module.**
- **The defect that existed was the comment.** Also still true — and the
  comment is corrected either way.

**The third ground did not survive** (#106): that a narrow save-local copy
"buys half a property, because the interior stays mutable by whoever holds the
envelope". Detachment and immutability are two different properties, not two
halves of one. What `markTrusted` needs in order to mean anything is that a
value it vouched for shares no state with the live simulation or with an
untrusted caller — and that property is now complete, not half-held. Immutability
to the envelope's own holder is a separate concern the module doc never claimed.

Two further things decided it, both from #106:

- **A comment cannot close a hole that widens.** The alias was reachable
  through `kernelSnapshotSchema` from every payload version and the whole
  migration chain (this read "all three" while the paragraph above it read
  "all four" — see there), and any future `jsonValue`-typed payload section would have
  widened one field into a subtree. That is a code hole, and it is now closed
  by the module rule above.
- **The cost is 0.01–0.29 ms.** A queued command payload is the *pending
  queue*, not bulk state: 908 B of a 42 KiB save, 28.8 KiB of a 2.88 MiB one.

No ADR is required for this, and #106 says so explicitly: it is a bug fix
inside the contract #49's note already states. An ADR **would** be required for
either alternative framing — deep-freezing trusted payloads, or re-verifying
the checksum in `PrisonSaveRepository.save` — because both knowingly trade back
the measured win #49 exists for, and `AGENTS.md` requires a persistence-format
trade-off to be recorded rather than decided in implementation code.

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

`saveMigrationChain` registers the V1, V2, V3, V4 and V5 schemas and the
`1 -> 2`, `2 -> 3`, `3 -> 4` and `4 -> 5` steps. The chain-walking, per-step
validation and immutability guarantees are also exercised against a synthetic
multi-version fixture in `tests/unit/persistence-migration.test.ts`,
independent of the real save versions; the real upgrades are covered in
`tests/migrations/save-v1-to-v2.test.ts`,
`tests/migrations/save-v2-to-v3.test.ts`,
`tests/migrations/save-v3-to-v4.test.ts` and
`tests/migrations/save-v4-to-v5.test.ts`, the last three each walking a frozen
V1 fixture the whole way in one decode, which is what a save from the first
release actually gets.

`tests/migrations/save-v1-to-v5-chain.test.ts` covers the one property those
per-step files structurally cannot, and it is a lesson about how a migration
test is written rather than about any one step. Each of them builds its input
by calling the earlier steps on a fixture, so an assertion like
`expect(result.value.payload.world).toEqual(v2.payload.world)` has the step
under suspicion on **both** sides: it proves the later links carry `world` and
is blind to whatever the first one did to it. Measured, not argued — rewriting
`migrateSaveEnvelopeV1ToV2`'s `world` line to
`{ ...payload.world, ownedChunks: [], parcels: [] }`, a schema-valid V2 payload
in which the prison has lost every owned chunk and every parcel it was ever
sold, left the whole suite passing; the same edit in `migrateSaveEnvelopeV4ToV5`
failed three tests. The new file asserts `kernel`, `world`, `construction`, the
payload key set and the checksum after **every** link, always against the
checked-in V1 fixture, so a loss is both caught and attributed to a link. The
rule it stands for: a migration assertion must name a value the migration did
not produce.

### Adding a V6 later

The steps below are what V4 (#259) and V5 (ADR 0028) both did, and are the
pattern to follow.

1. Add the new interface/type and a `.strict()` Zod schema for it, alongside
   the existing ones — never edit a historical schema to match new code.
   Where two versions differ only in a bound or a leaf type, make the shared
   part a **factory** parameterised by that difference (as
   `sessionSystemsShapeFor` is, over two axes since V5: the need-level bound
   and the room-instance row) rather than copying several hundred lines: the
   historical version is then frozen by the arguments it is instantiated with,
   and the two shapes cannot drift apart in any other respect. Make the
   factory *generic* in a schema it takes, so the inferred payload type keeps
   the real shape instead of widening to `any`.
2. `saveMigrationChain.registerSchema(zodVersionSchema(6, v6Schema))`.
3. `saveMigrationChain.registerMigration({ fromVersion: 5, toVersion: 6, migrate })`,
   pure and side-effect-free, in `src/persistence/save-migrations.ts`. If it
   changes the payload, recompute `checksum` in the step (see "Checksum").
4. Bump `SAVE_SCHEMA_VERSION` to `6`. Call sites use the version-neutral
   `SaveEnvelope`/`SavePayload`/`TrustedSaveEnvelope` aliases, so this step no
   longer sweeps a rename through the repository the way V2 did — but a test
   that hand-writes an envelope with a *literal* version does not benefit, so
   prefer `SAVE_SCHEMA_VERSION` there too.
5. Keep every older fixture in `tests/fixtures/persistence/` checked in
   unchanged, and add a test asserting they migrate to the new shape
   correctly. `tests/fixtures/persistence/` holds V1 saves only; V2, V3 and V4
   test inputs are *derived* from those frozen V1 files by running the frozen
   migrations over them (see `save-v2-to-v3.test.ts`), which keeps
   `git diff -- tests/fixtures/` empty and keeps the inputs independent of the
   code under test. Follow that pattern rather than checking in a fixture
   generated by the build you are changing. Where the frozen fixtures cannot
   reach the case under test — none of them carries a `simulation` section, so
   none can exercise a change *inside* it — construct the older payload by
   hand from values chosen in the test, as `save-v3-to-v4.test.ts` does, so
   the expected output is still not computed by the code under test.
6. If the new version adds *simulation* state, extend `EncodedSessionSystems`
   and its Zod mirror together, and decide per subsystem whether the state is
   authoritative or derived — recording the answer under "What is deliberately
   excluded from the payload" above. An undecided subsystem is the failure
   mode #70 existed to fix.
7. If the new version *removes* a field because it has become derived, make
   the restore path recompute it and say where. V5 is the worked example: it
   drops `capacity` and `objectCapabilities` from a room instance and
   `restoreSessionSystems` calls `RoomCapacityResolver.resolveAll()` in its
   step 2, before any prisoner state is loaded in step 3. A removal is only
   lossless if the recomputation is *proved* to land on the value that was
   dropped — `tests/migrations/save-v4-to-v5.test.ts` measures the premise it
   rests on rather than citing it.

## V5: a room instance carries its rectangle, not its capacity (ADR 0028)

Three changes, and only one of them would have needed a bump on its own:

- **`simulation.objects` is new and optional.** One row per placed object:
  `placedObjectId`, `objectId`, `anchorTile`, `orientation`. Absence means "no
  object has been placed", which is what every V4 build meant because no V4
  build could place one — so this is the optional-field pattern above, exactly,
  and the V4 → V5 migration adds no section.
- **A room instance gains optional `width`/`height`.** The rectangle
  `RoomZoningService.zone` used to receive and discard. Without it "is this
  tile in this room" is unanswerable and no rule about a room's contents has a
  domain. Optional, because a V4 row genuinely does not record it and there is
  no honest default: `1×1` asserts a room the player did not zone, `64×64`
  asserts one that overlaps its neighbours.

  **Two sentences stood here and are marked rather than replaced**, because
  each was true when written and each stopped being true for a different
  reason (issue #559,
  [ADR 0074](./adr/0074-what-a-restored-room-that-recorded-no-rectangle-is.md)).
  They read: *"An instance with no rectangle is attributed no objects, so its
  capacity stays `0` — its pre-object-placement behaviour, and therefore not a
  regression."*

  The first half is still true of *object-derived* capacity. It stopped
  covering the case at #554, which gave an objectless room a concurrent-use
  ceiling from its own ground: an instance with no rectangle then answered
  `Infinity` for a capability-free action, not `0`, so a restored V4 yard
  admitted every prisoner at once while the same yard zoned in this build
  admitted four. Measured on a save v0.0.61 actually wrote
  (`tests/fixtures/persistence/save-v4-yard.json`).

  The second half — *therefore not a regression* — is what that made false, and
  the repair is **not** in this format. **A V4 row records no rectangle; a V4
  payload does.** `RoomZoningService.zone` paints the room type's `numericId`
  over every tile it designates, the world section carries that plane, and
  `restoreSessionSystems` reads the rectangle back off it
  (`src/simulation/rooms/bounds-recovery.ts`). So this field stays optional,
  this schema stays frozen, **`SAVE_SCHEMA_VERSION` stays 5, no migration is
  added and nothing is written to any save** — the recovery is recomputed on
  every load, which is
  [ADR 0033](./adr/0033-releasing-an-interrupted-incident-response-at-runtime.md)'s
  shape rather than ADR 0030's.

  **A migration could not have done it, and that is measured.** Restore a V4
  payload, run it, capture it: the envelope declares `saveSchemaVersion: 5`,
  decodes with `migrated: false`, and still carries a row with no rectangle. The
  class of save needing repair was never "V4 saves".

  **What an old payload gets**: a room whose plane still shows it restores with
  its rectangle and therefore with the capacity, object attribution and removal
  behaviour a currently-zoned room has. A row the plane cannot support — a
  hand-edited save, or paint cleared out from under it — recovers nothing and
  keeps ADR 0071's unbounded ceiling, deliberately and pinned by a test.

  **Issue #337 gave this field a second consumer, and no new field.**
  `RoomZoningService.unzone` used to grow each covered tile into the connected
  run of tiles holding the same room *type*, so two cells zoned as two separate
  drags were one region and removing one removed both. It now resolves each
  covered tile through `roomInstanceContaining` — the plane narrows the tile to
  a room type, the rectangle names the instance — and clears that instance's
  rectangle. The issue proposed storing an instance id per tile in the zoning
  plane and correctly called that a save-schema question; it is not needed, and
  adding it would have re-created exactly the shape the third bullet below
  removes, a persisted value derivable from state it could disagree with. So
  **#337 changed nothing in this format: no field, no section, no version
  bump.** `SAVE_SCHEMA_VERSION` stays at 5. **This paragraph then said "A V4
  row's absent rectangle keeps its own meaning here too: nothing resolves to
  such an instance, so its tiles fall to the same-type fill they always used,
  which is what keeps a restored V4 room removable rather than permanent."**
  Since #559 a restored V4 room normally *does* resolve to its instance, so its
  removal takes the instance path and #337's fix reaches it — which is strictly
  better than the fallback the sentence describes. The fallback is still there
  and still keeps a row no plane supports removable rather than permanent; it is
  no longer what a V4 room gets.
- **A room instance loses `capacity` and `objectCapabilities`.** This is what
  forces the bump: `capacity` was a *required* field, so removing it changes
  the shape. Both are now pure functions of (placed objects, room bounds, the
  object and room catalogues), and a persisted derived value can disagree with
  the state that produced it. Recomputing at restore makes
  `snapshot() → restore() → run N ticks` land on the same state **by
  construction** rather than by agreement.

**The migration is total and lossless because of a fact, not an argument.**
`RoomZoningService` is the only thing in `src/` that has ever registered a room
instance, and it registered `capacity: 0` with `objectCapabilities: []`
unconditionally — so every row any shipped build has ever written holds exactly
those two values, and the recomputed values equal the dropped ones.
`tests/migrations/save-v4-to-v5.test.ts` re-measures that premise off the real
command path, so a future change that gave a zoned room an authored capacity
fails the test instead of quietly migrating a value it had assumed away.

`supabase/migrations/` is untouched: a save-schema version is a client-side
payload shape and nothing about it reaches the database.

**V5 gained one more optional field after it shipped.** `masterSeed` (#412,
[ADR 0038](./adr/0038-what-makes-a-save-compatible.md) §4) is not part of what
V5 changed relative to V4; it was added later under "Adding an optional field
without a version bump" above. A V5 save written before it exists is still a
valid V5 save and still loads, which is the whole content of the claim that no
bump was needed.

## V4: need levels are stored scaled (#259)

`NeedsComponent` stored each need as a whole 0-255 level in a `Uint8Array`,
and `NeedsDecaySystem` decayed it every ten ticks through `decayNeed`, which
rounded. Every rate in `NEED_DECAY_PER_TICK` is far below one level per tick,
so the per-interval step was at most `0.8` and for five of the six needs at
most `0.5` — and `Math.round(n - d) === n` for any integer `n` and any
`d <= 0.5`. Those five needs were **fixed points**: they never moved, at any
level, for any number of ticks. Only `bladder` decayed.

The fix stores the level multiplied by `NEED_SCALE` (200) in a `Uint16Array`,
so the quantum is below every decay step instead of above most of them. 200 is
the smallest scale at which every rate is a whole number of stored units per
tick, which makes decay exactly linear in `ticksElapsed` and therefore
independent of the batch size the system happens to use — see `needs.ts` for
why that matters beyond this defect.

**Why this is a version bump rather than the optional-field pattern above.**
The `simulation.prisoners.components.needs` arrays did not change *shape*;
they changed *meaning*. A `hunger` of `200` is a nearly-satisfied prisoner in
a V3 save and a starving one read as V4, and nothing in the value says which
version wrote it. The two conditions the optional-field section names are
therefore both violated: absence is not what distinguishes the versions, and
an existing field changed meaning. `migrateSaveEnvelopeV3ToV4` multiplies
every level by `NEED_SCALE` exactly once; skipping it would load every
prisoner in every existing save at a two-hundredth of their real levels.

The migration is total and lossless in the direction it runs: a V3 level is a
whole number in `0..255` by V3's own (now frozen) schema, so every product
lands inside V4's bound, and `255 * 200` is exactly `NEED_MAX_SCALED`. It does
not invent a sub-level remainder — a V3 save genuinely did not record one, and
zero is what "exactly at level N" means. A V3 save with no `simulation`
section stays without one, for the same reason `migrateSaveEnvelopeV2ToV3`
fabricates nothing.

**What it costs.** Six arrays per save now carry five-digit values where they
carried three: about 2 bytes per prisoner per need, ~36 KB for a
3,000-prisoner save, and ~59 KiB in the capacity-shaped counterfactual the
"Prisoner components" section quotes. The component arrays themselves double
from `Uint8Array` to `Uint16Array` — 30 KB at `DEFAULT_PRISONER_CAPACITY`.
Both were accepted against the alternative of carrying a per-(entity, need)
fractional remainder, which keeps the byte range but adds a second
authoritative array per need that must itself be snapshotted in canonical
order, and puts floating-point state into the payload.

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
| `operations` | `Container`/`ContainerRegistry`, `JobBoard`, both `UtilityNetwork`s | Stock, reservations, carry jobs and utility topology are player-caused state. `JobWorkerPool` was a fourth owner here and **no longer exists** (ADR 0093 decision 4); its `jobWorkers` key stays in the payload, written empty, rather than costing a schema version to remove. |
| `navigation` | `DoorRegistry` | A door is placed, not derived: the world's edge planes say a boundary exists, the registry says it is a gated opening and how it is locked. |
| `security` | `SecuritySectorRegistry`, `GuardRoster`, `DeploymentSchedule[]`, `DeploymentSystem`, `PatrolSystem` | Hired staff, their posts, sector control state and the schedules that drive them. |
| `contraband` | `ContrabandRegistry`, `IntelligenceLedger`, `InformantRegistry`, `ConfiscationLedger`, `SearchPolicyDefinition[]`, `SearchSystem` | Concealed items, their provenance and movement history, decayed suspicion, and the evidence chain a confiscation produced. |
| `incidents` | `IncidentLog`, `SectorRiskTracker`, `GangRegistry`, `TunnelRegistry`, `IncidentTriggerSystem`, `IncidentResponseSystem` | Incident records are explicitly "simulation entities and domain events, not transient UI popups" (#28). |
| `economy` *(optional)* | `Treasury`, `ProcurementSystem` | A balance is spent, not derived, and a purchased delivery in flight has a `arrivesAtTick` in the future — dropping it would silently refund nothing and deliver nothing. Optional so a save written before #249 loads unchanged; see "Adding an optional field without a version bump" above. |

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
  snapshot. It is pinned to a literal in the payload schema (one
  `actorIdentitySnapshotSchema` serves V3 and V4), so a future registry shape
  arriving inside one of those envelopes is rejected as `invalid-shape` rather
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

**One sector is the exception, and it is derived rather than authored**
([ADR 0036](./adr/0036-a-derived-default-security-sector.md), issue #396).
`security-sector.prison` is a pure function of the world's chunk size and its
owned chunks, so `createNewSimulationRuntime` derives it — which means a
restored session derives it too, before the payload is applied, because
`restoreSimulationRuntime` builds its session through that same function. The
restore loop therefore **skips a sector id already registered**: `register`
throws on a duplicate, and the payload's row for this one is the same definition
the derivation just produced.

Three consequences worth stating plainly, none of which moves a version:

- **`SAVE_SCHEMA_VERSION` stays 5 and no migration exists.** No persisted field
  is added and no persisted shape changes. V6 stays free.
- **A save written before ADR 0036 gains the sector on load.** Its
  `sectorDefinitions`, `schedules` and `watchedSectorIds` are all empty, and
  `applyDefaultSecuritySector` runs again at the *end* of
  `restoreSessionSystems` — after the two arrays are cleared and refilled from
  the payload — so an existing file gets a working security tier with no
  migration. Re-saving that file adds the three entries to it.
- **The payload's copy is redundant, not authoritative, and a test says so.**
  `tests/integration/security-default-sector.test.ts` asserts that what a
  capture writes for this sector equals what a restore derives. If the
  derivation rule ever changes, that assertion fails and whoever changed it has
  to decide what an existing prison's post tile should be.

Where the payload *does* carry an entry for this sector, it wins:
`applyDefaultSecuritySector` leaves an existing sector, schedule or watch entry
alone. That is what lets a session hold a requirement for it other than the
derived one and keep it across a save. What cannot be expressed is
"deliberately no schedule at all" — silence is read as "derive it".

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

`DEFAULT_PRISONER_CAPACITY` is 5,000 slots and there are twenty per-prisoner
arrays *in the payload*. Writing them at capacity would cost ~318 KiB (325,372 bytes) in every
save regardless of population — the same mistake #50 removed from `entities`,
at twenty times the size. That is measured, not derived: the encoded arrays
are `readonly number[]`, so the cost is digit widths rather than element sizes,
and 318 KiB is the size at 5,000 slots with every array at its constructor
default (needs at `NEED_MAX_SCALED` = 51,000, `actionIndex` at its `-1`
sentinel, the rest zero) — the empty-prison case this claim is about. A
populated mid-game prison, with seven-digit tick stamps in three of the arrays,
measures ~445 KiB at the same capacity. They are written across the store's
**allocated prefix** (`maxActiveIndex + 1`) instead.

Both figures moved with V4 (#259): a need level is stored scaled by
`NEED_SCALE`, so the six need arrays carry five-digit values where they carried
three, which is ~59 KiB across 30,000 elements at this capacity. Before that
change the same two cases measured ~240 KiB (245,332 bytes) and ~337 KiB. Both
moved again with issue #80 (ADR 00XX): a nineteenth persisted array,
`solitarySanctionEndTick`, was added at zero -- the pre-#80 V5 figures were
~298 KiB (305,332 bytes) and ~425 KiB. And again with issue #589 (the owner's
ruling of 2026-09-17): a twentieth, `injured`, also at zero -- the pre-#589
figures were ~308 KiB (315,360 bytes) and ~435 KiB.
`tests/unit/session-component-payload-size.test.ts` is what keeps this
paragraph and `session-systems.ts`'s copy of it from drifting apart again.

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
of the then eighteen arrays, so recycling a freed index handed the next
prisoner the previous one's needs, classification and action state. It now
resets **all twenty-one**, so a dead slot's contents can no longer become a
live prisoner's starting state. **This paragraph read "all eighteen", then
"all twenty", and the payload's count and the runtime's count are two
different sets**: `SubstitutionRecordComponent` holds two per-prisoner
counters that `admitPrisoner` resets and no save carries, because they are
diagnostics and nothing reads them back into a decision. Issue #80 then added
`solitarySanctionEndTick` to `PrisonerRecordComponent`, which *is* state a
system reads back (`SanctionSystem`), so it joins the payload's count as well
as the reset's. The count above is the payload's; this one is the reset's.
Whether the payload could therefore shrink to the live indices
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
and migrated two hops to V3 when #70 landed; since #259 they walk three, to
V4.

### Measured size impact

Same four tiers and the same harness as #50's table, so the numbers are
directly comparable. These tiers populate prisoners and construction only, so
the security/contraband/incident sections are near-empty *by construction*,
not by encoding — a prison with guards and incidents pays for them
proportionally.

**Measured at V3**, and left at V3 deliberately: the table's subject is what
adding the `simulation` section cost, so re-measuring the "before" column
under a later encoding would stop it answering that question. V4 (#259) adds a
known, population-proportional delta on top of every "after" figure — two
bytes per prisoner per need, so ~0.3 KiB at 25 prisoners and ~35 KiB at 3,000
— which does not change the shape of the comparison. Reproduce either version
with the command below.

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
for terrain planes, and since #123 item 3 the same *code*:
`src/simulation/codec/run-length.ts` is the single encoder/decoder both planes
go through. It had been one convention with two implementations, whose
decoders disagreed about what a corrupt save is; see
[One run-length codec, two planes](#one-run-length-codec-two-planes) below.
That convention was chosen over the two alternatives the issue listed:

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
exactly it.

**That last sentence used to end "so a restored store allocates the same
number of slots", and it was the defect underneath #433.** A store is
allocated by the build that owns it — `DEFAULT_PRISONER_CAPACITY`, 5,000 —
and a save's `capacity` records the build that *wrote* it. Treating the two
as one number made `EntityStore.loadSnapshot` open with
`if (snapshot.capacity !== this.capacity) throw`, which refused this
repository's own `save-v1-in-progress.json`: two live prisoners inside an
eight-slot array, migrated and checksummed and unloadable because the array
around them was the wrong length. What has to fit is the **written prefix**,
and that is what the store compares now — see
"[A save's entity capacity is the writer's allocation, not a restore
precondition](#a-saves-entity-capacity-is-the-writers-allocation-not-a-restore-precondition)".
The cross-check above is untouched, because it is a fact about the blob's own
consistency rather than about two builds agreeing.

The encoding stays JSON-safe (plain numbers and arrays), which it must: the
same shape crosses the worker protocol boundary, whose `structured-clone`
payload is declared as `jsonValue`. `SESSION_SNAPSHOT_SCHEMA_VERSION` is
bumped to 2 alongside it — ADR 0003 gives a snapshot its own version for
exactly this, and a build handed the other shape now faults
`snapshot-incompatible` instead of restoring a corrupt ledger.

> **That "2" is this section's own history and has not been the live value
> since 2026-08-23.** `a5ec448` (#50) raised it 1 → 2, which is the change this
> section narrates; `01536a3` (#70, *"persist the whole prison, not just its
> terrain and walls"*) raised it 2 → 3 the same day, and
> `src/simulation/runtime/restore-session.ts:104` has read
> `export const SESSION_SNAPSHOT_SCHEMA_VERSION = 3;` ever since. The number is
> left standing rather than swapped because a `## V2:` section describing the
> bump *it* made is the correct record; what was wrong is that it read as the
> current value with nothing beside it. Any later section that needs the live
> figure should read the constant, not this line.

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

## One run-length codec, two planes

The save carries `[value, length]` runs in two places: the world snapshot's
`terrain` / `topEdge` / `leftEdge` / `zoning` chunk layers, and the entity
store's `generations` / `alive` liveness ledger. `entity-codec.ts` picked that
tuple shape on purpose, so the save would carry *one* RLE shape — but it
carried one shape and two implementations, and #123 item 3 found that their
decoders did not validate the same things. `decodeTerrainRle` rejected a
malformed tuple, a value outside 0–255, a non-positive count and an expansion
past capacity, each as a typed `WorldSnapshotError`. The entity path checked
only the run length and the total, and accepted **any** value: a corrupt
`alive` run of `999` restored as `231`, `-1` as `255`, `NaN` as `0`, because
`TypedArray.fill` coerces silently. The same corrupt save was a typed error in
one plane and accepted in the other.

`src/simulation/codec/run-length.ts` is now the only encoder and the only
decoder. The two things that legitimately differ between the callers are
**parameters**, not divergent code:

- **`maxValue`**, the inclusive upper bound on a run's value, is the target
  array's own maximum: `255` for a world plane and for `alive`, both
  `Uint8Array`s, and `65535` for `generations`, a `Uint16Array`. One shared
  bound would have been wrong in one direction or the other — `0–255`
  everywhere would reject a save legitimately carrying generation `65535`,
  which is a migration rather than a hardening, and `0–65535` everywhere would
  re-admit the byte-plane corruption this fixes.
- **`fail`** builds the caller's own error type from a structured
  `RunLengthFailure`. The codec itself never constructs an error, so
  `WorldSnapshotError` stays part of the world snapshot's decode contract and
  `RangeError` stays part of the entity codec's; neither is flattened into a
  shared generic error to make sharing possible, and every message both paths
  threw before is unchanged.

**No save's contents changed and no migration was needed.** The two encoders'
outputs were verified identical by execution before they were merged — over an
empty input, a single element, a single 1,024-slot run, alternating values, a
banded full 32×32 plane, the 0/255 boundaries and all 256 byte values — and
the decoder's added checks are refusals only: they never alter a successful
decode, and no run the encoder can emit trips one. What did change is that a
**corrupt** entity save that was previously accepted now fails, which is the
point. `tests/unit/run-length-codec-unification.test.ts` pins the encoding,
asserts the round trip on both planes, and asserts the range check fires for
both callers with each one's own error type.

Not in scope, and still open: #102's unbounded `chunkSize` (already bounded by
`WORLD_CHUNK_SIZE_LIMIT` in the envelope schema, but the ADR that decision
needs is not written).

**Corrected 2026-08-29 (#182).** This section used to list a third open
item here: `decodeRenderLayer` in `src/simulation/presentation/world-projection.ts`,
a third hand-rolled implementation of the same run shape, decoding the
`world/render-snapshot` worker-projection channel's payload rather than a
save. It is closed rather than open. `world-projection.ts` already lives under
`src/simulation/`, so its calling `expandRunLengthsInto` crosses no tree
boundary — it is simulation-internal, the same as the two callers above, not a
presentation module reaching into simulation. (It also turned out to have no
production caller at all outside its own test — `world/render-snapshot` is a
registered, tested worker channel with nothing on the main thread consuming
it — so the fold-in cost nothing a shipped feature depended on.) It now
decodes through the same shared codec, with its own two `RangeError`
messages preserved via `fail`. `tests/unit/run-length-codec-unification.test.ts`
covers all three callers, including a case the old hand-rolled loop got wrong:
a malformed run that is not a 2-element array used to escape as a bare,
undocumented `TypeError` from the destructuring itself, rather than the
`RangeError` the decoder's contract promises.

## Error taxonomy

`decodeSaveEnvelope` returns a distinct, actionable error code rather than a
single generic failure:

| Code | Meaning |
| --- | --- |
| `invalid-shape` | Not an object, missing/non-numeric `saveSchemaVersion`, or fails its declared version's schema (includes malformed/truncated saves, `updatedAt < createdAt`, a `world.chunkSize` above `WORLD_CHUNK_SIZE_LIMIT`, and an `entities.capacity` above `0xf_ffff` at any version). |
| `unsupported-version` | `saveSchemaVersion` is newer than the latest version this build knows about. |
| `no-migration-path` | A declared or intermediate version has no registered schema/migration (e.g. version `0`, or a gap in the chain). |
| `migration-produced-invalid-output` | A migration step ran but its output failed the destination version's schema — a bug in the migration, not the input. |
| `migration-step-threw` | A migration step threw instead of returning, so there was no output for a schema to reject. Distinct from the row above because it says something different to whoever has to fix it, and because the alternative — letting the exception escape — aborts `loadCurrent`'s recovery walk instead of failing one generation. |
| `checksum-mismatch` | The envelope parses and migrates cleanly, but its checksum does not match its payload — corruption, not a shape problem. |

This table covers the **decode** boundary only. A save that passes every row
here can still fail to *restore*, and why it failed has its own three-reason
taxonomy: see "Why a restore was refused, and whose fault it is (#431)" under
"Generation retention and recovery".

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

Database `lockstate-saves`, version 2, three object stores.

> **This read "version 1, two object stores" until 2026-09-14**, when ADR 0114's
> undo window added the third. The version moved 1 → 2 in the same change;
> `SAVE_SCHEMA_VERSION` did **not** move and no save envelope changed shape.
> Those are two persisted formats one layer apart, each with its own number and
> its own migration mechanism — `onupgradeneeded` in `indexeddb-store.ts` for
> this one, the step functions in `save-schema.ts` for the other — and the ADR
> spends a section heading on not conflating them.

- `prisons` (keyPath `prisonId`) — one `PrisonSlotMetadata` record per slot:
  game version, display name, `currentGenerationId`, the ordered
  (oldest-first) `generationIds` window, timestamps, optional `pendingSync`,
  optional `currentRevision` (#1097 — the revision of the generation
  `currentGenerationId` points at, written by every durable save including
  the interval autosave; see "Adding an optional field without a version
  bump" below and that field's doc comment in `store.ts`).
- `generations` (out-of-line key `` `${prisonId}:${generationId}` ``) — one
  validated `SaveEnvelope` per generation.
- `tombstones` (keyPath `prisonId`) — one `TombstoneRecord` per prison the
  player has deleted and can still bring back (ADR 0114): the slot record
  verbatim, every generation `generationIds` named, `deletedAt`, and the
  `expiresAt` the undo closes at.

#### The `tombstones` store, and why deletion is a move (ADR 0114)

`PrisonSaveRepository.delete` no longer destroys a prison. It reads the slot and
every generation it references, writes one `TombstoneRecord`, then deletes the
originals — **all inside the single `readwrite` transaction it already
opened**, never a second one. That is the property the whole feature rests on,
and it is why the copy lives in this database rather than in one of its own: a
real IndexedDB transaction cannot span two databases, so a copy held elsewhere
would need a second transaction with no way to commit both as one unit, and a
crash between them either leaves a prison and a spurious copy or — the defect
the feature exists to prevent — deletes the prison with the copy unwritten.

`list()`'s observable contract is untouched: the slot is gone from `prisons`,
so the prison leaves the list exactly as it did before.

**The migration is forward-only and pure.** The upgrade creates an empty object
store and reads, rewrites and deletes nothing; the new store starts empty for
every existing player, because nothing could have written a tombstone under a
schema with nowhere to put one. That is the same "absence is unambiguous"
argument this document makes for `masterSeed` under "Adding an optional field
without a version bump", one layer below where that rule is stated.
`tests/integration/persistence-local-indexeddb.test.ts` builds a real v1
database, writes a prison into it, and opens it through
`openLockstateDatabase`: the slot record comes back field for field including
its timestamps, the generation still decodes to the same envelope, and
`tombstones` exists and is empty.

**Expiry is lazy and read-time, because this application has no scheduler.**
`listTombstones()` deletes every copy past its `expiresAt` in the transaction
that reads them, and `SavePanel.refresh()` — awaited once at startup in
`src/main.ts` and run after every action — is what calls it. The gate on a
restore is `restoreFromTombstone`'s own clock reading against the stored
`expiresAt`, inside the transaction that would do the writing, never a
displayed countdown; a refusal for a closed window deletes the copy as it
refuses. The cost, named rather than hidden: **a copy can physically outlive
its window by as long as the player goes between sessions.** It is never
*offered* late, which is the half that reaches the player, and a
`setTimeout`-based window would be strictly worse — it dies with the tab,
taking the sweep with it.

**A tombstone that fails validation is swept, where a slot record is refused.**
The opposite treatment, for three reasons `src/persistence/local/tombstone-schema.ts`
states in full: a tombstone indexes nothing the player still has, it expires by
construction, and a copy this build cannot read is a copy it can never restore.
Holding bytes that can serve no undo is exactly the quota cost the "Free its
space now" control exists to keep off a player's disk.

**Quota.** An undo window holds bytes, and `save.status.quota-exceeded` already
tells the player that deleting a prison is how space is freed. ADR 0114 §6
named that as an open trade-off and the owner closed it on 2026-09-14 with a
visible control in the saves panel — `forgetTombstone` — that frees a held copy
immediately, rather than by shortening the window near quota or skipping the
copy. Production still has no proactive `navigator.storage.estimate()` check
anywhere in `src/`; quota is discovered reactively, by `classifyStoreError`,
exactly as it was.

#### Slot metadata is validated, and what happens when it is not valid

Until #105 finding 14 this was the one persistence boundary with no schema:
`LocalSaveTransaction` declared `getMetadata`/`listMetadata` as returning
`PrisonSlotMetadata`, which made the type an assertion about bytes on a
player's disk rather than something checked, while the generation stored
beside it went through `decodeSaveEnvelope` in full. The store interface now
returns both kinds of record as `unknown` — the shape generations always
had — and `PrisonSaveRepository` validates slot records with
`prisonSlotMetadataSchema` (`src/persistence/local/slot-metadata-schema.ts`),
because deciding what to do with unreadable data is repository policy.

**A record that fails validation is refused, not treated as absent, and
nothing is written, deleted or demoted.** That is the deliberate part, and
the reason is that "absent" is not a safe synonym for "damaged" here.
Elsewhere it is: invalid stored input settings and an invalid cached
entitlement projection are both read as absent, because absent means "use
the defaults" and "assume the free tier". For a save slot, absent means
*there is no such prison* — `create()` treats the id as free, `delete()` as
nothing to do, `list()` simply stops showing it. So treating a damaged record
as absent lets the next write replace it and orphan its generations, which no
read path can then reach and `delete()` would never clean up. That is the one
outcome that converts a damaged index into lost saves, and it is what the
mutation test for this behaviour demonstrates: with refusal replaced by
treat-as-absent, `create()` on the damaged slot succeeds and the record is
gone.

Refusal reaches the player through paths that already existed: `save()`
already converts a throw from inside its transaction into a `SaveWriteError`
(`unknown-error`, carrying the reason), and a rejected `list()` or load is
already rendered by `src/ui/save-panel.ts`. The one thing that changed there
is wording — the status line no longer asserts that storage is unavailable,
because an unreadable slot record is now a second possible cause.

**Availability is the price, and it is a decision to revisit rather than a
settled one.** One damaged record refuses the whole list, so the player is
told the list is unreadable instead of seeing their other prisons; and a
damaged slot cannot be deleted through `delete()`, because the generations it
references can no longer be enumerated. The alternative — skip the bad row,
keep the rest usable — silently hides a prison whose saves are still on disk,
and no existing behaviour in this repository settles which is right (the
generation path skips *and* demotes, but only because a redundant good
generation may remain; a slot record has no redundant copy). The conservative
option that cannot lose data was taken, and a recovery path for a damaged
slot — surfacing it as unreadable rather than refusing everything, and
offering an explicit destructive repair — is left as its own issue.

**No migration, and why none is needed** (`AGENTS.md` boundary 7 — a schema
added over an existing store can turn a readable slot unreadable, which is
data loss dressed as validation): `PrisonSlotMetadata` has had exactly one
shape since it was introduced, the database version has never moved past 1,
and every writer of the record writes that shape. The schema is also
deliberately no narrower than the records that exist — `prisonId`/`gameVersion`
are `string().min(1)` rather than the envelope's `identifierSchema`, the
current-generation pointer is accepted both as an explicit `undefined` and as
an absent key, and there is **no** `updatedAt >= createdAt` refinement and no
cross-field invariant. The timestamp rule in particular belongs to the
envelope and not here: an envelope's timestamps are written together and are
self-consistent by construction, while a slot's are two independent
`Date.now()` readings, so a backwards system-clock adjustment must not cost a
prison. Validation runs on writes too (`encodePrisonSlotMetadata`), so this
repository cannot write a slot its own read path would refuse — before that
gate, `create()` with an id the schema rejects would have produced a slot no
later read, load or delete could touch.

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
returned only when nothing in the retained window validates, and in that case
nothing has been deleted: the deletion runs through `recoverToGeneration`,
which is reached only after a generation has decoded.

Its optional `skip` set (`LoadCurrentOptions`) is how a caller that judges a
generation by something this method cannot see — a restore that threw — asks
for the next candidate without one being deleted to get there. See "Retired on
success, not on refusal" below.

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
either.

#### Never the last copy

`demoteGeneration` **refuses to demote the last retained generation** and
reports the refusal (`DemotionResult`), and that floor is what stops one
restore-time throw from costing a player every save they have. Since #432 it is
counted over the generations this build has **not** set aside as unreadable: a
quarantined generation is a copy held for a later build, not a fallback this
one can use, so a window of `[quarantined, X]` holds exactly one save this
build could load and `X` is it.

The chain it breaks, **as that chain stood before #431**: `handleInitialize`
wrapped `restoreSimulationRuntime` in a catch-all and reported *every*
exception out of it as `snapshot-incompatible`, so a bug in this build's own
restore code was indistinguishable from a bad blob; `WorkerSessionHost` turned
that code into a `SnapshotRestoreRejectedError`; `loadPrison` acted on it. A
cause of that shape is deterministic, so it rejected every generation in the
window. The first link is gone — see "Why a restore was refused, and whose
fault it is" below — but the measurement that follows is what the floor was
built for and is kept in the past tense rather than deleted. Measured on
`main` at v0.0.112, when the walk demoted each generation as it was refused:
**three good generations became zero in one load**, and the prison stayed
unloadable afterwards even once the failure was removed, because nothing was
left to load. With the floor the same load left the oldest generation in
place, and a build that could restore it loaded the prison again.

The floor is now the second belt rather than the first. What the same load
costs today is nothing at all — see "Retired on success, not on refusal"
below, which is the rule that stops it, and
`tests/integration/session-restore-failure.test.ts`, "a deterministic refusal
costs no generation at all", which measures it. The floor still stands
underneath: `loadPrison` can no longer reach it, because the generation that
restored is always retained, but it is what any other caller of
`demoteGeneration` runs into and what catches a future walk that forgets the
rule.

It costs the player nothing but a refused load. A prison whose only generation
cannot be restored and a prison with an empty window both answer
`no-valid-generation` from `SessionController.loadPrison` — `loadCurrent` still
returns the retained envelope, which is the whole point of keeping it — the row
stays in the prison list, and `delete()` still clears the slot and its
generations. The row's generation count is the one visible difference, and it
correctly says the save is still there. Retrying the retained generation on
every load costs one refused restore, which is the price of not deleting a save
that a fixed build can still read. The bytes are reachable through
`exportSave`, but the panel's Export is session-scoped (`exportActive` runs
against the active session) and a prison that will not load never becomes the
active session — so the retained save is preserved for a later build, not for
the player today.

It also aligns demotion with the decode path, which has always had this floor
implicitly: `recoverToGeneration` deletes confirmed-corrupt generations **only
after** an older one has validated, and when nothing in the window validates
`loadCurrent` deletes nothing at all. Demotion was the one path here that
could empty a window.

#### Retired on success, not on refusal (#403 (d))

**A generation refused by the host is retired only once a *different*
generation has actually restored.** That is the decode path's rule, stated
above, applied to the one path in this file that did not follow it — and it is
the whole of the difference between all-but-one and none.

The walk used to advance *by deleting*: `loadCurrent` re-derives its candidate
list from metadata on every call, so it kept returning the same generation
until one was retired, and retiring one deletes it. `loadCurrent` now takes a
`skip` set (`LoadCurrentOptions`) — generations the caller has tried and cannot
use, for a reason schema, migration and checksum cannot see. They are passed
over as if they were not retained: not returned, and not retired to get past
them. `SessionController.loadPrison` accumulates its refusals into that set,
and calls `demoteGeneration` for each of them **after** a generation has
restored, newest-first, so the pointer `demoteGeneration` heals lands on the
generation that just restored.

Why a success is what earns the deletion: another generation went through the
same restore code, on the same build, moments later, and came back a running
simulation. That is the strongest available evidence that what is wrong is the
*save* and not the build — the distinction the worker's catch-all cannot draw,
and the one the whole of #403 turns on. Absent that evidence, nothing is
deleted:

| Cause of the refusal | Before | Now |
| --- | --- | --- |
| Deterministic and *declared* (a shape no generation carries correctly) | every generation but one deleted | **none deleted**; `no-valid-generation`, window intact |
| Deterministic and *undeclared* (a fault in our own restore code) | every generation but one deleted | **none deleted**, and none is even a candidate for deletion: it is not a `SnapshotRestoreRejectedError` (#431) |
| This save only, `damaged-payload` (a genuinely bad newest generation) | that generation deleted, older one loaded | unchanged: that generation deleted, older one loaded |
| This save only, `unsupported-by-this-build` (a newer build wrote it) | that generation deleted, older one loaded | **that generation quarantined**, older one loaded (#432) |

The last row is the one #432 changed, and it is split from the row above it
rather than reworded, because the "Before" column is identical for both and
that is the point: until the reasons existed, one rule covered two verdicts
that want opposite handling.

The middle row used to be the top row's parenthesis — *"a code fault, or a
shape no generation carries correctly"* — because before #431 those two were
one thing here. They are separated rather than reworded, because the "Before"
column is identical for both and that is the point: the bound covered them
equally and could not tell them apart.

The second row is why this is not simply "delete less": #103's requirement that
an unrestorable generation must not stay current for ever is unchanged, and
`tests/integration/session-restore-failure.test.ts`'s "demotes the unrestorable
generation, restores the previous one on the same worker" still pins it.

Two consequences worth stating. A failed load now writes **nothing** — no
deletion and no pointer move — so a prison that cannot be loaded is exactly as
it was before the attempt. And the deterministic case retries every generation
on every load rather than one, which costs a handful of refused restores on a
recovery path that runs once per load; that is the price of not deleting saves
a fixed build can still read.

**Two things this does not settle, neither decidable inside implementation
code:**

1. **Classifying the failure — settled by #431, and the section below is the
   answer.** This item read: *"A schema/checksum failure is a fact about the
   blob; an unexpected exception is a fact about our code, and only the first
   justifies deleting anything. Today they are one `catch`."* They are no
   longer one `catch`. What it asked for is what landed — every deliberate
   rejection on the restore path is a declared verdict — and the hazard it
   named is real and is stated plainly there: an unclassified error *is*
   treated as a code fault, so a refusal nobody declared stops being covered by
   #103's rollback. The mitigation is that the direction is the safe one (the
   walk continues, nothing is deleted) and that the undeclared set is written
   down rather than left to be discovered.
2. **Quarantine instead of delete — settled by #432, and "A save only another
   build can read is kept" below is the answer.** This item read: *"so a
   demoted generation stays recoverable by a fixed build rather than only the
   last one. The obvious form — a `quarantinedGenerationIds` field on the slot
   record — is a persistence format change with a downgrade hazard:
   `prisonSlotMetadataSchema` is `.strict()`, so a record written by a newer
   build makes `list()` refuse the whole prison list on an older one."* Both
   halves stand: the hazard is real and the obvious form is still the wrong
   one. What changed is that the mark did not have to be a new field. It lives
   in the generation id, which every version of the slot schema already accepts
   as an arbitrary non-empty string, so an older build reads the record without
   complaint. Un-pointing without deleting is still not an option, for the
   reason stated above.
The third — demoting only once a fallback has actually restored — is settled,
and is the section above. It also removes most of what (2) was for: after it, a
deterministic failure deletes nothing, so there is nothing left to quarantine
in the case quarantine was designed for.

**(2) was behind (1) rather than beside it, and that was a change of
sequence, not of scope. Both have since landed; the paragraph is kept because
the argument for the sequence is what shaped the answer.** What made quarantine urgent was that a refusal could
not be trusted: the worker labels a bug in this build's own restore code
`snapshot-incompatible` exactly as it labels a bad payload, so a generation
deleted for being unrestorable might have been perfectly good. Two things have
narrowed that. Retirement now requires a *different* generation to have
restored, so the refusals that reach a delete are the ones a working build
disagreed with about one save. And the concrete instance everyone reasoned
from — `save-v1-in-progress.json`, refused for carrying an eight-slot ledger —
was not a bad save at all; #433 removed the refusal, and the fixture restores.
**(1) has since landed (#431), so the sentence that stood here — *"until (1)
lands, the remaining case for (2) rests entirely on refusals nobody has yet
exhibited"* — has been overtaken, and what it predicted is now the state of
things:** a demotion is a *declared* verdict on a payload, and what quarantine
insures against is a verdict the code stands behind. It also sharpens what (2)
is for. A demotion can now say which of two verdicts it reached, and only one
of them describes bytes worth keeping — `unsupported-by-this-build` is a save
another build reads, `damaged-payload` is one no build reads. The schema hazard
above is unchanged and is still (2)'s real price.

Who calls it is deliberately narrow: `SessionController.loadPrison` demotes
**only** on a `SnapshotRestoreRejectedError`, the error a host raises when a
declared check refused the *snapshot*, and only once another generation has
restored. A host that timed out, was never started or has gone away propagates
unchanged and costs no generation — demoting a good save because the worker was
busy would be the more expensive mistake. Neither does a
`SnapshotRestoreFaultError`, which is our own restore code throwing and is a
different class for exactly that reason (#431).

#### Why a restore was refused, and whose fault it is (#431)

The rules above decide **when** a refused generation may be retired. This one
decides **what a refusal means**, which is the question they were standing in
for.

`decodeSaveEnvelope` has always answered its half of it — "Error taxonomy"
above lists six codes and a meaning for each. The restore boundary had no such
answer: `SimulationWorkerStateMachine.handleInitialize` reported every
exception out of `restoreSimulationRuntime` under one code, and
`WorkerSessionHost` turned that into a `SnapshotRestoreRejectedError` carrying
a message string. So a save this build cannot read and a defect in this
build's own restore code were the same class with different prose — the player
was told their file was unreadable when the fault was ours, and a support
report could not be told from a bug report.

**A restore attempt that produced no session now ends for exactly one of three
declared reasons**, and they are declared at the check that decided them
(`src/simulation/runtime/restore-refusal.ts`):

| Reason | What it means | Whose fault | May the generation be retired? |
| --- | --- | --- | --- |
| `unsupported-by-this-build` | The payload is coherent and this build cannot interpret it: a snapshot `schemaVersion` it does not implement, an entity ledger whose written prefix is wider than it allocates, an actor-identity snapshot version it does not know, an RNG algorithm it does not implement. | Neither. The bytes are fine and another build reads them. | **No. Quarantined instead, once a different generation has restored** (#432) — see "A save only another build can read is kept" below. This column read *"Yes, once a different generation has restored — and this is the row #432's quarantine exists for"* until that landed. |
| `damaged-payload` | A declared check found the content inconsistent with itself: a terrain run that overruns its chunk, an RNG stream that is not four words, a `simulation` section with no `entities`, an identity snapshot naming one entity twice, a construction section with no `orders` array. | The save. No build restores it. | Yes, deleted, once a different generation has restored. |
| `restore-code-fault` | Nothing declared a refusal and an exception escaped. | **This build.** No verdict has been reached about the save at all. | **No, ever.** It arrives as `SnapshotRestoreFaultError`, which is not the class the demotion decision reads. |

Three and not four: *shape* and *checksum* failures never reach a restore —
`decodeSaveEnvelope` refuses those first, under the taxonomy above — so an arm
for them would be permanently unreachable. Three and not two: collapsing the
first two rows makes a save a newer build wrote indistinguishable from a
corrupt one, and those two want opposite handling.

**How each side of the worker boundary learns the reason.** The check that
refused raises a `SnapshotRefusedError` carrying it; `restoreFailureReasonOf`
is one `instanceof` and reads no message. The worker writes the reason into the
`protocol/error`'s `details`, a field `protocolFaultSchema` has declared
optional since ADR 0003 and nothing emitted until now — so this needs no new
fault code, no protocol version and no save-schema change. `WorkerSessionHost`
reads it back through a narrowing that only accepts the declared values, and
raises the matching class. A `snapshot-incompatible` fault that declares *no*
reason is treated as our defect rather than as a refusal: all three producers
declare one, so a fault without one is a producer that forgot, and guessing a
verdict about a player's save on its behalf is the defect this section removes.

**A code fault reports as `internal-error`, and it is recoverable.** The code,
because the HUD's alert list renders one sentence per fault code and the
`snapshot-incompatible` one reads *"The save could not be loaded — this build
does not understand its format."*, which is a claim about the player's file.
Recoverable, because ADR 0024 decides recoverability by whether the failure
reached simulation state and this one provably did not:
`restoreSimulationRuntime` is a factory that holds no reference to the state
machine, and `_runtime`/`_kernel` are assigned only from its return value. That
is not a technicality — a `faulted` worker answers the recovery walk's next
attempt `already-initialized`, so the pairing is what lets a code fault cost
the player nothing.

**What is deliberately left undeclared, and what that costs.** Only a check
whose input can come from nowhere but a save declares a reason. Validators
shared with a live session — `NamedRngStreams`' name-shape and uniqueness rule,
`SecuritySectorRegistry.register`'s duplicate-id refusal, the
content-definition lookups inside `restoreSessionSystems`' subsystem graph —
keep throwing what they throw, because relabelling them would tell a developer
who mistyped a stream name in code that a save was bad, which is this issue's
own defect pointed the other way. Such a refusal is therefore blamed on this
build. The cost runs in one direction only: the walk still tries the next
generation, still retires nothing, and the player is told the load failed
rather than that their saves are unreadable. At worst a genuinely bad
generation is not retired as promptly as it could be, and the next load
retries it.

**What the player is told, and what has not changed.** No locale key is added
by any of this. A load that exhausts the window on declared refusals still
reports `no-valid-generation`, which the save panel renders as
`save.status.no-readable-generation`. A load that ends in a code fault now
**throws**, which the panel renders as `save.failure.load` — *"Loading failed:
{detail}"* — instead of asserting that *"every retained copy failed
validation"*, which is a claim about the player's data that a defect of ours
does not license. Both keys already existed. Whether the player should be told
*which* of the two save-side reasons applied is a product question and a new
promise, and it is left open rather than answered here.

#### An import does not evict until it has restored (#438)

The rule above is about the **load** path. Retention eviction on **write** is a
different mechanism in a different file, and it was untouched by it.

`importSave` went through the ordinary save path, so `applyGenerationRetention`
deleted the oldest generation the moment the imported bytes landed — before
anything had asked whether they restore. Decoding, migrating and checksumming a
file establishes that it is a well-formed save; none of the three establishes
that this build can restore it, and this repository ships a fixture that passed
all three and threw. Measured on `main` @ `6f671d5` (v0.0.136), against a prison holding
three of the player's own generations, with `save-v1-in-progress.json` as the
imported file:

| | window after | the player's saves |
| --- | --- | --- |
| before the import | `[gen-1, gen-2, gen-3]` | all three on disk |
| one import | `[gen-2, gen-3, gen-4]` | `gen-1` deleted |
| three imports, no load between | `[gen-4, gen-5, gen-6]` | all three deleted; next load `no-valid-generation` |

**That file is no longer the way to reproduce it**, and the sentence is worth
writing down before it rots: `save-v1-in-progress.json` restores now (see
"A save's entity capacity is the writer's allocation" above), so an import of
it is a *working* import and legitimately costs a generation. Any payload that
decodes and then fails to restore reproduces the same table —
`tests/integration/session-restore-failure.test.ts` uses a world snapshot whose
terrain runs do not cover their chunk.

**An unproven generation takes the window's spare slot instead.** The retained
window may hold `keep + 1` generations while one of them has not been shown to
restore, and there is at most one such generation at a time:

- `applyProvisionalRetention` (`generation-policy.ts`) adds the imported
  generation without evicting anything. A window already over `keep` can only
  be over it because a previous import took the spare slot and nothing has
  confirmed it since — every other write here trims back to `keep` — so a
  second import retires *that* occupant. Exactly one per call, so a window
  over budget for some other reason (a build that lowered `keepGenerations`)
  converges rather than having its newest saves trimmed off in one write.
- `PrisonSaveRepository.confirmGeneration` closes the window back to `keep`
  once the generation holding the slot has actually restored, retiring the
  oldest exactly as the write would have. `SessionController.loadPrison` calls
  it after every successful restore, in the same failure-tolerant housekeeping
  block as the demotions: a storage error while trimming must not fail a load
  that has already succeeded, and the next load trims it instead. It is a
  no-op on every prison the player has not imported into.

**It is the same evidence `demoteGeneration` requires, pointed the other way.**
Demotion deletes a save because a *different* generation restored;
confirmation deletes one because *this* generation restored. Neither acts on a
decode, a checksum or an intention — only on a restore that happened, which is
the one thing that distinguishes a save this build cannot read from a build
that cannot read saves.

What an import costs, stated plainly because the save panel's own comment used
to get it wrong: **nothing, if it cannot be restored; the oldest retained
generation, once it has been.** The only thing an import can destroy is another
import that never loaded, and the player still has that file.

This did **not** close #432, and the sentence that stood here — *"a generation
retired here is still deleted rather than quarantined"* — was true until #432
landed. It is now half true, and the half that changed is the one that matters:
a generation retired by an import that worked, or by a `damaged-payload`
demotion, is still deleted; a generation retired for
`unsupported-by-this-build` is quarantined. The spare slot and the quarantine
slot are separate and do not interact — `applyProvisionalRetention` neither
grants the spare slot to a quarantined generation nor lets one make the window
look over budget — so a prison may briefly hold `keep + 2`.

#### A save only another build can read is kept, not deleted (#432)

The decision behind this section is
[ADR 0065](./adr/0065-what-happens-to-a-save-this-build-cannot-read.md), which
carries the arguments: why only one of the two save-side verdicts earns the
slot, why the mark is in the generation id rather than in a new field, why
exemption from the retention budget *is* the decision, and why it declines
#432's fourth acceptance criterion on purpose.

The rules above decide **when** a refused generation may be retired and **what
a refusal means**. This one decides **what "retired" does**, and the answer is
no longer one thing.

`unsupported-by-this-build` says the payload is coherent and this build cannot
interpret it — so the build that reads it *already exists*: it is the one that
wrote it. Deleting those bytes is the one deletion this repository would make
against a verdict it has just reached, and it was what happened, because
`SessionController.loadPrison` called `demoteGeneration` for every refusal
without reading the reason. **A generation refused for that reason is now
quarantined instead.** `damaged-payload` is unchanged: a declared check found
the content inconsistent with itself, no build restores it, and it is deleted
exactly as before.

Why only the first of the two gets the slot: the slot is one slot, and the two
verdicts differ in whether the recovery is demonstrated or hypothesised. For
`unsupported-by-this-build` a build that reads the bytes is known to exist and
only the shipping is pending; for `damaged-payload` a build that reads them
would have to be written, against a check that says the content contradicts
itself. If such a check is ever found to be over-strict, the remedy is to move
that throw site to the other reason — which is where "Why a restore was refused"
above puts the decision — not to widen quarantine.

**What quarantine is, mechanically.** `PrisonSaveRepository.quarantineGeneration`
renames the stored record and the id in `generationIds` to a marked form, in
one transaction, so the key the bytes are under and the id the window holds
never disagree. Nothing is copied elsewhere and nothing is re-encoded: the
value read out of the store is the value written back, which is what lets
`tests/integration/session-restore-failure.test.ts` assert the record is byte
for byte what was there before the load.

**Why the mark is in the id.** The obvious form is a `quarantinedGenerationIds`
field on the slot record, and it is the wrong one for the reason "Slot metadata
is validated" above already gives: `prisonSlotMetadataSchema` is `.strict()`,
so a record written by a newer build throws `CorruptSlotMetadataError` on an
older one and `list()` refuses the player's **whole prison list**. A quarantine
whose price is that a downgrade hides every save is not insurance. A generation
id is a string this repository generates and nothing else interprets —
`generationIds` is `z.array(z.string().min(1))` at every version the schema has
ever had — so a marked id is a record an older build reads without complaint,
and what it then does with it is the ordinary thing: offer it, be refused,
demote it, exactly as it would have before #432. The mark therefore costs no
`SAVE_SCHEMA_VERSION` bump (ADR 0038), no slot-schema change and no migration.

**What it is exempt from.** Everything in `generation-policy.ts`. A quarantined
generation is not counted against `keep`, is not eligible for eviction by a
save, an import or a confirmation, and is not the spare slot an import may
take. That exemption is the whole of what quarantine buys: the window evicts
from the oldest end, so a generation that merely escaped deletion would be gone
after `keep` further autosaves — 90 seconds at the 30-second cadence, against a
fix measured in weeks.

**The bound, and what it sacrifices.** **One quarantined generation per
prison**, held by the newest candidate for it.

| Situation | What happens |
| --- | --- |
| Nothing quarantined | the refused generation takes the slot |
| The same generation refused again on a later load | idempotent; nothing moves |
| A **newer** generation is refused | it takes the slot and the older quarantined generation is **deleted** |
| An **older** generation is refused while a newer one holds the slot | declined (`newer-generation-quarantined`); it stays an ordinary retained generation and the ordinary rules evict it in due course |
| A build **restores** the quarantined generation | the mark comes off (`releaseQuarantinedGeneration`), the slot is handed back, and the generation rejoins the ordinary window |
| The prison is deleted | it goes with the rest; it is inside `generationIds`, so `delete()` reaches it |

So what is sacrificed when the bound binds is stated plainly: **of two saves
this build cannot read, the older one goes.** The newer one is the more recent
state of the prison, and a build that can read one can generally read both.

**What it costs in storage.** One extra generation per prison, so the
per-prison worst case goes from `keep + 1` — the import spare slot above — to
`keep + 2`: five records at the default `keepGenerations: 3`. Against the tiers
in "Measured size impact" that is +42 KiB at 25 prisoners and +2.86 MiB at
3,000, per prison, under [ADR 0013](./adr/0013-free-tier-cloud-save-capacity.md)
§4's accepted 4 MiB per stored save version, and at most ~14 MiB of local
IndexedDB across the five free slots. Nothing here reaches cloud storage: this
is `src/persistence/local/` and #20 is unimplemented.

**`loadCurrent` still offers a quarantined generation, and that is the
recovery.** #432 asked for the opposite — *"`loadCurrent`'s recovery walk must
not offer a quarantined generation back"* — and that criterion is the one that
gives, because the same issue requires the bytes to be *"recoverable by a later
build without the player doing anything unusual"*. Leaving it in the walk **is**
that recovery: the quarantined generation is the newest thing in the window, so
a build that can read it restores it on the very next load, with no new code
path, no new control and nothing for the player to be told. Hiding it would
need a second, explicit recovery route, and a route the player has to be told
about is a player-visible promise, which `AGENTS.md`'s fourth exclusion
reserves to the owner. Termination is unaffected: it rests on
`LoadCurrentOptions.skip`, which only grows, exactly as before. The cost is one
refused restore per load and only while the quarantined generation is still the
newest — the first save after the fallback restore puts an ordinary generation
above it, and the walk never reaches it again.

**It is invisible to the player, deliberately.** The save-list projection's
`recovery` and `retainedGenerations`, and the save panel's per-prison count,
all count readable generations only (`readableGenerationIds`). Counting a
quarantined copy would report a prison as `recoverable` when this build cannot
perform that fallback — a promise the code does not keep. Whether the player
*should* be told that a save is being held for a later build is a new promise
and therefore the owner's; it is an open question in this issue's ADR, not a
decision taken here, and no locale key is added.

### Autosave

`AutosaveScheduler` schedules a trailing-edge save `intervalMs` after
`markDirty(prisonId)`; further dirty markers before that timer fires are
coalesced into the same pending save. A dirty marker that arrives while a
save is already in flight schedules exactly one follow-up save once that
write settles — never a second concurrent write for the same prison. Tests
use Vitest's fake timers (`vi.useFakeTimers()`/`advanceTimersByTimeAsync`),
per `docs/TESTING.md`'s "own the complete timer lifecycle" rule, rather than
real elapsed time.

**A failed save is reported and survived, never swallowed.** A save that
*rejects* — rather than returning a failed `SaveResult` — reaches `onResult`
as one, classified by `classifyStoreError` so a thrown `QuotaExceededError`
says `quota-exceeded` here too, and the prison settles exactly as a
successful save settles: the follow-up a mid-save dirty marker asked for
still runs, and a later `markDirty` still schedules a save.

That is worth stating because it was false until it was fixed, and the
failure mode was silent. `runSave` claims the slot (`state = 'saving'`) and
calls `performSave` through `void`; `performSave` had no `try`, so one
rejection left the entry parked in `'saving'` for ever. `settle` never ran, so
no follow-up timer was ever scheduled and `markDirty` could only set
`'saving-with-pending-dirty'` on a save that had already finished — **autosave
stopped for the rest of the session after a single failure**, with an
unhandled rejection as the only evidence anywhere. The most likely trigger is
the least exotic one: `buildEnvelope` captures authoritative state across the
worker boundary, so it rejects whenever the worker has faulted, hung or gone
away. Reporting it is half the fix rather than a nicety — the same argument
ADR 0024 decision 2 makes for a recoverable worker fault, that continuing
after a failure is defensible only while the failure is visible.

**What marks a session dirty: every command the simulation accepts.** The main
thread observes acceptance as a `simulation/command-result` with
`status: 'queued'`, and `SimulationCommandSender` notifies a listener that
`src/main.ts` wires to `SessionController.markDirty()`. Acceptance rather than
execution, deliberately: a queued command runs at a future tick, so a tab that
dies in between schedules a save for a command that never ran — early rather
than late, which is the harmless direction. Hooking execution instead would tie
wall-clock durability to simulation speed, so a paused game would never autosave
and ×4 would autosave four times as often.

The chattiness that implies is the scheduler's to absorb and is what it was
built for: a thousand accepted commands inside one interval produce one write.

This is worth stating because it was missing for the whole life of the
scheduler. Nothing called `markDirty`, so the interval above was configured,
reached the scheduler, and never fired a single save — the sentence further
down this document calling the interval autosave "the actual durability
mechanism" was aspirational rather than true, and the best-effort `pagehide`
save was the only automatic write in the shipped app (issue #146). A callback
rather than a `SessionController` reference, because `src/ui/**` may not depend
on `src/persistence/**` and the sender is constructed before a controller
exists; `tests/foundation/composition-root-contract.test.ts` is what fails if
that one wiring line is removed again.

Removed, but not disabled: that gate matches the line as a substring, so issue
#264 prefixed it with a never-true `if` and left `tsc` clean and every test
green. The behavioural half is now
`tests/browser/app-shell.spec.ts`, which creates a prison on the assembled
page, lays a wall on the world, and requires a further generation to reach
storage from the interval alone — with no `pagehide` and no hidden
`visibilitychange` in between, so the write it observes cannot be the
best-effort lifecycle save this section describes.

### Export/import

`exportSave` returns the current generation's already-validated envelope.
`importSave` runs an arbitrary value through `decodeSaveEnvelope` (schema +
migration + checksum) before it can reach `save()` — an invalid import never
touches storage. Migration is not a separate step a caller has to remember:
`decodeSaveEnvelope` walks the chain, so a V1/V2/V3/V4 file becomes a V5
envelope on the way in and `save()` only ever sees the current version.

**A refused import says which of four things went wrong (#287).** It returns
`SaveImportResult`, not `SaveResult`, for two reasons the save path does not
have. `SaveWriteError` has three codes and all three are about *storage*, so
folding a decode failure into `unknown-error` — which this method did while
nothing called it — leaves a caller with one sentence for "not a save file",
"a save from a newer build", "a structurally invalid save" and "a save whose
checksum does not match". Those are four different things to tell a player, so
the `SaveDecodeError` travels beside the write error as `rejected`; it is
absent exactly when the envelope decoded and the write is what failed, which
is the arm `describeSaveResult` already handles. The second addition is
`migrated` on the success arm: whether the chain ran is a fact about the file
worth reporting, and the save panel reports it.

`tests/unit/persistence-local-repository.test.ts` holds both — the four
refusals as one table (the property is the *distinction*), and the checked-in
V1 fixture importing as `migrated: true` and loading back at the current
version.

**What an import costs the player.** Nothing, until it has restored. The write
takes the retained window's spare slot rather than evicting the oldest
generation, and the eviction happens on the first successful restore instead —
see "[An import does not evict until it has
restored](#an-import-does-not-evict-until-it-has-restored-438)" above for the
measurement that made that necessary. So a file this build cannot restore
leaves every save the player had, a file it can costs the oldest generation
exactly as it always did, and a second import before either has loaded reuses
the slot the first one took.

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

Supabase execution (#20); full service-worker asset caching; and simulating
elapsed time while the browser was closed.

**This list used to end with a fourth exclusion, and ADR 0109 made it false.**
It read:

> and any cross-tab/multi-writer concurrency control beyond the
> single-process autosave/manual-save coalescing above — `revision` is
> caller-managed and this repository does not yet enforce optimistic
> concurrency on it, matching the "not this issue" scope in
> `save-schema.ts`'s own documentation.

It is kept above rather than deleted because it is the position that changed,
and because a reader of ADR 0105 will meet it quoted there as the reason
FINAL-006 was a documented exclusion rather than a defect.

**What is true now.** `PrisonSaveRepository.writeGeneration` enforces
optimistic concurrency on `revision`, and `revision` is no longer
caller-managed: the caller submits an envelope and the revision it *last saw*,
and the repository compares that against `metadata.currentRevision` inside the
`readwrite` transaction it already opens, refuses with `'stale-revision'` on
mismatch, and stamps `currentRevision + 1` on the record it writes. Two tabs
over one IndexedDB are ordered by that comparison; the second is refused rather
than told it succeeded. See "Two writers, and what each token answers" below.

**One sub-clause of the old sentence was wrong about this repository when it
was written, and is not merely out of date.** There is no "not this issue"
scope in `save-schema.ts`'s documentation and there never has been:
`git log -S` over that file finds no such note and no occurrence of
"optimistic". The sentence it was pointing at is the one in this document's own
"Envelope shape" block, one level up rather than one level down. Both have now
been rewritten.

### Two writers, and what each token answers

Two different questions are asked on the way into a durable write, and neither
subsumes the other (ADR 0109 Decision 2):

| question | token | durable? | what it closes |
| --- | --- | --- | --- |
| what did the writer last see? | `currentRevision` on the slot | **yes** | #582 FINAL-005, FINAL-006 |
| is the writer still the authorised session? | the `ActiveSession` object itself | **no** | #582 FINAL-004 |

**The session epoch is deliberately not durable, and that is a load-bearing
claim rather than a convenience.** Both parties to "is this writer still
current?" are live objects in one process at the moment it is asked: the stale
capture is an in-flight promise inside one `SessionController`, and the session
that replaced it is the one in its field. Object identity rather than an id,
because `prisonId` cannot prove the session in the field is the one the capture
began against — a same-slot reload does not change one. `SessionController`
compares by identity, exactly as `deletePrison` already does across its own
`await`.

That claim has a named falsifier and it was run: a capture that survives its
own *page* would leave nothing live to compare against and would force a
durable lease, i.e. a slot-schema change. Against the real
`WorkerPerSessionHost`, a `pagehide` during genuine page teardown issues **no
write at all** — `saveNow` cannot reach `repository.save` without first
awaiting `host.capture()`, a round trip to the simulation worker, and the page
dies long before the worker answers. A capture cannot outlive its own page,
because the capture is the part that dies first.
`tests/browser/lifecycle-save-epoch.spec.ts` keeps that measurement as a
standing gate.

### What a refusal does

- **A refused manual save tells the player**, through
  `describeSaveResult`'s `'stale-revision'` arm:
  *"Could not save: this prison was changed elsewhere."* It is reached only
  after the one retry below has been tried and refused.
- **A refused autosave says nothing.** It fires on a timer the player did not
  press, and a periodic warning about a condition they cannot influence is
  noise.
- **A writer whose session is gone is dropped without a write, a retry or a
  report**, because it belongs to a session that no longer exists and has
  nobody to tell.
- **A writer that lost the race to its own session retries exactly once**,
  re-capturing rather than re-submitting what was refused. It retries only when
  the slot moved to exactly where its own bookkeeping already stands — proof
  that the write that beat it was its own. A writer that lost to *another tab*
  is refused and surfaced, never retried: its state is not the newest there is,
  and retrying it would re-open FINAL-006 through a slower route.

**A slot with no `currentRevision` fails open exactly once**, in both the
comparison and the allocation. The field is optional, nothing repairs it
retroactively, and a slot written before #1097 can hold generations at revision
40 — so the first write to such a slot carries the caller's sequence forward
instead of restarting it at 1, and every write after that is allocated by the
transaction. Refusing there instead would make every pre-#1097 prison
unsaveable.

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
  than `faulted` — it installed no runtime, so it is still `uninitialized` in
  substance, and `recoverable: true` says exactly that. (Until #149 that
  carried a second, larger reason: `handleInitialize` accepts only
  `uninitialized` and the page held one worker for its whole life, so faulting
  it made one bad save cost every later load in the tab. See "A worker per
  session" below for why that consequence is gone.)
- **`WorkerPerSessionHost`** (production) is the layer above it, and the one
  the composition root actually builds. It gives every session a worker of its
  own and a `WorkerSessionHost` of its own — see "A worker per session" below.
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

### A worker per session (#149)

`SimulationWorkerStateMachine` accepts `simulation/initialize` only while it is
`uninitialized` and answers anything later with `already-initialized`, because a
worker holds one authoritative simulation (ADR 0006). `src/main.ts` built one
`WorkerSessionHost` per **page**, so the first `createPrison` or `loadPrison`
consumed the worker and **every later load in that tab failed** — the panel
offers Load per prison, so a player with two prisons met it on the second one.
Both components were right; the composition was the defect, and nothing tested
it because every test builds a fresh machine or a fresh host per case.

The session boundary is now the worker itself, which is ADR 0006's amendment of
2026-08-24. `SimulationWorkerChannel` owns the page's worker and enforces one
rule — **a worker that has been sent `simulation/initialize` is never sent
another** — and `WorkerPerSessionHost` claims one per session, drives it through
an ordinary `WorkerSessionHost`, and shuts the previous session down over the
protocol before the outgoing worker is terminated. Loading a prison therefore
means what reloading the page means, which is what a player expects it to mean.

Three consequences worth stating plainly:

- **The renderer and the HUD do not see the swap.** They register their
  listeners on the channel at boot, and it forwards from whichever worker is
  current; a message from a worker that is no longer current is dropped rather
  than delivered late.
- **A load costs a worker start.** Measured on the production build in
  Chromium: 152–200 ms for construction, module evaluation and a first protocol
  round trip (ADR 0006's amendment carries the figures). The recovery walk above
  pays it once per demoted generation, bounded by the three that are retained.
- **A `Worker` that cannot be constructed for a later session is reported, not
  thrown.** It surfaces as an ordinary `Error` — never a
  `SnapshotRestoreRejectedError` — so the panel names the action that failed and
  no generation is demoted for a failure that says nothing about the save. The
  page also raises the same `simulation-unavailable` band a browser that cannot
  start a worker at boot gets, because after the swap that is exactly the state
  it is in (issue #82's failure path, which had to become re-entrant for this).

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
  the snapshot it sets that generation aside and asks for the next-newest one,
  passing what it has already refused as `loadCurrent`'s `skip` set, so the
  newest-first walk covers restore failures and not only decode failures
  (#103, and "Demotion also covers saves that decode and cannot be restored"
  above). A generation offered again after being skipped throws rather than
  looping: the skip set only grows, so it is what makes the walk terminate,
  and a repository that ignored it would spin.

  **Nothing is retired until something has restored** ("Retired on success,
  not on refusal" above). When a generation restores, every generation the
  walk refused on the way to it is demoted, newest-first. When none does, the
  walk ends with `no-valid-generation` — the same answer a prison with nothing
  loadable in it already gives — having written nothing and deleted nothing.

  That retirement runs *after* the session is adopted and does not fail the
  load: the prison is restored and running, and a storage error while deleting
  a save already known to be unrestorable costs one more refused restore on
  the next load rather than the load the player just made. It is reported
  through `getLastRetirementFailure()` rather than swallowed, because an error
  nothing can observe is indistinguishable from a retirement that silently
  stopped happening.

Default autosave cadence is `DEFAULT_AUTOSAVE_INTERVAL_MS` (30s),
justified by the measurements below rather than picked by feel — issue
#19 requires that "dirty tracking/cadence must be justified by
measurements before tuning."

### What a restore actually carries

`restoreSimulationRuntime` (`src/simulation/runtime/restore-session.ts`)
returns an explicit `RestoredScope`, and the UI displays it, because a save
still carries less than the live runtime holds — though since V3 the
difference is derived and in-flight state rather than whole subsystems:

**The scope is derived from the bundle, not from the save version.** It used to
be a module constant returned on every path, including the legacy one, so a
migrated V1/V2 save that carried no prisoners at all was still described to the
player as having restored "prisoners, needs, actions and cell assignments"
(issue #109). `restoredScopeFor(bundle)` reads which of the three optional
sections — `entities`, `simulation`, `identity` — actually arrived and moves the
entries the absent ones carry into the right-hand column.

Both call sites derive it, and that matters: `restoreSimulationRuntime` returns
it, and `SessionController.loadPrison` computes its own from the payload it
holds, because `startFromSnapshot` returns `void` so the controller cannot read
the restore call's answer. Fixing only the first leaves the sentence the player
reads unchanged, which is why `tests/unit/restored-scope.test.ts` asserts at
both.

This is also why the migration's refusal to fabricate an empty section is safe:
absence is now reported rather than silently reinterpreted as presence.

The two columns below are the default `en` text of the thirteen `save.scope.*`
keys the scope carries (`src/content/default-locale-en.ts`); since #226 the
scope itself holds the keys and nothing else, and the panel resolves them.

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

**Its strings are message keys, not literals.** Every player-facing string in
the panel — the heading, the five buttons, the empty-list row and the
seventeen status sentences — was a hard-coded English literal until issue
#208, in the one UI module that no localization gate collected. They now go
through `SAVE_PANEL_MESSAGE_KEY` (`src/ui/save-panel-messages.ts`) and the
bundled default locale, and the panel's mapping functions return a message key
plus parameters rather than text, the same split the HUD uses between
`projection.ts` and its DOM builders ([ADR 0011](./adr/0011-localization-architecture.md)).
Two decisions inside that are worth having written down:

- **A spliced `Error.message` is a diagnostic, not copy.** `Save failed:
  {detail}`, `Could not create a prison: {detail}` and the per-action failure
  sentences interpolate a message thrown in `src/persistence/**`, which is
  English and untranslated. The key carries the placeholder so the sentence
  around it stays translatable and the fragment is honestly data; hiding it
  would cost the player the one detail that names what went wrong (issue #65's
  `did not reply within 15000ms` is that detail).
- **What a load restored is localized too, since #226.**
  `RestoredScope.restored` and `notCarriedByThisSaveVersion` carry
  `RestoredScopeEntry` values — a `labelKey` and nothing else — rather than the
  English prose they held until then, because
  `src/simulation/runtime/restore-session.ts` is the tier ADR 0011 says
  translated text may never live in. `describeRestoredScope`
  (`src/ui/save-panel.ts`) resolves each key against the panel's localizer and
  joins the results with `', '` into the `{restored}` and `{notCarried}`
  placeholders, so the whole sentence — frame and list items — is catalog text
  resolved at the last possible moment. The thirteen `save.scope.*` entries are
  authored in `src/content/default-locale-en.ts` and are word for word the
  strings the simulation used to hold: #226's decision was one key per existing
  string, so **what a restore reports to the player did not change**. Nothing
  about the scope is persisted, checksummed or branched on — it is derived from
  the bundle at load time by `restoredScopeFor` and read only by the panel — so
  this is not a save-format change and needs no migration.

The panel takes its localizer as a **required** third constructor argument, and
`main.ts` hands it the same instance the HUD uses. This used to be an optional
argument defaulting to a localizer the panel built for itself — recorded there
as "a seam and not a design", because the two were equivalent only while `en`
was the only locale that existed: the first non-`en` locale would have left the
panel rendering English while the rest of the interface changed language, in the
one panel that protects the player's prison.

Closing it was slightly larger than the "one-argument change" that note
predicted. The localizer was local to `mountInterface` while the panel is
constructed in `bootPersistence`, so it is now built once at module scope —
which is the honest shape anyway, since having exactly one localizer per page is
the property that was wanted. Removing the panel's fallback also collapsed two
entries in `tests/unit/ui-orchestration-boundaries.test.ts` from `value` to
`type-only`, exactly as their own reasons predicted, and that gate is what
reported it: it fails on `value -> type-only` with "the entry overstates what
the module needs and should be tightened".

`tsc` now guarantees that *a* localizer is passed. It cannot guarantee it is the
same instance, and re-adding a default would compile — an unused default is dead
code rather than the defect, and the defect was the composition root not handing
one over. That is pinned by
`tests/foundation/composition-root-contract.test.ts` instead.

**Import is the other half of Export, and the panel is where it was missing
(#287).** `SessionController.importInto` was written, exported and reachable,
and `git grep -n importInto -- src` returned exactly one line: its own
definition. The application offered a download it could not read back. The
control is a fourth button in the same always-visible actions row, next to
Export, and pressing it opens a file chooser; the panel parses the bytes,
hands the value to `importInto` (which validates, migrates and checksums it
before anything reaches storage), and then *loads* the prison, because an
import that only wrote a generation would leave the player looking at their
old game. Each half reports for itself: the status line carries the import
outcome — including whether the file was migrated from an older version — and
the detail line carries what the restore actually carried, from
`describeRestoredScope`, the same as a Load.

Three decisions in that worth writing down:

- **Into the active prison, as a new generation.** That is the symmetry
  `exportActive` sets, and `importInto` needs a slot that exists in any case.
  Nothing is destroyed: the pre-import state stays in the retained generation
  window. With no active prison the panel says so in the sentence it already
  has for that state, so a player starting from empty storage creates a prison
  first — the honest smallest version of this, and the place to revisit if
  "import into a new prison" is wanted later.
- **The `<input type="file">` lives for one gesture.** It is created on the
  press and removed when the choice lands. A permanent hidden input would be a
  permanent *control* that is never laid out, and
  `tests/browser/app-shell.spec.ts`'s reachability sweep accounts for every
  control on the page and fails on one that is laid out in no state it visits.
  Picking the file is also deliberately **outside** the action gate: a file
  dialog stays open as long as the player likes and can be dismissed without
  producing an event, so gating it would disable the whole panel for an
  unbounded time. The gate opens when the bytes arrive.
- **It fits in the row that already exists, measured rather than assumed.**
  The rail's panel width already wraps three buttons onto two lines at the four
  desktop viewports the browser suite visits, so the fourth costs nothing
  there: with one prison saved on the Build tab, `.save-panel__actions` is 92px
  and the panel's content 225px both before and after, at 1280x720
  (161.1px box), 1440x900 (227px box, no scroll), 1024x768 (209.1px) and
  900x600 (108.7px, the `min-height: 25%` floor). Only 375x812 changes: the row
  goes from one line to two (44px → 92px) and the content from 177px to 225px
  in a 222.3px box, i.e. 5px of scroll in a panel that is a scroll container by
  design. **The Build panel is untouched at all five**: no box in its shrink
  chain shorter than its own content, `scrollTop` 0 on arrival,
  `buildPanelScrolls` false and "Enter coordinates" inside the fold, with the
  same numbers before and after the button existed — which is what the four
  #174 assertions in `app-shell.spec.ts` require, and they pass unweakened.

  The reason that holds is worth stating rather than inferring from the panel's
  own numbers: **the control costs the rail nothing.** `.hud__aside` measures
  173.1 / 353.1 / 221.1 / 120.7 / 230.3px at the five viewports both before and
  after — identical, because the slot's height comes from the rail and the panel
  absorbs its own content by scrolling. So none of this is spent out of the
  rail's *always-visible* budget, which is the scarce quantity — **7.8px at
  900x600 and 30.2px at 1280x720**, the two tightest viewports, against a 44px
  `--tap-target`. Measured rather than derived: a spacer is grown above the
  Build panel's last section until the section's bottom edge crosses the
  panel's fold, to 0.05px.

  Those figures were 11.8px and 38.2px until the second half of #174, and the
  difference is not space that was lost. The catalogue section's floor did not
  count the gutter under its own list, so 4px of the 11.8 at 900x600 was the
  section laid over the map block's hairline rather than room anything could
  use, and the 8px at 1280x720 was the same understatement not yet spent.
  Correcting both floors and paying for the honest sum out of that gutter at
  short viewports leaves 7.8px that is all real: the same run reports the
  catalogue holding exactly its own content and the panel unscrolled on
  arrival. Not to be confused with the 3.8px that used to be recorded in
  `hud.css` as residual catalogue slack, which was that same understatement
  seen from the other side and is gone.
  Had the button needed rail height, the answer would have been the disclosure
  Export sits behind rather than a relaxed `min-height: 25%`: that floor is
  documented in `hud.css` as the wrong lever, since dropping it leaves this
  panel a 41.1px box over 240px of content.

`describeSaveResult` maps each failure code to its **own** state and
advice, satisfying "quota, private-mode and transaction-abort errors are
distinct recoverable states" — quota tells the player to free space,
abort tells them to retry, and both state that the previous save is
intact (a guarantee the repository genuinely provides). A storage-open
failure (private browsing with IndexedDB blocked) is caught in `main.ts`
and degrades to a playable-but-unsaveable session rather than a blank
screen.

**The round trip is asserted through the player's own path.**
`tests/determinism/snapshot-restore-fidelity.test.ts` has proven the
serialization layer round-trips since long before this control existed — which
is precisely why the missing piece was reachability, not fidelity. So the guard
for #287 is in `tests/browser/app-shell.spec.ts`: play a session, pause, save,
Export (a real download), create a second empty prison, Import the downloaded
bytes through a real file chooser, then Save now — which captures from the
worker the import restored into — and Export again. The final payload equals
the exported one, so what the second worker holds is what the first one wrote.
The second prison is what keeps that non-vacuous: it is day one, tick zero, so
an Import that did nothing would leave the comparison against a fresh prison.
Elapsed simulation time is the distinguishing state because a player can
produce it with one press; laying a wall would not do, since with no materials
bought the order is refused and both saves' construction sections are empty
(measured).

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
