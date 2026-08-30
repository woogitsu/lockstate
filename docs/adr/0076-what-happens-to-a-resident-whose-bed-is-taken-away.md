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

**Accepted, 2026-08-29, by the repository owner.**

**This clause read `Proposed, 2026-08-29. Not self-approved.` until the owner
accepted it later the same day.** As with [ADR 0075](./0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md),
the two rulings below were always the owner's and the acceptance step is what
had not happened; and as there, the acceptance was given against a summary of
this ADR's subject and its stated cost rather than against the full text, which
is written down so the status is not read as heavier than it is.

**One thing this ADR flagged and did not decide is still undecided.** It notes
that decision A(i) *"arguably creates [a player-facing string] it does not owe —
a prisoner who changes cell unasked is something the player should be told,
flagged rather than decided."* Acceptance does not answer that. A new
player-visible promise is one of the four things reserved to the owner, so
whoever implements relocation must put the question rather than invent the
string.

It answers an economy audit finding raised against `4c18bc4` (v0.0.203) as
ECON-003 and reproduced by running it against `ec10451` (v0.0.206).

**Two questions, both ruled on by the owner on 2026-08-29**, with the
measurements in this document in front of them: what a finished object un-builds
into, and what happens to the resident. The second ruling — **relocate** — arrived
after this document's first draft had recommended revalidating the payment
instead, and the two are **not** alternatives. They are the behaviour and the
invariant, and the decision section below is written that way rather than as a
reversal.

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

### B (the owner's). A finished object un-builds into its full materials, by either route

`RemoveObject` on a completed order returns everything the order consumed, the
same as `Undo` already does. The two commands stop disagreeing, and they agree on
the generous answer.

**The cost was put to the owner and is accepted rather than argued away.**
Dismantling becomes free and perfectly reversible: a wall can be taken down and
re-sited at no material cost, a misplaced bed costs nothing but the crew's time,
and the early-game pressure that came from materials being spent irreversibly
goes. That is a real change to how the first hour plays and it was chosen
knowingly.

**It also supersedes, for object removal, the expectation ADR 0017's consequences
recorded** — that #99's dismantle-to-salvage would return a built object's value
*"as carried salvage, not as cash"*. Salvage remains a coherent future mechanic
and is a physical-logistics question rather than an economic one; what this
decides is that removal does not destroy value while waiting for it. **Whoever
implements #99 should read this decision first**, because a salvage route that
also refunds would refund twice.

**The implementation hazard, named because the measurement in the Context found
it.** The allocation record is what a refund draws from, and `RemoveObject` does
not clear it. A refund added to `RemoveObject` that leaves `materialsAllocated`
populated is refunded **a second time** by a subsequent `Undo` — value created
from nothing, which is the defect class
`tests/integration/economy-money-conservation.test.ts` exists to catch. So this
decision is not "add a release call to `RemoveObject`": it is **one refund per
order, whichever command triggers it, with the allocation emptied in the same
step** exactly as `cancelOrder` already empties it. **A conservation test over
`Remove` → `Undo` and `Undo` → `Remove` is the gate**, and it is not optional.

### A (the owner's). Relocate the resident; pay only for furnished places when relocation cannot

**These are one decision in two parts — the behaviour and the invariant — and
they ship together.**

**A(i), the behaviour: a removal that drops a room's capacity below its occupancy
relocates the excess.**

This is the owner's ruling and it is the better game. A resident silently living
in a bedless room is a prison that has quietly stopped making sense; a resident
moved to a bed that exists is a prison that reacted.

**The mechanism this paragraph named is corrected here rather than deleted, and
the correction is dated 2026-08-30.** The sentences that stood here named a
method, an anchor and an atomicity, and were written before any of the code
existed — the Consequences below still say *"No production code is in this
branch"*. What shipped is not what they predicted, and the prediction is kept in
the subsection at the end of this one, because it is what the owner accepted.

**This subsection cites by quotation rather than by `file:line`, under issue
#645's ruling of 2026-08-30**, so that a citation here cannot go wrong quietly
again:
`tests/foundation/adr-quotation-verbatim-contract.test.ts` re-checks every
quotation below against the file it names on every run. **The rest of this
document still cites by line and is not covered by that gate.** A green run
there means the evidence is still on disk; it does not mean a sentence above it
is true, and the sentences below were each checked by reading the code.

**The mechanism is `relocateExcessResidentsOf`, and it is a second method rather
than a second caller of the first**, shipped by
[PR #637](https://github.com/matmaxalez/lockstate/pull/637):
`public relocateExcessResidentsOf(instanceIds: readonly string[]): ExcessRelocationOutcome {`
(verbatim in `src/simulation/prisoners/prisoner-operations-runtime.ts`). It
moves the excess rather than emptying the room, which is the narrowing this
decision asked for:
`It moves the excess, not everybody.`
(verbatim in `src/simulation/prisoners/prisoner-operations-runtime.ts`).

**It is best-effort, and deliberately not atomic.** The sibling
`relocateResidentsOutOf` is the atomic one:
`All-or-nothing, and that is the answer to "what happens when there is nowhere to put them".`
(verbatim in `src/simulation/prisoners/prisoner-operations-runtime.ts`). The
asymmetry between the two is stated where it is implemented:
`It is best-effort, where the sibling is all-or-nothing.`
`The sibling rolls every move back on the first resident with nowhere to go, because its caller can still *refuse*`
(both verbatim in `src/simulation/prisoners/prisoner-operations-runtime.ts`).
The sibling's caller really can refuse, and does:
`return { kind: 'refused', reason: 'room-occupied', request: { ...request }, tick };`
(verbatim in `src/simulation/rooms/zoning.ts`). A(i)'s caller cannot, because
this ADR records refusing the removal as **not taken** — so the object is
already gone by the time the question is asked, and rolling a move back would
put a resident into a bedless room on purpose:
`It cannot refuse the removal and is not asked before it.`
(verbatim in `src/simulation/objects/object-placement-service.ts`). The call
site discards the result for exactly that reason:
`this.residentRelocation?.relocateExcessResidentsOf([roomInstanceId]);`
(verbatim in `src/simulation/objects/object-placement-service.ts`).

**So each resident is moved or left, one at a time, and the caller is told which
happened to whom:**
`return { relocated, stranded };`
(verbatim in `src/simulation/prisoners/prisoner-operations-runtime.ts`). On
`main` today both halves are arrays of entity ids:
`readonly relocated: readonly EntityId[];`
`readonly stranded: readonly EntityId[];`
(both verbatim in `src/simulation/prisoners/prisoner-operations-runtime.ts`).

**That shape is already moving again, and this quotation is what will say so.**
[PR #660](https://github.com/matmaxalez/lockstate/pull/660), open on
`agent/0076-relocation-notice`, widens `relocated` to carry the instance each
resident moved *into*, so that the move can be announced. It has not merged, so
it is not quoted here and this paragraph describes `main`. When it merges the
two `readonly` quotations above go red — which is the gate working, and the
repair is to requote the widened field, not to drop the citation.

#### What this paragraph predicted, and what shipped instead

Kept rather than overwritten, for the reason `docs/AGENT_WORKFLOW.md` §4 gives:
a correction that erases what it corrects is no more durable than the claim it
replaced. Until 2026-08-30 the two paragraphs above read:

> **A(i), the behaviour: a removal that drops a room's capacity below its
> occupancy relocates the excess**, through
> `PrisonerOperationsRuntime.relocateResidentsOutOf`
> (`src/simulation/prisoners/prisoner-operations-runtime.ts:500`).
>
> This is the owner's ruling and it is the better game. […] The mechanism is
> already written, already atomic, already deterministic, and already trusted by
> `UnzoneRoom` — this decision gives it its second caller rather than inventing
> anything. Its one gap for this use is that it empties whole instances: a room
> losing one of two beds needs *the excess* relocated, which is a narrowing of
> the same walk.

Four clauses, and they did not all fare the same way:

- **The method.** No second caller of `relocateResidentsOutOf` was added. #637
  wrote a second method beside it, and `UnzoneRoom` is still the first one's only
  caller. The name in this ADR was therefore never the name of A(i)'s mechanism.
- **"already atomic".** True of the method named, false of the method built, and
  that is the substantive error rather than a naming one: best-effort was chosen
  deliberately, for the asymmetry quoted above, and a reader who took this
  sentence at face value would expect a rollback that does not exist.
- **The anchor.** `:500` was **exactly right when it was written** — verified at
  `092991e`, the commit that added this file, where line 500 is
  `relocateResidentsOutOf`'s own declaration. On `main` today it lands 44 lines
  higher than that declaration, inside its doc comment, and about 170 lines above
  `relocateExcessResidentsOf`. It is given here as a bare number, the way
  [ADR 0023](./0023-room-occupancy-authority.md) records its own drifted anchors:
  history, not a citation to follow.
- **"already deterministic", and the narrowing, are both still true.** The
  shipped method reads no RNG stream and no clock, visits residents in ascending
  entity id, and does relocate the excess rather than the room.

The reason this is a correction and not a defect report is that the ADR named
the gap itself — *"Its one gap for this use is that it empties whole instances"*
— and #637 closed it by writing a second method instead of widening the first.
What this document got wrong is which shape closing that gap would take, which
is the one thing a decision written before its implementation cannot know.

**A(ii), the invariant: `StateIncomeSystem` pays for
`min(occupancy, residentCapacity)` per room instance.**

This is the backstop, and **it is what makes A(i) safe rather than a second way
of being wrong.** The argument is the one this document made before the ruling
and it survives the ruling unchanged, because it was never an argument against
relocating:

> **A(i) does not close the leak, and A(ii) does.** After a relocation the
> resident occupies a real furnished bed and *should* be paid for — so
> relocation's correctness rests entirely on the `'no-vacancy'` branch, and in
> that branch the state is exactly today's: occupancy above capacity, still paid.
> A(ii) is unconditional.

**So shipping relocation alone leaves the leak open in exactly the branch that
matters**, and that branch is not an edge case — it is a prison with one cell, or
a prison that is full, which is every prison the moment the player is under
pressure. The recycling loop this ADR exists to close runs *through* the
no-vacancy branch, because a player exploiting it has no spare furnished bed by
construction.

`src/simulation/economy/income.ts:112`'s paragraph — *"can never exceed the
capacity the prison has actually furnished"* — becomes true again under A(ii) and
under nothing else here.

**Not taken: refusing the removal while a resident depends on the object.** For
#478's reason, already established: a room could become permanently un-editable
through ordinary play.

**Not taken: charging the prison for an over-capacity cell.** The most
interesting answer and much the most expensive — a new mechanic and a new balance
value (#29), plus a player-facing string. Recorded as a real option that was not
chosen rather than one that was missed. Note that under A(i) the state it would
charge for becomes rare, which weakens the case for it.

## Consequences

- **All three parts — B, A(i) and A(ii) — ship in the same release, and the
  ordering constraint is the reason this ADR exists.** **B without A makes the
  recycling one press instead of two**: today the loop needs `Undo`, and under B
  alone `RemoveObject` returns the plank by itself while the resident keeps
  paying, so a single press furnishes the next cell and leaves a paying resident
  behind in this one. **B is a good decision provided the residency half is
  closed, and a bad one on its own.** They must not be accepted separately in
  that order.
  **Corrected 2026-08-30: they did not ship in the same release, and the
  decision above is left standing because what changed is the world and not the
  decision.** Two of the three have shipped, in separate releases, and the third
  has not shipped at all. **A(ii)** landed first, from issue #585 in
  [PR #610](https://github.com/matmaxalez/lockstate/pull/610) — `71617799` —
  and **A(i)** second, in
  [PR #637](https://github.com/matmaxalez/lockstate/pull/637) — `08d3e62`.
  **B — a finished object un-building into its full materials by either route —
  is not implemented.** `RemoveObject` on a standing object still refunds
  nothing, and the code still argues for the asymmetry B was to close:
  `A *standing* object is not refunded, and the asymmetry is the honest one:`
  (verbatim in `src/simulation/objects/object-placement-service.ts`). The
  behaviour B would change is still pinned by the test this ADR named, under the
  name it named:
  `gives back the materials a cancelled order had allocated, and does not refund a built object`
  (verbatim in `tests/integration/object-removal-loop.test.ts`).
  **The hazard this bullet exists to prevent has not been realised**, which is
  why this is a correction and not an incident report. What it forbids is **B
  without A** — one press that hands the plank back while the resident goes on
  paying. What shipped is **A without B**, the safe direction by this bullet's
  own argument: A(ii) stops the recycled cell earning anything, so the loop pays
  for nothing whether or not the plank comes back.
  `tests/integration/economy-bed-recycling.test.ts` measures that directly — the
  recycled prison now earns one resident's income where it earned three, and the
  40 minor units still separating it from the control are an unmet-need
  withholding that file derives in place and that has nothing to do with places.
  **What is outstanding is therefore B alone**, together with the gate this ADR
  made non-optional for it: one refund per order, the allocation emptied in the
  same step, and a conservation test over `Remove` → `Undo` and
  `Undo` → `Remove`. **Whether shipping A without B is an acceptable resting
  state, or B is now owed as its own change, is the owner's to say** — this note
  records the divergence and does not settle it. `docs/adr/README.md`'s row for
  this ADR still carries the same promise, and the same superseded mechanism for
  A(i); it is named here rather than edited, because that index is under another
  pass.
- **A(i) without A(ii) is the same mistake one layer down.** Relocation looks
  like it closes the loop and does not, for the reason A(ii) states: the exploit
  lives in the branch relocation cannot serve. A release that shipped B and A(i)
  and deferred A(ii) would read as complete and would leave the measured
  behaviour of `economy-bed-recycling.test.ts` intact for any prison with no
  spare bed.
- **The existing tests are the gate, and three assertions going red is correct.**
  `object-removal-loop.test.ts` asserts today's behaviour in all three places
  being changed: *"the state still pays for the place they occupy"* (A(ii)),
  *"keeps the prisoner housed"* and *"keeps the prisoner sleeping in the cell
  whose bed has gone"* (A(i)), and *"gives back the materials a cancelled order
  had allocated, and does not refund a built object"*, whose comment reads *"the
  plank became a bed"* (B). Each is a sentence that has to be rewritten by hand,
  and that is the point: it must not be possible to change this behaviour without
  editing the sentences that promised the old one.
- **ADR 0028 decision 2's two quoted sentences survive A(i), narrowly, and the
  narrowing must be written into that ADR.** *"Nobody is evicted"* stays true in
  the sense it was decided — nobody is put on the street, and the `'no-vacancy'`
  branch still houses them exactly where they were. What changes is that a
  resident may be **moved** rather than left, when there is somewhere to move
  them. *"Occupancy above capacity is a legal, named state"* also stays true, and
  becomes the no-vacancy branch's state specifically rather than the general
  outcome.
- **No save format moves under A(i), A(ii) or B.** A(i) writes only state the
  save already carries — residency and cold-state accommodation, both persisted;
  A(ii) changes an arithmetic at the day boundary; B moves an existing quantity
  between an order record and a container, both persisted.
- **A determinism fingerprint moves under all three**, because each changes the
  balance, the residency or the stock a fingerprint hashes for a prison in the
  affected state. **No pinned fingerprint is re-baselined**: a prison that never
  removes an occupied cell's last bed and never removes a completed object is
  unaffected, which is the property to check before extending any pinned list.
- **No player-facing string is added by A(i), A(ii) or B.** The over-capacity
  readout ADR 0028 decision 2 already owes — *"what it cannot yet say is 'over
  capacity'"* — is still owed and is still a later phase's. **A(i) arguably
  creates a new one it does not owe**: a prisoner who moves cell without the
  player asking is a thing the player should be told about, and saying nothing is
  cheaper than saying it badly. Flagged rather than decided, because copy is the
  owner's.
- **No production code is in this branch.** Each part is its own change after
  acceptance.

## What would change this

The weakest claim here is the ceiling. Three residents from one plank is
measured; *"one per zonable cell"* is an inference from the loop's shape, and the
number of `room.cell` instances the starter chunk admits was **not counted and is
not guessed**. If that number turned out to be three or four, this would be a leak
worth a comment rather than an ADR. Counting it is the cheapest thing that would
change my mind in either direction — and it changes nothing about B, which is a
decision about materials and not about the exploit.

The second weakest is the claim that A(ii) is unconditional. It is unconditional
*given* that `residentCapacity` is the right ceiling to pay against, which is
ADR 0028 decision 2's derivation and not this ADR's. If a future room type earned
income from something other than a sleep surface, `min(occupancy,
residentCapacity)` would start withholding money the prison had earned, and this
decision would need re-reading rather than extending.
