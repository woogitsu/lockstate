# One decision is awaiting approval — and where an accepted decision contradicts the code

This file is for the repository owner and nobody else. It exists because
`docs/adr/README.md` reports statuses and `tests/foundation/adr-numbering-contract.test.ts`
keeps that report honest, but **neither can tell you whether a status is true
about `main`** — the index compares a document to a table, not a decision to an
implementation.

**Nothing here changes a status.** A status moves in the ADR and in the index,
never in this file. What changed with this revision is what the file is *for*:
§1 records **all thirteen** flips, §2 holds **the one decision awaiting
approval — ADR 0029** — above the account of why the queue had been emptied and
what that bought, and everything after it is the residue — one genuinely open
decision, one watch item, and the gaps between an accepted decision and the
code. §6 used to be the inventory of stale sentences the flips left behind;
**they are corrected, and that class is now asserted by a test**, so what it
holds instead is the account of what moved, what may not be touched, and what
the test cannot see. Deciding is still the owner's; this file only makes the
next decision cheap.

Re-anchored at `main` @ `4e3976d` (v0.0.65), plus the text corrections in the
commit that carries this revision. Every claim below was re-read from disk at
that commit, and entries cite symbols rather than line numbers where a citation
would otherwise drift on the next edit (the precedent is #309).

A note on keeping this file true, since it is the kind of document that rots
silently: an entry's evidence is a claim about `main`, so **landing the change
an entry describes means updating that entry in the same commit**, exactly as
moving a status means moving its index row. #295 changed the code and ADR 0012
and left this file behind, which is how the old entry 7 came to be false for two
releases — a correction that itself had to be landed separately, at `b653b93`,
before the entry could be acted on. Nothing mechanical can catch that: both
gates over `docs/adr/` check statuses against documents — the index against the
ADR, and now every sentence in the corpus against the ADR — and neither checks a
status against code. It is a habit, not an assertion.

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
and stateless — and leaves its three questions open. **0027's subject is
unreachable in any session a player can start**, which the owner was told when
approving it: a zoned room still derives capacity zero while nothing is placed
in it, so nobody shares a cell and the decision's effects are not observable
until a shipped session can place an object into a zoned room. That is a code
gap, not a wrong status; §5 carries it, with what has and has not moved since
0028's phases 1-2 landed.

---

## 2. The queue has exactly one entry: ADR 0029

**This section's heading used to be "The queue is empty", and the entry below is
the first thing to arrive since.** The rule that section states — *"any commit
that adds a `Proposed` ADR adds an entry here in the same commit, giving the
evidence, what settling it commits the project to, and the exact line that would
replace the status"* — is followed, and the account of why the queue was emptied
is kept below it unchanged, because it is the argument for why one row is worth
reading.

### ADR 0029 — concurrent-use claims on a room

- **What it is.** [ADR 0029](./0029-concurrent-room-use-claims.md), *"What a
  concurrent-use claim on a room is — when it is taken, when it ends, and who
  waits"*. It answers three questions ADR 0028 left open and named as owed (its
  open question 7, phase 6's queueing rule, and what a claim means once both
  kinds exist) and **corrects one thing ADR 0028 decided**: decision 3's
  *"The occupant set is **not** split"*.
- **It arrived with its implementing change**, which is exactly the fragile case
  the paragraphs below warn about, and is why this entry exists rather than the
  ADR sitting on `main` unnoticed.
- **The evidence for the correction is a sentence that was already in the
  tree.** `src/simulation/economy/income.ts` stated that if occupancy were ever
  registered somewhere a prisoner is not housed — *"a canteen tracking
  diners"* — the income definition *"would pay twice for one prisoner-day and
  has to be narrowed to accommodation before that lands"*. ADR 0028 phase 6 is
  that canteen. Under one undifferentiated occupant set a prisoner eating lunch
  would earn 600 minor units a day instead of 300. Verified after the change:
  the 250-actor scenario's `totalOccupancy` is 250 both before and after, so the
  economy does not move.
- **What approving it commits the project to.** Two claim collections in
  `RoomInstanceRegistry` rather than one, with `occupancyOf`/`totalOccupancy`
  keeping their residency meaning; a claim taken on arrival and released when the
  action ends; `unzone` refusing while anybody is *using* a room; contention
  decided by ascending entity index with **no queue**, and the starvation that
  permits accepted as a named consequence with a revisit condition. It commits to
  no save-format change and no new content.
- **What refusing it would cost.** The defect it fixes is measured: 40 prisoners
  entered a canteen whose `concurrentUseCapacity` was 1, in one reconsideration
  tick. Refusing decision 1 specifically — insisting on one occupant set — means
  either the double-payment above or an economy rule that has to learn what a
  diner is.
- **The exact line that would replace the status.** In
  `docs/adr/0029-concurrent-room-use-claims.md`, replace
  `**Proposed — pending human approval.** Not accepted.` with
  `**Accepted, YYYY-MM-DD.**`, and change that ADR's row in
  `docs/adr/README.md` from `Proposed — pending human approval` to
  `Accepted, YYYY-MM-DD`. Both in the same commit — the suite checks the pair.
  The two paragraphs in `docs/adr/README.md` that now say one row is `Proposed`
  go back to saying none is, and this entry is deleted.

---

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
`supabase/migrations/20260823100000_bound_free_tier_capacity.sql`. Both absences
were re-verified at `4ed571f` by grepping the whole `supabase/migrations/` tree
for a total-bytes, retention or pruning mechanism; there is none, and no
migration has been added to that directory since the previous re-anchor.

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
file under `supabase/migrations/` and nine migrations were applied anyway. The
half of the decision that *is* in this repository stays verified at `4ed571f`:
`.github/workflows/migrate-database.yml` is `workflow_dispatch:` with no `push:`,
requires a typed `confirm_project_ref`, and its apply job is environment-gated.

So the constraint is approved architecture whose only defence is a sentence in a
document. Repointing the integration is a two-click change in a dashboard; it
would violate an Accepted ADR with no code review and no trace in this
repository. **There is nothing to decide here — this is a watch item**, and the
thing to watch for is the creation of a second Supabase project.

---

## 5. Where an accepted decision and the code disagree

Everything below describes a mechanism `main` does not exercise, or documents
that disagree with each other. **None is a status defect**, and with the queue
empty that is the whole of what this section can be: either a decision is
accepted and the code has not caught up, which is a code or wiring gap, or two
documents state different numbers, which is a docs-truth job. They are recorded
so that reading this file does not leave the impression that the corpus was
audited in one direction.

- **ADR 0023 and ADR 0028 are Accepted and now partly implemented, on the
  schedule 0028 set.** This entry read "Accepted and unimplemented", re-verified
  at `4ed571f` on three grounds: that `RoomZoningService` registered every
  instance with `capacity: 0` and `objectCapabilities: []`, that no room
  definition carries a capacity field, and that no `'object.*'` id appeared as a
  literal under `src/` outside `src/content/`. The first and third have since
  moved. `RoomZoningService` no longer hardcodes the zero — it resolves a
  derived figure through a collaborator (`src/simulation/rooms/zoning.ts:330`,
  called at `:444`) — and two object ids are now built by construction
  definitions (`placesObjectId: 'object.bed'` on `BUILDABLE_REGISTRY`'s
  `bed-wooden` row and `'object.toilet'` on its `toilet-brick` row,
  `src/simulation/construction/definition.ts`; cited by symbol rather than by
  line, because the two line numbers this entry used to give have already
  drifted once), so something does place, build and read an object. What has **not** moved is the second ground
  and the observable outcome: no room definition authors a capacity, and an
  empty zoned room still derives zero, which is why ADR 0027's tripwire below
  is still green rather than fired. Phases 1-2 of 0028 landed in #320, #321 and
  #323; the remaining phases are the rest of its own *What this costs*. One
  thing phase 1 promised is now true and was **not** delivered by any phase:
  `door-wooden` builds a real door. It could not be an object placement — a door
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
  object-derived ceiling at all, which is `room.yard` and nothing else.
- **ADR 0027's subject is unreachable, so its effects are not observable.** New
  as of this commit and the reason its status line is qualified. The rating seam
  that was approved is live, and it is inert: a zoned room with nothing placed in
  it still derives capacity zero, so `findBestAvailable` returns `undefined` for
  `room.cell` with and without the `sleep-surface` filter, and
  `prisoners-intake-system.test.ts`'s "houses nobody at all through the shipped
  session path" still passes. That tripwire is the notice this entry is waiting
  on and it has **not** fired: it was written to fail the day capacity is derived
  from placed objects *in a shipped session*, and while 0028's phases 1-2 have
  landed the shipped path still zones an empty room, so the derivation returns
  the same zero the hardcoded one did. When it does fire, the failure is the
  notice that ADR 0027's stated precondition has expired and #79 is reachable for
  real — do not re-baseline it to green. Approving a decision whose effects are
  not yet observable was the deliberate choice the owner was shown; the gap
  belongs here rather than in §3 because nothing is awaiting a decision.
- **ADR 0026's three questions are open under an Accepted ADR**, and the only
  thing holding them is a pair of tests that assert the wrong answer on purpose
  (`tests/unit/entity-generation-wrap.test.ts`, and one case in
  `tests/unit/prisoners-intake-system.test.ts`, both labelled `DEFECT`). That is
  what was accepted, so it is not a status defect — but it is the entry to read
  before #31, because the release path is where all three questions become
  load-bearing on the same day, and because nothing else in the suite observes
  any of it: mutating the wrap period from `& 0xFFF` to `& 0xF` leaves the suite
  green except one case in `actor-identity.test.ts`, which pins the arithmetic
  period and not one of its consequences.
- **ADR 0012 — a retained topology is now evicted; the streaming policy is what
  is left.** This entry read "`chunkTopologies` is never evicted", re-verified at
  `4ed571f` on the ground that no `delete` existed on that map. **#324 closed
  it**: `update()` drops the retained topology of every chunk the world no longer
  reports as loaded (`this.chunkTopologies.delete(key)`,
  `src/simulation/rooms/topology.ts:99`), so the component walk sees only loaded
  chunks and an id is no longer a function of chunk *load* history either.
  `GlobalTopologyId` therefore meets ADR 0012's category 2 outright rather than
  only with respect to *recompute* history. What this section still carries is
  the ruling the ADR reserves and #324 deliberately did not take: whether an
  unloaded chunk should be *representable* in a topology at all, and if so from
  what persisted geometry. That is a decision, not a code gap — which is why it
  belongs here and the eviction no longer does.
- **ADR 0006 / ADR 0003 decision 4 — the handshake gates nothing.** `'ready'` is
  a member of `WorkerState` (`src/simulation/worker/state-machine.ts`) and no
  `transition()` call targets it; the calls in the file reach `'faulted'`,
  `'paused'`, `'paused'`/`'running'` and `'shutting-down'`. Nothing in `src/`
  sends a `protocol/handshake` at all — every occurrence is the receiver, the kind
  list or the schema. So ADR 0006's state 2 describes a state the machine cannot
  occupy and ADR 0003 decision 4's version negotiation runs for nobody. Version
  compatibility still fails closed, by a different route: the decoder's
  `protocolVersion: z.literal(...)` in `src/simulation/protocol/types.ts`. This is
  issue #118 item 1 and issue #274's A2, and both ADRs carry an implementation
  note for it — the two notes of that shape the corpus still holds, now that
  0024's has been deleted. The fix is in the code, and the open decision is
  whether to send the handshake or delete `'ready'` (issue #274, Q4).
- **ADR 0010 — the telemetry layer is inert.** Nothing outside
  `src/services/telemetry/` imports it, re-verified at `4ed571f`, so consent is
  never asked for and `record()` is never called. The prohibition half of the ADR
  holds; the sentence *"telemetry is fed from the main thread's orchestration
  layer"* does not.
- **ADR 0009 — "Accepted — implementation gated", and all four gates are unmet.**
  `verifyChallengeSubmission` and `isPubliclyRankable`
  (`src/services/challenges/verification.ts`) exist; no replay runner implements
  the port, no endpoint exists, and nothing outside `src/services/` imports the
  layer. **This status is the most accurate in the corpus** — it says "gated", and
  the gates are genuinely shut. Listed as a model, not a defect.
- **ADR 0022's pre-correction 900×600 budget disagrees with
  `src/ui/hud/build-panel.ts`.** The ADR's table says `12.2` and that file's
  comment on `buyToggle` says `11.8`; both were measured on the same tree by
  different probes and neither was re-derived when the other was written. Nothing
  turns on which is right — the Rooms tab's advantage is ~24× either way, and the
  corrected figure, `7.81`, is the one measured to 0.05px, which is exactly why
  the disagreement has survived unnoticed. `docs/adr/0025-guard-hiring-surface.md`
  quotes a third figure from the same family (3.9px at 900×600, inherited rather
  than re-measured, and its Status says so), which is worth knowing before anyone
  tries to reconcile two numbers and finds three. It is a docs-truth task inside
  two accepted ADRs, and it belongs in a change of its own.
- **ADR 0022 was written against v0.0.30 and its structural citations have
  drifted.** `HudIntent` declares thirteen members rather than the seven the ADR
  counts, three of them room-related; `ZoneRoom` is no longer in
  `AWAITING_PRODUCER` at all (#312 gave it a producer, and
  `tests/foundation/unconsumed-command-contract.test.ts` fails in both
  directions); the `onIntent` switch in `src/main.ts` has moved. None of it
  touches the decision, but a reader following a `file:line` out of that ADR
  should expect to land near rather than on.
- **ADR 0027's command-surface count has drifted the same way**, new as of this
  commit and worth recording because it is one clause inside a question that
  stays open. Its question 2 says the entire command surface is seven members and
  *"not one of them concerns a prisoner"*. Re-verified at `4ed571f`:
  `src/simulation/protocol/commands.ts` declares **nine**, and `AdmitPrisoner`
  (#306) concerns a prisoner. The load-bearing half of the argument is
  unaffected — there is still no player input to *placement*, and an override
  still needs a new command type, its codec case, a handler branch and a decision
  about whether intake blocks — so the body was left verbatim rather than
  rewritten by the commit that accepted it, exactly as 0022's drift was.

Also not here as a decision: **ADR 0002**, whose configuration matches the ADR
exactly (`wrangler.jsonc`) while `docs/DEPLOYMENT.md` records that
`lockstate.io` is in fact served by `lockstate-staging` and that Worker
`lockstate` has never been deployed. That is a live operational trap, but it is a
missing warning in the ADR body rather than a wrong status, and the deployment
document already carries it.

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

- **Non-vacuous.** It asserts floors — more than 300 corpus files walked and
  more than 15 status claims actually parsed and compared (33 on the tree that
  landed it) — so a scanner that read nothing, or a claim pattern that stopped
  matching prose, fails instead of passing quietly. Its positive control runs
  the checker against text whose verdict is known, in both directions.
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
three shapes existed in this corpus and all three were corrected by hand. The
test also exempts itself, because its header and its positive control quote
false claims on purpose, exactly as this file does.

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
- `tests/unit/prisoners-intake-system.test.ts` — *"it is stated at Proposed in
  ADR 0026 rather than settled here"*, on the re-intake case. Now names it as
  0026's question 3, left open by an Accepted ADR.
- `src/simulation/economy/income.ts` — *"a ninth `Proposed` document in
  `docs/adr/`"*. There is exactly one, and it is 0029; the argument for keeping
  the rate on issue #29 never depended on the count, so the count is gone from
  it. **The other half of this entry was already fixed before this change**: the
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
- `docs/adr/0013-free-tier-cloud-save-capacity.md:15` and `:150` — the Status
  table row and the §4 heading both marked 4 MiB `PROPOSED`; `:19-20` asked a
  reviewer for *three* numbers. §4 is Accepted, the heading and the row say so,
  and the ask is now two — 20 revisions (§6) and 256 MiB (§5). One more in the
  same document, not previously listed: §4's headroom bullet asked that *"the
  approval asked for in the Status table above should be given or withheld
  against these figures"*, which is a request that has been answered; it now
  says these are the figures §4's bound stands on.
- `docs/adr/0015-actor-identity-allocation.md:145-146` — *"Accepting 0015
  without 0012 leaves the taxonomy it argues in still Proposed"*, describing a
  case that cannot arise. Both were accepted in the same commit, so item 1 of
  *What this asks a human to accept* is discharged and says so.
- `README.md:59` — ADR-0014's *"`Status` is `Proposed` … the decision has not
  been approved"*. Now Accepted, and the pipeline the repository implements is
  the approved one rather than a proposal it happens to match.
- `docs/CLOUD_SAVE.md:1184` (*"the ADR is `Proposed`, not…"*) and `:1200` (the
  4 MiB row). The prose now states the split — Accepted for §§1-4, §§5-6 still
  Proposed — and the row reads Accepted as §4. **`:1201-1202` were true and
  stayed true**, and they gained their ADR section numbers so that a reader (and
  the gate) can tell a §-scoped `Proposed` from a claim about the whole
  document. `:1239` and `:1250` were already §-scoped and are untouched.
- `docs/TRUSTED_SERVICES.md:577` — *"the 4 MiB per-save figure is proposed, not
  accepted"*, and *"ADR 0013 is in `Proposed` status"*. Both corrected; the two
  numbers that genuinely remain open are named as §§5-6 and the churn lever as
  §7.
- `.github/workflows/migrate-database.yml:20` — *"(ADR 0016 §2, Proposed)"*.
  Now `Accepted`, and the comment says the constraint is binding with nothing
  enforcing it mechanically, which is the sentence that made the flip worth
  landing here at all.

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
