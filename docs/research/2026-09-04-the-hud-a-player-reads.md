# The HUD a player reads — which of their questions does it answer?

**Date:** 2026-09-04
**Tree played:** `origin/main` at **v0.0.469** (`be244a24`), in worktree
`/workspace/wt-the-hud` on branch `agent/playtest-the-hud-a-player-reads`.
Nothing under `src/` differs from that commit — `git diff --stat be244a24 -- src/`
is empty — and the running page confirms it from inside: the strip's own
version line read `v0.0.469 · be244a2` on the first act and `v0.0.469 · 611df7c`
on every later one, `611df7c` being this branch's first, **instrument-only**
commit.

**Instrument:** `tests/browser/playtest-2026-09-04-the-hud-a-player-reads.playtest.ts`,
six acts, run at 1440×900 on `tests/browser/playwright.playtest.config.ts` with
`LOCKSTATE_BROWSER_TEST_PORT=5322`. **Not a CI gate** —
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/` and never
collects a `.playtest.ts`.

**Question, as given:** *a player is running a prison. At any given moment they
have a question — "am I losing money?", "why is nobody in that cell?", "what is
that alert about?", "what should I do next?" — and they look at the HUD to
answer it. Which of their questions does it answer, which does it answer badly,
and what should it be instead?*

**Every claim is labelled** — **MEASURED** (from a run below, quoted) ·
**VERIFIED, read** (the file was opened at that line) · **REASONED** (follows
from a stated MEASURED/VERIFIED fact) · **JUDGEMENT** (what a player would do or
feel). Nothing here is from memory.

---

## The verdict, in one paragraph

**This HUD is a very good instrument panel and not a HUD.** Every number on it
is real, labelled, and correct; the status strip escalates properly and puts the
urgent thing where the eye already is. What it never does is tell the player
*what is happening to their prison*. Measured: a prison with eight prisoners,
four of them with nowhere to sleep, one guard, a fight in progress and an
incident that had just lapsed hurting everyone in it, showed an Overview tab
that was **62% word-for-word identical to an empty prison's** — and the twelve
lines it did add were four intake numbers and three alert rows, **not one
sentence about the prison**. Across a six-in-game-day run the Intake panel and
the refusal band each held **one byte-identical value for 14,237 ticks (5.9
in-game days)**, and the refusal band's value was a message about a click made
before any wall existed, painted in the **strongest alarm colour on the screen**
across the full 1440px width. The HUD's chrome is **52.3% of the viewport** on a
running prison, and its single largest panel — 220,492px², **17.0% of the whole
screen** — is titled *Minimap*, says *"Minimap is not available yet"*, and has
the alerts list, the only place an incident is ever explained, buried inside it
as a sub-section. There is **no typographic hierarchy at all**: all 250
laid-out elements are 11px, 13px or 13.33px, and every visible sentence and
number is 13px, so the prisoner count, an incident that hurt everybody, and the
save-file generation id are set identically. **Of the player's four questions,
the HUD answers one** ("what is that alert about?", badly and late), **answers
half of one** ("am I losing money?" — it shows the balance and today's income,
and puts the payroll on another tab and the burn rate nowhere), and **answers
neither of the other two at all**: pressing the cell produced **0 commands**,
and nothing on any tab ranks, orders or suggests anything to do.

---

## Reproduction

From the worktree root, one act at a time:

```bash
LOCKSTATE_BROWSER_TEST_PORT=5322 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-the-hud-a-player-reads.playtest.ts -g "act N"
```

| Act | What it does | Result |
| --- | --- | --- |
| 1 | Empty prison, full geometric census of `.hud` on all five tabs | passed |
| 2 | The same census with a built, populated, running prison | passed (3.8m) |
| 3 | 35 samples of every region's text over 14,237 ticks | passed |
| 4 | Five questions a player has, asked from the tab they are on | passed (4.2m) |
| 5 | Real estate, hidden content, and 1280×800 | passed |
| 6 | Whether the orphan `status-counts` fields still cross the boundary | passed |

`DAY_LENGTH_TICKS = 2_400` (**VERIFIED, read**:
`src/simulation/prisoners/regime.ts:12`), so every tick figure below converts at
2,400 ticks to the in-game day.

---

## 1. What is on screen, and what is it for

**MEASURED**, act 1 and act 2, at 1440×900. The HUD has four top-level regions
on an empty prison and six on a running one — two bands appear once the session
has something to say.

| Region | Running-prison size | Share of viewport | The player question it answers |
| --- | --- | --- | --- |
| `.hud__corner` (the Minimap panel) | 422×578 | **18.82%** | *"what is that alert about?"* — but only from the sub-section inside it |
| `.hud__rail` (save panel, scale, tab panel) | 288×688 | **15.30%** | *"where are my prisons?"*, plus whichever tab is open |
| `.hud-strip` | 1440×78 | 8.72% | *"how many, how much, what day?"* |
| `.hud__refusal` | 1440×32 | 3.56% | *"why did that press do nothing?"* |
| `.hud__event` | 1440×32 | 3.56% | *"what just happened?"* |
| `.hud__tabs` | 435×69 | 2.32% | navigation |
| **Total HUD chrome** | | **52.3%** | |

The interior of the largest region, **MEASURED**:

- `ui-panel hud-minimap` — 398×554 = 220,492px² = **17.01% of the viewport**.
- `hud-minimap__surface` inside it — 224×224 = 50,176px² = **3.87%**, whose
  entire content is the sentence `Minimap is not available yet`.
- `hud-alerts__list` inside it — 372×214 = 79,608px² = **6.14%**.

**VERIFIED, read**: `src/ui/hud/hud.ts:1555` —
`minimapPanel.body.append(minimapSurface, alertsSection.element);` — and
`src/ui/hud/hud.ts:1557` — `const corner = element('div', { className: 'hud__corner', children: [minimapPanel.element] });`.
**The alerts list is a section of the Minimap panel.** The one surface that ever
explains an incident is subordinate, in the DOM and on screen, to a placeholder
for a feature that does not exist.

**Pre-alpha is not a defect, and this is the line.** The minimap *rendering* not
existing is a system that has not been built, honestly labelled — the code says
so at `src/ui/hud/hud.ts:1502-1507`, *"Rendering is still a placeholder, honestly
labelled in visible text"*. That is fine. What is not pre-alpha is that the
placeholder was given **the best real estate on the screen** and the working
subsystem was nested underneath it.

### 1.1 What answers nothing

**MEASURED**, act 2 running-prison Overview census. Elements carrying their own
visible text that answer no question about the prison:

- `brand__build` — `v0.0.469 · 611df7c`, and its 1×1 `ui-sr-only` twin
  *"Lockstate, PRE-ALPHA build, version 0.0.469, commit 611df7c."* Two lines of
  the strip, permanently.
- `save-panel__status` — `Saved (generation gen-mtnhcuan-5).` This changed
  **once** in 35 samples (act 3, region `save`: 2 distinct values), and the
  thing that changed inside it was a random-looking id.
- `hud.intake.hint` — *"A prison needs a cell before it can admit anyone. It
  does not need a free bed: an arrival with none waits until a bed is free."*
  43px tall, on the Overview tab, **byte-identical from an empty prison to a
  prison of eight** (act 1 vs act 2 diff below). It answers a question the
  player had once, on day 1, and then holds its pixels for ever.

---

## 2. The player's question at each moment, and whether they can answer it

Act 4 built a deliberately under-built prison — 2 beds, 8 admitted, 3 guards —
and asked each question from the tab a player is plausibly on.

### Q1 — "am I losing money?" (asked from Overview, day 3, 75% through)

**MEASURED.** Everything on screen that is about money:

```
25,000 → 22,700    FUNDS
              452  EARNED TODAY
```

and nothing else, anywhere on the tab. The worker at that moment
(**MEASURED**, tee): `treasuryMinorUnits: 22700`,
`stateIncomeAccruedTodayMinorUnits: 523`, `dailyWageBillMinorUnits: 240`.

**The answer is not on the screen.** `EARNED TODAY` is a gross accrual, not a
net; `FUNDS` is a level with no delta beside it. To learn that the payroll is
240 a day, the player must open the **Security** tab, where
**MEASURED** (act 2) the Staff panel's last two lines read:

```
ON THE PAYROLL
80 a day
```

**VERIFIED, read**: `src/ui/hud/staff-panel.ts:498-538`, `describeDailyWageBill`
— its own docblock says `dailyWageBillMinorUnits` *"had **no reader** in
`src/ui/` until this block"* and that the section it lands on starts collapsed.
So the wage bill exists on exactly one line, on one tab, on a fold.

**Interactions to an answer: one tab switch, and then a subtraction the game
does not do.** And even after it, construction spend and delivery spend — the
two things that actually moved the balance in this run — appear as a *rate*
nowhere at all. **REASONED**: the player cannot answer "am I losing money?"
from this HUD; they can answer "how much money do I have?" and "did I earn
anything today?", which are different questions.

### Q2 — "why is nobody in that cell?" (asked from Overview, looking at the world)

**MEASURED.** `document.elementFromPoint` at the cell interior returned
`canvas.` — the press was **not** on HUD, so it reached the world. It produced
**zero commands**:

```
[act4] elementFromPoint at the cell interior: canvas.
[act4] pressing inside the cell produced 0 command(s): []
```

and the Overview tab afterwards was byte-identical to the Overview tab before.
**There is no way to ask the world a question.** This is the `selection.primary`
action sitting in `AWAITING_CONSUMER` — the class
`docs/research/2026-09-04-what-the-game-shows-nobody.md` §1.2 already names —
seen from the player's side: a click on the prison is a click on nothing.

**JUDGEMENT:** this is the largest gap in the HUD. **It is not a missing panel**
— §9's P1 opens the code and shows the inspector already exists. It is that the
world — the **47.7%** of the viewport HUD chrome does not cover, and the thing a
player is actually looking at — is **not an input surface for questions**, only
for orders.

### Q3 — "what is that alert about?" (asked from Build, day 4)

**MEASURED.** The alerts column at that moment, in full:

```
ALERTS
Nothing was removed — there is no object on that tile, and none being built there.
Warning
```

One row. The prison at that moment had 8 prisoners, 6 of them with no bed, and
was two in-game days from its first fight. The one thing in the alerts column
was a refusal produced by a press on an empty tile **before any wall existed**,
and the refusal band 32px above it was showing the *same sentence at the same
moment*. **This is #894 reproduced at v0.0.469, on day 4.**

Act 3 followed the column across six in-game days with the prison in real
trouble. Its full contents at the end, **MEASURED** (tick 21,779, day 9):

```
Contraband found: Phone. Day 5                                              Warning
A fight has broken out between two prisoners. 4× Day 9                      Warning
No incident is still open — but the last one ran out of time instead of
  being contained, and everyone caught in it was hurt. 4× Day 9             Warning
Nothing was removed — there is no object on that tile, and none being
  built there.                                                             Warning
```

**Four rows. Every one of them says `Warning`.** **VERIFIED, read**:
`src/ui/hud/view-model.ts:414` — `export type HudSeverity = 'info' | 'warning' | 'danger';`
— and `src/ui/simulation-events.ts:319-337`, where `incidents.riot-opened`,
`incidents.escape-attempt-opened`, `incidents.escape-succeeded` and
`incidents.gang-retaliation-opened` are `'danger'`, while
`incidents.all-clear-after-lapse` and `incidents.assault-opened` are
`'warning'`. So the ladder exists and has producers; it simply produced **no
discrimination whatever** in the session played. Four fights ran out of time,
everyone in them was hurt, and the row saying so is the same colour and the same
word as *"nothing was removed"*.

**Interactions to an answer: none available.** The row says the last incident
lapsed and everyone in it was hurt. It does not say **how many**, **who**,
**where**, or that this is the fourth time in five days — and the game knows all
four (`IncidentOutcomeViewModel.injuredCount`, `IncidentDetailViewModel.timeline`,
`responseMetrics.routeFailures`; census §5.3). There is no incidents panel to
press into.

### Q4 — "what should I do next?" (asked from Overview)

**MEASURED.** The Overview tab at that moment was byte-identical to the Overview
tab at Q1 and Q2 except for the numbers on the strip. Everything on it that
resembles an instruction:

- `4 waiting with no bed to sleep in` (Intake panel) — a state, not an
  instruction, and **the control that fixes it is on the Build tab**. This is
  #889's shape at a second site.
- `A prison needs a cell before it can admit anyone…` — the day-1 hint,
  unchanged.
- `Nothing was removed — there is no object on that tile…` — four in-game days
  stale.

**Nothing on the HUD ranks anything, orders anything, or names a next step.**

### Q5 — the day boundary, watched from a tab that is not Overview

**MEASURED.** Standing on the Regime tab, the strip carried the player across
three in-game days (day 4 → day 7) while `FUNDS` went 23,060 → 24,140. That is
the strip doing its job: **the money moved where the eye was**, exactly as
`docs/research/2026-09-03-can-a-player-read-this.md` found. What the boundary
itself produced on screen was **nothing** — no marker, no "day 5 closed", no
statement of what the day cost or earned. The `EARNED TODAY` chip resets to a
small number and the player is expected to notice.

---

## 3. What is taking up room without earning it

Act 3: one prison, 35 samples, ticks 8,013 → 22,250 (**14,237 ticks = 5.93
in-game days**, day 4 → day 10), Overview tab held the whole time, at ×4.

| Region | Distinct values in 35 samples | Longest byte-identical run |
| --- | --- | --- |
| `strip` | **35** | — |
| `minimap` (i.e. the alerts) | 10 | 2,615 ticks = **1.09 days** |
| `events` | 4 (laid out in 27 of 35) | — |
| `save` | 2 | — |
| `tabs` | 1 | whole run |
| **`refusal`** | **1** | **14,237 ticks = 5.93 days** |
| **`intake`** | **1** | **14,237 ticks = 5.93 days** |

Two of the six always-present regions **never changed once** across six in-game
days, while laid out on every sample.

**The refusal band** (1440×32, 3.56% of the viewport) held, for the whole run:

> Nothing was removed — there is no object on that tile, and none being built there.

**VERIFIED, read**: `src/ui/hud/hud.ts:1094-1098` states the rule and its
reason — *"It does **not** auto-dismiss. A message that clears itself on a timer
is a race against how fast the player reads … a simulation refusal [stays] until
another replaces it or the session ends, which are the first moments each
sentence stops being true."* The rule is **correct about truth** — nothing was
removed, and that stays true. It is wrong about **relevance**, and the
measurement is the argument: 5.93 in-game days, during which four incidents
lapsed and everyone in them was hurt, with the band still describing a click
made before the first wall.

**The Intake panel** (264×153) held, for the whole run:

```
INTAKE / Admit a prisoner / 4 waiting with no bed to sleep in
A prison needs a cell before it can admit anyone. It does not need a free bed…
IN INTAKE / 4 of 8 / 4 at Cell Assignment
```

**Every one of those lines is true.** The problem is that a permanent,
worsening, actionable fact is rendered as furniture: a player who glances at it
on day 10 sees the same pixels they saw on day 4 and learns nothing about
whether it is getting better or worse.

**The strip is the part that works.** 35 distinct values in 35 samples. But
**MEASURED**, line by line across those samples, **18 of its 34 lines were
byte-constant for the whole 5.93 days** — every line about prisoners, the
no-bed badge, high risk, staff, coverage and rooms. Only funds, earned-today,
the day, the progress percentage and the two incident/contraband chips moved.

---

## 4. What the player is told twice, and what once too quietly

**Twice, verbatim, at the same moment** (**MEASURED**, act 4 Q3 and act 3
sample 1): the refusal band and the alerts list carried the identical sentence
simultaneously — #894, still live at v0.0.469.

**Twice, in the same words, meaning two different things.** The Intake panel's
section header and the Regime panel's roster header both render `4 of 8` in the
same `ui-value` style:

- **VERIFIED, read**: `src/content/default-locale-en.ts:1598` —
  `'hud.intake.pipeline-count': '{waiting} of {total}'`.
- **VERIFIED, read**: `src/content/default-locale-en.ts:2005` —
  `'hud.regime.roster-count': '{shown} of {total}'`.
- **VERIFIED, read**: `src/ui/hud/regime-panel.ts:293` —
  `export const PRISONER_ROSTER_ROW_LIMIT = 4;` and `:1280-1284`, where `shown`
  is `roster.rows.slice(0, PRISONER_ROSTER_ROW_LIMIT).length`.

So the Intake `4 of 8` is *four prisoners still waiting, of eight in the
prison* — a fact about the prison — and the Regime `4 of 8` is *four rows this
panel had room to draw, of eight* — a fact about the panel, which **can never
exceed 4** whatever happens. Under a heading that reads `PRISONERS`.

**Twice, from two different definitions.** *"With no bed"* is on screen twice at
once: **VERIFIED, read**, `src/ui/hud/projection.ts:301` —
`return Math.max(0, counts.prisoners - counts.occupiedPlaces);` behind
`src/content/default-locale-en.ts:167` `'hud.status.prisoners-without-bed': '{count} with no bed'`;
and `src/ui/hud/intake-panel.ts:187` — `t(HUD_MESSAGE_KEY.intakeNoPlace, { count: pipeline.waitingWithoutPlace })`
behind `:1592` `'{count} waiting with no bed to sleep in'`. Both read `4` in
this run, so no contradiction was observed. **UNCERTAIN** whether they can
disagree; they are different fields of different projections, which is the exact
shape `2026-09-03-can-a-player-read-this.md` §1 found for the two "coverage"
figures — and that one is **still live**: act 2 measured `8 COVERAGE Covered`
on the strip and `GUARD COVERAGE 1 of 1 Covered` on the Security panel at the
same instant.

**Once, too quietly.** The four standing prison conditions. **MEASURED**, act 4:

```
[act4] standing conditions: 310 counts publications, 282 with a non-empty condition set
[act4] first ten non-empty: [{"tick":4626,"conditions":["intake.no-place"]}, …]
```

**282 of 310 publications — 91% — carried a live condition, and nothing on the
main thread reads the field.** This settles the **UNCERTAIN** left by
`docs/research/2026-09-04-what-the-game-shows-nobody.md` §5.1, which was a text
census and could not say whether the field was ever non-empty in a session a
player can drive. It is non-empty for nine tenths of an ordinary session.
**VERIFIED, read**: `src/simulation/presentation/status-strip-projection.ts:253-283`,
`computeStandingPrisonConditions`, and `src/simulation/protocol/types.ts:668-673`,
`PRISON_CONDITIONS`. Act 6 confirms the field is still on the wire at v0.0.469:
`conditions` is one of the 21 keys the last `simulation/status-counts` carried.

---

## 5. Where the eye goes

**MEASURED**, act 2 running-prison Overview census, 250 laid-out elements:

- **Font sizes present anywhere in `.hud`: 11px (39 elements), 13px (160),
  13.3333px (51).** Every one of the 13.3333px elements is an icon button, an
  SVG or a 1×1 `ui-sr-only` span; **no visible sentence or number on this HUD is
  larger than 13px.**
- Colour, over the 62 elements carrying their own visible text:

| Colour | Count | Carried by |
| --- | --- | --- |
| `rgb(125,136,148)` dim | 21 | every label — `Prisoners`, `High Risk`, `Funds` |
| `rgb(238,242,246)` bright | 13 | every value |
| `rgb(219,226,233)` | 9 | alert row text |
| `rgb(168,177,188)` | 6 | `PRE-ALPHA`, `38%`, `×4` |
| `rgb(232,180,99)` amber | 6 | `4 with no bed`, the event band, three `Warning` badges, `4 waiting with no bed to sleep in` |
| `rgb(134,181,150)` green | 3 | `Covered`, `Clear`, `Saved (generation …)` |
| `rgb(212,120,92)` red | **2** | the strip's `PRISONERS` value, **and the refusal band** |
| `rgb(134,178,207)` blue | 2 | the selected prison, the selected tab |

**MEASURED, and this is the finding:** the strongest alarm colour on the whole
screen is used exactly twice, and one of its two uses is the tick-0 removal
refusal — 1440×32px of it, at the top of the screen, for 5.93 in-game days.
The other use is correct and good: the `PRISONERS` chip goes red with a
ten-segment `ui-bar` when the population exceeds the places, which is the strip
doing exactly what a strip should.

**JUDGEMENT, and named as such:** with one type size for everything, movement is
the only remaining rank-order cue — and act 3 measured that only the strip and
the alerts move at all. So a player's eye is trained on the strip, which is the
right place for *numbers* and the wrong place for *what is happening*. What
would change my mind: an eye-tracking or a think-aloud session, neither of which
this instrument can do.

---

## 6. Where a document and the code disagree

`docs/research/2026-09-04-what-the-game-shows-nobody.md` reported **175 of 398
declared view-model members with no consumer-side reader**, at v0.0.442
(`3d2a8bda`). The brief asked whether that is still true before it is repeated.
**It was not re-derived here** — that census is a text measurement over 52
interfaces and reproducing it is a day's work, not a playtest. What was checked
instead, from the running application:

- **The `conditions` orphan is still on the wire and still unread**, and is now
  known to be non-empty 91% of the time (§4).
- **`staffUnassigned`, `prisonersInIntake`, `roomOccupants` and
  `unpaidWagesMinorUnits` are all still on the wire** at v0.0.469 —
  **MEASURED**, act 6: the last `simulation/status-counts` carried the keys
  `accommodationCapacity, activeIncidents, conditions, contrabandDiscovered,
  dailyWageBillMinorUnits, occupiedPlaces, prisoners, prisonersCovered,
  prisonersHighRisk, prisonersInIntake, prisonersUnderstaffed,
  prisonersUnguarded, roomCapacity, roomOccupants, rooms, staff,
  staffUnassigned, stateIncomeAccruedTodayMinorUnits, treasuryMinorUnits,
  treasuryOverdraftFloorMinorUnits, unpaidWagesMinorUnits`. That is 21 of the
  schema's 23, the two absent ones being `activeIncidentType` and
  `contrabandNameKey`, which are optional and only present when non-zero.

**So the class stands; the exact 175 is not re-verified here and should not be
re-quoted from this record.**

---

## 7. Two open issues, checked rather than assumed

**#902 stands, and both halves are worse than the issue's title.**
**MEASURED**, act 5, empty prison at 1440×900:

```
build:  .hud-build__list   client=223  scroll=924  hidden=701px  gutter=0px  children=21
rooms:  .hud-rooms__list   client=252  scroll=837  hidden=585px  gutter=0px  children=2
```

**75.9% of the Build catalogue and 69.9% of the Rooms catalogue are below their
own fold, with a 0.0px scrollbar gutter — no scrollbar, no chevron, no count.**
The issue is closed; **VERIFIED**: `git log --oneline -1 13c50289` returns
*"revert(hud): withdraw the edge fade; #902 is not this file's to decide"*, so
the fix was withdrawn before merge and the problem is live at v0.0.469. Act 5
also found a **third** instance nobody has filed: `.save-panel` scrolls too, on
the Build, Rooms and Security tabs — `client=120 scroll=240 hidden=120px
gutter=2px` — hiding half the prison list, though that one at least has a 2px
gutter.

**#719 reproduces, but only with a prison in it — which is why an empty-prison
check misses it.** **MEASURED**, act 5, *empty* prison at 1280×800: **0
overflowing elements on all five tabs.** **MEASURED**, act 4, the *same
populated* prison resized to 1280×800:

```
overview: stripScroll {clientW:1256, scrollW:1320, hiddenPx:64}
build/rooms/security/regime: {clientW:1256, scrollW:1312, hiddenPx:56}
```

with the last `ui-stat` — `EARNED TODAY` — laid out at `left:1195 right:1332`
against a 1280px window. **56–64px of the status strip, ending in the whole
`EARNED TODAY` chip, is off the right edge at 1280 once the prison has a
`4 with no bed` badge and a `Riot` badge to carry.**

And a second thing at that width nobody has filed, **MEASURED**, act 4: on the
**Rooms** tab at 1280×800, `.hud-rooms__rows` has `bottom: 1200` against a
800px window — **400px of room rows below the bottom of the screen** — and
`.hud-rooms__coordinates` sits at `bottom: 1245`. The Build tab's
`hud-build__coordinates` (`bottom: 856`) and the Security tab's
`hud-staff__roster` (`bottom: 864`) run off the bottom too.

---

## 8. What a prison adds to the interface

**MEASURED**, act 1 (empty) against act 2 (8 prisoners, 1 room, 4 beds, 1 guard,
day 6, one fight, one lapsed incident), region text diffed line by line:

| Tab | Empty lines | Running lines | Identical |
| --- | --- | --- | --- |
| Overview | 56 | 68 | 42 (**62%**) |
| Build | 93 | 106 | 77 (73%) |
| Rooms | 82 | 92 | 62 (67%) |
| Security | 67 | 78 | 50 (64%) |
| Regime | 64 | 92 | 45 (49%) |
| **All** | | **436** | **276 (63.3%)** |

The Overview tab's *entire* gain from building and running a prison, verbatim:

```
+ 4 waiting with no bed to sleep in
+ IN INTAKE
+ 4 of 8
+ 4 at Cell Assignment
+ A fight has broken out between two prisoners. Day 5           Warning  Clear this alert
+ No incident is still open — but the last one ran out of time
    instead of being contained, and everyone caught in it was
    hurt. Day 5                                                 Warning  Clear this alert
+ Nothing was removed — there is no object on that tile…        Warning
```

plus numbers changing in place on the strip and a new save-generation id.
**Four intake numbers and three alert rows. Not one sentence about the prison.**

`docs/research/2026-09-03-can-a-player-read-this.md` §3 measured *"52 of the
Overview tab's 58 lines are word-for-word identical"* at v0.0.422. This is the
same finding at v0.0.469 by a different method and a different prison, so the
two figures are **not comparable as a trend** and should not be read as one.
What is comparable is the shape, and the shape has not moved.

---

## 9. The improvement proposals

Ranked by what they buy a player. Each traces to a measurement above. Where a
proposal needs a *sentence*, the code that would render it is opened and the
sentence shown to be true — `AGENTS.md` reservation 4's release gives the choice
of words and keeps the requirement of truth.

### P1 — Let a press on the world reach the inspector that already exists. *(medium — and smaller than it looks)*

**The measurement:** act 4 — a press on the cell interior reached `canvas` and
produced **0 commands**; the screen did not change. Q2 has no answer at all.

**What I got wrong before opening the code, and the correction:** this is not a
missing panel. **VERIFIED, read**: `src/ui/hud/regime-panel.ts:1140`
(`function selectPrisoner`), `:1172-1187` (*"The pointer's route into
`selectPrisoner`, bound once on the list"*) and `:1507-1526` — a **prisoner
inspector already exists**, is painted from `hud/prisoner-detail`, and is
reached by pressing a roster row on the **Regime** tab. `hud/prisoner-detail`'s
entry in `UNPAINTED_PROJECTION_IDS` died at #895 for exactly that reason. So
the missing piece is the **route**, not the panel: the only way to select a
prisoner is to find them among the **four** rows the Regime roster can draw
(`PRISONER_ROSTER_ROW_LIMIT = 4`, `src/ui/hud/regime-panel.ts:293`), which for
a prison of eight is half of them and for a prison of thirty is an eighth.

**What the player sees:** pressing a prisoner in the world selects them, the
Regime tab opens with the inspector already filled, and the roster row for that
prisoner is the selected one. `selection.primary` gets its consumer; the
inspector gets its second door.

**The room half is NOT the same proposal, and saying so is the point.**
`hud/room-detail` has a reader — `src/ui/simulation-room-needs.ts:344` — but
**VERIFIED, read**: `src/ui/simulation-room-needs.ts:101-111`,
`unfinishedRoomIds` filters to `row.requirementSummary.missingCapability > 0`,
so the only rooms ever asked about are the ones **missing something**. A
finished, working cell is never the subject of a `hud/room-detail` request in
`src/` at all. So *"why is nobody in that cell?"* — asked about a cell that is
complete — has no panel behind it today, and a room inspector is a new surface
rather than a new door onto an old one. That is the honest split: **the
prisoner half of P1 is a route; the room half is a build.**

**What such an inspector can honestly say, and what it cannot.**
**VERIFIED, read**: `src/ui/simulation-prisoner-detail.ts:47-82` records a
reason per dropped field, and three of them are content gaps rather than
choices, so **no proposal here may promise them**:

- **Where the prisoner is: not available.** `ActionSystem` writes the position
  component on arrival and never in between (`docs/HUD_PROJECTIONS.md` gap 10),
  so a travelling prisoner's tile is where they set off from; the comment says
  outright *"Where a prisoner is, as a player would say it, is gap 11 and is
  still unprojected."*
- **Their accommodation: not sayable.** It resolves to the word "Cell" for every
  prisoner in a cell-only prison, over a machine id like `room.cell:12:9`.
- **Their gang: absent.** Nothing in `src/` registers a gang into a new session.
- **What they are doing when idle: not on this route.** A projection asymmetry
  the same docblock records — the roster row carries `actionPhase` at the top
  level, `PrisonerDetailViewModel` carries the phase only inside
  `currentAction`, so the detail route has no phase to name when no action is
  selected.

What it **can** say is what it already says: name, risk tier, intake stage and
the six needs with their percentages — and the docblock states why that is safe,
*"The needs need no new words: the six need names, the six risk-tier and
intake-stage words and the percent format all exist and were authored for this
kind of readout."* **So P1 needs no new string at all**, which is why it moved
from "a rebuild" to "medium".

**Handover, not mine to fix:** the same docblock says framing `sentence` or
`currentAction` would be *"new player-facing copy, which is `AGENTS.md`'s fourth
exclusion and the owner's."* That reservation was **partly released on
2026-09-04** — the choice of words is ours now, the requirement of truth is not
— so the comment is stale in its reason while still correct in its conclusion (a
tick count is not a date). Recorded for the integrator.

### P2 — Take the corner back. *(cheap, and it is a move, not a build)*

**The measurement:** `ui-panel hud-minimap` is **220,492px², 17.01% of the
viewport**, on all five tabs; its 224×224 surface renders one sentence saying
the feature does not exist; the alerts list is a **sub-section inside it**
(`src/ui/hud/hud.ts:1555`).

**What the player sees:** the bottom-left corner becomes an **Alerts** panel.
The alerts list takes the full body. The minimap surface becomes a small,
fixed-size block at the *bottom* of that panel — or moves out of `.hud__corner`
entirely — keeping its honest sentence and its working click target
(`src/ui/hud/hud.ts:1512-1523`), which is what #793 built and what
`2026-09-03-can-a-player-read-this.md` §2 found actually navigates.

**Why:** the panel title is the first thing a player reads, and today it names
the half that does nothing. Collapsing the panel — one press — takes the alerts
with it, because they share `minimapPanel.body`.

**No new string is needed.** `HUD_MESSAGE_KEY.alertsTitle` already exists and
already renders as `ALERTS` on the section eyebrow
(`src/ui/hud/hud.ts:1527`); this proposal promotes it to the panel title and
demotes `minimapTitle`. **Cost: cheap** — a DOM re-parenting and two title
swaps.

### P3 — Put the standing conditions on the band the stale refusal is holding. *(medium)*

**The measurement:** the refusal band held one sentence for **14,237 ticks
(5.93 in-game days)** in the screen's **strongest alarm colour**, while
`conditions` was non-empty in **282 of 310 publications (91%)** and read by
nothing.

**What the player sees:** the same 1440×32 band, but a **standing condition
outranks a refusal**. While any condition holds, the band states it; when none
holds, the band falls back to the most recent refusal exactly as today. A
refusal therefore stops being the thing on screen the moment something is
actually wrong, rather than the moment another press is refused.

**Why this and not a timer:** `src/ui/hud/hud.ts:1094-1098` already rejected
auto-dismissal, with a reason that is right — *"a race against how fast the
player reads"*. This proposal does not add a timer. It adds a **rank**: a fact
that is true *now* outranks a fact about a press that is *over*.

**The sentences, and the code that makes them true.** `PRISON_CONDITIONS` has
four members (`src/simulation/protocol/types.ts:668-673`), each computed in
`computeStandingPrisonConditions` (`src/simulation/presentation/status-strip-projection.ts:253-283`):

| Condition | True exactly when (VERIFIED, read) | Proposed sentence |
| --- | --- | --- |
| `intake.no-place` | `input.waitingWithoutPlace > 0` (`:267`) | *"{count} people have nowhere to sleep."* — **true**: same field as `hud.intake.no-place`, which already renders it (`src/ui/hud/intake-panel.ts:187`), fed from the same `population.waitingWithoutPlace` (`status-strip-projection.ts:837`). |
| `construction.unfunded` | `input.buildQueueUnfunded` (`:265`) | *"Building has stopped — the queue has no money for materials."* — **true**: the flag is the build queue's own funding state, the same one `materialsFunding.unfunded` renders on the Build panel (`src/ui/simulation-build-queue.ts:117-139`). |
| `treasury.construction-refused` | `treasuryMinorUnits <= rungFloorMinorUnits('construction', …)` (`:269-272`) | *"Funds are too low to start new building."* — **true**: this is the rung the treasury refuses construction at, not a forecast. |
| `treasury.deliveries-refused` | `treasuryMinorUnits <= rungFloorMinorUnits('deliveries', …)` (`:274-277`) | *"Funds are too low to buy materials."* — **true**, same shape. |

**Caveat I am obliged to state:** `intake.no-place` is *already* on screen twice
(the strip badge and the Intake panel), so promoting it to the band would be a
third. **The value of this proposal is the three treasury/construction
conditions, which have no persistent surface anywhere** — a player who looks
away during the payroll tick gets a notice that scrolls and then nothing, which
is exactly what ADR 0087's owner ruling asked not to happen. `intake.no-place`
should be *excluded* from the band for that reason, and that exclusion is part
of the proposal.

### P4 — Make the alerts column rank. *(cheap)*

**The measurement:** four alert rows across six in-game days, **all four
`Warning`**, one of them a no-op click and one of them four lapsed incidents
that hurt everybody. The `danger` tier exists and has producers
(`src/ui/simulation-events.ts:325-337`).

**What the player sees:** three things, none of them a new subsystem.

1. **`incidents.all-clear-after-lapse` becomes `'danger'`, not `'warning'`**
   (`src/ui/simulation-events.ts:320-323`). An incident that ran out of time and
   hurt everyone in it is not the same class of event as a purchase that was
   cancelled. **REASONED** from the row's own text, which already says people
   were hurt.
2. **A refusal row is `'info'`, not `'warning'`** (`src/ui/simulation-alerts.ts:330`).
   Nothing happened to the prison. Today it is the same tier as a fight.
3. **The coalescing count moves to the front of the row.** The row reads
   *"A fight has broken out between two prisoners. 4×  Day 9"* — the `4×` is
   the most important token in it and is the second-to-last thing read.

**Cost: cheap.** Two severity constants and a row-order change. No new data, no
new string.

### P5 — One line of money that answers the question. *(medium)*

**The measurement:** Q1. `FUNDS` and `EARNED TODAY` on the strip; the payroll on
another tab, on a fold; construction and delivery spend as a rate nowhere.

**What the player sees:** the `EARNED TODAY` chip becomes a **net** chip, with
the gross beside it as the trailing badge the chip already supports (the
`PRISONERS` chip's `4 with no bed` badge is the same mechanism,
`src/ui/hud/projection.ts:301`). Today's income minus today's wage bill, with
its sign.

**What makes it true, and the honest limit.** Both inputs are already read on
the main thread: `stateIncomeAccruedTodayMinorUnits` and
`dailyWageBillMinorUnits` are two of the eighteen counts
`hudCountsFromWorkerMessage` takes (`src/ui/simulation-counts.ts:36-194`).
`dailyWageBillMinorUnits` is a *standing daily* figure, not a today-to-date
one — `src/ui/hud/staff-panel.ts:489` calls it *"What the payroll bills for the
same person at every day boundary"* — so the difference is a **forecast for the
day**, not a settled result. **The sentence must therefore not claim to be
today's outcome.** A label of the shape *"per day"* on a chip carrying
`income − wages` is true of those two fields; *"earned today, net"* is not, and
must not ship. Construction and delivery spend are **not** in this figure and
the chip must not imply they are.

**Cost: medium**, mostly because getting the label honest is the hard part.

### P6 — Two labels that are lying about their subject. *(cheap)*

**The measurement:** §4. `hud.regime.roster-count` renders `{shown} of {total}`
under a heading reading `PRISONERS`, where `shown` is capped at
`PRISONER_ROSTER_ROW_LIMIT = 4` for ever
(`src/ui/hud/regime-panel.ts:293`, `:1280-1284`) — it is a fact about the panel
wearing the clothes of a fact about the prison, and the Intake panel renders the
byte-identical string `4 of 8` about something else entirely
(`default-locale-en.ts:1598` vs `:2005`).

**What the player sees:** the Regime roster header states the **total** and says
separately how many rows are drawn — the panel already has the second sentence,
`and 4 more`, immediately below. The two `of` strings stop being identical.

**Cost: cheap** — one string, whose truth is established by
`PRISONER_ROSTER_ROW_LIMIT` being a constant the reader can open.

### P7 — Retire the day-1 hint once it is answered. *(cheap)*

**The measurement:** `hud.intake.hint` is 43px tall on the Overview tab and was
**byte-identical from an empty prison to a prison of eight** (act 1 vs act 2)
and across all 35 samples of act 3.

**What the player sees:** the hint stays while `rooms === 0` — it is genuinely
the answer then — and is replaced by the intake pipeline's own numbers once a
cell exists. **REASONED:** the sentence's own subject is *"A prison needs a cell
before it can admit anyone"*, so a prison that has one has read it.

**Cost: cheap.** One condition, no new string, and it is a *removal*, which is
the cheapest thing on this list and the only one that gives pixels back.

### Not proposed, and why

- **A minimap.** Rendering is the renderer's, it does not exist yet, and the
  placeholder is honest. P2 moves it; it does not ask for it.
- **An incidents panel.** `hud/incidents` and `hud/incident-detail` carry 66 and
  26 members and are gated in `UNPAINTED_PROJECTION_IDS` with stated blockers
  that `2026-09-04-what-the-game-shows-nobody.md` §6 re-checked and found still
  true. That is a roadmap item, not a HUD fix, and P1 is the prerequisite.
- **Typographic hierarchy.** Everything is 13px and that is measurably flat —
  but I cannot trace it to a question a player asked and could not answer, so by
  the brief's own rule it does not go in. It is recorded in §5 as a measurement
  and left there.

---

## 10. What this pass did not reach

- **The 175-of-398 census was not re-derived** (§6). Only the five push-route
  orphans were re-checked, from the wire.
- **No touch or narrow-phone viewport.** 1440×900 and 1280×800 only.
- **The Build and Rooms tabs were never played *as* the answer to a question** —
  acts 4 and 3 held Overview. A player who lives on the Build tab may have a
  different HUD experience and this pass cannot speak to it.
- **No keyboard-only pass**, and every proposal above is stated in pointer
  terms.
- **The two "with no bed" definitions were not driven apart** (§4). They agreed
  in this run; whether they *can* disagree is untested.
- **No `src/` file was changed.** Every proposal in §9 is a proposal.

---

## 11. Weakest claim, and what would change my mind

**The weakest claim is §3's, that the refusal band and the Intake panel are
"spending pixels".** What I measured is that each held one byte-identical value
for 5.93 in-game days. What I did not measure is whether a player *wants* them
to change — a band that stays put is also a band that does not flicker, and the
Intake panel's constancy is the constancy of a fact that was true the whole
time. The inference from "did not change" to "is not earning its space" is
**JUDGEMENT**, and it is the joint every proposal in §9 that touches those two
regions rests on.

**What would change my mind:** a session in which a player is observed
*returning* to the Intake panel or the refusal band and getting something from
it. Failing that, a weaker but real test: whether the band's content, when it
*does* change, is ever noticed — which act 3 could measure by counting how often
a change to the band coincides with the player's next press, and which this
instrument does not do.

**Second weakest:** §2's claim that the refusal on the band was "about a click
made before the first wall". That refusal was produced by the harness's
`calibrate()`, which presses Remove on empty tiles — a thing the harness does
and a player might not do *in that spot*. What is not in doubt is the mechanism:
`src/ui/hud/hud.ts:1094-1098` says any refusal stays until another replaces it
or the session ends, so **any** refusal a player earns — and Remove arrives
armed on the Build panel — occupies that band for the rest of the session. The
5.93 days is real; the *particular* refusal is an artefact of how the prison was
built.
