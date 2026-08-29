# ADR 0076: What happens to a resident whose bed is taken away

> **The number is provisional and this document pre-commits to renumbering.**
> Same terms as [ADR 0075](./0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md):
> a number is not reserved until it appears in `docs/adr/README.md`, an unmerged
> branch is invisible from that index, and if another branch turns up holding
> 0076 then this file, its row and every citation get renumbered without
> argument.
>
> The sweep is written out once, in ADR 0075's preamble, because both documents
> were assigned in the same pass and recomputed off disk in the same commit:
> every remote head maxes at **0074**, **0072 is held and unwritten**, so
> `max + 1` is 0075 and this is 0076.

## Status

**Proposed, 2026-08-29. Not self-approved.**

It answers an economy audit finding raised against `4c18bc4` (v0.0.203) as
ECON-003 and reproduced by running it against `ec10451` (v0.0.206).

**Two questions, and they did not arrive here the same way.** Question B — what
a finished object un-builds into — was put to the owner with its cost and
**ruled on 2026-08-29**. Question A — what happens to the resident — **was not
put to them**, and is proposed here. That asymmetry is stated at the top because
the consequences section turns on it: **B's answer makes A urgent rather than
optional**, and the two must not be accepted separately in that order.

**It amends [ADR 0028](./0028-object-placement-and-derived-room-capacity.md)
decision 2**, whose subsection *"A room whose objects are removed while
occupied"* decides, in its own words:

> **Nobody is evicted. Occupancy above capacity is a legal, named state.**

and

> **Removing the last bed from an occupied cell does not homeless anybody.**

**Neither sentence is withdrawn as a statement about the prisoner.** They are
right, they were reached deliberately against a research sample, and this
document keeps them. What is amended is what that legal state is allowed to be
*worth*: ADR 0028 decided who sleeps where and said nothing about who pays, and
the state it made legal turns out to be one the treasury pays for.

## Context

### The written invariant the code stopped honouring

`src/simulation/economy/income.ts:112` argues that because
`RoomInstanceRegistry.assign` refuses past `residentCapacity`, the occupancy
count

> can never exceed the capacity the prison has actually **furnished**, which is
> a stronger statement than it used to be

That paragraph is the *argument* for why paying per occupied place is safe — not
a comment beside the code, but the reasoning the income model rests on. Remove
an occupied cell's only bed and the cell reads occupancy **1** against
`residentCapacity` **0**, and `StateIncomeSystem` pays for it. The code is right
and the paragraph is false.

This is the sharpest evidence in the finding, and it is why the subject is a
decision rather than a comment fix.

### The half that is already decided, and is not the finding

ADR 0028 decision 2's eviction subsection is implemented and measured.
`tests/integration/object-removal-loop.test.ts` already drives the whole path
through the real kernel and pins it: after a bed is removed from an occupied
cell the prisoner keeps their `accommodationInstanceId`, the cell reads
occupancy 1 against `residentCapacity` 0, the room's `object` requirement flips
to `'missing-capability'`, the cell admits nobody new while its neighbour still
does, the prisoner goes on sleeping there, and the whole state survives a save
round trip and five in-game days without throwing. That file also states the
money consequence in as many words, as an intended one:

> the state still pays for the place they occupy

So **none of that is news**, and a reader who stops here should take away that
residency outliving the object is a decision, not a defect. What follows is
about the money and about the materials.

### The half that is decided nowhere: two commands disagree

Two commands remove a finished object, and they disagree about whether it
un-builds into its materials.

- **`RemoveObject` refunds nothing.** Measured, and
  `object-removal-loop.test.ts` gives the reason in its own comment: *"the plank
  became a bed"*.
- **`Undo` refunds the plank in full.** `ConstructionSystem.cancelOrder`
  releases `materialsAllocated` (`src/simulation/construction/system.ts:565`),
  and nothing clears that field when an order completes — it is written once at
  allocation (`src/simulation/construction/system.ts:726`) and carried through
  `'completed'`. `cancelOrder` is what `undo()` delegates to, deliberately, so
  that a finished wall can be taken down.

A third answer is already on file and neither command implements it. ADR 0017's
consequences say *"#99's dismantle-to-salvage decision means a built object's
value returns as **carried salvage**, not as cash"*, and
[ADR 0037](./0037-goods-in-a-carriers-hands-when-a-carry-job-dies.md) names the
same issue as the one that *"would give `ContainerRegistry` a removal path"*.

### What the two halves make together

Place a bed, admit a prisoner, `Undo` (bound to `KeyZ`), repeat in the next
cell. Measured in `tests/integration/economy-bed-recycling.test.ts` against a
control that plays the same prison without the undo — same seed, same single
65 plank, same three walled and zoned cells, same measurement tick:

| | recycled | control |
| --- | --- | --- |
| planks bought | 1, for 65 | 1, for 65 |
| beds standing at the end | 1 | 1 |
| residents at tick 12,000 | **3** | 1 |
| balance at tick 12,000 | **29,315** | 26,395 |
| state income earned | **4,380** | 1,460 |

`24,935 + 3 × 1,460 = 29,315`: exactly three times the income for exactly the
same money.

**The word "unbounded" is withdrawn.** The audit's finding said one plank yields
unbounded revenue-bearing residents. It does not: the loop needs a fresh cell
each time, so the ceiling is the number of `room.cell` instances the prison can
zone. The starter prison owns one 32×32 chunk and `room.cell`'s authored minimum
is a 2×3 interior, so the ceiling is tens rather than three — **but it was not
counted, and no figure is claimed here.** What is measured is three residents
from one plank, and a bound that is land rather than materials.

### `Remove` then `Undo` already refunds today, and that is load-bearing for decision B

Measured on this tree, one prison, one plank:

```
after build   planks 0  order completed  materialsAllocated [{item.wood-plank, 1}]
after remove  planks 0  order completed  materialsAllocated [{item.wood-plank, 1}]
after undo    planks 1  order cancelled  placed objects 0
```

`RemoveObject` on a completed order takes the object out of the registry and
**leaves the order `completed` with its allocation intact** — deliberately;
`object-removal-loop.test.ts` pins that a second press answers
`remove-object.nothing-to-remove` rather than cancelling the order, and says
why: *"the second press would cancel it and refund a plank that became a bed"*.
`Undo` afterwards still reaches `cancelOrder`, which still releases the
allocation.

So the plank already comes back through two different two-press sequences. This
is not an argument against decision B — it is the fact that makes B's
implementation hazardous, and it is what the consequences section is about.

### Look one module over: the mechanism a fix needs exists and has one caller

`PrisonerOperationsRuntime.relocateResidentsOutOf`
(`src/simulation/prisoners/prisoner-operations-runtime.ts:500`) moves every
resident of named instances into other suitable accommodation. It is
all-or-nothing — residents are visited in ascending entity id, each offered only
the target their own classification group prefers, and the moment one has
nowhere to go every move already made is undone and the caller sees a clean
`'no-vacancy'`. It reads no RNG stream and no clock.

It was built for [#478](https://github.com/matmaxalez/lockstate/issues/478) so
that `UnzoneRoom` could relocate rather than refuse, and `RoomZoningService` is
its only caller. **An object removal that drops a cell's capacity below its
occupancy is the same question one command over.** Its one gap for this use is
that it empties whole instances: a room losing one of two beds needs *the
excess* relocated, which is a narrowing of the same walk rather than a second
mechanism.

## Decision

### B (the owner's, ruled 2026-08-29). A finished object un-builds into its full materials, by either route

`RemoveObject` on a completed order returns everything the order consumed, the
same as `Undo` already does. The two commands stop disagreeing, and they agree
on the generous answer.

**The cost was put to the owner and is accepted rather than argued away.**
Dismantling becomes free and perfectly reversible: a wall can be taken down and
re-sited at no material cost, a misplaced bed costs nothing but the crew's time,
and the early-game pressure that came from materials being spent irreversibly
goes. That is a real change to how the first hour plays and it was chosen
knowingly.

**It also supersedes, for object removal, the expectation ADR 0017's
consequences recorded** — that #99's dismantle-to-salvage would return a built
object's value *"as carried salvage, not as cash"*. Salvage remains a coherent
future mechanic and is a physical-logistics question rather than an economic
one; what this decides is that removal does not destroy value while waiting for
it. **Whoever implements #99 should read this decision first**, because a
salvage route that also refunds would refund twice.

**The implementation hazard, named because the measurement above found it.**
The allocation record is what `cancelOrder` refunds from, and `RemoveObject`
does not clear it. A refund added to `RemoveObject` that leaves
`materialsAllocated` populated is refunded **a second time** by a subsequent
`Undo` — value created from nothing, which is the defect class
`tests/integration/economy-money-conservation.test.ts` exists to catch. So this
decision is not "add a release call to `RemoveObject`": it is *one* refund per
order, whichever command triggers it, with the allocation emptied in the same
step exactly as `cancelOrder` already empties it. A conservation test over
`Remove` → `Undo` and `Undo` → `Remove` is the gate.

### A (proposed, not ruled on). Pay only for places the prison has furnished, and relocate the excess once the no-vacancy branch has an owner

**A2, now: `StateIncomeSystem` pays for `min(occupancy, residentCapacity)` per
room instance.**

It is the smallest change that exists — one system, no new mechanic, nobody
moved, nobody stranded — and it makes `src/simulation/economy/income.ts:112`'s
paragraph true again rather than deleting it. It closes the money leak
completely and in every case, including the case A1 cannot reach.

**A1, next: relocate the excess through `relocateResidentsOutOf` when a removal
drops capacity below occupancy.** This is the fiction fix rather than the money
fix: it puts the prisoner in a bed that exists. It needs a real answer to
*"there is nowhere to put them"* — refuse the removal, which is what `UnzoneRoom`
did before #478 and which #478 exists because it was wrong, or leave the state
as it is today — and that answer is the reason it is second rather than first.

**Not taken: refusing the removal while a resident depends on the object.** For
#478's reason, already established: a room could become permanently un-editable
through ordinary play.

**Not taken here: charging the prison for an over-capacity cell.** The most
interesting answer and much the most expensive — a new mechanic and a new balance
value (#29), plus a player-facing string. Recorded as a real option that was not
chosen rather than as one that was missed.

## Consequences

- **B without A makes the exploit one press instead of two, and that is the
  ordering constraint this ADR exists to state.** Today the loop needs
  `Undo` (or `Remove` then `Undo`). Under B alone, `RemoveObject` returns the
  plank by itself while the resident keeps paying — so a single press furnishes
  the next cell and leaves a paying resident behind in this one. **B is a good
  decision provided the residency half is closed, and a bad one on its own.**
  They must not be accepted separately in that order.
- **B does not reorder A, and the reason is worth stating rather than
  asserting.** It would be natural to conclude that B's urgency promotes A1
  ahead of A2. It does not, because **A1 does not close the leak and A2 does**:
  after a relocation the resident occupies a real furnished bed and *should* be
  paid for, so A1's correctness depends on the `'no-vacancy'` branch, and in that
  branch the state is exactly today's — occupancy above capacity, still paid.
  A2 is unconditional. So the recommendation is unchanged by the ruling: **A2
  first, and A2 shipped in the same release as B**, with A1 after.
- **The existing tests are the gate, and one of them going red is correct.**
  `object-removal-loop.test.ts` asserts today's behaviour including *"the state
  still pays for the place they occupy"*. A2 turns that red, and it should: the
  sentence is the thing being amended, and it must not be possible to change the
  money without editing the sentence that promised it. B turns red the same
  file's *"gives back the materials a cancelled order had allocated, and does
  not refund a built object"*, whose comment reads *"the plank became a bed"* —
  also correct, and also a sentence that has to be rewritten by hand.
- **No save format moves under A1, A2 or B.** A1 writes only state the save
  already carries — residency and cold-state accommodation, both persisted; A2
  changes an arithmetic at the day boundary; B moves an existing quantity between
  an order record and a container, both persisted.
- **A determinism fingerprint moves under A2 and B**, because both change the
  balance or the stock a fingerprint hashes for a prison in the affected state.
  **No pinned fingerprint is re-baselined**: a prison that never removes an
  occupied cell's last bed and never removes a completed object is unaffected,
  which is the property to check before extending any pinned list.
- **No player-facing string is added by A1, A2 or B.** The over-capacity readout
  ADR 0028 decision 2 already owes — *"what it cannot yet say is 'over
  capacity'"* — is still owed and is still a later phase's, and it is the one
  thing here that would need copy.
- **No production code is in this branch.** Each decision is its own change
  after acceptance.

## What would change this

If the owner would rather a bed removal never move anybody, **A2 is the whole
answer and A1 should be dropped rather than deferred** — the ADR would then read
that residency is permanent and only the payment is revalidated, which is a
coherent game and one sentence shorter to explain.

The weakest claim here is the ceiling. Three residents from one plank is
measured; *"one per zonable cell"* is an inference from the loop's shape, and the
number of `room.cell` instances the starter chunk admits was **not counted and is
not guessed**. If that number turned out to be three or four, this would be a
leak worth a comment rather than an ADR. Counting it is the cheapest thing that
would change my mind in either direction — and it changes nothing about B, which
is a decision about materials and not about the exploit.
