# One decision is awaiting approval — and where an accepted decision contradicts the code

This file is for the repository owner and nobody else. It exists because
`docs/adr/README.md` reports statuses and `tests/foundation/adr-numbering-contract.test.ts`
keeps that report honest, but **neither can tell you whether a status is true
about `main`** — the index compares a document to a table, not a decision to an
implementation.

**Nothing here changes a status.** A status moves in the ADR and in the index,
never in this file. What changed with this revision is what the file is *for*:
§1 records **all thirteen** flips, §2 holds **the one decision awaiting approval —
ADR 0031** — above the account of why the queue had been emptied the first time
and what that bought (ADR 0029 was accepted on 2026-08-26 and its entry deleted;
0031 arrived immediately after), and everything after it is the residue — one genuinely open
decision, one watch item, and the gaps between an accepted decision and the
code. §6 used to be the inventory of stale sentences the flips left behind;
**they are corrected, and that class is now asserted by a test**, so what it
holds instead is the account of what moved, what may not be touched, and what
the test cannot see. Deciding is still the owner's; this file only makes the
next decision cheap.

Re-anchored at `main` @ `dbe271f` (**v0.0.98**), and **the warrant is stated
precisely because it is not the same warrant the last two anchors carried**:
§§3-6 were read in full at `83c3121`, and the delta `83c3121..dbe271f` was read
against them by the method under *"How to extend this anchor cheaply"* below. So
every claim below has been read from disk at `83c3121` or later, and every claim
whose evidence the delta touched has been read at `dbe271f`. Entries cite symbols
rather than line numbers where a citation would otherwise drift on the next edit
(the precedent is #309) — and the two anchors' worth of line numbers that drifted
anyway are the argument for doing it more.

**This line said `4e3976d` (v0.0.65) for twelve releases, and the file carried a
second, older anchor underneath it.** Two commits after that re-anchor — #331
and #335 — edited §5 without moving this line, so the file's declared anchor was
older than parts of the file itself. Meanwhile §§3-5 said "re-verified at
`4ed571f`" in five places, and `4ed571f` is **v0.0.58**, seven releases older
again. A reader had two dates to reconcile and no way to tell which entry had
been checked when, which is the failure mode this whole file exists to prevent.
Both anchors are now the same commit, every "re-verified at" below names it, and
`tests/foundation/adr-status-queue-anchor-contract.test.ts` asserts that they
stay one commit and that the version this line names does not fall far behind
`package.json`. That test cannot tell whether a sentence here is true — nothing
mechanical can — but it can tell that the file has stopped being re-read, which
is what actually went wrong.

**And it happened again, which is why that test exists rather than a promise.**
The line above said `cddaebb` (v0.0.77) for eleven releases. Two commits in that
window edited this file — #356, which accepted ADR 0029 and emptied §2, and #367,
which put ADR 0031 in it — and **neither touched §§3-6 or moved the anchor**, so
the declared anchor was once more older than parts of the document it warranted.
This is the first re-anchor the gate asked for rather than a human noticing: it
went red at v0.0.88 with *"11 releases of history that no entry in that file has
been read against"*. §§3-6 were then re-read entry by entry against `83c3121`,
which is the work the budget stands for and not the moving of this line. What
that reading found is recorded where it belongs, and it is not a formality: **six
claims in §§3-6 were withdrawn as false**, three counts in prose were wrong, and
ten `file:line` citations no longer landed where they said. The largest is the §5
entry on ADR 0027, which said that ADR's subject was *"unreachable in any session
a player can start"* — measured here, two prisoners share one cell through four
commands a player sends, so the entry is withdrawn and replaced by the
measurement that refutes it. Two more sentences still turned on ADR 0029 being
unapproved and now name ADR 0031.

**And a third time, ten releases later, on the same day.** That re-read landed at
v0.0.96 and named `83c3121` (v0.0.88) — the release commit its branch was cut
from, which was already eight releases old when the branch merged. **An anchor
moved to a commit that is already old spends most of its budget on arrival**, and
this one spent eight of ten before anyone could read it: the gate stood at exactly
10 with the next release commit — which `.github/workflows/version.yml` produces
after every merge and which starts no CI run — guaranteed to break it. So this
re-anchor is not a second full re-read. It is the **delta** `83c3121..dbe271f`,
read against the dependency set below, and that is the practice this file is
adopting rather than a shortcut taken once.

### How to extend this anchor cheaply, and what it costs to be allowed to

**§§3-6 do not depend on the tree at large. They depend on an enumerable set of
files**, and every claim in them cites one. The set, in full:

- `package.json` and `supabase/migrations/**` (§3);
  `.github/workflows/migrate-database.yml`, `docs/DEPLOYMENT.md` and
  `wrangler.jsonc` (§4).
- `docs/CLOUD_SAVE.md`, `docs/TRUSTED_SERVICES.md`, `docs/HUD_PROJECTIONS.md`,
  `README.md`, `docs/adr/README.md` and
  `docs/research/2026-08-25-economy-rate.md`.
- ADRs **0002, 0008, 0009, 0010, 0012, 0013, 0015, 0016, 0017, 0022, 0023, 0025,
  0026, 0027, 0028, 0029, 0031**.
- Fifteen files under `src/`: `ui/hud/messages.ts`, `ui/hud/projection.ts`,
  `ui/hud/hud.ts`, `ui/hud/build-panel.ts`, `content/procurement-catalog.ts`,
  `content/room-catalog.ts`, `simulation/economy/income.ts`,
  `simulation/rooms/zoning.ts`, `simulation/rooms/topology.ts`,
  `simulation/worker/state-machine.ts`, `simulation/protocol/commands.ts`,
  `simulation/protocol/types.ts`, `simulation/construction/definition.ts`,
  `simulation/prisoners/intake-system.ts`,
  `services/challenges/verification.ts`.
- Six under `tests/`: `foundation/adr-status-reference-contract.test.ts`,
  `foundation/unconsumed-command-contract.test.ts`,
  `unit/ui-hud-messages.test.ts`, `unit/objects-room-capacity.test.ts`,
  `unit/entity-generation-wrap.test.ts`,
  `unit/prisoners-intake-system.test.ts`.

**So extending the anchor is `git diff --name-only <anchor>..HEAD` intersected
with that set, and then reading only the intersection.** Run for
`83c3121..dbe271f`: **53 files changed, 15 of them in the set** — three docs, six
ADRs and `docs/adr/README.md`, `package.json`, two new migrations, and **three of
the twenty-one files under `src/` and `tests/`**. Reading fifteen files is not
reading eighty citations, and that difference is what makes an anchor extensible
instead of a thing nobody has time to move.

**What this is not licence to do.** A delta note is a claim and it needs an
entry's standard: *"the delta touched nothing §§3-6 depend on"* is a sentence
somebody has to be able to check, so it must name the diff it ran and the set it
intersected, and it is false the moment the set is stale — an entry that starts
citing a file not listed above has to add it here in the same commit, exactly as
landing a change means updating its entry. **And a small intersection is not a
small consequence.** Three files under `src/`/`tests/` moved in this delta and
they falsified **three claims**, one of them a claim the previous re-read had
written eight releases earlier. The cheap step is finding *what to read*. Nothing
here licenses deciding that nothing needs reading.

A note on keeping this file true, since it is the kind of document that rots
silently: an entry's evidence is a claim about `main`, so **landing the change
an entry describes means updating that entry in the same commit**, exactly as
moving a status means moving its index row. #295 changed the code and ADR 0012
and left this file behind, which is how the old entry 7 came to be false for two
releases — a correction that itself had to be landed separately, at `b653b93`,
before the entry could be acted on. Nothing mechanical can catch that: the gates
over `docs/adr/` check statuses against documents — the index against the ADR,
and every sentence in the corpus against the ADR — and none of them checks a
status against code. It is a habit, not an assertion.

The one thing that *is* now asserted is narrower and is the failure that
actually happened: the anchor line above stopped moving.
`tests/foundation/adr-status-queue-anchor-contract.test.ts` requires this file
to declare exactly one anchor commit, requires every live "verified at" below to
name that same commit, and fails when the version the anchor names falls more
than ten releases behind `package.json`. It proves nothing about whether a
sentence here is true — moving the anchor without re-reading anything passes it
— so it is a bound on unreviewed history and not a substitute for the habit.

---

## 1. What was decided, and when — all thirteen

Every flip happened on **2026-08-25**, in three commits, each flip as the pair
the suite requires: the `Status` line in the ADR and that ADR's row in
`docs/adr/README.md`.

### The six retroactive approvals (#308)

The entries this file was originally written for. Each was a decision the code
had already been built on while the document still said it was awaiting
approval.

| ADR | Was | Is |
| --- | --- | --- |
| [0012](./0012-derived-identifier-reproducibility.md) | Proposed | **Accepted** |
| [0013](./0013-free-tier-cloud-save-capacity.md) | Proposed — pending human approval | **Accepted for §§1-4; §§5-6 remain Proposed** |
| [0014](./0014-art-storage-and-runtime-asset-delivery.md) | Proposed | **Accepted** |
| [0015](./0015-actor-identity-allocation.md) | Proposed | **Accepted** |
| [0016](./0016-migration-delivery-mechanism.md) | Proposed — pending human approval | **Accepted**, retroactively |
| [0021](./0021-http-response-security-headers.md) | Proposed — pending human approval | **Accepted** |

Two of those status lines say more than a bare keyword, because a bare
replacement would have left a true status next to a stale sentence. **0012**
records the remedy #295 landed (`nextGlobalId` is a local of
`recomputeGlobalTopology`, so ids are handed out from 1 in canonical sorted order
on every recompute) and names the residue that was still open in code. That
residue — `chunkTopologies` was never evicted — has since closed too, in #324,
so §5 no longer carries it and what remains open there is the world-streaming
policy rather than the eviction. **0015** says 0012 is
Accepted, because the same commit falsified its old "Extends ADR 0012, which is
Proposed".

### The three room decisions (#314)

The three entries this file carried as *genuine open decisions* — shipped
against not at all, or only in part.

| ADR | Was | Is |
| --- | --- | --- |
| [0022](./0022-room-zoning-surface.md) | Proposed — pending human approval; amended 2026-08-25 | **Accepted, 2026-08-25 — as amended** (Decision §1 superseded by that amendment) |
| [0023](./0023-room-occupancy-authority.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as amended**; *not* superseded by 0028 |
| [0028](./0028-object-placement-and-derived-room-capacity.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |

What was signed for **0022** is the amendment (the Rooms tab, shipped in #312),
not the Decision text, which is left verbatim as the historical record. **0023**
was kept accepted rather than superseded so that its authored *nominal* fallback
stays available if object placement proves too large — and because it was kept
alive it could not be left stating something false, so it carries a dated
amendment recording that a capacity-only fallback is a **no-op**: the capability
half of `findAvailable`/`findBestAvailable` is what refuses a zoned cell, and a
nominal capacity of 2 would leave every arrival accruing
`accommodationBacklogTicks` exactly as `capacity: 0` does. **0028** got the
status line and nothing else: editing its phases in the commit that approved
them would have been the approval deciding something the owner did not.

### The four in this commit

| ADR | Was | Is |
| --- | --- | --- |
| [0024](./0024-protocol-fault-recoverability.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |
| [0025](./0025-guard-hiring-surface.md) | Proposed — pending human approval | **Accepted, 2026-08-25** |
| [0026](./0026-entity-id-lifetime.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as the framing and the tripwire; its three questions stay open** |
| [0027](./0027-cell-sharing-assessment.md) | Proposed — pending human approval | **Accepted, 2026-08-25 — as the mechanism; its three questions stay open** |

**0024 dragged the one thing in the corpus that had to move with a status, and
that was the point of it.** Accepting it deleted the implementation note in
`docs/adr/0006-simulation-worker-adapter.md` ("a protocol decode error no longer
reaches state 5") and narrowed ADR 0006 state 5's clause to an unhandled
exception, with a one-sentence cross-reference to 0024 for where a decode error
goes instead. That note existed precisely so an Accepted ADR would not be amended
on a Proposed one's authority; the acceptance supplied the authority and the note
had nothing left to record. Nothing else in the corpus depended on it —
re-verified by grep at this commit: the only other references to it were 0024's
own Status and Follow-up, both rewritten in the same commit, and the two
remaining notes of that shape (`0006`'s states 1-2 and `0003`'s decision 4)
belong to the handshake gap in §5 and are untouched. `main` needed no change in
`src/` to comply with 0024, because the code that proposed it already
implemented it.

**0025 sets no wage figure and settles nothing wider than its surface.** The
approval covers three separable things — the Staff panel in the Security tab's
rail slot, a one-off charge read from `wageBand.minPerDay` in the treasury's
minor units, and a producer offering `staff-role.guard` against a command that
accepts any *declared* role. Prices stay with issue #29, per ADR 0017 decision 5.
All **seven** items in that ADR's *What this decision does not settle* remain
open and were deliberately not touched: payroll, where in a band an individual
sits, dismissal and refunds, undoability, which roles the surface offers, whether
the panel lists who is hired, and whether the arrival tile must be owned, in
bounds or reachable.

**0026 and 0027 are accepted as framings, not as answers**, and their status
lines say so rather than leaving a reader to discover it. 0026 approves that its
three questions are one decision, that the defect is pinned in the suite as a
labelled tripwire rather than fixed quietly, and that #31 is where the answers
get taken; options A, B and C and question 3's three shapes are exactly as open
as before. 0027 approves the mechanism that landed — the rating seam on
`findBestAvailable`, one term, occupants sorted ascending by entity id, advisory
and stateless — and leaves its three questions open. **The owner was told when
approving 0027 that its subject was "unreachable in any session a player can
start"**: that a zoned room derives capacity zero while nothing is placed in it,
so nobody shares a cell and the decision's effects are not observable until a
shipped session can place an object into a zoned room. **That is recorded here as
what was said, because it was wrong** — and wrong already on the day it was said,
not overtaken since. 0028's phase 1 had shipped, a player can place a bed, and
§5's rewritten ADR 0027 entry carries the measurement: two prisoners housed in
one `room.cell` instance through commands only a player sends. What the approval
does leave open is narrower and is in §5 — the *rating* between two eligible
cells is exercised nowhere, because no shipped session yet furnishes two.

---

## 2. The queue is empty

**This heading has now read "empty", "exactly one entry: ADR 0029", "empty
again", one entry, two, one, and now empty for the third time** — 0031, 0032,
0033 and 0007's amendment were all accepted on 2026-08-26. Two of those four
never appeared here at all, which is the failure recorded at the foot of this
section, and the churn in this heading is the point rather than noise: it is the
only place a reader can see how fast this corpus moves. The second is not a new
document: it is an amendment to ADR **0007**, which is Accepted and stays
Accepted. An amendment is queued here for the same reason a new ADR is — it
decides something the sections above it do not, and nothing else in the corpus
would tell the owner that a decision is waiting. `adr-numbering-contract.test.ts`
counts documents by their `Status` line, so an amendment inside an accepted ADR is
invisible to every mechanical gate there is; this row is the only thing that says
it exists. 0029 was accepted on 2026-08-26 and
its entry was deleted, which is what this section's own rule prescribed — the
entry said *"this entry is deleted"* as part of the exact recipe for accepting
it, and following that recipe is the whole point of writing one. 0031 arrived
immediately after, so the row below is a different decision rather than the same
one returning.

The rule this section states — *"any commit that adds an outstanding ADR adds an
entry here in the same commit, giving the evidence, what settling it commits the
project to, and the exact line that would replace the status"* — is followed by
0031, and the account of why the queue was emptied is kept below unchanged,
because it is the argument for why one row is worth reading.

What the round trip is worth recording for: 0029 arrived on the same branch as
its implementing code, and **it sat `Proposed` on `main` for a day while that
code was already shipping.** That is precisely the fragile case this section
names, met in practice rather than in theory. The queue did its job — the row was
the reason anyone knew a decision was outstanding — but the gap between the code
landing and the status moving is the cost, and it is not zero.

The account of why the queue was emptied the first time is kept below unchanged,
because it is still the argument for why one row is worth reading.

### ADR 0031 — accepted 2026-08-26, and the entry is deleted

Following this section's own recipe: the decision was settled, the accepted count
moved by one, and the entry it replaced is gone rather than annotated. What is
kept is the one thing the entry could not have predicted, because a reader of
0031 needs it and the deleted entry is where they would have looked for it.

**It was accepted with a condition, not plainly.** Open question 4 of that ADR
("is the catalogue the right donor?") is promoted to *blocking*: the catalogue
needs a surface of its own before more rows arrive. The entry deleted here argued
the trade on a `BUILDABLE_REGISTRY` of two rows; the amendment at the foot of the
ADR re-argued it at four and reported three of four behind a scroll at 900x600;
ADR 0028 phase 4 then landed **twenty-one**. At the row height and list box that
ADR measured, that is one row of twenty-one visible — derived from its own two
figures, not re-measured, and labelled as derived in its Status.

The generalisable part, and the reason this closure is longer than "deleted": a
queue entry states the price of a decision *at the moment it is written*, and
nothing re-reads it when a later change multiplies that price. This one was
multiplied twice by an unrelated ADR's phases, between being written and being
approved. **A queue entry whose argument rests on a count should name the count
and where it lives**, so that the next reader can check it in one command rather
than trusting the number. This entry did not, and the acceptance had to
reconstruct it.
### ADR 0007's amendment — accepted 2026-08-26, and the entry is deleted

Following the exact edit this entry itself prescribed: the amendment's heading
lost `(awaiting approval)`, the sentence saying it was unapproved is gone, and
this entry is deleted. **No `Status` line moved and no row in
[`README.md`](./README.md) changed**, because 0007 was Accepted throughout and an
amendment to it does not touch that — which is precisely why this row was the
only record that a decision was outstanding.

What is kept, because deleting it would leave nothing behind: the approval is now
recorded **only in the amendment's own opening paragraph**. Every mechanical
check in this repository counts documents by their `Status` line, so from this
commit onward there is no gate, no index row and no queue entry that could tell
anyone this decision was ever pending, or that it was decided. That is the
structural gap this entry existed to cover, and closing the entry re-opens it.

The generalisable part, since this is the second time in one day the same shape
has cost something: **a decision that changes no `Status` line has no home in
this corpus.** 0032 and 0033 were both approved without ever getting an entry
here because the file was held by other work; this amendment got one and it
worked exactly as designed. The difference was not diligence, it was contention —
so the fix is a queue two commits can append to without conflicting, not more
care.

### Four ADRs have now been accepted without ever appearing in this queue

0032, 0033, **0034 and 0035**. All four the same way, and the rule has now failed
more often than it has worked, so the count is the finding rather than any one
instance.

0034 and 0035 were written in the same hour by two agents, each told this file was
out of scope because a third was rewriting it. Both did exactly what 0032's
precedent prescribes — debt recorded in the ADR's own Status, entry quoted
verbatim in the pull request — and both were then accepted before anyone was free
to write the entry. **The entries were never wrong, never disputed and never
written.**

What the four cases together show, which no single one did: the rule's cost is
paid by whoever holds the file, and its benefit accrues to a reader who may never
arrive. A rule with that shape is not obeyed less carefully over time — it is
obeyed until the first collision and then routed around, correctly, by people
doing the right thing. **The fix is structural and it is now overdue**: one file
per entry in a directory, so two commits can add two entries without touching each
other, and so "the file is held" stops being a reason.

The section that follows records 0032's case in the detail it was written with,
and is kept as the first instance rather than folded into this count.

### ADR 0032 was accepted without ever appearing in this queue

Recorded because it is this section's own rule failing, and the rule is worth
more than the appearance of a clean record.

[ADR 0032](./0032-incident-consequences-and-classification-review.md) — what an
incident costs the prisoner who was in it — arrived with its implementing change
on 2026-08-26 and was accepted the same day. **It never had an entry here.** Its
author could not add one: this file was held by concurrent work, so the
instruction they were given put it out of scope. They did the next best thing —
recorded the debt in the ADR's own Status, recorded it again in
[`README.md`](./README.md), and quoted the entry they would have written in the
pull request — and the debt was then paid by nobody, because the acceptance
arrived before the file was free.

Two things follow, and neither is "try harder".

**The rule as written is unsatisfiable under concurrency.** *"Any commit that adds
an outstanding ADR adds an entry here in the same commit"* assumes one writer.
With two changes in flight, one of them must either edit a file another is
rewriting or break the rule; the author chose to break it visibly, which was the
right call and should not be held against them. If this rule is to survive, the
queue needs to be something two commits can append to without conflicting — a
file per entry in a directory, most likely — or the rule needs to say what to do
when the file is held.

**An ADR can be approved faster than its queue entry can be written.** This
section is addressed to the owner and exists so a pending decision is visible;
0032 was visible enough to be decided without it. That is not evidence the queue
is unnecessary — 0031 sat for a day *with* an entry — but it is evidence that the
queue is not the only path, and a rule whose violation costs nothing observable
will be violated again.

### Why the queue was emptied, and what that bought

**Before 0029, no ADR in `docs/adr/` was `Proposed`.** Twenty-seven documents,
twenty-seven `Accepted` statuses — several with a qualifier the document itself carries, which
is the honest form for a decision accepted in part (0013 §§1-4, 0026's framing,
0027's mechanism). Verified by reading each document's own status line and its
index row, not by trusting a table.

Two things follow, and the second matters more than the first.

**The count is zero rather than untracked.** The previous revision of this file
had to record that its own premise did not hold: the three room flips were
expected to empty the queue and left four behind. This one closes that, and it is
worth saying why the four were missed. **0025, 0026 and 0027 had never had an
entry in this file at all.** Each arrived with the change that wrote it — 0025
alongside the hiring surface it designs (#302), 0026 and 0027 as a pair in #299 —
rather than being drafted against `main` and left for review, so a file written
for the *retroactive-approval* problem never picked them up. That was a real gap
in this file's coverage, not a small one: three of the four remaining Proposed
ADRs were invisible to the only document that was supposed to be tracking them.
The gap is closed by the queue being empty, and the way to keep it closed is
stated below.

**The next `Proposed` ADR is a signal on its own.** While there were four or
eight, a new one was one of a crowd and nothing distinguished "awaiting a
decision" from "nobody has looked at this in a fortnight". From now on a
`Proposed` row in `docs/adr/README.md` is the only one, so it reads as a request
addressed to the owner rather than as background. That is the property this
exercise was for, and it is fragile in exactly one way: an ADR that arrives with
its own implementing change, as 0025, 0026 and 0027 did, is `Proposed` on `main`
from the moment it merges and can sit there unnoticed. **The rule that keeps this
true is therefore mechanical about the trigger rather than about the queue: any
commit that adds a `Proposed` ADR adds an entry here in the same commit**, giving
the evidence, what settling it commits the project to, and the exact line that
would replace the status. There was nothing to inherit — the queue was empty, so
the next entry would be the whole of it. **That next entry is ADR 0029, above,
and it arrived in exactly the predicted shape: with its own implementing change.**

`docs/adr/README.md` and the root `README.md` were both corrected in this commit
to stop claiming a queue; §6 records what was corrected and what was left.

---

## 3. Still outstanding: ADR 0013 §§5-6

The one genuinely open decision left in the corpus. 0013 is **Accepted for §§1-4
only**, and that is not a formality: two of its six decisions are enforced in the
database and two are explicitly absent.

| ADR section | state | evidence |
| --- | --- | --- |
| §1 five free slots, enforced by the database | **shipped, accepted** | `base_save_slot_capacity()`, `account_save_slot_capacity(uuid)` |
| §2 a trigger, with an RPC as the front door | **shipped, accepted** | `enforce_prison_slot_capacity()` and its trigger |
| §3 over-capacity degrades read-only | **shipped, accepted** | the exception's `hint` |
| §4 4 MiB per-save payload bound | **shipped, accepted** | `max_save_payload_bytes()` — `as $$ select 4194304 $$;` |
| §5 256 MiB total per account | **absent, still Proposed** | no total-bytes function, trigger or column anywhere in `supabase/migrations/` |
| §6 20 revisions retained per prison | **absent, still Proposed** | no retention or pruning logic anywhere in `supabase/migrations/` |

Functions in that table live in
`supabase/migrations/20260823100000_bound_free_tier_capacity.sql`, and every row
of that table was re-read against the file at this commit: `:45` and `:91`,
`:150` with its trigger at `:188`, the exception's `hint` at `:178`, and
`:71-73`'s `as $$ select 4194304 $$;`. Both
absences were re-verified at `dbe271f` by grepping the whole
`supabase/migrations/` tree for a total-bytes, retention or pruning mechanism
(`total_bytes`, `retention`, `prune`, `268435456`, `max_revisions`); there is
none, and the single hit for *"retention"* is a forward reference discussed below
rather than a mechanism.

**The claim underneath that one has now moved, and it is the first time this
section has had to change for a reason other than nobody deciding anything.**
This entry said the directory *"holds the same twenty-one files it held at
`4ed571f`"* and that `git diff 4ed571f..main -- supabase/migrations/` *"is
empty"*. It holds **twenty-three**, and that diff is no longer empty: **#382
added two** — `20260826120000_revoke_ambient_table_privileges.sql` and
`20260826130000_server_stamp_updated_at.sql`. Neither touches capacity. The
base migration this section's whole table cites is byte-identical (`git diff
83c3121..main` over `20260823100000_bound_free_tier_capacity.sql` is empty), so
every row above still stands; what changed is a sentence this entry used as a
shortcut for "nothing here has moved", which is exactly the kind of sentence that
stops being true without anybody deciding to make it false. **And the release
count said "eighteen" for twelve releases and now reads thirty** — a release
count in prose is a claim about `main` that goes stale on every merge, so it is
the number to check first and the reason the anchor above has a test.

**One thing in #382 bears on §6 without deciding it, and is the reason the
retention grep is no longer silent.** `20260826130000_server_stamp_updated_at.sql:68-76`
argues that the exposure of a client-writable `updated_at` is *"a **future**
reader: a retention or cleanup job keyed on `updated_at` (docs/CLOUD_SAVE.md
names 'cleanup of abandoned anonymous accounts' as open work, ADR 0013 sections
5-6)"*, and closes it now *"because the column becomes load-bearing in the commit
that first reads it, not in the commit that first writes it"*. So whichever
retention policy §6 eventually gets, **the column it would key on is now
server-authoritative** — a constraint the decision inherits rather than an answer
to it. §6 is still undecided and still unimplemented.

**§5 — 256 MiB per account.** Undecided and unimplemented. The ADR's own §5
records that it depends on the revision-depth decision below and on the
JSONB-versus-Storage question, so it cannot be settled ahead of §6.

**§6 — 20 revisions per prison.** Undecided and unimplemented, and the number
*is* the decision. The arithmetic that originally justified it is wrong: 20
revisions at `DEFAULT_AUTOSAVE_INTERVAL_MS`
(`src/persistence/session/session-controller.ts`, `30_000`, re-verified at this
commit) is **ten minutes**, not *"roughly a day of ordinary autosaving"* — and §6
computes 2,880 rows a day from that same constant five lines earlier, so a day of
ordinary autosaving is 2,880 revisions, **144× the proposed number**. The ADR
already records this and withdraws the justification while deliberately leaving
the figure at 20, because moving it is the owner's call (issue #274, Q2). So what
is open is not the discovery but the policy: keep 20 and accept that "restore an
earlier generation" means the last ten minutes of autosaving, or keep "roughly a
day" as the requirement and raise the number. **Settle that before accepting
§6.**

Accepting §§1-4 deliberately did **not** approve 256 MiB or 20 revisions.

---

## 4. The live risk to watch: ADR 0016 §2 is binding and nothing enforces it

This is the one thing the flips *added* to the risk surface, and it belongs at
the top of any future audit. None of the seven flips after #308 touches
deployment, SQL or a live hosted mechanism, so nothing here moved with them.

Accepting 0016 makes its §2 a **binding constraint**: production is a separate
Supabase project with a distinct project ref, and the Supabase GitHub integration
is never reconfigured to point at it. The ADR says plainly why that is fragile:

> Recorded as a constraint precisely because nothing enforces it mechanically.

The mechanism it constrains is live and irreversible. Migrations reach the hosted
Supabase staging project *"automatically, on every merge to `main`"* with gating
*"none"* (`docs/DEPLOYMENT.md`, "Automated deployment"), rollback is not
automated, and the trigger is the merge rather than the diff — PR #87 touched no
file under `supabase/migrations/` and nine migrations were applied anyway
(`docs/DEPLOYMENT.md:143-147` for the table, `:159` for the 71-second window and
`:161` for #87 itself, all re-read here). The half of the decision that *is* in
this repository stays verified at `dbe271f`:
`.github/workflows/migrate-database.yml` is `workflow_dispatch:` (`:34`) with no
`push:`, requires a typed `confirm_project_ref` (`:41`), and its apply job is
environment-gated (`:65`). **`git diff cddaebb..main` over that file is still
empty, and so is `git diff 83c3121..main`** — neither this workflow nor
`docs/DEPLOYMENT.md` appears in either delta, so nothing in this section has
moved across twenty-one releases. That is the outcome to record rather than to
leave implied, because a watch item nobody re-checked is indistinguishable from
one that did not move. The one thing that *did* move nearby is #382's two new
migrations, and they reach a hosted database by exactly the mechanism this
section is about — which is the risk being live rather than the constraint being
broken.

So the constraint is approved architecture whose only defence is a sentence in a
document. Repointing the integration is a two-click change in a dashboard; it
would violate an Accepted ADR with no code review and no trace in this
repository. **There is nothing to decide here — this is a watch item**, and the
thing to watch for is the creation of a second Supabase project.

---

## 5. Where an accepted decision and the code disagree

Everything below describes a mechanism `main` does not exercise, or documents
that disagree with each other. **None is a status defect.** This paragraph used
to say that "with the queue empty that is the whole of what this section can be:
either a decision is accepted and the code has not caught up, which is a code or
wiring gap, or two documents state different numbers, which is a docs-truth job".
**The queue is not empty** — §2 holds **two** entries — so that premise is
withdrawn, and with it the claim that those two shapes are exhaustive. There are
two more, one standing in each of §2's rows.

**Third: the code has run ahead of a decision nobody has approved.** #367 shipped
the `hud/build-queue` read model, the per-order cancel control and the Build
panel's one-row catalogue floor while
`docs/adr/0031-build-queue-cancellation-surface.md:5` still reads `**Proposed —
pending human approval.** Not accepted.` That is not a defect — §2 exists to make
exactly that visible, and the ADR arrived in the same commit as the code, which is
the rule §2 states — but a section written on the assumption that an unapproved
decision cannot have an implementation would mis-file it.

**Fourth, and newer: a decision is waiting inside a document whose `Status` line
will never move.** #380 queued an **amendment** to ADR 0007, which is Accepted and
stays Accepted, on the argument §2 now states — that
`adr-numbering-contract.test.ts` counts documents by their `Status` line, so an
amendment inside an accepted ADR *"is invisible to every mechanical gate there
is; this row is the only thing that says it exists"*. Its heading carries the
approval state instead
(`docs/adr/0007-navigation-work-budgets-and-flow-fields.md:319`, *"## Amendment,
2026-08-26 (awaiting approval)"*). Nothing in §§3-6 could have held that: every
entry here is keyed to an ADR's status or to code, and this is neither. It is
also why `docs/adr/README.md:108`'s *"One row is outstanding: 0031"* is **true
and not a contradiction** of §2's "two entries" — the README counts rows in its
own table, and an amendment has no row. The entries below are recorded so that
reading this file does not leave the impression that the corpus was audited in
one direction.

- **ADR 0023 and ADR 0028 are Accepted and now partly implemented, on the
  schedule 0028 set.** This entry read "Accepted and unimplemented", re-verified
  at `4ed571f` on three grounds: that `RoomZoningService` registered every
  instance with `capacity: 0` and `objectCapabilities: []`, that no room
  definition carries a capacity field, and that no `'object.*'` id appeared as a
  literal under `src/` outside `src/content/`. The first and third have since
  moved. `RoomZoningService` no longer hardcodes the zero — it resolves a
  derived figure through a collaborator: an optional fourth constructor
  parameter `capacity`, declared at `src/simulation/rooms/zoning.ts:345` and
  called as `this.capacity?.resolveInstance(instanceId)` at `:459`. **Those two
  numbers read `:330` and `:444` here for eleven releases and both are now
  wrong** — `:330` is a blank line and `:444` is the middle of a comment about
  the room's rectangle — so this entry is cited by parameter name and call
  expression instead, which is the lesson the object ids below learned one
  release earlier. The zeroes `register` writes are still in the tree
  (`:452-454`) and the comment above them still says they are *"never as the
  final answer"* (`:448-451`) — and two object ids are now built
  by construction
  definitions (`placesObjectId: 'object.bed'` on `BUILDABLE_REGISTRY`'s
  `bed-wooden` row and `'object.toilet'` on its `toilet-brick` row,
  `src/simulation/construction/definition.ts`; cited by symbol rather than by
  line, because the two line numbers this entry used to give have already
  drifted once), so something does place, build and read an object. What has **not** moved is the second ground
  and the observable outcome: no room definition authors a capacity, and an
  empty zoned room still derives zero, which is why ADR 0027's tripwire below
  is still green rather than fired — but *"the observable outcome"* no longer
  survives as stated, because a **furnished** room is reachable through the
  shipped path and the rewritten ADR 0027 entry below carries the measurement.
  **Five of 0028's six phases have now landed in whole or in part. This sentence
  said "four" and then enumerated five** — 1, 2, 3, 5 and 6 — so it was refuted
  by its own list on the day it landed. That is the third hand count in this
  section to be off by one, and the reason none of them is worth keeping in
  prose. Phases 1-2
  landed in #320, #321 and #323; **phase 3** (removal, and the
  objects-removed-while-occupied path) landed in **#328**, so a standing object
  can be deleted and an order that has not been built can be cancelled and
  refunded; **phase 5**'s Rooms-tab readout landed *in half* in **#336**, which
  ships the per-room "what is this room missing" verdict but not the
  "over capacity" state the projection still cannot say
  (`room-projection.ts` reads an over-capacity room as full at 100%); and
  **phase 6**'s counting landed in #323 under ADR 0029, which **is no longer
  awaiting approval**: #356 accepted it on 2026-08-26
  (`docs/adr/0029-concurrent-room-use-claims.md:5`, *"**Accepted,
  2026-08-26.**"*, plus its index row), so phase 6 now rests on an Accepted
  decision and the queue's one pending entry is ADR 0031 instead. Phase 4 — the
  rest of the object catalogue — is
  untouched: exactly two `'object.*'` ids appear as literals under `src/`
  outside `src/content/`, both on `BUILDABLE_REGISTRY` rows. One
  thing phase 1 promised is now true and was **not** delivered by any phase:
  `door-wooden` builds a real door, and since **#334** the crossing is pinned at
  the two sites that decide it rather than only at the one the issue named. It could not be an object placement — a door
  is a fact about a tile edge — so it is edge geometry plus a `DoorRegistry`
  row, it contributes nothing to either derived capacity, and 0028 carries an
  amendment saying so. Nothing about the eight decisions moved with it. A
  **second** amendment (#326) does move one rule inside decision 2: the
  concurrent-use ceiling is now scoped to the capability being asked for, rather
  than summing `footprint.width` over every object in the room. Measured before
  the change at `9d0a125`, on the real gate: a canteen holding four toilets and a
  storage rack admitted 19 diners to tables that seat 6, and an empty 8x8 yard
  admitted nobody while the same yard holding one loading-dock door admitted
  three. Decision 2's other lines, the other seven decisions and the phase order
  are untouched, and the amendment corrects that ADR's own worked example --
  under capability scoping its canteen seats 6, because `object.bench` declares
  `'seating'` and `'recreation'` and not `'dining'`. The empty zoned room above
  still derives zero for every capability, so ADR 0027's tripwire below is
  unaffected: what changed is that an action naming **no** capability now has no
  object-derived ceiling at all, which is `room.yard` and nothing else. A
  **third** amendment (#348) touches no decision at all: it corrects the
  *measurement* under decision 4, which said "every order advances every
  scheduled tick, so a hundred objects take the same wall-clock time as one".
  Construction now runs one order at a time, so a twelve-wall perimeter finishes
  at tick 730 rather than 70 while a single wall still finishes at 70. Decision
  4's own ruling — that a labour cap is #26's to make, and that furniture must
  not be the one buildable that waits — is untouched and is satisfied rather
  than contradicted, because the queue applies to every buildable alike.
- **FALSIFIED — ADR 0027's subject is reachable, and two prisoners already share
  one cell.** This entry read *"ADR 0027's subject is unreachable, so its effects
  are not observable"*, and it argued that *"the rating seam that was approved is
  live, and it is inert"*. **Measured against `83c3121` and it is not inert.**
  Four commands, all of them ones a player sends, through the real kernel and the
  real decoder: `PurchaseMaterials` for four planks, `ZoneRoom` for the 2×3
  rectangle at (4,6) that `room.cell`'s `minimum-size` requirement accepts
  (`src/content/room-catalog.ts:70`), and `PlaceObject` twice —
  `definitionId: 'bed-wooden'` at (4,6) and at (5,6), the two 1×2 footprints that
  fit side by side inside it. Nothing refused (`refusals.count` 0), both orders
  completed, and the instance the registry then holds is

  > `residentCapacity: 2, concurrentUseCapacity: 2, objectCapabilities:
  > ['sleep-surface'], concurrentUseCapacityByCapability: [['sleep-surface', 2]]`

  Two `AdmitPrisoner` commands later, `getAccommodation` returns `room.cell:4:6`
  for **both** arrivals and `occupancyOf('room.cell:4:6')` is **2**. That is
  ADR 0027's subject — co-occupancy of one cell, and both placements went through
  the approved seam: `IntakeSystem` allocates through
  `RoomInstanceRegistry.findBestAvailable` and nothing else
  (`src/simulation/prisoners/intake-system.ts:348`, whose own comment at `:342`
  names #79 and the rating). It is happening in a session a player can start.

  **The three things this entry got right, and why they did not add up to its
  conclusion.** `findBestAvailable` does return `undefined` for `room.cell` with
  and without the `sleep-surface` filter *in a prison whose cell is empty*; a
  zoned room with nothing in it does derive zero
  (`tests/unit/objects-room-capacity.test.ts`, *"is zero for a room with nothing
  in it"*); and the case at `prisoners-intake-system.test.ts:229` does still
  pass. **That case was retitled by #371 and this entry's quotation of it is
  stale**: it read *"houses nobody at all through the shipped session path"* and
  now reads *"houses nobody through the shipped session path **while the cell is
  unfurnished**, because capacity comes from the objects standing in it"*. The
  narrowing is the right resolution and is better than the *"must not be
  re-baselined"* this entry demanded — every assertion still holds, and the title
  now says which world it is true of. What the entry did was generalise from that
  tripwire to the whole tree. It cannot carry that weight: it zones two rooms and places
  nothing, so it says nothing whatever about a prison with a bed in it, and
  `tests/integration/object-placement-loop.test.ts` — *"a player buys a plank,
  places a bed in a cell they zoned, and a prisoner lives in it"* — had been on
  `main` since phase 1 saying the opposite. **This entry was therefore already
  false when it was written**, not falsified by the eleven releases: across
  `cddaebb..main` every diff under `src/simulation/objects/` and
  `src/simulation/rooms/` is a comment correction and not one executable line
  moved, so the placement path behaved on 2026-08-26 exactly as it does now. It
  is the exact failure the anchor gate is a proxy for, found by re-reading rather
  than by any assertion, and it is why *"moving the anchor without re-reading
  anything passes it"* is written at the top of this file.

  **Somebody else found it first, one release after the anchor this entry was
  written against, and that is the strongest argument for the delta note above.**
  #371 — *"ADR 0028 shipped, and the tripwire written to announce it could not
  fire"* — landed at v0.0.89 and measured the same fact independently: seed 11,
  two `bed-wooden` in one zoned 3×3 `room.cell`, `residentCapacity: 2`, two
  `AdmitPrisoner` accepted with no refusal, `occupancyOf('room.cell:3:3')` **2**,
  `completedCount: 2`, `failedCount: 0`. Different seed, different rectangle,
  different anchor tile, same conclusion — which is a stronger result than either
  measurement alone, and is recorded here rather than replaced because two
  independent routes to a fact are worth keeping. But the re-read that produced
  the entry above was cut from `83c3121`, **one commit before #371 merged**, so it
  rediscovered at length a thing already on `main` and already written into the
  ADR. That cost is what the delta note exists to avoid.

  **ADR 0027 now carries it in its own body**, which is where it belongs and where
  a reader should go first: `docs/adr/0027-cell-sharing-assessment.md:14-32`,
  *"Update, 2026-08-26 — the subject is now reachable, and this ADR named the
  day"*, with the preconditions kept verbatim below it *"because every design
  argument below them was made under them"*. The index row moved with it —
  `docs/adr/README.md:97` now reads *"its subject became reachable when 0028
  shipped (measured 2026-08-26)"* where it read *"unreachable until 0028 ships"*.

  **And #371 adds one live gap this entry did not have.** `rateCellSharing` *"is
  deciding real allocations in a live session for the first time, and nothing
  exercises it through that path — every test of it still registers its instances
  by hand"* (`docs/adr/0027-…md:27-30`). That is sharper than this entry's own
  closing observation and it supersedes it: the point is not only that no session
  furnishes two cells, it is that the rating function is now load-bearing in
  production with **no** test reaching it through a command. ADR 0027 files it as
  a coverage question rather than resolving it, and it stays here as the thing to
  watch.

  **What is left of it, restated as what is true.** The retitled case is green
  and correct. ADR 0027's status qualifier is still the right shape — its three
  questions stay open and are now *load-bearing rather than hypothetical*, which
  is how the ADR's own Update puts it. What is worth watching is the coverage gap
  #371 names above, and, narrower, that nothing in a shipped session yet chooses
  **between** two eligible cells on the strength of a rating: every measurement
  here and in #371 lands in the only cell there is. The notice for that would be
  a session with two furnished cells and a prisoner sent to the emptier one.
  Nothing here is awaiting a decision, which is why it stays in §5.
- **ADR 0026's three questions are open under an Accepted ADR**, and the only
  thing holding them is a set of tests that assert the wrong answer on purpose
  (`tests/unit/entity-generation-wrap.test.ts`, five `DEFECT`-labelled cases at
  `:96`, `:163`, `:178`, `:190` and `:204`, and one case in
  `tests/unit/prisoners-intake-system.test.ts`). That is what was accepted, so it
  is not a status defect, and it is still the entry to read before #31, because
  the release path is where all three questions become load-bearing on the same
  day.

  **The rest of this entry is FALSIFIED, and by the best possible thing: somebody
  measured the tripwire.** It said *"nothing else in the suite observes any of it:
  mutating the wrap period from `& 0xFFF` to `& 0xF` leaves the suite green except
  one case in `actor-identity.test.ts`"*. **#373 closed both halves of that**, and
  found the gap was worse than this entry described.

  - The wrap period **is now pinned in that file**, in its own case
    (`tests/unit/entity-generation-wrap.test.ts:124`, *"rejects a stale handle for
    every one of the 4,095 recycles before the wrap, and only wraps at 4,096"*).
    So the `& 0xF` mutation no longer leaves this file green, and the pin no
    longer rests on `actor-identity.test.ts` alone.
  - **Why that mattered more than coverage**, and this is the part worth keeping:
    `actor-identity.test.ts`'s pin *"is the one ADR 0026 names as the cost of
    option A"*, so the sole guard on the counter **was scheduled to be
    re-baselined by one of the options this file exists to gate** — the gate would
    have been dismantled by the decision it was guarding.
  - **And the generation check was not exercised at all.** Every
    `isAlive(stale) === false` was asserted between a `destroy` and the following
    `spawn`, with the slot on the free list, so `alive[index] !== 1` satisfied it
    and the generation comparison was never reached. Measured: removing the
    generation term from `isAlive` — #110's fix, the exact guard whose failure at
    the wrap is that file's subject — **left all 190 test files and 2,229 tests
    green**. The assertions now run with the slot occupied.

  ADR 0026 carries this itself, as an addendum that changes no decision
  (`docs/adr/0026-entity-id-lifetime.md`, *"Addendum, 2026-08-26 (#169): the
  tripwire's own coverage, measured"*). **No `src/` change**: none of options A,
  B or C was taken, so the three questions are exactly as open as before — what
  moved is that the tripwire now detects what it claims to.
- **ADR 0012 — a retained topology is now evicted; the streaming policy is what
  is left.** This entry read "`chunkTopologies` is never evicted", re-verified at
  `4ed571f` on the ground that no `delete` existed on that map. **#324 closed
  it**: `update()` drops the retained topology of every chunk the world no longer
  reports as loaded — `evictUnloadedTopologies()`, called from `update()` at
  `src/simulation/rooms/topology.ts:72`, whose `this.chunkTopologies.delete(key)`
  is still exactly at `:99` where this entry last cited it — so the walk sees only loaded
  chunks and an id is no longer a function of chunk *load* history either.
  `GlobalTopologyId` therefore meets ADR 0012's category 2 outright rather than
  only with respect to *recompute* history. What this section still carries is
  the ruling the ADR reserves and #324 deliberately did not take: whether an
  unloaded chunk should be *representable* in a topology at all, and if so from
  what persisted geometry. That is a decision, not a code gap — which is why it
  belongs here and the eviction no longer does.
- **ADR 0006 / ADR 0003 decision 4 — the handshake gates nothing.** `'ready'` is
  a member of `WorkerState` (`src/simulation/worker/state-machine.ts:28`) and no
  `transition()` call targets it; the file makes exactly four, and they reach
  `'faulted'` (`:455`), `'paused'` (`:566`), `'paused'`/`'running'` (`:601`) and
  `'shutting-down'` (`:825`). Nothing in `src/` sends a `protocol/handshake` at
  all — re-read at this commit, all nine occurrences are the receiver
  (`state-machine.ts:472`, `:502`), the transferables switch, the kind list or the
  schema. So ADR 0006's state 2 describes a state the machine cannot
  occupy and ADR 0003 decision 4's version negotiation runs for nobody. Version
  compatibility still fails closed, by a different route: the decoder's
  `protocolVersion: z.literal(...)` in `src/simulation/protocol/types.ts`. This is
  issue #118 item 1 and issue #274's A2, and both ADRs carry an implementation
  note for it — the two notes of that shape the corpus still holds, now that
  0024's has been deleted. The fix is in the code, and the open decision is
  whether to send the handshake or delete `'ready'` (issue #274, Q4).
- **ADR 0010 — the telemetry layer is inert.** Nothing outside
  `src/services/telemetry/` imports it, re-verified at `dbe271f` by grepping the
  whole of `src/` for that path — every hit is inside the directory itself — so
  consent is never asked for and `record()` is never called. The prohibition half of the ADR
  holds; the sentence *"telemetry is fed from the main thread's orchestration
  layer"* does not.
- **ADR 0009 — "Accepted — implementation gated", and all four gates are unmet.**
  `verifyChallengeSubmission` and `isPubliclyRankable`
  (`src/services/challenges/verification.ts:136` and `:324`) exist; no replay
  runner implements the port, no endpoint exists, and nothing outside
  `src/services/` imports the layer — re-checked here, and the single mention
  elsewhere (`src/main.ts:86`) is a comment naming the file, not an import. **This status is the most accurate in the corpus** — it says "gated", and
  the gates are genuinely shut. Listed as a model, not a defect.
- **The 900×600 budget has three figures in the corpus, and only one of them is
  live.** This entry used to be headed *"ADR 0022's pre-correction 900×600 budget
  disagrees with `src/ui/hud/build-panel.ts`"*, which overstated it in one
  direction and understated it in another, so it is rewritten rather than
  re-verified.

  **Overstated:** there is no live disagreement between the ADR and the file.
  `src/ui/hud/build-panel.ts` has said *"7.8px is the entire budget"* since
  before `4ed571f`, and ADR 0022's table reads `| 900×600 | 12.2 | 7.8 |` with a
  `Now` column measured to 0.05px (7.81). Both name the same corrected figure.
  `11.8` survives in that file only as the reading it explicitly records as
  superseded, and ADR 0022 already devotes a bolded paragraph to the `11.8`/`12.2`
  split and to why it declines to resolve it — so the entry's closing claim that
  the disagreement *"has survived unnoticed"* was the one sentence here that was
  plainly false. It was noticed, in writing, in the document itself.

  **Understated:** the third figure has no source. ADR 0025 says its inherited
  budget is *"the 3.9px at 900×600 that ADR 0022 and `hud.css` both record"*.
  Re-verified at `dbe271f` by grepping the whole tree: **`3.9` appears in no ADR
  but 0025 — `docs/adr/0025-guard-hiring-surface.md:70` and `:182` — in no
  `.css` file, and nowhere in `src/`.** Re-run after #377, which is the first
  change to touch `src/ui/hud/hud.css` since this entry was written and so the
  one that could have supplied the missing source; it did not, and
  `src/ui/hud/build-panel.ts`, ADR 0022 and ADR 0025 are all untouched in that
  delta, so the entry's three figures are exactly as they were. Neither document it cites
  records it. That is a dangling citation inside an Accepted ADR rather than a
  disagreement between measurements, and it cannot be repaired by picking a
  number — 3.9 is not 7.81 and not 11.8, so nobody knows what was measured. The
  ADR's own Status already flags the layout claims as inherited and not
  re-measured, and its argument does not turn on the figure (its point is that the
  Staff panel and the Build panel are never laid out together, so the budget is
  not a constraint on it at all). Left verbatim, as 0022's and 0027's drift is,
  and recorded here: it is a docs-truth task inside an accepted ADR and it belongs
  in a change of its own.
- **ADR 0022 was written against v0.0.30 and its structural citations have
  drifted.** `HudIntent` declares **sixteen** members rather than the seven the
  ADR counts — `docs/adr/0022-room-zoning-surface.md:82` says
  `src/ui/hud/hud.ts:153-195` *"declares seven members and none of them is a
  room"*, and the union now runs `src/ui/hud/hud.ts:270-491` — three of
  them room-related (`zone-room`, `unzone-room`, `arm-room-tool`);
  **`AWAITING_PRODUCER` is now empty**, which is more than this entry's old
  claim that `ZoneRoom` is not in it: #312 gave `ZoneRoom` a producer and #367
  gave the last one, `CancelBuildOrder`, its own
  (`tests/foundation/unconsumed-command-contract.test.ts:173-203`, whose comment
  calls an empty list *"not a state to defend"* but *"the state this gate exists
  to bring about"*, and which fails in both directions); the `onIntent` switch in
  `src/main.ts` has moved; and its
  citation of *"`tests/unit/ui-hud-messages.test.ts:196-200` asserts it by
  scanning for the import"* now lands eight lines short — #339 removed the
  single-file, comment-blind copy of that check from
  `tests/unit/ui-hud-build-panel.test.ts`, and the surviving assertion, which
  covers every file under `src/ui/hud/**` and `src/ui/primitives/**` over
  comment-stripped source, sits at `:204-210`. The ADR names the right test and
  the property it names is strictly stronger than it was; only the line range
  drifted.

  **This entry said "thirteen", then "fifteen", and neither was right for long.**
  It was fourteen at `ac03d8f`, the commit that wrote "thirteen"; `remove-object`
  (#328) made it fifteen; and `cancel-build-order` (#367) has now made it
  **sixteen** — so a sentence written to record somebody else's drifted count has
  itself been wrong at three successive readings. The two members the original
  hand count missed are `arm-build-tool` (`src/ui/hud/hud.ts:403-408`) and
  `arm-room-tool` (`:486-491`), the only two declared across several lines rather
  than on one, which is exactly the shape a hand count skips. The sixteenth,
  though, is on a single line (`:445`) and was missed for the ordinary reason:
  nobody recounted. Nothing in
  the ADR turns on the figure; what it demonstrates is that a count in prose is
  the least durable citation this corpus has, and it is the reason the entries
  around it cite symbols instead. None of it
  touches the decision, but a reader following a `file:line` out of that ADR
  should expect to land near rather than on.
- **ADR 0027's command-surface count has drifted the same way**, new as of this
  commit and worth recording because it is one clause inside a question that
  stays open. Its question 2 says the entire command surface is seven members and
  *"not one of them concerns a prisoner"*. **This entry answered "nine", and the
  correction has itself drifted twice** — which is the entry's own point turned
  back on it, and the reason the anchor above now has a test. Nine was right at
  `4ed571f`; `PlaceObject` (#320) made it ten before the v0.0.65 re-anchor, which
  did not re-count; `RemoveObject` (#328) has since made it eleven. Re-verified at
  `83c3121` and it is **still eleven** — the one count in this section that has
  held across the eleven releases, because #367 wired an existing member rather
  than adding one: `simulationCommandSchema`
  (`src/simulation/protocol/commands.ts:348-360`) discriminates eleven, matching
  the eleven `type: z.literal` members declared above it, and `AdmitPrisoner`
  (#306) concerns a prisoner. The
  load-bearing half of the argument is
  unaffected — there is still no player input to *placement*, and an override
  still needs a new command type, its codec case, a handler branch and a decision
  about whether intake blocks — so the body was left verbatim rather than
  rewritten by the commit that accepted it, exactly as 0022's drift was.

- **Two Accepted ADRs still say object placement does not exist**, which is the
  same drift as 0022's and 0027's structural citations and is recorded the same
  way. `docs/adr/0023-room-occupancy-authority.md` says step 1 of its resolver is
  *"unimplementable today … object placement does not exist
  (`docs/HUD_PROJECTIONS.md` gap 13), so until it does, the resolver's only
  reachable branches are 2 and 3"*, and
  `docs/adr/0027-cell-sharing-assessment.md` says a freshly zoned room is
  registered with `capacity: 0` *"because object placement does not exist"*. ADR
  0028 phase 1 falsified the premise in both. The document they both cite has
  already moved — gap 13 now opens *"Object placement exists, and `minQuantity`
  is still unchecked"* (`docs/HUD_PROJECTIONS.md:553`) — so the two ADRs are the
  last places in the corpus asserting the old world, and a reader who follows
  either citation lands on a page contradicting the sentence that sent them. The
  two sentences are still there and were re-read here:
  `docs/adr/0023-room-occupancy-authority.md:204-205`, unmoved, and
  `docs/adr/0027-cell-sharing-assessment.md:81` — **which this entry cited as
  `:55`**, before #371 added that ADR's 2026-08-26 Update above it. The Update is
  now the first thing a reader of 0027 meets, so the contradiction is at least
  signposted inside the document rather than only here.

  **The second half of this entry is withdrawn as false.** It read: *"Neither
  conclusion moves, which is why the bodies are left verbatim: 0023's step 1 is
  now reachable but still resolves to zero for an empty room, so branches 2 and 3
  remain the ones a shipped session takes, and 0027's co-occupancy is still
  unreachable."* Both halves are refuted by the measurement in the ADR 0027 entry
  above. 0023's resolver orders its branches *"1. If any placed object in the room
  supplies occupancy, aggregate those objects' capabilities"*, then the authored
  nominal figure, then `0`
  (`docs/adr/0023-room-occupancy-authority.md:196-203`) — and a cell holding two
  beds resolves through **branch 1** to a `residentCapacity` of 2 in a session a
  player can start. Branch 3 is what an *empty* room takes; branch 2 is
  unreachable in either world, because no room definition authors a nominal
  figure — the eighteen definitions at `src/content/room-catalog.ts:68-165`
  declare `requirements` and nothing else, and the string `capacity` does not
  occur in that file at all (re-counted and re-grepped after #376 added an
  import-time cross-catalogue check to the head of that file, which moved every
  definition down by two lines and changed nothing else this entry rests on). And 0027's co-occupancy is reachable:
  two prisoners hold `room.cell:4:6`. So what is false in those two ADRs is the
  stated **cause** — object placement does exist — and their **conclusions have
  moved too**; the bodies are still left verbatim, but on the narrower ground
  that a body is amended in its own commit and by whoever takes the decision, not
  because the sentences after the false clause survived. The same phrase in
  `docs/research/` stays untouched for the reason that directory's README gives.

- **NEW — two dated rulings were written into ADR 0008's Accepted body with no
  queue row, on the same day #380 argued that such a thing needs one.** This is
  for the owner rather than a defect this file can settle, and it is here because
  nothing else would surface it. #382 added both to
  `docs/adr/0008-trusted-service-boundary.md` §2: *"**Generalised, 2026-08-26
  (issue #280 finding F14): a Data API role holds exactly the DML privileges its
  zone needs on a table, and nothing else**"*, which states *"the rule this
  settles for every future table"*; and *"**Authority over a row is not authority
  over the record of when it was written.** Decided 2026-08-26 for issue #194"*,
  which narrows §2's *"saves, settings — Z0/Z1 (client-authoritative)"* row by
  ruling a timestamp column out of "content". Both are written as decided. Neither
  carries an approval caveat, and **neither has a §2 row**.

  **The tension is with a rule that landed hours earlier, not with a rule this
  file invented.** #380 queued its ADR 0007 amendment on the argument §2 now
  states — that an amendment inside an Accepted ADR is invisible to
  `adr-numbering-contract.test.ts`, so *"this row is the only thing that says it
  exists"* — and it declined to self-approve, marking its heading *"(awaiting
  approval)"*. #382 took the other view for the same shape of edit. Its stated
  reason is that these are *applications* of ADR 0008 §2's existing zone taxonomy
  rather than new decisions: *"Recorded as a rule in ADR 0008 section 2 rather
  than only in a migration, because the question is asked again by every table
  that gets a timestamp."*

  **That reading may well be right**, and §2's rule triggers on an *outstanding*
  decision, so a ruling that is not outstanding needs no row by the letter of it.
  What is missing is the line between the two, because #380's argument does not
  draw one: both edits add prose to an Accepted ADR that changes what the ADR
  requires of future work. **The question for the owner is whether "applies an
  accepted decision" and "amends an accepted decision" are distinguishable by
  anything a reader can check**, and if not, whether the queue rule should cover
  both. Recorded, not decided; ADR 0008's `Status` is `Accepted` and no status is
  wrong either way. Two ADR numbers are unused — `docs/adr/README.md:102-106`
  records **0032** as next free and 0030 as *"held by an unmerged branch"* — so
  nothing here was blocked on a number.

Also not here as a decision: **ADR 0002**, whose configuration matches the ADR
exactly (`wrangler.jsonc:12` for `lockstate-staging`, `:20` for `lockstate`)
while `docs/DEPLOYMENT.md:167` records that `lockstate.io` is in fact served by
`lockstate-staging` and `:172` that Worker `lockstate` *"has never been
deployed"*. That is a live operational trap. **This entry called it "a missing
warning in the ADR body" and that is false** — the warning is not missing.
`docs/adr/0002-cloudflare-static-assets.md:31-38` carries it in the ADR's own
body: `:31` says *"Neither describes what is currently serving traffic"*, `:33`
quotes the deployment document, and `:38` states *"This note records the
discrepancy; it does not resolve it"* and assigns the open decision to issue
#274, Q9. That note landed in #284, long before either of this file's last two
anchors, so the sentence was wrong when it was written and not overtaken —
another entry that a re-read catches and no gate can. What remains true is the
part that matters: it is not a wrong status, and the deployment document carries
the trap.

---

## 6. Stale status references: cleared, and now asserted

Flipping a status does not update every document that *reports* that status.
Each approval was scoped to the status lines and their index rows, so the
references this section used to list were deliberately left alone and recorded
here as known rather than missed. **They have since been corrected, in one
change of their own, and the class is now under a test.** What is left below is
the account of what moved, what could not move and why, and what the test can
and cannot see — because the residue is the part a future reader needs.

### The gate

`tests/foundation/adr-status-reference-contract.test.ts` reads every ADR's own
status statement and every sentence in `src/`, `tests/`, `docs/`, `README.md`
and `.github/` that predicates a status of an ADR, and fails when the two
disagree. It is the layer between the index check and this file:
`adr-numbering-contract.test.ts` compares a document to a table, this file
compares a decision to an implementation, and the new test compares a *sentence*
to a document.

Three properties it was built to have, stated here because a `toEqual([])`
gate that lacks them reads exactly like compliance:

- **Non-vacuous.** It asserts floors — more than 300 corpus files walked
  (`tests/foundation/adr-status-reference-contract.test.ts:427`) and more than 15
  status claims actually parsed and compared (`:431`; 33 on the tree that landed
  it), plus more than 20 ADRs found on disk (`:405`) — so a scanner that read
  nothing, or a claim pattern that stopped matching prose, fails instead of
  passing quietly. All three floors re-read at this commit. Its positive control
  runs the checker against text whose verdict is known, in both directions.
- **It bites.** Proved by reintroducing `"ADR 0017 is still Proposed"` into
  `src/ui/hud/messages.ts` and watching it fail with that file and that
  sentence named.
- **It does not fire on history.** Past tense is not matched, so *"while this
  ADR was `Proposed` it said…"* is left alone; an ADR's `Amendment` sections are
  skipped, which is what lets ADR 0022's *Status of this amendment* keep its
  `**Proposed.**`; and `docs/research/` is exempt for the reason that directory's
  README gives.

**What it cannot catch**, and this is the honest boundary rather than a
formality: a claim that names no ADR. `src/simulation/economy/income.ts` said *"a
ninth `Proposed` document in `docs/adr/`"* — false, and about the *count* rather
than about any one ADR, with no number in it for a subject. The same goes for a
`##` heading with no subject (ADR 0012's `## Decision (proposed)`) and for a
table cell whose ADR is cited only in the sentence introducing the table. All
three shapes existed in this corpus and all three were corrected by hand.

**A fourth blind spot, found since and not previously recorded here: it cannot
tell an assertion from a denial.** #356 hit it while accepting ADR 0029 — the
gate correctly caught two sentences still calling 0029 `Proposed`, and then
caught a third that was *true*, *"No row is `Proposed`."* It matches on the
status word rather than parsing the claim, so a sentence saying that **no** ADR
holds a status trips it exactly as a false one would. The wording was changed to
"every row is accepted", which is true and leaves the gate meaningful, and the
constraint is written down where it binds
(`docs/adr/README.md:44-52`) rather than left for the next person to
rediscover by failing the suite. Teaching the scanner to read negation is the
alternative and is not obviously worth it. **It belongs in this list**, because
it is the same class as the three above: a claim the scanner's shape cannot
evaluate, which a reader has to hold instead.

The test exempts itself, because its header and its positive control quote false
claims on purpose — **and it exempts this file**, for the same reason and by
name (`tests/foundation/adr-status-reference-contract.test.ts:147-150`, alongside
`docs/research/`). Worth stating rather than leaving implicit: every quoted
sentence in §6 below is a false claim reproduced on purpose, so no gate is
reading them and nothing but a human re-reading this file keeps them honest.

### Corrected, with what each said and what is true

**Comments calling an Accepted ADR proposed.** Older than the thirteen flips and
never recorded before this round:

- `src/ui/hud/messages.ts` — *"ADR 0017 is still Proposed"*. 0017 has been
  Accepted since `a786b64`, with all three answers. Now says it is Accepted and
  names no currency either, which is what the label rests on.
- `src/ui/hud/projection.ts` — *"ADR 0017 is Proposed."* Same correction; the
  chip still prints minor units, for the same reason.
- `src/content/procurement-catalog.ts` — ADR 0017 answers #96's three questions
  *"**as recommendations pending approval**"*, and *"ADR 0017's recommendation on
  the buffer question"*, and *"When the owner takes ADR 0017's answers, this
  table is where a real economy starts"*. They are its decisions 6, 7 and 8 and
  they are accepted. The placeholder argument is unaffected and it needed the
  better reason it now carries: **decision 5** reserves prices to issue #29, so
  every figure here is provisional with nothing left to approve.
- `tests/unit/entity-generation-wrap.test.ts` — *"ADR 0026 states all three at
  Proposed"*. 0026 is Accepted as the framing and the tripwire, and leaves all
  three open, which is what the file needed to say. The tests are untouched.
- `tests/unit/prisoners-intake-system.test.ts:494` — *"it is stated at Proposed
  in ADR 0026 rather than settled here"*, on the re-intake case. Now names it as
  0026's question 3, left open by an Accepted ADR. (Cited as `:465` at the last
  anchor; #373 added a case above it pinning the determinism half of that same
  question, so the comment moved down 29 lines and the file now carries two.)
- `src/simulation/economy/income.ts` — *"a ninth `Proposed` document in
  `docs/adr/`"*. **This entry then said "there is exactly one, and it is 0029",
  and that is now false: 0029 was accepted on 2026-08-26 (#356) and the one
  `Proposed` document is ADR 0031** (`docs/adr/README.md:100` is the single
  `Proposed` row in the index, and `docs/adr/0031-build-queue-cancellation-surface.md:5`
  is its status line). Re-read at this commit: `income.ts` carries no count at
  all, which is why the correction itself did not go stale with the number — the
  argument for keeping the rate on issue #29 never depended on the count, so the
  count is gone from it, and that is the durable half. The stale sentence was
  this file's own parenthetical naming which ADR the count was, which is a
  reminder that §6 is a record and a record has to be re-read too. **The other half of this entry was already fixed before this change**: the
  *"ADR 0023 open, ADR 0028 proposed"* parenthesis is no longer in the file,
  which ADR 0028's phase 1 rewrote along with the measurement around it.
- `src/simulation/rooms/zoning.ts` — ADR 0012 *"is still `Proposed`"*, plus
  *"ADR 0012 has to be settled first"* in the move-or-resize clause. 0012 is
  Accepted, so what a future resize would force is its **taxonomy being applied
  to this id**, not the ADR being settled. The reasoning is unaffected: a
  room-instance id still needs neither category answer.

**The single-ADR stale statuses this section used to list:**

- `docs/DEPLOYMENT.md:163` — ADR 0016 *"is **Proposed, not accepted**"*. Now
  records it as Accepted, retroactively for the §1 mechanism, and says what the
  acceptance makes binding: §2, with nothing enforcing it mechanically. That is
  §4 of this file, and the deployment document is where a reader meets it.
- `docs/adr/0016-migration-delivery-mechanism.md:173` — quoted that sentence
  verbatim, so the two moved together, as this section said they would have to.
- `docs/adr/0012-derived-identifier-reproducibility.md` — the self-contradiction,
  and the most visible entry this section ever held. `## Decision (proposed)`,
  *"which is why this ADR is proposed rather than applied"* and Consequences
  clause (a) *"The status above stays Proposed"* all sat under a status line
  reading `Accepted`. Clause (a) now records that the category-2 reading **was**
  taken; clause (b) — `chunkTopologies` is never evicted — was true when this
  entry was written and #324 has since falsified it, so the clause now records
  the eviction as closed and reserves only the world-streaming ruling. A fourth
  sentence went with them, not previously
  listed: the path-request-id clause said its question was *"left open for
  whoever accepts this ADR"*, and the acceptance did not take it either.
- `docs/adr/0013-free-tier-cloud-save-capacity.md:15` and `:151` — the Status
  table row and the §4 heading both marked 4 MiB `PROPOSED`; `:19-21` asked a
  reviewer for *three* numbers. (The heading citation read `:150` here and `:150`
  is a blank line; the heading is `### 4. Per-save payload bound — **ACCEPTED:
  4 MiB (4,194,304 bytes)**`.) §4 is Accepted, the heading and the row say so,
  and the ask is now two — 20 revisions (§6) and 256 MiB (§5). One more in the
  same document, not previously listed: §4's headroom bullet asked that *"the
  approval asked for in the Status table above should be given or withheld
  against these figures"*, which is a request that has been answered; it now
  says these are the figures §4's bound stands on.
- `docs/adr/0015-actor-identity-allocation.md:153-156` — *"Accepting 0015
  without 0012 leaves the taxonomy it argues in still Proposed"*, describing a
  case that cannot arise. Both were accepted in the same commit, so item 1 of
  *What this asks a human to accept* is discharged and says so: *"**Both were
  accepted in the same commit**, so the taxonomy this ADR argues in is settled
  and the case this item guarded against — 0015 accepted while 0012 was not —
  cannot arise."* (This entry cited `:145-146`,
  which is now a passage about the name pool; the discharge is eight lines
  further down.)
- `README.md:59` — ADR-0014's *"`Status` is `Proposed` … the decision has not
  been approved"*. Now Accepted, and the pipeline the repository implements is
  the approved one rather than a proposal it happens to match.
- `docs/CLOUD_SAVE.md:1553-1554` (*"the ADR is `Proposed`, not…"*) and `:1570`
  (the 4 MiB row). The prose states the split — *"that ADR is `Accepted` for
  its §§1-4 and its §§5-6 remain `Proposed`"* — and the row reads *"**Accepted**
  as ADR 0013 §4"*. **`:1571-1572` were true and stayed true**, and they gained
  their ADR section numbers so that a reader (and the gate) can tell a §-scoped
  `Proposed` from a claim about the whole document. `:1609` and `:1620` were
  already §-scoped and are untouched.

  **All five numbers have now drifted twice, in two consecutive anchors, and
  nothing else in this file has done that.** They read `:1184`, `:1200`,
  `:1201-1202`, `:1239`, `:1250` at `cddaebb`; were corrected to `:1268-1269`,
  `:1285`, `:1286-1287`, `:1324`, `:1336` at `83c3121` after that file gained 85
  lines (#350, #353); and are corrected again here after it gained **361 more**
  (#368 and #382's cloud-save work). The sentences have never changed. **The
  numbers are the wrong citation for this document** — it is the fastest-growing
  file in the dependency set, and the next re-read should expect to correct these
  five again unless somebody re-cites them by heading or quoted phrase, which is
  the remedy this file keeps recommending elsewhere and has not applied here.
- `docs/TRUSTED_SERVICES.md:592-598` — *"the 4 MiB per-save figure is proposed,
  not accepted"*, and *"ADR 0013 is in `Proposed` status"*. Both corrected —
  `:592` now reads *"**The 4 MiB per-save figure is accepted** — ADR 0013 §4"* —
  and the two numbers that genuinely remain open are named as §§5-6 (`:595`) and
  the churn lever as §7 (`:598`). This entry cited `:577`, which is a bullet
  about `public.create_prison()`; that file has not changed since either of this
  file's last two anchors, so the citation was wrong when it was written rather
  than overtaken.
- `.github/workflows/migrate-database.yml:20` — *"(ADR 0016 §2, Proposed)"*.
  Now `Accepted`, and the comment says the constraint is binding with nothing
  enforcing it mechanically, which is the sentence that made the flip worth
  landing here at all.

**Which of the citations above survived, since a list of corrections is only
worth reading if it says which parts of itself were checked.** Two passes are
recorded, because they were checked differently and a reader should know which.

**At `83c3121`, a full re-read of every sentence in this subsection.** Nine
citations had moved and were corrected then: 0013's §4 heading, 0015's discharge,
five in `docs/CLOUD_SAVE.md`, one in `docs/TRUSTED_SERVICES.md`, and one factual
claim — which `Proposed` ADR the `income.ts` count referred to.

**At `dbe271f`, the delta only**, by the method the header describes: intersect
`git diff --name-only 83c3121..dbe271f` with the dependency set, then read the
intersection. Of the files this subsection cites, **three changed** —
`docs/CLOUD_SAVE.md`, `tests/unit/prisoners-intake-system.test.ts` and
`tests/unit/entity-generation-wrap.test.ts` — and two of them moved a citation,
both corrected above. The other seven code and test comments are in files
`git diff` reports as untouched, so they hold as corrected without re-reading:
`messages.ts:28`, `projection.ts:211`, `procurement-catalog.ts:13` and `:23`,
`entity-generation-wrap.test.ts:37` (verified anyway, since the file changed),
`income.ts` and `zoning.ts:106`/`:115`. Six `file:line` citations are in
untouched files and still land where they say: `docs/DEPLOYMENT.md:163`,
`docs/adr/0016-migration-delivery-mechanism.md:173`,
`docs/adr/0013-free-tier-cloud-save-capacity.md:15` and `:19-21`, `README.md:59`,
and `.github/workflows/migrate-database.yml:20`. **`docs/TRUSTED_SERVICES.md`
gained six lines and its `:592-598` citation was re-read rather than assumed —
it still lands**, which is the one case where "the file changed" and "the
citation moved" came apart.

That is the whole cost of the second pass, and the ratio across both is the
argument for the practice this file keeps recommending and keeps failing to
follow: **a `file:line` into a document under active edit is the least durable
citation here, and a quoted sentence is the most.** Across both passes this
subsection needed fifteen corrections — eight line citations at `83c3121`, six
more at `dbe271f`, and exactly **one** correction of substance, the ADR the
`income.ts` count referred to. **Fourteen of fifteen were numbers**, and not one
of the sentences those numbers point at has changed.

### Cannot be edited at all

- `supabase/migrations/20260823100000_bound_free_tier_capacity.sql` —
  *"PROPOSED, PENDING HUMAN APPROVAL (ADR 0013)"* above the 4 MiB function that
  is now Accepted as §4, and the same framing twice more in the file's header
  (`:19`, `:25`). **Re-verified at this commit: all three are still there and
  were not touched.** Applied migrations are immutable, so this can only be
  corrected by a **new** migration superseding the function, or left as a
  historical artefact. Leaving it is the recommendation — it is a comment, not
  behaviour. The gate does not scan `supabase/`, deliberately: it could only
  ever report something nobody is allowed to fix.

### Deliberately left, and to stay left

- `docs/research/2026-08-25-economy-rate.md:443` and `:630` — call ADR 0023
  *"Proposed, not accepted"* and *"(Proposed …)"*. These are **dated research
  records** and the repository treats them as records: they were true on
  2026-08-25 when the memo was written, the memo says what it was measuring and
  when, and **editing a research record to match a later decision would make it
  stop being one.** `docs/research/README.md` states the rule. Both stay, and
  the gate exempts that directory for exactly this reason rather than by
  oversight.

ADR 0017 is the precedent for how the editable ones were cleared: when it was
accepted its body was rewritten to say what it had said *while* it was
`Proposed`, rather than leaving present-tense drafting language in place. 0022's
`## Status` section uses the narrower half of the same move, pointing forward at
the amendment it was accepted *as* instead of rewriting the passage that records
it.

---

## How to act on a future entry, mechanically

Each flip is **two lines, in one commit**, and the suite enforces the pairing:

1. the `Status` line in the ADR itself, and
2. that ADR's row in the `docs/adr/README.md` table.

`tests/foundation/adr-numbering-contract.test.ts` (*"reports each ADR with the
status that ADR itself holds"*) fails if you move one and not the other, so a
half-done flip cannot merge. **A third file now fails too, and it is the one
that will bite:** `tests/foundation/adr-status-reference-contract.test.ts` reads
every sentence in `src/`, `tests/`, `docs/`, `README.md` and `.github/` that
predicates a status of an ADR, so a flip whose *reporting* sentences are left
behind cannot merge either. §6 records what it sees and what it does not. The parser reads the **first keyword** of each side
— `Accepted`, `Proposed`, `Superseded`, `Deprecated` — and requires the two to
agree, which is why 0013's split status opens with `Accepted` on both sides and
qualifies only afterwards, and why 0022's, 0023's, 0026's and 0027's qualified
statuses all open with `Accepted` before saying what they are qualified by. It
reads the first non-blank line under the `## Status` **section heading** only, so
a `###` subsection cannot be mistaken for the document's status — which is what
lets 0022's *Status of this amendment* keep its historical `**Proposed.**` while
the document is Accepted.

Three things that are *not* mechanical, and all three were needed by the thirteen
flips above.

**A status section is not only a keyword.** 0022's said "nothing in `src/`
implements it yet", 0024's named a reversal that would leave ADR 0006 unamended,
0025's said "it is not accepted until they say so", and 0026's and 0027's asked a
reviewer to settle questions the approval does not settle. Each had to move with
the keyword or the file would have contradicted itself in its first paragraph.

**An ADR kept alive rather than superseded must be true.** 0023 was accepted
precisely so its fallback stays available, which is why the false framing around
that fallback could not be left standing.

**Accepting an ADR can oblige an edit elsewhere, and only the ADR knows.** 0024
named the implementation note in ADR 0006 that had to be deleted with it, and
that note was the only one of its kind in the corpus — the six retroactive
approvals and the three room flips dragged nothing. Nothing mechanical would have
found it: the obligation was written in prose, in the document being accepted,
which is the argument for reading an ADR's Follow-up section before flipping its
status rather than after.
