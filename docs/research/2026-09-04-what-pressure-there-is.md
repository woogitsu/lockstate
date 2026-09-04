# What pressure there is — 2026-09-04

**The verdict in one line: none. A prison that houses four people, meets the
staffing the game asks for, and then leaves five of six needs at zero for a
week earns +1,120 every single day and grows for ever — and restoring the one
constant the owner suspended turns that into +320 a day, which is still
growth.**

Asked because the owner ruled it. On 2026-09-03 they suspended the unmet-need
penalty in their own words — *"usuń na razie kary, zobaczymy jak pogram i ocenię
łatwość"* — and on 2026-09-04, asked whether the prison should ever be allowed
to be in trouble, answered **"Zmierzcie to najpierw"**: measure it first.

Five prisons were played from scratch on this branch, cut from `origin/main` at
v0.0.465 (`4c00eaba`), at **1440×900**, through
`tests/browser/playtest-2026-09-04-what-pressure-there-is.playtest.ts`. Two of
them ran against a **source mutation** of
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` from `0` to `40`; a third did
too. The mutation was restored and the restore verified — see
[§0](#0-the-mutation-and-its-restore) — and **nothing in `src/` is changed on
this branch.** Balance is the owner's; this record is a set of numbers.

**Nothing in CI collects that file** (`tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`), so it is evidence and never a gate.

| act | tree | what was played | wall clock | end tick |
| --- | --- | --- | --- | --- |
| **B** the shipped curve | `withheld = 0` | 3×4 cell, 4 beds, 1 toilet, 4 prisoners, **1 guard** — `ceil(4/8)`, exactly what the game asks | 529 s | 35,431 |
| **P** the penalty restored | `withheld = 40` | identical script | 465 s | 29,795 |
| **Y** the yard | `withheld = 40` | act P plus an 8×8 `room.yard` | 600 s (timed out, see [§6](#6-instrument-failures)) | 39,264 |
| **D** one guard too many | `withheld = 40` | act P with **6 guards** instead of 1 | 437 s | 26,566 |
| **N** pure neglect | `withheld = 0` | admit, build nothing, hire nobody | 280 s | 19,451 |

Every prison opened on a grant of **25,000** and the build cost **2,420** of it
in every act (25,000 → 22,580, measured identically in B, P, Y and D). The
clock ran at 4×; `DAY_LENGTH_TICKS` is 2,400.

**`main` moved under this record while it was being written, and one thing it
moved is quoted here.** The branch was merged with `origin/main` at v0.0.467 (`36a5644c`)
after every act had run; that merge brought issue #941, which **retires the
coverage sentence §1 quotes** for the reason
[§5.1](#51-measured--the-only-act-that-contained-an-incident-is-the-only-act-that-went-broke)
measures. Every number above and below was taken at v0.0.465 and is left as it
was read.

---

## The answer in one paragraph

**MEASURED.** On the tree as shipped, the day-boundary treasury delta of a
four-prisoner prison is **+1,120, at nine consecutive boundaries**, and it does
not care what the prison is like: at the last of those boundaries all four
prisoners had **five of their six needs at level zero** and the state paid 300
apiece anyway. Restoring the suspended constant makes the same prison's delta
walk **+1,080 → +800 → +640 → +640 → +480 → +320 → +320 → +320**, settling at
+320 — a **71% cut, and still a rising treasury.** Zoning an 8×8 yard on bare
ground lifts the settled figure to **+480**, which is exactly `4 × 40`, the
docblock's claim measured to the unit. The only prison measured here that ever
went **backwards** was act D: the restored penalty plus **six** guards for four
prisoners, which rose for eight days and then paid **−40, −80, −80, −80** at
four consecutive boundaries. On the shipped tree that same prison would need
**sixteen** guards to do the same thing.

**And the sting is in which prison that was.** Acts B, P and Y — the ones with
the one guard the game asks for — closed **every** incident with *"the last one
ran out of time instead of being contained, and everyone caught in it was
hurt."* Act D, the one that goes broke, closed every incident with *"The prison
is under control again."* So with the penalty restored the two prisons on offer
are **+320 a day and nothing contained**, or **−80 a day and everything
contained**, and neither figure is anywhere on the screen.

---

## 0. The mutation, and its restore

`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS` has exactly one production
reader — `stateIncomeForPrisonerDay`, `src/simulation/economy/income.ts:502` —
and no seam a test can inject through, by a design its own docblock states:
*"Nothing in `src/` calls this with a rate of its own, and nothing should."* So
measuring the mechanic means editing the constant. That was done twice (once for
acts P and Y, once for act D) and restored twice, each time as:

```
$ sha256sum src/simulation/economy/income.ts > income.sha256
34a59cd222eccf85d44c9743068f57f6bf59f5c0788e2855462163fc3a612744  src/simulation/economy/income.ts
$ sed -i 's/^export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;$/...= 40;/' src/simulation/economy/income.ts
  ... acts run ...
$ git checkout -- src/simulation/economy/income.ts
$ sha256sum -c income.sha256
src/simulation/economy/income.ts: OK
```

**`OK` both times**, and `git status` reported no modification under `src/`
after either. The mutation was also proved *live* before the browser acts ran,
by importing the module under `vitest` and printing the schedule it computes:

```
withheld: 40
schedule: [ 300, 260, 220, 180, 140, 100, 60 ]
```

which is the docblock's `300, 260, 220, 180, 140, 100, 60` for zero through six
unmet needs, to the unit. That probe was a scratch file under `tests/unit/` and
was deleted; nothing of it is on this branch.

---

## 1. MEASURED — the shipped curve is a straight line, and the prison under it is a wreck

**Reproduction** (act B). New prison → Build → buy 40 bricks, 12 planks, 1
toilet material → four wall drags enclosing tiles (12,12)–(14,15) → designate
`room.cell` → place a toilet and beds until the prison reports
`accommodationCapacity ≥ 4` → Admit ×4 → Security → Hire Guard ×1 → run.

The prison the game itself calls correct:

> GUARD COVERAGE — 1 of 1 — Covered — **This prison has the guards it asks
> for.**
>
> ON THE PAYROLL — 80 a day

**That sentence is retired and this record is the last thing that will quote it
from play.** It was on screen at the commit measured here (`4c00eaba`,
v0.0.465); issue #941 replaced it with `'Only free guards answer incidents.'`
(`src/content/default-locale-en.ts`, `hud.security.coverage-met-hint`) and that
landed on `main` at v0.0.467 (`36a5644c`), **on the same day, for the reason
[§5.1](#51-measured--the-only-act-that-contained-an-incident-is-the-only-act-that-went-broke)
measures independently.** Its replacement's docblock says why: `required` is the
posts a sector asks to be filled and *"a player who hires exactly the
requirement will watch every incident lapse."* Quoted here rather than
substituted, because it is what the prison below was actually told.

`roomOccupants: 4`, `prisonersInIntake: 0`, `accommodationCapacity: 5`,
`dailyWageBillMinorUnits: 80`, `COVERAGE 4 · Covered`, at every sample.

The treasury at every in-game day boundary, read off
`simulation/status-counts`:

| boundary | tick | treasury | delta |
| --- | --- | --- | --- |
| day 6 | 14,400 | 22,580 → 23,780 | +1,200 *(no guard yet)* |
| day 7 | 16,800 | 23,700 → 24,820 | **+1,120** |
| day 8 | 19,200 | 24,820 → 25,940 | **+1,120** |
| day 9 | 21,600 | 25,940 → 27,060 | **+1,120** |
| day 10 | 24,000 | 27,060 → 28,180 | **+1,120** |
| day 11 | 26,400 | 28,180 → 29,300 | **+1,120** |
| day 12 | 28,800 | 29,300 → 30,420 | **+1,120** |
| day 13 | 31,200 | 30,420 → 31,540 | **+1,120** |
| day 14 | 33,600 | 31,540 → 32,660 | **+1,120** |
| day 15 | 36,000 | 32,660 → 33,780 | **+1,120** |

`4 × 300 − 80 = 1,120`, exactly, nine times. `unpaidWagesMinorUnits: 0` at
every reading.

**And this is the state of the prison that was paid it.** The Regime panel's
inspector at tick 35,431 — 569 ticks before the day-15 boundary, with no route
to any of these needs, so the composition the boundary priced — for all four
prisoners, verbatim from `data-need-permille` / `data-need-unmet`:

| need | permille | unmet for state income |
| --- | --- | --- |
| hunger | **0** | **true** |
| sleep | **0** | **true** |
| hygiene | **0** | **true** |
| bladder | **0** | **true** |
| safety | 1000 | false |
| recreation | **0** | **true** |

**Five of six needs at the bottom of their range, on every prisoner, and the
state paid the full 300 for each of them.** The event band at the same instant
read *"No incident is still open — but the last one ran out of time instead of
being contained, and everyone caught in it was hurt."* Riots opened on days 10,
12 and 14 (`INCIDENTS 1 · Riot`, `A riot has broken out — 4 prisoners have
stopped taking orders`) and closed themselves each time, and the treasury delta
across every one of them was +1,120.

**Refuting sample.** *Is the income line simply flat because it is broken?* No:
`stateIncomeAccruedTodayMinorUnits` tracks the tick-in-day exactly — at tick
17,907 it read `415`, and `3 × 300 × (17,907 − 7×2,400) / 2,400 = 415.1` for the
three places occupied at the time — and the credit at each boundary matches the
occupancy the prison reports. The line works; it is indifferent.

---

## 2. MEASURED — restoring the constant costs the same prison 71% of its daily gain, and it is still growth

**Reproduction** (act P). Identical script, on the mutated tree.

| boundary | tick | treasury | delta | implied price per place | implied unmet needs |
| --- | --- | --- | --- | --- | --- |
| day 4 | 9,600 | 22,580 → 22,880 | +300 | 300 | 0 *(2 places, no guard)* |
| day 5 | 12,000 | 22,800 → 23,880 | +1,080 | 290 (mixed) | 0 and 1 |
| day 6 | 14,400 | 23,880 → 24,680 | +800 | **220** | **2** |
| day 7 | 16,800 | 24,680 → 25,320 | +640 | **180** | **3** |
| day 8 | 19,200 | 25,320 → 25,960 | +640 | 180 | 3 |
| day 9 | 21,600 | 25,960 → 26,440 | +480 | **140** | **4** |
| day 10 | 24,000 | 26,440 → 26,760 | +320 | **100** | **5** |
| day 11 | 26,400 | 26,760 → 27,080 | +320 | 100 | 5 |
| day 12 | 28,800 | 27,080 → 27,400 | +320 | 100 | 5 |
| day 13 | 31,200 | 27,400 → 27,720 | +320 | 100 | 5 |

Every price in that column is a row of the schedule §0 printed, and every delta
is `4 × price − 80` exactly. The need inspector at tick 29,795 — after the
day-12 boundary, before the day-13 one — reads **5 of 6 unmet on all four
prisoners**, the identical composition act B was paid 1,200 for.

**So the direct comparison, which does not depend on the two runs being the same
world:** at four housed prisoners with five of six needs unmet and `safety` held
served, the shipped tree pays **1,200 a day** and the restored tree pays **400 a
day**. Same prison, same composition, both measured.

Side by side, at the settled composition:

| | shipped (`withheld = 0`) | restored (`withheld = 40`) |
| --- | --- | --- |
| state income, 4 places | 1,200 | **400** |
| wages, 1 guard | 80 | 80 |
| **daily delta** | **+1,120** | **+320** |
| wages as a share of income | 6.7% | **20%** |
| guards per prisoner at break-even | **3.75** | **1.25** |
| what the game asks for | 0.25 | 0.25 |
| headroom over what it asks | **15×** | **5×** |

**Refuting sample, and it is the strongest one available here.** *Is the +320
merely a slow day rather than a floor?* Four consecutive boundaries at exactly
+320 with the composition unchanged at 5 unmet, and the fifth row of the
schedule is 100 — the sixth, 60, is not reachable by this prison at all
([§4](#4-measured--60-is-not-a-number-a-staffed-prison-can-reach)). If it were
going to fall further, day 13 was where.

---

## 3. MEASURED — the yard incentive is real, and it is worth exactly 40 a prisoner a day

The claim under test is
`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS`'s own: *"`room.yard`
requires no object at all … so zoning 8x8 of owned ground turns `recreation`
from unmet to served and returns 40 a prisoner a day for nothing."*

**It can be zoned, first attempt, with the pointer, on the ground a new prison
starts with.** Act Y drew tiles (15,12)–(22,19) — 8×8 of bare land beside the
cell, inside the one owned 32×32 chunk (`world.setOwned(initialChunk, true)`,
`src/simulation/runtime/new-session.ts:433`) — and the Rooms panel said, before
the press:

> Designate 8 × 8 · Discard · AREA · **8 × 8 tiles at 15, 12** ·
> NEEDS AT LEAST 8 × 8 TILES · **MUST BE OUTDOORS** · **NO OBJECTS NEEDED** ·
> ENCLOSURE · Walled in on every side

`rooms` went `1 → 2` on that press. No walls, no objects, no materials, no
money. After it, the same panel's enclosure readout reads *"Open on at least one
side"* and the room stands — which is `RoomZoningService.zone` refusing only
`'enclosed'` (`src/simulation/rooms/zoning.ts:575`).

**What it bought, measured.** Act Y's settled curve against act P's, both on the
mutated tree, both four housed prisoners and one guard:

| | act P (no yard) | act Y (8×8 yard) |
| --- | --- | --- |
| settled delta, per boundary | **+320** | **+480** |
| consecutive boundaries at it | 4 (days 10–13) | **6 (days 12–17)** |
| implied price per place | 100 | **140** |
| `recreation` permille, all four | **0** | **949 – 996** |
| `recreation` unmet for state income | **true** | **false** |
| unmet needs, all four | **5 of 6** | **4 of 6** |
| the other five needs | hunger/sleep/hygiene/bladder 0, safety 1000 | *identical* |

`480 − 320 = 160 = 4 × 40`. One need served, four prisoners, forty apiece, to
the unit — and the need inspector shows *which* need moved and that nothing else
did.

**And the yard is worth more than the docblock says, for a reason the docblock
does not give.** `RIOT_ALLOWED_CATEGORIES` is
`['free-association', 'recreation']` (`src/simulation/incidents/riot-regime.ts:41`,
whole-day block), and in `DEFAULT_ACTIONS`
(`src/simulation/prisoners/actions.ts`) `action.free-association` carries
`needEffectsPerTick: {}` while `action.use-toilet` is category **`hygiene`**,
`action.sleep` is `sleep` and `action.eat-in-cell` is `meal` — all three
stopped by a riot. **So `action.yard-recreation` is the only need-serving action
a rioting prisoner can take at all**, and a yard is the only need a rioting
prison can serve. That is VERIFIED as read; the measurement consistent with it
is act Y's `recreation` sitting at 949–996 permille through the same riot cycle
that took every other need in every act to zero.

---

## 4. MEASURED — 60 is not a number a staffed prison can reach, and the schedule's bottom row is unreachable

The schedule §0 printed bottoms out at **60** for six unmet needs, and its
docblock makes a property of it: *"The floor is 60 and it is reached, not
clamped… a neglected prison is not put beyond digging itself out."*

**`safety` reads `1000` permille and `unmet: false` in every closing inspector
reading of all four populated acts — B, P, Y and D — on every prisoner, at every
level of neglect measured.** One guard, `COVERAGE 4 · Covered`, and
`SAFETY_COVERAGE_PROVISION_PER_TICK` is 0.08 a tick
(`src/simulation/prisoners/needs.ts:181`) against a `safety` decay of 0.05, and
that module's own table for the covered rung reads *"provision 0.08 … net per
tick **+0.03** … full to unmet: never"*.

So for a prison that has hired **the one guard the game asks for**, the
reachable bottom of the schedule is the fifth row — **100**, not 60 — and the
sixth row belongs only to a prison with no coverage at all, which has no wage
bill either. That is not a small correction: it moves break-even from
`60n / 80 = 0.75` guards a prisoner to `100n / 80 = 1.25`.

---

## 5. MEASURED — a prison *can* be made to sink, and it takes six guards rather than sixty

**Reproduction** (act D). Act P's prison and script, six Hire Guard presses
instead of one, on the mutated tree. Six is the cheapest overhire past
break-even at the settled composition (`400 / 80 = 5`), and it costs 480 out of
a 25,000 grant — a prison that would look well staffed, not the sixty-guard
deliberate bankruptcy `docs/research/2026-09-04-can-this-prison-fail.md`
measured.

| boundary | tick | treasury | delta |
| --- | --- | --- | --- |
| day 4 | 9,600 | 22,100 → 22,820 | +720 |
| day 5 | 12,000 | 22,820 → 23,260 | +440 |
| day 6 | 14,400 | 23,260 → 23,620 | +360 |
| day 7 | 16,800 | 23,620 → 23,860 | +240 |
| day 8 | 19,200 | 23,860 → 23,940 | +80 |
| day 9 | 21,600 | 23,940 → 23,900 | **−40** |
| day 10 | 24,000 | 23,900 → 23,820 | **−80** |
| day 11 | 26,400 | 23,820 → 23,740 | **−80** |
| day 12 | 28,800 | 23,740 → 23,660 | **−80** |

The six hires themselves are on the record in exact steps, which is what makes
the wage figure a measurement rather than a reading of the catalogue: the
treasury walked **22,580 → 22,500 → 22,420 → 22,340 → 22,260 → 22,180 →
22,100** across the six presses — 80 apiece, matching the control's own label
*"Hire Guard · 80 — Costs 80 now and 80 a day in wages, including today."*

`dailyWageBillMinorUnits: 480`, `staff: 6`, `roomOccupants: 4`,
`unpaidWagesMinorUnits: 0` throughout. `4 × 100 − 480 = −80`, exactly, at three
consecutive boundaries. **This is the first falling treasury curve this
repository has measured on a prison that is fully housed and fully earning** —
the −2,500 floor in the note above was a prison holding nobody.

**What it looks like on screen while it sinks: nothing.** At the day-12
boundary, four consecutive negative days in, the chips read

```
prisoners 4 | high-risk 0 | staff 6 | coverage 4 Covered | rooms 1
incidents 0 Clear | contraband 1 Phone | funds 23,740 · FUNDS | earned-today 14
```

The FUNDS chip carries **no badge** — the overdraft readouts the earlier note
recorded only appear near the floor — the event band is about an incident, and
the alerts list says nothing about money. The one number a player might read as
a trend, `EARNED TODAY`, reads `14` and is *rising*, because it is a
within-day accrual. **Nothing on this screen distinguishes +1,120 a day from
−80 a day.** That is an observation, not a defect claim: what a fix must
convey — that the balance is falling and by how much — is a design question, and
the wording of it is ours under the 2026-09-04 release only once the readout
exists to be true about.

**And the panel that could stop it says the prison is correct.** The Staff panel
at the end of act D, verbatim:

> GUARD COVERAGE — 1 of 1 — Covered — This prison has the guards it asks for.
> … ON DUTY — **1 held · 5 free** — Guard · Sector Post — Release …
> ON THE PAYROLL — **480 a day**

(the coverage sentence as it stood at `4c00eaba`; see §1 for its retirement)

One `Release` control, for the one assigned guard. The five free guards costing
400 a day are named only by the count `5 free`. That is the same mechanism
finding 2 of `docs/research/2026-09-04-can-this-prison-fail.md` measured at
sixty guards — the held list draws only *assigned* guards — reproduced at a
scale a player would actually reach. **This record did not enumerate the DOM
rows in act D**, so it claims only what the rendered panel offered.

### 5.1 MEASURED — the only act that contained an incident is the only act that went broke

This was not looked for. Every distinct sentence the event band held, across the
four populated acts:

| act | guards | `ON DUTY` | every distinct incident-closing sentence |
| --- | --- | --- | --- |
| **B** | 1 | `1 held · 0 free` | *"…the last one ran out of time instead of being contained, and everyone caught in it was hurt."* |
| **P** | 1 | `1 held · 0 free` | *"…ran out of time instead of being contained…"* |
| **Y** | 1 | `1 held · 0 free` | *"…ran out of time instead of being contained…"* |
| **D** | **6** | `1 held · **5 free**` | *"**The prison is under control again — no incident is still open.**"* |

**Three acts at the staffing the game asks for closed every incident by
lapse, and not one by containment. The act with five idle guards on the
payroll closed every incident by containment, and never once showed the lapse
sentence.** The bands are the whole distinct set from each log, not a
selection.

**What would establish the cause, stated separately** (`docs/AGENT_WORKFLOW.md`
§3, *"a measurement is not a diagnosis"*). The mechanism is already written
down on `main`, in the docblock of the sentence that replaced the one §1
quotes: `IncidentResponseSystem.claimableResponders` is the only path that puts
a guard on an incident and it draws from `GuardRoster.unassignedGuardIds()`
filtered to post-eligible roles, so *"a guard `DeploymentSystem` has posted is
`'travelling'` or `'on-post'` rather than `'unassigned'`, so it is **never** in
that pool."* Acts B, P and Y had `0 free` and therefore an empty pool; act D had
five. This record **read** that docblock and did not test the path, so the
correspondence is consistent with it rather than proof of it. What would settle
it: an act at 2 guards, where one is posted and one is free.

**Why this is the finding rather than a footnote.** With the penalty restored,
those are the two prisons a player can have. The one the game calls correctly
staffed makes **+320 a day and contains nothing**; the one that contains its
incidents makes **−80 a day**. That is a real decision with a real cost on both
sides, and it is the first one measured in this repository — but it is a
decision the interface does not present, because neither number is on screen
([§5](#5-measured--a-prison-can-be-made-to-sink-and-it-takes-six-guards-rather-than-sixty))
and, until v0.0.467 (`36a5644c`), the coverage line said the requirement was the
whole bill.

---

## 6. MEASURED — pure neglect cannot even be started

**Reproduction** (act N). New prison → press *Admit* twelve times → build
nothing, hire nobody → run.

All twelve refused. The console took twelve
`HostRefusalError: This prison has no room to hold a prisoner, so nobody can be
admitted into it.`, the refusal band read *"Nobody was admitted — this prison
has no room to hold anybody."*, the intake panel explained the rule (*"A prison
needs a cell before it can admit anyone. It does not need a free bed…"*) — and
**the control never went `disabled`**, so all twelve presses were accepted by
the UI and thrown away.

Nine day boundaries later: `treasuryMinorUnits: 25000`, `prisoners: 0`,
`rooms: 0`, `staff: 0`. The worker published `simulation/status-counts`
**exactly once, at tick 0**, for the whole run — the dedupe in
`status-counts.ts` holding, which is a fair description of the session.

So *"admit prisoners, build nothing, hire nobody"* is not a playable route:
neglect requires a cell first, and that version of it is act A of
`docs/research/2026-09-04-can-this-prison-fail.md` (24 prisoners, no bed, ten
days, treasury moved by zero). The refused-Admit finding is that note's
finding 6 last bullet, observed again here at twelve presses.

---

## 7. What the brief that commissioned this got wrong

Every line of the arithmetic it carried was checked against the code. Four
things need correcting, and one of them changes the answer.

1. **"the treasury stops rising only at about 3.75 guards per prisoner, thirty
   times what the game asks for"** — the 3.75 is right (`300n / 80`). The
   **thirty** is right only at populations that are exact multiples of eight.
   `resolveOccupancyScaledGuardCount` is
   `Math.max(scheduledGuardCount, Math.ceil(occupantCount / 8))`
   (`src/simulation/security/sector-staffing.ts:190`) and the schedule floor is
   one guard, so a four-prisoner prison is asked for **1** guard, not a half —
   measured, `GUARD COVERAGE 1 of 1 Covered`. The headroom at four prisoners is
   therefore **15×**, and the wage share is **6.7%** of income, not 3.33%. The
   brief's figures are the asymptote, not the starting prison.

2. **"a floor of 'exactly a fifth of the rate', i.e. 60 instead of 300 for a
   prison meeting none of them"** — verified as a reading of the docblock and
   **unreachable in play for any prison with a guard**. `safety` read `1000`
   permille and `unmet: false` on every prisoner in every closing reading of
   four acts. The staffed floor is **100**, so the penalty's effect is a **67%**
   cut to income and not 80%, and break-even is 1.25 guards a prisoner rather
   than 0.75 ([§4](#4-measured--60-is-not-a-number-a-staffed-prison-can-reach)).

3. **"does this game apply any pressure at all"** — the brief expected the
   answer to be about the penalty, and half of that is wrong. Measured, the
   penalty is not what makes *neglect* cost anything: act B's prison had **five
   of six needs at zero** and was paid in full, act P's had the same five and
   was paid a third, and **both grew**. Nothing in either tree punishes a
   prison for the state its prisoners are in — the penalty only prices it, and
   the price is affordable. A player who never hires a second guard can neglect
   everyone for ever on either tree, because with no wage bill any positive
   income is growth (ARITHMETIC: no act was played with beds and no guard).

   What restoring the constant *does* create is a **staffing** pressure, and it
   is sharper than a smaller number: the overhire a prison survives falls from
   sixteen guards to six ([§5](#5-measured--a-prison-can-be-made-to-sink-and-it-takes-six-guards-rather-than-sixty)),
   and the guards it must overhire to reach are exactly the ones that contain
   an incident ([§5.1](#51-measured--the-only-act-that-contained-an-incident-is-the-only-act-that-went-broke)).
   So the answer to the question as asked is: **today, no pressure at all;
   restored, a pressure on how many guards you keep free, and none on how you
   treat anybody.**

4. **The role id is `staff-role.guard`, not `role.guard`** — `wageBand:
   { minPerDay: 80, maxPerDay: 140 }` at
   `src/content/staff-role-catalog.ts:150`, on the entry declared at `:148`.
   Everything else the brief cited opened exactly where it said:
   `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300` at `income.ts:115`, the
   `PayrollSystem` sentence at `income.ts:100`,
   `STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0` at `income.ts:401`,
   `DEFAULT_SECTOR_PRISONERS_PER_GUARD = 8` at `sector-staffing.ts:147`, and
   `room.yard`'s `outdoors` + `8×8` + no object at
   `src/content/room-catalog.ts:138`.

---

## 8. A mechanism this record found and did not measure

Every populated act ended with the same composition — hunger, sleep, hygiene
and bladder at level **zero**, `safety` full — including act B's prison, which
had a bed each and a toilet standing in the cell. A toilet that never serves
`bladder` looks like a defect and is probably not one:

- **VERIFIED, read.** `action.use-toilet` is category `'hygiene'`,
  `action.sleep` is `'sleep'`, `action.eat-in-cell` is `'meal'`
  (`src/simulation/prisoners/actions.ts:116–129`).
- **VERIFIED, read.** A riot replaces the participant's whole day with
  `['free-association', 'recreation']`
  (`src/simulation/incidents/riot-regime.ts:41,52`), and
  `action.free-association` serves nothing (`needEffectsPerTick: {}`,
  `actions.ts:227`).
- **VERIFIED, read.** Riots open on `needsPressure`, a sector mean of unmet
  needs (`src/simulation/incidents/trigger-system.ts:503`).
- **MEASURED.** Riots opened repeatedly in acts B, P, Y and D and each closed
  itself, and the closing band in three of them was *"the last one ran out of
  time instead of being contained"*.

Put together those read like a **ratchet**: needs decay → riot opens → the riot
forbids every action that would serve a need except recreation → needs stay at
zero → the next riot opens. And [§5.1](#51-measured--the-only-act-that-contained-an-incident-is-the-only-act-that-went-broke)
is what would hold the ratchet shut: the three acts whose incidents all lapsed
are the three that had no free guard to answer one. **That is an inference, not
a measurement, and this record did not test it.** What would establish it: a run that samples the need
levels inside and outside riot windows, or one that never triggers an incident
at all. If it is right, it is the most important thing here, because it means
the settled 5-of-6 composition every act reached is not the player's neglect —
it is the incident system, and it is the composition the restored penalty would
be pricing in practice.

---

## What this record does *not* claim

- **That acts B and P are the same world.** They are the same *script* on two
  trees. The command timing is wall-clock dependent, so the RNG trajectories
  diverge — the prisoner names differ, and act B's build finished 5,586 ticks
  later than act P's (its watch opened at tick 18,411 against P's 12,825). **This is the weakest claim here.** It is why §2's
  comparison is stated as *price per place at a matched need composition*
  (1,200 against 400 at 5-of-6 unmet, both measured with the inspector open)
  rather than as one curve minus the other. What would refute it: a boundary
  where the two trees are shown the same composition and do not pay 300 and 100
  respectively.
- **That the shipped tree needs sixteen guards to sink.** That number is
  ARITHMETIC from two measurements — act B's 1,200 a day at four places, and act
  D's `dailyWageBillMinorUnits: 480` for six guards — and no act was played with
  sixteen guards on an unmutated tree.
- **That act D's prison is unrecoverable.** It was still at 23,660 and falling
  80 a day when the act ended. Whether it reaches the −2,500 floor, and whether
  the levers there behave as the earlier note measured them, was not played.
- **That any of this holds at another population.** Every act held **four**
  prisoners, because an 8×8 yard admits exactly four
  (`TILES_PER_OPEN_GROUND_PLACE = 16`,
  `src/simulation/prisoners/room-instance-registry.ts:222`; 64 tiles) and act Y
  had to fit inside it.
  The ratios in §2's table are all `n = 4`; a fifty-prisoner prison is a
  different question and it is the one balance actually needs.
- **That anything here is about rendering.** Read off the worker's
  `simulation/status-counts` channel and the DOM. Git LFS content happened to be
  present in this worktree (`file public/assets/actors/actor.guard.base.idle.png`
  → `PNG image data, 260 x 3104`), so the actors did draw, but nothing was
  concluded from a pixel.

---

## 9. Instrument failures

- **Act Y hit Playwright's 600 s per-test timeout** and is reported as `1
  failed`. Every reading survived it — the curve, the need inspector and the
  final screen were all printed before the kill — but the act is 100 s longer
  than P because zoning the yard, and the extra rooms-panel reads it logs, sit
  in front of the same 7-day watch. The watch's own budget is 250 s and was not
  what stopped it.
- **The first act B run measured the wrong thing twice, and both were the
  instrument's fault.** `buildTheReasonablePrison` runs the clock at 4× for its
  whole ~250 s, so the prison was already at in-game day 7 before anybody was
  admitted; a watch that targeted an absolute tick therefore saw **three**
  populated day boundaries instead of eight. And four fixed bed presses produced
  three beds, so that run measured **three** occupied places while its own
  constant said four (`roomCapacity: 3`, `prisonersInIntake: 1` throughout). Both
  are fixed in the file — the target is relative to admission, and beds are
  placed until the *prison* reports `accommodationCapacity ≥ PRISONERS` — and the
  broken run's numbers are not used anywhere above.
- **A 6×6 cell and an 8×8 yard do not both fit on screen at 1440×900**, which is
  why this file builds a 3×4 cell where every other playtest builds 6×6.
  Measured on the real page: calibration puts tile (0,0) at screen
  `(−304, −574)`; `.hud-strip` covers y < 110, `.hud__corner` covers x < 422 for
  y in 406–831, `.hud__rail` covers x > 1152 and `.hud__tabs` covers y > 831 —
  leaving a pointer-reachable window of roughly cols 12–21, rows 11–21.
- **`console.log` inside a `vitest` test is swallowed by the default reporter**,
  so the §0 schedule probe had to be printed by making an assertion fail on the
  value. Recorded because the workaround is not obvious and the alternative
  looks like a broken probe.

---

## Reproduction

```
# acts B and N -- unmodified tree
LOCKSTATE_BROWSER_TEST_PORT=5412 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-what-pressure-there-is.playtest.ts \
  --grep "B the shipped curve"

# acts P, Y and D -- mutate, run, restore, verify
sha256sum src/simulation/economy/income.ts > /tmp/income.sha256
sed -i 's/^export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0;$/export const STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 40;/' \
  src/simulation/economy/income.ts
#   ... --grep "P the curve with the penalty restored" | "Y the yard" | "D the penalty restored" ...
git checkout -- src/simulation/economy/income.ts
sha256sum -c /tmp/income.sha256          # must print OK
```

One act at a time: each is seven to ten wall-clock minutes and the config gives
each 600 s. `--grep` is a regex, which is why the describe title *What pressure
there is* has no parentheses in it. **Never push the mutated constant.**
