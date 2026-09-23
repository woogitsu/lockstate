# ADR 0109: What a stale local save is refused for, and what it costs to refuse it

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0109, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075, 0076, 0083, 0096, 0097, 0098, 0099, 0100,
> 0101, 0102, 0103, 0104, 0105, 0106, 0107 and 0108 each pre-committed.
>
> **The sweep, performed rather than trusted.** From this worktree at
> `be5061f95f6eacdcd8114efd43f4f37154330e81` (v0.0.579):
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then every
> fetched ref's history read for ADR files ever added
> (`git log --all --pretty=format: --name-only -- docs/adr`), which is the
> superset method [ADR 0108](./0108-what-nobody-can-get-in-should-mean.md)'s
> index entry describes and which also catches a number added and later renamed
> away. **299 heads; the highest four-digit prefix on any of them is 0108**,
> matching disk, and `docs/adr/README.md`'s own line already reads *"Next free
> number: 0109."* So 0109 is what this document takes. Four other agents are
> working in parallel in their own worktrees per `docs/AGENT_WORKFLOW.md` §2,
> which is exactly the situation that rule expects and why this preamble
> exists — the number is re-checked again immediately before this branch is
> pushed, not only here.
>
> **Re-swept immediately before the push, as that sentence promises, and the
> head count had already moved.** The second sweep, minutes later, read **304
> heads** rather than 299 — five appeared while this document was being
> written, two of them forced updates to `wip/` branches — and the highest
> four-digit prefix on any of them is still **0108**. So 0109 is taken here
> and the count in the paragraph above is left as it stands rather than
> corrected to the later one: it was right about the moment it was taken, and
> the useful record is that the population moved under a sweep inside one
> session, which is the hazard the re-check exists for.

## Status

**Accepted by the owner on 2026-09-11, in two rulings.**

1. **The mechanism, accepted in full** — Decisions 1, 2, 4 and 6, from the
   option labelled *"Przyjmij mechanizm w całości"* ("Accept the mechanism in
   full").
2. **The sentence of Decision 5, ruled** — this document's own recommended
   candidate, verbatim:

   > **"Could not save: this prison was changed elsewhere."**

   Chosen over the warmer alternative for the reason Decision 5 gives: the
   other candidate asserts *"your progress here is safe"*, which is a promise
   about memory the save path does not verify. A refused **autosave** still
   says nothing.

> **THE PROVENANCE IS THE WEAKER KIND AND IS DISCLOSED RATHER THAN DRESSED
> UP.** Both rulings are the labels of clickable options this session wrote and
> the owner chose, not sentences they typed, and they were given against a
> summary rather than against this document's full text. That is the same
> shape [ADR 0105](./0105-what-makes-a-local-save-the-newest-one.md) discloses
> of its own acceptance one day earlier, and that `CLAUDE.md` flags about the
> 2026-09-08, 2026-09-09 and 2026-09-10 releases of `AGENTS.md` reservation 3.
> ADRs 0096, 0104, 0106, 0107 and 0108 each carry the same disclosure about
> themselves. The same caution applies here.
>
> **What the acceptance binds, exactly.** The mechanism of Decisions 1, 2 and
> 4, the wording of Decision 5, and that LS-03 leaves this document
> (Decision 6). It authorises nothing about `supabase/migrations/` or the save
> format, and item 5 of "What the owner must approve" was not needed: see
> "What the implementation found" below.
>
> **The `Proposed. Not self-approved.` record is kept below rather than
> overwritten**, for the reason ADR 0105 gives for keeping its own: the
> document argued the case as a proposal and a reader should see it in the form
> it was argued in.

## What the implementation found, 2026-09-11

Three things this document asserts turned out to be wrong, and they are
recorded here rather than corrected silently.

**1. The falsifier was run first, and failed to falsify — more strongly than
"Weakest claim" hoped.** That section asks for *"a `WorkerSessionHost` run that
unloads the page between capture and write and observes whether the write
lands"*. Run at `tests/browser/lifecycle-save-epoch.spec.ts`, with
`SimulationWorkerChannel` + `WorkerPerSessionHost` rather than the
`InProcessSessionHost` this document's own measurements used:

```
triggers: ["pagehide","visibility-hidden"]
writes:   [{"trigger":"manual","envelopeRevision":1,"authorisingSessionAlive":true,...}]
durableRevision: 1   durableGenerations: 1
```

Both real lifecycle events reached the handler and **no write was issued at
all**. The reason is structural rather than lucky: `saveNow` cannot reach
`repository.save` without first awaiting `host.capture()`, a round trip to the
simulation worker, and the page dies long before the worker answers. **A
capture cannot outlive its own page, because the capture is the part that dies
first**, so the falsifier's premise has no route through this code. The epoch
stays non-durable and nothing here needs `AGENTS.md` reservation 2.

**2. Decision 4's retry, taken literally, re-opens FINAL-006 — which
Decision 2's own table says the revision CAS closes.** Measured: tab B refused
at expectation 1 against durable 2, epoch-current so retried, re-submitted
against 2, **succeeded at 3**. Tab A's hundred ticks overwritten anyway, by a
slower route.

The epoch cannot separate the cases, because it is per-process and **both tabs
are epoch-current in their own**. What separates them is this document's own
justification for the retry — *"it is live, and its state is the newest there
is"* — which holds when the writer lost the race to *itself* (FINAL-005) and
fails when it lost to another tab whose state it has never seen. The
implementation therefore retries only when the slot moved to exactly where the
session's own bookkeeping already stands, which is proof that the write that
beat it was its own. **Narrower than this document's wording and faithful to
its reasoning**; a reader of Decision 4 who finds the code stricter should read
this paragraph rather than assume drift.

**3. "Consequences for existing sentences" names a sentence that does not
exist.** It says *"`save-schema.ts`'s own 'not this issue' note about
caller-managed revisions is the same sentence one level down"*. There is no
such note in that file and there never was: `git log -S` over it finds neither
*"not this issue"* nor *"optimistic"*. The sentence it meant is in
`docs/PERSISTENCE.md`'s **envelope-shape block** — one level *up* from the
exclusion this document quotes, not down — and it is the more interesting of
the two, because it deferred enforcement to *"the storage backend (#20)"*, i.e.
to Supabase, leaving the local store every offline player writes to with none.
Both `docs/PERSISTENCE.md` sentences were rewritten with the originals kept
beside them, and the note this document expected in `save-schema.ts` was
written rather than merely reported missing.

**A fourth finding, about the allocation rule rather than this document.**
`(durableRevision ?? 0) + 1` resets a pre-#1097 slot's sequence to 1 behind
generations at revision 40, and drops the number
`src/ui/account/save-list-projection.ts:156` classifies cloud drift by. The
allocation fails open exactly once per slot, as the comparison does. Open
question 2 anticipated the comparison's half of this and not the allocation's.

**Proposed. Not self-approved.** `docs/AGENT_WORKFLOW.md` §3:
*"**Propose an ADR rather than deciding architecture inside implementation
code, and never self-approve one** outside a recorded delegation from the
owner."*

**This document designs a mechanism for a direction the owner has already
ruled, and it does not re-argue the direction.**
[ADR 0105](./0105-what-makes-a-local-save-the-newest-one.md) was accepted on
2026-09-10 — *"FINAL-005 first, then option 2, then option 3 as the
direction"* — and that acceptance is what this document builds on rather than
revisits. What it settles is the three things ADR 0105 explicitly declined to
settle alone: **how the revision is allocated**, **what a mismatch does**, and
**whether a refusal reaches the player**.

Filed against [#582](https://github.com/woogitsu/lockstate/issues/582).

## Claim tiers used below

**VERIFIED** — read out of the tree at the commit named, with the window opened
at both ends.
**MEASURED** — produced by running something, output quoted.
**ASSERTED** — reasoning, marked as such so it can be attacked separately.

All VERIFIED and MEASURED claims below are at
`be5061f95f6eacdcd8114efd43f4f37154330e81` (v0.0.579) unless said otherwise.

## Context

### 1. Two of #582's five defects are closed, and this document does not re-argue them — VERIFIED

**RED-001 is fixed.** `SessionController.closeSession`
(`src/persistence/session/session-controller.ts:876-880`) now stops the runtime
host, so a deletion that reaches it tears the simulation down with the save:

  `await this.host.stop();`
  (verbatim in `src/persistence/session/session-controller.ts`).

The test that #582 correctly identified as asserting the wrong boundary now
asserts the right one — `tests/unit/persistence-session-controller.test.ts:165`
and `:169` bracket the deletion with `host.getRuntime()` rather than with
`getActiveSession()`, the second carrying the message *"the simulation must not
outlive the save it belongs to"*.

**FINAL-022 is fixed.** Generation ids are `gen-${crypto.randomUUID()}`
(`src/persistence/local/repository.ts:277-279`), so two realms cannot mint the
same id in the same millisecond. Both landed in `5da4e5ca`.

### 2. The other three survive, and all three are now MEASURED rather than read

#582 says of itself that *"Every finding below was reached by reading, not by
running"* and asks for reproduction. One prior comment on the issue reproduced
FINAL-005. **FINAL-004 and FINAL-006 had not been run by anybody**; both were
run for this document, at `be5061f95f6eacdcd8114efd43f4f37154330e81`
(v0.0.579), through `SessionController` +
`PrisonSaveRepository` + `MemoryLocalSaveStore` + `InProcessSessionHost`, with
an explicit barrier on the write rather than a race anyone has to believe in.
The probes were deleted once the numbers were taken
(`tests/foundation/test-suite-carries-no-scratch-probe-contract.test.ts`
requires that).

**FINAL-004 — MEASURED, and the third line is the one this document is built
on.** A prison at tick 0 / revision 1; the live runtime advanced to tick 10; the
autosave allowed to capture and then held at the write; the same prison then
loaded again; the write released:

```
live tick before the autosave fires: 10
autosave reached the write with envelope revision 2 tick 10
load ok: true
live tick after the reload: 0
session revision after the reload: 1
durable current revision: 2 tick: 10
live tick at the end: 0
session revision at the end: 2
```

The first six lines are FINAL-004 as #582 states it: the live simulation is at
tick 0 and the durable current generation is at tick 10. **The last line is not
in #582 and it is worse than what is.** The stale write's completion callback
advanced the *new* session's revision counter from 1 to 2, because that callback
is guarded by `prisonId`, which a same-slot reload does not change:

  `if (result.ok && this.session?.prisonId === prisonId) this.session.revision += 1;`
  — the line exactly as it stood at `be5061f95f6eacdcd8114efd43f4f37154330e81`,
  and **deleted by the branch that implements this document**, which is why the
  attribution above no longer reads *"verbatim in"*: it would be a false claim
  about the present tree, and
  `tests/foundation/adr-quotation-verbatim-contract.test.ts` is what caught it
  saying so. The autosave's `onResult` no longer touches the revision at all;
  `SessionController.submitSave` assigns it from what the write returned.

So the next ordinary save from the fresh session builds **revision 3** — a
perfectly consecutive successor to a durable state that session never saw. The
divergence is laundered into a legitimate-looking sequence.

**FINAL-005 — re-MEASURED at v0.0.579**, unchanged from the reading ADR 0105
took at `5d5df28a`. Two `saveNow()` calls started before either commits:

```
envelope revisions offered: 2, 2 | both ok: true true
in-memory session revision: 3
third save ok: true | envelope revisions offered so far: 2, 2, 4
```

**FINAL-006 — MEASURED, first reproduction.** Two `SessionController`s over one
store, which is what two tabs are — `bootPersistence` (`src/main.ts:3353`)
constructs one at `:3396` per page:

```
both loaded: true true
tab A revision: 1 | tab B revision: 1
tab A saved (100 ticks of progress): true
tab B saved (3 ticks, never saw A): true
durable current after both: revision 2 tick 3
```

Tab A's hundred ticks were current and are not. Both saves reported success to
their player.

### 3. The pointer write has no comparison in it, and the field a comparison needs is already there — VERIFIED

`PrisonSaveRepository.writeGeneration` opens one `readwrite` transaction, reads
the slot, writes the payload and advances the pointer
(`src/persistence/local/repository.ts:504-531`). Between the read and the write
nothing compares the revision it found against the revision it is about to
store: `currentRevision: decoded.value.revision` is unconditional
(`:523`). The comment beside it, added by #1097, describes the choke point
rather than a guard:

  `a revision number that cannot drift behind the durable generation it describes, because it is written in the same transaction as that generation rather than by a separate, easily-missed call.`
  (verbatim in `src/persistence/local/repository.ts`).

That is the whole of what makes option 2 cheap: the slot is **already read
inside the transaction that would refuse**, so the comparison costs no extra
round trip, and `currentRevision` is already durable, already written on every
save, and read today in exactly one place — `src/ui/account/save-list-projection.ts:156` —
where it classifies cloud drift.

### 4. `revision` is outside the checksum, which is what makes write-time allocation cheap — VERIFIED, and ADR 0105 did not have it

> **The two line numbers in this section are correct at
> `be5061f95f6eacdcd8114efd43f4f37154330e81`, as this document's claim tiers
> promise, and are stale on `main` — because the branch implementing this
> document wrote the `revision` docblock §"Consequences for existing sentences"
> asked for, immediately above them.** `createSaveEnvelope` now opens at
> `:1774` and the `checksum:` line is `:1792`. Recorded here rather than
> silently renumbered: the citations below are evidence for a claim taken at a
> named commit, and a reader who greps rather than trusting either number is
> doing the right thing. Both ends were re-opened to get these.

`createSaveEnvelope` (`src/persistence/save-schema.ts:2041-2063`) hashes the
**payload** and puts `revision` in the metadata beside it, not inside it:

  `checksum: computeSaveChecksum(payload as JsonValue),`
  (verbatim in `src/persistence/save-schema.ts`).

**So a revision stamped at write time rather than at capture time invalidates
nothing.** The envelope's bytes-under-hash do not change, no schema version
moves, and `decodeSaveEnvelope` is unaffected. This is the fact that decides
Decision §1 below, and ADR 0105 — which left the choice between *"a lock, a
queue, or allocating the revision at write time"* explicitly open — did not
price it.

### 5. This repository has now ruled the same direction twice — VERIFIED

The rule #582 asks for is not a new position here. It is enforced in SQL on the
cloud side since 2026-08-22
(`supabase/migrations/20260822190300_create_save_version_rpc.sql:6-8`, quoted in
full by ADR 0105), it was accepted for local saves on 2026-09-10 (ADR 0105), and
on the same day the owner ruled *"Odmawiaj nieaktualnego anulowania"* ("Refuse a
stale cancellation") for build-order cancellation, designed in
[ADR 0107](./0107-what-a-stale-build-order-cancellation-is-refused-for.md).
**A stale write is refused rather than silently applied** is therefore the
settled direction in three places, and what remains everywhere is mechanism.

### 6. LS-03 survives, and the fix for it is already written one module over — VERIFIED

The Delete button is wired straight to the destructive call with no dialog
between them: `src/ui/save-panel.ts:706` passes
`() => this.requestDelete(prison.prisonId)`, and `requestDelete`
(`:774-781`) opens with

  `await this.controller.deletePrison(prisonId);`
  (verbatim in `src/ui/save-panel.ts`).

`grep -i confirm` over `src/ui/save-panel.ts` returns nothing.
`PrisonSaveRepository.delete` (`src/persistence/local/repository.ts:435-444`)
then iterates `metadata.generationIds`, deletes each generation and the slot.
One transaction, no tombstone, no way back.

**And #582's own suggestion — a browser `confirm()` — is not what this
repository does.** The HUD already has an owner-ruled arm-then-confirm for the
one other irreversible player action, the staff roster dismissal of 2026-09-03:
`src/ui/hud/staff-panel.ts:1302` holds `armedDismissal`, `:1417-1430` renders
the armed row and its confirmation line, and the sentence it renders names its
subject and its consequence —

  `'hud.security.roster-dismiss-confirm': 'Dismiss {name}? Their wage stops and they do not come back.',`
  (verbatim in `src/content/default-locale-en.ts`).

That is the shape LS-03 asks for, already built, already ruled, and it needs no
dialog primitive.

## Decision

### 1. The revision is allocated at write time, inside the transaction that compares it

ADR 0105 named three candidates for FINAL-005 and chose none. Priced against
Context §4:

- **A lock or queue around the two save paths in `SessionController`.** Closes
  FINAL-005 only, and only within one controller. FINAL-006 (Context §2) is two
  controllers, so this leaves the measured case open by construction.
- **Route `saveNow()` through `AutosaveScheduler`.** Same bound, and it puts a
  player's explicit press behind a coalescing timer built for the opposite
  purpose.
- **Allocate the revision inside `writeGeneration`.** The caller submits an
  envelope and an *expected* current revision; the repository, inside the
  transaction it already opens, compares that expectation against
  `metadata.currentRevision` and stamps `metadata.currentRevision + 1` on the
  record it writes.

**Recommended: the third.** It is the only one of the three that is a property
of the store rather than of one writer, it lands at the choke point #1097
already established every durable write passes through, it costs no extra read,
and Context §4 establishes that re-stamping the number invalidates no checksum
and moves no schema version. **It also makes FINAL-005 and ADR 0105's option 2
one change rather than two** — which is the possibility ADR 0105 raised and
declined to choose, and the reason to choose it now is that the two are the same
comparison read from two ends.

`session.revision` then stops being an allocator and becomes a cache of what the
last write returned. `SaveResult`'s success arm already carries `generationId`;
it gains the revision actually written, and the two call sites that do
`session.revision += 1` today (`session-controller.ts:167` and `:720`) assign
from the result instead of incrementing. **That alone closes the third line of
the FINAL-004 measurement in Context §2**, because a stale writer's result can
no longer advance a counter it does not own.

### 2. Two tokens, and only one of them has to be durable

The two questions are different and neither subsumes the other, exactly as ADR
0105 says. What this document adds is which of them needs storage:

| | question | token | durable? | closes |
| --- | --- | --- | --- | --- |
| revision compare-and-swap | what did the writer last see? | `currentRevision`, already on the slot | **yes, and already is** | FINAL-005, FINAL-006 |
| session epoch | is the writer still the authorised session? | a counter minted per `adoptSession` | **no** | FINAL-004 |

**The epoch does not need to survive a save, and this is the document's main
claim.** Its whole job is to answer "is the writer that submitted this write
still the session this process authorised", and both parties to that question
are alive in one process at the moment it is asked: the stale capture is an
in-flight promise inside the same `SessionController`, and the session that
replaced it is the one in `this.session`. A token compared between two live
objects needs no field on disk. `SessionController` mints it in `adoptSession`,
the autosave closure captures it the way the deletion hold is captured today,
and the write is declined before it is issued if the epoch no longer matches.

**ADR 0105 priced option 3 as *"a new field to `PrisonSlotMetadata`, which is a
slot-schema change and therefore a migration question"*, and Context §2's
measurement is what makes that pricing avoidable rather than wrong** — it was
written against a reading of the epoch as a durable ordering token for two tabs,
and the measurement shows two tabs are already ordered by the revision CAS,
leaving the epoch with only the single-process job. This mirrors
[ADR 0107](./0107-what-a-stale-build-order-cancellation-is-refused-for.md)'s
Decision §2, which kept its own staleness counter out of the persisted shape for
the same reason and said so in a section headed *"Save format — explicitly not
touched, and why this is not a request"*.

**Consequence, stated plainly: none of the work this document designs needs
`AGENTS.md` reservation 2 released.** See "What the owner must approve" for the
one circumstance that would change that, and the Weakest claim for what would
force it.

### 3. Object identity rather than an id, because that pattern is already in this file

`deletePrison` (`session-controller.ts:802-828`) already captures the
`ActiveSession` object before its `await` and compares by identity after it,
under a docblock headed *"Why the guard after the `await` is an identity
check"* whose argument is precisely that `prisonId` cannot prove the session in
the field is the one the call began with. **FINAL-004 is that same argument at
the autosave boundary**, and the measurement in Context §2 is what the docblock
predicts. An implementer should reach for the pattern already in the file rather
than invent a second one.

### 4. What a mismatch does: refuse, and tell the caller what was found

ADR 0105's open question 1. Three candidates:

- **Refuse and drop.** The save silently does not happen. That is the failure
  ADR 0105 exists to prevent, in a new costume.
- **Refuse and retry.** Re-capture and re-submit against the revision just
  found. Correct for a *live* session that lost a race, and wrong for a stale
  one, which would re-submit state the player has already navigated away from.
- **Refuse and surface.** Return a distinct failure that names what was found,
  the way `create_save_version` hands back `cloudCurrent`.

**Recommended: refuse and surface, plus retry for exactly one case.** The
repository returns a `'stale-revision'` failure carrying the revision it found,
mirroring the cloud client's `conflict` arm
(`src/persistence/cloud/memory-client.ts:90-92`). `SessionController` then
distinguishes the two callers it has, which it can do because Decision §2 tells
them apart: an **epoch-current** writer that lost a revision race re-captures
and retries once (it is live, and its state is the newest there is); an
**epoch-stale** writer is dropped without a retry and without a report, because
it belongs to a session that no longer exists and has nobody to tell. A refusal
that reaches neither the player nor a retry is then only possible for a writer
that is already gone, which is the one case where silence is the right answer.

### 5. Whether a refusal reaches the player, and what it would say

ADR 0105's open question 2, and the part that is not ours.

**A manual save that is refused must say so.** The player pressed a button;
`describeSaveResult` already turns a `SaveResult` into a panel status
(`src/ui/save-panel.ts:741-748` routes `saveNow`'s result through it), so the
mechanism exists and what is missing is one sentence. **An autosave that is
refused must not.** It fires on a timer the player did not press, the retry in
Decision §4 handles the only case they could act on, and a periodic warning
about a condition they cannot influence is noise.

**`AGENTS.md` reservation 4 gives us the wording and not the promise**, so
candidate wording is offered here for the owner and **is deliberately not
written into `src/content/default-locale-en.ts` by this document or its
branch**. Each is offered against the code that would have to make it true:

> *"That save is out of date — the game is open somewhere else. Your progress
> here is safe; try again."*

True only if the retry of Decision §4 has already been attempted and refused,
and only if nothing has been discarded — both hold for the manual-save path
above, and the second half is the claim that needs an implementer to check
rather than assume.

> *"Could not save: this prison was changed elsewhere."*

Narrower, makes no promise about the player's own state, and is true of every
refusal Decision §4 surfaces. **Recommended of the two**, because the first
asserts "your progress here is safe", which is a promise about memory the save
path does not verify.

A third option is that a refused manual save needs no new sentence at all,
because it can be reported through the existing generic failure status. That
would keep this document entirely clear of reservation 4, at the cost of telling
the player "save failed" when the truthful sentence is available.

### 6. LS-03 is a separate decision, and this document says which one

ADR 0105's open question 4 asked whether the delete confirmation belongs with
the write-ordering work. **It does not.** It shares a player action with
RED-001 and shares nothing else: it needs no token, no transaction change and no
comparison. What it needs is the arm-then-confirm already built in
`src/ui/hud/staff-panel.ts` (Context §6) and one sentence naming the prison and
its generation count, which is reservation 4 again.

**Recommended: LS-03 becomes its own issue** citing this section and
Context §6, and the branch that implements this document does not carry it.
Recorded rather than dropped, because #582 filed the two together and a reader
of the issue is owed the reason they separate.

## Cost, priced

| item | touches | reservation |
| --- | --- | --- |
| write-time revision allocation + CAS | `repository.ts` (`writeGeneration`, `save`, `importSave`), `SaveResult`'s success arm, two `session.revision` assignments | none |
| session epoch | `SessionController` only — a private counter and the autosave closure | none, per Decision §2 |
| refusal reporting | `SaveResult` failure arm, `describeSaveResult` | none |
| a player-visible refusal sentence | `src/content/default-locale-en.ts` | **4** — the promise, not the wording |
| LS-03 | `save-panel.ts`, plus one string | **4**, same split |

Nothing above touches `supabase/migrations/` or the save format.

## Consequences for existing sentences

**`docs/PERSISTENCE.md:2558-2565` becomes false the day this lands, and this
document does not rewrite it.** Its *"What is out of scope here"* section
currently excludes *"any cross-tab/multi-writer concurrency control beyond the
single-process autosave/manual-save coalescing above"* and states that this
repository *"does not yet enforce optimistic concurrency"* on the revision.
Decision §1 enforces exactly that. The sentence is named here so the
implementing branch rewrites it in the same commit rather than leaving the
document to rot, which is this repository's most common defect
(`docs/AGENT_WORKFLOW.md` §4).

`save-schema.ts`'s own "not this issue" note about caller-managed revisions is
the same sentence one level down and needs the same treatment.

## What the owner must approve

1. **The mechanism of Decision §1** — allocation moved to write time, making
   FINAL-005 and ADR 0105's option 2 a single change. ADR 0105's acceptance
   bound the ordering and the token; it did not bind this.
2. **The refusal policy of Decision §4** — refuse-and-surface, with one retry
   for an epoch-current writer only.
3. **Whether a refused manual save gets a sentence at all, and if so which** —
   Decision §5. This is reservation 4 and is the only item here that is
   reserved. The recommendation is the second candidate.
4. **That LS-03 leaves this document** — Decision §6.
5. **Nothing about `supabase/migrations/` or the save format is requested**, and
   if an implementer finds that the epoch must after all be persisted, that work
   stops and comes back rather than proceeding — the standard
   [ADR 0096](./0096-what-a-way-back-is-and-what-guarantees-one.md)'s
   approval-list item 6 sets and
   [ADR 0107](./0107-what-a-stale-build-order-cancellation-is-refused-for.md)'s
   Decision §6 follows.

## Weakest claim

**That the session epoch never has to be durable (Decision §2).** Everything
that keeps this document outside reservation 2 rests on it, and the argument is
that both parties to "is this writer still current?" are live objects in one
process at the moment the question is asked. The measurement in Context §2
supports the *other* half — that two tabs are ordered by the revision CAS — but
it does not prove the epoch's own sufficiency, because it was produced with
`InProcessSessionHost` rather than the real `WorkerSessionHost`.

**What would falsify it:** a capture that survives its own *page*, not merely
its own session. If a write can be issued after the `SessionController` that
authorised it no longer exists — a `visibilitychange` or `pagehide` handler
flushing a save during teardown is the plausible route, and
`src/main.ts`'s lifecycle wiring is where to look — then there is no live object
left to compare an in-memory epoch against, and the epoch has to be a durable
lease instead. That moves this design inside reservation 2 and the branch stops.
The measurement that would settle it is a `WorkerSessionHost` run that unloads
the page between capture and write and observes whether the write lands.

**The second weakest claim is Decision §4's retry.** "An epoch-current writer
that lost a revision race can safely re-capture and retry once" assumes one
retry converges. Under sustained two-tab contention it may not, and the failure
mode of a retry that always loses is an autosave that never writes while
reporting nothing — silence again, by a different route. **What would change my
mind:** a run with two controllers autosaving against one store at the
production interval, measuring whether any slot goes more than two intervals
without a successful write. A bounded retry with a reported give-up would be the
repair, and it is cheaper to design now than to discover.

## Open questions

1. **Does `importSave` take the same CAS?** It writes a generation the player
   was handed rather than one a session produced, so "what did the writer last
   see" has no obvious answer for it. Decision §1 assumes it passes the revision
   it read; an implementer may find that import wants an explicit overwrite arm
   instead.
2. **What does a slot with no `currentRevision` compare against?** The field is
   optional and *"nothing repairs it retroactively; the slot's next durable save
   populates it"* (`src/persistence/local/slot-metadata-schema.ts:69-70`). The
   first write to such a slot therefore has nothing to compare and must fail
   open exactly once. That is correct and it is also a hole one tab can drive
   through on a pre-#1097 slot; whether to backfill on read instead is not
   settled here.
3. **Does the cloud's `current + 1` rule get its local sequence back?** The
   issue comment on #582 establishes that every overlapping pair burns a
   revision number permanently, leaving the local sequence offset from the
   cloud's for ever. Decision §1 stops new holes. It does not close the ones
   already on a player's disk, and nobody has decided whether that matters.
