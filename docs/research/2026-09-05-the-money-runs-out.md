# The money runs out — 2026-09-05

**The verdict in one line: yes, a player can run out — an *earning* prison
reaches the floor in three day boundaries and it is the third way in this
repository has now measured — and the descent is well signposted from the
moment the balance goes negative and completely silent for the whole 25,000
before that.**

## Tree, version, and what was and was not touched

Played on `agent/playtest-the-money-runs-out`, cut from `origin/main` at
**`b984445f` (v0.0.475)**, which was still the head of `origin/main` when this
branch was taken and when the acts below ran (`git fetch origin` then
`git log --oneline origin/main -1` → `b984445f chore(release): v0.0.475`). The
running application reported itself in the status strip as
`Lockstate, PRE-ALPHA build, version 0.0.475, commit 0c053bd` in act 2 and
`… commit 3a33df2` in act 4 — same version, and the commit differs only because
this branch gained *this record's own commits* between the two runs.
**`src/` is byte-identical to `b984445f` in both**:
`git diff --stat b984445f..HEAD -- src/` is empty and `git status --short src/`
is clean.

Viewport **1440×900**. Instrument:
`tests/browser/playtest-2026-09-05-the-money-runs-out.playtest.ts`.

**Nothing under `src/` was changed by this record.** No source mutation was
taken; every number below comes either from a run of the instrument or from a
file opened and read. `git status --short src/` is clean.

**Nothing in CI collects the instrument** — `tests/browser/playwright.config.ts`
is `testMatch: /.*\.spec\.ts$/` and the file is `.playtest.ts`. It is evidence
and never a gate.

**LFS.** `file public/assets/actors/actor.guard.base.idle.png` in this worktree
→ `PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced`. Nothing below
is a claim about rendering, but a worktree that had skipped the check would have
lost every actor sprite and run green anyway.

## Claim tiers

- **MEASURED** — produced by a run of this instrument, quoted from its output.
- **VERIFIED, read** — a source file was opened at the cited `file:line`.
- **ARITHMETIC** — derived from figures that were measured or read, and stated
  as derivation rather than as observation.
- **JUDGEMENT** — what a player would do or feel. Legitimate, and labelled.

Nothing below is **FROM MEMORY**.

## The question as given

> Money is this game's only resource and, so far, its only pressure. Every
> session that measured income found a constant. So: **can a player actually run
> out? And when they do, does the game tell them what is happening, what it
> costs, and what to do?**

## What this record extends rather than re-derives

- `docs/research/2026-09-04-can-this-prison-fail.md` answered *can it fail* with
  **yes, exactly once**: an **empty** prison that hires sixty guards pins at
  −2,500 and cannot restart its income. That record names its own gap, and this
  one is written into it: *"That −2,500 is unreachable for a prison that already
  earns […] that is the interesting one for balance; this record only shows that
  the empty version of it is terminal."*
- `docs/research/2026-08-30-playing-into-the-lock.md` measured the wall route at
  v0.0.257 — 312 segments funded, the 313th refused, **40 left** — and already
  refuted issue #641's *"a single sustained drag reaches it"*. Act 1 is a
  **re-check of those two figures two hundred releases later**, not a second
  derivation of them.
- `docs/research/2026-09-04-what-pressure-there-is.md` measured the shipped and
  the restored income curves at four housed prisoners. Act 2 uses the same
  four-bed shape deliberately, so its income figures can be read against that
  record's without a conversion.

---

## The answer in one paragraph

**Yes, and it is easy — but only in the half of the range where the game says
nothing.** The 25,000 grant can be spent to nothing in **one press** of a
control that prices itself honestly and a chip that does not react at all
(finding 1), or dragged away a segment at a time by the one gesture in the game
that never states a price and is never pre-flighted (finding 2). Nothing on
screen distinguishes 25,000 from 40. Below zero the opposite is true: the
insolvency ladder is *well* built, three tones and three different true
sentences at −1, at −1,250 and at −2,500, all changing on the same steps the
code refuses on (finding 3). An **earning** prison — the case the previous
record could not reach — takes **three day boundaries** to fall from solvent to
the floor when its payroll is twice its income, and once there it is a
different state from the empty prison that has been measured before: it keeps
earning, the payroll takes every unit of it before the balance can move, and
the arrears climb by exactly `bill − income` a day, `770 → 11,870` over nine
boundaries (finding 6). The way out is real and is **dismissal** — three rows
at a time behind a fold labelled `On the payroll`, two presses each, no refund
and no severance (finding 7) — which is none of the three remedies ADR 0075
accepted, because none of those three exists in `src/` (finding 5). And the one
free lever that restores income at the floor, `Admit`, is never named by any
sentence about money.

---

## Reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=5328 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-the-money-runs-out.playtest.ts -g "act 1"
```

`-g "act 2"` and `-g "act 4"` for the others. `git lfs checkout` first in a
worktree, or the atlases fail to decode and every actor is missing while the run
still passes.

**Which acts produced what, and which one is superseded.**

| act | what it plays | state |
| --- | --- | --- |
| **1** | one gesture, the price nobody shows, and the balance at which the first sentence arrives | run; findings 1 and 2 |
| **2** | an earning prison over-hired to the floor, nine paydays there, then dismissal | run to the end of the descent; findings 3, 4, 6, 7. **Its recovery half was abandoned** — see "Instrument failures" |
| **3** | the same prison held at the floor without dismissing | **not run**, and named in "What this record does not claim" |
| **4** | the same descent stopped two paydays in, then the whole roster dismissed and the climb measured | run; finding 8 |

Act 4 exists because act 2's recovery half could not be finished: it reads the
worker through `fastCounts` instead of the harness's `countsSeries` and bounds
every dismiss press at ten seconds, both for reasons the instrument-failures
section gives.

---

## 1. MEASURED — the whole grant leaves in one press, and the chip that holds it is drawn identically before and after

**Reproduction:** act 1. New prison → Build tab.

The first thing act 1 does is read what the interface says a wall costs, before
anything is pressed. **The Build catalogue prices nothing.** Its whole row list,
verbatim:

```
Brick wall
Selected
Wooden door
Bed
Bench
Bookshelf
Chair
Desk
Dining Table
Fridge
Prep Counter
Stove
Loading Dock Door
Utility Panel
Washing Machine
Waste Bin
Medical Bed
Medicine Cabinet
Security Console
Shower Head
Toilet
Storage Rack
```

Twenty-two things to build and not one figure. With `wall-brick` selected the
arm control reads `"Place on map"` and its hint reads, verbatim:

> Click a tile edge to place a wall. Drag along it to lay a run. Two fingers,
> the middle button or the arrow keys still move the camera.

**A sentence about the gesture, and nothing about the money.** The only price on
the whole panel is inside the Buy fold, and the fold is shut on arrival —
`.hud-build__buy` reads `not laid out` until `.hud-build__buy-toggle` is
pressed, after which it reads:

> QUANTITY − + **Buy 2 × Brick · 80** — Arrives while the clock runs, into the
> stock a build draws from.

So the one price a player can see is *per unit of raw material*, behind a
disclosure, and it is a price for **bricks** rather than for the wall the
catalogue offered them.

### One press, 24,800

```
[act1] BUY 620 bricks: submitted=1 funds 25000 -> 200
       | row "QUANTITY | − | + | Buy 620 × Brick · 24,800 | Arrives while the
         clock runs, into the stock a build draws from."
```

The Buy control *does* price itself, and priced this honestly. What did not
change is the chip:

```
[act1] funds chip at the start:
  {"present":"yes","text":"25,000 | FUNDS","tone":null,"title":null,
   "ariaLabel":null,"className":"ui-stat","color":"rgb(168, 177, 188)",
   "background":"rgba(0, 0, 0, 0)","borderColor":"rgb(168, 177, 188)"}
```

Every one of those attributes was read again after the press and after the
drags, and none of them moved while the balance was positive. Finding 2 is why
that is a rule rather than a coincidence.

**JUDGEMENT.** A player who over-orders in one press has spent 99.2% of
everything they will ever be given, and the only place the game acknowledges it
is the balance itself — a number with no context beside it.

---

## 2. VERIFIED, read + MEASURED — the game says nothing about money until the money is already gone, and that is one line of code

**VERIFIED, read.** `src/ui/hud/projection.ts:618-623`, the funds chip's tone,
opened rather than quoted from a report:

```ts
function overdraftTone(counts: HudCountsViewModel): BadgeTone | undefined {
  const remaining = overdraftRemaining(counts);
  if (remaining === undefined || counts.treasuryMinorUnits >= 0) return undefined;
  if (remaining > 0) return 'warning';
  return atTreasuryFloor(counts) ? 'critical' : 'danger';
}
```

`overdraftBadge` (`:640`) and `overdraftDescription` (`:681`) both begin by
calling it and both return `undefined` when it does — the docblock at `:684`
says so deliberately: *"Nothing while the prison is solvent […] a badge present
in every screenshot is a badge nobody reads in the one screenshot it matters
in."*

**So the entire money-warning system — tone, badge and sentence — is switched on
by `treasuryMinorUnits < 0`.** There is no state between "solvent" and
"overdrawn": 25,000 and 40 are the same reading.

**And the other money chip has no tone at all.** `src/ui/hud/projection.ts:1053-1055`,
the `earned-today` descriptor opened at `:1035`: `tone: undefined, badge: undefined, description: undefined`,
with the comment *"'a good day' is a threshold, and nobody has set one."*

**MEASURED, act 1**, crossing the boundary one brick at a time from a positive
balance:

```
[act1] BUY 1 brick at balance 200: submitted=1 aria-disabled=false -> 160  | shortfall "not laid out"
[act1] BUY 1 brick at balance 160: submitted=1 aria-disabled=false -> 120  | shortfall "not laid out"
[act1] BUY 1 brick at balance 120: submitted=1 aria-disabled=false -> 80   | shortfall "not laid out"
[act1] BUY 1 brick at balance  80: submitted=1 aria-disabled=false -> 40   | shortfall "not laid out"
[act1] BUY 1 brick at balance  40: submitted=1 aria-disabled=false -> 0    | shortfall "not laid out"
[act1] BUY 1 brick at balance   0: submitted=1 aria-disabled=false -> -40  | shortfall "not laid out"
```

Six presses across the whole of the last 200 the prison had, **`aria-disabled`
`false` at every one of them, including the press that took the balance to
exactly zero and the press that took it below** — and the shortfall line never
drew at all.

**That the press below zero is *allowed* is correct and deliberate**: ADR 0017's
amendment of 2026-09-01 put the refusal at the deliveries rung rather than at
zero, and `judgeAffordability(40, 0, −1,185)` rightly says yes. **JUDGEMENT**,
and it is about the silence rather than the permission: the interface has an
opinion about money for the 1,185 below zero and none at all for the 25,000
above it, so the first thing it ever says arrives after the event a player would
have wanted warning of.

**Where the first word finally arrives**, and it is amber rather than red:

```
[act1] at the deliveries refusal: funds chip =
  {"text":"-280 | FUNDS | 905 left | 905 left before deliveries stop — past that,
    no materials can be ordered until the prison earns the money. The state pays
    at the end of each day, for prisoners who have a bed.",
   "tone":"warning","title":"905 left before deliveries stop — …",
   "color":"rgb(232, 180, 99)"}
```

`905` at a balance of `−280` puts the rung at **−1,185**, which is
`INSOLVENCY_RUNG_STARTER_DELIVERIES_FLOOR_MINOR_UNITS` — **VERIFIED, read**,
`src/simulation/economy/treasury.ts:507`, the starter rung a fresh unfurnished
prison gets so *"its first plank is always still affordable"*. The badge is
measured against the right floor. It is simply measured from a balance the
player reached in silence.

### Issue #641 is stale at this version, and in the direction that matters

#641 states the arithmetic as `floor(25_000 / 80) = 312 wall segments, leaving
40`, and *"the first thing the game says about money is on wall 313"*.
`2026-08-30-playing-into-the-lock.md` reproduced that at v0.0.257.

**Both halves have moved.** The treasury no longer stops at 40: the ladder runs
below zero, so the balance a fresh prison can drag or buy itself down to is
**−1,185** for a Buy press (MEASURED above) and the first sentence arrives at
the first negative balance rather than at the last positive one. **ARITHMETIC**, from three
figures each opened at its line — `materialsRequired: [{ itemId: 'item.brick',
quantity: 2 }]` (`src/simulation/construction/definition.ts:89`),
`unitPriceMinorUnits: 40` (`src/content/procurement-catalog.ts:100`) and the
−1,185 rung: a segment is 80, and the wall route now funds
`floor((25,000 + 1,185) / 80) = 327` segments rather than 312.

**What has not moved is the part #641 is actually about**: nothing warns before
the gesture, because the gesture is not pre-flighted at all. **VERIFIED, read** —
`judgeAffordability` has exactly two callers in `src/`,
`src/main.ts:2766` (the Buy press) and `src/main.ts:2988` (the hire press):

```
$ grep -rn "judgeAffordability" src/ --include=*.ts | grep -v affordability.ts
src/main.ts:101:import { judgeAffordability, pressFloorMinorUnits } from './ui/affordability';
src/main.ts:2766:          const verdict = judgeAffordability(
src/main.ts:2988:          const hireVerdict = judgeAffordability(
```

`PlaceBuildOrder` — the drag — is not among them. **The one spend with no price
on screen is also the one spend the host never checks before submitting.**

---

## 3. MEASURED — an earning prison sinks to the floor in three day boundaries, and the ladder is legible on the way down

**Reproduction:** act 2. `buildAndPopulate` with four beds, four admits and no
guards → a 6×6 `room.cell` enclosed at tiles (12,12)–(17,17), zoned first
attempt, four beds and a toilet inside, four prisoners housed. Then thirty
guards hired, then the remaining balance spent on bricks so that the wage bill
is what does the rest.

The prison the state pays for, before anything is spent:

```
[act2] BUILT: {"tick":6118,"prisoners":4,"prisonersInIntake":0,"rooms":1,
  "roomCapacity":4,"accommodationCapacity":4,"roomOccupants":4,
  "treasuryMinorUnits":22210,"stateIncomeAccruedTodayMinorUnits":659,
  "dailyWageBillMinorUnits":0,"unpaidWagesMinorUnits":0,"staff":0}
```

Thirty guards is thirty times what the game asks for, and it says so plainly
before the first press — the Staff panel, verbatim:

> GUARD COVERAGE · **0 of 1** · Unguarded · Nobody is on duty. **Hire 1 to cover
> this population.** … Hire Guard · 80 · **Costs 80 now and 80 a day in wages,
> including today.** · A new guard starts unassigned.

**The hire is the best-priced press in the game**: it names the one-off cost and
the recurring cost in the same sentence, and it names the number the prison
actually needs. Nothing, however, compares the two: after thirty presses the
strip reads `30 | STAFF` and `4 | COVERAGE | Covered`, and the recurring 2,400 a
day this created is on a different tab from the 1,200 a day the prison earns.

```
[act2] HIRED 30: {"tick":15090,…,"treasuryMinorUnits":22770,
  "dailyWageBillMinorUnits":2400,"unpaidWagesMinorUnits":0,"staff":30}
[act2] DRAINED: {"tick":15822,…,"treasuryMinorUnits":330,
  "dailyWageBillMinorUnits":2400,"unpaidWagesMinorUnits":0,"staff":30}
```

### The descent, read off the chip

| in-game day | funds | arrears | chip tone | the chip's own sentence |
| --- | --- | --- | --- | --- |
| 7 (start) | `330` | 0 | **none** | *(no badge, no tooltip — finding 2)* |
| 8 | `-870` | 0 | `warning` | *"380 left before deliveries stop — past that, no materials can be ordered until the prison earns the money. The state pays at the end of each day, for prisoners who have a bed."* |
| 9 | `-2,070` | 0 | `danger` | *"Deliveries have stopped — no materials can be ordered until the prison earns the money. …"* |
| 10 | `-2,500` | **770** | `critical` | *"The treasury is at its floor — nothing can be spent at all until the prison earns the money. …"* |
| 11 | `-2,500` | **1,970** | `critical` | *(unchanged)* |

**Three day boundaries from solvent to the floor**, and the arithmetic is exact
at every one of them: `330 + 1,200 − 2,400 = −870`;
`−870 + 1,200 − 2,400 = −2,070`; `−2,070 + 1,200 − 2,400 = −3,270`, clamped to
the −2,500 floor with the unpayable **770** carried as arrears; then 1,200 a day
of new arrears for ever, `770 → 1,970` at the next boundary.

**This is the finding, and it is the good half.** Once the balance is negative
the ladder is *well* drawn: three tones, three different sentences, each one
naming a different consequence, all three changing on the same steps the code
refuses on. Whoever built #768's third tone built it properly.

**And the four figures a player would need to see this coming are all published
and none of them are shown together**: `treasuryMinorUnits` (330),
`dailyWageBillMinorUnits` (2,400) and `stateIncomeAccruedTodayMinorUnits` are
all in the same `simulation/status-counts` payload the strip is built from — the
harness reads all three out of one message — and the strip renders the first and
the third as chips while the second is only on the Security tab.

---

## 4. MEASURED — the sentence that replaced #913's false one is true of the code and describes a different prison than the one on screen

Issue #913 is **fixed as to its words, at this version.** **VERIFIED, read** —
`src/content/default-locale-en.ts:332-333`:

```ts
'hud.status.funds-treasury-floor-exhausted':
  'The treasury is at its floor — nothing can be spent at all until the prison earns the money. The state pays at the end of each day and only for prisoners who have a bed, so a prison housing nobody earns nothing.',
```

and its docblock at `:287-296` names exactly why: *"This sentence was measured to
be false and is rewritten […] It read 'The treasury is exhausted — nothing can
be spent at all until the state pays what it owes.'"* The tail *"until the state
pays what it owes"* is gone from all eight sentences that carried it. **MEASURED
— it is gone in play too**, at all three rungs: act 2's chip reads *"until the
prison earns the money"* at `warning`, at `danger` and at `critical`. That is
the #920 check the brief asks for: the fix reaches the player, not only the
test.

**And on this prison the new sentence lands wrong.** Verbatim, from a prison
holding four people who are earning 1,200 a day:

> The treasury is at its floor — nothing can be spent at all **until the prison
> earns the money**. The state pays at the end of each day and only for
> prisoners who have a bed, **so a prison housing nobody earns nothing**.

Both clauses are true of the code and neither is true of this player's
situation:

- **"until the prison earns the money."** This prison earns it. `EARNED TODAY`
  in the very same reading is `845`, walking up to 1,200 and resetting, every
  day, at the floor. The condition the sentence names as the way out is being
  met continuously and changes nothing, because every unit of it is taken by a
  payroll of 2,400. **MEASURED**: arrears `770 → 1,970 → 3,170` at three
  consecutive boundaries while the balance never moves off `-2,500`.
- **"so a prison housing nobody earns nothing."** This prison houses four. That
  clause was written for the empty prison of
  `2026-09-04-can-this-prison-fail.md` — it is the correct diagnosis of *that*
  run, printed on a run it does not describe.

**This is not the same defect as #913 and should not be filed as one.** #913 was
a sentence that was *false*; this one is a sentence that is *true and about
somebody else*. The chip has one string for a state with two quite different
causes — a prison that cannot earn, and a prison that earns and spends more —
and it names only the first.

**What a sentence here would have to convey to be true of this prison**
(proposed, not landed; the wording is ours under the release of 2026-09-04 and
the *truth* is not): that the balance is pinned because the day's wages are
larger than the day's income, and by how much. Both figures are already on the
wire and both were read in the same `status-counts` payload — see finding 6 for
the strings and the code that would make them true.

---

## 5. VERIFIED, read — ADR 0075 has three Accepted decisions for "the way out" and none of the three exists in `src/`

ADR 0075 is **Accepted, 2026-08-29, by the repository owner**
(`docs/adr/0075-what-a-prison-that-cannot-afford-its-first-bed-is-owed.md:30`).
Its three decisions are:

1. *Development grants at population thresholds* (`:191`)
2. *The balance may go negative, the ladder runs on it, **loans are the way
   out** — and nothing ends the session* (`:241`)
3. *Sell-back at a loss* (`:342`)

**Decision 2's first half is built and act 2 measures it working** — the balance
goes negative, the ladder runs on it, nothing ends the session. **Its "loans are
the way out" half is not built, and neither is decision 1 or decision 3:**

```
$ grep -rln "developmentGrant\|DEVELOPMENT_GRANT\|populationThreshold\|thresholdGrant" src/
$ grep -rln "sellBack\|SellBack\|sell-back\|SellStock\|refundStock" src/
```

Both return nothing. And loans, from the module that implements them —
`src/simulation/economy/loans.ts:70-74`, its own words:

> **It is a recorded magnitude and not a default, and that is deliberate.**
> There is still no `LoanTerms` value anywhere in `src/`: ruling 10 chose the
> loan's *terms* and left the loan itself **disabled**, `LoanBook` is built only
> when `options.loanTerms !== undefined`
> (`src/simulation/runtime/new-session.ts`) and nothing in `src/` passes it, so
> no session has a ledger at all.

**VERIFIED independently**: `src/simulation/runtime/new-session.ts:927` reads
`const loans = options.loanTerms === undefined ? undefined : new LoanBook(treasury, options.loanTerms);`
and `grep -rn "loanTerms" src/` finds the field's declaration (`:411`), that
line, and nothing that sets it.

**The one refund route that does exist is a *cancellation*, and it only works
before the lorry arrives.** `hud.build.delivery` renders each in-flight order as
`{count} × {material} · {total} back` with a `Cancel` beside it
(`src/content/default-locale-en.ts:1543-1544`), and cancelling says
`The delivery was cancelled — {total} back.` (`:1028`). MEASURED, act 1: after
the 620-brick purchase and two Fast-forward presses,
`.hud-build__deliveries` read `not laid out` — the bricks had already landed, and
a delivered brick has no control at all. `2026-09-04-is-there-a-way-back.md` §4
found the same thing from the other side, calling the in-flight case *"an
exemplary way back"* and its own sweep for a stock sell-back finding nothing.

So the ADR that answers *"is there a way out"* answers it with three mechanisms,
and a player at this version has none of them. **The way out that does exist is
the one act 2 measures: dismissal** — which is not any of ADR 0075's three, and
which `src/simulation/staff/dismissal.ts:113` prices at *"neither refund nor
severance, and that is deliberate"*.

**And there is no defeat state to reach either.** `src/content/default-locale-en.ts`
is the only locale module in the tree (`ls src/content/*locale*` returns it
alone, 2,495 lines) and contains **no** occurrence of *game over*, *you lose*,
*defeat*, *bankrupt*, *shut down* or *closed down* in any case. ADR 0049's
*"insolvency is a state, not a loss condition"* is kept to the letter: there is
no sentence anywhere that could tell a player they have lost.

---

## 6. MEASURED — at the floor the prison keeps earning, the income all goes to arrears, and the population quietly falls

This is the half of the state that the empty prison of
`2026-09-04-can-this-prison-fail.md` could not show, and it is a different
condition wearing the same chip.

**VERIFIED, read** — the two systems that move money at a day boundary run in
the same tick and in this order: `StateIncomeSystem.order = 120`
(`src/simulation/economy/income.ts:747`), `PayrollSystem.order = 130`
(`src/simulation/economy/payroll.ts:225`), both on
`{ intervalTicks: DAY_LENGTH_TICKS, phaseTicks: DAY_LENGTH_TICKS - 1 }`. Income
is credited, then the payroll spends what it can down to `floorFor('wages')`,
which is the treasury floor itself (`payroll.ts:319`; `INSOLVENCY_RUNG_FLOORS_MINOR_UNITS.wages`
is `Number.NEGATIVE_INFINITY`, clamped to the floor —
`src/simulation/economy/treasury.ts:427-432`).

**So at the floor the day's income exists and is spent on wages before the
player can see it.** MEASURED, act 2, eleven consecutive samples:

```
day 10  funds=-2500 arrears=  770  bill=2400 residents=4
day 11  funds=-2500 arrears= 1970  bill=2400 residents=4
day 12  funds=-2500 arrears= 3170  bill=2400 residents=4
day 13  funds=-2500 arrears= 4370  bill=2400 residents=4
day 14  funds=-2500 arrears= 5570  bill=2400 residents=4
day 15  funds=-2500 arrears= 6770  bill=2400 residents=4
day 16  funds=-2500 arrears= 7970  bill=2400 residents=4
day 17  funds=-2500 arrears= 9170  bill=2400 residents=4
day 18  funds=-2500 arrears=10370  bill=2400 residents=3
day 19  funds=-2500 arrears=11870  bill=2400 residents=3
```

**The balance never moves and the arrears grow by exactly `bill − income` every
day** — `2,400 − 1,200 = 1,200` for eight boundaries, then **1,500** once the
population fell.

### The population fell, and nothing said so

`roomOccupants` goes `4 → 3` at day 18. **VERIFIED, read** — that is
`DischargeSystem` (`src/simulation/prisoners/discharge-system.ts`), whose alert
sentence is `'{count} released — their sentences are served.'`
(`src/content/default-locale-en.ts:890`). It is a normal, intended event.

**What it does to a broke prison is not visible anywhere.** The prison's only
income line fell by 25%, permanently, and the two chips that could have said so
cannot: `PRISONERS` went `4 → 3`, which is a headcount and not money, and
`EARNED TODAY` is a *within-day accrual that is always rising* — at the sample
where the drop first showed it read `475`, on its way to 900 instead of 1,200,
and a player has no previous day's total on screen to compare it against.

**ARITHMETIC**, and it is the shape of the trap: at the floor the prison cannot
build a bed, so it cannot replace a resident with a new one — except that
**admission is free**. `grep -rn "\.spend(" src/simulation` returns exactly
three call sites — `procurement.ts:284`, `payroll.ts:319`, `hiring.ts:217` —
and `AdmitPrisoner` is not among them, which the Intake panel states in its own
words at the floor:

> A prison needs a cell before it can admit anyone. **It does not need a free
> bed:** an arrival with none waits until a bed is free.

So **the one lever that restores income at the floor costs nothing and is on a
different tab from every sentence about money**, and the event that makes it
necessary — a discharge — is announced as good news.

### What the screen says while all this happens

The event band, verbatim, at the floor:

> Payday went unpaid — your staff are owed **11870**.

**The arrears figure is still the only money on screen without digit grouping**,
in the same frame as `-2,500 | FUNDS` and `Not enough money — you need **1,330**
more.` on the Staff panel. That is finding 6 of
`2026-09-04-can-this-prison-fail.md`, **re-measured and still live at
v0.0.475**.

**And still one row per day, none coalesced.** The alerts list at the floor,
verbatim, is seven separate rows:

```
Payday went unpaid — your staff are owed 4370.  Day 12 · Warning · Clear this alert
Payday went unpaid — your staff are owed 5570.  Day 13 · Warning · Clear this alert
Payday went unpaid — your staff are owed 6770.  Day 14 · Warning · Clear this alert
Payday went unpaid — your staff are owed 7970.  Day 15 · Warning · Clear this alert
Payday went unpaid — your staff are owed 9170.  Day 16 · Warning · Clear this alert
Payday went unpaid — your staff are owed 10370. Day 17 · Warning · Clear this alert
Payday went unpaid — your staff are owed 11870. Day 18 · Warning · Clear this alert
```

Days 10 and 11 — the first two unpaid paydays, the ones a player most needed to
see — are **no longer in the list**: the only other rows are a riot from day 5
and the calibration refusal. The list keeps the least informative copies of one
repeating fact and drops the moment it started.

---

## 7. MEASURED — the way back exists, it is three rows at a time behind a fold called "On the payroll", and issue #912 is fixed

`2026-09-04-can-this-prison-fail.md` finding 2 reported that *"sixty guards on
the payroll, and not one of them can be dismissed"*. **That finding was wrong,
and the repository already knows why**: `src/ui/hud/staff-panel.ts:203-218`
records that the roster list and the *held* list shared one class name, so the
probe read the held block — correctly empty in a prison with no posts — and
concluded the control could never be reached. The classes were split
(`ROSTER_LIST_CLASS = 'hud-staff__held-list hud-staff__roster-list'`) and the
fold was made to scroll itself into view on opening (`:1448`), against a
five-viewport measurement quoted in that same docblock.

**MEASURED at v0.0.475, at the floor, with thirty guards on the payroll:**

```
[act2] roster section present: 1
[act2] roster header text before opening: "ON THE PAYROLL\n2,400 a day"
[act2] roster opened: "ON THE PAYROLL\n2,400 a day\nGuard · On Post\nDismiss\nGuard ·
       Unassigned\nDismiss\nGuard · Unassigned\nDismiss\nand 27 moreA dismissed staff
       member leaves the prison for good, and their wage stops."
[act2] roster rows: [{"text":"Guard · On Post | Dismiss","visible":true,"bottom":661},
                     {"text":"Guard · Unassigned | Dismiss","visible":true,"bottom":713},
                     {"text":"Guard · Unassigned | Dismiss","visible":true,"bottom":765}]
[act2] dismissal 0: confirmation said "Dismiss Guard · On Post? Their wage stops and
       they do not come back." | staff 30 -> 29 | funds -2500
```

**Three rows visible, all three enabled, `and 27 more`, and the dismissal takes.**
The confirmation names the person. The balance does not move, which is
`src/simulation/staff/dismissal.ts:113` — *"Money: neither refund nor severance,
and that is deliberate"* — working as written.

**What it costs the player, measured rather than assumed.** The fold is
collapsed on arrival (`staff-panel.ts:1435`, `collapsed: true`), the list holds
`STAFF_ROSTER_ROW_LIMIT = 3` (`:165`), and a dismissal is **two presses on the
same control** with a settle window between them
(`STAFF_ROSTER_ROW_SETTLE_MS = 1_000`, `:196`, and `hud/dismiss-arming.ts` for
the confirmation step the owner ruled on 2026-09-03).

---

## 9. VERIFIED, read + MEASURED — the unmet-need withholding is still suspended, and this record's arithmetic is the proof

**VERIFIED, read.** `src/simulation/economy/income.ts:401`:
`export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;` — the
owner's ruling of 2026-09-03 (*"usuń na razie kary, zobaczymy jak pogram i
ocenię łatwość"*) is still in force at v0.0.475.

**Issue #890 is therefore stale at this version.** It cites
`src/simulation/economy/income.ts:347 — export const
STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40;` and measures *"roughly
two thirds of the grant withheld, every day, for twenty days"*. The constant is
`0` and the line is `:401`. **The copy half and the wire half of #890 are both
still open** — no player-facing string in the locale module contains *withheld*
or *unmet*, and `grep -n "withheld" src/simulation/protocol/types.ts` still
finds only a comment — but the mechanic it describes does not currently fire at
all, and anyone reading #890 as a description of today's build would be wrong by
the whole amount.

**MEASURED, and this record's arithmetic is where the proof is.** Every day
boundary in findings 3 and 6 closes to the unit on an income of exactly
`300 × roomOccupants`: `330 + 1,200 − 2,400 = −870` at four residents, and the
arrears step changing from 1,200 to **1,500** the day `roomOccupants` fell to
three is `2,400 − 900`. If any share of the grant were being withheld those sums
would not close.

**REASONED, and named as the weaker half:** these prisons had a cell, four beds
and a toilet — **no canteen, no shower room and no yard** — and ran fifteen
in-game days, so hunger, hygiene and recreation were certainly not being served.
This record did not open the Regime panel's per-need inspector to confirm the
permille values, because `2026-09-04-what-pressure-there-is.md` already did
exactly that on the same build shape and read *"five of six needs at permille
0"* while the state paid 300 apiece. What is **measured** here is the full rate;
what is **inherited** is which needs were unmet.

---

## Improvement proposals

Every proposal below is grounded in something measured above, and every string
is accompanied by the code that would make it true — `AGENTS.md`'s release of
2026-09-04 gives us the choice of words and not the promise. **None of these
sets a number**: balance is the owner's, and each proposal is a *readout* or a
*comparison of two figures the wire already carries*, never a new threshold
constant.

### P1 — The funds chip should be able to speak while the balance is positive

**What it costs today (finding 2):** `overdraftTone` returns `undefined` for
every `treasuryMinorUnits >= 0`, so 25,000 and 40 are drawn identically and the
first word about money arrives at −1. A player can spend 99.2% of the grant in
one press and be told nothing.

**What the player sees, and where.** The badge slot and the tooltip the chip
already has — `overdraftBadge` and `overdraftDescription`, one function each,
both already wired through `createStatChip`'s `trailing` and `description`
nodes. Nothing new is added to the row, which matters: the +133px measurement
recorded at `src/content/default-locale-en.ts:191-197` pushed the FUNDS chip off
the visible edge at 1280×800 the last time a long badge was tried, and the
owner's ruling of 2026-09-01 settled it as *"the chip keeps the short wording …
the name of the threshold is said elsewhere … in the hover tooltip on the chip,
and in the alert."* This proposal obeys that ruling rather than reopening it.

**When.** When `dailyWageBillMinorUnits > treasuryMinorUnits` — that is, when
what tomorrow's payday will ask for is more than what the treasury holds. It is
**not a new threshold**: both operands are published fields on the same
`HudCountsViewModel` the chip is already drawn from —
`treasuryMinorUnits` at `src/ui/hud/view-model.ts:353` and
`dailyWageBillMinorUnits` at `:411` — and `PayrollSystem.update` bills exactly
`unpaid + dailyWageBillMinorUnits()` at each boundary
(`src/simulation/economy/payroll.ts:263`), so the comparison is the one the
simulation is about to make.

**Instead of.** Nothing — the chip is silent here today.

**Proposed strings, with what makes each true:**

- badge: `won't cover tomorrow` — true when the condition above holds, because
  the payroll's `due` at the next boundary is at least
  `dailyWageBillMinorUnits` and `Treasury.spend` cannot take the balance below
  `floorFor('wages')`.
- tooltip: `Tomorrow's wages are {bill}. The treasury holds {balance}. The state
  pays at the end of each day, for prisoners who have a bed.` — the first two
  clauses are the two published figures; the third is the clause the three
  existing overdraft sentences already carry, verified in
  `default-locale-en.ts:254`, `:273` and `:332`.

**One more reason this belongs on the chip rather than in a panel: there is no
per-day income readout anywhere in the game.** **VERIFIED, read** — grepping
`src/content/default-locale-en.ts` (the tree's only locale module) for values
containing *a day*, *per day*, *yesterday* or *last day* returns exactly two,
and both are wages:

```
'hud.security.hire-hint': 'Costs {total} now and {wage} a day in wages, including today.',
'hud.security.roster-wage-bill': '{total} a day',
```

So a player has a per-day figure for what the prison **costs** and none at all
for what it **earns**; `EARNED TODAY` is a within-day accrual that resets, and
finding 6 measures what that hides.

**Why this and not a low-balance threshold:** a threshold is a balance decision
and ADR 0017 decision 5 reserves it. A comparison of the balance against the
prison's own committed outgoings is not a number anybody has to choose, and it
moves correctly on its own when the owner changes wages, income or the grant.

### P2 — The drag should price itself, because it is the only spend that never says anything

**What it costs today (findings 1 and 2):** the Build catalogue prices nothing;
the arm hint describes the gesture and not the money; the only price is
`Buy 2 × Brick · 80`, per raw material, behind a shut fold; and `PlaceBuildOrder`
is the one money-spending intent `judgeAffordability` is not called for
(`src/main.ts:2766` and `:2988` are its only two callers).

**What the player sees, and where.** The Build panel's own arm hint — the
element that today reads *"Click a tile edge to place a wall. Drag along it to
lay a run…"* — gains the segment price while the tool is armed; and
`.hud-build__coordinates`, which already tracks the pointer, gains the running
total of the run in progress.

**When.** Whenever a buildable is armed, and continuously during a drag.

**Instead of.** Nothing is displaced; both are additions to elements that are
already on screen with the tool armed.

**Proposed strings, with what makes each true:**

- arm hint suffix: `{total} a segment.` — true from the same two data the Buy
  row already multiplies: the buildable's material list
  (`src/simulation/construction/definition.ts:89` for `wall-brick`, two bricks)
  and `procurableMaterial('item.brick').unitPriceMinorUnits`
  (`src/content/procurement-catalog.ts:100`, `40`), whose product is the 80 a
  segment `just-in-time-materials.ts` charges at the press.
- during a drag: `{count} segments · {total}` — the same product over the
  segment count the drag has produced.

**This is not the reserve floor #641 lists as its option 3, and deliberately
not**: a reserve floor is new economic policy and the owner's. This is option
2 — *"show the total cost of a drag while it is being dragged, so 312 walls is
a number the player saw"* — which is a readout.

### P3 — Say that a discharge just cut the prison's income

**What it costs today (finding 6):** `roomOccupants` fell `4 → 3` at the floor
and the arrears rate went from 1,200 to 1,500 a day. The only sentence for the
event is `'{count} released — their sentences are served.'`
(`default-locale-en.ts:890`), which reads as good news, and the only free lever
that answers it — Admit — is on a different tab and is never suggested.

**What the player sees, and where.** The same alert row, with a second clause.

**When.** On the same event, unchanged.

**Instead of.** `{count} released — their sentences are served.`

**Proposed string:** `{count} released — their sentences are served. Their beds
are free and the state stops paying for them.` Both added clauses are **VERIFIED,
read**: `releasePrisoner` frees the residency place
(`src/simulation/prisoners/discharge-system.ts:184`), and
`stateIncomeForOccupiedPlaces` folds over
`residentIdsWithExistingPlace()` (`src/simulation/economy/income.ts:548-556`),
so a released resident stops being counted at the next boundary.

### P4 — Group the arrears figure, and coalesce the row

**What it costs today (finding 6):** `Payday went unpaid — your staff are owed
11870.` beside `-2,500 | FUNDS` and `you need 1,330 more`, and seven separate
rows for one repeating fact, with the first two — the ones that would have told
the player when it started — already scrolled out of the list.

This is finding 6 of `2026-09-04-can-this-prison-fail.md`, **re-measured and
still live**. It is a defect rather than a proposal and is listed here only so
the two halves stay together: the grouping is a formatter question, and the
coalescing is the one the 09-04 record already diagnosed — *"an amount in the
text is what defeats it"*, since the riot rows do coalesce (`4×`) and these
cannot, each carrying a different number.

### P5 — Twenty-nine of thirty guards were being paid to do nothing, and the wire already knows it

**MEASURED, act 4.** The `simulation/status-counts` payload for the over-hired
prison carries, in one message:

```
"staff":30, "staffUnassigned":29, "dailyWageBillMinorUnits":2400,
"prisonersCovered":4, "prisonersUnderstaffed":0, "prisonersUnguarded":0,
"treasuryMinorUnits":19570, "treasuryOverdraftFloorMinorUnits":-2500
```

The Staff panel says `1 held · 29 free` and `Only free guards answer incidents.`
— true, and about incidents rather than about money. Nothing anywhere multiplies
`staffUnassigned` by the wage.

**Proposed string**, for the roster fold's header where `{total} a day` already
sits: `{total} a day · {count} of them unassigned`. **What makes it true:**
`staffUnassigned` is published in the same counts payload as
`dailyWageBillMinorUnits` (measured above, in one message), and
`describeDailyWageBill` (`src/ui/hud/staff-panel.ts:533`) is already the single
reader of the bill for that header. No new figure, no new threshold, and no
claim about what a guard is *worth* — only how many of them are idle, which is
a count the simulation publishes and the panel already draws in words one block
higher.

---

## Instrument failures, reported rather than hidden

**1. Act 1's first run lost eight of its nine drags to a tile index that was not
on screen, and reported `0 command(s)` for each.** `calibrate` answered
`tile (0,0) top-left = (-304, -574)`, so the row-4 edge line the act aimed at
was 318 pixels above the top of the window; `document.elementFromPoint` returned
`nothing` at every start point. Nothing was wrong with the game. The act now
derives its tile range from the screen box the world occupies and checks every
drag start before trusting it — which is the brief's *"prove your presses land"*
rule met the second time rather than the first. **The finding this cost is
stated as pending in "What this record does not claim".**

**2. Act 2's recovery half was abandoned, and the cause is the probe rather
than the game.** The dismissal loop logged four dismissals — `staff 30 -> 29`,
`29 -> 28`, `28 -> 27`, `27 -> 26`, each taking about a second and a half — and
then produced **no output for seven wall-clock minutes**, at which point the run
was stopped and act 4 written in its place.

The most likely cause, and it is stated as likely rather than as measured:
`latestCounts` calls `countsSeries`, which **maps every
`simulation/status-counts` message the tee has kept into a fresh object and
returns the whole array across the CDP boundary**. Act 2's prison changes on
every tick — `stateIncomeAccruedTodayMinorUnits` rises continuously, so
`statusCountsEqual`'s deduplication never fires — so by tick 45,000 that array
is very large, and the dismissal loop calls it three times per iteration. Act 4
replaces it with `fastCounts`, which scans the tee backwards and stops at the
first hit.

**What this record does *not* claim about it**: that the roster control itself
became unactionable. That is the other candidate and it was not separated —
act 2's presses were unbounded, so a hang and a very slow read look identical
from outside. Act 4 bounds every press at ten seconds precisely so that the two
can be told apart, and its result is reported in finding 8 whichever way it
fell. **No wall-clock duration from either act is quoted as a claim about the
game anywhere in this record.**

---

## What this record does not claim

- **That a wall drag can reach the construction rung at this version.** Act 1's
  drag half was lost to the calibration error above and the corrected version
  had not run when this section was written. What is measured is the **Buy**
  route to `−1,185`; the **construction** rung is `−1,250`
  (`INSOLVENCY_RUNG_CONSTRUCTION_FLOOR_MINOR_UNITS`,
  `src/simulation/economy/treasury.ts:397`, equal to the *mature* deliveries
  rung since #771) and whether a drag actually walks a fresh prison the extra
  65 past the Buy floor is **ARITHMETIC that has not been played**. It is one
  short act away and is named here rather than implied.
- **That thirty guards is a mistake a player would make.** It is a deliberately
  large over-hire chosen so the descent fits in one act. The Staff panel says
  `Hire 1 to cover this population` before the first press, so a player who
  reads it is not led there. What the act shows is the *shape* of the state,
  not its likelihood.
- **That the population decay measured in finding 6 is a consequence of being
  broke.** It is not: `DischargeSystem` releases prisoners whose sentences are
  served regardless of the treasury. What the record claims is narrower — that
  it happens *while* a prison is broke, that it cuts the only income line, and
  that nothing on screen connects the two.
- **That the alerts list has a fixed cap.** Days 10 and 11 were absent from a
  list holding nine rows; whether that is a cap, an eviction policy or a
  `Clear this alert` that fired is **UNKNOWN** here. What was measured is the
  absence.

---

## The weakest claim here, and what would change my mind

**The weakest claim is finding 4's second half — that the floor sentence "lands
wrong" on an earning prison.** Both of its clauses are true of the code; what
this record asserts is that a player reading *"until the prison earns the
money"* while their prison earns 1,200 a day, and *"a prison housing nobody
earns nothing"* while their prison houses four, is misled about what to do next.
That is a **JUDGEMENT** about reading, not a measurement, and it is the kind of
claim this repository has been wrong about before — `2026-09-04-can-this-prison-fail.md`
finding 2 was a confident reading of two elements that turned out to be one
element misnamed.

**What would change my mind:** a player, or the owner, reading that sentence at
the floor of an earning prison and correctly concluding *"my payroll is bigger
than my income; cut it"*. If the sentence gets somebody there, the criticism is
mine and not the string's.

**The second weakest is the recovery arithmetic**, for the opposite reason: it
is arithmetic over a measured rate rather than a measured completion, and it is
labelled as such wherever it appears.

**Not weak, and worth saying so:** the descent figures. Every day boundary in
finding 3 and finding 6 closes to the unit against
`income − bill`, at ten consecutive boundaries, with the two constants opened
and read (`STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300`,
`src/simulation/economy/income.ts:115`; the guard's `wageBand.minPerDay` of 80,
`src/content/staff-role-catalog.ts:150`). If any of that were wrong the sums
would not close.
