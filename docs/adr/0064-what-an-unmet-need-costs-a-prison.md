# ADR 0064: What an unmet need costs a prison

- Status: Proposed, 2026-08-28 — answers issue #477 and the second half of issue #443. Related: #29, #31, #80, #442, [ADR 0017](./0017-money-primary-resource-model.md) decision 6, [ADR 0048](./0048-what-a-sectors-occupants-are.md), [ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md), [ADR 0054](./0054-what-a-prisoners-day-is-made-of-when-the-prison-is-empty.md), [ADR 0061](./0061-what-the-prison-produces-on-its-own.md).
- **The number is provisional.** If it collides, this file, its row in `docs/adr/README.md` and every citation of it are renumbered together.

## Context

### What #443 got right, and the two halves of it that are stale

#443's title says the simulation has exactly two debits and both are one-off,
and that five of six needs have no downstream reader. Measured against `main` at
`07add3e`, **both halves of that sentence are now wrong, and for different
reasons.**

- **The debits.** `PayrollSystem` landed with #455: a recurring, undeclinable
  `Treasury.spend` with arrears ([ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md)).
  The treasury has not been monotone since.
- **The readers.** [ADR 0048](./0048-what-a-sectors-occupants-are.md) decision 2
  made `SectorRiskSample.needsPressure` the mean deficit over all of `NEED_IDS`
  rather than the `safety` deficit alone
  (`src/simulation/runtime/new-session.ts`, `needDeficitOf`), and
  [ADR 0061](./0061-what-the-prison-produces-on-its-own.md) decision 3 gave one
  need a *per-prisoner* reader — `scoreAssaultPressure`'s `needDeficit`, at
  weight 1. Every need has had a reader since.

### The defect that survives both, which is #477's

The readers exist and **none of them can charge a prison that hires one guard.**
Reproduced on `07add3e` before anything was changed: eight prisoners, eight
furnished cells, no shower room and no yard.

| guards | peak sector risk | riots | incidents of any type | treasury after ten days |
| --- | --- | --- | --- | --- |
| 1 | 0.4824 | 0 | **0** | 42,320 — *identical to the same prison with both rooms built* |
| 0 | 0.7981 | 3 | 5 | 43,120 |

`hotThreshold` is 0.65. The assault trigger does not close the gap either:
[ADR 0061](./0061-what-the-prison-produces-on-its-own.md)'s own ladder puts a
housed, contraband-free prisoner in a staffed prison at 0.48 against a threshold
of 0.65, and contraband is structurally zero unless a tier-3 prisoner brings it
in. So the honest statement of the defect is not "the needs have no reader" but
**"every reader is deaf to a prison that is merely staffed"** — and a need that
only falls and never bites is a counter behind glass.

**The window in that table is ten in-game days, not twenty.** The fixture
(`tests/integration/room-gated-needs.test.ts`) runs 24,000 ticks and
`DAY_LENGTH_TICKS` is 2,400. Issue #477, this repository's `sector-risk.ts`,
`docs/PRISONER_OPERATIONS.md`, ADR 0059's speed ladder and ADR 0061's opening
measurement all said twenty; the documents are corrected by #443's branch and
the issue by its author. Recorded here so the next reader does not re-import the
error from the issue text.

### The decision that is actually open

Not *whether* neglect should cost something — #443 and #477 both say it should.
**Where the cost belongs.**

## Decision

**The state's operating grant becomes conditional on the conditions each
prisoner is held in, evaluated per occupied place.**

1. `StateIncomeSystem` still pays per occupied place per in-game day, at the end
   of the day, holding no state. [ADR 0017](./0017-money-primary-resource-model.md)
   decision 6's *model* is untouched; what changes is that a place is no longer
   worth a flat rate.
2. One place pays `stateIncomeForPrisonerDay(unmetNeeds)` =
   `max(0, 300 − 40 × unmetNeeds)`, where `unmetNeeds` counts how many of that
   place's occupant's six needs stand at or below **51** — a fifth of
   `NEED_MAX`. The schedule is `300, 260, 220, 180, 140, 100, 60`.
3. A day's income is the **sum** of those terms over the residency claims
   `RoomInstanceRegistry` holds, ascending by entity id. Never a mean.
4. The "earned today" readout (`projectStatusStrip`) is derived from the same
   walk.
5. Nothing else moves: `DEFAULT_SECTOR_RISK_POLICY` is not retuned, no incident
   type is added, no RNG stream is taken, no state is added, and
   `SAVE_SCHEMA_VERSION` stays at 4.

### Amendment, 2026-09-03: the owner suspended the withheld share at zero

**This records the repository owner's own ruling, dated, in their words. It is
not a recommendation of this repository's and it was not self-approved** — per
`docs/AGENT_WORKFLOW.md` §3, an implementing agent does not approve its own
work, and this section exists because the decision was the owner's to take.
**Nothing in this ADR's `Status` moves and no word of decisions 1 to 5 above is
edited**: they are quoted below rather than rewritten, because what the owner
suspended is a *rate*, and a reader restoring it needs the decision exactly as
it was taken.

#### What was put to the owner, and what they answered

They were shown the shipped mechanic measured in play: the grant pays 300 per
prisoner-day and withholds 40 for every unmet need, so a fully served prisoner
is worth **five times** a neglected one, and in a measured twenty-day run a
prison took **1,196 a day where 2,700–3,600 was available** — roughly two
thirds of the grant withheld daily, with **nothing on screen saying so**. They
were offered four ways to surface it. They chose none of them and ruled
instead:

> usuń na razie kary, zobaczymy jak pogram i ocenię łatwość

("remove the penalties for now, we'll see how it plays and I'll judge the
ease.")

#### What that suspends, quoted rather than overwritten

Decision 2 above reads:

> One place pays `stateIncomeForPrisonerDay(unmetNeeds)` =
> `max(0, 300 − 40 × unmetNeeds)`, where `unmetNeeds` counts how many of that
> place's occupant's six needs stand at or below **51** — a fifth of
> `NEED_MAX`. The schedule is `300, 260, 220, 180, 140, 100, 60`.

**The `40` in that sentence is `0` while the owner plays**, so the schedule is
`300, 300, 300, 300, 300, 300, 300` and an unmet need costs a prison nothing.
The line that made it so was
`export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;`, with the
ruling and the owner's words recorded in that constant's own docblock.

> **That line is no longer in the file, and this paragraph is kept as it stood
> rather than rewritten** (`docs/AGENT_WORKFLOW.md` §4: mark both directions).
> The owner restored the withheld share on 2026-09-04 — see *"Amendment,
> 2026-09-04"* below, which carries the current line verbatim. Its attribution
> was removed from the sentence above for one mechanical reason worth stating:
> `tests/foundation/adr-quotation-verbatim-contract.test.ts` binds every
> `(verbatim in …)` quotation to the file it names, and it went red on this
> sentence the moment the constant moved. That gate is what discovered this
> paragraph, which is the thing it was built to do.

Everything else decisions 1 to 5 settle is **untouched and still in force**: the
grant is still paid per occupied place per in-game day holding no state (1); a
day's income is still the sum of per-place terms and never a mean (3); the
"earned today" readout is still derived from the same walk (4); and nothing
retunes the risk policy, adds an incident type, takes an RNG stream, adds state
or moves `SAVE_SCHEMA_VERSION` (5). `STATE_INCOME_UNMET_NEED_LEVEL` (51) is
**not** suspended — it still decides which needs count as unmet, which is what
the projected flag on the Regime panel's need bar reports and what the money
will be priced from again when the rate returns.

#### Why "na razie" is load-bearing, and what keeps the mechanic from rotting

**"na razie" means "for now".** The ruling is an experiment the owner runs while
playing and judging difficulty, not a withdrawal of this decision, so the
mechanic is switched off rather than removed:

- The constant, every reader of it, and `stateIncomeForPrisonerDay`'s formula
  all stay. **Restoring the mechanic is one number.**
- The schedule is still gated. `stateIncomeForPrisonerDayAt` takes the withheld
  rate as an argument, and `tests/unit/economy-state-income.test.ts` drives it
  at `40`, at the shipped constant, and at a rate high enough that decision 2's
  `max(0, …)` clamp actually binds — a case no shipped rate has ever made
  observable. Deleting the withheld term as dead arithmetic turns eight
  assertions red across five test files, measured.
- Every driven measurement this ADR rests on is re-run at `40` rather than
  deleted: `tests/integration/needs-state-grant-loop.test.ts` still prices its
  ten measured days into 20,800 and still prices the two rooms at 3,200, off
  the same measured unmet-need series.

### Amendment, 2026-09-04: the owner restored the withheld share to 40

**This records the repository owner's own ruling, dated. It is not a
recommendation of this repository's and it was not self-approved** — the same
terms the 2026-09-03 amendment above was recorded under, and for the same
reason (`docs/AGENT_WORKFLOW.md` §3). **Nothing in this ADR's `Status` moves
and no word of decisions 1 to 5 is edited**; the 2026-09-03 amendment is left
standing in full, because a suspension that ended is part of how this decision
got to where it is.

Decision 2's schedule is in force as written: one place pays
`max(0, 300 − 40 × unmetNeeds)`, the schedule is `300, 260, 220, 180, 140, 100,
60`, and the line that makes it so is
`export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40;`
(verbatim in `src/simulation/economy/income.ts`).

#### The ruling, and the condition it carried

The suspension was *"na razie"* — for now — and the owner attached a
measurement to lifting it. Asked on 2026-09-04 whether the prison should ever
be allowed to be in trouble, they ruled:

> Zmierzcie to najpierw

("Measure it first.") Shown the four-prisoner measurement that produced, they
ruled the constant back to `40` **on condition that a fifty-prisoner prison was
measured first**. Both measurements now exist —
`2026-09-04-what-pressure-there-is.md` and
`2026-09-04-what-pressure-there-is-at-fifty.md` in `docs/research/`, named
without a rooted path because both branches are unmerged and
`tests/foundation/documentation-links-contract.test.ts` fails on a dangling
link — so this amendment is that ruling carried out and not a proposal.

**Unlike the 2026-09-03 ruling, this one was made by choosing a presented
option rather than in the owner's own words.** There is therefore no verbatim
quotation of it to set beside *"usuń na razie kary"* above, and none is
invented. What is recorded instead is the condition, the two measurements that
satisfied it, and the fact that the choice was the owner's.

#### What the measurements said, including where they disagree

- At **four** prisoners the restored penalty cuts the daily gain by **71%**:
  the same prison, five of six needs unmet on every prisoner, is paid 1,200 a
  day at `0` and 400 a day at `40`. The treasury still rises, at +320 against
  +1,120.
- At **fifty** it cuts it by **27.7%** — +14,440 a day becomes +10,440 —
  because a prison built to the limit of the reachable map settles at **two**
  unmet needs rather than five, so decision 2's schedule prices a place at 220
  rather than 100.
- Break-even, measured one hire at a time rather than divided, moves from
  **187 → 188** guards to **137 → 138**; headroom over the `ceil(n / 8)` the
  game asks for falls from **26.7×** to **19.6×**.
- **The fifty-prisoner figures are the pessimistic end of a range**, and that
  note says so itself: neither instrument ever builds a door, and #938's fix
  (`tests/integration/dead-room-no-doorway.test.ts`) measures that a sealed
  room with no doorway is dead — `hygiene` 254.8/255 with a door, **0**
  without. The two needs priced at fifty are `hygiene` and `recreation`, which
  is that signature; a door can only *reduce* the unmet count, so a prison with
  one earns more than 11,000 a day and breaks even above 137 guards.

#### What this does not settle, and what it contradicts

Open question 1 — *"Should the withheld share be steeper?"* — is **still
open**, and the prior question the 2026-09-03 amendment put in front of it
(*whether the share should be anything at all*) is now answered: it should.
Neither is answered by anything in this repository; both are the owner's.

**One argument this decision rests on is now measured false at fifty
prisoners**, and it is recorded here rather than quietly dropped. The withheld
share is per *need* so that the player is paid for each thing they fix, and the
cheapest such fix was an 8×8 `room.yard`, which requires no object. At four
prisoners that paid exactly `4 × 40 = 160` a day, measured. At fifty the same
zoning returned **nothing**: `recreation` read 0 permille and unmet for 50 of
50, and no prisoner performed `action.yard-recreation` at all. Capacity is
ruled out as a sufficient cause; reachability is the strongest candidate and is
untested for `recreation`. **That is a separate finding and is not fixed by
this amendment** — restoring the rate does not by itself make the incentive
work at scale.

#### This ADR predicted this ruling, which is the reason to record it here

"What would change my mind" already reads:

> **The owner deciding the readout cannot be built.** A consequence a player
> cannot understand is a worse game than no consequence, and I would rather
> this were reverted than shipped permanently unexplained.

The owner was offered the readout in four shapes and took none of them. So this
is that falsifier arriving, and the response is the weaker of the two it names:
**suspended pending play, not reverted.** Open question 1 above — *"Should the
withheld share be steeper?"* — now has a prior question in front of it, and it
is the one the owner has taken for themselves: whether the share should be
anything at all. **That question is theirs and is not answered here.**

### The property that decided it: there is no new promise to make

**"Earned today" is already on the status strip.** It is an existing, shipped,
player-visible figure beside the balance
(`src/simulation/presentation/status-strip-projection.ts`, `src/ui/hud/messages.ts`).
So a player who never builds a shower room watches that number fall, on the day
`hygiene` crosses the line, with no new locale key, no new panel and no new
statement to the player at all.

That is not a convenience, it is what makes this change one an agent may make.
`AGENTS.md` reserves to the owner *"anything that reaches a player as a promise
the code does not keep"* — and this mechanic engages that rule from the opposite
side to the obvious one. The hazard was never that the consequence needed a new
readout; it was that **leaving `projectStatusStrip` deriving the chip from
`totalOccupancy` and the flat rate would have turned an existing true readout
into a false one**, promising money the day boundary then declines to pay.
Moving the projection onto the same walk was therefore not an enhancement but
the repair that keeps the exclusion satisfied *by construction*, rather than
something needing the owner's permission. Every rejected alternative below would
have required a genuinely new player-facing surface, and would have needed to be
asked for.

### Why the alternatives are wrong here, not merely unchosen

Each of these is a real argument that will be re-proposed by somebody who has
not read this, so each is argued rather than listed.

**1. Retune the risk model** — #477's own option 1: raise `needsPressureWeight`
or lower `hotThreshold` until two floored needs can riot a staffed prison.

Wrong twice over. First, on what the mechanic would *be*: a riot fires **zero**
times in the prison under discussion and three times in ten days in the prison
next to it, so a consequence expressed only through riots says nothing at all
for days at a stretch and then says everything at once. A player learns nothing
between events, which is the difference between a system and a jump scare.

Second, and decisively, **it would destroy the measurement #477 exists to
present.** `tests/integration/room-gated-needs.test.ts` pins the 0.4824 / 0.7981
split precisely so that a change to `DEFAULT_SECTOR_RISK_POLICY` has to be
argued in the open. **This is the second time the same trap has been declined,
and the pattern is the point.**
[ADR 0061](./0061-what-the-prison-produces-on-its-own.md) refused to feed
`contrabandPressure` into `scoreSectorRisk` for exactly this reason — it moved
the staffed row from 0.4824 to ~0.60 — and reached for a separate producer
instead. The same argument forbids reaching for `needsPressureWeight` here. A
score that absorbs every new pressure stops being a measurement of anything.

**2. Add a fourth incident type driven by unmet needs.**

Wrong on ADR 0061's own measurement, not on taste. That ADR records what
happened when a new per-prisoner producer shared the sector score's weights and
threshold: *"with the same weights and the same line, the assault front-ran the
riot everywhere"* — any prison whose mean is hot has individuals who are hot,
the riot needs twelve consecutive hot samples and the assault needs none, so the
assault took the sector's one open incident slot every time, at tick 13,250 in
`riot-regime-loop.test.ts`. A needs-only producer is the same shape and would do
the same thing to both. ADR 0061 had to invent a structural gate
(`tryOpenAssault` refuses in a sector with a live hot streak) to keep two
producers apart; a third would need a third such gate, and the separation would
stop being structural and start being a pile of exceptions. It would also need a
new incident type, a response path and a locale key — a new player-facing
promise, which is the owner's.

**3. A per-prisoner health or condition attribute** — #80's and #31's shape.

Wrong on cost, and then wrong in a way that is worth stating sharply: **the fix
would reproduce the defect it is fixing.** On cost, it is new persisted
per-prisoner state, so it is a save-format question under
[ADR 0038](./0038-what-makes-a-save-compatible.md), which rejected a version
bump once already and recorded why. On substance, this content tree has no
medical room, no treatment action, no doctor role and nothing that reads an
injury — `IncidentRecord` produces `injuredEntityIds` that nothing consumes
(`docs/HUD_PROJECTIONS.md` gap 9). A health attribute added today would be a
second number that falls and is read by nothing: exactly the counter behind
glass this ADR exists to remove, with a different label. The right time for it
is when something can treat it, and that is #80's and #30's.

**4. One prison-level deduction sized by the sector mean.**

Wrong for ADR 0061's reason, restated for money. A mean lets eight well-kept
prisoners hide a ninth; `needsPressure` already demonstrates it, which is why
ADR 0061 needed a per-prisoner reader in the first place. Whatever the prison
owes for a person, it owes for that person.

### Why these numbers

Directional defaults and not a committed balance decision — the standing
convention (`DEFAULT_SECTOR_RISK_POLICY` and `DEFAULT_ASSAULT_POLICY` both carry
it; issue #28 puts final balance out of scope; #29 owns rates). What is **not**
directional is the shape: linear in the count, one term per need, no
interaction, a floor above zero.

- **The threshold is a fifth of `NEED_MAX` (51), and the margin was measured
  rather than reasoned.** A day is settled from a single sample at
  `DAY_LENGTH_TICKS - 1`, so the line has to be low enough that a *served* need
  cannot trip it merely by being sampled at the bottom of its own cycle. In a
  fully furnished eight-prisoner prison — shower room, yard, a bed and a toilet
  each — sampling all six needs of all eight prisoners on **every** tick over
  ten in-game days: the lowest level any need reached at any tick was `bladder`
  at **65.4**, and the lowest at any day boundary was `hunger` at **124.5**.
- **40 of 300 per unmet need**, so the reduction is proportional to how many
  things the prison is failing at rather than binary, and the floor is
  `300 − 6 × 40 = 60` — **reached exactly, not clamped.** The state does not
  stop paying for a prisoner it is still making the prison hold, and
  [ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md) made
  insolvency a state rather than a loss condition, which an income line that
  could reach zero would quietly undo.
- **Zero unmet needs pays exactly 300.** No existing measurement of a well-run
  prison moves: the served prison's whole ten-day balance series is
  bit-identical to what it was before this change. The mechanic can only ever
  take money off a prison that is withholding something.
- **Every per-place amount is a whole number of minor units.** That is a
  condition on the schedule and not a preference: it is what keeps
  `stateIncomeAccruedByTick`'s single division exact at the day boundary. A
  fractional share would have needed a remainder accumulator, which is state,
  which is a save-format question.

### What it costs a prison, measured

Eight prisoners, eight furnished cells, one guard, no shower room and no yard,
following the occupant of slot 0 (`tests/integration/needs-state-grant-loop.test.ts`):

| day | `hygiene` | `recreation` | unmet | day's grant |
| --- | --- | --- | --- | --- |
| 1–4 | 227.2 → 83.2 | 234.15 → 126.15 | 0 | 2,400 |
| 5–6 | 35.2, 0 | 90.15, 54.15 | 1 | 2,080 |
| 7–10 | 0 | 18.15 → 0 | 2 | 1,760 |

20,800 over ten days where the same eight cells with a shower room and a yard
are paid 24,000. `room.yard` requires no object at all, so half of that 3,200 is
the return on zoning 8×8 of ground the prison already owns — which is the
incentive the mechanic exists to create.

It compounds with [ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md)'s
arrears rather than sitting beside them: `economy-payroll-loop`'s over-committed
prison now reaches insolvency owing 360 on day 5 rather than 280, and digs out in
two days rather than one. So neglect reaches the riot model *eventually* — through
guards a bankrupt prison cannot pay for — by a chain of mechanics that already
existed rather than by a new coefficient.

### At fifty prisoners

Measured because the eight-prisoner fixture cannot answer whether the floor
keeps a large prison recoverable. Fifty prisoners, fifty furnished cells, seven
guards (`DEFAULT_SECTOR_PRISONERS_PER_GUARD` is 8), no shower room and no yard,
thirty in-game days:

| day | grant | wage bill | balance | unmet, per prisoner |
| --- | --- | --- | --- | --- |
| 1–4 | 15,000 | 560 | 33,630 → 76,950 | 0 |
| 5–6 | 13,000 | 560 | → 101,830 | 1 |
| 10 | 11,000 | 560 | 143,590 | 2 |
| 30 | 11,000 | 560 | **352,390** | 2 |

**The question is answered, and not in the direction it was asked.** The floor
is not what keeps a large prison recoverable; the ratio is. Income scales with
population and the wage bill scales at one guard per eight prisoners — 10 a
prisoner-day against 220 — so a fully neglected fifty-prisoner prison still
earns roughly twenty times its payroll and its balance climbs monotonically for
thirty days. At the floor of 60 it would still earn 3,000 a day against 560. If
anything the pressure is **too weak at scale**, which is a rate question and
belongs to #29 rather than here.

Two things fell out of that run that are worth recording:

- **A housed prisoner cannot reach six unmet needs in this content tree.**
  Holding a residency place requires a sleep surface — `residentCapacity` is
  derived from the summed footprint of the beds standing in the room
  ([ADR 0028](./0028-object-placement-and-derived-room-capacity.md) phase 1) — so
  `sleep` is always servable for anybody the grant is paid for. The measured
  worst case for a housed prisoner is **two**. The 60 floor is therefore a guard
  against a future rate rather than a balance point anybody reaches today.
- **One 8×8 yard does not serve fifty prisoners, and the money says so.** Zoning
  a yard on day 15 of the same prison took the grant from 11,000 to 12,680 and
  not to 13,000: forty-two prisoners get `recreation` served and eight do not,
  stably, for the remaining fifteen days. That is the mechanic reporting room
  contention — [ADR 0062](./0062-who-gets-the-room-when-more-prisoners-want-it-than-it-seats.md)'s
  subject — in minor units per day, which is the best evidence in this document
  that the consequence is legible. That the losing eight are the *same* eight
  every day rather than rotating is a question for ADR 0062 and not for this
  one.

### Determinism, the save format and cost

- **No new state.** Need levels are already carried in the payload in full
  (`NeedsComponent.levels`, in stored units), and residency claims are already
  in it. The grant is derived at the tick the day is settled, exactly as the
  flat figure was.
- **No `SAVE_SCHEMA_VERSION` bump**, and
  [ADR 0038](./0038-what-makes-a-save-compatible.md)'s rule is the reason: this
  adds no field, changes no field's units and changes no field's meaning.
- **No RNG stream.** The grant is a sum of authored integers over a walk sorted
  ascending by entity id (`RoomInstanceRegistry.residentIds`).
- **Cost.** One pass per in-game day over the housed prisoners, six typed-array
  reads each, plus one sort of their ids: `O(P log P)`, which at the
  200-prisoner reference tier is a 200-element sort and 1,200 reads every 2,400
  ticks, against a measured tick cost of 715 µs. The one place worth naming is
  `projectStatusStrip`, which pays the same walk per projection rather than per
  day; its cost note previously claimed "nothing here builds a per-actor
  object" and is now qualified in the file, because `residentIds` allocates one
  array that scales with the population.

> **Correction, 2026-08-30 (#543): both bullets above name `residentIds`, and
> the income line has not walked that accessor since `7161779` (#610).** It
> walks `RoomInstanceRegistry.residentIdsWithExistingPlace`, which clamps each
> instance to the beds that currently exist —
> `src/simulation/economy/income.ts`: *"The sort is
> `residentIdsWithExistingPlace`'s"*, and `stateIncomeForCompletedDay` passes
> `source.roomInstances.residentIdsWithExistingPlace()`. The name is corrected
> here rather than in the bullets because this ADR's text is the record of what
> was decided on 2026-08-28, when `residentIds` was the accessor and the
> sentence was true.
>
> **Nothing this section decides moves.** There is still no RNG stream; the
> walk is still sorted ascending by entity id — `residentIdsWithExistingPlace`
> adds a tie-break within that order rather than a second ordering rule, and
> says so at `src/simulation/prisoners/room-instance-registry.ts`; and the cost
> class is unchanged at `O(P log P)` in housed prisoners with one array
> allocated. What was wrong was only the name, and a reader chasing it would
> land on an accessor the income line no longer reads.
>
> **This is the third place the same rename had to be corrected**, which is why
> it is worth recording rather than quietly fixing:
> `src/simulation/presentation/status-strip-projection.ts` carries the same
> correction about its own paragraph, and `src/simulation/protocol/types.ts`
> names the new accessor in three places. A citation that survives a rename in
> two files and not in a third is the shape `docs/AGENT_WORKFLOW.md` §4 warns
> about — cite code by `file:line` because grep checks it, and nothing greps an
> ADR.

## What the player must be told for this to be fair

**This ADR does not decide it, and must not.** A need's warning threshold is a
statement to a player about what is bad; `docs/HUD_PROJECTIONS.md` gap 7
reserves it to the owner, and #477 is explicit that the decision was
unanswerable while neglect cost a staffed prison nothing: *"fix the cost first,
then the threshold has something true to say."* This is the cost. The threshold
is still open, and so is whether it should be this one.

(ADR 0057's open question 1 is the neighbouring gap and is **not** this one: it
asks that a player be able to see a riot changing behaviour, which ADR 0061
widened to three incident types. Nothing here narrows it.)

What is already true, and the reason the mechanic is not silently unfair on the
day it lands, is that the "earned today" chip moves with it. **A player is told
*that* they are being paid less. They are not told *why*.** Three things would
have to reach them for this to be fair rather than merely correct, and the
owner's decision is needed on all three:

1. **Which needs are unserved, per prisoner.** Already projected —
   `PrisonerDetailViewModel.needs` carries all six levels — and rendered with no
   banding at all, which is gap 7 exactly. Banding needs a level, and
   `STATE_INCOME_UNMET_NEED_LEVEL` (51) is the honest candidate *because* it is
   the one the simulation acts on. Adopting it is the owner's call, not a
   consequence of this ADR.
2. **What it is costing, per day.** The prison is short
   `40 × (unmet needs summed over occupied places)` every day. One field on
   `SimulationStatusCounts`, one locale key, and the owner's wording — a number
   labelled "withheld" is a statement about fault, which is why it is not here.
3. **Which room would fix it.** This exists nowhere in any projection. The
   mapping from a need to the rooms that serve it is authored in
   `DEFAULT_ACTIONS` and reaches the player in no form, so a player can see they
   are being paid less and still not learn that an 8×8 patch of ground is free
   money. This is the largest gap between a mechanic and a punishment, and it is
   a design job rather than plumbing.

Until at least (1) and (3) exist, the honest description of what shipped is
this, and it should not be softened: **a correct consequence with an incomplete
explanation.** It is strictly better than the counter behind glass it replaces,
and it is not a finished feature.

## Consequences

- **The build→need→behaviour loop has somewhere to go.** ADR 0054 measured that
  half working and dead-ending; all six needs are now read by something a player
  feels every day, per prisoner.
- **The economy gains a second downward pressure that is *earned* rather than
  chosen.** [ADR 0017](./0017-money-primary-resource-model.md) decision 8's
  ladder had only the payroll; a prison can now lose money by being run badly
  and not only by being spent badly.
- **A prison can lose money for a need it fails to serve for reasons that are
  not the player's fault, and the clearest case is already in the tree.**
  [ADR 0059](./0059-how-an-actor-gets-from-one-tile-to-the-next.md)'s speed
  ladder records that a cell-plus-yard prison *starved* its prisoner at lower
  actor speeds, and this branch's own measurement of a yard-only
  eight-prisoner prison shows two prisoners' `hunger` pinned at 0 for six of ten
  days while six others are fine — a contention or pathing artefact, not a
  decision anybody took. Under this ADR that costs the prison 40 a day per
  starving prisoner. **The mechanic reports the simulation faithfully; whether
  the simulation is right there is #436's and ADR 0059's** — and it is now more
  visible than it was, which is an argument for the change rather than against
  it.
- **The riot model is untouched and re-guarded.**
  `tests/integration/room-gated-needs.test.ts` is unchanged, and
  `needs-state-grant-loop.test.ts` re-asserts 0.4824, zero riots and zero
  incidents on a second seed — so a future change to
  `DEFAULT_SECTOR_RISK_POLICY` now has two files to argue with.

## Open questions

1. **Should the withheld share be steeper?** At fifty prisoners a fully
   neglected prison still earns twenty times its payroll (measured above), so
   the pressure is real but never existential. Whether it should be is a rate
   question and #29 owns it.
2. **Should the unmet line be the *displayed* warning line?** See "What the
   player must be told". The owner's.
3. **Should a prisoner nobody housed cost the prison anything on this line?**
   Today they earn nothing and cost nothing, and what they *do* cost is
   ADR 0061's assault model. Paying a negative would make the grant a fine,
   which is a different mechanic and would need its own decision.

## What would change my mind

- **A well-run prison losing a single minor unit.** The design rests entirely on
  the measured margin between a served need's worst tick (65.4) and the line
  (51) — a factor of 1.28 on the worst tick and 2.4 on the worst boundary
  sample, **measured at eight prisoners and not above**. The falsifier is
  specific: sample every need of every prisoner at every day boundary in a
  larger or more contended prison that has built every room, and if any served
  need reads at or below 51 at a boundary, the single-sample reading is wrong.
  The fix would then be a lower line — or, at real cost, a per-prisoner
  accumulator over the day and the save-format bump that brings.
- **The owner deciding the readout cannot be built.** A consequence a player
  cannot understand is a worse game than no consequence, and I would rather this
  were reverted than shipped permanently unexplained.
