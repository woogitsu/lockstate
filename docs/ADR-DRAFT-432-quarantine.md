# ADR NNNN (unassigned): What happens to a save this build cannot read

> **This file is a draft awaiting a central number and it is deliberately not
> in `docs/adr/`.** `tests/foundation/adr-numbering-contract.test.ts` requires
> an ADR's filename, its heading number, its row in `docs/adr/README.md` and
> the index's **Next free number** line to agree in one commit, so an ADR
> cannot exist unnumbered — and `AGENTS.md` assigns numbers centrally, after
> drafts return, precisely so two agents cannot take one. `docs/adr/` held
> **0063** as its highest number on `origin/main` @ `aefd8fc` (v0.0.153), the
> contract is `max(on disk) + 1`, and the index's line reads `Next free number:
> 0064` — but at least one unmerged branch already holds 0064
> (`agent/443-need-consequences`, the unmet-need ADR), so the next genuinely
> free number depends on merge order and this draft does not guess it.
>
> **To land it:** move this file into `docs/adr/` as
> `NNNN-what-happens-to-a-save-this-build-cannot-read.md` — written as a bare
> filename because that path deliberately does not exist yet, which is the
> rule `tests/foundation/documentation-links-contract.test.ts` enforces —
> put the assigned number in the heading, add its row to `docs/adr/README.md`,
> move the **Next free number** line if the number raises the maximum, and
> replace the three `#432's ADR` citations in `docs/PERSISTENCE.md` and
> `src/persistence/local/repository.ts` with the numbered link. This document
> pre-commits to renumbering without argument if the number it is given
> collides.

## Status

**Proposed, 2026-08-28.** Decided under the owner's standing mandate
(`AGENTS.md`, "The owner's standing mandate": research, decide, record — rather
than ask). The implementation landed on `agent/432-keep-unreadable-generations`
ahead of this document, for the reason [ADR 0038](./adr/0038-what-makes-a-save-compatible.md)
and [ADR 0063](./adr/0063-what-a-refused-restore-says-and-whose-fault-it-is.md)
both give for the same order: the defect is live rather than hypothetical, and
this document is what the branch should be judged against.

**Decision 6 is explicitly *not* decided here.** It is a player-visible
promise, which `AGENTS.md`'s fourth exclusion reserves to the owner, and
nothing on the branch adds a locale key.

## Context

Issue #432, broken out of #403 as its mitigation (c), and the direct successor
to [ADR 0063](./adr/0063-what-a-refused-restore-says-and-whose-fault-it-is.md),
whose **open question 2** is this document's whole subject:

> **Should `unsupported-by-this-build` be retirable at all?** Decision 1 keeps
> today's behaviour, because changing it is #432's subject. But that reason's
> whole meaning is "another build reads this", and deleting it is the one
> deletion quarantine exists to prevent. If #432 lands, this reason is its
> first customer; if it does not, this row deletes saves it has just declared
> readable.

**The premise was verified before anything was built**, because five issues in
a row that day had turned out already fixed or partly stale. It is not stale.
Measured on `main` @ `aefd8fc` (v0.0.153), `SessionController.loadPrison`
collected refusals into a `Set<string>` and called
`PrisonSaveRepository.demoteGeneration` for every member once a different
generation had restored, with no reference to `error.reason` anywhere in the
housekeeping block — so the reason ADR 0063 had landed the day before was
declared at the throw site, carried across the worker boundary in the fault's
`details`, narrowed back on the main thread, and then not read by the one
decision it was declared for. `demoteGeneration` ends in
`tx.deleteGeneration(...)`.

Two of #403's mitigations already narrow *when* that deletion happens and
neither changes *what* it does:

- **(b)** `demoteGeneration` refuses to delete the last retained generation.
- **(d)** a refused generation is retired only once a *different* one has
  restored, so a deterministic failure costs nothing at all.

The case they do not cover is the one that matters here, and it is the ordinary
one: a save this build cannot restore **and** another generation that restores
fine. Today's rules retire the first correctly — and destroy it.

### What "the case they do not cover" actually looks like

A player's browser holds build B-old; the site has since shipped B-new (every
merge to `main` publishes, `docs/DEPLOYMENT.md`). They played on B-new, and
then load B-old — a cached bundle, or a rollback. Their newest generation was
written by B-new. B-old refuses it `unsupported-by-this-build`, falls back to
the generation below, and deletes the newest one. The state B-new left is gone,
and the build that could read it exists.

## Decision

### 1. Retention differs by reason, and only `unsupported-by-this-build` earns it

ADR 0063's three arms answer this differently:

| Reason | What retirement does now |
| --- | --- |
| `unsupported-by-this-build` | **Quarantined** — kept on disk, outside the retention budget, once a different generation has restored |
| `damaged-payload` | Deleted, once a different generation has restored. Unchanged. |
| `restore-code-fault` | Nothing, ever. Unchanged; it is not the class the demotion decision reads. |

The evidence that licenses retirement — another generation restored through the
same code on the same build moments earlier — is equally strong for both
save-side verdicts and it means opposite things under each.

**Why not keep both.** The obvious objection is the right one to answer: a
`damaged-payload` verdict is *this build's reading* of the bytes, and a future
build might read them differently too. Some of that reason's arms are
structural invariants this build imposes (a `simulation` section with no
`entities` beside it; a construction section with no `orders` array) and a
later build could in principle relax one. The asymmetry that settles it is not
certainty, it is **evidence**:

- For `unsupported-by-this-build`, a build that reads the bytes is *known to
  exist* — it is the one that wrote them. Recovery is demonstrated; only the
  shipping is pending.
- For `damaged-payload`, no build reads them. Recovery would require someone to
  write a relaxation, against a check that says the content contradicts itself.
  Recovery is hypothesised.

Quarantine is one slot (decision 3). Spending it on the hypothesised case costs
the demonstrated one, in the same prison, on the same load. **And if a
`damaged-payload` check is ever found to be over-strict, the remedy is to move
that throw site to the other reason** — a one-line change at exactly the place
ADR 0063 §2 put the decision — not to widen quarantine. The taxonomy is the
tuning knob, which is what makes this decision revisable without revisiting it.

### 2. The mark lives in the generation id

`docs/PERSISTENCE.md` had already recorded why the obvious form is wrong, and
this document does not overturn it: a `quarantinedGenerationIds` field on the
slot record is a persistence-format change with a downgrade hazard.
`prisonSlotMetadataSchema` is `.strict()`, so a record written by a newer build
fails validation on an older one, `requirePrisonSlotMetadata` throws
`CorruptSlotMetadataError`, and `PrisonSaveRepository.list()` refuses **the
player's whole prison list** rather than one prison. A quarantine whose price
is that a downgrade hides every save is not insurance; it is the defect it was
meant to prevent, generalised.

A generation id is a string this repository generates and nothing else
interprets. `generationIds` is `z.array(z.string().min(1))` at every version
the slot schema has ever had, so a marked id — `!unreadable!gen-3` — is a
record an older build reads without complaint, and what it then does with it is
the ordinary thing: offer it to the restore path, be refused, demote it,
exactly as it would have before this change. **Marked or not, a downgrade
behaves identically; only this build keeps more.**

The mark therefore costs no `SAVE_SCHEMA_VERSION` bump
([ADR 0038](./adr/0038-what-makes-a-save-compatible.md) governs and #288 prices
one), no slot-schema change and no migration. It costs one rename of the stored
record, performed inside the transaction that rewrites the window so the key
the bytes live under and the id the window holds can never disagree.

`!` is not a character `defaultGenerationId` can emit, and `writeGeneration`
refuses an injected id carrying the mark — so a generation is quarantined only
by having been quarantined, never by being named.

### 3. The bound is one quarantined generation per prison

Generations are finite and something has to give. The slot is held by the
**newest** candidate for it:

| Situation | What happens |
| --- | --- |
| Nothing quarantined | the refused generation takes the slot |
| The same generation refused again on a later load | idempotent; nothing moves |
| A **newer** generation is refused | it takes the slot; the older quarantined generation is **deleted** |
| An **older** generation is refused while a newer one holds the slot | declined; it stays an ordinary retained generation and ordinary retention evicts it in due course |
| A build **restores** the quarantined generation | the mark comes off, the slot is handed back (decision 5) |
| The prison is deleted | it goes with the rest — it is inside `generationIds`, so `delete()` reaches it |

**What is sacrificed when the bound binds: of two saves this build cannot read,
the older one goes.** The newer one is the more recent state of the prison, and
a build able to read one can generally read both.

The storage ceiling is one extra generation per prison, so the per-prison worst
case rises from `keep + 1` — the import spare slot, #438 — to `keep + 2`: five
records at the default `keepGenerations: 3`. Against `docs/PERSISTENCE.md`'s
measured tiers that is **+42 KiB** at 25 prisoners and **+2.86 MiB** at 3,000,
per prison; under [ADR 0013](./adr/0013-free-tier-cloud-save-capacity.md) §4's
accepted 4 MiB per stored save version; and at most ~14 MiB of local IndexedDB
across the five free slots. Nothing here reaches cloud storage — this is
`src/persistence/local/` and #20 is unimplemented — so ADR 0013's §5 and §6
proposals are untouched.

### 4. A quarantined generation is outside the retention budget

Every rule in `generation-policy.ts` skips it: it is not counted against
`keep`, not eligible for eviction by a save, an import or a confirmation, and
not the spare slot an import may take.

**This is the decision, not a detail.** A quarantine that merely declined to
delete would be worthless: the window evicts from the oldest end, so the kept
generation would be gone after `keep` further autosaves — **90 seconds** at the
30-second cadence — against a fix that ships in weeks. And the player is
playing, because the whole case is one where a *different* generation restored.

The cost is that a prison carrying a quarantined generation carries it
indefinitely, bounded by decision 3 at one, and released by decision 5 when it
stops being true.

### 5. The mark comes off when a build restores the generation

The mark records a verdict — *this build refused these bytes* — and a build
that restores them has falsified it. `releaseQuarantinedGeneration` renames it
back, the generation rejoins the ordinary window, and the slot is free.

It is the same evidence `demoteGeneration` and `confirmGeneration` both
require, spent a third way: only a restore that actually happened moves
anything. `SessionController.loadPrison` releases **before** the retirement
loop, so decision 3's eviction can never take the generation the session is
running on.

### 6. `loadCurrent` still offers it, and that is the recovery

#432's fourth acceptance criterion asked for the opposite —
*"`loadCurrent`'s recovery walk must not offer a quarantined generation
back"* — and **this document declines it, deliberately.** Two of that issue's
criteria pull against each other:

- *"The quarantined bytes must be recoverable by a later build without the
  player doing anything unusual."*
- *"`loadCurrent` never returns a quarantined generation."*

Leaving it in the walk **is** the recovery. The quarantined generation is the
newest thing in the window, so a build that can read it restores it on the very
next load: no new code path, no new control, nothing for the player to be told.
Hiding it would require a second, explicit recovery route — and a route the
player must be told about is a player-visible promise, which `AGENTS.md`'s
fourth exclusion reserves to the owner. The criterion that serves the issue's
purpose wins over the one that describes a mechanism the issue guessed at.

Termination is unaffected and stays exactly as explicit as the criterion asked:
it rests on `LoadCurrentOptions.skip`, which only grows, and
`tests/unit/persistence-local-repository.test.ts` pins both halves — the
quarantined generation is offered when nothing skips it, and the walk still
ends when everything is skipped.

The price is one refused restore per load, and only while the quarantined
generation is still the newest: the first save after the fallback restore puts
an ordinary generation above it and the walk never reaches it again. That is
the same price `docs/PERSISTENCE.md` already records for the
deterministic-refusal case, on the same once-per-load path.

### 7. It is invisible to the player, and that half is the owner's

`recoveryOf` and `retainedGenerations` in
`src/ui/account/save-list-projection.ts`, and the save panel's per-prison
count, all count readable generations only. Counting a quarantined copy would
report a prison as `recoverable` when this build cannot perform that
fallback — a promise the code does not keep, which is `AGENTS.md`'s fourth
exclusion made by arithmetic rather than by prose.

**Whether the player should be told is open question 1 below.** Nothing on the
branch adds a locale key.

## Alternatives considered

### Quarantine both save-side reasons

Rejected under decision 1: the slot is one slot, and spending it on the verdict
whose recovery nobody can demonstrate costs the verdict where the build that
reads the bytes already exists. Revisable without revisiting this document, by
moving a throw site.

### A `quarantinedGenerationIds` field on the slot record

The form everyone reaches for, and rejected under decision 2 on the
`.strict()`-schema downgrade hazard `docs/PERSISTENCE.md` had already written
down: it turns a downgrade from "one save is deleted" into "the whole prison
list is unreadable".

### Loosening `prisonSlotMetadataSchema` to accept unknown keys, then adding the field

Rejected. The hazard is builds *already deployed*, and loosening the schema
today cannot reach them. It would also weaken the one boundary that catches a
slot record this repository could not have written, which is what that schema
exists for.

### Un-pointing without deleting — leaving the record outside `generationIds`

Rejected for the reason the file already gives: a generation outside
`generationIds` is unreachable by every read path and would not be cleaned up
by `delete()` either, so it leaks — and IndexedDB quota exhaustion is a real
failure mode, which makes an unbounded leak a worse defect than the one being
fixed.

### Keeping the generation but leaving it inside the `keep` budget

Rejected under decision 4: it survives `keep` further autosaves, which is 90
seconds. It also costs the player one of their own readable saves, which is the
wrong party to charge.

### A separate quarantine store, or a separate object store in IndexedDB

Rejected as scope this does not need. `LocalSaveStore` has two record kinds and
adding a third is a schema and adapter change (`indexeddb-store.ts`'s database
version has never been past 1) for a capability the existing window already
expresses. It would also put the bytes outside `delete()`'s reach unless a
second cleanup path were written.

### Deleting the quarantined generation once the player has exported it

Rejected: the save panel's Export is session-scoped (`exportActive` runs
against the active session), and a prison whose newest generation cannot be
restored never becomes the active session — so the condition could not be met
by the player in the case that matters.

## Consequences

**Positive**

- A save the code has just classified as *"neither the player's fault nor
  damaged — another build reads these bytes"* is no longer thrown away, which
  was the one place the taxonomy contradicted itself.
- Recovery needs no player action and no new surface: the fixed build loads the
  prison from the quarantined generation on the next load.
- ADR 0063's reason is now *read* by the decision it was declared for, so the
  taxonomy is load-bearing rather than descriptive.
- The retirement floor is strengthened: it now counts the generations this
  build has not set aside, so a window cannot be reduced to nothing but copies
  this build cannot use.

**Negative**

- One more generation per prison in the worst case, and the exact bytes are
  bounded only by the save size.
- One refused restore per load while a quarantined generation is the newest
  thing in the window. A worker start on the recovery path, once per load.
- A generation id now carries meaning, which is a convention rather than a
  checked type. `writeGeneration` refuses a marked id and
  `tests/unit/persistence-local-policy.test.ts` pins the marked form against
  literals, but a future store that generated ids elsewhere could still
  collide with the prefix.
- Two `src/ui/**` entries in
  `tests/unit/ui-orchestration-boundaries.test.ts` move from `type-only` to
  `value`. The imported module has no imports of its own, so nothing that tier
  is protected from can arrive through it — but the manifest's protection is
  now one written reason rather than a kind.

## Open questions

1. **Should the player be told a save is being held for a build that can read
   it? This one is the owner's, and it is the precondition ADR 0063's own open
   question 1 named.** That question said the honest sentence for an
   `unsupported-by-this-build` load is closer to *"this save was written by a
   version of Lockstate this build cannot read; update the game"*, and that it
   is *"a promise with a precondition: it is only keepable once #432 stops
   deleting the save the player is being told to come back for."* **That
   precondition is now met.** What would have to be true for the promise to be
   keepable, stated so the owner can rule on it rather than infer it:
   - the save must survive until the fix ships — it now does, bounded by
     decision 3 and by the player not accumulating a *newer* unreadable save in
     the same prison;
   - the recovery must need nothing of the player — it now needs nothing at
     all (decision 6);
   - the sentence must not claim more than the code knows. The code knows the
     restore was refused as `unsupported-by-this-build`; it does **not** know
     that a newer Lockstate exists, that updating will help, or when. A key
     saying "update the game" promises the third; a key saying "this copy was
     written by a version this build cannot read, and it has been kept" does
     not.
   - and the count decision 7 hides would have to be revisited in the same
     pass, or the panel would say "1 save" beside a message about a second one.
2. **Should a quarantined generation ever expire?** It is bounded at one per
   prison and released when a build restores it, but a prison whose quarantined
   generation is never restorable carries it for the life of the slot. An
   age-based or version-based expiry is possible — *the build that wrote it has
   not been seen for N days* — and is not built here, because every expiry rule
   available today would be a guess about a fix's shipping date.
3. **Does the quarantine slot belong to the prison or to the account?** One per
   prison is the bound decided here, and with five free slots that is five. If
   local storage pressure ever becomes real, an account-wide bound would be the
   next shape, and it needs a place to hold cross-prison state that
   `PrisonSlotMetadata` does not provide.
4. **Should `demoteGeneration` be able to delete a quarantined generation at
   all?** It can today, and nothing calls it that way: `loadPrison` routes
   `damaged-payload` there and a quarantined generation refused a second time
   is refused for the reason that quarantined it. If a build ever reclassified
   a quarantined generation as `damaged-payload`, deleting it would be correct
   — but that is a build disagreeing with its predecessor about a save, and
   whether the newer verdict should win is not obvious.
