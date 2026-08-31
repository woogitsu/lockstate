# ADR 0049: What a prison that cannot make payroll owes

## Status

**Accepted for decisions 2-6, 2026-08-31, by the repository owner.
[ADR 0075](./0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)
decision 2 replaces decision 1 below.**

**This clause read `Proposed, 2026-08-28. Not self-approved.` until 2026-08-31**,
while decisions 2-6 were shipped, live and unchallenged. The paragraph that
stood under it is kept below, unedited, because everything it says about *why*
this document exists is still true. What had not happened was the acceptance
step, and it has now happened.

**How the acceptance arrived, and why it is split.** The owner ruled on
2026-08-31 (issue [#703](https://github.com/matmaxalez/lockstate/issues/703),
ruling 15) after the integrator reported that this document was in a state no
gate in this repository can detect: **`Proposed` with five of its six decisions
in production, and its sixth contradicted by an `Accepted` document with no note
of the contradiction anywhere.** The ruling was to accept 2-6 and record that
ADR 0075 decision 2 replaces decision 1, in preference to a note alone or to
recording a documentation debt.

**ADR 0075 DECISION 2 REPLACES DECISION 1, AND THE ARGUMENT THAT CARRIED IT IS
WITHDRAWN.**
It reads *"The balance stays floored at zero. The five validators above stand,
and `Treasury` is not given a signed balance, an overdraft or a loan."* ADR 0075
decision 2 — **Accepted, 2026-08-29** — gives the treasury exactly that. Both
halves: a credit (`LoanBook`) and a relaxed floor (`Treasury.setOverdraftFloor`).

**This document named its own reversal in advance, which is the part worth
reading.** Its own *"What would change my mind"* said: *"A loan or grant
surface. … A loan is an overdraft in different clothes, and if one is ever
wanted, it should be a *credit* with its own repayment schedule rather than a
relaxation of the balance's floor — **otherwise the argument above
collapses.**"* ADR 0075 decision 2 did **both** — it added a credit *and*
relaxed the floor — so the condition this document set for its own collapse was
met exactly, and by the letter rather than the spirit.

**And nothing said so for two days.** `grep 0075 docs/adr/0049-*.md` returned
**zero** until this edit.

**The wording here was changed to satisfy `adr-status-reference-contract`, and
that is worth two sentences.** A first draft put decision 1 in the passive with
that other document as the agent, and the gate read it as a claim that **the
other document** holds the status the passive names -- which it does not; it is
`Accepted`. That is the *object of a relation rather than its subject* case the
gate's own docblock names as a known limit. The phrasing is now active -- ADR
0075 decision 2 **replaces** decision 1 -- which removes the ambiguity for the
gate and for a reader at the same time, and is the better sentence on its own
merits.

**And the sentence you are reading was itself rewritten for the same gate, one
turn later, which is the finding.** Quoting the rejected draft verbatim
re-tripped it: the gate reads English claims and cannot tell a quotation from an
assertion. So the number is replaced by a description above, exactly as
`docs/adr/0056-...md` open question 3 does after #647 hit this on 2026-08-30 --
*"so that quoting a sentence that expired does not re-assert a status the ADR no
longer holds"*. **Third recorded instance of that limitation in two days**, and
the trade is the right one: a gate whose whole subject is sentences going stale
is worth keeping, and the cost is paid by whoever writes about it. `adr-status-reference-contract.test.ts` cannot catch
this class: it compares a *cited* status to the document that holds it, and no
sentence anywhere claimed a false status about 0049 — the defect was a decision
contradicted with no citation at all. Recorded because the next document to
collapse this way will do it the same silent way.

**What is NOT replaced**: decisions 2-6, which are what this document is
accepted for. Arrears are still a second non-negative integer beside the
balance, they still accrue rather than overdrawing the wage bill, and
`PayrollSystem` still pays `min(due, balance)`. The negative balance ADR 0075
licenses is a *floor the owner may lower*, not a licence for payroll to overdraw
— those are different mechanisms and this document's still-live half is the
second one.

It answers [ADR 0042](./0042-attaching-consequences-to-the-simulation-loop.md)
open question 3 — *"Does a recurring debit charge, or accrue? Step 3's shape
depends on it, and so does whether the save carries a new field or a signed
one."* — and it is written because
[ADR 0017](./0017-money-primary-resource-model.md) closes its own answer 3 with
a sentence that forbids the alternative: *"None of that is licensed to be
decided in implementation code."* The decision below was taken in a docblock in
`src/simulation/economy/payroll.ts` first, and this document exists to move it
where that sentence says it belongs. ADR 0042 is itself still **Proposed**; what
authorises the code on this branch is the owner's instruction to take step 3,
not this document.

**The number is provisional.** ADR numbers are assigned centrally after drafts
return (`AGENTS.md`), and 0049 is the number `docs/adr/README.md` states as next
free at the time of writing — a ceiling rather than a reservation, because an
unmerged branch cannot be seen from that index. If 0049 collides, renumber this
file, its row in `docs/adr/README.md`, and every citation of it
(`grep -rn "0049" src/ tests/ docs/`).

**The row in `docs/adr/README.md` is added in the same commit, and that is not
optional here.** `tests/foundation/adr-numbering-contract.test.ts` compares the
set of rows in that index against the set of files in this directory and fails
if they differ, so a draft carrying a literal `XXXX` filename, or a numbered
file with no row, turns the foundation suite red. The pre-commit to being
renumbered is the paragraph above; the row is the mechanical requirement.

## Context

### The question, and the two documents that leave it open

`Treasury` cannot hold a negative balance. Four validators say so, and they were
counted rather than remembered:

- `src/simulation/economy/treasury.ts:86` — the constructor refuses a negative
  opening balance.
- `src/simulation/economy/treasury.ts:97` — `canAfford` bounds a spend by the
  balance, which is what makes `spend` refuse rather than overdraw.
- `src/simulation/economy/treasury.ts:133` — `credit` refuses a negative amount.
- `src/simulation/economy/treasury.ts:147` — `restore` refuses a negative
  restored balance.

A fifth is in the save format: `balanceMinorUnits: z.number().int().nonnegative().safe()`
(`src/persistence/save-schema.ts:954`). **Only two of the five constrain the
balance itself**; the other three constrain amounts moving across it. The
distinction matters because it is the two that a signed balance would have to
relax, and the schema one is the load-bearing one — a negative balance is not a
state the *format* can hold, so overdrawing is not a change to one class.

ADR 0042 states the choice and declines it:

> A debt state is either a sign change on a persisted field or a new persisted
> arrears field, and both are `AGENTS.md` boundary 7 changes needing a version
> and a migration.

ADR 0017 answer 3 settles the *policy* and, in doing so, assumes the sign
change without arguing for it:

> **Accepted: insolvency is a state, not a loss condition.** At a negative
> balance the state stops paying for discretionary things in a defined order and
> the prison degrades visibly — deliveries refused first, then construction
> halted, then staff unpaid with the morale and incident consequences that
> follow. No game-over, no silent stall.

So the ladder is decided and is not reopened here. What is open is the two
sentences' shared premise — *"at a negative balance"* — and this document
disagrees with it while keeping everything the paragraph is actually for.

### What comparable management sims do

Researched rather than assumed, and the weakness of the sourcing is stated
up front: these are community wikis, storefront guides and forum threads, not
primary design documents, and none of them was verified by playing the game.
They are used to establish that the design *space* has three families, which is
a claim that survives weak sourcing, and not to establish any one game's exact
numbers, which would not.

- **Insolvency as a persistent state, with recovery and no loss screen.**
  *Cities: Skylines* is the closest analogue: there is no bankruptcy game-over,
  new construction is blocked while the city is broke, and the player digs out
  by cutting services and raising taxes; a bailout exists and costs the player
  achievements rather than the run.
- **Insolvency as the fail condition.** *Two Point Hospital* makes bankruptcy
  the explicit fail state, and sells an overdraft — loans at punishing interest —
  as the way to survive one bad decision. *Game Dev Tycoon* ends the run once a
  company is too far in debt after a bailout.
- **A missed payday as a mood event rather than an economic one.** RimWorld has
  no wages in the base game at all; the popular *Colonist Wages* mod is the
  reference point, and its rule is that a colonist "will get annoyed if
  underpaid or a payday is missed" — the debt is priced in morale, not in
  currency.

The first family is the one ADR 0017 already chose, in almost the same words.
The second is excluded by that acceptance. The third is not an alternative to
either: it is the *bottom rung* of the ladder ADR 0017 authored, and it needs a
representation of "a payday was missed" before it can fire — which is exactly
what this document has to supply.

### The measurement that decided how hard this had to bite

30 in-game days of the real kernel, driven through real commands, each scenario
run twice — once with `PayrollSystem` registered and once with its `update`
neutered and nothing else changed. The full table is in the commit that adds
this file; the shape of it:

| prison | occupied places | wage bill/day | income/day | balance, day 30 (debit on / off) | first unpaid day |
| --- | --- | --- | --- | --- | --- |
| 8 cells, 8 prisoners, **1 guard** — what the staffing rule asks for | 8 | 80 | 2,400 | 94,000 / 96,400 | never |
| 16 cells, 16 prisoners, 2 guards | 16 | 160 | 4,800 | 163,000 / 167,800 | never |
| 8 cells, 8 prisoners, 3 guards | 8 | 240 | 2,400 | 89,040 / 96,240 | never |
| no cells, no prisoners, 3 guards | 0 | 240 | 0 | 17,560 / 24,760 | never |
| 8 cells, **2** prisoners, **12** guards | 2 | 960 | 600 | 12,720 / 41,520 | never |
| 8 cells, 8 prisoners, **30** guards | 8 | 2,400 | 2,400 | 22,080 / 94,080 | never (flat for ever) |
| 8 cells, 8 prisoners, **40** guards | 8 | 3,200 | 2,400 | 0 / 93,280 | day 27 |
| 8 cells, 8 prisoners, **60** guards | 8 | 4,800 | 2,400 | 0 / 91,680 | day 9 |

**The finding is the opposite of the one that was feared.** The debit does not
bankrupt a competently played prison in a week; at the staffing the game itself
asks for (`DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8`, one guard per eight
prisoners) it costs 80 a day against 2,400 a day of income — **one part in
thirty** — and the balance still climbs from 25,000 to 94,000 over the month.
Break-even needs **thirty times** the staffing requirement, and that was
measured rather than derived: at 30 guards for 8 prisoners the curve is exactly
flat at 22,080 for all thirty days.

That is a statement about this build's content prices and nothing more. It is
**not** a diagnosis that the prices are wrong, and it is not this document's to
fix: ADR 0017 decision 5 says *"This ADR decides no prices and no balance
values"* and routes both to #29, and `wageBand.minPerDay` has two readers — the
daily wage and ADR 0025 decision 2's engagement charge — so moving it moves
both. What the measurement does establish is that the arrears path is reachable
but rare, which is the right place for it to sit while the rest of ADR 0042's
ladder is unbuilt: the debit is the only downward force in the economy until
step 5 lands (ADR 0042 says so), and a lone downward force that could end a run
would be the invisible stall in a different costume.

## Decision

1. **The balance stays floored at zero.** The five validators above stand, and
   `Treasury` is not given a signed balance, an overdraft or a loan.

2. **What a prison cannot pay becomes *arrears*: a second non-negative integer,
   beside the balance rather than inside it.** It lives on `PayrollSystem`
   (`unpaidWagesMinorUnits`), is persisted, and is published on the status
   channel. The money the prison holds and the money it owes are two numbers,
   not one signed one.

3. **Arrears are paid before the day they precede.** Each in-game day the system
   bills `arrears + today's wages`, pays `min(that, balance)` and carries the
   remainder. Money owed to staff is therefore money that cannot be spent on
   bricks, and a prison that earns more than it owes clears itself with no
   command from the player.

4. **Nothing else happens yet, and that is deliberate.** No dismissal, no morale
   penalty, no incident, no game over. Those are ADR 0017 answer 3's *"morale
   and incident consequences that follow"* and they belong to the rung after
   this one; this decision supplies the state they will read.

5. **The arrears field is optional in the save and `SAVE_SCHEMA_VERSION` stays
   at 5.** Absence means "nothing is owed", which is unambiguous as a fact about
   the corpus rather than as a convention: no build that could write a V5 save
   had a recurring charge, so no such save can be hiding a real debt behind a
   missing key. `tests/integration/economy-payroll-save.test.ts` proves it
   against real saves rather than asserting it.

6. **A restored figure that is not a non-negative safe integer is refused; a
   figure with no room left to add a day saturates.** The asymmetry is on
   purpose: a bad *value* is a bad file and should be refused at the boundary,
   where the refusal is legible, while a value one day short of the safe range
   must not throw out of a scheduled system update on a session that has already
   loaded.

## Why arrears rather than a signed balance

**A negative balance would delete the ladder's bottom rung.** This is the
argument, and it is structural rather than aesthetic. ADR 0017's three rungs are
*deliveries refused, construction halted, staff unpaid*. With the balance
floored, those are not three policy gates somebody has to build — they are what
one balance running out already does, in the authored order, because every
*discretionary* spend is refused before the undeclinable one is:

1. `Treasury.spend` refuses a purchase it cannot cover, so
   `ProcurementSystem.purchase` answers `insufficient-funds`.
2. With nothing bought, nothing is deposited into
   `CONSTRUCTION_MATERIALS_CONTAINER_ID`, so `ConstructionSystem` leaves the
   order at `materials-pending`.
3. The payroll cannot be met, and says so.

A treasury that could overdraw would pay the wages in full out of debt, so rung
3 would never be reached and the bottom of ADR 0017's own ladder would be
unreachable in exactly the way it is unreachable today, for a new reason. That
is the whole case, and the three rungs above are asserted against a real session
in `tests/integration/economy-payroll-loop.test.ts` rather than described here.

Two further consequences, neither of them decisive on its own:

- **A debt that is a distinct number can be shown as one.** "You are 4,000 in
  the red" and "you owe your staff 4,000 and have nothing" are different
  sentences, and only the second names who is owed. ADR 0017's stated cost of
  answer 3 is that *"degradation has to be authored and surfaced, or insolvency
  becomes the same invisible stall as #89"* — a signed balance surfaces one
  number that means two things.
- **It is the cheaper format change, and the cheaper one is the reversible
  one.** Relaxing `nonnegative()` on `balanceMinorUnits` widens a field every
  older save already carries, which cannot be undone later without a real
  migration; adding an optional field alongside it can be dropped by deleting a
  key. This is the smaller reason and it would not have decided the question on
  its own.

## Consequences

- **`PayrollSystem` becomes the only place in the runtime that says the prison
  owes somebody something**, and the first stateful thing in `src/simulation/economy/`
  — `StateIncomeSystem` derives everything it reports. Arrears are *history*:
  nothing in a restored session's positions, occupancy or tick could reconstruct
  the fact that a day's wages went unpaid, so dropping the field from the save
  would make saving and reloading the cheapest way out of insolvency in the
  game.
- **A hire costs two days' wage on the day it is made.** ADR 0025 decision 2's
  engagement charge is one day of `wageBand.minPerDay`, and the day boundary
  bills the same day again. The alternative is a per-guard hire tick in the save
  so the payroll can skip a same-day hire — a persisted field bought for a
  rounding difference of one day on a charge that is already standing. Named
  rather than hidden, in `src/simulation/staff/hiring.ts`.
- **`wageBand.minPerDay` is now `.int()` at the catalogue.** It was `nonnegative()`
  and every authored value was already whole, so no content moves. A fractional
  wage would be refused by `Treasury.spend` — every hire of that role would
  answer `insufficient-funds` with a full treasury — and would put
  non-associative float addition into a balance the determinism fingerprint
  hashes.
- **Two counts join `simulation/status-counts`**, taking it to fifteen: the
  daily bill and the arrears. ADR 0003's byte bound was re-measured, not
  adjusted by arithmetic.
- **The economy is now the one part of the simulation a player can lose money
  in without spending it.** Everything the measurement above says about how hard
  that is remains true, and remains #29's to tune.

## What would change my mind

- **A balance pass that makes wages material.** If #29 raises the guard band
  toward the income line, the arrears path stops being rare and the rung after
  this one — morale, dismissal, incidents — has to exist before the state is
  merely punishing. This document does not gate that; it makes it measurable.
- **A second staff store.** `GuardRoster` is the only one there is, so "every
  guard" is "every employee". A non-security staff store would be a second
  source into `dailyWageBillMinorUnits`, not a second payroll — but if it landed
  with a different pay cadence, the single-arrears model would need revisiting.
- **A loan or grant surface.** ADR 0017 decision 3 keeps grants as a secondary
  income line. A loan is an overdraft in different clothes, and if one is ever
  wanted, it should be a *credit* with its own repayment schedule rather than a
  relaxation of the balance's floor — otherwise the argument above collapses.

## Weakest claim

That the ladder's ordering is *produced* by a floored balance rather than merely
consistent with it. The three rungs are asserted in
`tests/integration/economy-payroll-loop.test.ts` against one prison, and the
first two of them are properties of `Treasury.spend` that hold with or without
this decision. What a signed balance would actually destroy is rung 3 alone —
that part is certain — and the claim that the *ordering* comes for free is a
reading of two systems' existing behaviour, not a measurement of every path into
them.
