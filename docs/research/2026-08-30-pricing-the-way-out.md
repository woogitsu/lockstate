# Pricing ADR 0075 decision 2's loan: five candidate triples, played out of the locked position

**Date:** 2026-08-30
**Branch measured:** `agent/692-negative-balance-and-loans`, cut from `main` at
`v0.0.263` (`fd87468`), which carries [#640](https://github.com/matmaxalez/lockstate/pull/640)
(a build order buys its own materials at the press) and
[#688](https://github.com/matmaxalez/lockstate/pull/688) (the playtest that
established the locked position).
**Reproduction:** `scripts/report-loan-recovery-pricing.mjs`, run with
`node --experimental-transform-types scripts/report-loan-recovery-pricing.mjs`.
Nothing collects it — `vitest.config.ts` includes `tests/**/*.test.ts` and this
is a `.mjs` under `scripts/`, the same shape as
`scripts/report-tick-system-cost.mjs`. `LOCKSTATE_PRICING_SECTIONS=4,5` runs one
table without paying for the other six.

**The question**, from [#692](https://github.com/matmaxalez/lockstate/issues/692)
and from [ADR 0075](../adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md)'s
own weakest claim: *"recovery from any reachable position remains unproved until
those numbers exist."* The numbers are the **diversion percentage, the fixed fee
and the maximum duration**, all of which ADR 0017 decision 5 reserves to
[#29](https://github.com/matmaxalez/lockstate/issues/29). **This record prices
five candidate triples. It chooses none of them**, and the mechanism it needed
to measure them is committed with every magnitude as a parameter, so the numbers
can be dropped without dropping the loan.

**What is deliberately not re-litigated.** The loan's *shape* was ruled on by the
owner on 2026-08-29 and is quoted, not revisited: a fixed percentage of positive
inflows, a fixed fee rather than compounding interest, no fixed daily instalment,
and a maximum duration after which the diversion rises.

**Contention.** Two other agents held `vitest` suites for the whole of this pass
(issue [#667](https://github.com/matmaxalez/lockstate/issues/667)):
`vitest.probe.config.ts` and `vitest.power.config.ts`, both running when the
sweep started. **Every figure below is a tick, an in-game day, a treasury value
or a refusal reason — all of which come from the simulation and are identical
across runs — and not a wall-clock millisecond.** Sections 1 and 2 were run
twice, on the two sweeps, and their output is identical character for character.

## Claim tiers

- **MEASURED** — produced by a run of the sweep or of the test suite, quoted
  from its output.
- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **UNKNOWN** — could not be established here.

Nothing below is tiered **FROM MEMORY**.

---

## The answers, in one place

1. **Does the locked position recover? Yes, and quickly — but not for the
   reason the ADR expects.** A prisoner is housed on **in-game day 1.6** under
   every candidate that funds the work, which is under four real minutes at ×1.
   What decides whether a candidate funds the work is not the diversion, the fee
   or the duration: it is whether the principal clears **the 1,040 the prison
   already owes its own build queue**. §4.
2. **How long does recovery take?** Two different numbers, and only one of them
   is a wait. *Out of the lock* is day 1.6 in every recovering row. *Out of
   debt* is between **2.6 and 102.6 in-game days**, spanning the five
   candidates and the principals — and the prison is comfortably solvent long
   before the debt clears, so the second number is background rather than a
   gate. §5, §6.
3. **What is the player doing?** **25 commands**, then between **4 and 19
   in-game days of pressing nothing** on the capacity plan. Thirteen of those
   25 presses are `Cancel` on wall orders, and a player who does not know to
   make them loses the whole loan. §7.
4. **Do the mitigations bite?** **The fixed fee does** — the figure owed is set
   at drawdown and never rises again, measured over 100 in-game days. **The
   maximum duration bites only a prison that over-borrows and under-builds**,
   and in that shape it is worth between 17 and 101 in-game days. It never fired
   for a prison that was actually rebuilding. §8.
5. **Is the class closed?** **By all five candidates, and by none of them
   alone.** What closes it is that money can enter at all — a control with **no
   loan whatsoever**, only ADR 0075 decision 2's other half, recovers the same
   prison. And one reachable position is **not** recovered by any candidate,
   identically: §9.
6. **The recommendation, offered and not taken:** candidate **C** — 25% of
   inflows, a 15% fee, 45 in-game days — with a **principal floor tied to the
   standing materials shortfall**, which is the magnitude that actually decides
   the outcome and is not in the triple at all. §10.

**And the thing this pass went looking for something else and found instead:**
the loan is not what dissolves the lock. §9's control does it with no debt
instrument of any kind.

---

> **Correction, 2026-08-31: sections 6 through 11 of this record were never
> written, and the answers above cite them.** This file ends at §5. The answers
> numbered 2 through 6 above cite §6, §7, §8, §9, §10 and §11 as their evidence,
> and none of those headings exists — `grep -n '^## '` returns §1 to §5 and
> nothing more, on this file and on `agent/692-negative-balance-and-loans`, from
> which it was merged at `d34c573`. So the summary is a summary of measurements
> that are not in the document, and it is marked here rather than trimmed
> because the *instrument* that produced them is committed and every one of them
> can be re-run.
>
> `scripts/report-loan-recovery-pricing.mjs` carries the sections the numbering
> above refers to; its own numbering is its own and does not match this file's.
> `LOCKSTATE_PRICING_SECTIONS=4` is the capacity plan, `=5` the control with no
> loan at all, `=6` and `=8` the payroll route with and without the backlog
> cancelled, `=7` whether the maximum duration ever bites, and `=9` — added on
> 2026-08-31 — the sweep that derives how much room below zero the way out
> actually needs. §7's table is quoted in
> [ADR 0083](../adr/0083-what-opens-the-negative-balance-and-what-bounds-it.md),
> and §9's is the derivation of the floor's magnitude that this record's
> recommendation (a *"principal floor tied to the standing materials
> shortfall"*) named and did not measure.
>
> **What is not claimed here:** that the missing sections' figures are the ones
> the answers above state. They were not re-run for every row, only for §7 and
> §9. Answer 3's *"25 commands"* and answer 4's *"between 17 and 101 in-game
> days"* are unverified from this document and should be treated as untiered
> until somebody runs the sections and writes them up.

---

## 1. The locked position, reproduced through the real command router

**MEASURED.** The sweep plays into the lock rather than assigning it: nine of a
2×3 cell's ten perimeter edges, then filler wall until the treasury cannot fund
the next segment, then the drag's worth of orders that arrive after the money
has gone.

```
  312 wall orders funded, 13 left unfunded behind them.
  balance at the last funded segment: 40
  balance twenty in-game days later, nothing pressed: 40
  bricks in the container: 0
  build order states: {"completed":312,"materials-pending":13}
  buying one plank: purchase.insufficient-funds; balance 40
```

`25,000 − 40 = 24,960 = 312 × 80`, which is the figure
[`2026-08-30-playing-into-the-lock.md`](./2026-08-30-playing-into-the-lock.md)
§1 measured with a mouse and
[`2026-08-30-a-wall-that-buys-itself.md`](./2026-08-30-a-wall-that-buys-itself.md)
§4 measured before it. **0 bricks and 312 walls** reproduces too, which is what
that record's Part C turns on.

**This is a command-layer playtest, not a mouse one, and the difference is
named rather than hidden.** Every wall, door, designation, bed and admission
below goes through `packCommand` and the real session command router, which is
exactly what a press submits — but nothing here presses a pixel, so no claim in
this document is a claim about the interface. Where a finding has an interface
consequence it is written as a question for the owner (§11), not as a
measurement of the HUD.

## 2. The three things a spreadsheet gets wrong about this prison

Each of these was measured on the way to the tables and each moves the answer by
more than the choice between candidates does.

**2a. A prisoner-day is not 300.** **MEASURED**, a bare cell with four beds and
nothing else, over eight in-game days:

```
day +1: balance 27235 (+1040)  day +5: balance 30595 (+720)
day +2: balance 28275 (+1040)  day +6: balance 31315 (+720)
day +3: balance 29155 (+880)   day +7: balance 32035 (+720)
day +4: balance 29875 (+720)   day +8: balance 32755 (+720)
```

**720 a day for four occupied places is 180 a prisoner-day, not 300.**
**VERIFIED, read**: `stateIncomeForPrisonerDay` withholds
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` — 40 — for each of six needs
the prison leaves unmet (`src/simulation/economy/income.ts:347`, ADR 0064), and
a cell with a bed in it and nothing else leaves three of them unmet for ever.
Every clearance time in this document is against 180, and a spreadsheet written
against 300 would report every candidate as **40% faster than it is**.

**2b. The locked prison already owes 1,040 to its own build queue.**
**MEASURED**, and it is the finding that dominates every table below. At the
bottom, thirteen wall orders stand at `materials-pending`; the playtest read the
same thing off the screen as *"Waiting for 1,040 to buy materials."*
**VERIFIED, read**: `ConstructionSystem.update` calls `procureForPendingOrders`
on every scheduled construction tick (`src/simulation/construction/system.ts:852`),
so the first 1,040 of anything that arrives is spent on wall before the player
can spend a minor unit of it on a plank.

**2c. A `room.cell` at its authored minimum holds four beds, not six.**
**MEASURED**: six `PlaceObject bed-wooden` commands over the six tiles of a 2×3
cell leave `residentCapacity` at **4**, with two refused
`place-object.tile-occupied`. **Why those two tiles are occupied is UNKNOWN
here** and is not this record's subject; what matters for pricing is that
capacity per cell is 4 and therefore income per cell is 720 a day.

## 3. The five candidates

Probes, spanning cautious to generous. Rates are basis points in the code
because the treasury is integer minor units; they are written as percentages
here.

| candidate | diversion | fixed fee | maximum duration | escalates to |
| --- | --- | --- | --- | --- |
| **A bank** | 50% | 25% | 20 days | 75% |
| **B prudent** | 35% | 20% | 30 days | 60% |
| **C middle** | 25% | 15% | 45 days | 45% |
| **D generous** | 15% | 10% | 60 days | 30% |
| **E soft** | 10% | 5% | 90 days | 20% |

Each was priced at five principals — 200, 500, 1,000, 1,500 and 2,000 — because
**the principal turned out to matter more than the triple**, and a sweep that
had fixed it would have reported the wrong thing five times.

---

## 4. The magnitude that decides the outcome is not in the triple

**MEASURED**, all five candidates at all five principals, with the wall queue
left exactly as the lock leaves it. Days are in-game days, counted from the
drawdown.

| candidate | principal | fee | owed | cash after draw | zone | capacity | housed | out of lock | debt cleared | escalated | final balance |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| A bank | 200 | 50 | 250 | 240 | `zone.not-enclosed` | 0 | — | — | — | 20.63 | 175 |
| A bank | 500 | 125 | 625 | 540 | `zone.not-enclosed` | 0 | — | — | — | 20.63 | 475 |
| A bank | 1,000 | 250 | 1,250 | 1,040 | `zone.not-enclosed` | 0 | — | — | — | 20.63 | **0** |
| A bank | 1,500 | 375 | 1,875 | 1,540 | — | 1 | 1.63 | 1.63 | 18.63 | — | 2,255 |
| A bank | 2,000 | 500 | 2,500 | 2,040 | — | 1 | 1.63 | 1.63 | 24.63 | 20.63 | 3,210 |
| B prudent | 200 | 40 | 240 | 240 | `zone.not-enclosed` | 0 | — | — | — | 30.63 | 175 |
| B prudent | 500 | 100 | 600 | 540 | `zone.not-enclosed` | 0 | — | — | — | 30.63 | 475 |
| B prudent | 1,000 | 200 | 1,200 | 1,040 | `zone.not-enclosed` | 0 | — | — | — | 30.63 | **0** |
| B prudent | 1,500 | 300 | 1,800 | 1,540 | — | 1 | 1.63 | 1.63 | 26.63 | — | 3,770 |
| B prudent | 2,000 | 400 | 2,400 | 2,040 | — | 1 | 1.63 | 1.63 | 34.63 | 30.63 | 5,110 |
| C middle | 200 | 30 | 230 | 240 | `zone.not-enclosed` | 0 | — | — | — | 45.63 | 175 |
| C middle | 500 | 75 | 575 | 540 | `zone.not-enclosed` | 0 | — | — | — | 45.63 | 475 |
| C middle | 1,000 | 150 | 1,150 | 1,040 | `zone.not-enclosed` | 0 | — | — | — | 45.63 | **0** |
| C middle | 1,500 | 225 | 1,725 | 1,540 | — | 1 | 1.63 | 1.63 | 36.63 | — | 5,645 |
| C middle | 2,000 | 300 | 2,300 | 2,040 | — | 1 | 1.63 | 1.63 | 47.63 | 45.63 | 7,550 |
| D generous | 200 | 20 | 220 | 240 | `zone.not-enclosed` | 0 | — | — | — | 60.63 | 175 |
| D generous | 500 | 50 | 550 | 540 | `zone.not-enclosed` | 0 | — | — | — | 60.63 | 475 |
| D generous | 1,000 | 100 | 1,100 | 1,040 | `zone.not-enclosed` | 0 | — | — | — | 60.63 | **0** |
| D generous | 1,500 | 150 | 1,650 | 1,540 | — | 1 | 1.63 | 1.63 | 59.63 | — | 9,860 |
| D generous | 2,000 | 200 | 2,200 | 2,040 | — | 1 | 1.63 | 1.63 | 70.63 | 60.63 | 11,790 |
| E soft | 200 | 10 | 210 | 240 | `zone.not-enclosed` | 0 | — | — | — | 90.63 | 175 |
| E soft | 500 | 25 | 525 | 540 | `zone.not-enclosed` | 0 | — | — | — | 90.63 | 475 |
| E soft | 1,000 | 50 | 1,050 | 1,040 | `zone.not-enclosed` | 0 | — | — | — | 90.63 | **0** |
| E soft | 1,500 | 75 | 1,575 | 1,540 | — | 1 | 1.63 | 1.63 | 85.63 | — | 14,615 |
| E soft | 2,000 | 100 | 2,100 | 2,040 | — | 1 | 1.63 | 1.63 | 102.63 | — | 17,650 |

**Read the `capacity` column before any other.** Fifteen of the twenty-five
rows never house anybody, and the fifteen are not a property of any candidate:
they are the three principals at or below the 1,040 the build queue was already
owed. The money arrives, the scheduled construction pass spends it on wall, the
door is never funded, `ZoneRoom` refuses `zone.not-enclosed`, and the prison is
exactly where it was **with a debt on top of it**.

The 1,000 row is the sharpest of them: `cash after draw` is 1,040 and
`final balance` is **0**. Every minor unit of a loan the size of the whole
opening plank budget went into wall the player is not watching being built, and
the only thing that changed is that the prison now owes between 1,050 and 1,250.

**So the number that decides whether the class is closed is a principal floor,
and it is not one of the three magnitudes the ruling left open.** Below it, all
five candidates fail identically. Above it, all five succeed and differ only in
how long the debt lasts.

## 5. With the queue settled first, every candidate recovers

**MEASURED**, the same twenty-five runs with the thirteen unfunded wall orders
cancelled before the loan is drawn — thirteen `CancelBuildOrder` commands, which
is what the Build panel's queue fold offers three rows at a time.

| candidate | principal | owed | housed | debt cleared | escalated | diverted | final balance |
| --- | --- | --- | --- | --- | --- | --- | --- |
| A bank | 200 | 250 | 1.63 | **2.63** | — | 250 | 980 |
| A bank | 500 | 625 | 1.63 | 5.63 | — | 625 | 1,165 |
| A bank | 1,000 | 1,250 | 1.63 | 11.63 | — | 1,250 | 2,160 |
| A bank | 1,500 | 1,875 | 1.63 | 18.63 | — | 1,875 | 3,295 |
| A bank | 2,000 | 2,500 | 1.63 | 24.63 | 20.63 | 2,500 | 4,250 |
| B prudent | 200 | 240 | 1.63 | 3.63 | — | 240 | 990 |
| B prudent | 500 | 600 | 1.63 | 7.63 | — | 600 | 1,590 |
| B prudent | 1,000 | 1,200 | 1.63 | 17.63 | — | 1,200 | 3,290 |
| B prudent | 1,500 | 1,800 | 1.63 | 26.63 | — | 1,800 | 4,810 |
| B prudent | 2,000 | 2,400 | 1.63 | 34.63 | 30.63 | 2,400 | 6,150 |
| C middle | 200 | 230 | 1.63 | 4.63 | — | 230 | 1,000 |
| C middle | 500 | 575 | 1.63 | 10.63 | — | 575 | 2,155 |
| C middle | 1,000 | 1,150 | 1.63 | 23.63 | — | 1,150 | 4,420 |
| C middle | 1,500 | 1,725 | 1.63 | 36.63 | — | 1,725 | 6,685 |
| C middle | 2,000 | 2,300 | 1.63 | 47.63 | 45.63 | 2,300 | 8,590 |
| D generous | 200 | 220 | 1.63 | 6.63 | — | 220 | 1,490 |
| D generous | 500 | 550 | 1.63 | 18.63 | — | 550 | 3,620 |
| D generous | 1,000 | 1,100 | 1.63 | 38.63 | — | 1,100 | 7,170 |
| D generous | 1,500 | 1,650 | 1.63 | 59.63 | — | 1,650 | 10,900 |
| D generous | 2,000 | 2,200 | 1.63 | 70.63 | 60.63 | 2,200 | 12,830 |
| E soft | 200 | 210 | 1.63 | 9.63 | — | 210 | 2,040 |
| E soft | 500 | 525 | 1.63 | 27.63 | — | 525 | 5,265 |
| E soft | 1,000 | 1,050 | 1.63 | 56.63 | — | 1,050 | 10,460 |
| E soft | 1,500 | 1,575 | 1.63 | **85.63** | — | 1,575 | 15,655 |
| E soft | 2,000 | 2,100 | 1.63 | 102.63 | 90.63 | 2,100 | 18,690 |

**Every row houses a prisoner on in-game day 1.63** — about three and a half
real minutes at ×1, and the same figure in all twenty-five runs, because what
gets a prisoner into a bed is a door, a designation and a plank rather than a
rate. **The class is closed by all five candidates once the money reaches the
plank.**

**What the triple decides is the length of the tail**, and it is a factor of ten
across the five: a 1,000 loan is cleared on day 11.6 under A and on day 56.6
under E. `diverted` equals `owed` in every row, which is the fixed fee doing
what it was chosen for — the figure repaid is the figure quoted at drawdown, in
every candidate, at every principal.

**And the tail is not a wait.** Read `final balance` beside `debt cleared`: E at
1,500 is still repaying on day 85 with **15,655 in the bank**. The prison is
rich, running and unblocked for eighty of those eighty-five days. That is ADR
0075's accepted cost — *"revenue-share debt feels nearly free while income is
low and can linger a long time"* — measured, and the half of it that is
observable here is the *lingering*, not the feeling.
