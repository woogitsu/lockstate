# Can this prison fail? — 2026-09-04

**The verdict in one line: yes, exactly once — and the one sentence on screen
that describes it says the state is about to pay you.**

Asked on the day the state-income penalty was suspended
(`STATE_INCOME_WITHHELD_PER_UNMET_NEED_MINOR_UNITS = 0`,
`src/simulation/economy/income.ts`) so the owner could judge the game's ease by
playing it. Four prisons were played from scratch on this branch, cut from
`origin/main` at v0.0.438 (`14f37a60`), at **1440×900**, through
`tests/browser/playtest-2026-09-04-can-this-prison-fail.playtest.ts`. Nothing in
`src/` was changed and no player-facing string was touched: `AGENTS.md`'s
fourth exclusion puts every word below with the owner, so this record says what
a sentence must *convey* and writes none.

**Nothing in CI collects that file** (`playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`), so it is evidence and never a gate.

| act | what was played | ticks | in-game days | wall clock |
| --- | --- | --- | --- | --- |
| **A** the neglectful prison | a bare zoned cell, 24 prisoners, no bed, no toilet, no canteen, no yard, no guard | 24,058 | 10 | **322.6 s** |
| **B** the spendthrift prison | 60 guards and 288 bricks bought on day 1, then eight days of payday | 19,396 | 8 | **334.7 s** |
| **C** the idle prison | a new prison, and not one press | 24,106 | 10 | **308.5 s** |
| **D** the control | act A's build with six beds added, so somebody is actually housed | 14,578 | 6 | **225.9 s** |

`DAY_LENGTH_TICKS` is 2,400 and the clock at 4× ran at **≈78 ticks a second**
in every act, so ten in-game days cost about five wall-clock minutes.

---

## The answer in one paragraph

**Three of the four prisons cannot fail and are never in any danger.** Neglect
is free: twenty-four people with every need at zero for ten days moved the
treasury by **not one minor unit**, and the riots it caused put themselves down
again. Idleness is a still photograph. What *can* happen is the fourth: spend
the grant and the standing overdraft on staff, and the treasury pins at
**−2,500** with a payroll that **cannot be stopped by any control in the
interface** and an income line that cannot be restarted, because restarting it
costs money the floor will not release. That prison is over. The screen says
so five different ways and every one of them describes a delay.

---

## 1. DEFECT — a prison can reach a state nothing in the interface can leave, and the badge that names it promises money that is never coming

**Reproduction** (act B). New prison → Security tab → press *Hire Guard* sixty
times → Build tab → buy 288 `item.brick`. Then run.

The panel priced it honestly before a single press:

> Hire Guard · 80 — Costs 80 now and 80 a day in wages, including today.

Sixty of those is 4,800 spent and **4,800 a day** standing, against an opening
grant of 25,000 and a standing overdraft floor of −2,500. Read off the FUNDS
chip, day by day:

| day | FUNDS chip, verbatim | arrears (`unpaidWagesMinorUnits`) |
| --- | --- | --- |
| 1 | `8,680 · FUNDS` | 0 |
| 2 | `3,880 · FUNDS` | 0 |
| 3 | `-920 · FUNDS · 265 left · 265 left before deliveries stop — past that, no materials can be ordered until the state pays what it owes.` | 0 |
| 4 | `-2,500 · FUNDS · 0 left · The treasury is exhausted — nothing can be spent at all until the state pays what it owes.` | 3,220 |
| 5 | *(unchanged)* | 8,020 |
| 6 | *(unchanged)* | 12,820 |
| 7 | *(unchanged)* | 17,620 |
| 8 | *(unchanged)* | 22,420 |
| 9 | *(unchanged)* | 27,220 |

**The floor holds exactly.** From day 4 to day 9 the balance is `-2,500` at
every reading, while the arrears climb by precisely 4,800 a day. ADR 0049's
"insolvency is a state, not a loss condition" is true as written, and the
arithmetic under it is clean.

**Then every lever a player has was tried, at the floor, in the order a player
would reach for them.** All five readings are verbatim:

| lever | what happened |
| --- | --- |
| 1 — place a wall | **accepted**: one `PlaceBuildOrder`, queue `1 waiting · 0 being built`, funds unchanged at `-2500` |
| 2 — buy one brick | control `aria-disabled="true"`, `Not enough money — you need 1,355 more.` |
| 3 — hire | control `aria-disabled="true"`, `Not enough money — you need 1,395 more.` |
| 4 — dismiss a guard | **no dismiss control is reachable** — see finding 2 |
| 5 — admit a prisoner | pressed three times, refused three times: `Nobody was admitted — this prison has no room to hold anybody.` |

And then the prison was left alone for four more days. Treasury: `-2,500`.
`EARNED TODAY`: `0`. Prisoners: `0`. Rooms: `0`. Staff: `60`.

**Why it cannot be left.** Income is paid per occupied place (finding 3), an
occupied place needs a zoned cell with a bed in it, a cell needs walls, a wall
needs money, and money needs income. The loop has no entry point that costs
nothing. The only door out of that prison is `New prison`.

**What the screen says instead.** The FUNDS badge — the one element that names
the condition — reads *"…until the state pays what it owes."* The state owes
this prison nothing: it holds nobody, so `stateIncomeAccruedTodayMinorUnits` is
`0` at every one of the 29 samples taken. The sentence describes a wait. What
was measured is a stop.

**Refuting sample, and it is the strongest one here.** *Is the treasury really
stuck, or merely slow?* Act B's last four days exist to answer exactly that:
**twelve consecutive samples across four day boundaries, every one of them
`treasuryMinorUnits: -2500`**, with the clock at 4× and nothing pending. If the
state were going to pay, four paydays was where it would have.

**What a fix must convey** (the words are the owner's): that the treasury is at
its floor *because the prison is not earning*, and what the prison would have to
hold for the state to pay it anything — not that a payment is pending.

---

## 2. HIDDEN — sixty guards on the payroll, and not one of them can be dismissed

**Reproduction** (act B, `LEVER 4`). At the floor, Security tab. The staff
panel's own block reads:

> ON DUTY — 0 held · 60 free — Nobody is assigned right now. A released guard stays hired and goes back to the pool.

`ON THE PAYROLL — 4,800 a day` sits directly under it. The roster block
`.hud-staff__held-list` reports **`not laid out`** — it is not on screen at all.
Six `.hud-staff__held-row` elements do exist in the DOM, and each was read
rather than pressed:

| row | visible | enabled | label |
| --- | --- | --- | --- |
| 0, 1, 2 | `false` | `false` | `Release` |
| 3, 4, 5 | `false` | **`true`** | `Dismiss` |

So the only control that could end a wage bill is present, three of its
instances are enabled, and **all six are invisible**, because the block that
holds them draws only guards who are *assigned* — and a prison with no rooms has
no post to assign anybody to. A player who over-hires before building has hired
permanently.

**Refuting sample.** *Is the block merely collapsed, or scrolled?* No: the panel
around it is laid out and readable — the same `panelText` call returns the full
`ON DUTY` text quoted above from `.hud-staff__held` in the same instant that
`.hud-staff__held-list` returns `not laid out`. The parent renders; the list
does not.

**Cost of finding this out:** two whole 600-second act B runs died in
Playwright's actionability retry loop pressing controls that report themselves
present. A player gets the same experience with no error message at all.

**What a fix must convey:** that a hired guard who is not assigned is still
being paid, and where the player goes to stop paying them.

---

## 3. MEASURED — neglect is free, and it is also worth nothing: ten days, twenty-four prisoners, treasury moved by zero

**Reproduction** (act A). New prison → four brick wall runs enclosing tiles
(12,12)–(17,17) → designate `room.cell` (accepted first attempt) → press *Admit*
twenty-four times → place nothing inside → hire nobody → run ten days.

Every reading, every day, from day 3 to day 11:

```
funds = "22,600 · FUNDS"   earned = "0 · EARNED TODAY"
prisoners = "24 · PRISONERS · 24 with no bed"
```

`treasuryMinorUnits: 22600` at the first sample and at the last. The 2,400 that
left the opening 25,000 was **sixty bricks bought at 40 each**, before anybody
arrived; the twenty-four wall segments then drew that stock and were charged
nothing further. **Ten days of total neglect cost nothing and earned nothing.**

The reason is in the counts, not in the penalty that was suspended:
`prisonersInIntake: 24`, `roomOccupants: 0`, `roomCapacity: 0`,
`accommodationCapacity: 0` — for the whole run. All twenty-four stood at
*Cell Assignment* for ten days, and the state pays per **occupied place**.

**The refuting sample, and it is why act D was played.** A `0` that size is as
easily a broken income line as a measured consequence. Act D repeats act A's
build exactly and adds six beds, changing nothing else:

| act D reading | value |
| --- | --- |
| after the beds | `rooms=1 roomCapacity=6 accommodationCapacity=6` |
| after six admissions | `roomOccupants: 6`, `prisonersInIntake: 0` |
| treasury at tick 9,602 | `22,080` → **`23,880`** |
| treasury at tick 12,036 | `23,880` → **`25,680`** |
| treasury at tick 14,411 | `25,680` → **`27,480`** |

**+1,800 at every one of three consecutive day boundaries, which is 6 × 300
exactly**, and the accrual readout walks up to meet it: `1,771` at tick 9,561,
`1,797` at tick 11,996, then the boundary pays and it resets to `2` and `27`.
The income line works. Act A's zero is the neglect.

### And the suspension itself, observed in play

Act D's own roster at the end reads four of six prisoners as
`Safety · 0% · Medium` — a need at the bottom of its range — and the day still
paid **300 per occupied place**, not a unit less. That is the owner's ruling of
2026-09-03 seen from the HUD rather than from the constant: with the withheld
share at `0`, a prison is paid in full for a person it is failing.

**So the pressure the suspension removed is not the pressure that is missing.**
Even with the penalty restored, act A's prison would have been charged nothing,
because it was earning nothing to withhold from. The lever that actually decides
a neglectful prison's economy is **whether anyone is housed**, and that lever is
binary: 0/day or 300/day per person, with nothing in between.

---

## 4. MEASURED — riots are a metronome, not a threat: four of them, all Critical, all self-resolved with zero staff and zero presses

Act A ran twenty-four starving, sleepless, unguarded prisoners for ten days.
`COVERAGE` read `0 · Unguarded` throughout. What happened, from the alerts list:

| day | alert row, verbatim |
| --- | --- |
| 2 | `A fight has broken out between two prisoners. Day 2 · Warning` |
| 3 | `A riot has broken out — 24 prisoners have stopped taking orders. Day 3 · Critical` |
| 3 | `The prison is under control again — no incident is still open. 2× Day 3 · Info` |
| 5 | riot `2×`, resolution `3×` |
| 7 | riot `3×`, resolution `4×` |
| 9 | riot `4×`, resolution `5×` |

**A riot every two days, every one of them over by itself.** At the final
reading the `INCIDENTS` chip is back to `0 · INCIDENTS · Clear` and the event
band is `[info] The prison is under control again — no incident is still open.`

And nothing was lost. Across all four riots: `prisoners` stayed `24` — no
escape, no death — and `treasuryMinorUnits` stayed `22600` — no cost. The most
severe thing this game can put on screen, four times over, changed no number a
player is tracking.

**Refuting sample.** *Did the riots resolve because the player did something?*
No press of any kind was made between the admissions at tick 4,685 and the
final reading at tick 24,058 — the run's only interaction in that window is the
polling read. *Did a guard put them down?* `staff: 0` at every sample.

**What this suggests, and it is a design question rather than a defect:** a
`Critical` that costs nothing teaches the player to ignore `Critical`.

---

## 5. MEASURED — the idle prison is a still photograph

Act C: new prison, no press, ten days, 24,106 ticks. Every chip identical at
tick 0 and at tick 24,106:

```
prisoners 0 | high-risk 0 | staff 0 | coverage 0 Covered | rooms 0
incidents 0 Clear | contraband 0 | funds 25,000 | earned-today 0
```

Event band: empty for the entire run. Alerts: `No active alerts`. **The worker
published `simulation/status-counts` exactly once, at tick 0**, and never again
— the deduplication in `status-counts.ts` is working, and it is a fair
description of the session: nothing changed. The day counter is the only moving
part on the screen.

There is no drift, good or bad. A prison left alone is neither punished nor
decayed.

---

## 6. Smaller things, all read off the screen

- **The arrears figure is the only money on screen without digit grouping.**
  The band reads `Payday went unpaid — your staff are owed 27220` in the same
  frame that the chip beside it reads `25,000 · FUNDS`. Every other money value
  measured in four acts is grouped.
- **One alert row per day, forever.** Act B accrued a new `Payday went unpaid`
  row on days 3, 4, 5, 6, 7 and 8 — six rows in six days, none coalesced,
  because each carries a different amount. The riot rows in act A *did* coalesce
  (`4×`), so the list can do it; an amount in the text is what defeats it. A
  hundred-day insolvency is a hundred rows.
- **The refusal band held one stale sentence for ten in-game days.** In acts A,
  B and D the calibration's `Nothing was removed — there is no object on that
  tile…` was still in `.hud__refusal` at the final reading, 320 wall-clock
  seconds and ~21,000 ticks after the press that caused it, and its alert row is
  the only one in the list with no `Clear this alert` control. Both halves are
  already filed — the un-clearable refusal row is finding 7 of
  `docs/research/2026-09-03-does-building-feel-good.md` — and are recorded here
  only because they were observed again, at a duration nothing had measured
  before.
- **Twenty-four refused *Admit* presses cost nothing and warned nothing.** The
  first act A run (before a cell existed) pressed *Admit* twenty-four times into
  a prison with no room. Every press threw `HostRefusalError` to the console,
  the treasury never moved, and the control never went `disabled` — the intake
  panel's note explains the rule, but the control keeps accepting presses.

---

## What this record does *not* claim

- **That the wall placed at the floor was ever built.** Act B's lever 1 was
  accepted (`1 waiting · 0 being built`) and the queue read `not laid out` — the
  panel's empty state — at the end of the run, with funds unchanged at `-2,500`
  throughout. That is consistent with a wall built out of the 288 already-paid
  bricks in stock *and* with an order that failed quietly, and this record did
  not separate them. **This is the weakest claim here.** What would settle it: a
  read of the world view or of the construction projection at that tile, which
  is one press of the Remove tool away and was not taken.
- **That −2,500 is unreachable for a prison that already earns.** Every act
  measured here started from an empty prison. A prison with fifty housed
  prisoners earning 15,000 a day and a payroll larger than that is a different
  question, and it is the interesting one for balance; this record only shows
  that the *empty* version of it is terminal.
- **That there is no loss condition anywhere.** What was searched is what a
  player can see: nine status chips, the event band, the alerts list, the
  refusal band and five panels, across 82,138 ticks. Nothing in any of them ever
  said the game was over. A loss condition that exists but is never drawn would
  read identically.

---

## What the brief that commissioned this got wrong

It described the shipped income rule as *"a flat 300 per prisoner-day
**regardless of how many needs go unmet**"*. The first half is the part that
misleads. It is 300 per **occupied place**-day — per person who has a bed and is
in it — and the difference is not a nuance: act A held **twenty-four** prisoners
and earned **0**, while act D held **six** and earned **1,800 a day**. A player
reading "per prisoner-day" off the roster count would be wrong by the entire
amount.

The brief also asked whether *"the main economic pressure"* had been suspended.
Measured, the suspended penalty was never the main pressure on a neglectful
prison — it could only ever have withheld a share of an income that neglect had
already reduced to zero. The pressure that is actually missing is that **neglect
has no downside at all**, not that its downside was turned off.

---

## Reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=5397 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-can-this-prison-fail.playtest.ts
```

`git lfs checkout` first in a worktree, or the atlases fail to decode and every
actor is missing while the run still passes. Each act is its own `test()` and
takes four to six wall-clock minutes; `--grep` them one at a time (`--grep` is a
regex — the describe title `Can this prison fail` has no parentheses in it for
exactly that reason).
