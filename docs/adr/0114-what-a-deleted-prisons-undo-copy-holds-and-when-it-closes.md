# ADR 0114: What a deleted prison's undo copy holds, and when it closes

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0114, this file, its row and
> every citation of it get renumbered without argument, exactly as ADRs 0110
> through 0113 each pre-committed.
>
> **The arithmetic, performed rather than trusted.** `docs/adr/README.md`'s own
> **Next free number** line reads 0114. Swept 2026-09-14 in this worktree:
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune` (**331
> heads**), then `git ls-tree --name-only <head> -- docs/adr/` read out of
> every one of them, filenames matched against `^[0-9]{4}-` to exclude
> unrelated four-digit substrings (a year in a filename matched a naive scan
> once and was discarded). The highest four-digit prefix on any head is
> **0113**, and nothing at 0114 or above appears on any. 0114 is free. The
> worktree was cut from `origin/main` at `a6565239` (v0.0.600).

## Status

**Accepted by the owner on 2026-09-14, and the one question this document
refused to answer for itself was answered with it.** The `Proposed` block below
is kept rather than replaced, per `docs/AGENT_WORKFLOW.md` §4's rule that a
correction marks both directions: what this document asked before it was
answered is what a later reader needs in order to judge the answer.

**What the acceptance covers as written:** §§1–3, 5 and 7 — the `tombstones`
object store, `DATABASE_VERSION` 1 → 2, `delete()` becoming a move inside the
transaction it already opens, lazy read-time expiry with no scheduler, the fresh
`now() >= expiresAt` check at the press rather than a displayed countdown, and
the rewrite of `save.delete.confirm`'s middle clause in the same commit that
ships the restore path.

**And it closes §6, which this document explicitly declined to close.** §6 named
the quota interaction as *"a UX and content trade-off this document does not
have the standing to make unilaterally"*: an undo window holds bytes, and a
player who deletes a prison **because the game told them to, to free space**
would not free that space until `expiresAt`. Of the three shapes §6 put up — a
shorter window near quota, skipping the tombstone outright, or warning before
confirming — **none was chosen. The ruling is a fourth: the player gets a
visible control in the saves panel that frees a held copy immediately.** So the
trade-off is settled in the direction of keeping the undo promise whole and
handing the player a deliberate way out of it, and slice 1 (§7) must **ship**
that control rather than merely, as §7's last paragraph says, not claim to have
solved the problem.

**The provenance is the weakest this repository has recorded, and saying so is
the point of recording it at all.** `AGENTS.md`'s 2026-09-08, -09 and -10
entries disclose that they quote the label of a clickable option rather than a
sentence the owner typed; ADR 0112 discloses the same of four of its five
rulings. This acceptance is a step weaker again: it reached the implementing
agent **relayed through a written brief** — a paraphrase, and the standing
demonstration of what a paraphrase costs in this repository is the preamble of
`CLAUDE.md`, which has miscounted its own corrections five times. It is written
down because the alternative is an accepted decision that no document says was
accepted. **A later reader who needs the owner's actual words for the "free it
now" ruling should read this block as a pointer to go and ask for them, not as
the quotation.**

---

**Proposed, 2026-09-14. Not self-approved.** *(The state of this document before
the acceptance above.)* The owner ruled on 2026-09-14,
from a clickable option this session wrote and the owner chose:

> **Ruled 2026-09-14:** *"ADR na opcję C, potem budujemy"* ("An ADR for
> option C, then we build.")

That is the weaker kind of provenance — the label of an option this session
wrote, not a sentence the owner typed — recorded here on the same terms
`AGENTS.md`'s 2026-09-08/09/10 releases and ADR 0112's four non-verbatim
rulings disclose their own. **The ruling settles the direction: delete
immediately, hold a restorable copy, allow undo through a time window.
Everything below — the storage shape, the migration, what enforces the
window, what a player is told, and the smallest first slice — is this
document's proposal and the owner's to accept or reject.** No code under
`src/` has changed for this document, and none is touched by it.

**Built on, not redone:** the research record
[*"What an undo window for a deleted prison would cost"*](../research/2026-09-13-what-an-undo-window-for-a-deleted-prison-costs.md)
(issue #1142). It priced four options — defer the deletion (A), hold the copy in memory (B), hold it in
IndexedDB (C), or export it to a file instead (D) — and recommended that C
not be built without an ADR first, because it is a persistent-format change.
Its load-bearing claims were re-opened rather than inherited; where this
document's own reading differs from the research's, the difference is named.

## Corrected 2026-09-14, after PR #1173 merged

**This document was written against `origin/main` at `a6565239` (v0.0.600) and
said, in eight places, that PR #1173 had not merged. It merged the same day, and
every one of those eight sentences is now false.** They are corrected in place
below and listed here so the correction is countable rather than buried, per
`docs/AGENT_WORKFLOW.md` §4 — a paraphrase of a document is not the document,
and a claim that something is *absent* is the sentence form that rots first.

**What was re-measured, not assumed.** `origin/main` is at `19ffb1f5`
(v0.0.606). `a29699ff` is the merge of PR #1173 (*"Merge pull request #1173 from
woogitsu/agent/1142-delete-confirmation"*, 2026-09-14 08:50:00 +0200), and it
carries fourteen files. Read out of `origin/main` directly rather than out of
the merge's diff:

- `src/ui/save-panel-delete.ts` exists (`git ls-tree origin/main -- src/ui/`),
  with `pressDeleteConfirmation` at `:91`, `retainDeleteArming` at `:108`,
  `describeSaveAge` at `:161` and `describeDeleteConfirmation` at `:196`.
- `save.delete.confirm` exists at `src/content/default-locale-en.ts:3287`, and
  `save-panel-messages.ts:154` binds it.
- `'save.action.delete': 'Delete'` has moved from `:3131` to `:3153` — so even
  the coordinate this document cited for the key that *was* there has drifted,
  which is the other half of §4's warning.
- The research record is on `main` at
  `docs/research/2026-09-13-what-an-undo-window-for-a-deleted-prison-costs.md`,
  under a filename this document could not have guessed — it cited the record by
  **title**, and the title and the filename differ ("would cost" against
  "costs"). Citing by title was right for an unmerged file and is why the
  correction is a path rather than a search.

**The eight, and what each now reads:** (1) the "Built on, not redone" citation
above, now a path; (2) the deleted "One premise of the research does not hold on
`main` yet" paragraph, which this section replaces; (3) §3's parenthetical
placing the arming module on an unmerged branch; (4) §5's citation of
`save.delete.confirm`; (5) §5's *"Once PR #1173 merges"*; (6) §7's *"the
unmerged branch's `src/ui/` deletion-confirmation module"*; (7) the References
entry for the research record; (8) the References entry for issue #1142. A ninth
copy of the same claim lives outside this file, in `docs/adr/README.md`'s row for
this ADR, and is corrected there.

**The premise this replaces, and why it is worth naming rather than deleting.**
This section used to open by correcting the *research*: the research said *"the
confirmation shipped on `agent/1142-delete-confirmation`"* and this document
answered that this was true of that branch and not of `main`. **The research was
describing a branch and was right about it; this document was describing `main`
and was right about it for about eleven hours.** The research's sentence is the
one that aged well, because it named the tree it was true of. That is the
lesson, and it is the reason the corrections below name `origin/main` at a
commit rather than saying "today".

## Claim tiers used below

- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **MEASURED** — quoted from a merged research record that says how the
  number was produced (the research's own §3 size figures; its own weakest
  claim admits they were not re-encoded on that tree, and they are not
  re-encoded here either).
- **REASONED** — derived from verified code, without a run behind it.

---

## Context

### What a deletion is today, re-verified rather than repeated

`PrisonSaveRepository.delete(prisonId)` (`src/persistence/local/repository.ts:467-476`,
this tree):

```ts
public async delete(prisonId: string): Promise<void> {
  await this.store.runTransaction('readwrite', async (tx) => {
    const metadata = readSlot(await tx.getMetadata(prisonId), prisonId);
    if (metadata === undefined) return;
    for (const generationId of metadata.generationIds) {
      await tx.deleteGeneration(prisonId, generationId);
    }
    await tx.deleteMetadata(prisonId);
  });
}
```

VERIFIED — one `readwrite` transaction, unconditional, no argument that could
mean "keep a copy." Storage is IndexedDB, database `lockstate-saves`,
`DATABASE_VERSION = 1`, two object stores — `prisons` (keyed on `prisonId`)
and `generations` (out-of-line key `` `${prisonId}:${generationId}` ``)
(`src/persistence/local/indexeddb-store.ts:3-6, :19-34`). `LocalSaveTransaction`
(`src/persistence/local/store.ts:63-81`) is the storage-agnostic interface
both `IndexedDbLocalSaveStore` and the test-only `MemoryLocalSaveStore`
(`src/persistence/local/memory-store.ts:8-10`) implement; `PrisonSaveRepository`
holds all policy against that interface, which is why every change this
document proposes touches both implementations identically rather than one.

**Retention is not simply "three".** `keepGenerations` defaults to 3
(`repository.ts:428`), but `generation-policy.ts`'s own header says the window
may transiently hold one more for an unproven import (#438) and one more again
for a generation quarantined as `unsupported-by-this-build` (#432) — up to
five in the rare combination of both. A restorable copy has to carry
`generationIds` as the slot actually holds it at the moment of deletion, not a
number assumed in advance.

**There is no restore path today**, confirmed independently of the research:
`importSave` writes one generation into a slot that already exists through
`writeGeneration`, which allocates a fresh revision and applies retention
(`repository.ts:1137, :529`), and `create()` stamps `createdAt` from the clock
(`:448-459`). Rebuilding a deleted prison through either would give it a new
creation date and rebuild its generation ladder one eviction at a time. A
restore that is whole has to bypass both.

### `SAVE_SCHEMA_VERSION` is 5, and this proposal does not move it

`export const SAVE_SCHEMA_VERSION = 5 as const;` (`src/persistence/save-schema.ts:36`,
this tree). ADR 0113 (Proposed, unrelated to this document) would move it to
6 for a regime-schedule payload section if accepted; that is orthogonal to
everything below. **Nothing in this document changes the shape of a save
envelope.** The change this document proposes is to `DATABASE_VERSION` in
`indexeddb-store.ts` — a different persisted format, one level below the
envelope, that already has its own version number and its own
`onupgradeneeded` migration mechanism. `docs/PERSISTENCE.md`'s "Storage
backend, compression algorithm, encryption... out of scope per issue #18"
covers *which* engine stores the bytes, not the *shape* of what this
repository asks that engine to hold — the `prisons` and `generations` stores
are exactly that shape, decided in this repository, and a third store is the
same kind of decision.

## 1. What is retained, exactly, for a restore to be whole

**The slot's `PrisonSlotMetadata` record verbatim, plus the envelope for
every id currently in its `generationIds`, verbatim.** Not only
`currentGenerationId`: a player who deletes a prison and then undoes it
should get back a prison that can still recover to an older generation the
way any live prison can, and the retention/quarantine window that produced
those extra ids (#438, #432) is state a partial restore would silently
discard. "Whole" means the restore is indistinguishable from the deletion
never having happened, as far as this repository's own contract for a live
slot goes — same `createdAt`, same `updatedAt`, same `currentRevision`,
same generation ladder, same `pendingSync` bookkeeping (inert today; see
"What this does not decide" below).

Each generation's stored value is opaque as far as the move is concerned —
`getGeneration`/`putGeneration` type it `unknown` (`store.ts:71-72`) precisely
because storage hands back whatever is on disk and `PrisonSaveRepository`
is the layer that validates. Moving it into a tombstone and back is a copy of
bytes, not a re-encode; **restoring re-enters the system exactly where a
freshly-read generation always does** — through `decodeSaveEnvelope`, the
same gate `loadCurrent`'s recovery walk already runs per generation — so a
generation that was already unreadable before deletion (rare, but the
recovery walk exists because it happens) comes back exactly as unreadable
after restore, and this proposal invents no new integrity guarantee and
removes none.

## 2. Where it lives, under what version, what migrates, what tests change

### Two alternatives considered and rejected, with their costs

**A flag on the existing slot record — rejected, and this codebase has
already found the exact reason once.** `prisonSlotMetadataSchema` is
`.strict()` (`src/persistence/local/slot-metadata-schema.ts:96`), and
`PrisonSaveRepository.list()` refuses the **whole list** when one record
fails validation rather than skipping it (`repository.ts:433-440`; the
comment above `requirePrisonSlotMetadata`'s import at `:19` and `:274-275`
says so). `generation-policy.ts`'s own quarantine design already tried this
exact shape for a different fact (#432) and rejected it in writing:

> A quarantine whose price is that a downgrade hides every save is not
> insurance.
> (`src/persistence/local/generation-policy.ts:24-33`, quoted verbatim)

A tombstone flag on `prisonSlotMetadataSchema` reproduces that failure for a
new reason: any build older than the one that adds the field would refuse
every prison a player owns, not just the deleted one, the moment one
tombstoned record exists in `prisons`. This is not `docs/PERSISTENCE.md`'s
"optional field, no version bump" case either — that rule's first condition
is that absence means what an older build already did, and an older build
reading a tombstone flag does not silently ignore it, it throws
`CorruptSlotMetadataError` and takes the whole list down with it.

**A separate database — rejected, on an atomicity argument the research
did not raise.** `IndexedDbLocalSaveStore.runTransaction` opens one
transaction across `[METADATA_STORE, GENERATIONS_STORE]`
(`indexeddb-store.ts`, the `this.db.transaction([...], mode)` call), and a
real IndexedDB transaction cannot span two separate databases. Moving a
prison's records into a second database would need two separate transactions
— one against `lockstate-saves`, one against the new database — with no way
to commit both as one unit. A crash or an interrupted eviction between them
either leaves the original prison **and** a spurious copy (recoverable, but a
false "deleted" reads as displayed if `list()` still refuses to show it — see
below) or deletes the original with the tombstone write still pending
(unrecoverable: the exact defect this ADR exists to prevent). A single
database keeps the whole move — read the metadata and every generation,
write the tombstone, delete the originals — inside the one transaction
`delete()` already opens, which is the property that makes it safe at all.

### The proposed shape

One new object store, `tombstones`, in the existing `lockstate-saves`
database, keyed on `prisonId`:

```ts
interface TombstoneRecord {
  readonly prisonId: string;
  readonly metadata: PrisonSlotMetadata;               // the deleted slot's own record, verbatim
  readonly generations: ReadonlyArray<{
    readonly generationId: string;
    readonly value: unknown;                            // exactly what getGeneration returned, unvalidated here
  }>;
  readonly deletedAt: number;                           // this.now() at the moment of delete()
  readonly expiresAt: number;                           // deletedAt + the window length (a content decision, not made here)
}
```

`DATABASE_VERSION` moves `1 → 2`. `openLockstateDatabase`'s `onupgradeneeded`
gains a third guarded branch, on the same idiom the existing two already use:

```ts
if (!db.objectStoreNames.contains(TOMBSTONES_STORE)) {
  db.createObjectStore(TOMBSTONES_STORE, { keyPath: 'prisonId' });
}
```

**No data migration is needed.** The new store starts empty for every
existing player; nothing that exists today has to be reshaped into it, which
is the same "absence is unambiguous, because nothing could have written one
yet" argument `docs/PERSISTENCE.md` makes for `masterSeed` and
`intelligenceSequence` — applied here to an IndexedDB object store instead of
a save-payload field, one level below where that document's rule is stated
but the same reasoning. The `if (!contains)` guard is exactly the idiom
`openLockstateDatabase` already uses for the two existing stores, so a player
whose browser somehow runs this upgrade twice (a defensive case IndexedDB's
own spec asks for) is unaffected.

`LocalSaveTransaction` (`store.ts:63-81`) gains four methods —
`getTombstone`, `putTombstone`, `deleteTombstone`, `listTombstones` — mirroring
the existing metadata/generation methods' shape exactly. **Both
implementations change, not one**: `IndexedDbLocalSaveStore` adds
`TOMBSTONES_STORE` to its transaction's store list and implements the four
methods against real `IDBObjectStore` requests; `MemoryLocalSaveStore` adds a
third `Map` and mirrors them, on the same staged-copy-then-publish pattern its
`metadata`/`generations` maps already use (`memory-store.ts:9-10` and the
`readwrite` staging block below them) — the "fix the class, not the instance"
rule `AGENTS.md` states, applied to a change that adds a class member rather
than repairing one.

### What existing tests change, and what does not

**`list()`'s observable contract is untouched.** `tests/unit
/persistence-local-repository.test.ts:45-53` ("creates, lists and deletes
prison slots") and `:62-64` ("deleting an unknown prison is a no-op") both
assert against `repo.list()`, which reads only the `prisons` store; a
tombstone in a new, separate store is invisible to it and both tests pass
unmodified. New tests are added beside them: `delete()` now writes a
tombstone the caller can read back with a new `listTombstones` before the
window closes, and a `restoreFromTombstone` round-trip test. `tests
/integration/persistence-local-indexeddb.test.ts` gains an upgrade-path test
— open a v1 database, close it, reopen it at v2, assert `prisons` and
`generations` content survived untouched and `tombstones` exists and is
empty — on the same shape its existing `openLockstateDatabase` reconnection
test already uses (`:145-151`).

## 3. When it expires, and what actually enforces that

**There is no scheduler in this application, and that is not this document's
gap to fill — it is a fact to design around.** Checked directly: no
`setInterval` appears in `main.ts`, `save-panel.ts`,
`session-controller.ts` or `repository.ts`; the one `setInterval` reference
in `main.ts:1295` is a comment about the render loop's own cadence, and the
one `setTimeout` at `main.ts:3608` is the telemetry consent pump's idle-callback
fallback, unrelated to saves. `SavePanel.refresh()` (`save-panel.ts:653`) is
called after every action that changes the list — create, delete, load,
import, export — and (by construction, since the panel has to show something
on mount) once at startup; nothing calls it on a timer.

**Proposed enforcement: lazy, at read time, not a live countdown.** A
`listTombstones()` call — from `PrisonSaveRepository`, wrapping the store
method of the same name — sweeps as it reads: any tombstone with
`now() > expiresAt` is deleted in the same pass and excluded from what is
returned, rather than returned and filtered by a caller. This rides two
existing call sites with no new one needed for correctness: the save panel's
own `refresh()`, which already runs at every mount and after every action,
and (proposed, new) one sweep at `SessionController`'s construction, so a
tombstone does not linger an entire extra session merely because the player
never opened the save panel. This is the same shape
`docs/PERSISTENCE.md`'s `SafetyCoverageSystem` census precedent uses for a
different kind of derived fact — *"derived state is recomputed... and
recomputed by the restore itself where a paused session would otherwise show
the underived value"* — applied to expiry instead of a census: the fact
("is this tombstone still good") is recomputed from stored timestamps
wherever it is read, never carried by a running clock.

**The actual gate on a restore is a fresh check at the press, not whatever a
countdown last displayed.** `restoreFromTombstone(prisonId)` reads the
stored `expiresAt` and compares it against `now()` at the moment it runs,
refusing (and deleting the tombstone as it refuses) if the window has
closed — mirroring `pressDeleteConfirmation`'s own discipline
(`src/ui/save-panel-delete.ts:91`; **this read "on the unmerged
`agent/1142-delete-confirmation` branch" until PR #1173 merged**) of re-checking
the subject rather than trusting what an earlier read established. A UI
countdown, if one is built, is a display convenience layered on top; it is
never the source of truth for whether a press succeeds, so a countdown a few
seconds stale can never let a late press through or refuse an early one.

**What a player who closes the tab mid-window gets.** If they reopen before
`expiresAt`, the tombstone is exactly where they left it and undo still
works — this is the property option B could not offer and the reason
option C was priced at all. If they reopen after `expiresAt` — whether by
one minute or by not opening the game again for a month — the copy is swept
at that first read, silently, which is the correct reading of a window that
has closed. **The cost worth naming rather than hiding: a tombstone can
physically outlive its nominal window by as long as the player goes between
sessions**, because nothing sweeps it while no session is open. This is
strictly better than a live `setTimeout`-based countdown that dies with the
tab (which would leave an *unbounded* leaked tombstone rather than one that
is merely cleaned up late), and it is why lazy, read-time expiry is proposed
over a running timer rather than as a cheaper substitute for one.

## 4. What the player is told, at each moment

No strings are authored here, per the reservation on player-facing wording's
*truth* (`AGENTS.md`'s fourth reservation; constitution article 5). What
would make each state's sentence true:

| State | What must be true for the sentence to be true |
| --- | --- |
| Just deleted, window open | The delete-and-tombstone write already committed as one transaction (§2) before the panel says anything, so "you can undo this" is never said speculatively — if that transaction had failed, `delete()` would have thrown and the prison would still be in `list()`, exactly as it does today with no undo feature at all. The sentence may state a bound on the window (a duration, or a time it closes) computed from the stored `expiresAt`, never a vaguer "for a while." |
| Undo control visible, window still open | Any displayed remaining time is informational only; the control's own press re-derives the true remaining time (§3) rather than trusting what is on screen, so the sentence never has to promise more precision than the display actually holds. |
| Window expired (discovered lazily, before any press) | Silence is safe here: the row disappears because `listTombstones()` no longer returns it, and nothing is asserted about a window closing — the one clause `AGENTS.md` §4's "a sentence asserting an absence... rots first" warns about is why no proactive "your undo window has expired" toast is proposed; the row's disappearance is the only fact that needs stating, and it needs no sentence at all. |
| Undo pressed, succeeds | True once `restoreFromTombstone` has actually written the slot metadata and every generation back and the prison reappears in `list()` — and per §1, this restore can honestly claim to be **whole**, unlike a hypothetical restore built on `importSave` (which the research's §1 shows would reassign `createdAt` and rebuild the generation ladder one eviction at a time). The sentence may say the prison came back exactly as it was. |
| Undo pressed, refused because the window closed | True only if the refusal is reached by the same fresh `now() >= expiresAt` check described in §3, and only if the tombstone was in fact deleted as part of that refusal — otherwise the sentence "this prison cannot be restored" would itself be false the instant it is said. |

## 5. The clause that must change, and in which commit

`save.delete.confirm` (`src/content/default-locale-en.ts:3287`, on `main` since
PR #1173 merged as `a29699ff`; **this read "on `agent/1142-delete-confirmation`
at `08e65d4f`, not yet on `main`"** when it was written eleven hours earlier):

> `'Delete {name}? Every saved copy of this prison goes, and this cannot be
> undone. Its saves last changed {age}.'`

**The middle clause — "this cannot be undone" — is the one this ADR makes
false, and it does not become false until the restore path this document
proposes actually ships.** **This paragraph read "Today, on `main`, it is true
(there is no confirmation dialog at all yet, so the sentence does not even exist
as a player-facing string). Once PR #1173 merges, it becomes true of that
tree..." — and the merge it was waiting for happened the same day.** The
sentence is on `main` now and is true there for exactly as long as no undo
mechanism exists, which is what that key's own code comment already says: *"There is no undo mechanism for a deletion
anywhere in `src/`, and the ADR that would decide where a held copy lives
has not been written. The day an undo window ships, this clause is the one
that becomes false and has to be rewritten in the same change."* This
document is that ADR; **the clause changes in the same commit that ships
`restoreFromTombstone` and the panel's Undo affordance — slice 1 below —
not in this document's own commit, which authors no `src/` change, and not
merely because the owner ruled for option C**, since a ruling to build
something does not make the sentence describing the thing built true before
it exists.

## 6. Quota and size

**The affordability question, re-checked rather than re-measured.** MEASURED,
inherited from the research and from `docs/PERSISTENCE.md`: a minimal
envelope is 1,566 bytes; a representative one is ~390 KB canonical JSON
(`docs/PERSISTENCE.md:1785`); issue #102 measured a 3.7 MB save. A held
tombstone carries the slot's own up-to-`keepGenerations` (default 3, plus the
rare +1/+1 named in §1) generations, so the shadow is on the order of the
same range the research already priced, times a small constant. That range —
roughly 5 KB to tens of megabytes for the rare heavily-populated case — is
affordable in isolation, and this document does not revise that half of the
research's finding.

**What the research did not raise, and what re-checking the code surfaces: a
real risk, not an abstract one.** Production has **no proactive quota check
anywhere in `src/`.** `navigator.storage.estimate()` exists only in the
browser test harness (`tests/browser/harness.ts:679`, exercised by
`tests/browser/local-save-quota.spec.ts` against a CDP-capped 4 MB origin) —
`grep -rn "storage.estimate" src/` returns nothing. Quota is discovered only
**reactively**, after a write already failed:
`classifyStoreError` (`src/persistence/local/errors.ts:29-43`) turns a real
`QuotaExceededError` into the `'quota-exceeded'` code, and the player is
told, verbatim (`default-locale-en.ts`, this tree):

> `'save.status.quota-exceeded': 'Storage is full. Delete an old prison or
> export and remove saves to free space. Your previous save is intact.'`

**Option C, built as this document proposes, makes that exact sentence's
promise slower to keep at the exact moment it matters most.** A player who
is at quota and deletes a prison *because the game told them to, to free
space* would — under this design — not actually free that space until
`expiresAt`, because the tombstone holds a full copy for the window's
duration. The player who most needs the freed bytes immediately is the one
this design serves worst. This is not the "does holding a copy double
storage in the abstract" question the research priced and found affordable;
it is "does this defeat the one scenario the product already tells the
player deletion is for," and re-reading `errors.ts` and the quota-exceeded
string together is what surfaces it — it does not appear in either document
read alone.

**This is not resolved here.** Whether a delete performed while the origin
is near quota should shorten the window, skip the tombstone outright, or
warn the player before confirming is a UX and content trade-off this
document does not have the standing to make unilaterally, and it needs a
decision maker's call on which failure mode is acceptable (a shorter undo
promise, or a slower "free space" promise). It is named here as a design
constraint slice 1 (§7) must not silently ignore, not as something this ADR
decides.

## 7. What to build first, and what it must not claim

**The smallest slice that is still honest:** one new object store and its
`DATABASE_VERSION` bump (§2); `delete()` becomes a move — read the slot and
every referenced generation, write one `TombstoneRecord`, then delete the
originals, all in the one transaction it already opens; a lazy sweep on
`listTombstones()` reached from the save panel's existing `refresh()` and
from `SessionController`'s construction (§3); one `restoreFromTombstone`
method with a single window-length constant (its actual duration is a
content decision this document does not make, exactly as `keepGenerations`'s
default of 3 is a policy default `PrisonSaveRepositoryOptions` exposes rather
than a number this kind of document invents); the confirmation string's
middle clause rewritten in the same commit (§5); and the panel wiring for an
Undo affordance following the arming module's existing extraction
discipline (`src/ui/save-panel-delete.ts`, on `main` since PR #1173 — **this
read "the unmerged branch's `src/ui/` deletion-confirmation module"** — pure
functions the `node`-environment test suite can watch, `SavePanel` holding only
the DOM wiring).

**And, per the acceptance recorded in the Status block above, slice 1 also ships
the control that frees a held copy immediately** — the owner's answer to §6's
open question, which this document left for "whoever picks up implementation"
and which was in fact settled before implementation started.

**What slice 1 must not claim:** a live countdown display (§3 — informational
only, never the gate); any interaction with cloud sync, since `#20` is not
implemented in production (`docs/PERSISTENCE.md`: *"Cloud sync (#20) is not
implemented here"*) and a restored prison's `pendingSync` bookkeeping is
therefore inert exactly as it is for every other save path today — whoever
wires #20 will need to decide whether a restored prison's cloud
counterpart (if it ever has one) needs reconciling, and that is not this
document's question to answer; and, most importantly, **a general defense
against the quota risk named in §6**, which slice 1 does not solve and must
not imply it solves merely by shipping.

## Consequences

**If accepted:** `DATABASE_VERSION` in `indexeddb-store.ts` becomes 2, with
the `tombstones` store and its `onupgradeneeded` branch described in §2;
`LocalSaveTransaction` gains four methods, implemented identically in
`IndexedDbLocalSaveStore` and `MemoryLocalSaveStore`; `PrisonSaveRepository
.delete` writes a tombstone before deleting, and gains `listTombstones` and
`restoreFromTombstone`; new tests land in `tests/unit
/persistence-local-repository.test.ts` and `tests/integration
/persistence-local-indexeddb.test.ts` per §2, with the two existing delete
tests unmodified; `save.delete.confirm`'s middle clause is rewritten in the
same commit that ships the restore path, per §5; `SAVE_SCHEMA_VERSION` does
not move. The quota interaction named in §6 is left as an explicitly open
question for whoever picks up implementation.

**If rejected in whole or in part:** the research's options A, B and D remain
the fallback menu — A ships a false sentence and resurrects prisons across a
reload, B ships an undo that vanishes without telling anybody, D is a real,
reload-proof recovery path using mechanisms that already ship (export/import)
but requires a manual player action before deletion and covers only the
current generation. This document is marked not adopted rather than deleted,
per `docs/AGENT_WORKFLOW.md` §4.

**Touches no server entry point, no `wrangler.jsonc`, no
`.github/workflows/`, no `public/_headers`, no dashboard, and no
`supabase/migrations/`.** It is squarely `AGENTS.md` architectural boundary 7
("every persistent format must have a version and migration strategy before
release") applied to the IndexedDB schema rather than to the save envelope,
which is why it is proposed as an ADR rather than decided inside
implementation code.

## The weakest claim in this document

**§6's quota finding is REASONED, not MEASURED.** I verified that
`navigator.storage.estimate()` appears nowhere in `src/`, that
`quota-exceeded` is a real, tested code path (`tests/browser
/local-save-quota.spec.ts` exercises it against a real, CDP-capped origin),
and that the quota-exceeded string tells a player to delete a prison to free
space — but I did not build option C and then reproduce a player at real
quota deleting a prison to test whether the freed-space promise is actually
delayed by a measurable, meaningful amount on a real device, because option C
does not exist yet to reproduce it with. What would change my mind: a
real-device measurement, on the same CDP-capped-origin technique
`local-save-quota.spec.ts` already uses, showing that browsers reliably grant
enough headroom above any one prison's committed size that a full-quota
player deleting their largest prison is not, in practice, the player this
design serves worst — in which case §6's risk shrinks from "the scenario the
product exists to serve" to a rare edge case, and the trade-off in that
section's last paragraph would tilt toward simply shipping slice 1 unmodified
rather than toward flagging it as open.

## References

- [*"What an undo window for a deleted prison would cost"*](../research/2026-09-13-what-an-undo-window-for-a-deleted-prison-costs.md) (issue #1142) — the pricing this document builds on, re-verified rather than repeated. **This entry read "filed under `docs/research/` on branch `agent/1142-delete-confirmation` (PR #1173), not yet on `main`; cited by title rather than by path for that reason"**; PR #1173 merged as `a29699ff` the same day, and the filename it landed under is not the one its title would suggest
- `AGENTS.md` architectural boundary 7 — "every persistent format must have a version and migration strategy before release," the rule this document exists to satisfy for the IndexedDB schema
- [ADR 0038](./0038-what-makes-a-save-compatible.md) — the compatibility rule ("absence is a fact about the save's age... a value the build cannot interpret is a fact about the blob and is refused") whose reasoning §2 extends one layer below the envelope
- [ADR 0109](./0109-what-a-stale-local-save-is-refused-for.md) — the compare-and-swap this document's `restoreFromTombstone` does not disturb, since a restore writes a fresh slot rather than contending with a live one
- `docs/PERSISTENCE.md` — "Adding an optional field without a version bump," the `SafetyCoverageSystem` census precedent §3 reuses for lazy expiry, and the "Storage backend... out of scope" line §2 distinguishes from this document's scope
- Issue #1142 — the deletion defect the confirmation closes on its own (merged as `a29699ff`; **this entry read "unmerged, `agent/1142-delete-confirmation`"**), and the undo window this document prices the mechanism for
- Issue #102 — the 3.7 MB save measurement §6 cites
- Issue #18 — the storage-backend scoping `docs/PERSISTENCE.md`'s "Size hook" section answers to
