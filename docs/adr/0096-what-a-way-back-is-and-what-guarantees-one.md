# ADR 0096: What a way back is, and what guarantees one

> **The number is provisional and this document pre-commits to renumbering.**
> `AGENTS.md`'s rule is that a number is not reserved until it appears in
> `docs/adr/README.md`, and a branch nobody has merged is invisible from that
> index — so if another branch turns up holding 0096, this file, its row and
> every citation of it get renumbered without argument, exactly as 0031, 0034,
> 0035, 0037, 0048, 0049, 0074, 0075, 0076 and 0083 each pre-committed.
>
> **The arithmetic, and this is one of the cases where the three answers do not
> agree.** The sweep was performed on 2026-09-04 from
> `docs/adr-always-a-way-back`, cut from `origin/main` at `7def42f0`
> (v0.0.441), over **every** remote head rather than `main` alone:
> `git fetch origin '+refs/heads/*:refs/remotes/origin/*' --prune`, then
> `git ls-remote --refs --heads origin` (**140 heads**) with
> `git ls-tree --name-only <head> -- docs/adr/` read out of every one of them.
>
> - `origin/main` maxes at **0094** (the name-pools ADR), as do fifteen other
>   heads.
> - **`origin/measure/893-coverage-and-response-draw-from-one-pool` holds
>   0095** — `0095-what-the-guard-requirement-is-a-requirement-for.md` — with
>   **no pull request** (`gh`'s PR listing for that head returns empty), and
>   that branch's own `docs/adr/README.md` already states
>   *"Next free number: 0096."*
> - Nothing on any of the 140 heads is above 0095.
>
> So `max + 1` off **disk** is 0095 and the stated **Next free number** line is
> 0095 — and both are wrong, for the reason ADR 0075's and ADR 0083's entries
> record: disk sees only what has merged. `max + 1` over the **sweep** is
> **0096**, which is the number taken. **0095 is held, and the hold pattern this
> index documents is what decided the number** — no count is stated here,
> because a tally in prose beside an index that records the chain is the shape
> `docs/AGENT_WORKFLOW.md` §4 names as rotting first. The
> index's own next-free line moves to **0097** rather than to 0096, because
> `tests/foundation/adr-numbering-contract.test.ts` states it as one past the
> highest number *on disk* and 0095 is not on disk; the gap is a hold, not a
> release.

## Status

**Accepted by the owner on 2026-09-10 — the recommendation taken whole,
including the two amendments it names as load-bearing: `'wages'` gets a rung of
its own while the prison has no residency capacity, and ADR 0083 decision 1's
scope extends to arrears at the 2,500 bound.** Six days after the ruling this
document was designed against, and it is the same person answering the same
question one level down: they ruled the principle on 2026-09-04 and the
mechanism on 2026-09-10.

> **THE PROVENANCE IS THE WEAKER KIND AND IS DISCLOSED RATHER THAN DRESSED
> UP.** The ruling is the label of a clickable option this session wrote and
> the owner chose — *"Przyjmij rekomendację w całości"* ("Accept the
> recommendation in full") — not a sentence they typed, and it was given
> against a summary naming the measured state (−2,500 pinned from day 4,
> arrears 3,220 → 27,220 at 4,800 a day, every lever at its floor at once) and
> the single most load-bearing item, rather than against this document's full
> text. `CLAUDE.md` flags exactly this shape about two reservation-3 releases,
> and [ADR 0104](./0104-what-undo-takes-back.md) and
> [ADR 0105](./0105-what-makes-a-local-save-the-newest-one.md) each disclose
> the same of their own rulings. The same caution applies here, and it applies
> harder than usual because item 2 changes a magnitude the owner themselves
> ruled in [ADR 0017](./0017-money-primary-resource-model.md)'s
> "Amendment, 2026-09-01" — the summary said so in those words before they
> chose.
>
> **WHAT THE ACCEPTANCE DOES NOT REACH, STATED BECAUSE THE APPROVAL LIST
> CONTAINS IT.** Item 6 of "What the owner must approve" asks whether a restore
> should write down arrears above the new bound, and answers itself that
> `supabase/migrations/` and the save format are **outside any agent's
> mandate**. Accepting this document does not release `AGENTS.md`'s
> reservation 2. That question was not put to the owner and is not settled
> here; an implementation reaching the save format still stops and asks.
>
> **The `Proposed` record is kept below rather than overwritten**, because the
> document argued the case as a proposal and a reader should see it in the form
> it was argued in.

**Proposed, 2026-09-04. Not self-approved.**

**The decision this document designs against is the owner's, ruled on
2026-09-04, and is recorded here in their words rather than paraphrased.** The
question put to them was whether a prison should be able to reach a floor
nothing in the interface can leave. They answered:

> **"Zawsze musi istnieć droga powrotu"**

("There must always be a way back.") Recorded at
[#913](https://github.com/matmaxalez/lockstate/issues/913).

**That settles *whether*, and nothing below is a re-litigation of it.** What is
proposed here is *what the sentence means precisely*, *where the guarantee is
discharged*, and *what it costs* — and every one of those is this document's
recommendation rather than the owner's ruling. Three of them amend decisions
the owner has already accepted, and they are listed under
"What the owner must approve" instead of being taken here.

Related: [#911](https://github.com/matmaxalez/lockstate/issues/911),
[#912](https://github.com/matmaxalez/lockstate/issues/912),
[#913](https://github.com/matmaxalez/lockstate/issues/913),
[#29](https://github.com/matmaxalez/lockstate/issues/29),
[#598](https://github.com/matmaxalez/lockstate/issues/598),
[#703](https://github.com/matmaxalez/lockstate/issues/703),
[#771](https://github.com/matmaxalez/lockstate/issues/771),
[ADR 0017](./0017-money-primary-resource-model.md) decisions 1, 5 and 8 and its
two amendments of 2026-09-01,
[ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md),
[ADR 0064](./0064-what-an-unmet-need-costs-a-prison.md),
[ADR 0070](./0070-dismissing-a-staff-member.md),
[ADR 0075](./0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md),
[ADR 0083](./0083-what-opens-the-negative-balance-and-what-bounds-it.md).

## Claim tiers used below

- **MEASURED** — produced by a run of a committed instrument on this branch, or
  quoted from a merged research record that says how it was produced.
- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **ARITHMETIC** — derived from constants that were opened, and not measured.
  Every such claim says so, because the difference is the one this document is
  most likely to be wrong about.

---

## Context

### 1. The state that was ruled on, as measured

**MEASURED**, from `docs/research/2026-09-04-can-this-prison-fail.md` act B and
restated in #913. New prison, 60 × *Hire Guard* and 288 × `item.brick` on day 1,
then eight days of payday:

| reading | value |
| --- | --- |
| treasury | **−2,500** from day 4, at **all 12 samples** across four paydays |
| arrears (`unpaidWagesMinorUnits`) | **3,220 → 27,220**, climbing 4,800/day |
| `stateIncomeAccruedTodayMinorUnits` | **0** at all 29 samples |
| rooms / prisoners / staff | 0 / 0 / 60 |
| buy one brick | `aria-disabled="true"` — *"you need 1,355 more"* |
| hire | `aria-disabled="true"` — *"you need 1,395 more"* |
| admit | refused ×3 — *"this prison has no room to hold anybody"* |
| dismiss | **not on screen at all** (#912) |

**The two refusal amounts are the whole mechanism, read back off the screen,
and they close the first question this document had to ask: is the floor doing
what the ruled constants say it does?** It is, exactly. **ARITHMETIC** over
constants that were opened: a fresh, unfurnished prison's `'deliveries'` and
`'hiring'` rung is `INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS`
= −1,250 + 65 = **−1,185** (`src/simulation/economy/treasury.ts:507`), and
`Treasury.canAfford` requires `balance − amount ≥ floor`. So one brick at 40
needs a balance of at least −1,145, and from −2,500 the shortfall is
**1,355**; one hire at 80 needs at least −1,105, and the shortfall is
**1,395**. Both match the measured strings to the minor unit. Nothing here is a
defect in the ladder's arithmetic.

### 2. Why it cannot be left, in one line and then in the code

**Income needs a bed, a bed needs a cell, a cell needs money, and money needs
income.**

- **VERIFIED, read.** `stateIncomeForOccupiedPlaces`
  (`src/simulation/economy/income.ts:548`) folds over **place ids**, so a
  prison holding nobody earns nothing regardless of how many prisoners stand in
  intake. `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS` is 300
  (`src/simulation/economy/income.ts:115`).
- **VERIFIED, read.** `PayrollSystem` pays
  `Math.max(0, Math.min(due, balance − floorFor('wages')))`
  (`src/simulation/economy/payroll.ts:314`) and carries the remainder as
  arrears. At the floor that expression is **0**, so arrears never decay, and
  every minor unit that later arrives is billed against them before it can be
  spent ([ADR 0049](./0049-what-a-prison-that-cannot-make-payroll-owes.md)
  decision 3: *"Arrears are paid before the day they precede"*).
- **VERIFIED, read.** `'wages'` is the one spend class with **no rung of its
  own**: `INSOLVENCY_RUNG_FLOORS_MINOR_UNITS.wages` is
  `Number.NEGATIVE_INFINITY` (`src/simulation/economy/treasury.ts:430`),
  clamped by `rungFloorMinorUnits` only to the overdraft floor of −2,500. So
  the undeclinable charge spends the 65 minor units of headroom that
  `STARTER_RUNG_FLOORS_MINOR_UNITS` exists to reserve, and the reserve's own
  derivation says what that costs: *"a queued build order's one-plank purchase,
  at the construction rung, always clears"* — true for every balance a press or
  a hire could have reached, and false the moment payroll reaches past them.

**That is the mechanical statement of the defect, and it is narrower than "the
economy is unforgiving": the repository already builds a reserve for exactly
this hazard and hands it to the one charge the player cannot decline.**

### 3. The class is precisely characterised, and every row of it is measured

**MEASURED on this branch**, `scripts/report-loan-recovery-pricing.mjs`
(the committed instrument behind
`docs/research/2026-08-30-pricing-the-way-out.md`), run as
`LOCKSTATE_PRICING_SECTIONS=… node --experimental-transform-types scripts/report-loan-recovery-pricing.mjs`:

| shape | rows | outcome |
| --- | --- | --- |
| **staffless** (§10a, 7 overdraft sizes × 2 queue arms) | 14/14 | housed on in-game day **1.63**, `room used` 1,130 or 1,195, final balance 34,870 or 70,675 |
| **staffed and already built** (§10b, 1 and 5 guards × 5 overdraft sizes) | 10/10 | never negative at all — `min balance` 11,875–12,915 |
| **staffed and unbuilt, with a loan** (§6, `backlog drained = false`, 3 candidates × 1/3/5 guards) | 9/9 | **balance −2,500, capacity 0, occupancy 0, debt never cleared**, arrears after 5,625 / 24,825 / 44,025 |
| **staffed and unbuilt, backlog cancelled first** (§8) | 4/4 | capacity 4, occupancy 4, debt cleared day 4.70–14.71, arrears 0 |

So the class is not "an unforgiving economy". It is **staff hired before any
residency capacity exists** — and it is the only one of the three shapes that
fails, in every row, under every loan candidate the owner's ruled terms came
from.

**And there is a second lock, at a different rung, with no staff in it at all.**
**MEASURED**, §10c — a standing overdraft of 2,500 against a growing unfunded
build queue:

| unfunded tail | tail cost | capacity | housed day | final balance | orders standing |
| --- | --- | --- | --- | --- | --- |
| 13 | 1,040 | 1 | 1.63 | 34,870 | 0 |
| 20 | 1,600 | **0** | **—** | **−1,240** | 5 |
| 26 | 2,080 | **0** | **—** | **−1,240** | 11 |
| 31 | 2,480 | **0** | **—** | **−1,240** | 16 |
| 40 | 3,200 | **0** | **—** | **−1,240** | 25 |
| 60 | 4,800 | **0** | **—** | **−1,240** | 45 |

Balance −1,240, arrears 0, no staff, nobody ever housed, and the queue standing
for ever. **A way back has to answer this one too**, and it is a different
answer: nothing here is bleeding, so stopping a wage bill does nothing, and the
money is not missing — it is committed to orders the player may or may not be
able to cancel (#860, #861, #862).

### 4. What is already in the tree, and what each of it does not do

**VERIFIED, read**, all four:

- **A reserve exists and is one plank wide.**
  `INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS`
  (`src/simulation/economy/treasury.ts:507`), the owner's second ruling on
  #771, and `isFreshUnfurnishedPrison` is read live from
  `roomInstances.totalResidentCapacity === 0`
  (`src/simulation/runtime/session-commands.ts:392`). It reserves the **plank**
  and assumes the **enclosure is already built**, which act B's prison never
  did, and `'wages'` walks straight through it.
- **A loan exists and is switched off.** `LoanBook`
  (`src/simulation/economy/loans.ts:177`) is built only when
  `options.loanTerms !== undefined` (`src/simulation/runtime/new-session.ts:909`)
  and **nothing in `src/` passes it**, so no session has a ledger. The four
  magnitudes are ruled — 25% diversion, 15% fee, 45 in-game days, 50% escalated
  (#703 ruling 10 and ADR 0083 §3) — and recorded rather than wired. There is no
  loan in `simulationCommandSchema` and no persistence.
- **A sell-back is Accepted and unbuilt.** ADR 0075 decision 3 — *"A command
  that converts stock back into money at a fraction of the purchase price …
  the 625-brick prison is not poor, it is illiquid"* — **Accepted
  2026-08-29 by the repository owner.** What exists is
  `ProcurementSystem.refundMaterials` / `previewRefundMaterials`
  (`src/simulation/economy/procurement.ts:367`, `:389`), which price stock at
  the **full catalogue price** and whose only caller is build-order
  cancellation. **There is no player command that sells stock out of a
  container**, at any ratio.
- **Cancellation already returns money**, on the owner's ruling 20 of
  2026-08-31, and it is why §8's rows recover: cancelling an `'assigned'` order
  refunds its allocated materials at catalogue price
  (`src/simulation/construction/system.ts:760`), and `refundSurplusOf` recovers
  a delivery still on the road (`:764`). **This is the only working liquidity
  valve in the shipped game**, and it reaches material held by an order — never
  material sitting in a container.

**Act B's prison is the exact prison ADR 0075 decision 3 describes.** It holds
**288 bricks, 11,520 minor units at catalogue price**, and it is **65 minor
units — one `item.wood-plank`** — short of an income line. The accepted remedy
for that has been on the record for six days and is not built.

---

## Decision

### 1. What "a way back" means

**A way back is a reachability guarantee on the income line, bounded in in-game
days:**

> **From every state a player can reach, the prison can reach a strictly
> positive state income within a bounded number of in-game days, using only
> actions the interface offers, without starting a new prison.**

**Not "at least one action always exists that improves the position", and the
measurement is what rules that reading out rather than taste.** Act B's lever 1
— place a wall — was **accepted** at the floor: one `PlaceBuildOrder`, queue
`1 waiting · 0 being built`, funds unchanged at −2,500. An action existed, it
was not refused, and it changed nothing a player is tracking. A definition
satisfied by the measured terminal state is not a definition of a way back.

**Not "solvency is guaranteed" either**, for two reasons and the second is the
important one. It is unprovable as stated — a claim over all reachable states
with no bound — and it would remove the game: ADR 0017 decision 8's whole
argument for insolvency-as-a-state is that *"the interesting part … is digging
out"*, and a guaranteed dig-out is not one.

**Three properties make the definition above checkable rather than pious:**

- **The income line, not the balance, is the thing guaranteed.** It is the only
  quantity in the economy that is *causally upstream* of every other way out:
  arrears are cleared by income (ADR 0049 decision 3), a loan is repaid out of
  inflows (ADR 0075 decision 2), and the balance is a consequence. A guarantee
  on the balance would be a bailout; a guarantee on the income line is a
  guarantee that the prison can start working again.
- **A bound in in-game days, and it should be small.** Every recovering row
  this repository has measured houses somebody on in-game **day 1.63** (§5,
  §10a, 15/15 rows). **Proposed bound: ten in-game days from any reachable
  state**, which is six times the measured figure and about five wall-clock
  minutes at the ×4 the playtest ran at. The magnitude is #29's under ADR 0017
  decision 5; the *existence* of a bound is not, because an unbounded "you
  could recover eventually" is what the measured 27,220 of arrears already is.
- **"Actions the interface offers", not "actions the kernel would accept".**
  #912 is the reason this clause is in the definition: the control that stops a
  wage bill was present, enabled, and invisible. A way back that a player
  cannot see is #89's invisible stall with a different cause.

### 2. Where the guarantee is discharged: a **reserve**, not a rescue

**The prison may never be spent or charged into a position where the cheapest
complete earning unit is unaffordable.**

Concretely, and this is the smallest change that discharges decision 1 for the
staffed-and-unbuilt class: **extend `STARTER_RUNG_FLOORS_MINOR_UNITS`'s
existing derivation to the one spend class it exempts, and size the reserve at
the whole earning unit rather than at one plank.**

- While `roomInstances.totalResidentCapacity === 0`, `'wages'` stops at a rung
  of its own instead of at the overdraft floor. What payroll cannot pay
  **still becomes arrears**, exactly as ADR 0049 decision 2 already says, so
  this moves no money, creates no money, adds no persisted state and needs no
  `SAVE_SCHEMA_VERSION` bump.
- **The reserve's size is the cheapest complete earning unit from bare
  ground**, not one plank. **ARITHMETIC** over constants that were opened:
  `room.cell`'s authored minimum is 2×3 (`src/content/room-catalog.ts:94`),
  whose perimeter is **10 tile edges** (the ring
  `scripts/report-loan-recovery-pricing.mjs:78-90` builds, of which it leaves
  one for a door); `wall-brick` costs 2 × `item.brick`
  (`src/simulation/construction/definition.ts:89`) at 40 each
  (`src/content/procurement-catalog.ts:100`); `bed-wooden` costs one
  `item.wood-plank` (`:180`) at 65 (`src/content/procurement-catalog.ts:101`).
  So **720–800 for the enclosure plus 65 for the bed: 785–865**, and a toilet
  is **not** in it — `residentCapacity` is derived from the beds standing in
  the room, and act D earned 1,800 a day from six beds and no toilet, so
  `room.cell`'s authored `object.toilet` requirement does not gate income.
- **The measured figure is larger than the arithmetic and it is the authority.**
  §10a measures `room used` at **1,130** with the queue standing and **1,195**
  with it cancelled, invariant across seven overdraft sizes. The difference from
  785–865 is the queue and the delivery in flight that any *played* position
  carries, and it is why the reserve must be set from the sweep rather than from
  the catalogue: the arithmetic prices the goods, the sweep prices the position.
  **The magnitude is #29's**, and this document names 1,195 as the measured
  candidate rather than choosing it.

**Why a reserve rather than a rescue — five reasons, and the first is the one
that decided it:**

1. **It is an inequality over the whole reachable range, not a measurement of
   one fixture.** `Treasury.canAfford` enforces `balance − amount ≥ floor` on
   every spend, so a rung is a *worst case* and not a typical case. That is the
   proof form the starter rung already carries and this repository already
   trusts, and it is the only candidate here that can be argued rather than
   sampled.
2. **It creates no money.** Every rescue candidate — a bailout, a gifted cell,
   a grant that fires at the floor — has to answer "where did that come from"
   to a player, and ADR 0075 already rejected the shape by name.
3. **It adds no player-facing promise, no command and no persisted field.** One
   entry in one table, plus a magnitude, plus the readout decision 4 owes.
4. **It leaves the loan, the sell-back and the threshold grants as the
   *interesting* mechanics rather than the load-bearing ones.** ADR 0075
   decision 2 calls the loan *"what keeps decision 8 honest"*; §6 measures that
   it does not, for this class. A reserve lets the loan be a choice again.
5. **It makes the failure legible.** A balance that stops falling while arrears
   keep climbing is two numbers telling a player two true things. A balance that
   pins at −2,500 while a badge promises a payment is one number telling them a
   false one.

**What the reserve does not do, said here rather than in the consequences: it
is prospective.** It makes the class unreachable; it does not free a save
already in it. That is decision 3, and the pairing is the substance of this
ADR rather than a hedge — the owner's sentence is about states already reached.

### 3. What frees a prison already in the state: three things, and each alone is measurably insufficient

**In this order, because each is a precondition of the next being worth
anything:**

**(a) Dismissal must be reachable — #912.** Necessary: a prison that cannot
stop a 4,800/day charge has no way back under any mechanism, because the charge
outruns every income line the prison could build (300/day per place, one place
per bed). **And insufficient by arithmetic, not by opinion.** ADR 0070 decision
3 is explicit that *"a dismissal moves no money"*, so after dismissing all
sixty guards act B's prison holds: balance −2,500, arrears 27,220, income 0.
`payable = max(0, min(due, balance − floor))` is **0** at the floor, arrears
never decay, and no lever is any more affordable than it was. **Stopping the
bleeding does not reopen the floor.** #912's fix is the first part of the way
back and it is not the way back.

**(b) Sell-back at a loss must be built — ADR 0075 decision 3, already
Accepted.** This is the only candidate that uses what the prison already owns
rather than giving it anything: 288 bricks, 11,520 at catalogue. **ARITHMETIC**:
at a sell-back ratio *r* the credit is 11,520·*r*, and reaching a plank's
affordability at the construction rung needs 11,520·*r* ≥ 1,315, so any ratio
above about **12%** reopens the game — the ratio is #29's and the class does not
turn on it. **Insufficient alone, for two measured reasons.** First, the next
payday bills 27,220 of arrears against whatever was credited and takes the
balance back to −2,500, so a player has to outrun a day boundary to spend the
proceeds — which is a reflex test, not a mechanic. Second, **a prison holding no
stock has nothing to sell**: §10c's tail-20 row ends at −1,240 with 0 bricks and
five orders standing, and no ratio helps it.

**(c) Arrears must be bounded.** This is the one every other candidate fails
on, and it is a gap *between* two decisions rather than inside either. ADR 0075
decision 2's third rider requires *"an accrual cap, because interest against a
negative balance can otherwise escalate without limit"*; ADR 0083 decision 1
read that as being about the loan and answered it with `LoanBook`'s once-only
fee — *"`outstanding` is set in `draw` and never rises"*. **Arrears are the
other accrual against a negative balance, and nothing bounds them.** Measured:
3,220 → 27,220 in six in-game days, growing 4,800/day for as long as the prison
is left alone.

**What unbounded arrears cost, in the only unit a player feels.** **ARITHMETIC**
over the measured figures: 27,220 of arrears against one recovered occupied
place at 300/day is **91 in-game days** before the prison may spend one minor
unit — about **47 wall-clock minutes** at the ×4 and ≈78 ticks/second the
playtest measured, spent pressing nothing. Two more days of neglect before the
player notices adds another **32 in-game days** to that wait. **A recovery a
player will not sit through is not a way back**, and decision 1's bound exists
to say so.

**Proposed: arrears stop accruing at a bound, and what cannot accrue is
forgiven rather than deferred.** The magnitude is #29's; the candidate this
document names is the overdraft floor's own, 2,500, on the single ground that it
is already the size of "what this prison may owe" in the one other place the
repository states such a number. **Its cost, stated rather than discovered
later: it weakens the payroll's teeth**, and a prison could then neglect payroll
indefinitely at a fixed price. **The mitigation is already reserved and belongs
where ADR 0049 put it** — decision 4 of that ADR left *"morale and incident
consequences"* to *"the rung after this one"*, and unpaid staff who stop working
are a better consequence than a number that grows for ever behind glass.

### 4. What the player must learn, and when

**No string is authored here.** The owner released the choice of words on
2026-09-04 — *"Sam decyduj zawsze, jak zacznę grać to ujednolicimy"* — and
`AGENTS.md` records that release as covering the *choice* and not the
*requirement that a sentence be true*. `src/content/default-locale-en.ts` is
another agent's surface this hour, and a sentence written before the mechanism
exists cannot be true of it. What this ADR settles is **what has to reach the
player, and at which moment**:

1. **At the hire, what the wage is standing against.** The panel priced the
   hire honestly — *"Costs 80 now and 80 a day in wages, including today"* —
   and said nothing about the zero on the other side of it. A player told a
   price and not a consequence has not been told the thing that ends the run.
   **This is the earliest and cheapest place to intervene, and it is the only
   one that needs no mechanism at all.**
2. **At the floor, the true reason.** The measured badge says *"…until the state
   pays what it owes"* and the state owes that prison nothing
   (`stateIncomeAccruedTodayMinorUnits: 0` at all 29 samples). The sentence must
   convey that the floor was reached **because the prison is not earning**, and
   name what it would have to hold to be paid. **It must be written against
   whichever of decisions 2 and 3 lands**, because the true sentence changes: at
   the floor today the honest statement involves arrears, and with a reserve in
   place it involves the reserve.
3. **Where the reserve is, if decision 2 lands.** A balance that stops falling
   at a number the player cannot see, while arrears climb past it, reads as a
   bug. **This readout is the reserve's real cost** and it is the one part of
   decision 2 that is not free.
4. **That an unassigned guard is still being paid, and where to stop paying
   them.** #912's fix owns this one and states it already.

---

## How this interacts with decisions that are already live

**Named explicitly, because `CLAUDE.md` forbids contradicting an existing ADR
silently and three of these would be contradicted by the recommendation above.**

### ADR 0083 — what opens the negative balance and what bounds it (Proposed)

- **Decision 1 stands and is not touched.** The floor remains a credit limit on
  discretionary spending rather than an accrual cap.
- **Decision 2's ruling stands: reading A, a standing overdraft every prison
  has, at −2,500.** Decision 2 above does not open a second facility, does not
  change `TREASURY_OVERDRAFT_FLOOR_MINOR_UNITS`, and does not move the
  `'deliveries'`, `'construction'` or `'hiring'` rungs for a prison that has any
  residency capacity.
- **Decision 2's *wages* threshold is what decision 2 above amends, and it is
  the owner's ruling 19.** *"Dać szczeblom własne progi wewnątrz debetu"* put
  the three rungs at −1,250, −2,000 and −2,500, with **wages at the floor**;
  the second same-day amendment then equalised construction to −1,250 on
  #771's *"buying and building stop at the same place"*. Both are drafted as
  [ADR 0017](./0017-money-primary-resource-model.md)'s "Amendment,
  2026-09-01" and **accepted by the owner on 2026-09-01**. Giving `'wages'` a
  shallower rung while `totalResidentCapacity === 0` **changes a magnitude the
  owner ruled**, and it is listed below as an amendment they must approve
  rather than taken here.
- **Decision 1's reading of ADR 0075's accrual cap is what decision 3(c)
  reopens**, and this is a genuine disagreement rather than an oversight: that
  decision satisfied the cap with `LoanBook`'s fixed fee, which bounds the
  *loan* and not the *arrears*. Decision 3(c) says the rider has a second
  subject. **This is an amendment to ADR 0083 decision 1's scope, not a
  reversal of it.**

### ADR 0064 — what an unmet need costs a prison (Proposed, with the withheld share suspended at 0)

- **Decision 1 stands and nothing above narrows it.** The grant is still paid
  per occupied place per in-game day, holding no state; decision 3's sum over
  residency claims is untouched; the "earned today" readout is untouched.
- **Open question 3 is declined rather than answered.** That question —
  *"Should a prisoner nobody housed cost the prison anything on this line?"* —
  is the mirror of the candidate this brief asked to be priced: letting the
  state pay something for a prisoner in intake. It is rejected below, with the
  reason, and ADR 0064's own framing is part of it.
- **And there is an interaction nobody has named, which the owner should see
  before they restore the rate.** The suspension of 2026-09-03 —
  `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0`, reaffirmed on
  2026-09-04 with *"Zostaw bez kar — najpierw sam pogram"* — is what makes
  decision 3(c)'s arithmetic as favourable as it is. **A recovering prison is,
  by construction, a prison whose needs are at the bottom.** At the suspended
  rate its first place earns 300/day and 27,220 of arrears takes 91 in-game
  days; at the authored 40-per-unmet-need rate and ADR 0064's own measured worst
  case for a housed prisoner (two unmet), it earns 220/day and the same arrears
  take **124 in-game days**; at that ADR's floor of 60 it would take **454**.
  **So restoring the rate makes the way back between 1.4× and 5× longer, and it
  is the recovering prison that pays it.** Nothing here asks for the rate to
  move — that is the owner's and they have ruled on it twice. What it asks is
  that decision 3(c)'s bound be set with this ratio in front of whoever sets
  it, because the bound is what stops the interaction mattering.

### ADR 0049 — what a prison that cannot make payroll owes (Accepted)

Decisions 2 and 3 are what decision 2 above *relies on*: what payroll cannot
pay becomes arrears, and arrears are billed before the day they precede.
Decision 3(c) bounds how large that number may grow and does not change either
mechanism. **Decision 4 is the one this ADR pushes on**: *"No dismissal, no
morale penalty, no incident, no game over … they belong to the rung after
this one."* Two of those four have since arrived — dismissal (ADR 0070) and, if
3(c) lands, the reason a bounded arrears figure is not a free pass. **The morale
and incident consequences are still unbuilt and are now load-bearing**, because
they are what a bounded arrears figure hands the consequence to.

### ADR 0075 — what a prison that cannot afford its first bed is owed (Accepted)

- **Decision 3 is not amended, it is invoked.** Building the sell-back needs no
  new ruling; it needs the ratio (#29's) and the command, the control and the
  refusal sentence the decision already prices.
- **Decision 2's weakest claim is now measured, and it fails.** That decision
  says the loan is *"not a nice-to-have beside the ladder … what keeps decision
  8 honest"*, and its own record notes that
  *"recovery-from-any-reachable-position remains unproved until those numbers
  exist"*. The numbers exist (#703 ruling 10 and ADR 0083 §3), and §6 measures
  all three candidate triples failing this class in 9 of 9 rows. **The claim is
  not refuted in general** — §8 shows every candidate recovering once the
  backlog is cancelled — **but its "from any reachable position" half is
  refuted, and this document is where that is recorded.**
- **ADR 0075's own rejected list is consulted rather than ignored.** The
  *"threshold backstop keyed to the price of a plank"* it rejects by name is
  why the gifted-cell candidate is rejected below, and why decision 2 is a rung
  and not a credit that fires at a threshold.

### ADR 0017 — money as the primary resource (Accepted)

Decision 8 is untouched: insolvency stays a state, there is no loss condition,
and the ladder still runs — decision 2 above changes where one rung stands for
one class of prison, which is the shape ruling 19 already established. Decision
5's reservation of prices and balance values to #29 is honoured throughout: this
document names candidate magnitudes and chooses none.

---

## Alternatives, priced

**Each of these will be re-proposed by somebody who has not read this, so each
is argued against numbers rather than listed.**

**1. A bailout — a credit that fires when the balance hits the floor.**
Rejected. It is ADR 0075's *"threshold backstop keyed to the price of a plank"*
with the trigger moved: *"a rule about one content price wired into the
treasury, invisible until it fires, and it would have to be explained to the
player as a mechanic or it reads as a bug."* It also fails on its own terms
here — at act B's arrears the next payday takes the whole bailout (any credit
below 27,220 is consumed entirely), so a bailout large enough to work is a
bailout larger than the opening grant.

**2. Enable the loan.** Rejected as the primary mechanism, **on this
repository's own instrument**: §6, 9 of 9 rows, every candidate triple, 1/3/5
guards — final balance −2,500, capacity 0, occupancy 0, `debt cleared day` never,
arrears after 5,625 / 24,825 / 44,025. The loan credits the treasury and the
payday takes it. It also carries the largest build cost of any candidate here: a
command, a control, a refusal sentence, a readout that keeps a drawdown
distinguishable from income (ADR 0075 decision 2's own rider), **and a
save-format change** — `LoanBook.snapshot`/`restore` exist and nothing persists
them, so today a player would reload out of their debt. **It should still be
built**, after 3(a)–(c), because §8 shows it recovering in 4 of 4 rows once the
bleeding has stopped and because it is the mechanic that makes digging out a
decision instead of a wait. It is not the answer to the ruling.

**3. A forced staff reduction — the prison dismisses staff it cannot pay.**
Rejected. It takes the player's decision away in the one moment the game is
asking them to make one, ADR 0049 decision 4 deliberately left dismissal to a
later rung, and **it fails the same arithmetic as 3(a)**: it stops the charge
and clears no arrears, so the floor stays exactly where it is. It is 3(a)
without the player's consent and with the same result.

**4. A free or gifted first cell.** Rejected on ADR 0075's stated grounds and on
one of its own: it fires once, and nothing about act B's state is first-time.
A player can reach it on day 4 of their fourth prison.

**5. Let the state pay something for a prisoner in intake.** Rejected, and it is
the closest call here. It inverts ADR 0017 decision 1's stated reason for
per-occupied-place income — that capacity and the ability to hold people safely
*"pay off through the same line, so expansion and competence are not separate
currencies"* — by making **admission** rather than **housing** the revenue
lever. It engages ADR 0064 decisions 1 and 3 and needs an amendment to both. And
**it does nothing for the measured state**: act B's admit control refused three
times with *"this prison has no room to hold anybody"*, so an intake payment
only reaches a prison that could already admit somebody. **It becomes the right
answer if the owner decides intake should be a revenue line**, which is a
different and larger design question than the one they ruled on.

**6. Prevent the class instead: refuse a hire whose standing wage bill would
exceed what the prison earns.** Rejected as *the* answer and recommended as a
companion. It does not answer the ruling — *"there must always be a way back"*
is a sentence about states already reached, and prevention says such states will
not arise. It is also blunt: at act B's day 1 the prison earned 0, so the rule
reduces to "no hire before the first bed", which forbids a legitimate opening
(hire, then build) rather than pricing it. **The honest version of what it wants
is decision 4(1)**: tell the player what the wage is standing against, and let
them ruin the prison knowingly.

**7. Do nothing, and add a defeat state instead.** Rejected because the owner
ruled the other way, and recorded because #913 put both options to them and this
is the one they declined. ADR 0017 decision 8 also already refused it, and
ADR 0075 records the owner refusing it in their own words — *"Bez bankructwa,
tylko minus i pożyczki"*.

---

## The weakest part of this recommendation, named by its author

**1. Decision 2 does not close §10c's queue lock, and §10c is measured while
decision 2 is arithmetic.** A reserve is held in the treasury, and
`procureQueuedMaterials` runs before the construction walk, unconditionally,
buying what the standing queue needs
(`src/simulation/construction/system.ts:1220`, calling `:1348`). So a prison with a large
unfunded queue would have its reserve spent by the queue before the player saw
it. **The queue lock's exit is a cancel control, not a rung** — #860, #861 and
#862 are its subject — and this document does not fix it. Saying otherwise
would be the *"a measurement is not a diagnosis"* error in the direction of my
own recommendation.

**2. I have not measured decision 2.** Everything in it is arithmetic over
`canAfford`, `rungFloorMinorUnits` and constants I opened, plus this
repository's own §6/§8/§10a/§10c tables for the states *around* it. **What
would settle it, precisely:** add a `'wages'` rung to
`STARTER_RUNG_FLOORS_MINOR_UNITS`, re-run
`LOCKSTATE_PRICING_SECTIONS=6`, and read whether the nine
`backlog drained = false` rows house anybody. If they do not, decision 2 is
wrong and the reason will be in that table.

**3. The reserve is sized off content values and there is no accessor for
"the cheapest earning unit".** Brick at 40, plank at 65, `room.cell`'s 2×3
minimum, and `residentCapacity` deriving from beds are four independent content
facts, and a change to any of them silently invalidates 785–865.
`STARTER_RUNG_MARGIN_MINOR_UNITS` already solves the price half by reading
`procurableMaterial('item.wood-plank')`; the *room requirement* half has no
such accessor, and building one is part of the work rather than a detail of it.

**4. Decision 3 does not repair a save already in the terminal state.** A
reserve is prospective, a sell-back needs stock, and a bound on arrears applies
to accrual rather than to a figure already accrued. **A save written at act B's
state stays at act B's state**, and the only door out of it remains `New
prison` — the door the research record found. Whether a restore should write
down arrears above the new bound is a persistence question and therefore the
owner's under `AGENTS.md`; it is named here and not decided.

**5. Decision 1's bound of ten in-game days is the softest number in this
document.** It is six times a measured figure, which is a margin and not a
derivation. The measured figure (day 1.63) comes from a *scripted* recovery
that knows exactly what to press; a player discovering the same recovery will
take longer, and nothing here measures how much longer.

---

## What the owner must approve

**Nothing below is taken by this document.**

1. **Decision 1's definition of "a way back"** — the income line, bounded in
   in-game days, rather than "some action always improves the position" or
   "solvency is guaranteed".
2. **An amendment to ruling 19 / [ADR 0017](./0017-money-primary-resource-model.md)'s
   "Amendment, 2026-09-01" (Accepted 2026-09-01): `'wages'` gets a rung of its
   own while the prison has no residency capacity, instead of stopping at the
   overdraft floor.** This changes a magnitude the owner ruled and is the single
   most load-bearing item here.
3. **An amendment to [ADR 0083](./0083-what-opens-the-negative-balance-and-what-bounds-it.md)
   decision 1's scope: ADR 0075's accrual-cap rider has a second subject, and
   arrears are it.** Plus the bound's magnitude (#29's), for which 2,500 is the
   named candidate.
4. **Whether the reserve's magnitude is the measured 1,195 or the catalogue
   arithmetic's 785–865** — #29's under ADR 0017 decision 5.
5. **Whether decision 1's bound is ten in-game days**, or another number.
6. **Whether a restore should write down arrears above the new bound** — a
   persistence question, and `supabase/migrations/` and the save format are
   both outside any agent's mandate.
7. **The sell-back ratio** (#29's), which ADR 0075 decision 3 left open when the
   owner accepted it on 2026-08-29.
8. **This ADR itself.** It was `Proposed` when this list was written, and
   nothing in this corpus is self-approved.

   **ANSWERED 2026-09-10: accepted, and items 1-5 and 7 with it.** The list
   above is kept in the interrogative rather than rewritten as a record of
   answers, because what a reader needs is to see *what was asked* beside what
   was granted — `docs/AGENT_WORKFLOW.md` §4. The sentence *"It is `Proposed`"*
   is therefore left standing above and is false as of that date; the Status
   section at the top of this document is what holds the current word.

   **Item 6 is the exception and is NOT answered.** It asks whether a restore
   should write down arrears above the new bound, and answers itself that
   `supabase/migrations/` and the save format are outside any agent's mandate.
   That question was not put to the owner, so `AGENTS.md`'s reservation 2 is
   untouched by this acceptance and an implementation reaching the save format
   stops and asks.

## What would change my mind

- **§6 re-run with a `'wages'` rung, still showing capacity 0 in every row.**
  That is decision 2's falsifier and it is one table away.
- **A measured position that a reserve of 1,195 does not free.** The reserve is
  an inequality, so a single counterexample kills it rather than weakening it —
  and §10c is already a candidate, which is why it is named as weakness 1
  rather than buried.
- **The owner restoring `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` to
  40 while decision 3(c) is unbuilt.** The ratio in the ADR 0064 section above
  is not a small effect: it makes the way back up to five times longer for the
  prison least able to wait, and it would move decision 3(c) from
  "recommended" to "required before the rate returns".
- **A player who reaches the floor and enjoys it.** Every argument here treats
  the terminal state as a defect. If the owner plays into it and finds the
  pressure is the point, decision 1's bound is what should be relaxed, and this
  whole document narrows to #913's first half: the sentence has to stop
  promising a payment that is not coming.
