# ADR 0065: What happens to a save this build cannot read

> **0065 was assigned centrally**, after this draft returned, which is the
> practice `AGENTS.md` records so that two agents drafting at once cannot take
> one number. The draft deliberately carried **no** number while 0064 was in
> flight on an unmerged branch: the contract in
> `tests/foundation/adr-numbering-contract.test.ts` is `max(on disk) + 1`, and
> a number computed against a tree that is about to gain a higher one is a
> merge-order failure waiting to happen. The arithmetic was then re-derived
> from disk at the moment of writing rather than taken on trust: with #488
> merged — `main` @ `bcba465` (v0.0.154) — `docs/adr/` holds **0064** as its
> highest number, so the next free number is 0065 and the index's line moves
> to 0066. That agreed with the number assigned.
>
> **This document pre-commits to renumbering without argument** if an unmerged
> branch turns out to hold 0065, and every citation of "ADR 0065" added by the
> same branch moves with it.

## Status

**Proposed, 2026-08-28.** Decided under the owner's standing mandate
(`AGENTS.md`, "The owner's standing mandate": research, decide, record — rather
than ask). The implementation landed on `agent/432-keep-unreadable-generations`
ahead of this document, for the reason
[ADR 0038](./0038-what-makes-a-save-compatible.md) and
[ADR 0063](./0063-what-a-refused-restore-says-and-whose-fault-it-is.md) both
give for the same order: the defect is live rather than hypothetical, and this
document is what the branch should be judged against.

**Decision 7 is explicitly *not* decided here.** It is a player-visible
promise, which `AGENTS.md`'s fourth exclusion reserves to the owner, and
nothing on the branch adds a locale key.

## Context

Issue #432, broken out of #403 as its mitigation (c), and the direct successor
to [ADR 0063](./0063-what-a-refused-restore-says-and-whose-fault-it-is.md),
whose **open question 2** is this document's whole subject:

> **Should `unsupported-by-this-build` be retirable at all?** Decision 1 keeps
> today's behaviour, because changing it is #432's subject. But that reason's
> whole meaning is "another build reads this", and deleting it is the one
> deletion quarantine exists to prevent. If #432 lands, this reason is its
> first customer; if it does not, this row deletes saves it has just declared
> readable.

**The premise was verified before anything was built**, because five issues in
a row that day had turned out already fixed or partly stale — #431 among them.
It is not stale. Measured on `main` @ `aefd8fc` (v0.0.153),
`SessionController.loadPrison` collected refusals into a `Set<string>` and
called `PrisonSaveRepository.demoteGeneration` for every member once a
different generation had restored, with no reference to `error.reason` anywhere
in the housekeeping block. So the reason ADR 0063 landed the day before was
declared at the throw site, carried across the worker boundary in the fault's
`details`, narrowed back on the main thread against the closed set — and then
not read by the one decision it was declared for. `demoteGeneration` ends in
`tx.deleteGeneration(...)`.

Two of #403's mitigations already narrow *when* that deletion happens, and
neither changes *what* it does:

- **(b)** `demoteGeneration` refuses to delete the last retained generation.
- **(d)** a refused generation is retired only once a *different* one has
  restored, so a deterministic failure costs nothing at all.

The case they do not cover is the ordinary one: a save this build cannot
restore **and** another generation that restores fine. Today's rules retire the
first correctly — and destroy it.

### What that case actually looks like

A player's browser holds build B-old; the site has since shipped B-new (every
merge to `main` publishes — `docs/DEPLOYMENT.md`, "What currently serves
lockstate.io"). They played on B-new, and then load B-old: a cached bundle, or
a rollback. Their newest generation was written by B-new. B-old refuses it
`unsupported-by-this-build`, falls back to the generation below, and deletes
the newest one. The state B-new left is gone, and the build that could read it
exists.

## Decision

### 1. Retention differs by reason, and only `unsupported-by-this-build` earns it

ADR 0063's three arms now answer this differently:

| Reason | What retirement does |
| --- | --- |
| `unsupported-by-this-build` | **Quarantined** — kept on disk, outside the retention budget, once a different generation has restored |
| `damaged-payload` | Deleted, once a different generation has restored. Unchanged. |
| `restore-code-fault` | Nothing, ever. Unchanged; it is not the class the demotion decision reads. |

The evidence that licenses retirement — another generation restored through the
same code on the same build moments earlier — is equally strong for both
save-side verdicts, and it means opposite things under each.

**Why not keep both, since the obvious objection is the right one.** A
`damaged-payload` verdict is *this build's reading* of the bytes, and a future
build might read them differently too. Some of that reason's arms are
structural invariants this build imposes — a `simulation` section with no
`entities` beside it, a construction section with no `orders` array — and a
later build could in principle relax one. So the argument cannot be that
`damaged-payload` is certainly unrecoverable. It is not.

The asymmetry that settles it is **evidence**, not certainty:

- For `unsupported-by-this-build`, a build that reads the bytes is **known to
  exist — it wrote them.** Recovery is demonstrated; only the shipping is
  pending.
- For `damaged-payload`, no build reads them. Recovery would require someone to
  **write a relaxation, against a check saying the content contradicts
  itself.** Recovery is hypothesised.

And the sentence that makes this a decision rather than a preference: **the
slot is one slot** (decision 3). Quarantine is not a place where things are
kept for free; it is a single retained generation per prison. Spending it on
the hypothesised case **costs the demonstrated one, in the same prison, on the
same load** — the two verdicts arrive together in the same walk, which
`tests/integration/session-restore-failure.test.ts` exercises as one case
precisely so this is not theoretical. There is no allocation of that slot that
serves both, and one of the two claimants has a working build behind it.

**The decision names its own reversal, which is cheaper than being right.** If
a `damaged-payload` check is ever found to be over-strict — if some future
build genuinely does restore a payload this one calls self-contradictory — the
remedy is to **move that throw site to `unsupported-by-this-build`**. One line,
at exactly the place [ADR 0063](./0063-what-a-refused-restore-says-and-whose-fault-it-is.md)
§2 put the decision: *"the reason is decided at the check that refused it,
never at the boundary."* Nothing here has to be revisited, no quarantine rule
widens, and the change is reviewable as a one-line diff at the site that owns
the meaning. The taxonomy is the tuning knob. That is what makes this decision
safe to take now rather than a bet on the future.

### 2. The mark lives in the generation id, and the constraint is load-bearing

The obvious form is a `quarantinedGenerationIds` field on the slot record.
**It is not an implementation preference that it was rejected; it is a
constraint the schema already imposes**, and `docs/PERSISTENCE.md` had written
it down before this issue existed:

`prisonSlotMetadataSchema` is `.strict()`. A slot record written by a newer
build fails validation on an older one, `requirePrisonSlotMetadata` throws
`CorruptSlotMetadataError`, and `PrisonSaveRepository.list()` refuses **the
player's whole prison list** rather than one prison — see "Slot metadata is
validated, and what happens when it is not valid" in `docs/PERSISTENCE.md` for
why refusing is right there and why absent is not a safe synonym for corrupt.

Read the blast radius of that carefully, because it is what makes the
constraint decisive rather than inconvenient: **the saves that become
unreadable are the ones the marked generation has nothing to do with.** Every
prison in the account disappears from the list, including prisons no build ever
refused anything in. A quarantine whose price is that a downgrade hides every
save is not insurance; it is the defect it was built to prevent, generalised
from one generation to all of them.

A generation id is a string this repository generates and nothing else
interprets. `generationIds` is `z.array(z.string().min(1))` at **every version
the slot schema has ever had**, so a marked id — `!unreadable!gen-3` — is a
record an older build reads without complaint, and what it then does with it is
the ordinary thing: offer it to the restore path, be refused, demote it,
exactly as it would have before this change. **Marked or not, a downgrade
behaves identically; only this build keeps more.** That is the whole argument
for the encoding, and it is a statement about the schema rather than about
taste.

The mark therefore costs no `SAVE_SCHEMA_VERSION` bump
([ADR 0038](./0038-what-makes-a-save-compatible.md) governs and #288 prices
one), no slot-schema change and no migration. It costs one rename of the stored
record, performed inside the transaction that rewrites the window so the key
the bytes live under and the id the window holds can never disagree.

`!` is not a character `defaultGenerationId` can emit
(`gen-<base36>-<base36>`), and `writeGeneration` refuses an injected id
carrying the mark — so a generation is quarantined only by having been
quarantined, never by being named.

### 3. The bound is one quarantined generation per prison

Generations are finite and something has to give when the window fills. The
slot is held by the **newest** candidate for it:

| Situation | What happens |
| --- | --- |
| Nothing quarantined | the refused generation takes the slot |
| The same generation refused again on a later load | idempotent; nothing moves |
| A **newer** generation is refused | it takes the slot; the older quarantined generation is **deleted** |
| An **older** generation is refused while a newer one holds the slot | declined (`newer-generation-quarantined`); it stays an ordinary retained generation and ordinary retention evicts it in due course |
| A build **restores** the quarantined generation | the mark comes off, the slot is handed back (decision 5) |
| The prison is deleted | it goes with the rest — it is inside `generationIds`, so `delete()` reaches it |

**What is sacrificed when the bound binds: of two saves this build cannot read,
the older one goes.** The newer one is the more recent state of the prison, and
a build able to read one can generally read both.

The storage ceiling is one extra generation per prison, so the per-prison worst
case rises from `keep + 1` — the import spare slot, #438 — to `keep + 2`: five
records at the default `keepGenerations: 3`. Against `docs/PERSISTENCE.md`'s
measured tiers that is **+42 KiB** at 25 prisoners and **+2.86 MiB** at 3,000,
per prison; under
[ADR 0013](./0013-free-tier-cloud-save-capacity.md) §4's accepted 4 MiB per
stored save version; and at most ~14 MiB of local IndexedDB across the five
free slots. Nothing here reaches cloud storage — this is
`src/persistence/local/` and #20 is unimplemented — so ADR 0013's §5 and §6
proposals are untouched.

### 4. A quarantined generation is exempt from the retention budget

**Ninety seconds.** That is what a quarantine without this decision is worth,
and it is the whole argument.

The retained window evicts from the oldest end on every write. A generation
that merely escaped deletion would be evicted after `keep` further autosaves —
three, at `keepGenerations: 3` and `DEFAULT_AUTOSAVE_INTERVAL_MS` of 30 s, so
**90 seconds of play** — against a fix that ships in weeks. And the player *is*
playing: the entire case this ADR addresses is one where a *different*
generation restored, which means the prison loaded and the autosave scheduler
is running. A quarantine that expires before the player finishes their first
cell block has insured nothing.

So every rule in `generation-policy.ts` skips it. It is not counted against
`keep`, not eligible for eviction by a save, an import or a confirmation, and
not the spare slot an import may take. The player keeps their full complement
of readable saves, and the generation that rotates out is the one that would
have rotated out anyway.

The cost is that a prison carrying a quarantined generation carries it
indefinitely — bounded by decision 3 at one, and released by decision 5 the
moment it stops being true.

### 5. The mark comes off when a build restores the generation

The mark records a verdict — *this build refused these bytes* — and a build
that restores them has falsified it. `releaseQuarantinedGeneration` renames it
back, the generation rejoins the ordinary window, and the slot is free.

It is the same evidence `demoteGeneration` and `confirmGeneration` both
require, spent a third way: only a restore that actually happened moves
anything here. `SessionController.loadPrison` releases **before** the retirement
loop, so decision 3's eviction can never take the generation the session is
running on.

Without this, the metadata would go on asserting a refusal that a later build
had already disproved, and the slot would be held against the next save that
needed it.

### 6. `loadCurrent` still offers a quarantined generation — declining #432's fourth acceptance criterion

**This decision does not meet a criterion the issue states, and that is
deliberate.** #432 asks for:

> `loadCurrent`'s recovery walk must not offer a quarantined generation back,
> and the reason it terminates must stay as explicit as
> `LoadCurrentOptions.skip` is today.

It is not met. The next reader should be able to disagree with that on the
facts, so here are the facts.

**The tension.** Two of #432's acceptance criteria pull against each other:

- **AC 2** — *"The quarantined bytes must be recoverable by a later build
  without the player doing anything unusual; a test demonstrates the recovery,
  not just the retention."*
- **AC 4** — *"`loadCurrent` never returns a quarantined generation."*

**Why AC 2 wins.** Leaving the generation in the walk *is* the recovery. A
quarantined generation is the newest thing in the window — that is what
decision 3's bound guarantees — so `loadCurrent`, which walks newest-first,
offers it first, and a build that can read it restores it on the very next
load. No new code path, no new control, no player action, and nothing the
player has to be told. Satisfying AC 4 instead would mean building a *second*
recovery route to reach the quarantined bytes at all, and a route the player
has to be told about is a player-visible promise, which `AGENTS.md`'s fourth
exclusion reserves to the owner. AC 4 describes a mechanism the issue guessed
at; AC 2 describes what the issue is for.

**What AC 4's second half asked for is kept in full.** Termination still rests
on `LoadCurrentOptions.skip`, which only ever grows, exactly as before — no
new terminating condition was introduced, and none was needed.
`tests/unit/persistence-local-repository.test.ts` pins both halves in one test:
the quarantined generation is offered when nothing skips it, and the walk still
returns `no-valid-generation` when everything is skipped.

**The price, stated so it can be weighed.** One refused restore per load — a
worker start and a restore attempt on the recovery path — and **only while the
quarantined generation is still the newest thing in the window.** The first
save after the fallback restore puts an ordinary generation above it, and the
walk never reaches it again. That is the same price `docs/PERSISTENCE.md`
already records for the deterministic-refusal case, on the same once-per-load
path, and it is bounded by one load rather than accruing.

**What would change this.** If a quarantined generation could ever *not* be the
newest — an account-wide quarantine (open question 3), or a bound above one —
the walk would start paying for generations it will never use, and hiding them
from `loadCurrent` would become the better trade. The bound and this decision
are therefore one decision seen twice.

### 7. It is invisible to the player, and that half is the owner's

`recoveryOf` and `retainedGenerations` in
`src/ui/account/save-list-projection.ts`, and the save panel's per-prison count
(`save.list.item`, *"{name} ({count} gen)"*), all count readable generations
only. Counting a quarantined copy would report a prison as `recoverable` when
this build cannot perform that fallback — `AGENTS.md`'s fourth exclusion
breached by arithmetic rather than by prose.

**ADR 0063's open question 1 had a precondition, and this ADR discharges it.**
That question asked whether the player should be told *which* save-side reason
applied, observed that the honest sentence for `unsupported-by-this-build` is
closer to *"this save was written by a version of Lockstate this build cannot
read"*, and said it was *"a promise with a **precondition**: it is only
keepable once #432 stops deleting the save the player is being told to come
back for."* **That precondition is now met.** The save survives (decisions 1,
3 and 4), and recovery needs nothing of the player (decision 6).

**What is still missing is not the precondition but the content of the
promise**, and it is worth naming precisely so the owner rules on it rather
than infers it. The code knows the restore was refused as
`unsupported-by-this-build`. It does **not** know that a newer Lockstate
exists, that updating would help, or when. A key saying *"update the game"*
promises the third; a key saying *"this copy was written by a version this
build cannot read, and it has been kept"* promises only what the code knows.

And the count in decision 7 would have to be revisited in the same pass, or the
panel says **"1 gen"** beside a message about a second one — which is the same
class of defect one layer over.

Nothing on this branch adds a locale key.

## Alternatives considered

### Quarantine both save-side reasons

Rejected under decision 1: the slot is one slot, and spending it on the verdict
whose recovery nobody can demonstrate costs the verdict where the build that
reads the bytes already exists. Reversible without revisiting this document, by
moving a throw site.

### A `quarantinedGenerationIds` field on the slot record

The form everyone reaches for, and rejected under decision 2 on the
`.strict()`-schema downgrade hazard `docs/PERSISTENCE.md` had already recorded:
it turns a downgrade from "one save is deleted" into "every prison in the
account is unreadable".

### Loosening `prisonSlotMetadataSchema` to accept unknown keys, then adding the field

Rejected. The hazard is builds **already deployed**, and loosening the schema
today cannot reach them. It would also weaken the one boundary that catches a
slot record this repository could not have written, which is what that schema
exists for.

### Un-pointing without deleting — leaving the record outside `generationIds`

Rejected for the reason the repository already gives for deleting rather than
un-pointing: a generation outside `generationIds` is unreachable by every read
path and would not be cleaned up by `delete()` either, so it leaks. IndexedDB
quota exhaustion is a real failure mode with its own `SaveWriteError` code,
which makes an unbounded leak a worse defect than the one being fixed.

### Keeping the generation but leaving it inside the `keep` budget

Rejected under decision 4: 90 seconds. It also costs the player one of their
own readable saves, which is the wrong party to charge.

### A separate quarantine store, or a third object store in IndexedDB

Rejected as scope this does not need. `LocalSaveStore` has two record kinds and
adding a third is a schema and adapter change — `indexeddb-store.ts`'s database
version has never been past 1 — for a capability the existing window already
expresses. It would also put the bytes outside `delete()`'s reach unless a
second cleanup path were written.

### Deleting the quarantined generation once the player has exported it

Rejected: the save panel's Export is session-scoped (`exportActive` runs
against the active session) and a prison whose newest generation cannot be
restored never becomes the active session — so the condition could not be met
by the player in the case that matters.

## Consequences

**Positive**

- A save the code has just classified as *"neither the player's fault nor
  damaged — another build reads these bytes"* is no longer thrown away. That
  was the one place the taxonomy contradicted itself, and ADR 0063 said so.
- Recovery needs no player action and no new surface: the fixed build loads the
  prison from the quarantined generation on the next load.
- ADR 0063's reason is now *read* by the decision it was declared for, so the
  taxonomy is load-bearing rather than descriptive.
- The retirement floor is strengthened: it counts the generations this build
  has not set aside, so a window cannot be reduced to nothing but copies this
  build cannot use.
- ADR 0063's open question 1 loses its precondition, so the player-facing half
  is now a question the owner can actually answer.

**Negative**

- One more generation per prison in the worst case, and the exact bytes are
  bounded only by the save size.
- One refused restore per load while a quarantined generation is the newest
  thing in the window — a worker start on the recovery path, once per load.
- A generation id now carries meaning, which is a convention rather than a
  checked type. `writeGeneration` refuses a marked id and
  `tests/unit/persistence-local-policy.test.ts` pins the marked form against
  literals, but a future store that minted ids elsewhere could still collide
  with the prefix.
- Two `src/ui/**` entries in `tests/unit/ui-orchestration-boundaries.test.ts`
  move from `type-only` to `value`. The imported module has no imports of its
  own, so nothing that tier is protected from can arrive through it — but that
  protection is now a written reason rather than a kind, and the manifest
  entries say what makes it go stale.
- A criterion of #432's is not met (decision 6), on purpose and with the
  reasoning recorded, which means the issue cannot be closed by checking boxes.

## Open questions

1. **Should the player be told a save is being held for a build that can read
   it?** The owner's, and the precondition is discharged — see decision 7 for
   what would still have to be decided about the sentence itself, and for why
   the hidden count has to move in the same pass.
2. **Should a quarantined generation ever expire?** It is bounded at one per
   prison and released when a build restores it, but a prison whose quarantined
   generation is never restorable carries it for the life of the slot. An
   age-based or version-based expiry is possible — *the build that wrote it has
   not been seen for N days* — and is not built here, because every expiry rule
   available today would be a guess about a fix's shipping date.
3. **Does the quarantine slot belong to the prison or to the account?** One per
   prison is the bound decided here, and with five free slots that is five. If
   local storage pressure ever becomes real, an account-wide bound is the next
   shape — and it would reopen decision 6, because a quarantined generation
   could then fail to be the newest in its own window.
4. **Should `demoteGeneration` be able to delete a quarantined generation at
   all?** It can today, and nothing calls it that way: `loadPrison` routes
   `damaged-payload` there, and a quarantined generation refused a second time
   is refused for the reason that quarantined it. If a build ever reclassified
   a quarantined generation as `damaged-payload`, deleting it would be correct
   — but that is a build disagreeing with its predecessor about a save, and
   whether the newer verdict should win is not obvious.
