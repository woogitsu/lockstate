# Playtest: what a day actually pays, and what "~150/day" was measuring

**2026-08-29.** Mouse-driven playtest against `origin/main` at `05640b6`
(v0.0.210), Chromium at 1440x900, driving the real assembled page
(`index.html` + `src/main.ts`) through a `Worker` tee that records every
command sent and every reply received. The harness is
`playtest-economy.spec.ts`, on the branch `agent/playtest-mouse-2` and
**deliberately not in this tree** — it is a reproduction, not a gate, for the
reason `2026-08-29-mouse-playtest.md` gives about its own.

It answers [#601](https://github.com/matmaxalez/lockstate/issues/601): the
brief that went to nineteen models says *"a neglected twelve-prisoner prison
earns about 150/day while three guards cost 240/day. The loop closes, and it
closes tightly."* #601 shows the arithmetic cannot hold — the withholding
schedule floors at 60 per resident, so twelve paid places cannot gross under
720 — and offers three readings without choosing between them.

**This record chooses.** Reading 1 is true about the *prison*; reading 3 is
true about the *number*; reading 2 is available but did not happen. And the
prison was not neglected, which is a fourth thing nobody had considered.

## How every claim here was obtained

`docs/research/README.md`'s tiers were written for research into other games.
Nothing here is of that kind, so the mapping is stated once:

- **VERIFIED** covers every claim below unless a line says otherwise, and means
  one of two first-party things: a number pasted verbatim from a run of
  `playtest-economy.spec.ts` against a real Chromium, or a `file:line` in this
  repository that was opened and read.
- **SEARCH-SUMMARY** and **FROM MEMORY** do not occur. No external page was
  consulted and no figure is carried on belief.
- **UNKNOWN** is marked inline, in §5.

## 0. Calibration, re-derived rather than carried

Tile (0,0)'s top-left is screen **(-304, -574)** at 1440x900, one tile 64
screen px. Measured by bisecting a `RemoveObject` probe on bare ground, the
same method and the same answer as `2026-08-29-mouse-playtest.md` §0 and
`2026-08-29-playtest-ordering-and-the-second-room.md` §3. The brief handed to
this pass carried `(-224, -512)`; that is the same rule
`(viewportW/2 - 1024, viewportH/2 - 1024)` at a 1600x1024 viewport and is not
portable. Re-derived, not trusted.

## 1. The prison that was built, with the mouse

Four wall runs of six segments each around tiles (12,12)-(17,17) — 24
`PlaceBuildOrder` commands, every one from a real mouse drag — then the
rectangle zoned as a Cell, then three beds and a toilet placed by pressing
tiles, then twelve presses of **Admit a prisoner**. Verbatim from the run:

```
wall run north: 6 command(s) -> ["12,12 north","13,12 north","14,12 north","15,12 north","16,12 north","17,12 north"]
wall run south: 6 command(s) -> ["12,18 north","13,18 north","14,18 north","15,18 north","16,18 north","17,18 north"]
wall run west:  6 command(s) -> ["12,12 west","12,13 west","12,14 west","12,15 west","12,16 west","12,17 west"]
wall run east:  6 command(s) -> ["18,12 west","18,13 west","18,14 west","18,15 west","18,16 west","18,17 west"]
at tick 4150: rooms=1 roomCapacity=3 accommodationCapacity=3
3 bed order(s) + 1 toilet placed
```

**It works.** A prison can be built from nothing with the mouse. What it cost
this pass to get there is §4.

## 2. The measurement #601 asked for

Two consecutive day boundaries, pasted from the run. `prisoners` is the roster,
`roomOccupants` is the resident count, and they are printed separately because
that is the whole of #601's complaint:

```
=== DAY BOUNDARY at tick 9599 ===
last sample before:  {"tick":9596,"prisoners":12,"prisonersInIntake":9,"rooms":1,
                      "roomCapacity":3,"accommodationCapacity":3,"roomOccupants":3,
                      "treasuryMinorUnits":23175,"stateIncomeAccruedTodayMinorUnits":898,
                      "dailyWageBillMinorUnits":0,"unpaidWagesMinorUnits":0,"staff":0}
first sample at/after:{"tick":9637,...,"treasuryMinorUnits":24075,
                      "stateIncomeAccruedTodayMinorUnits":14,...}
treasury delta across the boundary = 900 | accrual just before = 898 | roster = 12 | residents = 3

=== DAY BOUNDARY at tick 11999 ===
last sample before:  {"tick":11965,...,"treasuryMinorUnits":24075,
                      "stateIncomeAccruedTodayMinorUnits":887,...}
first sample at/after:{"tick":12005,...,"treasuryMinorUnits":24975,...}
treasury delta across the boundary = 900 | accrual just before = 887 | roster = 12 | residents = 3
```

So, for a twelve-prisoner prison with three beds:

| quantity | value |
| --- | --- |
| roster (`prisoners`, the status strip's PRISONERS) | **12** |
| residents (`roomOccupants`) | **3** |
| in intake, never housed (`prisonersInIntake`) | **9** |
| credited at the day boundary | **900**, twice, exactly |
| per resident | **300** — the full rate, nothing withheld |
| staff, wage bill, unpaid wages | 0, 0, 0 |

**Run twice, from a fresh page, and the same both times.** A second,
independent run of the same route produced `900` at both of its boundaries,
`roster = 12`, `residents = 3` and `data-without-place="9"` again.

### The control: twelve beds, twelve admitted

The same prison built again with **twelve** beds instead of three, so that
twelve paid places actually exist. Pasted:

```
=== DAY BOUNDARY at tick 9599 ===
last sample before:  {"tick":9562,"prisoners":12,"prisonersInIntake":0,"prisonersHighRisk":0,
                      "rooms":1,"roomCapacity":12,"accommodationCapacity":12,"roomOccupants":12,
                      "treasuryMinorUnits":23190,"stateIncomeAccruedTodayMinorUnits":3544,
                      "dailyWageBillMinorUnits":0,"unpaidWagesMinorUnits":0,"staff":0}
first sample at/after:{"tick":9602,...,"treasuryMinorUnits":26790,...}
treasury delta across the boundary = 3600 | accrual just before = 3544 | roster = 12 | residents = 12
```

and the next boundary is 3600 again. **Twelve paid places gross 3,600 a day,
not 720.** #601's floor argument bounds the answer below by 720 and the real
answer is five times that, for the reason §3 gives: the floor is not reached.

Across **four prison builds and eight day boundaries** — the three-bed prison
run twice, the twelve-bed prison, and the guarded prison — every credit is
`300 x residents` exactly: 900, 900, 900, 900, 3600, 3600, and 660 twice
(= 900 less 240 of wages). `unmetNeeds` was 0 at every one.

## 3. Which reading is true

**Reading 1 — "most of that population was not housed" — is true about the
prison and does not produce 150.** Twelve on the roster, three residents, nine
permanently in intake. #601 called this "the reading with the fewest
assumptions" and "a materially different and worse finding than 'income is
tight'", and the prison it describes is exactly the prison a player builds.
But #601 then placed 150 between `2 x 60 = 120` and `3 x 60 = 180`, and that
step is wrong for a reason nobody had: **the floor never applies.**

**The prison was not neglected.** `stateIncomeForPrisonerDay`
(`src/simulation/economy/income.ts:326`) returns
`300 - 40 x unmetNeeds`, and 900 credited for three residents is `3 x 300`
exactly — `unmetNeeds` was **0** at both boundaries, after the residents had
lived in the cell for the better part of two in-game days. A housed prisoner
sleeps, and their needs stay above `STATE_INCOME_UNMET_NEED_LEVEL` (51,
`income.ts:226`). The nine who are *not* housed have needs that do decay — and
they contribute nothing either way, because they are not residents.

**Said as strongly as the evidence allows and no stronger:** the withholding
schedule did not fire at any of the eight boundaries measured, across four
prisons and up to about two in-game days of residency each. That is not a proof
that it *cannot* fire — hygiene is the need with no object in these cells, and
a longer session is exactly what would test it (see "weakest claim" below).
What it does establish is that the state #601 reasons from, twelve residents at
the 60 floor, is not the state a prison of that shape is in after two days;
and that a prisoner who is not a resident contributes 0 rather than 60, so the
roster and the payroll are not the same twelve people at all.

**Reading 3 — "150 was a mid-day reading of the prorated accrual" — is true
about the number, and is the only reading that produces 150 in a real
session.** `stateIncomeAccruedByTick` (`income.ts:391`) derives EARNED TODAY as
`grant x ticksServed / DAY_LENGTH_TICKS`. With a 900 grant, the chip passes
through 150 about a sixth of the way into the day. Pasted from the same run's
series — a *twelve*-prisoner prison, on screen, reading 151:

```
t=9922  roster=12 inIntake=9 residents=3 cap=3 accrued=121 funds=24075
t=9963  roster=12 inIntake=9 residents=3 cap=3 accrued=136 funds=24075
t=10004 roster=12 inIntake=9 residents=3 cap=3 accrued=151 funds=24075
t=10045 roster=12 inIntake=9 residents=3 cap=3 accrued=167 funds=24075
```

and the same figure a day earlier:

```
t=7538 roster=12 inIntake=9 residents=3 cap=3 accrued=127 funds=23175
t=7579 roster=12 inIntake=9 residents=3 cap=3 accrued=142 funds=23175
t=7619 roster=12 inIntake=9 residents=3 cap=3 accrued=157 funds=23175
```

**Reading 2 — "a net treasury delta over a window including purchases or
hiring" — is available and did not happen here.** With `staff: 0` there is no
recurring debit at all: `dailyWageBillMinorUnits` and `unpaidWagesMinorUnits`
were 0 at every sample, and the boundary delta is therefore gross income
exactly. It becomes the live reading the moment a guard is hired — §7.

### The sentence that should replace the brief's

The brief's number is not wrong about what was on screen. It is wrong about
what the number *is*: **it is a partial-day accrual, not a day's income, and
the population it belongs to is three, not twelve.** The day that prison
actually earns is **900**. Written the way the brief wrote it: *a prison with
twelve on the roster and three beds earns 900/day, of which every minor unit
is paid for the three people who have somewhere to sleep.*

**No economy sink should be sized against 150.** The figure to size against is
`300 x residents`, and residents is bounded by beds, not by admissions. The
three prisons this pass built pay **900**, **900** and **3,600** a day.

## 4. Why "twelve prisoners, three beds" is the prison a player builds

Nothing about that ratio was contrived. It is what the game does when you press
the one control it offers:

- **Admission does not check for a free bed, and says so.** `requestAdmission`
  (`src/simulation/prisoners/prisoner-operations-runtime.ts:701`) refuses only
  `no-accommodation` (no room instance of an accommodation type at all) and
  `population-full`. A zoned cell with three beds accepts a twelfth admission
  as readily as the first. The Intake panel states this, verbatim from
  `src/content/default-locale-en.ts:598`: *"A prison needs a cell before it can
  admit anyone. It does not need a free bed: an arrival with none waits until a
  bed is free."*
- **The warning fires and is accurate.** After twelve presses,
  `.hud-intake__no-place` carried `data-without-place="9"` — *"9 waiting with no
  bed to sleep in"*. Measured.
- **The status strip counts all twelve.** `prisoners` is
  `population.total` (`src/simulation/presentation/status-strip-projection.ts:460`).
  Verbatim from the strip at that moment:
  `12 | PRISONERS | 0 | STAFF | 1 | ROOMS | ... | 23,175 | FUNDS | 234 | EARNED TODAY | DAY | 4 | 26%`.

So the player sees **12 PRISONERS** and **EARNED TODAY 234**, and there is no
number anywhere on screen that says **3**. Which is §5.

## 5. `roomOccupants` crosses the worker boundary and reaches nobody

**VERIFIED, by grep over the whole repository.** `roomOccupants` is computed in
the status-strip projection (`status-strip-projection.ts:406-417`), declared in
the protocol schema (`src/simulation/protocol/types.ts:671`), and published on
every `simulation/status-counts`. Outside `src/simulation/**` there is not one
reader: `src/ui/simulation-counts.ts` translates `prisoners`,
`accommodationCapacity`, `staff`, `rooms`, `activeIncidents`,
`contrabandDiscovered`, `treasuryMinorUnits` and
`stateIncomeAccruedTodayMinorUnits`, and drops `roomOccupants` on the floor.
The only consumers on disk are test fixtures and this playtest's own tee.

**That is the one number that distinguishes "twelve on the roster" from "three
being paid for", and it is the one number a player cannot see.** The whole of
#601 is a confusion between those two figures, made by people reading the
screen.

**What would establish the cause:** nothing further — the grep is the mechanism
and the files are open.
**What would establish the impact: UNKNOWN.** Whether a player would use the
figure if it were there cannot be read from this repository, and nobody plays
the game yet. What *can* be said without a player is that the confusion this
record was commissioned to resolve is exactly the confusion the missing figure
would have prevented, in a brief written by the person who owns the game.

**Handed over, not acted on.** This is `src/ui/**` and this pass is read-only
on `src/`. An agent owns residency capacity and `src/simulation/economy/income.ts`
in this same session; the change contemplated here is neither of those.

## 6. Two things about the strip's own arithmetic, stated as observations

- **"12 of 3" is spoken and not shown.** `occupancyTone`
  (`src/ui/hud/projection.ts:133`) returns `'danger'` above ratio 1, and the
  status strip hands the segmented bar a `valueText` of `"{value} of
  {capacity}"` (`src/content/default-locale-en.ts:175`,
  `src/ui/hud/status-strip.ts:202-206`). The strip's `innerText` read
  `12 | PRISONERS` at every sample, and reading
  `src/ui/primitives/segmented-bar.ts:90-112` says why: the bar's children are
  ten empty `<span class="ui-bar__segment">` cells, and `valueText` is written
  to **`aria-valuetext`** only. There is no text node.

  So for a screen-reader player the prison says *"Cell occupancy, 12 of 3"*,
  and for a sighted player it says a full ten-segment bar in the danger tone
  and nothing else — `filledSegments(12, 3)` takes the `value >= max` branch,
  so a prison four times over capacity draws exactly like one exactly at it.
  **Two things keep this mild and both are real:** bar *fullness* is a
  non-colour signal, and the Intake panel does say it in words —
  *"9 waiting with no bed to sleep in"*, measured. What is worth noting is only
  that `src/ui/hud/projection.ts` states the principle *"Colour is never the
  only signal: the badge states the condition in words"* about the incidents
  chip, and the prisoners chip is the one metric on the strip that carries a
  tone with `badge: undefined`. No cause and no impact are claimed.
- **The accrual chip is honest and unlabelled as partial.** EARNED TODAY is
  `stateIncomeAccruedTodayMinorUnits` and its own doc comment
  (`status-strip-projection.ts:473-491`) says why it must be derived from the
  same walk the boundary credits from rather than from a count. Nothing on
  screen distinguishes "150 so far today" from "150 a day", and the brief read
  it as the second. No cause and no impact are claimed; it is a product
  question.

## 7. The other half of the loop, and it does not close tightly

The brief's second clause — *"while three guards cost 240/day"* — is **exactly
right**, and it is the only half of the sentence that is. Measured, on a second
prison built the same way with three beds, three prisoners and three guards
hired from the Security tab with the mouse:

```
hire control reads: "Hire Guard · 80"
after hiring 3: staff=3 dailyWageBill=240 funds=22335
```

`staff-role.guard`'s `wageBand.minPerDay` is 80
(`src/content/staff-role-catalog.ts:150`), `staffDailyWageMinorUnits` returns
that field (`src/simulation/economy/wages.ts:45`), and the hire charge is one
day of it, so three guards cost 240 to hire and 240 a day thereafter. Both
figures are on screen.

Then the day boundary, pasted:

```
=== DAY BOUNDARY at tick 7199 ===
last sample before:  {"tick":7173,"prisoners":3,"prisonersInIntake":0,"rooms":1,
                      "roomCapacity":3,"accommodationCapacity":3,"roomOccupants":3,
                      "treasuryMinorUnits":22335,"stateIncomeAccruedTodayMinorUnits":890,
                      "dailyWageBillMinorUnits":240,"unpaidWagesMinorUnits":0,"staff":3}
first sample at/after:{"tick":7214,...,"treasuryMinorUnits":22995,
                      "stateIncomeAccruedTodayMinorUnits":5,...}
treasury delta across the boundary = 660 | accrual just before = 890 | roster = 3 | residents = 3
```

and the next boundary is the same:

```
=== DAY BOUNDARY at tick 9599 ===
treasury delta across the boundary = 660 | accrual just before = 893 | roster = 3 | residents = 3
```

**900 in, 240 out, +660 a day net**, twice, with `unpaidWagesMinorUnits` at 0 —
the payroll met in full.

So the brief's conclusion is the thing that breaks. It read *150 in against 240
out*, which is **-90 a day** and would indeed close tightly, in the sense of
closing on the player's throat. What a prison of that shape actually does is
**+660 a day**. The sign is wrong and the magnitude is wrong by 750.

This is reading 2 of #601, run deliberately: a window that includes hiring. It
produces 660, not 150, and it is 660 because a hire is a *one-off* 240 charged
at the press and a *recurring* 240 charged at the boundary — the treasury moved
25,000 → 22,275 (materials) → 22,335 (a 300 day boundary less the 240 hire
charge) → 22,995 (900 in, 240 out). Nothing in that ledger passes near 150
except the EARNED TODAY chip, which read **141** on this prison at 16% of the
day.

**What this does not establish.** Whether the economy *should* be tight is a
balance question with an owner, and this record does not answer it. What it
establishes is that no document should keep saying the loop closes tightly on
the strength of the brief's arithmetic, because the arithmetic was of a
different prison than the one the game builds.

## 8. Smaller things this pass measured while playing

- **The Rooms panel called a finished 6x6 wall "open" at the instant the
  simulation accepted it.** Pasted, at 1440x900, twelve seconds after the Build
  panel said the queue was empty:

  ```
  Build panel says the queue is empty at page t=3996ms, tick 2497
  designate attempt 1 at t+11529ms: rooms=1 | panel said ["OPEN ON AT LEAST ONE SIDE","MUST BE ENCLOSED"]
  ```

  `rooms=1` and *"OPEN ON AT LEAST ONE SIDE"* in the same breath. This is
  `2026-08-29-playtest-ordering-and-the-second-room.md` §7, reproduced
  independently at a different room size and a different viewport, with the
  consequence attached: the panel's note was wrong and the simulation was
  right. Nothing new is claimed about the cause; that record's snapshot-poll
  hypothesis is the one to test.
- **Removing a room with the mouse works, and the confirm control understates
  what it does.** A separate run built the same 6x6 cell, then pressed *"Remove
  rooms"* and dragged a **3x3** across the middle of it. Pasted:

  ```
  before removal: {"tick":3776,...,"rooms":1,"roomCapacity":1,"accommodationCapacity":1,...}
  remove control label: "Remove rooms"
  panel in remove mode: ["ROOMS","Expand"]
  confirm reads: "Remove 3 × 3" enabled=true
  after removal:  {"tick":5616,...,"rooms":0,"roomCapacity":0,"accommodationCapacity":0,...}
  ```

  The whole 6x6 room went, which is what `hud.rooms.remove-hint` promises —
  *"Drag across any part of a room to remove all of it."* — so the behaviour is
  right and documented. **The button is the part that is not:**
  `hud.rooms.confirm-remove` is *"Remove {width} × {height}"* and those are the
  dimensions of the *rectangle dragged*, so a press labelled **"Remove 3 × 3"**
  deleted a thirty-six-tile room. Reported as a string that understates its own
  press, not as a behaviour defect. The finding this closes is
  `docs/research/README.md`'s *"a mis-drag is currently permanent"*, already
  marked overtaken there by #312: **overtaken, and now exercised by dragging.**
  Note also that the Rooms panel folds itself on entering remove mode exactly as
  it does on arming — `["ROOMS","Expand"]` — and re-opens once a rectangle is
  pending.
- **The refusal band latches, still.** The whole time — through 24 wall orders,
  a designation, four object placements and twelve admissions — `.hud__refusal`
  read *"Nothing was removed — there is no object on that tile, and none being
  built there."*, earned by the calibration probe's single press on bare ground
  at tick 0. Same finding as that record's §8; recorded because it survived a
  much longer session than the one that first found it.
- **`simulation/status-counts` stops being published by an idle prison, and
  the tick goes with it.** `statusCountsEqual`
  (`src/simulation/worker/status-counts.ts`) skips a publication whose payload
  equals the last, and `tick` lives in the envelope *beside* `counts` rather
  than inside it — so a session with nothing changing publishes once and then
  never again, however long it runs. The first version of this harness polled
  that tick and reported the simulation frozen at 0 while construction was
  visibly progressing. **Not a defect** — the skip is deliberate and documented
  at `CLOCK_STATE_PUBLISH_INTERVAL_MS`'s neighbour comment — but it is a real
  trap for anything outside the HUD that treats the counts message as a clock,
  and it is written down here so the next harness does not lose ten minutes to
  it.

- **`prisonersHighRisk` was 0 at every sample of every run, and it is 0 by
  construction.** **READ, not measured beyond that:** the application admits
  with a hard-coded `ADMISSION_REQUEST = { priorIncidents: 0 }`
  (`src/main.ts:862`), and `classifyPrisoner`
  (`src/simulation/prisoners/classification.ts:82`) scores
  `+1` for a long sentence, `+0..2` for prior incidents and `-1|0|+1` for
  screening variance — so a UI admission tops out at tier **2**, and
  `classificationGroupIdForTier` (`classification.ts:58`) needs `>= 3` for
  `'high-risk'`. The Regime tab therefore shows a **High Risk** schedule that
  no prisoner a player can admit is subject to. `reviewClassification` can
  reach tier 3 later through disciplinary findings, which need incidents.
  The comment at `src/main.ts:859` names the same gap from the other side:
  *"risk tier the HUD never shows"*. **No cause and no impact are claimed** —
  whether the player should be able to choose an arrival's history is a design
  question, and `docs/research/2026-08-28-risk-tier-and-income.md` already
  establishes that the tier changes neither what the state pays nor what the
  prison spends.

- **A press of Admit took about two seconds here — and the cause turned out to
  be the container, not the game.** Kept in full because the shape of the
  investigation is the useful part. Measured first, twelve consecutive presses
  on the Intake panel, each timed from the start of the press to the moment the
  click completed:

  ```
  admit press durations (ms): [2283,2220,2576,1793,1770,2043,2354,1916,2197,2304,2260,1850]
  admit control disabled attribute now: null
  ```

  Mean about 2.1 s, so admitting twelve people is about **25 seconds** of a
  control that will not take the next press. The `disabled` attribute was
  `null` immediately afterwards, so whatever holds the press does clear.

  **Two candidates fitted, and the probe below kills both.** One: the HUD's
  in-flight gate — *"while one is in flight the transport controls are disabled
  and a further command is refused"* (`src/ui/hud/hud.ts:732`), and the Intake
  panel's controls are added to that same `busy` set (`src/ui/hud/hud.ts:1704`)
  — is genuinely holding the button for two seconds per admission. Two: the
  control is never *stable* for two consecutive animation frames, because the
  panel repaints on every counts publication, and a real browser driver waits
  for stability before it will click. The first would be a defect a player
  feels; the second would be an artefact of how this was driven and would cost
  a player nothing.

  **The measurement was named and then taken, and it refutes both.** Same
  `busy` set, on a control a fresh session can press immediately — the Build
  panel's Buy submit — with the page sampling that button's `disabled` property
  and its `getBoundingClientRect()` from inside itself every 25 ms:

  ```
  [probe] buy press durations (ms): [859,876,870,938,878,861]
  [probe] samples=56
  [probe] intervals the control was disabled (ms): []
  [probe] distinct button positions seen: ["1177,679"]
  ```

  The control was **never** disabled and **never** moved, and a press still
  took about 880 ms. The third line is the answer: 56 samples over roughly six
  seconds is one every ~107 ms against a requested 25 ms, so the page's own
  timer was starved by about four. **The main thread is saturated**, in a
  headless container on software GL, with the simulation *paused*. A driver's
  actionability checks need animation frames, and there are not many.

  **So this is a property of where the playtest ran and is not reported as a
  player-facing defect.** The two-second Admit figure stands as a measurement
  and its cause is now known not to be the in-flight gate. What it would take
  to make a claim about a real player: the same probe on real hardware with a
  GPU. Nothing in this repository can supply that.

- **A run died and the cause was me, not the game — and the rule that would
  have prevented it is narrower than the failure.** The removal scenario's
  later steps hung on a `locator.click` until the 600-second test timeout.
  Playwright's failure snapshot says what the page was:

  ```
  - generic [ref=e50]: "0"          <- Funds
  - generic [ref=e57]: "0"          <- Earned today
  - generic [ref=e64]: "--"         <- Day
  - generic [ref=e66]: "--"         <- Through the day
  - generic [ref=e81]: Speed 1x
  - generic [ref=e94]: Minimap is not available yet
  - button "New prison" [ref=e103]
  - listitem: "New Prison (3 gen)"  <- the save this run had made
  - region "Intake"                 <- the Overview tab, i.e. the initial tab
  ```

  Funds `0` on a prison that had 22,405 a moment earlier, a `--` clock, the
  minimap unavailable and the Overview tab selected: that is the **arrival
  screen of a freshly loaded page**, not a session in trouble. The page
  reloaded and took the worker with it.

  **Why.** `tests/browser/vite.config.ts` sets `root: repositoryRoot`, and the
  dev server watches everything under it. This record was being edited, in
  `docs/research/`, while that run was live. A markdown file no module imports
  has no HMR boundary, so Vite falls back to a **full page reload** — the
  session dies, and the death shows up minutes later as a control that will
  never be clickable.

  **`docs/AGENT_WORKFLOW.md` states this rule as "never edit a *source* file
  while a Playwright run is live", and that is too narrow.** The browser
  config's root is the repository root, so *any* file in the tree can do it —
  including the very research note the run is being written into, which is the
  file an agent is most likely to be editing at that moment. **Handed over
  rather than edited:** `docs/AGENT_WORKFLOW.md` is not this pass's surface.

## 8b. Every player-facing string this pass read, and what is wrong with them

Asked for explicitly, so the empty answers are stated as well as the full ones.

**No key is missing and no raw key reached the screen.** Checked
mechanically as well as by reading the dumps: of the 181 dotted keys named in
`src/ui/hud/messages.ts`, all 181 have an entry in
`src/content/default-locale-en.ts`. Nothing in any panel dump of any of the
four runs contained a `hud.` token.

Two sentences read wrong, and both are already known:

1. *"Open on at least one side"* (`hud.rooms.enclosure-open`) and *"Must be
   enclosed"* (`hud.rooms.requirement-enclosed`), printed by the Rooms panel
   about a rectangle the simulation accepted in the same press — three
   independent reproductions in §8. It is not a wording defect; the sentence
   is right and the world it describes is stale.
2. The latched refusal band: *"Nothing was removed — there is no object on
   that tile, and none being built there."* was the whole content of
   `.hud__refusal` for entire sessions, earned by one press at tick 0. True
   when written; a statement with no age.

One sentence is authored and never rendered: *"{value} of {capacity}"*
(`hud.status.occupancy-value`), §6.

Three read exactly right and are worth naming because they are the ones that
would have prevented #601's confusion if anybody had been looking at them:
*"9 waiting with no bed to sleep in"* (`hud.intake.no-place`), *"A prison
needs a cell before it can admit anyone. It does not need a free bed…"*
(`hud.intake.hint`), and *"Hire Guard · 80"* (`hud.security.hire`).

## 9. What this pass did not reach

- A player. Every impact statement above is withheld for that reason.
- Contraband and incidents: `0 INCIDENTS Clear` throughout, nothing provoked.
- Risk tier 3 in a live session. §8 argues from code that it is unreachable at
  admission; nothing here drove a classification review to test the other route.
- Any viewport other than 1440x900.
- Save/load of *this* prison. `2026-08-29-mouse-playtest.md` §3 covers a
  mouse-built prison across a reload; nothing here re-derives it.
- **Re-zoning the same rectangle after removing the room, and removing a
  placed bed with the Build panel.** Steps 2 and 3 of the removal scenario.
  **No claim is made about either, and the reason is §8's last bullet: the run
  was killed by the person running it.** Step 1 — the removal itself — is §8
  and is complete. Whoever picks this up should run
  `-g "remove a room and remove an object"`, change nothing in the tree while
  it runs, and read the two lines after `after removal:`.

## Weakest claim, and the cheapest thing that would falsify it

**Weakest: that the brief's 150 is the EARNED TODAY chip rather than something
else that also lands near 150.** What is established is that a twelve-prisoner
prison with three beds displays 151 mid-day and credits 900 at the boundary,
and that no other on-screen figure in this session was near 150 at any sample.
What is *not* established is what the owner was looking at.

**The cheapest measurement that would falsify it, written down rather than
named:** ask the owner whether the 150 came from the EARNED TODAY chip, and if
so roughly how far into the day the clock read. If it came from the FUNDS line
instead, reading 2 returns and §7's numbers are the ones that matter.

**Second weakest: that a housed prisoner's needs stay met indefinitely.** Two
boundaries at `3 x 300` establish it for about two in-game days of residency.
It is asserted for no longer than that. Cheapest falsification: run the same
prison for ten in-game days and read whether any boundary credits less than
`300 x residents`.
