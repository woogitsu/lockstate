# Does `riskTier` price anything? Measured on `317f487`, v0.0.124

**Date:** 2026-08-28
**Tree:** `317f487` (`chore(release): v0.0.124`), branch `agent/income-risk-tier`
**Question put to this record:** an earlier audit pass reported that *"the
`riskTier` term in `stateIncomeForCompletedDay` is a flat multiply"*, around
`src/simulation/economy/income.ts:175-180`, and inferred that state income
scaling linearly with risk tier makes *"take every maximum-security prisoner"*
the dominant strategy.

**Answer: the reported term does not exist, and the strategy it predicts is not
available to a player.** No change was made to any source file. This record is
the deliverable.

---

## 1. The reported term is not there — VERIFIED

`stateIncomeForCompletedDay` takes one parameter and multiplies by one constant:

```ts
export function stateIncomeForCompletedDay(occupiedPlaces: number): number {
  if (!Number.isSafeInteger(occupiedPlaces) || occupiedPlaces < 0) {
    throw new RangeError('Occupied places must be a non-negative safe integer.');
  }
  return STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS * occupiedPlaces;
}
```

`src/simulation/economy/income.ts:175-180`. The audit's line range is correct;
its reading of those lines is not. There is no `riskTier` factor, no tier table
and no second parameter.

Nor is the citation merely stale. `riskTier` has **never** appeared anywhere
under `src/simulation/economy/` in the directory's entire history:

```
$ git log --oneline -S 'riskTier' -- src/simulation/economy/
(no output)
```

The whole history of the file is five commits (`4f711d5`, `1db8c16`, `6cededc`,
`e1d7ea5`, `ac03d8f`), and none of them introduced or removed such a term.

`grep -rn riskTier src/simulation/economy/ src/simulation/incidents/
src/simulation/security/` returns nothing.

## 2. It is not an omission — ADR 0017 decided it — VERIFIED

The flat per-occupied-place rate is the accepted model, not an unfinished one.
ADR 0017 decision 6 reads *"The state pays per prisoner-day, accrued per
occupied place"*, and its reasoning section rules out the alternatives by name
— per-facility, block grant, per-place — on the grounds that per-prisoner-day
is *"the only one of the four that makes the two things the player builds —
capacity and the ability to keep people in it safely — pay off through the same
line"*.

The same section then names the tension the model *does* create, and it is not
the one the audit predicted:

> The consequence to accept: **income scales with population, and so does
> trouble.** That is the intended tension, and it means overcrowding must be
> punished elsewhere (#79, #80, #81) or the optimum is to pack the prison.

So the recorded, already-owned economic debt is **population**-scaling, tracked
against #79/#80/#81. Risk-scaling is not a debt anyone has incurred, because no
decision ever proposed it.

Decision 5 of the same ADR — *"This ADR decides no prices and no balance
values"* — reserves pricing to issue #29. Introducing a risk premium inside
`income.ts` would therefore have been architecture decided in implementation
code, which `AGENTS.md` prohibits outright.

## 3. Measured: income is identical across risk composition — VERIFIED

Structural argument is not measurement, so the economics were run on the real
kernel: `createNewSimulationRuntime`, the real `packCommand` decoder, the real
session command router, the real construction, navigation and intake systems.

Two sessions, same seed (`0x0b1ec7`), same four walled 2x3 `room.cell`s each
furnished with a `bed-wooden` and a `toilet-brick`, same four admissions, run
ten in-game days. **The only difference between the two runs is the admission
profile.**

| | minimal-risk run | high-risk run |
| --- | --- | --- |
| `AdmitPrisoner` params | `sentenceLengthTicks: 10_000, priorIncidents: 0` | `sentenceLengthTicks: 500_000, priorIncidents: 2` |
| resulting `riskTier`s | `[0, 0, 0, 0]` | `[3, 2, 2, 2]` |
| occupied places | 4 | 4 |
| materials spend | 420 | 420 |
| balance after build + admit | 24,580 | 24,580 |
| treasury delta per day, days 1-10 | 1,200 x10 | 1,200 x10 |
| balance after 10 days | **36,580** | **36,580** |

Byte-identical. 4 places x 300 = 1,200 a day in both, exactly as decision 6
specifies and with no tier term anywhere in it.

(The high-risk draw lands on `[3, 2, 2, 2]` rather than four 3s because
`classifyPrisoner` caps its score at 3 and adds a screening variance of
-1/0/+1; a uniformly tier-3 population is not producible from the command
surface. It does not matter to the result — the point is that the two
populations differ sharply in tier and not at all in income.)

## 4. The measurement is not blind — mutation evidence — VERIFIED

A negative result is worthless if the instrument could not have seen a positive
one. Both mutations were applied by hand to the real source, measured, and
reverted by hand (never `git checkout`, never `git stash`; `git diff --stat`
confirmed empty after each).

**Mutation 1 — can the probe see the income term at all?**
`src/simulation/economy/income.ts:101`, `300` -> `301`:

```
RED  minimal-risk: treasuryDeltaPerDay 1204 x10, balanceAfter10Days 36620
RED  high-risk:    treasuryDeltaPerDay 1204 x10, balanceAfter10Days 36620
```

Restored by hand:

```
GREEN minimal-risk: balanceAfter10Days 36580
GREEN high-risk:    balanceAfter10Days 36580
```

Both compositions moved together, which is itself the finding restated: the
income path is real and reachable, and it responds to the rate and not to the
tier.

**Mutation 2 — could the probe see income that *did* depend on risk?**
One line injected into `IntakeSystem`'s accommodation-assignment branch
(`src/simulation/prisoners/intake-system.ts`, immediately above
`this.roomInstances.assign(...)`) refusing to house any prisoner of tier >= 2:

```
RED  minimal-risk: occupiedPlaces 4, balanceAfter10Days 36580
RED  high-risk:    occupiedPlaces 0, balanceAfter10Days 24580
```

A 12,000 divergence over ten days. Restored by hand:

```
GREEN minimal-risk: occupiedPlaces 4, balanceAfter10Days 36580
GREEN high-risk:    occupiedPlaces 4, balanceAfter10Days 36580
```

So the instrument detects composition-dependent income when it is present. Its
reading of "identical" in section 3 is a real negative.

## 5. Nor does risk cost anything — VERIFIED

If risk raised costs while income stayed flat, the audit's concern would be
live in the opposite direction. It does not.

- **Incident probability does not read it.** `scoreSectorRisk` weighs exactly
  three terms — `needsPressure`, `staffingShortfall`, `contrabandPressure`
  (`src/simulation/incidents/sector-risk.ts:9-24`, `:82-84`). No tier term.
- **Staffing demand does not read it.** Required guard count comes from a
  `DeploymentSchedule` the player sets, per sector
  (`src/simulation/security/deployment-system.ts:101`,
  `src/simulation/security/deployment-schedule.ts:45-50`) — not from who is
  housed. `income.ts` already rules this resemblance out in writing.
- **Housing capacity does not penalise it.** The accommodation policy is a
  *preference* with fallback, not a gate: high-risk prefers
  `[SOLITARY_CELL, CELL]` and general population `[CELL, SOLITARY_CELL]`
  (`src/simulation/prisoners/intake-system.ts:78`). Measured above: four
  tier-2/3 prisoners housed in four plain `room.cell`s, occupancy 4.
- **The preferred room is if anything cheaper.** `room.solitary-cell` authors a
  2x2 minimum against `room.cell`'s 2x3, with identical bed+toilet requirements
  (`src/content/room-catalog.ts:68-84`), so the smaller perimeter is fewer wall
  segments.
- **Cell sharing is a tie-break, not a cost.** `rateCellSharing` returns a
  preference score used to pick among *free* instances
  (`src/simulation/prisoners/cell-sharing.ts:72-80`); it refuses nobody.

`riskTier` is economically inert in both directions. What it actually drives is
regime group (`classification.ts:35-36`), accommodation preference order,
cell-sharing preference, reclassification bookkeeping
(`classification-review-system.ts:228-237`), and HUD display.

## 6. The strategy the audit predicts is not offered to the player — VERIFIED

This is the part that settles it regardless of any of the above. There is
exactly one producer of `AdmitPrisoner` in the whole application:

```
$ grep -rn "type: 'AdmitPrisoner'" --include=*.ts src/
src/main.ts:2130:            type: 'AdmitPrisoner',
```

and it sends a hardcoded constant:

```ts
const ADMISSION_REQUEST = { sentenceLengthTicks: 10_000, priorIncidents: 0 } as const;
```

`src/main.ts:785`, read at `src/main.ts:2131-2132`. Its own comment says the
values are *"deliberately the least eventful values in range"*, so that the
resulting tier is the seeded screening draw alone.

**A player cannot choose a prisoner's risk.** There is no intake queue, no
accept/reject, no per-arrival dossier. "Take every maximum-security prisoner"
is not a dominant strategy in this build; it is not a strategy, because the
choice it presupposes has no surface. Any risk-priced income model built today
would price a decision nobody can make.

## 7. What the cost side actually looks like, and the payroll branch

Stated because it bounds what could sensibly be tuned here, and because it is
about to change under a different agent.

On `317f487` there are exactly two debits in the application, both one-off and
both player-initiated:

```
$ grep -rn "\.spend(" --include=*.ts src/ | grep -v economy/treasury.ts
src/simulation/economy/procurement.ts:166   -- PurchaseMaterials
src/simulation/staff/hiring.ts:132          -- HireStaff, one day at wageBand.minPerDay
```

Nothing recurs. `staffHireCostMinorUnits` charges `wageBand.minPerDay` **once**
at hire (`src/simulation/staff/hiring.ts:84-88`, `:131`), so a guard costs 80
minor units ever, against 300 per prisoner-day forever. A running prison's
balance is monotonically non-decreasing — the 2026-08-26 failure-modes record
found the same thing and it is still true.

**These figures are from `main` and do not include the recurring payroll debit
being finished concurrently on `agent/0042-step3-recurring-debit`.** That branch
changes the cost side of this same economy. Every number in section 3 is a
gross figure against a zero-operating-cost world and will not survive it — the
income rate of 300 was itself chosen in anticipation of exactly that landing
(`income.ts:60-101` records the reasoning, and
`docs/research/2026-08-25-economy-rate.md` predicted the 200 -> 300 revision).
No tuning proposed here would compose sensibly with a payroll debit that has
not landed, which is a second and independent reason this record proposes none.

## 8. Conclusion

No defect. No change. Specifically:

1. The reported `riskTier` term in `stateIncomeForCompletedDay` does not exist
   and never has (§1).
2. The flat rate is ADR 0017 decision 6, accepted, with the alternatives
   considered and rejected on the record (§2).
3. Income is measured identical across sharply different risk populations, on
   the real kernel, with the instrument proven able to detect a difference (§3,
   §4).
4. Risk carries no offsetting cost either, so the inverted concern does not
   hold (§5).
5. The player has no control over risk composition at all, so no
   composition-based dominant strategy exists to fix (§6).
6. Pricing is reserved to #29 by ADR 0017 decision 5, and the cost side is
   mid-change on another branch (§7).

Whether an *intake choice* should exist — a queue of named arrivals with
visible risk, an intake grant, a refusal cost — is a real and open design
question, and it is the question the audit note was reaching for. It is a
product decision about a surface that does not exist, not a defect in
`income.ts`, and it belongs to #29 and to whoever owns the intake surface.

## Weakest claim, and what would change my mind

**The weakest claim is §6's**, that no player can influence risk composition.
It rests on there being exactly one `AdmitPrisoner` producer in `src/` and on
`ADMISSION_REQUEST` being a constant — both greps, both re-read. What it does
*not* cover is indirect influence: `ClassificationReviewSystem` reassesses tiers
from a `DisciplinaryRecord` (`classification.ts:130-193`), so a player who
manages the prison badly may raise tiers over time. That is influence over risk,
though not selection of it, and it still buys and costs nothing under §3 and §5.

I would change my mind about the whole record if any of these turned up:

- a second `AdmitPrisoner` producer, or `ADMISSION_REQUEST` becoming
  player-editable — §6 falls, and the design question in §8 becomes live;
- a `riskTier` read reaching `Treasury` by any route — §1 and §5 fall;
- a tier term entering `scoreSectorRisk`'s weights — §5 falls, and risk starts
  carrying a real cost, at which point flat income becomes worth revisiting;
- ADR 0017 decision 6 being superseded, or #29 deciding a risk-differentiated
  schedule — §2 falls.

The measurement in §3 is the claim I am most confident in: it is two runs of the
real kernel differing in one input, and §4 shows the instrument is not blind.
