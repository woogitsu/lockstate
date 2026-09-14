# What the saves panel may say (#1168)

Evidence for building a saves panel in the new "Zarządzaj" section without
shipping a sentence the code cannot prove. `AGENTS.md`'s fourth reservation
governs this (the wording of a player-visible string is ours since
2026-09-04; its truth is not), and the new constitution's article 5 —
*"Nigdy nie obiecuj synchronizacji w chmurze bez wdrożonego przepływu"*, never
promise cloud sync without an implemented flow — is the same rule stated by
the delivery. Every claim below was opened, not inferred; `file:line` cites
code, quotes cite prose. Checked against the tree at `08ea9dd7` (v0.0.597) in
worktree `/workspace/saves-truth`.

> **2026-09-14 correction — re-verified before landing, one claim is now
> stale and the rest re-checked hold.** This document was written and cut
> the same day as, but before, `5d36d740` — *"feat(save-panel): ask before a
> prison is destroyed (#1142)"* — merged. §5's `#1142` finding, quoted below,
> is the claim that broke:
>
> > **Verified true, at both layers checked.** ... One layer up,
> > `SavePanel.requestDelete(prisonId)` (`src/ui/save-panel.ts:797-804`)
> > calls `this.controller.deletePrison(prisonId)` and, on return,
> > unconditionally sets `save.status.deleted`. Nothing between the row's
> > Delete control and the write asks a second question.
>
> **That is no longer true of `SavePanel`.** `requestDelete` now only arms a
> confirmation — `public requestDelete(arming: DeleteArming): void { this.armedDeletion = arming; this.renderDeleteConfirmation(); ... }`
> (`src/ui/save-panel.ts:1003-1010`) — and issues no storage call at all; the
> destructive press moved to a new method, `confirmDelete(prisonId)`
> (`src/ui/save-panel.ts:1029-1050`), reached only through
> `pressDeleteConfirmation` (`src/ui/save-panel-delete.ts`, out of scope for
> this pass to touch or re-open) refusing every `prisonId` that does not match
> the one armed. The method's own docblock now quotes the pre-#1142 shape
> verbatim as history: *"One press of a row's Delete control and the prison
> was gone ... nothing in between that could have been read, hesitated over
> or refused. That is the whole of issue #1142."* So the panel layer this
> document found unconditional is now gated by a confirmation row
> (`renderDeleteConfirmation`, `src/ui/save-panel.ts:814-864`) with its own
> Confirm/Cancel controls and focus handling.
>
> **What is unchanged, and still true exactly as written below.**
> `PrisonSaveRepository.delete(prisonId)` (`src/persistence/local/repository.ts:467-476`)
> is still unconditional at the repository layer — deleting every retained
> generation and the slot metadata in one transaction with no confirmation
> argument — which is precisely the shape `confirmDelete` now calls into
> *after* the panel-level gate passes. So the repository-layer half of §5's
> `#1142` paragraph is correct as measured; only the "nothing between the
> row's Delete control and the write asks a second question" clause is false
> of the tree today. §6 item 3 — "Add a confirmation step in front of delete
> ... before wiring delete into the new panel" — is therefore **done** at the
> `SavePanel` layer already; a saves panel in "Zarządzaj" that reuses
> `SavePanel`'s existing controls inherits the confirmation for free and does
> not need to build one.
>
> **§4's `#1143` finding (`MemoryLocalSaveStore` does not serialise
> overlapping `readwrite` transactions) was re-checked against
> `src/persistence/local/memory-store.ts` on the current tree and is
> unchanged, line-for-line: `runTransaction` still spans `:15-69`, still
> snapshots into fresh `Map`s at call time and still replaces the store
> wholesale on commit.** Not re-reproduced by script in this pass — this pass
> is documentation-only and the file is one of the two other agents' named
> surfaces this session was told to stay out of — but the code shape the
> original reproduction relied on has not moved.
>
> **§§1–4's remaining `file:line` citations were spot-checked, not
> exhaustively re-walked**, because `src/content/default-locale-en.ts` and
> `src/ui/save-panel.ts` have both grown since 2026-09-13 (new confirmation
> strings, new methods) and most line numbers below have drifted upward as a
> result — e.g. `save.list.item` is `default-locale-en.ts:3161` today, not
> `:3134`; `save.status.deleted` is `:3202`, not `:3175`. The *keys* named
> throughout (`save.list.item`, `save.list.empty`, `save.status.saved`,
> `save.status.deleted`, `save.status.no-readable-generation`,
> `save.failure.load`, `save.status.changed-elsewhere`, and the two
> `save.status.quota-exceeded` / `save.status.transaction-aborted` pair) all
> still exist with the same wording, checked by name rather than by line.
> §§2–3's account-module and cloud-unreachability claims were re-checked and
> hold unchanged: `grep -rn "createClient\|VITE_SUPABASE" src/` still returns
> nothing, and no `'account.` or `'cloud.` locale key exists yet.

## 1. The sentence inventory, first — it decides what gets built

| Panel state | Can a true sentence be written today? | What makes it true |
| --- | --- | --- |
| Saves listed | **Yes.** | `PrisonSaveRepository.list()` (`src/persistence/local/repository.ts:433`) returns every validated `PrisonSlotMetadata`; `save.list.item` (`src/content/default-locale-en.ts:3134`, `'{name} ({count} gen)'`) already renders one row per prison and is mounted today via `SavePanel` (`src/main.ts:3418`). |
| No saves | **Yes.** | `save.list.empty`: `'No prisons yet.'` (`src/content/default-locale-en.ts:3133`), rendered whenever `list()` returns `[]`. |
| Storage blocked | **Yes, for the two classified causes; not for a third.** | `save.status.quota-exceeded` and `save.status.transaction-aborted` (`src/content/default-locale-en.ts:3142-3147`) are true of `classifyStoreError`'s two classified codes (`src/persistence/local/errors.ts`). `save.status.list-unreadable` (`:3163`) already covers the *list* boundary and is deliberately worded around two causes rather than asserting one — see item 5 below on why it no longer says "storage is unavailable" outright. A third cause — private-mode `indexedDB.open` throwing — is reasoned about but unverified in this environment (`docs/PERSISTENCE.md:1869-1876`, "Private-mode behavior remains unverified"); a sentence claiming to explain *that* specific cause would be unproven, but the existing wording does not attempt to. |
| Save in progress | **Yes.** | `save.status.saving`: `'Saving…'` (`:3168`), set by `SavePanel.requestSave` before awaiting `controller.saveNow()` (`src/ui/save-panel.ts:770-772`). |
| Save confirmed | **Yes, and only after the write returns — never optimistically.** | `save.status.saved`: `'Saved (generation {generation}).'` (`:3137`), only reached through `describeSaveResult` (`src/ui/save-panel.ts:146-153`) on `result.ok === true`, which `writeGeneration` only returns after the IndexedDB transaction has committed (`src/persistence/local/repository.ts:549-661`). This is exactly what article 14 of the constitution requires (*"Nie mów 'zapisano', zanim zapis zostanie potwierdzony"* is article 5's version of the same rule; article 14: *"Każda późniejsza zmiana... unieważnia potwierdzenie zapisania bieżącego stanu"*) and it is already how the panel behaves — nothing to build here, only to preserve. |
| Load failed | **Yes, but the existing wording is deliberately incomplete about *why*, and that incompleteness is itself proven correct.** | `describeLoadFailure` (`src/ui/save-panel.ts:204-211`) distinguishes `not-found` from `no-valid-generation`; `save.status.no-readable-generation` (`:3171-3172`) says *"Every retained copy failed validation"* — which `docs/PERSISTENCE.md`'s "What the player is told, and what has not changed" section (around line 2265) confirms is deliberately silent on *which* of two save-side refusal reasons applied, because that distinction is "a product question and a new promise" left open. A code-fault load (`restore-code-fault`) now throws and is rendered by `save.failure.load` (`'Loading failed: {detail}'`, `:3197`) rather than by the "every copy failed validation" sentence — so the two are not conflated, per `docs/PERSISTENCE.md:2265-2274`. |
| Delete confirmed | **Yes.** | `save.status.deleted`: `'Prison deleted.'` (`:3175`), set unconditionally after `controller.deletePrison(prisonId)` resolves (`src/ui/save-panel.ts:797-804`). See §5 below: this is true of what the code does, and what the code does is the thing #1142 flags. |
| Cloud unavailable | **No key exists, and none should be authored until the reason is real.** | No `account.*` or `cloud.*` key exists anywhere in `src/content/default-locale-en.ts` (`grep -n "'account\.\|cloud" src/content/default-locale-en.ts` returns nothing). The four account modules that would drive such a sentence exist and compute a real, non-trivial answer (`applies: false`, `sync: 'local-only'`, `sync: 'cloud-only'`, etc. — see §3), so the *reason* a panel could give is not invented; only the string is not authored yet, correctly, because `AGENTS.md`'s fourth reservation and article 5 both require the code to be wired before the sentence ships. The one sentence this pass would license, if a later agent authors it, is one that names an unimplemented flow as unimplemented (e.g. "cloud saves are not available yet") — never one that describes a working sync, a pending upload, or a conflict, because nothing produces those states at runtime (§3). |
| Signed out | **No key exists, and the honest state to render is "no cloud identity", which is what `local-only` already means.** | `AccountSessionState`'s `local-only` variant (`src/ui/account/account-session.ts:54`, with four `LocalOnlyReason`s: `never-signed-in`, `signed-out`, `sign-in-failed`, `session-expired`) is exactly this state, computed and total. But there is no effectful caller anywhere in `src/` that calls Supabase auth to produce a *real* transition into or out of it (§3), so a panel wired to this reducer today would show it permanently pinned at `local-only, reason: 'never-signed-in'` — a true sentence ("you are not signed in") but a static one, since nothing can currently make it otherwise. Authoring "Sign in" as a pressable control would be the trap article 5 names: a control implying a flow that does not exist. |

**The owner's ruling — "mount what is true now": local real, cloud rendered
unavailable with the reason, no control implying a flow that does not
exist** — is achievable today without inventing anything, because the
`local-only` / `applies: false` shape *is* the true state, not a placeholder
for one. What is not achievable today is any state that implies a cloud
identity was ever established, a push was attempted, or a conflict was
found — because no code path produces those at runtime (§3). A first slice
(§6) is therefore bounded by the states in the table above where the answer
is "Yes", plus one honestly-static cloud-unavailable sentence.

## 2. The four account modules: what they compute, and what has no producer

All four live in `src/ui/account/` and are read-only in this pass (untouched).

- **`projectSaveList`** (`src/ui/account/save-list-projection.ts:232-248`) folds
  local slot metadata and cloud metadata into `SaveListRow[]`. Its inputs
  (`SaveListProjectionInput`, `:117-129`): `account: AccountSessionState`,
  `local: readonly PrisonSlotMetadata[]`, `cloud: readonly
  CloudPrisonMetadata[]`, `connectivity: 'online' | 'offline'`, an optional
  `failures` map. `local` has a real producer today —
  `PrisonSaveRepository.list()` (`src/persistence/local/repository.ts:433`).
  `account`, `cloud`, `connectivity` and `failures` have **no producer
  anywhere in `src/`** — nothing constructs a live `AccountSessionState` other
  than the reducer's own initial constant, nothing reads a real cloud index
  (the type `CloudPrisonMetadata`, `:38-43`, is declared structurally in this
  file specifically so it need not import `src/persistence/cloud/`, per its own
  docblock, `:21-26`), nothing observes real network connectivity for this
  purpose, and nothing records a push failure. Called with `account:
  {kind:'local-only', reason:'never-signed-in'}`, `cloud: []`, this function
  still runs correctly and returns rows with `availability: 'local-only'`,
  `sync: 'local-only'` for every local prison — which is the true state, not a
  stub.
- **`projectCloudSlotAvailability`** (`src/ui/account/cloud-slot-availability.ts:62-80`)
  needs `account`, an optional `EntitlementProjection`, `usedCloudSlots:
  number`, `now: number`. `account` has the same no-producer gap as above.
  `projection` is read from a real, tested cache
  (`loadCachedEntitlementProjection`, in `src/services/entitlements/`) — that
  half exists — but the projection itself is only ever populated by a
  verified server read that nothing calls (see §3). `usedCloudSlots` has no
  producer (it would come from the same unreachable cloud index
  `projectSaveList` needs). Called with `account: local-only` and `projection:
  undefined`, it correctly returns `applies: false, capacity: 5 (BASE_SAVE_SLOTS,
  src/services/entitlements/products.ts:24), canCreateCloudSlot: false,
  trust: 'base'` — again the true state of a device that has never had a
  cloud identity, not a placeholder.
- **`loadAccountPreferences`** (`src/ui/account/account-preferences.ts:68-88`)
  needs only a `KeyValueStore`. This is the one module of the four with a real,
  wired producer available in the codebase — `src/input/storage.ts` is
  exactly this abstraction and `src/main.ts:431` already passes one into
  `WorldScene` for an unrelated preference (cited in
  `docs/VISUAL_IDENTITY.md:222-226`) — but nothing in `src/` currently
  constructs an `AccountPreferences`-scoped store or calls this function
  outside tests. Wiring it needs no new mechanism, only a call site.
- **`applyAccountEvent`** / `AccountSessionState`
  (`src/ui/account/account-session.ts:146-205`) is a total, pure reducer over
  `AccountEvent`. Its effects (`AccountEffect`, `:81-88`) —
  `begin-anonymous-sign-in`, `begin-identity-link`,
  `refresh-entitlement-projection`, `refresh-cloud-save-index`,
  `discard-local-saves` — are *descriptors*, by design (`:76-80`: "so the
  whole machine stays a pure function"). **None of the five effects has an
  interpreter anywhere in `src/`.** `docs/CLOUD_SAVE.md:219-226` confirms this
  in its own words: *"the reducer for that account state now exists... and
  says outright that it 'does not talk to Supabase'; the effectful caller that
  would actually call `createClient`, `signInAnonymously` or `linkIdentity`
  still does not exist in `src/` at all."*

**What has no producer, stated plainly rather than per-module:** a live
`AccountSessionState` beyond its own initial constant, a live cloud prison
index, live connectivity, live sync-failure records, a live
`EntitlementProjection` from a verified server read, and an interpreter for
any of the five `AccountEffect`s. Everything else — local slot metadata,
recovery/conflict arithmetic, the free-tier capacity number, preference
storage — has a real producer today.

## 3. What is true of the cloud half right now, verified by grep

- **No module under `src/` calls `createClient`.** `grep -rn "createClient" src/`
  matches nothing. The two modules that name the SDK type it only:
  `src/services/entitlements/client.ts:1` and
  `src/persistence/cloud/supabase-client.ts:1` both read
  `import type { SupabaseClient } from '@supabase/supabase-js'` — a
  type-only import contributes no code to the bundle (confirmed by
  `docs/CLOUD_SAVE.md:196-202`, which states the same of the whole
  `src/persistence/cloud/` tree from the two Vite entry points).
- **`VITE_SUPABASE_*` is read by nothing under `src/`.**
  `grep -rn "VITE_SUPABASE" src/` returns nothing at all — not even inside
  `src/persistence/cloud/`, whose own client reads no environment variable in
  its current form (`grep -n "VITE_SUPABASE\|import.meta.env\|createClient(" src/persistence/cloud/*.ts`
  is empty). The only places `VITE_SUPABASE_*` appears in the repository are
  `tests/foundation/deploy-secret-gate-contract.test.ts` (a *deploy-secret*
  gate that validates what CI's environment would need if it existed) and
  `tests/foundation/documentation-claims-contract.test.ts:633`, whose own
  assertion (`:624-640`) is the one that would fail the day this changes: it
  greps every source file for `import.meta.env`, `VITE_SUPABASE` or
  `createClient(` outside `src/persistence/cloud/` and requires the result to
  be empty, with a failure message that reads *"a module outside
  src/persistence/cloud/ now reads Supabase configuration. That is cloud save
  becoming reachable, which is a real milestone"*. So the "no producer"
  finding above is not merely unmeasured, it is a standing gate.
- **`projectCloudSlotAvailability` with no session returns the honest base
  state, not a placeholder.** Traced in §2: `applies: false`, `capacity: 5`,
  `canCreateCloudSlot: false`, `trust: 'base'`. There is no code path in which
  it silently claims a cloud identity that is not there.
- **`tests/foundation/trusted-tier-reachability-contract.test.ts`** is the
  second gate (named in `docs/CLOUD_SAVE.md:224-232`): it fails if the
  production import graph ever reaches `src/persistence/cloud/` or the
  as-yet-unwritten effectful account caller. Both gates exist precisely so
  that wiring cloud save is a decision that has to edit this document and
  `docs/ARCHITECTURE.md` in the same change, not a a change that slips in
  silently — which is the mechanism that makes "the cloud half is unreachable
  today" a durable claim rather than a snapshot.

**Conclusion for the panel:** a "Zarządzaj" saves panel that renders the cloud
half today has exactly one true thing to say about it — that it is not
available, because no code path can reach Supabase and no account transition
is ever driven by anything but the reducer's own initial state. It has
nothing true to say about a specific reason (quota, network, plan) because
none of those is ever the actual cause here — the actual cause is "not
wired," full stop, and only that sentence is provably true.

## 4. What is true of local saves right now

- **Repository surface**
  (`src/persistence/local/repository.ts:433-1168`): `list()` (`:433`),
  `create()` (`:442`), `delete(prisonId)` (`:467`), `save(prisonId, envelope,
  expectedRevision?)` (`:507`), `loadCurrent(prisonId, options?)` (`:702`),
  plus `demoteGeneration`, `quarantineGeneration`,
  `releaseQuarantinedGeneration`, `confirmGeneration`, `exportSave`,
  `importSave`, `markPendingSync`, `clearPendingSync`. All are covered above.
- **A slot** is `PrisonSlotMetadata` (`src/persistence/local/store.ts:29-59`):
  `prisonId`, `gameVersion`, an optional `displayName`, `currentGenerationId`
  (`undefined` until the first successful save), an ordered `generationIds`
  window, `createdAt`/`updatedAt` timestamps, an optional `pendingSync`, and
  an optional `currentRevision`. **A save carries a name** only in the loose
  sense of `displayName` on the slot (player-chosen or absent — nothing
  requires one); it does **not** carry a "prison identity" beyond that and the
  `prisonId` itself — there is no separate name/portrait/seed-derived identity
  field on the slot or in the envelope beyond what
  `docs/PERSISTENCE.md`'s envelope shape lists (`prisonId`, `gameVersion`,
  `revision`, `createdAt`, `updatedAt`, `checksum`, `payload`). A save **does**
  carry a version — both the slot's `gameVersion` string and the envelope's
  own `saveSchemaVersion` (currently 5, `docs/PERSISTENCE.md:14`). A save
  **does** carry a timestamp: the slot's `createdAt`/`updatedAt`
  (`store.ts:37-38`) and the envelope's own (`docs/PERSISTENCE.md:19-20`).
- **What the panel could show without computing anything new:** per prison —
  display name (or none), how many generations are retained
  (`readableGenerationIds(slot.generationIds).length`, already used by
  `projectSaveList`'s `recoveryOf`, `save-list-projection.ts:139-142`), last
  played (`updatedAt`), and whether it is recoverable
  (`PrisonRecoveryStatus`, `'none' | 'recoverable' | 'no-readable-generation'`,
  `save-list-projection.ts:81-86`) — all derivable from `list()` alone, with
  no new computation and no cloud input.
- **Delete is destructive and immediate** —
  `src/persistence/local/repository.ts:467-476`: reads the slot, deletes every
  generation it references, then deletes the metadata record, inside one
  `readwrite` transaction, unconditionally. See §5.
- **Concurrency**: `PrisonSaveRepository.writeGeneration` enforces optimistic
  concurrency on `revision` inside the same transaction that reads it
  (`repository.ts:549-560`, comment at `:561-568` confirms *"IndexedDB
  serialises the transaction, so the read and the write below cannot be
  interleaved by another writer"*), refusing with `'stale-revision'` on a
  mismatch and reaching the player as `save.status.changed-elsewhere`
  (`save-panel.ts:159-167`; the sentence is the owner's own words, ADR 0109
  Decision 5, ruled 2026-09-11). This is real and already wired.

## 5. The two traps the issue names, checked

### #1142 — delete has no confirmation

**Verified true, at both layers checked.**
`PrisonSaveRepository.delete(prisonId)` (`src/persistence/local/repository.ts:467-476`)
is unconditional: given a `prisonId` it exists, it deletes every retained
generation and the slot metadata in one transaction, no argument or flag for
"are you sure," no dry-run. One layer up,
`SavePanel.requestDelete(prisonId)` (`src/ui/save-panel.ts:797-804`) calls
`this.controller.deletePrison(prisonId)` and, on return, unconditionally sets
`save.status.deleted`. Nothing between the row's Delete control and the write
asks a second question. `src/persistence/session/session-controller.ts:1053-1070`
(`deletePrison`) adds locking against a concurrent capture/save for the same
prison, not a confirmation gate. So #1142's claim is exactly the state of the
code today: a saves panel that reuses this path inherits an unconfirmed,
irreversible delete unless a confirmation step is added at the UI layer —
which is new UI, not something the code already half-does.

### #1143 — `MemoryLocalSaveStore` does not serialise overlapping readwrite transactions

**Verified true, and demonstrated rather than merely read.**
`MemoryLocalSaveStore.runTransaction` (`src/persistence/local/memory-store.ts:15-69`)
clones `this.metadata`/`this.generations` into fresh staging `Map`s **at the
moment each call starts** (`:25-26`), lets `work(tx)` run against those private
copies, and on a successful `readwrite` call **replaces the store's entire
`metadata`/`generations` maps wholesale** with its own staging maps
(`:61-66`: `this.metadata.clear(); for (...) this.metadata.set(...)`). Nothing
here queues a second `readwrite` call behind a first, and nothing merges two
transactions' writes — the second transaction to *finish* wins in full,
discarding anything the other one committed in the meantime, even to
unrelated keys.

This was reproduced directly rather than only read (script run from this
worktree): two overlapping `runTransaction('readwrite', ...)` calls were
started back to back with no `await` between them — one writing prison
`p1`'s metadata immediately, the other writing a *different* prison, `p2`, after
an artificial 10 ms delay. Because both calls snapshot the store's state
before either commits, transaction A's write to `p1` was already committed
when transaction B (whose staging maps still held the pre-A state) finished
and clobbered the whole `metadata` map with its own copy. The result read
back afterward showed `p1` reverted to its state from *before* transaction A
ran (`updatedAt: 0` instead of A's `updatedAt: 1`, `currentGenerationId`
missing rather than `'gen-A'`), even though A's write had already succeeded
and even though A and B never touched the same key.

**What a test written against this fake would and would not prove:**

- It **would** prove that `PrisonSaveRepository`'s policy logic — retention,
  the stale-revision comparison, demotion/quarantine ordering — behaves
  correctly for a *single* in-flight write at a time, because every existing
  policy test in `tests/unit/persistence-local-repository.test.ts` awaits one
  `runTransaction` call before issuing the next, and the fake is faithful to
  real IndexedDB semantics under that discipline.
- It would **not** prove that two genuinely concurrent writers are serialised
  the way a real IndexedDB transaction serialises them. The repository's own
  comment (`repository.ts:561-568`) states the real guarantee it relies on —
  *"IndexedDB serialises the transaction, so the read and the write below
  cannot be interleaved by another writer"* — and that guarantee is exactly
  what this fake does not provide: it is weaker than real IndexedDB, not
  merely a simplification of it, because the real backend would queue B
  behind A on the same object store and B would then read A's committed
  write, while this fake lets both proceed from the same stale snapshot and
  then has the loser's *entire* commit silently overwrite the winner's. A
  hypothetical test asserting "two overlapping saves against different
  prisons never clobber each other" would be **false positive** if it
  happened to interleave the other way (A's staging built after B committed),
  and is a genuine, reproduced race rather than a theoretical one — so any
  future concurrency test written against `MemoryLocalSaveStore` proves at
  most "the policy layer's logic is correct given atomic storage," never
  "the storage layer is safe under real concurrent writers." `docs/PERSISTENCE.md`
  already draws this line for a different pair of writers (real
  `WorkerPerSessionHost`, browser-only, "Two writers, and what each token
  answers"), and this finding is the store-fake's version of the same
  boundary.

Neither trap is fixed by this pass — both are read-only findings, as the brief
requires.

## 6. What a first slice should be, and what it must not claim

**A defensible first slice**, entirely licensed by §1's table:

1. Mount a saves list in the new "Zarządzaj" section driven by
   `PrisonSaveRepository.list()` directly (no new computation), rendering the
   existing `save.list.item` / `save.list.empty` keys, plus per-row recovery
   status computed the same way `projectSaveList`'s `recoveryOf` already does
   (`save-list-projection.ts:139-142`) — this needs no cloud input at all, so
   `projectSaveList` can be called with `account: INITIAL_ACCOUNT_SESSION_STATE`
   and `cloud: []` and every row still reports its true `local-only` state
   (§2). Using the existing pure function rather than re-deriving the fold is
   what `docs/AGENT_WORKFLOW.md` §3's "look one module over before designing"
   asks for.
2. Wire save/load/export/import through the existing `SavePanel`
   controller calls and existing catalogue keys — nothing here is new
   product surface, only a new mounting location.
3. Add a confirmation step in front of delete (closing #1142's actual gap —
   §5 established there is none today), before wiring delete into the new
   panel; the underlying `deletePrison` call itself needs no change.
4. Render the cloud column as unavailable, with one sentence that says only
   what is true: cloud saves are not implemented yet. This needs a new
   locale key (none exists — §1), which this pass deliberately does not
   author, per the task's own instruction not to author new player-facing
   strings.

**What it must not claim**, because nothing in `src/` makes it true today
(§§2–3): a sign-in control that does anything (no effect interpreter exists
for any of the five `AccountEffect`s); a "your saves are backed up" or
"syncing" sentence of any kind; a specific reason for cloud unavailability
(no quota, no plan, no network check exists — the only true reason is "not
wired"); a save-count or capacity number sourced from `usedCloudSlots` (no
producer); and an unconfirmed delete control, which is not a *new* claim but
an existing gap this slice should not carry forward into a more prominent
surface.

## Weakest claim in this pass

The MemoryLocalSaveStore race in §5 was reproduced with a synthetic 10 ms
delay inserted by hand to force the interleaving, not observed as a spontaneous
failure in the existing test suite — the existing policy tests never call
`runTransaction` twice without awaiting the first, so nothing in
`tests/unit/persistence-local-repository.test.ts` currently exercises this
path, and the repository has no code path today that calls
`store.runTransaction('readwrite', ...)` twice concurrently for the same
prison in production use (autosave coalescing at a higher layer,
`AutosaveScheduler`, already prevents that — `docs/PERSISTENCE.md`'s
"Autosave" section — and a single tab's `SessionController` serialises its own
saves). So the defect is real and demonstrated, but its practical exposure in
this codebase today is narrower than "any two saves can race": it is a
property of the test double that would matter the moment a future change adds
a second concurrent caller of the same store instance (e.g., a browser-suite
harness driving two tabs against one in-memory fake, or a future in-process
multi-writer test), and § 5's claim about what such a test would prove is
reasoning about that future case, not a report of an existing false-passing
test in this repository. What would change this assessment: finding an
existing test that does call `runTransaction('readwrite', ...)` concurrently
against `MemoryLocalSaveStore` without awaiting between calls — none was
found by `grep -rn "runTransaction" tests/` followed by inspection, but that
grep was not exhaustive over every call site's timing.
