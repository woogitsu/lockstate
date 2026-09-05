# The money runs out — 2026-09-05

**The verdict in one line: PLACEHOLDER — filled in when act 2 returns.**

## Tree, version, and what was and was not touched

Played on `agent/playtest-the-money-runs-out`, cut from `origin/main` at
**`b984445f` (v0.0.475)**, which was still the head of `origin/main` when this
branch was taken and when the acts below ran (`git fetch origin` then
`git log --oneline origin/main -1` → `b984445f chore(release): v0.0.475`). The
running application reported itself in the status strip as
`Lockstate, PRE-ALPHA build, version 0.0.475, commit 0c053bd`, quoted from act
2's own output, so the tree under test and the tree named here are the same one.

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

## Reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=5328 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-the-money-runs-out.playtest.ts -g "act 1"
```

`-g "act 2"` and `-g "act 3"` for the others. `git lfs checkout` first in a
worktree, or the atlases fail to decode and every actor is missing while the run
still passes.

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

**And the other money chip has no tone at all.** `src/ui/hud/projection.ts:1052`,
`earned-today`: `tone: undefined, badge: undefined, description: undefined`,
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
drew at all. The first press the interface refuses is a long way past the last
press it should have had an opinion about.

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
the first negative balance rather than at the last positive one. **ARITHMETIC**,
from the two figures opened above (`unitPriceMinorUnits` 40 × 2 bricks a
segment, and the −1,185 rung): the wall route now funds
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
