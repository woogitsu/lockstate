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

Re-anchored at `main` @ `cddaebb` (**v0.0.77**). Every claim below was re-read
from disk at that commit, and entries cite symbols rather than line numbers
where a citation would otherwise drift on the next edit (the precedent is #309).

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
and stateless — and leaves its three questions open. **0027's subject is
unreachable in any session a player can start**, which the owner was told when
approving it: a zoned room still derives capacity zero while nothing is placed
in it, so nobody shares a cell and the decision's effects are not observable
until a shipped session can place an object into a zoned room. That is a code
gap, not a wrong status; §5 carries it, with what has and has not moved since
0028's phases 1-2 landed.

---

## 2. The queue has two entries: ADR 0031, and an amendment to ADR 0007

**This heading has now read "empty", then "exactly one entry: ADR 0029", then
"empty again", then one entry once more, and now two.** The second is not a new
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

### ADR 0031 — withdrawing one queued build order

- **What it is.** [ADR 0031](./0031-build-queue-cancellation-surface.md),
  *"Withdrawing one queued build order — where a player aims, and what a long
  queue looks like"*. It settles two things at once: that the pending build queue
  becomes a projected read model (`hud/build-queue`) rather than a copy the main
  thread keeps, and where a player cancels **one** order rather than a whole
  gesture.
- **It arrived with its implementing change**, the same fragile case 0029's entry
  above names, and for the same reason this entry is in the same commit.
- **The evidence is a gate that had carried the gap for its whole life.**
  `tests/foundation/unconsumed-command-contract.test.ts` measured
  `CancelBuildOrder` as the repository's only command with no production
  producer, and the reason its entry gave was correct: no order *id* reached the
  main thread, so no control could name one.
  `src/simulation/protocol/commands.ts` said the same thing while arguing that
  `RemoveObject` carries a tile — an order id is something *"nothing on screen
  shows and no snapshot carries"*. What changed is #348: construction builds one
  order at a time, so `tests/unit/construction-geometry.test.ts`'s twelve-segment
  run finishes at tick **730** where it used to finish at **70**, and eleven of
  those twelve segments now wait hundreds of ticks with nothing on screen saying
  so.
- **What approving it commits the project to.** A thirteenth `PROJECTION_ID` and
  a read model over `ConstructionSystem`; the queue read on the counts cadence
  only while the Build tab is showing; a per-order cancel on the Build panel that
  is `hidden` until something is queued and collapsed when it appears; **the
  Build panel's catalogue dropping from a two-row floor to a one-row floor while
  a queue exists**, which is where the block's 45px comes from and is the
  decision most worth reading twice; and **three rows with no way to page past
  them**, on the argument that the list is the crew's schedule and `Undo` is the
  control for a whole run. It commits to no save-format change, no new content
  and no change to `src/simulation/construction/**`.
- **The measurement that shaped it, because it is the one a reviewer should
  check.** The block's cost was first measured through the UI harness, whose
  aside slot is empty and which therefore hands the Build panel 128.7px more rail
  than the application ever does. On the assembled page a *collapsed* queue put
  the panel 15px over its box at 1280x720 and 37px over at 900x600, with the
  block's own header 14px and 37px below the panel's unscrolled fold — #174 for a
  third time. The catalogue-floor donation is what fixes it, and after it the
  header is above the fold at all five viewports with nothing scrolled.
- **What refusing it would cost.** Refusing the surface means deciding the other
  way round — that arbitrary per-order cancellation is not wanted — and the honest
  consequence is deleting `CancelBuildOrder`: its schema member, its
  `commandJson` case and its handler branch, with
  `ConstructionSystem.cancelOrder` staying because `undo()` delegates to it. The
  read model would survive either way, because "twelve queued, one being built" is
  a fact #348 created and nothing else carries.
- **The exact line that would replace the status.** In
  `docs/adr/0031-build-queue-cancellation-surface.md`, replace
  `**Proposed — pending human approval.** Not accepted.` with
  `**Accepted, YYYY-MM-DD.**`, and change that ADR's row in
  `docs/adr/README.md` from `Proposed — pending human approval` to
  `Accepted, YYYY-MM-DD`. Both in the same commit — the suite checks the pair.
  The two paragraphs in `docs/adr/README.md` that count the `Proposed` rows drop
  by one, and this entry is deleted.

---

### ADR 0007 — an amendment: the shared flow-field plan, and the two caches under it

- **What it is.** A `## Amendment, 2026-08-26 (awaiting approval)` section at the
  end of [ADR 0007](./0007-navigation-work-budgets-and-flow-fields.md), arriving
  with the change that closes issues #357, #358, #359 and #360. It records one
  sentence of the accepted decision that was **false when it was written**, one
  decision the accepted sections do not contain, and two consequences that pull
  in opposite directions.
- **It arrived with its implementing change**, the same fragile case the 0031 and
  0029 entries above name, and for the same reason it is in the same commit.
- **The false sentence.** The decision justifies sharing by asserting a
  `RegionFlowField` is *"mathematically identical to running #21's
  destination-rooted search"* and *"the same shortest-path tree every individual
  `findRoute` call to that destination would eventually discover"*. #21's search
  was rooted at the **origin**, not the destination, and the two ends disagree
  wherever two region routes tie on cost: measured on a four-room ring with equal
  cost both ways round, **64 of 256 origin/destination pairs took a different
  door and 20 cost strictly more, up to double** — and which of the two an actor
  got was decided by how many others happened to share its destination that tick.
- **What approving it commits the project to.** That the region search's
  **direction** is part of the sharing contract: `dijkstraRegionPath` is rooted at
  the destination, because a field can only be rooted there, so `findRoute` and a
  shared field are the same search. That flow-field sharing sits **behind** the
  route cache rather than in front of it, and a field-resolved answer is written
  into it. That both caches record every door an answer *depended on* — including
  the ones they refused — and evict on a change of **traversal verdict** rather
  than of access version. It commits to no save-format change, no new content, and
  nothing outside `src/simulation/navigation/`.
- **The consequence most worth reading twice.** A field answers for every
  reachable region, so its dependency set is every door incident to one: any door
  state change anywhere now invalidates a cached field. That is wider than the
  accepted text's "only fields that depend on it" reads, it is unavoidable for one
  shared object, and it costs the single Dijkstra pass sharing exists to amortise.
  The narrow half moved to `RouteCache`, whose per-route entries are bounded by
  their own origin's reach. Approving means accepting that trade rather than
  overlooking it.
- **What refusing it would cost.** Refusing means deciding that a shared plan may
  differ from the plan `findRoute` returns — and then the accepted sentence quoted
  above still has to be rewritten, because it is false either way, and
  `docs/NAVIGATION.md`'s "hierarchical vs. flat-optimal cost" caveat has to be
  widened to accept two answers for one set of inputs, which it explicitly does
  not today. The measurements say what that would cost in routing: 20 of the 64
  divergent pairs were strictly more expensive through the field.
- **What it does not claim.** Aggregate routing quality is unchanged by the new
  direction rather than improved: against a flat full-map search over the same
  ring, total excess is 48 over 256 pairs either way, worst case 4 either way, on
  the same 20 pairs. And the benchmark mirror
  (`benchmarks/scenarios/navigation-actor-tiers.mjs`) still mirrors the old
  cache/sharing ordering, so the activation and cache-hit columns in
  `docs/NAVIGATION.md`'s table — including the `0 / 60` for `meal-rush`, which was
  this defect published as a property of the scenario — describe the previous
  composition until someone re-runs them. Nothing in this branch touches either
  file.
- **The exact edit that would settle it.** In
  `docs/adr/0007-navigation-work-budgets-and-flow-fields.md`, change the
  amendment's heading from `(awaiting approval)` to `(accepted, YYYY-MM-DD)`,
  delete the sentence in its opening italics saying it has not been approved, and
  delete this entry. **No `Status` line and no `docs/adr/README.md` row move**:
  0007 is Accepted and an amendment to it does not change that, which is exactly
  why this row is the only record that a decision was outstanding.

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
were re-verified at `cddaebb` by grepping the whole `supabase/migrations/` tree
for a total-bytes, retention or pruning mechanism; there is none. The directory
holds the same twenty-one files it held at `4ed571f` — `git diff 4ed571f..main
-- supabase/migrations/` is empty across all eighteen releases — so nothing in
this section has moved for a reason other than nobody having decided anything.

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
half of the decision that *is* in this repository stays verified at `cddaebb`:
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
  is still green rather than fired. **Four of 0028's six phases have now landed
  in whole or in part, and this sentence used to stop at two.** Phases 1-2
  landed in #320, #321 and #323; **phase 3** (removal, and the
  objects-removed-while-occupied path) landed in **#328**, so a standing object
  can be deleted and an order that has not been built can be cancelled and
  refunded; **phase 5**'s Rooms-tab readout landed *in half* in **#336**, which
  ships the per-room "what is this room missing" verdict but not the
  "over capacity" state the projection still cannot say
  (`room-projection.ts` reads an over-capacity room as full at 100%); and
  **phase 6**'s counting landed in #323 under the decision ADR 0029 is still
  awaiting approval for (§2). Phase 4 — the rest of the object catalogue — is
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
  `src/services/telemetry/` imports it, re-verified at `cddaebb`, so consent is
  never asked for and `record()` is never called. The prohibition half of the ADR
  holds; the sentence *"telemetry is fed from the main thread's orchestration
  layer"* does not.
- **ADR 0009 — "Accepted — implementation gated", and all four gates are unmet.**
  `verifyChallengeSubmission` and `isPubliclyRankable`
  (`src/services/challenges/verification.ts`) exist; no replay runner implements
  the port, no endpoint exists, and nothing outside `src/services/` imports the
  layer. **This status is the most accurate in the corpus** — it says "gated", and
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
  Re-verified at `cddaebb` by grepping the whole tree: **`3.9` appears in no ADR
  but 0025, in no `.css` file, and nowhere in `src/`.** Neither document it cites
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
  drifted.** `HudIntent` declares **fifteen** members rather than the seven the
  ADR counts — it cites `src/ui/hud/hud.ts:153-195` for the seven — three of
  them room-related; `ZoneRoom` is no longer in `AWAITING_PRODUCER` at all
  (#312 gave it a producer, and
  `tests/foundation/unconsumed-command-contract.test.ts` fails in both
  directions); the `onIntent` switch in `src/main.ts` has moved; and its
  citation of *"`tests/unit/ui-hud-messages.test.ts:196-200` asserts it by
  scanning for the import"* now lands eight lines short — #339 removed the
  single-file, comment-blind copy of that check from
  `tests/unit/ui-hud-build-panel.test.ts`, and the surviving assertion, which
  covers every file under `src/ui/hud/**` and `src/ui/primitives/**` over
  comment-stripped source, sits at `:204-210`. The ADR names the right test and
  the property it names is strictly stronger than it was; only the line range
  drifted.

  **This entry said "thirteen", and thirteen was never right.** It was fourteen
  at `ac03d8f`, the commit that wrote the number, and `remove-object` (#328) has
  since made it fifteen — so a sentence written to record somebody else's
  drifted count was itself off by one on the day it landed, and off by two
  within four releases. The two arms it missed are `arm-build-tool` and
  `arm-room-tool`, which are the only members declared across several lines
  rather than on one, which is exactly the shape a hand count skips. Nothing in
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
  `cddaebb`: `simulationCommandSchema` in
  `src/simulation/protocol/commands.ts` discriminates **eleven**, and
  `AdmitPrisoner` (#306) concerns a prisoner. The
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
  is still unchecked"* — so the two ADRs are the last places in the corpus
  asserting the old world, and a reader who follows either citation lands on a
  page contradicting the sentence that sent them. **Neither conclusion moves**,
  which is why the bodies are left verbatim: 0023's step 1 is now reachable but
  still resolves to zero for an empty room, so branches 2 and 3 remain the ones
  a shipped session takes, and 0027's co-occupancy is still unreachable for the
  reason its own tripwire (above) is still green. What is false is the stated
  cause, not the state. The same phrase in `docs/research/` stays untouched for
  the reason that directory's README gives.

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
