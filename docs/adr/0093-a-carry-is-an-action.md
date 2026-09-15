# ADR 0093: A carry is an action

## Status

**Accepted, 2026-09-03, by the repository owner — all six decisions, and
nothing this document reserves.** Shown this document's six decisions as
written — including the amendment of 2026-09-02 already inside it and the three
player-facing sentences it says it cannot write — they answered *"Zaakceptuj
ADR 0093 i wdrożę mechanikę"* (accept ADR 0093 and the mechanic will be
implemented). That approves decisions 1 through 6 and the costs each states,
and it approves nothing wider:

- **Two of the three sentences under *What is owed to the owner* are still
  owed, and the first of them is not.** The standing condition for a delivery
  waiting in a bay with nobody to carry it, and whatever the detail panel says
  about goods in hand, remain the owner's under `AGENTS.md`'s fourth exclusion.
  An approval to build the mechanic is not an approval to write them.
  **This bullet read "The three sentences … are still owed" until later the
  same day**, and it is corrected rather than overwritten
  (`docs/AGENT_WORKFLOW.md` §4): the acceptance really did leave all three
  owed, and what changed them to two is a *separate* ruling recorded in
  *Amendment, 2026-09-03: the action's label is the owner's word* below. The
  sentence's original form is the record of what the acceptance alone
  approved.
- **The three open questions are still open.** Whether a carrier is
  interruptible by a regime change, what the cancel path owes a player, and
  whether a `'carrier-departed'` job deserves a notice were put to the owner as
  the owner's and were not answered by this ruling.
- **Nothing in *What would change my mind* is retracted by the acceptance.** The
  passage records what the document thought its weakest claim was, and the
  owner's amendment already overruled it; both are kept as they stand.

**This cell read `Proposed, 2026-09-02. Not self-approved` until the
acceptance, and what it said is kept rather than overwritten**
(`docs/AGENT_WORKFLOW.md` §4: mark both directions). It read: *"Nothing below
is implemented and no code on this branch does any of it; the branch carries
this document and one foundation test that pins the incoherence the document is
about, as the tree has it today. A reader who disagrees with a decision here
should treat it as open — the argument is the whole of the warrant."* The first
half of that stopped being true with the change that landed the mechanic; the
second half is what the acceptance replaces.

**What the owner decided on 2026-09-02, and what they did not decide then.** On
2026-09-02 the owner ruled on issue
[#600](https://github.com/matmaxalez/lockstate/issues/600) between the three
options pull request #811 priced for *who owns a working prisoner's body*, and
chose the third with its cost in front of them: **a carry is an action** — the
job system's carry becomes a `work`-category `ActionDefinition` whose target is
a job on the board, so one authority moves the prisoner and the use claim *is*
the job. That ruling is why this document is about option (c) and not about (a)
or (b), and it is recorded below as the reason the option is taken. **It was not
a signature on the design of (c) that follows** — that came separately, on
2026-09-03, and is the section above. This paragraph used to end *"and every one
of those answers is proposed"*; it is kept in its corrected form because the
two-stage shape is the record: the option was chosen on one day and its design
signed on another.

Measured on v0.0.364 (`1547c7f6`), the head of `main` when this branch was cut.
Every `file:line` below was opened at that commit.

**Every player-facing sentence this needs is deliberately absent.**
`AGENTS.md`'s fourth exclusion reserves them; the section *What is owed to the
owner* lists them. Where a word is owed, this document says so rather than
proposing one. **One of the three has since been ruled on by the owner and is
no longer absent — the action's label, see the amendment of 2026-09-03 — and
this paragraph is kept as written because it is true of the document as
accepted and of the two sentences that are still owed.**

### The number

**0093**, assigned by this branch's own remote sweep rather than by `max + 1`
off disk, per `AGENTS.md` and `docs/AGENT_WORKFLOW.md` §2.
`git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
`git ls-remote --refs --heads origin` — **449 heads** — with
`git ls-tree --name-only <head> -- docs/adr/` read out of every one of them.
The highest four-digit prefix on any head is **0092**, held unmerged on
`docs/where-a-guard-stands-and-what-route-they-walk`
(`0092-who-decides-where-a-guard-stands.md`, pull request #815, open) and
absent from `main`, whose `docs/adr/README.md` still states `0092` as next
free. Nothing on any head holds 0093. So this line moves over a hold, exactly as
0088 through 0092 each did, and the index row added in this commit is what
reserves it.

**This document pre-commits to renumbering without argument** if a branch that
lands first turns out to hold 0093: this file, its row in `docs/adr/README.md`
and every citation of "ADR 0093" move together.

**The document sets its own status and the index only reports it.** The row
added in this commit said `Proposed`, because this section did; it says
`Accepted` now, because this section does. The direction of that dependency is
the point and has not changed.

### What this document rests on, and where it corrects its own brief

The ground truth is pull request #811 (branch
`feat/600-a-work-block-has-workers`, **not merged**), which carries
`job-production-contract.test.ts` (under `tests/foundation/` on that branch only) and a report. Every
load-bearing claim in it was re-verified here against `1547c7f6` rather than
taken on trust, and the measurement that forced the ruling was **re-run rather
than quoted** — see *The incoherence, measured again*. Three corrections to the
brief this document was written from, each small and each the kind that sends
a reader to the wrong file:

- The brief said to read *"the note the #600 branch produced"* under
  `docs/research/`. **That branch carries no research note.** Its diff against
  `main` is two files: the foundation test above and a corrected count in
  `tests/foundation/unconsumed-content-contract.test.ts`. The findings live in
  the pull request body and in the test's own header.
- `new-session.ts` is `src/simulation/runtime/new-session.ts` — one directory
  deeper than the brief's `simulation/new-session.ts`.
- `kernel-system-order.test.ts` is under `tests/determinism/`, not
  `tests/foundation/`. Its pin of `operations.jobs` at order 260 is at
  `tests/determinism/kernel-system-order.test.ts:434`.

---

## The decision, in one sentence

**A carry is a `work`-category action.** `DEFAULT_ACTIONS` gains one appended
entry whose target is *a job on the board* rather than a room;
`prisoners.actions` takes the job as the action's claim at selection, walks both
legs through `LocomotionStore` like any other action, and performs the pickup
and the drop-off itself; `operations.jobs` stops being a system and
`JobWorkerPool` is retired, because eligibility is the regime's and busyness is
the job's; and the first producer of a carry is a delivery landing in a
`room.delivery-bay`, carried to the storeroom, which is the physical route
[ADR 0017](./0017-money-primary-resource-model.md) decision 4 has named since it
was written. No save version moves.

---

## Context: what the code does today, verified at `1547c7f6`

### The job system runs and is handed nothing

`JobSystem` is constructed at `src/simulation/runtime/new-session.ts:860` and
registered at `src/simulation/runtime/new-session.ts:1400`. It declares
`id = 'operations.jobs'`, `order = 260` and `schedule = { intervalTicks: 5 }`
(`job-system.ts:78-80`, a file this decision **deletes**), and the order is pinned at
`tests/determinism/kernel-system-order.test.ts:434`. So it is not dead code and
not declared-and-never-called: it runs on every session's kernel, every five
ticks.

What it is handed is nothing. `JobBoard.submitCarryItem` has exactly one
occurrence under `src/` and it is the declaration
(`src/simulation/operations/job.ts:106`); `JobWorkerPool.register`
(`job-system.ts:28`, in the file this decision **deletes**) is called from no file under
`src/`. The only things in this repository that ever put a job on a board or a
prisoner in the pool are two test helpers doing so by hand
(`tests/helpers/determinism-scenario.ts:188` and `:195`;
`tests/determinism/job-performing-restart-bound.test.ts:62` and `:65`). The
adapter that would move a prisoner for a job says of itself that no prisoner is
registered by default and that doing so is *"a session/scenario/future-regime
decision"* (`job-worker-adapter.ts:12-16`, in the file this decision **deletes**). #811 calls
this a consumer with no writer, the mirror image of the dead-room shape, and
that is exact.

### "A prisoner in a work block be a worker" has been half done since #532

`'work'` has been an `ActionCategory` since issue #24
(`src/simulation/prisoners/regime.ts:3`), and `GENERAL_POPULATION_REGIME` allows
it for 1,000 of the day's 2,400 ticks across two blocks
(`src/simulation/prisoners/regime.ts:109` and `:112`). The blocks are not empty:
`action.laundry-work` and `action.kitchen-work` are the last two entries of
`DEFAULT_ACTIONS` (`src/simulation/prisoners/actions.ts`), each targeting a
`room-catalog-id`, each gated on an object capability, each bounded by the
room's concurrent-use ceiling, each holding a real use claim while it runs
([ADR 0029](./0029-concurrent-room-use-claims.md)). #811 measured 3,534 of
5,000 work-block ticks performing a `work` action on a prison built through
`Kernel.submitCommand`; this document's own probe found the prisoner
`performing` `action.kitchen-work` in `room.kitchen:10:6`, claim held, at tick
**673** of a session that admitted them at 600.

So issue #600's premise — *"the 1,000 daily ticks stop being a boolean 'was
employed today'"* — describes a tree this repository left behind. There is no
boolean. What a working prisoner is *not* is a member of `JobWorkerPool`, and
what no room knows is *stock*: a `Container` carries no tile and no room
instance (`src/simulation/operations/inventory.ts:20`) and `ContainerRegistry`
is keyed by a bare string (`src/simulation/operations/inventory.ts:95`).

### The incoherence, measured again

#811 registered a working prisoner as a worker and submitted one carry, and
reported the prisoner eighteen tiles from the kitchen by tick 710, still
recorded as working in it. That number was **re-obtained here, not copied**,
through `tests/foundation/two-authorities-one-prisoner-contract.test.ts` on
this branch — the same prison, built through commands, seed `0x0b1ec7`; a
stocked container registered under the prisoner's feet and an empty one at
(24, 24); the prisoner put in the pool and one carry submitted at the tick they
were found working:

| tick | prisoner tile | `phase` | action | `getActionTarget` | kitchen claims | `needFulfilledLastTick` |
| --- | --- | --- | --- | --- | --- | --- |
| 673 | (10, 6) | `performing` | `action.kitchen-work` | `room.kitchen:10:6` | 1 | 0 |
| 691 | **(24, 24)** | `performing` | `action.kitchen-work` | `room.kitchen:10:6` | **1** | 680 |
| 731 | (24, 24) | `performing` | `action.kitchen-work` | `room.kitchen:10:6` | 1 | **720** |

The carry completed at tick 691 — pickup dwell, `withdrawReserved`, a route to
the depot, and `PrisonerJobWorkerAdapter.setPositionTile`
(`job-worker-adapter.ts:40`, in the file this decision **deletes**) writing the destination
tile when the route resolved. From that tick the prisoner stands **26 tiles**,
by Manhattan distance, from the nearest tile of the kitchen rectangle (#811's
"eighteen" is the Chebyshev distance from the room's anchor; both say *out of
the room*), while `prisoners.actions` records them performing kitchen work,
targeting the kitchen, holding its one concurrent-use seat, and being fed by a
stove they are not standing at — the fulfilment stamp moved from 680 to 720
after the tile did. The action ended on its own terms 120 ticks after it began,
and only then was the seat released.

Neither system is wrong on its own terms, and that is why this is a decision
and not a bug. `ActionSystem` has no departure event to release a claim on —
ADR 0029 decision 3 ends the claim when the *action* ends — and `JobSystem`
moves the worker because [ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md)
names *"an external write to a walker's tile ends the walk"* as the rule and
this adapter as its one site outside `prisoners/`. Two authorities write one
prisoner in one tick: `prisoners.actions` at 250 decides, `operations.jobs` at
260 overrides the position, and each is correct about the half it owns.

The test that pins this was watched going red under two mutations, one in each
direction the options below take: with `setPositionTile` no longer writing the
tile it fails at *"expected { x: 10, y: 6 } to deeply equal { x: 24, y: 24 }"*;
with the adapter also ending the action (releasing the claim, clearing the
target, dropping the phase) it fails at *"expected 'idle' to be 'performing'"*.
Both mutations were reverted with `git checkout` before this document was
committed.

### The authority inventory

Every writer of a prisoner's tile under `src/simulation/`, because "one
authority moves the prisoner" is a sentence about an absence and has to be
checked rather than asserted:

- `src/simulation/prisoners/action-system.ts:836` — `arrive`, writing the
  destination anchor after the walk has already stepped there.
- `src/simulation/prisoners/prisoner-operations-runtime.ts:420` — the
  `writeTile` closure `LocomotionSystem` advances a walk through.
- `src/simulation/prisoners/prisoner-operations-runtime.ts:959` — admission,
  placing a new prisoner on the origin tile before intake.
- `job-worker-adapter.ts:43` (in the file this decision **deletes**) — the job system's
  write, and the one that is *external* to the action path.

And every caller of `LocomotionStore.cancelWalk` on a prisoner:
`action-system.ts:631` (a room un-zoned mid-journey) and
`job-worker-adapter.ts:42`; the third caller, `security/guard-roster.ts:203`,
is the guard population. So ADR 0059's *"There is one such write outside
`prisoners/`"* is still exactly true at `1547c7f6`, and it names the seam this
document removes.

---

## The three options, and the ruling

Priced in #811 and re-stated here so the record is in the ADR rather than in a
pull request body. **They are not re-argued**: the ruling is made, and this
document's work is what the chosen option needs.

### (a) The job wins

`setPositionTile` also abandons the action: release the claim, clear the target,
reset the phase. Smallest change to `JobSystem`; it makes the adapter the second
place a claim is released, outside the *"one release site per exit"* argument
`ActionSystem.releaseUseClaim` makes for itself; and a seat released by a
departure re-opens ADR 0059 open question 2 (*"Does a room's seat get reserved
at departure, with an expiry?"*) and [ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)'s
who-gets-the-room ordering, both of which were argued against exactly that
release existing.

### (b) The action wins

A prisoner is offered a job only while *idle*, so `JobWorkerPool` membership
becomes a function of `phase === 'idle'` inside a `work` block. Cheapest of the
three; preserves every existing guarantee; and it makes the labour budget only
the *unclaimed* part of the block — a prisoner already on kitchen duty is never
a carrier — which is a different mechanic from the one #600 describes.

### (c) A carry is an action — **taken, by the owner's ruling of 2026-09-02**

A `work`-category `ActionDefinition` whose target is a job on the board, so one
authority moves the prisoner and the use claim is the job. Architecturally the
cleanest, by far the largest, and the only option under which #600's own words
— *"let a prisoner in a `work` block **be** a worker on the board"* — are
literally true. **The owner chose it with that cost in front of them**, and
what follows is what it needs decided.

---

## Amendment, 2026-09-02: the owner OVERRULED decision 2's ordering

**Put to the owner as this document's own weakest claim, and they took the
fallback rather than the claim.** Decision 2 as drafted says duty outranks want
inside a work block — a hungry prisoner carries before they cook. The owner
ruled: **the need wins when it is urgent.** Decision 2's rank-0 rule stands for
a prisoner whose needs are all in ordinary condition, and yields to a need that
has become urgent.

**The document said the threshold was a balance number it had no standing to
choose. It was wrong about that, and the correction is the useful part of this
amendment: the number already exists and belongs to the institution.**
`STATE_INCOME_UNMET_NEED_LEVEL = 51` (`src/simulation/economy/income.ts:307`),
against `NEED_MAX = 255` (`src/simulation/prisoners/needs.ts:14`), is the level
below which **the state declines to pay for that prisoner-day** — six needs, one
withheld term each, per ADR 0064's decision. Reusing it makes the rule read as
one statement rather than two: *the institution will not send a prisoner on an
errand while it is already failing to meet a need it is being docked for.*

**So the rule is:** inside a work block with an available job, `action.carry`
enters `candidates` at rank 0 **unless** the prisoner has a providable
candidate for a need whose level is below `STATE_INCOME_UNMET_NEED_LEVEL`, in
which case the carry is not placed at rank 0 and ordinary scoring decides. No
new constant, and no fraction picked by this document.

**One correction to the fallback as this document sketched it.** It proposed
gating on *"the prisoner's best providable need-**score**"*. That quantity is
wrong for a threshold: `scoreAction` is deficit × effect summed over the
action's own effects, so its scale depends on how large that action's effects
are and two actions relieving the same deficit score differently. A threshold
on the need's **level** is comparable across every need and every action, and it
is the quantity `STATE_INCOME_UNMET_NEED_LEVEL` is already expressed in. The
sketch's shape is kept; its measurand is corrected.

**What this costs, stated.** The carry's rank-0 rule stops being a pure
function of the block and the board — it now reads needs too, so
`planIdleSelection` evaluates one extra predicate per idle prisoner in a work
block. That predicate is the same `firstProvidedCandidateIndex` walk the
selection already performs (`utility-ai.ts:171`), so it is a reuse of a pass
rather than a new one. Determinism is unaffected: need levels are integers in
component storage and the threshold is a constant comparison.

**What is still NOT decided, and is not decided here.** Whether a player is
ever *told* that a prisoner skipped an errand because they were hungry. That is
a player-facing sentence and therefore the owner's; it joins the three
sentences this document already owes them.

**This amendment did not make the document `Accepted`.** The owner ruled on
decision 2's ordering and on nothing else; the other five decisions carried the
same warrant they had, which was the argument and not a signature. **The
signature came the next day** — 2026-09-03, recorded in the *Status* section
above — and this paragraph is kept in the past tense rather than deleted,
because the gap between the ruling and the acceptance is a fact about how this
decision was made.

## Decision

Six questions, in the order the brief put them, because each one's answer is an
input to the next.

### 1. Where a carry lives in the action vocabulary

**One appended entry, and the paragraph above `DEFAULT_ACTIONS` about appending
is why that word carries the whole change.** `CurrentActionComponent.actionIndex`
is a positional index into the array (`src/simulation/prisoners/components.ts:245`)
and the save carries it verbatim (`src/persistence/save-schema.ts:429`), so the
entry goes at the end, after `action.kitchen-work`, and
`tests/unit/prisoners-action-catalog.test.ts` is extended by one row rather
than reordered.

The entry, field by field, with the reason for each — and none of the values
below is a balance number:

- **`category: 'work'`.** The category the two work blocks already allow and
  the one #600 is about. No change to `ACTION_CATEGORIES`, no change to any
  schedule.
- **`target: { kind: 'job-board' }`.** A third member of `ActionTarget`
  (`src/simulation/prisoners/actions.ts:4-6`) beside `own-accommodation` and
  `room-catalog-id`. `ActionSystem` already branches on `target.kind` in
  `resolveTargetInstance`, `prisonProvides` and `claimUseIfNeeded`; a third
  kind is a third arm of the same data-driven branch and not a per-action
  condition chain (`AGENTS.md` boundary 6). It names no room and no catalogue
  id, because a job carries its own tiles.
- **`needEffectsPerTick: {}`.** A carry serves the institution and not a need.
  Giving it an effect on an existing need would be a second authored route to
  that need (the convention `action.laundry-work` argues at length), and
  inventing a need for it is the balance step [ADR 0042](./0042-attaching-consequences-to-the-simulation-loop.md)
  routes to its own step 4. The consequence for selection — a zero score — is
  handled in decision 2, and it is the reason decision 2 is shaped the way it
  is.
- **`requiredObjectCapability` absent.** There is no room to gate on and no
  ceiling to read; the ceiling on how many prisoners carry is how many jobs are
  on the board.
- **`minDurationTicks: 5`**, which is `PICKUP_DROPOFF_DURATION_TICKS`
  (`job-system.ts:63`, in the file this decision **deletes**) moved into the catalogue: the
  dwell at *each end* of a leg, not the action's life. **A carry's life is the
  job's**: it ends when the job reaches `completed`, `failed` or `cancelled`,
  and `continuePerforming`'s `elapsed >= action.minDurationTicks` test means,
  for this kind, *"the dwell at this end is over"* rather than *"the action is
  over"*. Observed at the 20-tick reconsideration cadence, a 5-tick dwell costs
  up to 20 — the same granularity every other action already has.

**What it claims: the job.** `JobBoard`'s `available → assigned` transition,
with `assignedWorkerId` set, *is* the claim, and it is taken at **selection**,
not at arrival. That departs from ADR 0029 decision 2 deliberately and for a
reason ADR 0029 itself names: it rejected a reservation at selection because
*"a reservation has to be released on the travel failure paths, and those are
the paths that leak."* A job is not a seat. It already carries a stock
reservation (`Container.reserve`) that must be taken before anybody walks, or
two carriers set off for one crate — which is exactly what
`JobSystem.assignAvailableJobs` enforces today — and its release paths already
exist, are total, and are tested: `failJob` and `cancel` through
`compensateHeldStock` ([ADR 0037](./0037-goods-in-a-carriers-hands-when-a-carry-job-dies.md)).
So the four travel-failure exits in `ActionSystem.continueTravelling`
(`src/simulation/prisoners/action-system.ts:611`) — no path request, a failed
route, a target that stopped existing, and `loadSnapshot`'s drop-to-idle — gain
one line each for the carry kind: fail the job, which compensates the goods.
The leak ADR 0029 feared is closed by the same shape that closes it for the
job system today, not by four careful release calls written fresh.

**What `getActionTarget` returns for it: nothing.** `PrisonerColdState.
currentActionTargetInstanceId` (`src/simulation/prisoners/components.ts:315`)
stays a room-instance id and is **not written** for a carry.
`projectPrisonerDetail` publishes that map as `targetRoomInstanceId`
(`src/simulation/presentation/prisoner-projection.ts:694`) and resolves it
through the room registry; a job id in that field would be a lie in a field
name, and the save's `coldState.currentActionTargetInstanceId` array
(`src/persistence/save-schema.ts:639`) would carry it. The prisoner → job link
is the job's own `assignedWorkerId`, read the other way round through a
`JobBoard.activeJobFor(entityId)` accessor backed by a `Map<EntityId, string>`
the board maintains on assignment and on every terminal transition and rebuilds
in `loadSnapshot`. It is **derived state, not persisted** — the same standing
as a use claim under ADR 0029 decision 6, for the same reason: it is a pure
function of a value the save already holds.

**What `resolveTargetInstance` becomes.** Today it returns
`RoomInstance | undefined` (`src/simulation/prisoners/action-system.ts:1121`).
For the job kind the resolution is the admission `JobSystem.assignAvailableJobs`
performs today, moved intact: walk `availableJobsSorted()`, refuse a job whose
source or destination container is unknown (marking it `failed` with the
existing reasons, #419's boundary), take the first whose `Container.reserve`
succeeds, set `assignedWorkerId` and `leg = 'pickup'`. The walk's destination
is `job.sourceTile` on the pickup leg and `job.destinationTile` on the
drop-off leg. The return type widens to a small union of *a room to walk to*
and *a job to walk for*; `beginNextAction` reads a tile off either.

### 2. How the scheduler finds a job — and who puts one there

**The board becomes an input to `planIdleSelection`
(`src/simulation/prisoners/action-system.ts:902`), and it enters as a rule, not
as a score.** When the prisoner's active block allows `work` and
`board.availableJobsSorted()` is non-empty, `action.carry` is placed at **rank
0** of `candidates`; otherwise **it is not a candidate at all**. Duty outranks
want: the regime says it is work time, the institution has a job, and kitchen,
laundry and classroom duty are what a work block is *when the board is empty*.

> **AMENDED 2026-09-02 by the owner: duty outranks want ONLY while no need is
> urgent.** The rank-0 rule above is kept as written because it is still the
> rule for a prisoner in ordinary condition, and because the amendment is a
> *condition on* it rather than a replacement. A prisoner with a providable
> candidate for a need below `STATE_INCOME_UNMET_NEED_LEVEL` (51 of 255) does
> not get the carry at rank 0; ordinary scoring decides for them. See the
> amendment section above for why that constant rather than a new one.

Why a rule rather than a score, and why rank 0 rather than last:

- `scoreAction` is deficit × effect summed over the action's effects, a pure
  function of needs. A carry has none, so it scores exactly 0 — the floor, as
  [ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md)
  decision 4 argues for `action.free-association` — and a 0-score candidate is
  reached only when nothing better resolves. A labour budget that is spent only
  after every need is served is option (b) by another route.
- A priority-weighted score would mix a job's `priority` into a number whose
  units are need deficits, and ADR 0062 decision 3 requires the key that orders
  the contended scan to be *"a function of state"* that *"may not read a
  claim"*. "Is there an available job" is a fact about the board, which
  persists, exactly as `hasPlaceForUse` is a fact about the room registry; it
  reads no claim. Placing the candidate at rank 0 on that fact keeps
  `rankActions` untouched and pure.
- **Not a candidate when the board is empty** is what keeps every scenario
  without a job byte-identical (decision 6). A candidate ranked last would
  still shift `providedIndex` and the substitution counters for every prisoner
  in every work block.

**Who gets which job.** The idle scan runs in descending `needUrgency`, ties by
ascending index (ADR 0062). A carrier's urgency is the carry's score, **0**, so
carriers sort after every prisoner whose first providable candidate serves a
need, and among themselves by ascending index — which is
`assignAvailableJobs`' *"first (ascending id) idle worker"* rule with *id*
replaced by *index*, for the reason ADR 0062 decision 3 gives (since #441 an id
is `(generation, index)` and the two orders differ). Jobs are matched in
`availableJobsSorted()` order — priority descending, id ascending — unchanged.
One job and six prisoners in a work block: the first by that order reserves it;
the other five find no available job, `continue` to their need-ranked
candidates under [ADR 0041](./0041-what-happens-when-a-prisoners-chosen-action-has-nowhere-to-go.md)
decision 1, and are counted as a *contended* substitution — `prisonProvides`
answers *"the board has a job"* without reading who took it, so
`providedIndex` is 0 and `rank` is 1 or more. That is an accurate count:
somebody else got the job.

**Eligibility replaces `JobWorkerPool`.** A prisoner is offered a carry iff
they are idle at a reconsideration, intake is `completed`, and their active
block allows `work`. Two consequences are named rather than discovered:
`HIGH_RISK_REGIME` (`src/simulation/prisoners/regime.ts:120`) has no `work`
block, so a high-risk prisoner never carries; and the riot override's
`RIOT_ALLOWED_CATEGORIES` has no `work`, so nobody carries during a riot. Both
are the regime doing what a regime is for.

**The producer is the delivery, and ADR 0017 decision 4 is its route.** The one
thing in a session a player can start that puts goods anywhere is
`ProcurementSystem.update` depositing a purchase into
`CONSTRUCTION_MATERIALS_CONTAINER_ID` when `arrivesAtTick` comes due — at no
tile, which `docs/OPERATIONS.md` records as the second exception to the
no-teleport rule and calls *scaffolding*. Under this decision:

- **A `room.delivery-bay` instance is bound to a container whose id is derived
  from the instance id** (`container:<instanceId>`), registered when the room
  is zoned. **A `room.storage-room` instance is bound to the existing
  `CONSTRUCTION_MATERIALS_CONTAINER_ID`** — the lowest instance id wins when
  more than one storeroom exists, a total order derived from state. Neither
  binding is stored: both are functions of the room registry the save already
  carries. `ContainerMaterialsProvider` and `ConstructionSystem` keep drawing
  from the same container they draw from today and are not touched.
- **When a delivery comes due and both rooms exist**, `ProcurementSystem`
  deposits into the bay's container and calls `submitCarryItem` with id
  `delivery.<orderId>`, `priority` 1 (the value `JobSystem.beginLeg` already
  hands `requestRoute`, not a new number), source the bay's anchor tile,
  destination the storeroom's anchor tile. That is the physical route, and
  the deposit stops being scaffolding.
- **When either room is missing, today's deposit continues unchanged.** This
  is #811's *decision 1* — what a prison with no bay gets — and it is
  answered here as the graceful fallback the issue itself prefers, on three
  grounds: it is zero regression for every save and every roomless early
  prison; the hard gate strands both and re-creates the shape
  [ADR 0075](./0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
  exists to prevent; and the surcharge-or-delay variant needs a balance number
  ADR 0017 decision 5 reserves. **The cost is stated:** a bayed prison whose
  population is outside a work block leaves a delivery waiting in the bay for
  up to 1,100 ticks (from the end of the 1,300–1,800 block to the start of
  the next day's 500–1,000 block), and a build order waits with it. That *is*
  the labour budget being real, and it must be visible: a delivery waiting for
  a carrier is a **standing condition** in [ADR 0087](./0087-whether-a-refusal-is-an-event-or-a-condition.md)'s
  sense — a member of the `PrisonCondition` union recomputed from live state,
  present while any job on the board is `available` and no prisoner is in a
  `work` block — and its sentence is owed to the owner.

**Every other producer #600 lists — kitchen portions, laundry kits, filth to a
garbage room, deconstruction salvage — is out of scope here and stays where the
roadmap has it.** The shape generalises without further decision: whatever puts
goods into a bound container and wants them elsewhere calls `submitCarryItem`,
and the action vocabulary needs nothing new for it. A production *chain* is a
content decision with its own balance questions, and this document does not
open one.

### 3. Who owns the walk

**`LocomotionStore` does, on both legs, and `setPositionTile` is retired.**
A carry begins exactly as a room action begins: `beginNextAction`
(`src/simulation/prisoners/action-system.ts:990`) requests a route from the
prisoner's tile to `job.sourceTile`, sets `travelling`, and
`continueTravelling` hands the resolved route to `beginWalk`
(`src/simulation/locomotion/locomotion.ts:220`). `prisoners.locomotion` (order
200, `src/simulation/prisoners/prisoner-operations-runtime.ts:395`) advances
it one tile per two ticks (ADR 0059's 128 units a tick against 256 to a tile),
and `onWalksArrived` (`src/simulation/prisoners/action-system.ts:744`)
delivers the arrival on the tick it happens. `arrive` gains a third arm: for
the job kind there is no room to re-check and no seat to claim; the prisoner
enters `performing` for the dwell. `continuePerforming` gains the matching
arm: when the dwell is over on the pickup leg, `withdrawReserved`, `leg =
'dropoff'`, request a route to `job.destinationTile`, `travelling`; on the
drop-off leg, `deposit`, `job.state = 'completed'`, `idle`, `actionsCompleted`.

Three sentences elsewhere change truth value, and each is named so it can be
corrected in the landing change rather than left to rot:

- ADR 0059 §*What changes in the simulation* item 5, *"There is one such write
  outside `prisoners/`"*, becomes *none*: `PrisonerJobWorkerAdapter` and the
  `JobWorkerAdapter` interface go with `JobSystem`, and
  `ActionSystem.routeContextFor` is already the one expression for the
  clearance a carrier's doors are judged against.
- ADR 0059 §*Consequences*, *"Guards, incident responders, contraband searchers
  and job carriers still teleport on arrival"*, loses its fourth noun. [ADR 0088](./0088-does-a-guard-walk-to-its-post.md)
  converted deployment travel and patrol and scoped itself to those two; its
  out-of-scope list (incident response, contraband search) is unchanged by this
  document, and the carrier is not a fifth site nobody signed — it is a
  prisoner action, and prisoner actions walk.
- `docs/OPERATIONS.md`'s second no-teleport exception stops being scaffolding
  wherever a bay and a storeroom exist, and stays the exception it is where
  they do not.

**Arrival timing is construction speed, and that is said plainly.** Today a
delivery lands in the construction container at `arrivesAtTick`; under this
decision, where the route exists, it lands there `arrivesAtTick` *plus* a
carrier's selection latency (up to one 20-tick cycle, or up to the next work
block), the walk to the bay, a dwell, the walk to the storeroom, a dwell — at
two ticks a tile plus up to 20 per dwell. This document's probe resolved and
teleported a 14-by-18 leg in 18 ticks; walked, the same leg costs at least
twice its route length in ticks. **Where the bay sits and where the storeroom
sits become a choice the player is making**, which is #600's *"construction
time becomes a function of geometry"* arriving by the only route that makes
it true. [ADR 0077](./0077-when-a-route-stops-being-valid.md)'s per-edge
re-validation applies to a carrier as to any walker: a door locked under a
carrier mid-leg stops the walk, the carry's `continueTravelling` picks it up,
and the goods go where ADR 0037 option A sends them — back to the source
container — which makes that ADR's third exception carry live traffic for the
first time and is the reason its open question 1 is listed again below.

### 4. What happens to `JobSystem` and `JobWorkerPool`

**`JobSystem` stops being a `SystemRegistration`; its lifecycle code stays,
as a pure executor in `operations/` that `prisoners.actions` calls.** The
boundary `JobWorkerAdapter` existed to keep — `operations/` knows nothing about
prisoners — survives with the arrow reversed: the action system imports the
executor, and the executor is given a `JobBoard` and a `ContainerRegistry` and
nothing that names an entity model. What moves where:

- `assignAvailableJobs` → the job arm of `resolveTargetInstance` (decision 1),
  with the two container checks and the `reserve` intact.
- `beginLeg` / `continueTravelling` → the walk (decision 3). The route request
  id keeps the `job.<id>.<leg>.<tick>` shape so `docs/NAVIGATION.md`'s
  abandonment rules apply unchanged.
- `continuePerforming`'s withdraw and deposit → the carry arm of
  `ActionSystem.continuePerforming`, calling `executor.pickUp(job)` and
  `executor.dropOff(job)`, each of which keeps its lenient container lookup
  (#419).
- `failJob`, `cancel`, `compensateHeldStock` → the executor, verbatim in
  behaviour. **ADR 0037 holds without amendment**: the two cases it decides
  (a reservation on the pickup leg, goods in hand on the drop-off leg) are
  still exhaustive, `compensateHeldStock` is still the one implementation for
  both paths, and `operations-job-system.test.ts`'s conservation
  pins move with the code rather than being rewritten.
- `performingSince` is deleted: the dwell timer is `phaseStartedAtTick`, which
  the save carries (decision 5).

**`JobWorkerPool` is retired.** Its two sets are both derivable now:
*registered* is *in a `work` block and idle*, which the regime decides each
cycle; *busy* is *named by an active job's `assignedWorkerId`*, which the board
holds. State that can be derived and is stored anyway is the disagreement ADR
0029 decision 6 removed for use claims, and the same argument applies.
`PrisonerWorkerReleasePort` (`src/simulation/prisoners/release.ts:32-34`) is
replaced by a board port: a departing prisoner's active job — #441's release
path — is failed with a new `CARRY_JOB_FAIL_REASONS` member,
`'carrier-departed'`, and compensated under ADR 0037. Adding a member is what
that union's docblock says it is built for, and the save reader's
`failReason: z.string().optional()` (`src/persistence/save-schema.ts:672`)
tolerates it without a bump.

**The order pin moves.** `tests/determinism/kernel-system-order.test.ts:434`
loses its `operations.jobs` row, and the landing change moves it the way ADR
0088 moved the pin for `security.locomotion`: named in the ADR, changed in the
same commit, with the reason in the test's own header. Retiring a system is not
lowering a floor; the floor is that every declared order is distinct and read
off the declarations alone, and both stay true.

**What does not survive, named so nobody looks for it.** `JobWorkerAdapter`'s
*"prisoners today, staff later"* generality. A guard carrying something would
be a guard errand under ADR 0088's `LocomotionStore` and not an entry in
`DEFAULT_ACTIONS`; if that is ever wanted it is its own decision, and this one
does not pre-empt it by keeping an abstraction nothing uses.

### 5. Persistence: nothing new in the payload, and no bump

`SAVE_SCHEMA_VERSION` is `5` (`src/persistence/save-schema.ts:36`) and **does
not move.** [ADR 0038](./0038-what-makes-a-save-compatible.md) decision 1 is
the rule — a bump is required when absence is ambiguous or an existing field
changes meaning — and it is applied here field by field, because #600
overstated exactly this cost (*"carrying room instances and their state through
snapshots and saves is the work"*):

- **The appended action.** A new positional index at the end of
  `DEFAULT_ACTIONS`; every existing `actionIndex` in every save keeps its
  meaning. ADR 0042 decision 1 settled that this is a content change and not a
  persistence one, and `tests/unit/prisoners-action-catalog.test.ts` is the
  gate.
- **A carry in progress** is `actionIndex`, `actionPhase`, `phaseStartedAtTick`
  (all existing, `src/persistence/save-schema.ts:429-431`) plus the job itself
  in `operations.jobs` (`src/persistence/save-schema.ts:658-682`, unchanged
  shape), whose `assignedWorkerId`, `leg` and `state` say where the goods are.
  The prisoner → job link is derived from the board on load (decision 1). No
  field.
- **The walk is not saved** (ADR 0059 open question 3, unchanged). A carry
  saved mid-leg restores as `JobBoard.loadSnapshot` already restores a
  `'travelling'` job — dropped to `'assigned'`, `pathRequestId` cleared, route
  re-requested from the prisoner's saved tile on the next cycle. **The restore
  ordering rule this needs is the one gap, and it is a rule, not a field:**
  `PrisonerOperationsRuntime.loadSnapshot` today drops every `travelling`
  prisoner to `idle` and clears their target, which would orphan an assigned
  job. A carrier is instead **re-seated from the board** after it loads —
  `actionIndex` the carry, `travelling`, no request — in the same derived-last
  position `reinstateUseClaims` occupies
  (`src/simulation/prisoners/prisoner-operations-runtime.ts:864`). Both
  directions close by shape: a job whose worker is not alive, or not a
  carrier, is failed and compensated on load, so nothing leaks; the rebuild is
  keyed by entity id, so nothing doubles.
- **`performingSince` stops being a deliberate exclusion.** `docs/PERSISTENCE.md`
  (`docs/PERSISTENCE.md:519`) records that a restored `'performing'` job
  restarts its dwell, and `tests/determinism/job-performing-restart-bound.test.ts`
  measures the cost at one `JobSystem` interval. With the dwell on
  `phaseStartedAtTick`, that limitation is gone and that test measures a
  behaviour that no longer exists; it is rewritten in the landing change to
  measure the new profile (a restored carrier loses at most one
  reconsideration cycle to the travel restart, and nothing to the dwell).
- **`operations.jobWorkers` stays in the payload, empty.** The writer keeps
  emitting `{ workers: [], busy: [] }` and the reader keeps validating it
  (`src/persistence/save-schema.ts:683`) and ignores it. Removing the key
  would be the bump — an older build would refuse the save on a missing
  required key; keeping it costs two empty arrays. An older save with a
  non-empty pool loads cleanly: a listed worker who holds an assigned job is
  re-seated from the board; one who does not was merely eligible, and
  eligibility is now the regime's. This is the same reasoning ADR 0038
  decision 4 gives for keeping `masterSeed` optional rather than bumping.
- **The bay's container** appears in the existing `containers` array under its
  derived id the moment it is registered; **the bindings** are functions of
  the room registry (decision 2) and are not stored. Room instances already
  round-trip with their rectangles ([ADR 0028](./0028-object-placement-and-derived-room-capacity.md)
  decision 6), and use claims deliberately do not (ADR 0029 decision 6).
  Nothing new about a room is persisted here.
- **`currentActionTargetInstanceId` is simply not written** for a carry; the
  map is already absence-tolerant.

**So the count of new save keys is zero, and the count of changed meanings is
zero.** What is genuinely new is one restore rule and one retired exclusion.

### 6. Determinism

Every ordering this decision adds or moves is total and derived from state, in
the sense [ADR 0020](./0020-deterministic-kernel.md) and ADR 0029 decision 7
require:

- The carry enters `candidates` at rank 0 on a fact about the board that reads
  no claim; `rankActions` is untouched.
- Carriers are ordered by `compareByNeedUrgency` — 0, then ascending index —
  and jobs by `availableJobsSorted()` — priority descending, id ascending. No
  `Map` or `Set` is iterated for an outcome; the board's derived
  `activeJobFor` map is read by key only.
- Arrivals go through `onWalksArrived`'s sort, as every walk does.
- No RNG stream is registered or drawn from.

**What shifts, and why that is acceptable.** Any scenario that puts a job on
the board or a prisoner in the pool changes its tick-by-tick outcome, because
assignment moves from order 260 every 5 ticks to order 250 every 20, and legs
walk instead of resolving into a teleport. That is these files, by name:
`tests/helpers/determinism-scenario.ts` (every prisoner registered at `:188`,
two jobs at `:195`) and through it `tests/determinism/session-replay.test.ts`
and `tests/determinism/snapshot-restore-fidelity.test.ts` (the `jobWorkers`
round-trip at `:464-480` and the `jobs` reset at `:548`);
`tests/determinism/job-performing-restart-bound.test.ts` (whole file, decision
5); `tests/determinism/kernel-system-order.test.ts:434` (decision 4). Each
moved number is re-pinned in the landing change with the old value kept
beside it, the way this repository marks both directions. It is acceptable
because determinism is a promise of *reproducibility*, not of stability across
a decided change in behaviour — and because **no scenario a player can reach
today has a job on it**: #811's `job-production-contract` pins 0 jobs and 0
workers over three in-game days of a prison built through commands.

**What does not shift.** Every scenario with an empty board is byte-identical,
because the carry is *not a candidate* when no job is available (decision 2).
`tests/integration/kitchen-work.test.ts`,
`tests/integration/laundry-work-and-empty-blocks.test.ts`, the contended-room
fixtures and every determinism scenario that never touches `runtime.jobs` hold
to the tick. This is the property that rule buys, and it is the reason the rule
is *"not a candidate"* rather than *"ranked last"*.

---

## What this changes in the code, if it stands

Named so the landing change can be reviewed against a list rather than
discovered.

**BUILT, and the sentence that used to end this paragraph is kept because it
is what changed.** It read *"Nothing here is done on this branch."* Every item
below except **9** landed with the owner's acceptance of 2026-09-03; item 9 is
the `PrisonCondition` member, and it is **deliberately not built** because its
sentence is one of the three under *What is owed to the owner* and
`AGENTS.md`'s fourth exclusion reserves it. A condition with no authored
sentence behind it is exactly the defect that exclusion exists for.

**Three things the landing change found that this document had wrong, recorded
here rather than in a commit message nobody keeps:**

1. **The route gates on each room being *furnished*, not merely zoned.**
   Decision 2 says the producer applies *"when a delivery comes due and both
   rooms exist"*. Built to that letter, **it bricks a new prison**, and it was
   measured rather than argued: zone a bay and a storeroom before the first
   cell is furnished and every delivery lands in the bay needing a carrier —
   but the only carriers are prisoners, a prisoner is not admitted without a
   bed, and the bed is a build order waiting on the bricks in the bay. On the
   probe prison intake never completed, `actionIndex` stayed `-1` for 2,400
   ticks, and 24 delivery jobs sat `available` for ever. The gate is therefore
   *"both rooms work"*, tested the way every other room-gated behaviour in this
   repository is tested — the capability the room's own authored requirement
   names is standing in it (`'delivery-access'`, `'item-storage'`, both of
   which `tests/foundation/content-vocabulary-contract.test.ts` already
   recorded as awaiting exactly this consumer). No balance number, and the
   bootstrap dissolves by construction: the dock door and the racks are build
   orders paid for by deliveries that still land directly.
2. **A restored carrier is resumed by re-selection, not re-seated as
   `travelling`.** Decision 5 sketched *"a carrier is instead re-seated from
   the board after it loads — `actionIndex` the carry, `travelling`, no
   request"*. `PrisonerOperationsRuntime.loadSnapshot` already drops every
   traveller to `idle`, and a prisoner's own active job makes the carry
   providable again, so the existing path resolves the leg the job records from
   the tile the save carried. Same one restore rule, reached without adding a
   path. The other direction — a job whose carrier is not in this session — is
   `CarryJobExecutor.reconcileRestoredJobs`, as decision 5 requires.

   **NOTE 2 IS KEPT AS IT STANDS AND IT WAS HALF TRUE, WHICH IS THE PART THAT
   COST SOMETHING — corrected 2026-09-15, issue #882.** *"A prisoner's own
   active job makes the carry providable again"* is true of `prisonProvides`
   and of `carryAvailableFor`, and it is not true of `planIdleSelection`, which
   is the method the re-selection actually goes through. That gate tested the
   regime block's `allowedCategories` **before** the active-job check and `&&`
   short-circuited, so a carrier whose re-selection landed after the work block
   had ended was filtered out of their own errand and chose something else with
   the goods already in their hands. The substitution of one path for another is
   sound; what note 2 did not check is that the substituted path asks a
   *second* question the re-seat sketch never would have.

   **So this document's own Consequence — *"A carry outlasts its block … not
   cut at a regime boundary"* — was true continuously and false across a
   restore, for as long as the mechanic has existed.** Reproduced seeded and
   exactly, never statistically: a save taken mid-drop-off at tick 1,880, 80
   ticks past the work block that started the errand, finished the errand in
   continuous play and, restored from that same bundle, sent the carrier to the
   lavatory holding four bricks and left the job `assigned` for **1,140 ticks**
   against note 3's bound of 40. The fix consults the carrier's own active job
   **before** the category gate and exempts a resuming carrier from the owner's
   need-threshold amendment of 2026-09-02, which binds the prisoner being
   *sent*. No payload changed and `SAVE_SCHEMA_VERSION` did not move: decision
   5 holds exactly as written, and the general rule the fix records beside the
   code is that **a restore may not ask a question continuous play never asks**.
   The guard is `tests/integration/carry-restore-resumes-the-errand.test.ts`.

   **Open question 1 is untouched.** *"Should a carrier be interruptible by a
   regime change?"* is still the owner's and still unanswered; this made the
   restore path agree with the continuous one, which is the answer this
   document already gives.
3. **Decision 5's restore bound is two reconsideration cycles, not one.** It
   predicted *"a restored carrier loses at most one reconsideration cycle to
   the travel restart"*; measured, the worst mid-walk capture costs **40
   ticks**, because a restored traveller pays the cycle twice — dropped to
   `idle` (up to 20), then the request-then-collect handshake (up to 20 more).
   That is what *every* action costs across a restore (ADR 0059 open question
   3), so the prediction is corrected and the code is not.

**And one thing outside this document's own surface, found by building it:**
`Container.getSnapshot` was not a fixed point of `Container.loadSnapshot`.
`withdrawReserved` writes `stock.set(id, 0)` rather than deleting the key, so
an emptied item kept emitting `[id, 0, 0]` while the reader wrote back only
positive rows. Latent for as long as the class has existed; reachable for the
first time because a carry now takes a work block to happen, so the
determinism scenario's container *ends* a run empty. Fixed by omitting rows
that hold nothing, which changes no behaviour — `quantityOf`, `reservedOf` and
`availableOf` answer `0` either way.

1. `src/simulation/prisoners/actions.ts` — the third `ActionTarget` kind and
   one appended entry.
2. `src/simulation/prisoners/action-system.ts` — a job arm in
   `planIdleSelection`, `prisonProvides`, `resolveTargetInstance`,
   `beginNextAction`, `continueTravelling`, `arrive`, `continuePerforming`;
   the constructor takes the board and the executor.
3. `operations/job-system.ts` (**deleted**) — `JobSystem` and
   `JobWorkerPool` removed; the executor extracted; `JobWorkerAdapter`
   removed. `src/simulation/operations/job.ts` — `activeJobFor` and its
   derived map; `'carrier-departed'` appended to `CARRY_JOB_FAIL_REASONS`.
4. `prisoners/job-worker-adapter.ts` — deleted.
5. `src/simulation/prisoners/release.ts` and
   `prisoner-operations-runtime.ts` — the release port and the restore rule.
6. `src/simulation/runtime/new-session.ts` and `session-systems.ts` — no
   `JobSystem` registration; `jobWorkers` written empty.
7. `src/simulation/economy/procurement.ts` — the producer, with the fallback.
8. Room-to-container binding, derived, beside `RoomInstanceRegistry` or in
   `operations/` — the landing change decides the file; this document decides
   that it is derived.
9. `src/simulation/protocol/types.ts` — one `PrisonCondition` member for a
   delivery waiting for a carrier (sentence owed). **NOT BUILT**: see the
   paragraph above this list.
10. Tests: the catalogue gate extended; the order pin moved; the determinism
    scenario and its dependants re-pinned; `job-performing-restart-bound`
    rewritten; `operations-job-system.test.ts` retargeted at the executor and
    renamed `operations-carry-executor.test.ts` with the class it tests;
    `two-authorities-one-prisoner-contract.test.ts`'s second half rewritten to
    say what a carrying prisoner *is*. **Two additions this list did not
    foresee:** `job-production-contract.test.ts` is rewritten rather than
    re-pinned — both of its zeroes move and its call-site scan inverts from
    `toEqual([])` to exactly one caller — and
    `tests/integration/carry-need-threshold.test.ts` is new, because the
    owner's amendment of 2026-09-02 had no guard at all. **A fourth
    determinism dependant appeared** that "its three dependants" did not name:
    `tests/integration/economy-state-income-persistence.test.ts`, whose
    just-in-time figure moves because fewer bricks have been carried into the
    construction container by tick 0.
11. Documents: ADR 0059's two sentences, `docs/OPERATIONS.md`'s exception,
    `docs/PERSISTENCE.md`'s `performingSince` exclusion,
    `docs/DETERMINISM.md`'s matching limitation. **The `README.md` rows for
    0037 and 0059 did not need changing**, because neither ADR's *status*
    moved: 0037 holds without amendment and 0059's two sentences are corrected
    in place inside the document. Also needed, and not on this list: the six
    dated citations in `docs/research/audit-2026-08-26/` that point at the
    deleted file, allowlisted rather than edited because
    `docs/research/README.md` keeps those records read-only.

---

## Consequences

- **One authority moves a prisoner.** The authority inventory above loses its
  fourth entry, and *"an external write to a walker's tile ends the walk"*
  becomes a rule with no remaining site in `src/simulation/prisoners/`.
- **A carry outlasts its block.** Like every action, it is not cut at a regime
  boundary; a prisoner who picked up at 1,795 finishes the drop-off in the
  recreation block. The bound is the route length, and it is the same bound a
  120-tick kitchen shift already has.
- **A hungry prisoner in a work block carries before they cook — UNTIL the
  hunger is urgent.** Duty outranks want by construction, bounded by the
  owner's amendment of 2026-09-02: below `STATE_INCOME_UNMET_NEED_LEVEL` the
  need takes the prisoner back. The unbounded form was this document's own
  weakest claim and the owner overruled it; the sentence is kept in its amended
  form rather than deleted, because *"carries before they cook"* is still what
  a work block does for a prisoner who is merely peckish.
- **Construction gets slower wherever the route exists, and only there.** A
  prison with neither room builds exactly as fast as today.
- **The job board gains its first writer a player can reach**, and
  `job-production-contract.test.ts`'s zeroes move — its own header names that
  as its exit.
- **`docs/OPERATIONS.md`'s third exception carries live traffic.** ADR 0037's
  open question 1 (does a player-facing cancel deserve a different answer from
  a route failure) stops being hypothetical the first time a door locks under a
  carrier.

---

## What would change my mind

> **This claim was put to the owner and OVERRULED on 2026-09-02, before any
> playtest measured it.** The fallback described below was taken, and the
> "fraction" it says this document cannot choose turned out not to need
> choosing — `STATE_INCOME_UNMET_NEED_LEVEL` already exists and already means
> what the rule needs it to mean. **The passage is kept unedited below** because
> it is the reasoning that made the question worth asking, and because it
> records that the document identified its own weakest claim correctly: that is
> exactly the claim that did not survive.

**The weakest claim is decision 2's ordering: that a job outranks a need
inside a work block.** It is right for the mechanic #600 describes and it is
wrong if a playtest shows hunger or hygiene deficits in work blocks climbing
under a steady stream of deliveries, because the prisoner who would have taken
kitchen duty (`hunger: 1` a tick) is carrying instead. What would change it: a
measured deficit trend on `tests/integration/kitchen-work.test.ts`'s fixture
with a producer attached. The fallback would be a need-aware rule — a carry
enters at rank 0 only while the prisoner's best providable need-score is below
some fraction of its maximum — and that fraction is a balance number this
document does not have the standing to choose.

**The second is the graceful fallback.** The owner may prefer the hard gate the
issue itself rejects, on the ground that a prison building without a bay is the
untruth the whole feature exists to remove. If so, decision 2's producer
paragraph is the only thing that changes, and the standing-condition sentence
becomes a refusal sentence instead.

**The third is retiring `JobWorkerPool` rather than deriving it into a
read-only view.** If a projection wants *"who is eligible to carry right now"*
as a number, deriving it each publication costs a scan of the population per
publication. Nothing asks for it today.

---

## Open questions

The owner's, because each is either outward-facing or a balance value:

1. **Should a carrier be interruptible by a regime change?** This document says
   no, by analogy with every other action. A lockdown that leaves a prisoner
   walking a crate across the yard is a case worth a ruling.
2. **What does the cancel path owe a player** who un-zones the bay or the
   storeroom while a delivery is in flight? ADR 0037 open question 1, now
   reachable.
3. **Does a `'carrier-departed'` job deserve a player-visible notice**, or is
   the goods' return to the bay enough? The refusal channel is for commands
   (`src/simulation/operations/job.ts` says why); a condition or an event would
   be a new producer of one.

---

## What is owed to the owner

Player-facing sentences this feature cannot ship without, none of which this
document writes:

1. ~~**The action's label.**~~ **SETTLED by the owner on 2026-09-03: the
   label is *Errand*.** See *Amendment, 2026-09-03: the action's label is the
   owner's word* below for the ruling and what it does not cover. **The item
   as this document wrote it is kept rather than deleted**
   (`docs/AGENT_WORKFLOW.md` §4), because two sentences are still owed and the
   reason all three were is the same reason: it read *"The `action` namespace
   of `src/content/simulation-message-keys.ts:159` carries one label per entry
   of `DEFAULT_ACTIONS` — `action.kitchen-work` is `'Kitchen Duty'` at `:187`,
   itself marked there as 'a draft for the owner's review' — and
   `tests/foundation/content-vocabulary-contract.test.ts` reads that namespace
   as a census. A carrying prisoner needs a word in the roster and the detail
   panel, and the word is owed."* Every clause of that still describes the
   mechanism; only its closing clause, *"and the word is owed"*, stopped
   being true.
   `action.kitchen-work`'s own label is **still** a draft and is not covered by
   this ruling.
2. **The standing condition** for a delivery waiting in the bay with nobody in
   a work block to carry it (decision 2). **Still owed.**
3. **Whatever the detail panel says about goods in hand**, if it says anything:
   `PrisonerActionViewModel` today carries an action and a room; a carry has an
   item and a quantity, and whether a player sees them is a copy decision as
   much as a projection one. **Still owed.**

---

## Amendment, 2026-09-03: the action's label is the owner's word

**Approved by the repository owner, and it is their decision rather than an
approval of one this document proposed.** Shown the candidate labels this
document's entry had weighed — and told which one was already on screen as a
marked draft — they answered:

> **"Errand"**

So `action.carry`'s label is **`'Errand'`**, settled copy, and item 1 of *What
is owed to the owner* is discharged. **The string does not move**: the
catalogue has read `'Errand'` since the mechanic landed this morning, because
the `action` namespace declares `form: 'definition-id-field'` over
`DEFAULT_ACTIONS` and `tests/unit/simulation-message-keys.test.ts` requires a
namespace to label *exactly* the ids its declaration declares — so an entry had
to exist the moment the catalogue held the id, and the only choice available
was between a draft that said it was one and a suite that could not go green.
What this amendment changes is that the entry is no longer provisional:
`src/content/simulation-message-keys.ts` and
`tests/foundation/content-vocabulary-contract.test.ts` each carried a comment
calling the label a draft awaiting review, and each now records this ruling
with the words it replaced.

**What this ruling does not reach**, stated because a settled sentence beside
two unsettled ones invites the wrong inference:

- **`action.kitchen-work`'s `'Kitchen Duty'`** has been a draft awaiting the
  owner's review since #532 and still is. The owner was asked about the
  carry's label, not about the roster's labels as a class.
- **Items 2 and 3 above.** The standing condition for a delivery waiting in a
  bay is still unwritten and its `PrisonCondition` member is still unbuilt, and
  the detail panel still says nothing about goods in hand.
- **The three open questions** under *Open questions* are untouched, exactly as
  the acceptance left them.
