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

**Decision B is amended, and the amendment is signed: the owner accepted it on
2026-09-01.** See §*Amendment, 2026-08-31: cancelling a build order gives back
money, not materials, and only while the crew has not started* at the foot of
this file. It records the owner's ruling 20 of 2026-08-31, supersedes the
premise decision B rests on for four of the six cancellable states, leaves B's
own sentence about a **completed** object standing, and marks what B governs and
ruling 20 does not answer — `RemoveObject` on a completed object — as undecided
and the owner's.

**A second amendment is proposed and is NOT signed.** See §*Amendment,
2026-09-01: taking a finished object away returns nothing* at the foot of this
file. It records the owner's ruling of 2026-09-01 -- *"Taking a finished object
away returns nothing. Not its materials, not its money."* -- which **reverses
decision B's own sentence**, the one the amendment above left standing, and
closes the inversion that amendment reported under *"What ruling 20 does not
decide"*. **Until it is signed, decision B as written above is what this
document decides for a `completed` order; the second amendment is a proposal
with an implementation beside it, not a change of status, and it must not
merge before the signature.** That sentence is the same one this Status carried
for the first amendment, quoted below, and it is reused deliberately: the
condition is identical and so is the rule that holds it there.

**This clause read differently while the amendment was unsigned**, and the
sentence is kept because it is what a reader of an earlier revision found here:
*"Until it is signed, decision B as written above is what this document decides;
the amendment is a proposal with an implementation beside it, not a change of
status."* That condition ended on 2026-09-01.

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

> **Answered on 2026-08-30, and the paragraph above is left standing because it
> is what the question was.** [PR #637](https://github.com/matmaxalez/lockstate/pull/637)
> shipped A(i) silent and recorded the debt. The question was put, and the
> owner approved one sentence:
>
> > `{name} had nowhere to sleep and moved to {room}.`
>
> It is in `src/content/default-locale-en.ts` under
> `hud.alert.event.prisoners.relocated`, reproduced exactly, and it reaches the
> player on the events band and in the alerts list.
>
> **The approval covers the relocated case only.** A resident the prison had
> nowhere to move is still announced by nothing — that is
> `ExcessRelocationOutcome.stranded`, it is the branch decision A(ii) is
> unconditional for, and whether the player should be told about *that* is an
> open question with no wording behind it. Recorded here rather than answered.

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

> **THIS SECTION IS A DIAGNOSIS OF A PARAGRAPH THAT HAS SINCE BEEN CORRECTED
> IN THE CODE, AND IT IS THE SHARPEST OF THIS DOCUMENT'S STALE CLAIMS BECAUSE
> IT CALLS ITSELF THAT (dated 2026-09-16, `e044a3e8`).** *"The code is right
> and the paragraph is false"* was true when it was written. The paragraph is
> no longer asserted: `src/simulation/economy/income.ts:147-158` now **quotes
> the sentence below as superseded**, under a heading naming issue #585, and
> says of it in terms that *"Every clause of that is true at the moment of
> assignment and none of it survives the bed being taken away afterwards."*
> The anchor is re-aimed onto that block rather than onto the surviving quote,
> because the quote is now *inside* a correction and a citation landing on it
> would read as though the code still claims it.
>
> **And this document's decision A(ii) is implemented, which is the other
> half.** `income.ts:168-189` names ADR 0076 A(ii) as the rule it ships,
> records that it was reached twice independently, and notes that **A(i)
> landed too** — `ObjectPlacementService` calls
> `PrisonerOperationsRuntime.relocateExcessResidentsOf`
> (`src/simulation/objects/object-placement-service.ts:875`) on both routes
> that take a standing object out of a room. It also carries a **refinement
> this document's arithmetic does not reach**: since
> [ADR 0064](./0064-what-an-unmet-need-costs-a-prison.md) a count cannot
> answer what a day is worth, so `min(occupancy, residentCapacity)` needs a
> *which* as well as a *how many*, supplied by
> `RoomInstanceRegistry.residentIdsWithExistingPlace`. **A reader of A(ii)
> below should read `income.ts`'s block for the shipped rule; A(ii) is the
> decision and not the specification.**

`src/simulation/economy/income.ts:147-158` argues that because
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
  releases `materialsAllocated` (`src/simulation/construction/system.ts:1016-1020`),
  and nothing clears that field when an order completes — it is written once at
  allocation (`src/simulation/construction/system.ts:1708`) and carried through
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
(`src/simulation/prisoners/prisoner-operations-runtime.ts:707`) moves every
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
(verbatim in `src/simulation/objects/object-placement-service.ts`).

**So each resident is moved or left, one at a time, and the caller is told which
happened to whom:**
`return { relocated, stranded };`
(verbatim in `src/simulation/prisoners/prisoner-operations-runtime.ts`). The
two halves are no longer the same shape:
`readonly relocated: readonly ExcessResidentRelocation[];`
`readonly stranded: readonly EntityId[];`
(both verbatim in `src/simulation/prisoners/prisoner-operations-runtime.ts`) —
because a relocation has to say where to, and a stranding has nowhere to name.

#### 2026-08-30: the prediction fired, and it fired on `main`

**The paragraph above said, until this date:** that both halves were
`readonly EntityId[]`, that [PR #660](https://github.com/matmaxalez/lockstate/pull/660)
*"has not merged, so it is not quoted here"*, and that **"when it merges the two
`readonly` quotations above go red — which is the gate working, and the repair
is to requote the widened field, not to drop the citation."**

All three were true when written. #660 merged, `relocated` widened to
`ExcessResidentRelocation[]`, the quotation stopped matching, and
`adr-quotation-verbatim-contract` failed exactly as promised. It has been
requoted, not dropped.

**It went red on `main` rather than on a pull request, and that is worth
recording rather than tidying away.** The integrator merged #660 first and then
merged the pull request carrying this paragraph, having read the sentence that
predicted the collision. The gate did its whole job; the ordering did not.

**And the same window produced the failure this gate cannot catch, which the
contract's own header names.** Until this date the sentence above the call-site
quotation read *"The call site discards the result for exactly that reason"*.
Since #660 it does not discard:
`this.relocationNotice?.announceRelocations(outcome.relocated);`
(verbatim in `src/simulation/objects/object-placement-service.ts`). The old
quotation beside that false sentence — `relocateExcessResidentsOf([roomInstanceId])`
— **remained a substring of the widened statement**, so the contract went on
accepting it while the sentence around it had become untrue. A verbatim
quotation proves the text still exists. It does not prove the claim it is
offered in support of, and that is the boundary this document now demonstrates
rather than merely states.

#### What this paragraph predicted, and what shipped instead

Kept rather than overwritten, for the reason `docs/AGENT_WORKFLOW.md` §4 gives:
a correction that erases what it corrects is no more durable than the claim it
replaced. Until 2026-08-30 the two paragraphs above read:

> **A(i), the behaviour: a removal that drops a room's capacity below its
> occupancy relocates the excess**, through
> `PrisonerOperationsRuntime.relocateResidentsOutOf`
> (`src/simulation/prisoners/prisoner-operations-runtime.ts:518`).
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

`src/simulation/economy/income.ts:147-158`'s paragraph — *"can never exceed the
capacity the prison has actually furnished"* — becomes true again under A(ii) and
under nothing else here.

> **RE-READ 2026-09-16 (`e044a3e8`): the prediction held for the behaviour and
> not for the paragraph.** A(ii) shipped and the leak is closed
> (`income.ts:168-189`), so the *rule* the sentence describes is true again.
> The *paragraph* was not left to become true — it was rewritten under issue
> #585, and now quotes its own old sentence as superseded rather than
> asserting it. So "becomes true again under A(ii) and under nothing else
> here" is right about this document's options and was overtaken by a third
> one it did not have: correcting the prose.

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
  **Corrected 2026-09-03: there is no 40 any more.** The repository owner
  suspended the withheld share at `0` while they play and judge difficulty —
  their ruling, in their words, is in
  [ADR 0064](./0064-what-an-unmet-need-costs-a-prison.md)'s dated amendment of
  that date — so what separates the two arms is now **130 minor units of
  materials alone**, two planks at 65, and the recycled arm sits below the
  control rather than above it. The sentence before this one is kept rather
  than rewritten because the 40 it names is what the withholding does to this
  same pair of prisons and will do again if the rate returns
  (`docs/AGENT_WORKFLOW.md` §4: mark both directions); what it says about
  **places** — that the withholding had nothing to do with them — is unaffected
  either way, and is the half this bullet actually turns on.
  **The rate returned on 2026-09-04, so the correction above is itself now
  history and is kept rather than rewritten for the reason it gave when it kept
  the sentence it corrected.** *"Corrected 2026-09-03: there is no 40 any
  more"* held for one day; the owner restored
  `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to `40` on 2026-09-04
  (`src/simulation/economy/income.ts`, reaching the source at `3134a78e`; both
  rulings are in that constant's own docblock), which is the *"will do again if
  the rate returns"* that correction closed with, arriving. So the 130 minor
  units of materials are no longer what separates the two arms **alone**: the
  recycled arm pays one more day's withholding than the control does, and
  `tests/integration/economy-bed-recycling.test.ts` pins the gap at **90** --
  *"the right-hand side became `130 - 40` again"*, the same relation it
  asserted before the suspension.
  **What did not move across either ruling is the half this bullet turns on.**
  The recycled arm has sat below the control at both withholding rates since
  the ruling of 2026-09-01, so *"recycling is
  now strictly worse than playing it straight"* is unaffected, and so is the
  claim about **places** -- the withholding has nothing to do with them whether
  it is 0 or 40. Three passes over this paragraph have left that clause alone,
  and only the arithmetic beside it has had to move.
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
  **Both halves of that came true, and it is marked rather than rewritten.**
  A(i) did create one, flagging it was the right call, and the owner wrote the
  sentence on 2026-08-30 — see the Status section. What is still true exactly
  as written is the rest: neither A(ii) nor B adds a string, and the
  over-capacity readout is still owed by somebody else.
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

## Amendment, 2026-08-31: cancelling a build order gives back money, not materials, and only while the crew has not started

**Accepted, 2026-09-01, by the repository owner.** Drafted 2026-08-31 against
`72b29c4` (v0.0.299) and put to the owner with its implementation beside it, so
that what was being signed could be seen running. The two rulings quoted below
were always the owner's; **everything this amendment derives from them was
not**, and the acceptance step is what makes the derivation the repository's
rather than its author's.

**The clause above read `Proposed amendment, not self-approved — awaiting the
owner's signature` until that acceptance**, together with the sentence *"it must
not merge before the signature."* Both are kept rather than deleted, because
they are the record of the condition this document was under for one day, and
of the rule that held it there.

### The source: the owner's ruling 20 of 2026-08-31

Two clickable decisions were put to the owner and both were answered:

> **"Anulowanie zwraca pieniądze zamiast cegieł"**

> **"Pieniądze dopóki ekipa nie zaczęła"**

*Cancelling gives back money instead of bricks*, and *money until the crew has
started*. Against `BuildOrderLifecycleState`
(`src/simulation/construction/build-order.ts`), whose members are
`planned | approved | materials-pending | assigned | in-progress | completed | cancelled | failed`,
the second ruling draws its line between `assigned` and `in-progress`:

| state | ruling 20 |
| --- | --- |
| `planned` | a refund |
| `approved` | a refund |
| `materials-pending` | a refund |
| `assigned` | a refund |
| `in-progress` | **nothing** |
| `completed` | *not addressed — see "What ruling 20 does not decide" below* |
| `cancelled`, `failed` | terminal; `cancelOrder` throws on both (`src/simulation/construction/system.ts:1006-1008`) |

### Which part of decision B this supersedes, and which part survives

Decision B above is one sentence about a finished object and one premise about
how cancellation already works. Ruling 20 reaches the premise and not the
sentence.

**Superseded — the premise, for four states.** Decision B's Context establishes,
as the fact its argument rests on, that *"`Undo` refunds the plank in full.
`ConstructionSystem.cancelOrder` releases `materialsAllocated`"*, and its
Decision reads it forward as *"the same as `Undo` already does"*. From the
moment ruling 20 ships that is false for an order in `planned`, `approved`,
`materials-pending` or `assigned`: `cancelOrder` returns **money** in those four
states and puts nothing back into the container.

**Superseded — and this part decision B never contemplated at all.** An
`in-progress` order holds a live allocation (`system.ts:1708` is where it is
written), and ruling 20 gives it back neither as materials nor as money. That is
the first place in this repository's money loop where value deliberately leaves
the economy rather than changing form. It is not a defect and it is the point of
the second ruling: cancelling late is meant to cost something, and if the
materials came back in either currency it would cost nothing at all.

**Survives — decision B's own sentence.** *"A finished object un-builds into its
full materials, by either route"* is a decision about a `completed` order, and
ruling 20 enumerates the states up to `in-progress` and stops. Nothing here
withdraws it: `cancelOrder` on a `completed` order still releases
`materialsAllocated` into the container, `Undo` of a finished wall still gives
the plank back, and B's outstanding half — bringing `RemoveObject` into line
with that — is neither implemented by this change nor cancelled by it.

**Survives, in a different currency — decision B's hazard, which is the reason
this amendment is longer than the ruling.** B put it this way:

> **The implementation hazard, named because the measurement in the Context
> found it.** The allocation record is what a refund draws from, and
> `RemoveObject` does not clear it. A refund added to `RemoveObject` that leaves
> `materialsAllocated` populated is refunded **a second time** by a subsequent
> `Undo` — value created from nothing […] So this decision is not "add a release
> call to `RemoveObject`": it is **one refund per order, whichever command
> triggers it, with the allocation emptied in the same step** exactly as
> `cancelOrder` already empties it. **A conservation test over `Remove` → `Undo`
> and `Undo` → `Remove` is the gate**, and it is not optional.

Every clause of that is still in force, with *materials* replaced by *money*,
and the hazard is **sharper** than it was rather than milder. Under B the
double-refund needed two presses. Under ruling 20 it needs one:

- **The old shape, in the new currency.** A refund route that pays money and
  leaves `materialsAllocated` populated is paid a second time by whatever
  cancels the order next — and, before that even happens, the standing
  allocation is still counted as prison value by
  `tests/integration/economy-money-conservation.test.ts`'s valuation, so the
  money is created at the instant it is paid.
- **The new shape, and it is one press.** A route that pays the money **and**
  releases the materials into the container returns the plank and pays for it in
  the same step. This is the failure mode `AGENTS.md`'s brief for this work
  states as a rule — *a refund must never both return the plank to stock and pay
  for it* — and it is the reason the four refundable states are not implemented
  as "credit the treasury, then do what we did before".

So the gate B made non-optional is inherited unchanged in shape and widened in
scope: **one refund per order, in exactly one currency, with the allocation
emptied in the same step**, and a conservation test that drives every state the
ruling names, in both orders of operations.

### Where the money for a refund actually is, which is what bounds the ruling

Materials are just-in-time (ADR 0017 decision 7, ADR 0081,
`src/simulation/economy/just-in-time-materials.ts`), and that decides what a
cancellation can honestly hand back. Nothing records what a *single order* cost:
`procureForPendingOrders` (`just-in-time-materials.ts:606`) buys the
**deficit** — demand less stock less everything already in flight — so an order
placed against a full container costs nothing at all, and one placed against an
empty one costs the catalogue price. The money an order caused to leave the
treasury is therefore in one of exactly three places, and only two of them can
be given back:

1. **In a delivery still in flight.** `ProcurementSystem.cancel`
   (`src/simulation/economy/procurement.ts:419`) refunds the recorded
   `paidMinorUnits` exactly. This is real money and it is recoverable — and it
   is where the money is in the ordinary case, because a `PlaceBuildOrder`
   press buys at the press and the goods take `PROCUREMENT_DELIVERY_DELAY_TICKS`
   to land, so an order cancelled soon after it is placed has its money on the
   road.
2. **In the order's own `materialsAllocated`.** Goods `tryAllocate` withdrew
   from the container, owned by nothing but this order. Valuing them at the
   catalogue price and crediting that, without returning them, is an exact
   exchange under the conservation sum.
3. **In stock in the container.** The goods arrived, the order had not yet
   allocated them, and they belong to the prison rather than to the order. Here
   a refund can pay **nothing**: the plank is in the container, and paying for
   it as well is the one-press hazard above. A player who cancels in this window
   keeps the material and does not get the money, and that is a real asymmetry
   rather than an oversight — it is what "never both" costs. The window is one
   scheduled construction tick wide, because the next `update` allocates and
   moves the order to `assigned`.

**So a `planned` order refunds nothing, and that is arithmetic rather than
policy.** `pendingOrderDemand` (`system.ts:1827`) counts `approved` and
`materials-pending` only, so nothing is ever bought for a `planned` order; there
is no money to give back because none was spent. `submitOrder` writes `approved`
or `failed` and never leaves an order in `planned` (`system.ts:540-571`), so the
state is reachable only from a hand-written save.

### What ruling 20 does not decide, and is put to the owner rather than settled here

**`RemoveObject` on a completed object.** Decision B governs it, it is the one
part of B that never shipped, and ruling 20 says nothing about it. It is marked
**undecided** here rather than resolved, because three answers are now live and
the ruling does not choose between them:

1. **B as accepted:** the full materials come back.
2. **B in ruling 20's currency:** the money comes back instead of the materials.
3. **Nothing, on the second ruling's own logic:** a finished object is on the far
   side of `in-progress`, and if abandoning a half-built wall returns nothing at
   all then demolishing a finished one is the harder case to be generous to.

**The question is sharper than it looks, because ruling 20 as implemented makes
it pay to let the crew finish.** Cancel at `in-progress` and the materials are
gone; wait for `completed` and `Undo` returns them in full. That inversion did
not exist before — every state used to return the materials — and it is created
by the ruling rather than by this implementation, which is why it is reported
and not designed around. Whichever of the three the owner takes, the answer also
decides whether `Undo` of a `completed` order keeps returning materials or joins
the money rule.

**Decided by the repository owner, 2026-09-02: surplus stock can be sold back,
and the broad reading was taken with its cost in front of them.** The paragraph
that reserved the question is kept below rather than overwritten, because what
it reserved and *why* is the record of how the decision was reached.

> **Superseded 2026-09-02 by the owner's ruling; kept because it records why an
> agent could not take this.** *"Not decided either: whether surplus stock can
> be sold back. Case 3 above — the delivery landed, the order had not
> allocated, the player gets bricks rather than money — closes only if a prison
> can sell material back to the catalogue. That is a new economic surface and a
> price question (ADR 0017 decision 5 reserves prices with the rest of #29), so
> it is named and not taken."*

**What was signed, and what it costs, because the owner was shown the cost
before choosing.** They were offered three readings — a narrow sell-back
bounded by what *this order's demand* actually bought, the broad reading
bounded by the cancelled order's own requirement, and leaving the asymmetry
standing — together with the measurement that prices the broad one: **place a
wall against a shelf you already hold, cancel it, and 2 bricks become 80 minor
units; two commands, no clock wait, no crew, repeatable until the shelf is
empty.** They took **the broad reading**.

So this is a general material→money channel by construction, not by accident,
and two consequences follow that are recorded here rather than discovered
later:

1. **It dissolves ADR 0075's locked position for any prison holding bricks.**
   That position — a prison that cannot afford its first bed and cannot spend
   its way out — was the subject of ADR 0075, and a player holding material now
   has a route out of it. That is the point of the ruling rather than a side
   effect of it, but ADR 0075's own statement of the trap is now conditional on
   the prison holding nothing.
2. **The narrow reading was rejected for a reason worth keeping.** It would
   have needed per-order purchase provenance — a persisted field — against
   ruling 20's stated property that no save format moves. The broad reading
   needs none, and that asymmetry in cost is part of why it was chosen.

**Case 3 is closed by this ruling.** The window it describes still exists — a
delivery lands up to ten scheduled ticks before `tryAllocate` runs, which is
`ProcurementSystem`'s `intervalTicks: 1` against `ConstructionSystem`'s `10` —
but a cancellation inside it no longer strands the player, because the stock it
leaves can be turned back into money.

**What is still not decided is the price**, and it stays where ADR 0017
decision 5 put it: the sell-back settles at the catalogue price the stock was
bought at, and whether a prison should lose a margin on the round trip is a
balance question with the rest of #29. The mechanism takes no position on it.

### What this amendment costs, stated rather than argued away

- **The early game gets its pressure back, and then some.** Decision B's own
  Consequences accepted that dismantling becomes free and reversible. Ruling 20
  moves in the other direction for orders in flight: changing your mind after
  the crew has started now costs the whole of the materials, which is a stronger
  penalty than the pre-B behaviour ever had, and it is the owner's ruling
  knowingly.
- **A player-facing sentence becomes false.**
  `'hud.build.remove-hint'` (`src/content/default-locale-en.ts:2137`, re-anchored again 2026-09-16)
  promised
  *"One still being built is cancelled and its materials come back"*. Under
  ruling 20 the materials do not come back; money does, and only before the crew
  starts. **Re-anchored 2026-09-06 and converted to a quotation, per
  `docs/AGENT_WORKFLOW.md` §4: replacement copy has since been written — the
  key now reads `cancelled and refunds its money — but nothing comes back once
  the crew has started it. A finished one is not refunded.` (verbatim in
  `src/content/default-locale-en.ts`), and that file's own comment block
  (`:2114-2136`) carries the owner's account of the two days the sentence was
  false and the ruling 20 quotes that fixed it.**
  Replacement copy was **not written here** — `AGENTS.md`'s fourth
  exclusion reserves it — and the string is reported to the owner with the
  branch.
- **`docs/OPERATIONS.md`'s justification for the `release` seam narrows.** It
  argues that *"against a finite stock a cancelled order that had already
  allocated would destroy its materials permanently"*. That stays exactly true
  as a statement about a `completed` order and about the seam itself, and stops
  being the whole story for the states ruling 20 covers: an `assigned` order's
  materials are now converted to money rather than returned, and an
  `in-progress` order's really are destroyed, deliberately.
- **A fourth thing credits the treasury.**
  `docs/HUD_PROJECTIONS.md` gap 21 enumerates the three that do, and
  `tests/foundation/documentation-claims-contract.test.ts` pins the
  enumeration. A build-order refund is a fourth, it is not an income line, and
  like `ProcurementSystem.cancel` it is a refund of the prison's own money
  rather than an inflow ADR 0075 decision 2 diverts to a loan.
- **No save format moves.** The refund is computed from `materialsAllocated`,
  the order book and the pending deliveries, all three of which the save already
  carries. No field is added to `BuildOrder`.
- **A determinism fingerprint moves for any prison that cancels an order**, for
  the reason the Consequences above give for B: the balance and the stock a
  fingerprint hashes both change. A prison that never cancels is unaffected.

### The gate

`tests/integration/economy-money-conservation.test.ts` is the file decision B
named and this amendment inherits it. It has to drive a cancellation in every
one of the five states ruling 20 names, in both orders of operations, and assert
the treasury and the stock **together**. Its invariant needs one honest change
and no weakening: value is no longer conserved absolutely, because `in-progress`
consumes it on purpose, so the sum is conserved against a separately derived
total of what was deliberately consumed — derived from the buildable catalogue
and the procurement catalogue, never from the code under test.

## Amendment, 2026-09-01: taking a finished object away returns nothing

**Accepted, 2026-09-01, by the repository owner** -- and the widening below was
put to them explicitly and accepted with it: **a finished wall goes the same
way as a finished bed.** The ruling says *"a finished object"*, this
implementation reads that as *"a completed order"*, and the owner was asked
whether that was meant. It was: the inversion is identical for a wall, and
branching on `placesObjectId` would have reintroduced *"the two commands
disagree"* as *"the two buildables disagree"*.

Drafted 2026-09-01 against `0a53ec70` (v0.0.314), with its implementation on
the same branch so that what was being signed could be seen running. **This
clause read `Proposed amendment, not self-approved -- awaiting the owner's
signature` and carried the sentence "It must not merge before the signature"
until that acceptance**; both are kept rather than deleted, because the ruling
quoted below was always the owner's while *everything this amendment derives
from it* was not, and the acceptance step is what makes the derivation the
repository's rather than its author's. The amendment above this one was under
exactly the same condition for one day and its Status clause records what that
read like.

### The source: the owner's ruling of 2026-09-01

> **Taking a finished object away returns nothing. Not its materials, not its
> money.**

**This reverses decision B, which the same owner accepted on 2026-08-29 knowing
its cost.** B says *"A finished object un-builds into its full materials, by
either route"*, and B's own text records that *"dismantling becomes free and
perfectly reversible... that is a real change to how the first hour plays and it
was chosen knowingly."* Nothing here says B was decided badly. What changed is
the arithmetic B was decided inside, and the change is one this document
predicted in writing before the owner saw it.

### The inversion this closes, which is why the owner was asked again

The amendment above -- ruling 20, merged today as
[#746](https://github.com/matmaxalez/lockstate/pull/746) -- reported it under
*"What ruling 20 does not decide"*, in these words:

> **The question is sharper than it looks, because ruling 20 as implemented
> makes it pay to let the crew finish.** Cancel at `in-progress` and the
> materials are gone; wait for `completed` and `Undo` returns them in full. That
> inversion did not exist before -- every state used to return the materials --
> and it is created by the ruling rather than by this implementation, which is
> why it is reported and not designed around.

Measured on `0a53ec70`, one prison, one plank at 65, through the real kernel and
the real command router:

```
                             balance  plank in stock  order state  materialsAllocated       objects standing
after the bed is built         24935               0  completed    [wood-plank x1]                         1
after RemoveObject             24935               0  completed    [wood-plank x1]                         0
after Undo                     24935               1  cancelled    []                                      0
```

and, for the same press on the state one earlier, from the case
`gives nothing back for an in-progress order, and the materials are gone for
good` in `tests/integration/economy-money-conservation.test.ts`: the allocation
is dropped unreleased and unpaid, and the balance stays down by the whole of it.

So a player who changes their mind **early** loses everything and a player who
waits for the crew to finish loses nothing. The owner was shown that and chose
to close it from this end rather than by reopening ruling 20. The third of the
three answers that amendment listed is the one taken:

> 3. **Nothing, on the second ruling's own logic:** a finished object is on the
>    far side of `in-progress`, and if abandoning a half-built wall returns
>    nothing at all then demolishing a finished one is the harder case to be
>    generous to.

### What of decision B is superseded, and what survives -- and the answer to "is anything left"

Decision B is one sentence about a finished object, one premise about how
cancellation already works, one flag about salvage and one hazard. **Ruling 20
took the premise. This takes the sentence.** Taken together:

**Superseded -- B's sentence, entirely, in both currencies.** *"A finished
object un-builds into its full materials, by either route"* is withdrawn, and so
is the paragraph under it: `RemoveObject` on a completed order does not return
everything the order consumed, and `Undo` stops doing so as well. The money
reading -- answer 2 of the three the amendment above listed -- is refused with
it: nothing comes back in either currency.

**Achieved, from the other side -- B's goal.** B wanted *"the two commands stop
disagreeing"*, and after this they do not disagree: both return nothing. B added
*"and they agree on the generous answer"*, and that clause is the part that
goes. This is worth stating rather than filing under the supersession, because
the defect B was fixing -- one gesture paying and its twin not -- is fixed, and
a reader who takes B as wholly abandoned would think it was still open.

**Un-superseded -- B's supersession of ADR 0017.** B recorded that it
*"supersedes, for object removal, the expectation ADR 0017's consequences
recorded"* -- that #99's dismantle-to-salvage would return a built object's value
*"as carried salvage, not as cash"*. That supersession is withdrawn with the
sentence it belonged to. ADR 0017's expectation stands again, unchanged and
unmet: a built object's value returns as **nothing at all today**, and salvage
remains the open mechanic it was before B. B's warning to whoever implements #99
-- *"a salvage route that also refunds would refund twice"* -- is no longer live
in this direction, because there is now no refund for a salvage route to be
doubled against; the remaining reading of it is the ordinary one, that #99 must
not pay twice for its own carry.

**Survives, and is the reason this section is long -- B's hazard and B's gate.**
Both are in force, and neither was ever a decision about materials; see the two
sections below.

**So: is anything of decision B left?** *Nothing that B decided.* Its premise
went on 2026-08-31 and its sentence goes here, and after both, decision B
decides nothing about a finished object that this document still holds. What
remains under B's heading is the material that was never a decision -- the
hazard it named, the gate it made non-optional, and a flag about a future issue
that this amendment hands back to ADR 0017. **Decision B is spent, and the
heading is kept because the reasoning under it is what produced two rulings.**
A future reader should not go looking for the surviving half; there is not one.

### `Undo` on a completed order, which is the route the inversion actually used

This is the other half of B's *"by either route"* and it is the half that
matters, because it is the press a player can actually reach. **The Build
panel's queue cannot aim `CancelBuildOrder` at a finished order**:
`PENDING_BUILD_ORDER_STATES` in
`src/simulation/presentation/construction-projection.ts` excludes `'completed'`
deliberately -- *"a queue that listed standing walls would be a demolition list
wearing a queue's label"* -- so the only two presses that reach a completed
order are **`Undo`** (`KeyZ`) and **`RemoveObject`** (the *Remove* tool). The
measurement above used `Undo`, and so does the recycling loop
`tests/integration/economy-bed-recycling.test.ts` drives.

**`Undo` on a completed order returns nothing, and still takes the thing down.**
Reversing the geometry is not the refund and must not go with it:
`ConstructionSystem.cancelOrder` (`src/simulation/construction/system.ts:1004`)
calls `revertConstruction` (`system.ts:1966`) for a `completed` order, which
un-writes a wall's edge value and, for an object buildable, calls
`ObjectPlacementService.onOrderReverted`
(`src/simulation/objects/object-placement-service.ts:839`). All of that stays.
`isCancellable` (`system.ts:55`) keeps `'completed'` in the set for the reason
it always gave -- *"a finished wall that could not be taken down would be
permanent the moment it was placed"* -- and `undo()` (`system.ts:797`) keeps
delegating to `cancelOrder` at `system.ts:826` so that the undo stack does not
become a lie. **What changes is one branch**: the `hadGeometry` arm at
`system.ts:1046` stops calling `this.materialsProvider.release(allocated)`, and
`refundSurplusOf` (`system.ts:1120`) keeps returning early for `'completed'` as
it already does. The allocation is still emptied at `system.ts:1020`, and it is
emptied into nothing.

**`Redo` then rebuilds and pays again, and that is arithmetic rather than a
second decision.** `redo()` (`system.ts:848`) returns a cancelled order to
`'approved'` and does not restore its allocation, so the order becomes demand
again and the just-in-time pass buys its materials a second time. Under B an
undo/redo pair was free, because the undo handed the bricks back and the redo
spent the same ones. Under this ruling the pair costs one order's materials.
Nothing new is wired for that; it is what "returns nothing" means once the same
wall is asked for again.

**A finished *wall* and a finished *door* go the same way, and this is the one
place the amendment reads the ruling wider than its words.** The ruling says
*object*; the mechanism is `cancelOrder` on a `completed` order, which does not
distinguish a bed from a wall, and **the inversion is identical for a wall** --
abandon a half-built wall and the bricks are gone, wait ten ticks and `Undo`
hands them all back. Splitting the rule by buildable kind would close the
inversion for beds, leave it open for the buildable a player draws most, and
reintroduce *"two commands disagree"* one level down as *"two buildables
disagree"*. So it is read as **"a completed order returns nothing"**. It is
flagged here rather than buried because it is the widest thing in this document
and the signature covers it: **undoing a wall run that has already been built
now destroys its bricks.** Undoing one that has not been built yet is ruling
20's business and is unchanged -- money back while the crew has not started,
nothing once it has.

### B's hazard in the new arithmetic: returning nothing cannot double-refund, checked rather than assumed

B put the hazard this way, and ruling 20 inherited it with *materials* replaced
by *money*:

> A refund added to `RemoveObject` that leaves `materialsAllocated` populated is
> refunded **a second time** by a subsequent `Undo` -- value created from
> nothing [...] So this decision is not "add a release call to `RemoveObject`":
> it is **one refund per order, whichever command triggers it, with the
> allocation emptied in the same step**.

**Returning nothing looks like it cannot double-refund. It cannot, and the
reason is structural rather than incidental**, which is the difference between
checking and assuming. Three facts establish it, each grepped on `0a53ec70`:

1. **There are exactly two writes to `materialsAllocated` in `src/`**, and
   `grep -rn "materialsAllocated" src/` outside the comments returns only them
   plus the two copies that snapshot and restore make. They are
   `system.ts:1105`, which fills the field from the buildable catalogue at
   allocation, and `system.ts:669`, which empties it -- unconditionally, inside
   `cancelOrder`, before any branch decides what to do with what it held.
   Nothing else in the repository can put materials back into that field or take
   them out of it.

   > **The three facts in this list carry their own commit stamp — *"each
   > grepped on `0a53ec70`"* — so their anchors are left where they point and
   > are counted as dated rather than re-aimed (checked 2026-09-16,
   > `e044a3e8`).** That is the citation form
   > [#1231](https://github.com/woogitsu/lockstate/pull/1231) recommends in
   > place of a document-wide pin, and it is the only stamped region in this
   > file. **The claim they establish still holds on the current tree**, at
   > moved coordinates: the two writes are `system.ts:1708` (fills, at the
   > `materials-pending` → `assigned` transition) and `system.ts:1020`
   > (empties, inside `cancelOrder`), plus the snapshot and restore copies at
   > `system.ts:2060` and `system.ts:2128` that this list already excludes.
2. **Every refund site reads that field or a delivery, and the `completed`
   branch now reads neither.** The material route is
   `this.materialsProvider.release(...)` at `system.ts:674`; the money route for
   an allocation is `refundAllocatedMaterials`, on the branch below it; the
   money route for a delivery is `refundSurplusOf` (`system.ts:727`), which
   returns early for every state except `'approved'` and `'materials-pending'`
   and therefore has never run for a completed order. After this change the
   `completed` arm calls none of the three.
3. **`cancelOrder` cannot run twice on one order**, so "the second press" the
   hazard is about does not exist. `'cancelled'` is terminal
   (`isCancellable`, `system.ts:48`), the second call throws, and every caller
   is already shaped for it: `undo()` skips a non-cancellable order
   (`system.ts:549`), `createConstructionCommandHandler` swallows the throw
   (`src/simulation/construction/handler.ts:97`),
   `withdrawOrdersAwaitingMaterial` only ever picks `'approved'` and
   `'materials-pending'` candidates (`system.ts:866`), and
   `ObjectPlacementService.remove` reaches `cancelOrder` only through
   `ordersBuildingObjects`, which excludes `'completed'` by construction
   (`object-placement-service.ts:787`).

**The inverse hazard is the one that is real, and it is created by this ruling
rather than by its implementation.** Value can no longer be created; it can now
be *destroyed without the books recording it*. `RemoveObject` on a standing
object (`object-placement-service.ts:646`) takes the object out of
`PlacedObjectRegistry` at `object-placement-service.ts:651` and **never touches the order**: the order
stays `completed` and keeps a populated `materialsAllocated` for the rest of the
session. Today that record is honest, because the plank really is still
recoverable -- the measurement at the top of this amendment is exactly that,
`Undo` handing back a plank after the bed it became had already gone. Under this
ruling it stops being recoverable, and a standing `materialsAllocated` on a
completed order whose object has been removed becomes a record of materials that
will never come back.

Nothing in `src/` reads that field except `cancelOrder`, the snapshot and the
save schema, so **in production it is inert**. Where it is not inert is the
gate: `tests/integration/economy-money-conservation.test.ts` values a live
order's allocation as prison value, on the argument that *"`ConstructionSystem`
withdraws on allocation and only re-deposits on cancellation, so between those
two points the bricks are in neither the treasury nor a container and are owned
all the same."* That argument is what this ruling breaks, and the fix is in the
valuation rather than in production code -- see the gate below. **The production
change this amendment asks for is one branch and nothing else**; adding an
allocation-clearing call to `RemoveObject` was considered and refused, because
it is a second write to the field named in point 1 above, it buys correctness in
a field nothing reads, and the honest place for the correction is the ledger
that was making the claim.

### The gate

`tests/integration/economy-money-conservation.test.ts` is the file decision B
named, ruling 20 inherited and this amendment inherits again. It is **not
optional** and it needs one honest change and no weakening.

**What the valuation has to stop saying.** Under B, a completed order's
allocation was liquid: one press turned it back into stock, so counting it as
prison value was exact. Under this ruling it is not liquid and never will be, so
the term has to change from *"materials this order is holding"* to *"the thing
this order built, while it is still standing"*:

- an order that has **not** completed contributes its allocation, exactly as
  today -- that is the crew's hands, and `in-progress`'s deliberate consumption
  is measured off it;
- an order that **has** completed contributes the catalogue value of what it
  built, for as long as that thing exists -- an edge buildable while the order
  reads `'completed'`, an object buildable while its object is in
  `PlacedObjectRegistry`;
- the value of what was built is derived from `BUILDABLE_REGISTRY`'s
  `materialsRequired` and the procurement catalogue's prices, **not** from
  `materialsAllocated`, so the check no longer reads its answer off the record
  the code under test writes (`docs/TESTING.md`).

Nothing moves at completion: the allocation term falls by the order's materials
and the standing term rises by the same figure, both derived from the same
catalogue. What moves is destruction, and there are exactly two destruction
sites in the repository -- `object-placement-service.ts:651` (the *Remove*
press) and `object-placement-service.ts:839` (`onOrderReverted`, reached only
from `cancelOrder`) -- plus the edge un-write in `revertConstruction`. Each
must be met by an explicit *deliberately consumed* term raised **by the test
from the catalogue before the press**, exactly as ruling 20's `in-progress` case
already does.

**Both ways round, as B required.** `Remove` -> `Undo` and `Undo` -> `Remove`,
and the second press of each pair must be measured to return nothing rather than
assumed to. `Remove` -> `Undo` is the sequence the measurement at the top of this
amendment shows paying a plank today; it is the case this ruling exists to
change, and it is the case that will go red first.

**Three assertions in other files have to be rewritten by hand, and that is
correct**, for the reason decision B's own Consequences give: *"it must not be
possible to change this behaviour without editing the sentences that promised
the old one."* The sentences are named in the branch's report rather than here,
because a list of test names in an ADR rots on the first rename.

### What this amendment costs, stated as plainly as B stated the cost it accepted

- **A misplaced bed is a permanent loss.** This is the whole of it and it is the
  sentence to read twice. Under B a bed put in the wrong cell cost the crew's
  time and nothing else; under this ruling the plank is gone and the next bed
  needs another 65. There is no gesture, in any order, that gets it back.
- **The early-game pressure B removed comes back, and B's own words are the
  measure of it.** B accepted that *"dismantling becomes free and perfectly
  reversible: a wall can be taken down and re-sited at no material cost, a
  misplaced bed costs nothing but the crew's time, and the early-game pressure
  that came from materials being spent irreversibly goes."* Every clause of that
  is reversed here. Materials are spent irreversibly again, and with ruling 20
  in front of it the first hour is now stricter than it was before **either**
  amendment: before B, cancelling in any state returned the materials; now four
  states return money, one returns nothing, and the sixth returns nothing.
- **Undo stops being free, which is the change a player will feel first.** Not
  the bed -- the wall run. Drawing a wall and pressing `KeyZ` before the crew
  reaches it is unchanged; pressing it after they have finished now costs the
  bricks. Whether that is the game the owner wants is the substance of the
  signature, and it is not a question the tests can answer.
- **The bed-recycling loop closes for materials as well as for income.**
  ADR 0076 decision A(ii) already stopped the recycled cell earning anything;
  this stops the plank coming back at all, so the loop
  `tests/integration/economy-bed-recycling.test.ts` measures costs a plank per
  turn and is no longer a loop. That is a benefit and it is recorded here as one
  rather than argued as a justification -- the reason for the ruling is the
  inversion, not the exploit.
- **A player-facing sentence gets *more* true, and none gets less.**
  `'hud.build.remove-hint'` (`src/content/default-locale-en.ts:2137`) already
  reads *"a finished one is not refunded"*, which this makes true of every route
  rather than of one. The half of that string ruling 20 falsified --
  *"One still being built is cancelled and its materials come back"* -- is
  untouched by this amendment and is still false and still the owner's; it is
  reported again with this branch rather than rewritten, under `AGENTS.md`'s
  fourth exclusion. **No new string is added and none is edited.**

  > **THIS DOCUMENT CONTRADICTS ITSELF HERE, AND THE OTHER HALF OF THE
  > CONTRADICTION IS ALREADY IN IT (found 2026-09-16, `e044a3e8`, by reading
  > this file's own sections against each other rather than by any diff).**
  > *"Is untouched by this amendment and is still false and still the owner's"*
  > was true when written. The section *"What this amendment costs"* above
  > records the repair — **"Re-anchored 2026-09-06 and converted to a
  > quotation … replacement copy has since been written"** — and this bullet
  > was never amended with it. The key reads, verbatim at
  > `src/content/default-locale-en.ts:2137`: *"Press any tile of an object, or
  > a finished wall, to take it away. One still being built is cancelled and
  > refunds its money — but nothing comes back once the crew has started it. A
  > finished one is not refunded."* **There is no false half left in that
  > string**, so the sentence this bullet hands to the owner asks them to rule
  > on copy that no longer exists. Both halves are kept rather than merged,
  > per `docs/AGENT_WORKFLOW.md` §4: a correction that erases what it corrects
  > is no more durable than the claim it replaced, and this is a correction
  > that had already been written one section up and did not travel.
- **No save format moves.** No field is added to `BuildOrder`, and the one field
  involved is already persisted and already validated
  (`src/persistence/save-schema.ts:223`). A save written before this change
  restores into it unchanged: a completed order carrying an allocation simply
  never gives it back.
- **A determinism fingerprint moves for any prison that takes a finished thing
  down**, for the reason B and ruling 20 both give -- the stock a fingerprint
  hashes changes. A prison that never removes a finished object and never undoes
  a completed order is unaffected, which is the property to check before
  extending any pinned list.
- **`docs/OPERATIONS.md`'s justification for the `release` seam narrows again,
  to nothing.** It argues that *"against a finite stock a cancelled order that
  had already allocated would destroy its materials permanently"*. Ruling 20
  left that true *"as a statement about a `completed` order and about the seam
  itself"*. After this, it is true of the seam only: no cancellable state
  releases an allocation into the container any more. The seam still exists and
  is still exercised -- `UNLIMITED_MATERIALS_PROVIDER` and a bare
  `ConstructionSystem` with no procurement sink still release, because a system
  with no treasury behind it cannot pay anybody -- but the sentence's example is
  gone. Named here rather than edited, because that file is documentation the
  branch touching this behaviour should correct with the numbers in front of it.

### What would change my mind

The weakest claim here is the wall. Reading *"a finished object"* as *"a
completed order"* is an inference from the mechanism and from the inversion
being identical, and it is the one place where the implementation is wider than
the words the owner used. **If the owner meant beds and not walls, the branch is
a one-line change** -- the `hadGeometry` arm would test
`definition.placesObjectId !== undefined` instead of running for every completed
order -- and the cost of getting it wrong in that direction is that the
commonest build gesture in the game gets more expensive without anybody having
asked for it. It is put here as the question the signature answers rather than
resolved by argument.

The second weakest is the claim that the standing `materialsAllocated` on a
removed object's completed order is inert in production. It rests on a grep
(`materialsAllocated` has three readers in `src/`: `cancelOrder`, `snapshot` and
the save schema) and on nothing else. A future consumer that valued the order
book -- a net-worth readout, a demolition estimate, an insolvency measure -- would
read a plank that does not exist, and the cheapest thing that would change my
mind is such a consumer being proposed.
