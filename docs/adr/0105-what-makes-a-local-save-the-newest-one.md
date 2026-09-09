# ADR 0105: What makes a local save the newest one, and what happens when two writers disagree

> **The number was assigned from `docs/adr/README.md`'s own "Next free number"
> line, and this document pre-commits to renumbering.** `AGENTS.md`'s rule is
> that a number is not reserved until it appears in that index, and a branch
> nobody has merged is invisible from it — so if another branch turns up
> holding 0105, this file, its row and every citation of it get renumbered
> without argument, exactly as 0031, 0034, 0035, 0037, 0048, 0049, 0074, 0075,
> 0076, 0083, 0096, 0097, 0098, 0099, 0100, 0101, 0102, 0103 and 0104 each
> pre-committed.
>
> **The sweep was performed rather than trusted**, on 2026-09-09 from this
> worktree, cut from `origin/main` at `5d5df28a` (v0.0.559):
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
> `git ls-remote --refs --heads origin` (**269 heads**), then
> `git ls-tree -r --name-only <ref> -- docs/adr` over every one of them
> grepped for `^docs/adr/0105-`. **No head holds a 0105 document**, no head's
> `docs/adr/README.md` has moved its next-free line past 0105, and the highest
> numbered ADR file on any head is 0104.

## Status

**Proposed. Not self-approved.** `docs/AGENT_WORKFLOW.md` §3: *"**Propose an
ADR rather than deciding architecture inside implementation code, and never
self-approve one** outside a recorded delegation from the owner."*

Filed against [#582](https://github.com/woogitsu/lockstate/issues/582).

## Claim tiers used below

**VERIFIED** — read out of the tree at a named commit, command given.
**MEASURED** — produced by running something, output quoted.
**ASSERTED** — reasoning, marked as such so it can be attacked separately.

## Context

### 1. This project already decided this, and enforces it — on the other side of the boundary — VERIFIED at `5d5df28a`

The rule #582 asks for is not missing from Lockstate. It exists twice, and both
copies guard the **cloud**:

`supabase/migrations/20260822190300_create_save_version_rpc.sql:6-8`, in the
migration's own header:

> `p_new_revision` must be exactly `current_revision + 1`; anything else
> is a conflict the caller must resolve (**never a silent overwrite, never
> a silent "latest wins"**).

and `src/persistence/cloud/memory-client.ts:90-92`, the in-memory client the
tests run against:

```ts
const currentRevision = prison.currentVersion?.revision ?? 0;
if (newRevision !== currentRevision + 1) {
  return { status: 'conflict', cloudCurrent: prison.currentVersion };
}
```

**So "never a silent latest-wins" is already this project's written position on
durable saves.** It has been since 2026-08-22. What this document proposes is
not a new policy; it is applying the existing one to the one durable writer that
never got it.

### 2. The local writer does exactly what that rule forbids — VERIFIED at `5d5df28a`

`PrisonSaveRepository.writeGeneration` (`src/persistence/local/repository.ts`)
opens a `readwrite` transaction, reads the slot, writes the payload, and sets
the pointer:

```ts
currentGenerationId: generationId,
currentRevision: decoded.value.revision,
generationIds: retention.generationIds,
```

**Nothing between the read and the write compares the revision it found against
the revision it is about to store.** IndexedDB serialises the transaction, so
the write is atomic; atomicity is not the property in question. Last writer
wins, silently — the exact phrase the SQL header rules out.

### 3. `currentRevision` is already the right shape and is not used as a guard — VERIFIED at `5d5df28a`

`currentRevision` landed on 2026-09-09 (`b43269bb`, #1105). Every reader in the
repository, found by grepping the whole tree rather than the module: it is
**written in one place** (`repository.ts`, the pointer write above) and **read
in one place** (`src/ui/account/save-list-projection.ts:156`, `const
localRevision = slot.currentRevision;`), where it classifies cloud-sync drift.

It is therefore *already* a durable, per-slot record of "the revision this
slot's current generation actually has" — the exact token an optimistic check
needs — and nothing currently compares it to anything before writing. **This
document proposes no new field.**

### 4. There are at least three ways two writers appear, and only one is exotic — VERIFIED

- **A second tab.** `SessionController` and its host are constructed once per
  page (`src/main.ts`, `bootPersistence`), so two tabs are two independent
  writers sharing only IndexedDB. `docs/PERSISTENCE.md:2560-2565` already names
  this and excludes it **deliberately**, under a heading that says so —
  *"### What is out of scope here"* (`:2558`): *"any cross-tab/multi-writer
  concurrency control beyond the single-process autosave/manual-save
  coalescing above — `revision` is caller-managed and this repository does
  not yet enforce optimistic concurrency on it, matching the "not this issue"
  scope in `save-schema.ts`'s own documentation"*.
- **An autosave that outlives its session.** `AutosaveScheduler.dispose()`
  (`src/persistence/local/autosave.ts:140`) clears pending **timers** only.
  A capture already past `state = 'saving'` runs to completion against the
  state it read.
- **Autosave and a manual save racing** for the same revision number (#582
  FINAL-005).

Only the first needs a second tab. The other two happen in one.

### 5. What #1112 already fixed, so this document does not re-argue it — VERIFIED

`closeSession()` now stops the runtime host (#582 RED-001) and generation ids
are `crypto.randomUUID()` (#582 FINAL-022). Both were pure correctness and
neither needed a design. **Neither closes anything below**: stopping the host
does not stop a capture already in flight, and a unique key does not make a
stale write stale-aware.

## Decision

**What token gates a local durable write, and what happens on mismatch.**

### Option 1 — do nothing, and write down that local saves are last-write-wins

`docs/PERSISTENCE.md` already says it. The cost is that the sentence stays true
while the cloud path says the opposite, so the project holds two positions on
the same question depending on which store you are looking at.

### Option 2 — compare-and-swap on `currentRevision`, refusing on mismatch

`writeGeneration` reads the slot inside its existing transaction; add one
comparison against an expected revision the caller supplies, and refuse when it
disagrees. This is `create_save_version`'s rule, transposed. Its cost is that
every caller needs a mismatch path, and there are two (`save()`, `importSave`).

### Option 3 — a session epoch, refusing writes from a superseded session

A monotone token minted per `beginSession` and carried on every write. Catches
the in-flight-capture case (an autosave from a closed session carries the old
epoch) that a revision CAS does not, because a stale capture may hold a
perfectly consecutive revision. Cost: a new field, and it does not by itself
order two live tabs.

### Option 4 — both: epoch for "who is writing", revision for "what they saw"

They answer different questions and neither subsumes the other. The cost is two
concepts.

### What this document recommends

**Option 2 now, option 3 as the direction, option 1 rejected.**

2 is the one that transposes a rule the project has already committed to, needs
no new field, and closes the pointer write and FINAL-005. 3 is what FINAL-004
actually needs and should not be smuggled into 2's change. 1 is rejected because
"two positions on the same question" is the defect this file exists to prevent,
not a resting state.

**The mismatch path is the open question and it is not this document's to
settle alone** — see Open questions 1 and 2.

## Cost, priced

Option 2 touches `writeGeneration` and its two callers; the comparison itself is
one branch inside a transaction that already reads the slot, so it costs no
extra round trip. Option 3 adds a field to `PrisonSlotMetadata`, which is a
slot-schema change and therefore a migration question.

## Consequences for existing sentences

**A refusal a player can see needs a sentence, and that sentence is the owner's
under `AGENTS.md`'s fourth reservation** — the wording has been ours since
2026-09-04, the decision to make the promise at all has not. This document
authors none and recommends none.

## The weakest claim this document makes

**That a revision CAS is implementable without a false-refusal problem.**
`revision` is caller-managed (`docs/PERSISTENCE.md`'s own words), and #582
FINAL-005 reports autosave and manual save allocating the *same* revision — so
the token this option compares is itself not currently guaranteed monotone in
one process. If FINAL-005 is fixed first the claim holds; if it is not, option 2
would refuse writes that are not actually stale. **The order matters and this
document may have it backwards.**

What would change my mind: a run showing two same-revision allocations in one
session after #1112, which I have not performed — #582's own comment reports it
against an earlier tree and I reproduced neither.

## What would change my mind

- **Evidence that a second tab is out of scope for this game.** If saves are
  never opened twice, FINAL-006 stays a documented exclusion and options 3 and 4
  lose most of their value.
- **An existing epoch I missed.** `grep -rniE "epoch|compare-and-swap|\bcas\b|lease" src/persistence/`
  returns nothing, but that is a search for words rather than for the concept.

## Open questions

1. **What does the local side do on mismatch?** The cloud answers `conflict` and
   hands back `cloudCurrent` for the caller to resolve. The local caller has no
   such path: `save()` returns `SaveResult`, and a refused autosave has nobody to
   tell. Refuse-and-drop, refuse-and-retry, or refuse-and-surface are three
   different games.
2. **Does a refusal reach the player?** If it does it needs a sentence, which is
   reserved. If it does not, a save can silently not happen, which is the failure
   this document is otherwise about.
3. **Is FINAL-006 still a deliberate exclusion?** `docs/PERSISTENCE.md:2560`
   says it is, under a heading reading *"What is out of scope here"*. Nothing here overrides that; the question is whether it should
   stay so now that the local/cloud asymmetry is written down.
4. **Does LS-03 belong here?** Delete has no confirmation —
   `src/ui/save-panel.ts:706` wires the button straight to
   `requestDelete` (`:774`), and `grep -i confirm` over that file returns
   nothing — and what protects a destructive action is adjacent
   to what protects a durable write — but it is a UI decision and might be its
   own.
5. **Does #853 belong here?** `CancelBuildOrder` carries only an `orderId`, so a
   stale cancel cannot be refused. That is the same shape one level up — a
   command that should carry what the caller believed — and may be the same ADR
   or a sibling.
