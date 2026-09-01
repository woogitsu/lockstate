# ADR 0082: What order build orders are carried out in

> **0082 was recomputed off disk, cross-checked against the stated next-free
> line, and swept across every remote head — and the three answers did NOT all
> agree, which is why the sweep is the authority here.** On this branch, cut
> from `main` at `c71c11c` (v0.0.285), the maximum ADR number on disk is **0080**
> and [`README.md`](./README.md) reads `Next free number: 0081`. **`max + 1` off
> disk would therefore have taken 0081, and 0081 is held**: it is the
> purchase-atomicity draft, which is *not on `main`* — it exists as an
> uncommitted file in the shared checkout and on the remote head
> `claude/adr-0081-purchase-atomicity`. The brief that commissioned this
> document described 0081 as "just merged"; it is not, and that is recorded here
> because it is exactly the condition the sweep exists to catch.
>
> **The sweep was performed rather than asserted**, which [ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md)'s own header
> records skipping: one `git fetch origin '+refs/heads/*:refs/remotes/origin/*'`
> followed by `git ls-tree --name-only <ref> docs/adr/` over all **355** remote
> heads (`git ls-remote --refs origin` returns 1,056 refs, of which 355 are heads
> and 71 are `wip/`). Maximum on any of them: **0081**, on
> `claude/adr-0081-purchase-atomicity` alone. Nothing at 0082 or above anywhere.
> So the number is **0082**, taken above the held one exactly as 0073 was, and
> the recomputation off disk is the check that surfaced the disagreement rather
> than the answer to it — which is the lesson 0071's and 0077's entries in the
> index were both paid for.
>
> **Every citation of [ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md) in this document was plain text and not a link,
> deliberately**: the file it would point at did not exist on this branch, and
> `tests/foundation/adr-numbering-contract.test.ts` requires an ADR link to
> resolve. They become links in the commit that merges after 0081 lands.
> **0081 has landed** — in
> [#708](https://github.com/matmaxalez/lockstate/pull/708) — so that commit is
> this one and the citations below are links. The sentence above is kept in the
> past tense rather than deleted because it is the record of why a reader of an
> earlier revision found plain text there. And the
> number is provisional on the terms 0080 and 0081 set for themselves: if it
> collides with an ADR landing from a branch cut after this sweep, this file, its
> row in the index and every citation of it get renumbered together.

## Status

**Accepted, 2026-08-31, by the repository owner.**

**This clause read `Proposed, 2026-08-31. Not self-approved.` until the owner
accepted it the same day.** The paragraph that stood under it is kept below,
unedited, because everything it says is still true: the decision was still
genuinely absent when it was drafted, and [ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md)
still declined it deliberately. What had not happened was the acceptance step,
and it has now happened.

**How the acceptance arrived, recorded because a reader checking this status
later deserves to know its weight.** The owner was shown the decisions as
written and answered, in Polish, *"Podpisz i wdrażaj"* — sign and implement.
That is an approval of **the decisions as written** and of nothing wider: the
four numbered decisions below, and the save-format cost stated under
*The save-format cost*. It is **not** an answer to any of the three open
questions at the foot of this document, which stay open; it is not a ruling on
what the Build panel should say, which decision 4 leaves to the owner
(`AGENTS.md`'s fourth exclusion); and it is not approval to change the id
scheme at the composition root, which decision 3 refuses.

**Implemented in [#722](https://github.com/matmaxalez/lockstate/issues/722)**,
in the commit that carries this acceptance and the two beside it. The blast
radius measured below is one measurement of a *proxy* — the sort replaced with
descending id — and the implementation's own is smaller and is recorded under
*The blast radius* rather than in place of it.

Drafted under `CLAUDE.md`'s rule that a genuinely absent architectural decision
is proposed rather than taken inside implementation code, and because
[ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md) open question 4
deliberately declined it: *"The build-order execution order is deliberately NOT
decided here. It is a different subject with a different blast radius — the save
format — and folding it in would make one document that cannot be approved in
halves."* This is that document.

## Context

### What the code does today

`ConstructionSystem.orderedOrders()` sorts every order ascending by its **id**
in code-unit order (`src/simulation/construction/system.ts:769-773`), and that
sequence is the build schedule: `update()` reads it once
(`system.ts:842-843`), decides crew occupancy once (`:847`), and the first
eligible order is the one that allocates materials (`:935`) and the one that
takes the crew (`:948`). The system says so itself at `:948-951` — *"because the
walk is by ascending id, the one that starts is always the first eligible id and
never the first submission."*

A real session mints those ids as `order-${crypto.randomUUID()}`
(`src/main.ts:2208` for a wall drag, `:2439` for a purchase). **So build orders
are carried out in an order that is a uniformly random permutation of the order
the player placed them in**, and nothing in the code or the interface says so.

The repository already knows this and records it in four places rather than
none — `system.ts:655-658`, `materials-procurement.ts:86-90`,
`construction-projection.ts:225-234` and `just-in-time-materials.ts:17,41`. What
is missing is a decision, not an observation.

### Measured, and the numbers correct two claims that were in circulation

Reproduction: `scripts/report-build-order-execution-order.mjs`, run with
`node --experimental-transform-types scripts/report-build-order-execution-order.mjs`.
Every figure is a tick, an order state or a treasury value, so it is identical
across runs and does not depend on an idle machine.

**A cell's perimeter placed as four real drags, ten segments, money never the
constraint.** Completion order, written as placement indices:

```
uuid   seed=0x1: [2, 9, 0, 1, 8, 7, 3, 5, 6, 4]   inversions 21/45
uuid   seed=0x2: [0, 8, 3, 4, 9, 1, 5, 2, 6, 7]   inversions 17/45
uuid   seed=0x3: [0, 1, 7, 5, 2, 9, 6, 3, 4, 8]   inversions 14/45
uuid   seed=0xbeef: [3, 2, 6, 5, 4, 0, 7, 9, 1, 8] inversions 17/45
uuid   seed=0x692: [3, 9, 5, 6, 1, 2, 8, 4, 0, 7] inversions 25/45
padded seed=0x1/0x2/0x3: [0..9]                    inversions 0/45
```

22.5 of 45 is the expectation for a uniformly random permutation. The seed is
irrelevant to this and is varied only to show that it is: `crypto.randomUUID()`
is not a seeded stream, so the permutation is redrawn on every run of the same
seed.

**The locked position `docs/research/2026-08-30-pricing-the-way-out.md` §1
established, rebuilt three ways.** Nine of a 2×3 cell's ten perimeter edges,
then filler wall until the treasury cannot fund the next segment, then the
drag's worth of orders that arrive after the money has gone:

```
a) the pricing record's own `wall-N` ids: {"completed":312,"materials-pending":13}
   pending: [wall-88, wall-89, wall-9, wall-90 … wall-99]
   of those, cell-perimeter segments: [wall-9]
b) real UUID ids, 25 trials -- perimeter segments unfunded: 18 x 0, 7 x 1
c) monotonic zero-padded ids, 5 trials -- trials with one unfunded: 0
```

**Two corrections fall out of that, and they matter in opposite directions.**

1. **[ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md)'s `{wall-9, wall-314…wall-325}` is wrong** about twelve of its
   thirteen members. The unfunded thirteen are the thirteen **highest ids in
   code-unit order**, which for unpadded decimal ids is `wall-88, wall-89,
   wall-9, wall-90…wall-99` — not the thirteen placed last. `wall-9`, the ninth
   segment the player drew, is the **315th** of 325 the crew reaches, because
   `"wall-9" > "wall-100"`. (**That figure read 313 when this was drafted and
   313 was wrong**, caught by recount rather than by the probe: 314 ids sort
   before `"wall-9"` — 111 beginning `wall-1`, 111 beginning `wall-2`, 37
   beginning `wall-3`, and 11 each beginning `wall-4` through `wall-8` — so
   `wall-9` is the 315th. Nothing else in this document depends on it; the
   pending set, which does, was reproduced exactly.) The half of the claim that mattered is right: a
   segment of the cell's own perimeter is the one left standing.
2. **The lock is not certain in a real session, and the pricing record's
   fixture makes it look certain.** With `wall-N` ids a perimeter segment is
   starved every time; with the UUIDs a player actually gets, 7 of 25 trials
   (and 18 of 60 pooled across three runs — 30%) starve one. So the
   position ADR 0075's pricing was measured against is reachable but roughly a
   one-in-three event rather than the default, **and with placement-ordered ids
   it is not reachable at all**: the perimeter is placed first, so it is never
   in the unfunded tail (measured, 0 of 5, 0 of 5 and 0 of 5 across three
   runs). The three UUID runs individually: 16/8/1 of 25 at zero/one/two
   starved, 18/7/0 of 25, and 8/2/0 of 10.

**What it costs to get out.** Credits into the locked prison, measured:

| | backlog standing | backlog cancelled first |
| --- | --- | --- |
| perimeter freed at | **1,000** (999 does not) | **40** (39 does not) |
| perimeter freed *and* a 65 plank affordable | **1,065** | **105** |

[ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md)'s *"a loan principal of 65 escapes the lock; without it, nothing below
1,065 does — a factor of sixteen"* compares two thresholds defined differently:
65 frees the wall and leaves 25, which does not buy the plank. Like for like the
factor is **25** (1,000 against 40) or **10.1** (1,065 against 105), not 16.
Both halves of the sentence are individually true; their ratio is not a
measurement.

### Where the player actually meets it, which is a control and not a cosmetic list

`BUILD_QUEUE_ROW_LIMIT` is **3** (`src/ui/hud/build-panel.ts:545`) and the
Queued fold lays out the first three rows of `projectBuildQueue`, which is
ascending id (`construction-projection.ts:236-266`). Those rows are *Cancel*
buttons. So a player standing in the locked position with thirteen orders
pending is offered **three of them to cancel, chosen at random relative to the
order they drew them in** — and `tests/browser/playtest-into-the-lock.playtest.ts:525`
already says so in its own words: *"rows are ordered by ascending order id,
which is a uuid"*. The escape from the lock is thirteen `Cancel` presses
(`docs/research/2026-08-30-pricing-the-way-out.md` §7 counts them), taken three
at a time, and the player cannot tell which segment each press is about to
take away except by reading its tile. This is the part of the defect that is
not a projection detail: it is a destructive control aimed by a hidden number.

### The determinism question, which is what makes this affordable

**The id is minted on the main thread and crosses the protocol as an opaque
string.** `placeBuildOrderSchema` types it `orderId: z.string()`
(`src/simulation/protocol/commands.ts:52-60`) — deliberately looser than
`PurchaseMaterials.orderId`, and `:145-149` says why. The handler passes it
straight into `createBuildOrder` (`src/simulation/construction/handler.ts:42-51`)
and nothing in `src/simulation/` parses, slices or derives anything from it: its
only two uses are as the `Map` key (`system.ts:399`) and as the sort key
(`system.ts:769-773`).

So **order of execution is already not a determinism property derived from
simulation state.** It is a property of a value the main thread chose, and today
that value is drawn from a source `docs/DETERMINISM.md` bans inside the kernel.
What the current sort buys is the narrower and real guarantee that
`orderedOrders()` states: the same order book answers the same sequence on every
client and after every restore, because `restore()` re-inserts from a snapshot
rather than replaying insertion history. **Any total order over a persisted
field keeps that guarantee exactly.** This is why the fix is cheap.

### The save-format cost

`SAVE_SCHEMA_VERSION` is `5` (`src/persistence/save-schema.ts:34`). A
`BuildOrder` persists through `buildOrderSchema` (`:154-187`), which is
`.strict()`. Measured, through the real `createSaveEnvelope`:

```
construction section as it stands : ACCEPTED
the same with placementSequence   : REFUSED --
  ["construction.orders.0: unrecognized_keys Unrecognized key: \"placementSequence\"", …]
```

So the key must be **declared** — and that is the whole cost.
`docs/PERSISTENCE.md`, *"Adding an optional field without a version bump"*,
states the repository's rule and lists six fields added under it, two of them on
this very object:

> **The field is optional, and absent means what the older build already did.**
> … **The key still has to be declared.** … **A version bump would be required
> instead if absence were ambiguous** … or if an existing field changed shape or
> meaning.

[ADR 0038](./0038-what-makes-a-save-compatible.md) §1 is the same rule as a
property of the payload. An optional `placementSequence` satisfies all three
conditions: absent means *"this order predates the field"*, which is honoured by
sorting such orders ahead of every stamped one and tie-breaking among themselves
by id — **exactly today's behaviour**. So: **one optional field, no
`SAVE_SCHEMA_VERSION` bump, no migration step, and nothing in
`supabase/migrations/`** (which is the owner's alone and is untouched by this).

## Decision

### 1. Build orders are carried out in the order they were placed

The queue is first-come, first-served over the player's own gestures. That is
the only ordering at which *"why is that being built and not this?"* has an
answer the player could have predicted before pressing, and it is the ordering
every other queue a person meets uses.

It does **not** promise that a room encloses quickly: a player who drags three
hundred walls and then a cell's perimeter waits for the three hundred. What it
promises is that the answer is *"because you asked for those first"* rather than
*"because of a number you cannot see."*

### 2. The ordinal is `QueuedCommand.sequence`, stamped inside the kernel

`CommandHandler` is handed the `QueuedCommand` (`kernel/kernel.ts:12`), which
carries `sequence` (`:5-10`). The kernel enforces that it is strictly
increasing with no gaps and no duplicates (`:120-131`), dispatches strictly by
`(executeAtTick, sequence)` (`:149-155`), and **already persists it** —
`KernelSnapshot.expectedSequence` (`:14-19`), restored by `restoreState`. So the
ordinal is:

- **monotonic across a restore**, because `expectedSequence` is restored, so
  every new order sorts after every restored one, with no collision;
- **already deterministic**, because command dispatch order is pinned by
  `tests/determinism/kernel-system-order.test.ts`;
- **free of new state**, apart from the persisted field that carries it onto the
  order.

Measured: ascending command sequence equals placement order for a four-drag
perimeter, and ascending id does not.

`ConstructionSystem.orderedOrders()` therefore sorts by
`(placementSequence ?? -1, id)`. The id stays as the total tie-break, so the
comparator remains total (`docs/DETERMINISM.md`: *"A tie-break must be
total"*) and an order book of nothing but pre-field orders behaves exactly as it
does today.

### 3. The id scheme at the composition root does not change

`src/main.ts` keeps minting `order-${crypto.randomUUID()}`. Making the *id*
sortable was the obvious alternative and it is refused, for a reason that is
measured rather than aesthetic: `submitOrder` **throws** on a duplicate id
(`system.ts:368-370`) and the handler does not catch (`handler.ts:52`), so a
main-thread counter that restarts after a reload faults the worker. Seeding it
from the restored order book is not available to the main thread — the build
queue projection carries only *pending* orders
(`construction-projection.ts:240-241`), so a derived maximum is a lower bound,
which is precisely the defect `docs/DETERMINISM.md` records for
`IntelligenceLedger`. And it would not order the orders in saves that already
exist.

### 4. What the player is told is the owner's, and is not drafted here

Nothing in this decision adds a sentence to the screen: the Build panel already
lists the queue *"in the order the crew will reach them"*
(`construction-projection.ts:216`) and this makes that sentence true. If the
owner wants the list to say it is placement-ordered, the copy is theirs —
`AGENTS.md`'s fourth exclusion.

## Consequences

**`withdrawOrdersAwaitingMaterial` stops taking a segment at random.** It
withdraws the *greatest* id today, and `system.ts:650-687` argues at length that
this cannot be "the one the player drew last" because *"nothing on `BuildOrder`
… records when or in what order it was placed"* and *"what would change it is a
persisted field and therefore a save-format decision, not a better sort."* This
is that field, and #693's own doubt — the withdrawn segment can be the tile the
player drew **first** — is closed by it.

**The blast radius is 16 tests in 8 files, measured rather than grepped, and
every one of them is a contract change rather than a weakened test.** The sort
was replaced with *descending* id -- still total, still deterministic, still not
placement order -- and the whole non-browser suite run before and after under
identical conditions:

> **The implemented change turned 4 tests in 4 files red, not 16 in 8, and the
> difference is the proxy and not the tree.** Measured on 2026-08-31 against
> `main` @ `72b29c4` (v0.0.299), whose baseline is `Test Files 359 passed`,
> `Tests 4112 passed | 1 skipped` -- the suite has grown by 63 files and 634
> tests since the run below, so the two absolute counts are not comparable and
> only the *differences* are. The four:
> `tests/unit/construction-crew-capacity.test.ts` (1, not 5),
> `tests/unit/construction-build-queue-projection.test.ts` (1),
> `tests/integration/economy-refund-survives-the-clock.test.ts` (1, not 2) and
> `tests/integration/construction-just-in-time-materials.test.ts` (1), which
> postdates the measurement below and is not on its list at all.
>
> **Why the proxy over-counted, and it is the interesting half.** Descending id
> reorders *every* order book, including the many fixtures that build orders
> directly with ascending ids and never touch a command --
> `object-removal-loop`, `yard-and-common-room`, `economy-loan-recovery`,
> `construction-geometry`, `operations-construction-integration` and four of
> `construction-crew-capacity`'s five. `(placementSequence ?? -1, id)` leaves
> every one of those exactly as it was, because an order with no ordinal ties
> at the sentinel and the id decides. That is decision 2's *"an order book of
> nothing but pre-field orders behaves exactly as today"* showing up as a test
> count, and it is evidence for the design rather than a correction to it.
> The paragraph and the table below are kept because the measurement was real
> and the reasoning it supports -- that each of these is a contract change and
> not a weakened test -- is what the implementation went on to do.

```
baseline: Test Files 296 passed (296)          Tests 3478 passed | 1 skipped
mutated:  Test Files   8 failed | 288 passed   Tests   16 failed | 3462 passed
```

| file | failed |
| --- | --- |
| `tests/unit/construction-crew-capacity.test.ts` | 5 |
| `tests/integration/object-removal-loop.test.ts` | 3 |
| `tests/integration/yard-and-common-room.test.ts` | 2 |
| `tests/integration/economy-refund-survives-the-clock.test.ts` | 2 |
| `tests/integration/economy-loan-recovery.test.ts` | 1 |
| `tests/unit/construction-geometry.test.ts` | 1 |
| `tests/unit/construction-build-queue-projection.test.ts` | 1 |
| `tests/unit/operations-construction-integration.test.ts` | 1 |

The named one is the contract itself:
`construction-build-queue-projection.test.ts` *"lists the queue in the order the
crew will reach it, **which is ascending id and not submission order**"*. That
sentence is what this ADR changes, and re-pinning it is the change rather than a
casualty of it. It now reads *"which is placement order and not ascending id"*. `tests/determinism/canonical-iteration-contract.test.ts` needs no
change at all and did not fail: it requires the enumeration to reach *a* sort,
and it still does. Four docblocks state the old order in prose and go with it:
`system.ts:655-658`, `materials-procurement.ts:86-90`,
`construction-projection.ts:225-234` and `src/ui/simulation-build-queue.ts:79`.

**The mutation was reverted and nothing in `src/` is changed by this commit.**
(That was true of the commit that added this document. The commit that carries
the acceptance above *does* change `src/`; the sentence is kept because it is
what makes the measurement above readable as a measurement of `main`.)
A Playwright suite belonging to another agent was running throughout both runs,
which is why the measurement is a *difference* between two runs taken under the
same contention rather than an absolute count -- and the baseline being 0
failures is what makes the 16 attributable.

**It does not change what a prison can afford, and that is the point of keeping
it separate from [ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md).** No price moves, no balance moves, nothing is
credited or spent differently. What moves is *which* order a fixed amount of
material reaches.

**And it is the half of [ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md) that actually closes the measured lock.** Three
combinations, arithmetic against the same thirteen pending orders at 80 each,
with the perimeter segment at rank *r* in the walk:

| | required credit for the perimeter |
| --- | --- |
| ~~today~~ until 2026-08-31: per-item, all-or-nothing, random order | **1,000** flat (measured) |
| per-order partial fill, random order | `80r − 40`, *r* uniform on 1…13: **40 to 1,000**, expected 520 |
| placement order, either granularity | **0** — the perimeter is never in the unfunded tail (measured) |

> **The word *today* in the first row expired on 2026-08-31 and the row is
> marked rather than rewritten, because the whole table is an argument about
> what the *second* row buys over the first.** #703 rulings 9 and 12 landed
> per-order partial fill, so the second row is now what the code does and the
> first is history. The arithmetic is unchanged and is now measured rather than
> derived: `tests/unit/construction-just-in-time-materials.test.ts`, *"costs
> 80r - 40 to reach the order at rank r"*, scans the real service one minor unit
> at a time and gets `[40, 120, … 1,000]` with a mean of 520 — so the paragraph
> below is confirmed against the implementation and **this document's case is
> unweakened**: the worst case did not move, and only a stated order moves it.

**Per-order granularity alone does not close it**: it halves the expected
requirement and leaves the worst case exactly where it was, on a draw the player
cannot see. **Placement order alone does close it**, in the measured position,
because the perimeter was placed first. So the two decisions do **not** have to
be taken together — but [ADR 0081](./0081-whether-a-purchase-may-be-partly-filled.md)'s §2 recommendation of per-order granularity is
worth much less without this one, because *"the queue funds as many whole orders
as the balance covers, **in a stated order**"* is its own wording and there is no
stated order to fund them in until this is decided.

## Alternatives considered

**Derive the ordinal from the undo history, and persist nothing new.**
`undoStack` and `currentTransaction` are already in the snapshot and already in
`buildOrderSchema`'s sibling `constructionSnapshotSchema`
(`save-schema.ts:189-214`), and they are a record of placement order. Measured
on a four-drag perimeter: `undoStack` held `2+2+3` and `currentTransaction` 3,
and the flattened list was **identical to placement order**, and identical again
after a snapshot→restore round trip. It is the cheapest fix that exists and it
is still refused, for three reasons: `redo()` pushes a revived gesture onto the
**top** of the stack (`system.ts:559-577`), so redoing an old gesture silently
moves its place in the build queue; an order registered with no transaction id
has no ordinal at all, which is every fixture in `tests/` and any future
producer that forgets; and flattening the whole history inside a comparator runs
on every scheduled construction tick, twice a second, forever. Worth recording
because if the owner rejects the persisted field, this is the fallback that
works.

**Sort by an existing field.** There is none. `BuildOrder`
(`src/simulation/construction/build-order.ts:127-146`) carries `id`,
`definitionId`, `location`, `edge`, `state`, `progress`, `materialsAllocated`,
`assignedWorkerId` and `failReason`. No tick, no sequence, no gesture index.

**Change allocation order only and leave construction order alone.** Allocation
and the crew handover are the *same walk* (`system.ts:842-966`), so this means
two passes with two different comparators over one list — two canonical orders
where `docs/DETERMINISM.md` asks for one, for no gain a player can name.

## Open questions

1. **Whether placement order is the right answer at all**, against the two
   alternatives nobody has argued for: nearest-to-a-finished-room first, or a
   player-reorderable queue. Both are more game and much more machinery, and
   neither can be built before this one is settled, because both need the same
   persisted ordinal.
2. **Whether the Build panel's list should say what its order is.** Copy, so the
   owner's.
3. **Whether `docs/research/2026-08-30-pricing-the-way-out.md` and
   [ADR 0075](./0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
   need re-measuring** once this lands. The locked position they price is
   reachable in about one session in three with today's ids and **not reachable
   at all** with placement order, so the loan pricing is measured against a
   position this decision partly dissolves. The five candidate triples are not
   invalidated — §9's control recovers with no loan at all — but the *magnitude
   that decides the outcome* in that record is the 1,040 the queue owes itself,
   and this changes who that 1,040 is owed to.

## What would change my mind

The weakest claim here is that placement order is what a player expects. It is
argued from predictability and from every other queue, and it is **not
measured** — no playtest in `docs/research/` has asked anybody what they
expected the build queue to do, and `docs/AGENT_WORKFLOW.md` §3 is explicit that
a measurement is not a diagnosis. A playtest in which a player drags a perimeter
and is asked which segment should rise first would settle it, and would settle
open question 1 with it.

The second weakest is the pooled 30%. It is 60 independent UUID draws over one
prison shape at one funded/unfunded split. The mechanism is not in doubt — 13
starved of 325 with uniform ids makes `1 − (312/325)^9 ≈ 31%` the closed form,
and the samples agree — but a different prison would give a different figure and
nothing here says how it moves.
