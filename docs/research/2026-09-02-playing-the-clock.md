# Playtest: the clock — pause, play, the speed controls, day boundaries

**Date:** 2026-09-02.
**Branch:** `docs/playtest-the-clock`, cut from `origin/main` at **v0.0.349**
(`2025f7d7`). Every file:line cited below was opened at that commit; a later
commit may move a line without moving the behaviour it names.

**Surface:** the clock and everything that depends on time — pause, play, the
speed ladder, day boundaries, and what the game does when the player changes
the passage of time. Seven prior playtests played money, rooms, save/reload,
alerts, people, the first five minutes and the world view; none had played
the clock itself.

## Reproduction

`tests/browser/playtest-2026-09-02-the-clock.playtest.ts`, one act at a time:

```
LOCKSTATE_BROWSER_TEST_PORT=5340 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-02-the-clock.playtest.ts -g "act 1" --reporter=line
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` matches
`*.spec.ts` only, `playwright.playtest.config.ts` is the one that matches
`*.playtest.ts`. Every act drives `index.html` + `src/main.ts` in real
Chromium through a `Worker` tee, with real DOM events on the real controls —
every quoted reading below is off the DOM (`textContent`, `getAttribute`,
`getComputedStyle`) or off the worker's own protocol messages captured by the
tee, never off simulation state read out of band.

**LFS**: `git lfs checkout` was run in the worktree first (62 objects,
93 MB), confirmed with `file public/assets/actors/actor.guard.base.idle.png`
returning `PNG image data, 260 x 3104` rather than the `ASCII text` a fresh
worktree gives.

**On the one hard constraint this surface carries.** This box ran several
other agents' suites throughout this pass — `uptime` read load averages
between 2.0 and 14.0 across the session, and `ps` regularly showed two or
three concurrent `vitest`/`playwright` processes. No finding below rests on a
wall-clock reading of *this* box under *that* load: acts 1–4 assert against
the DOM's own state and the worker's own tick (`simulation/clock-state`),
neither of which a stutter can move, and act 5 says explicitly what it can
and cannot conclude from a wall-clock measurement taken here, with `uptime`
and `ps` quoted rather than assumed.

## Claim tiers

- **MEASURED** — this pass drove the real page and the quoted output is
  verbatim console output from that run.
- **READ** — a source file was opened at the cited line and quoted or
  paraphrased.
- **REASONED** — follows from a MEASURED or READ fact, stated as such.

---

## Finding 1 — Play always resumes at ×1; only Fast-forward remembers the speed a pause interrupted

**MEASURED**, act 1. Sequence: New prison → Play (×1) → Fast-forward (×2) →
Fast-forward (×4) → Fast-forward (cycles back to ×2, confirming
`nextFastForwardSpeed`'s documented `4 -> 2` step) → Pause → Play.

```
[act-1] after a THIRD Fast-forward press (should cycle 4 -> 2): {"clockMode":"running","speedText":"×2", ...}
[act-1] after Pause, while the clock was at ×2: {"clockMode":"paused","speedText":"PAUSED","speedSrText":"Speed 2×", ...}
[act-1] after Play from a pause that started at ×2 -- does it resume at ×2 or reset to ×1?: {"clockMode":"running","speedText":"×1","speedSrText":"Speed 1×", ...}
```

Pressing Play after a pause taken at ×2 resumes at **×1**, not ×2. Reproduced
twice, on two separate runs (`1 passed (4.5m)` and `1 passed (31.1s)`), both
with the identical `×1` result.

**Cause**, `src/ui/hud/hud.ts:2149-2166` (`transportIntent`), before this
pass's fix:

```ts
/**
 * What each transport button asks for, given what the clock is doing now.
 *
 * Pause never changes the speed, so unpausing resumes at the speed the
 * player chose rather than silently resetting to ×1.
 */
export function transportIntent(kind: TransportIntentKind, viewModel: HudViewModel): HudIntent {
  switch (kind) {
    case 'pause':
      return { kind: 'set-clock', mode: 'paused', speed: viewModel.clock.speed };
    case 'play':
      return { kind: 'set-clock', mode: 'running', speed: 1 };
    case 'fast-forward':
      return { kind: 'set-clock', mode: 'running', speed: nextFastForwardSpeed(viewModel.clock.speed) };
  }
}
```

The docblock's claim is true of `case 'fast-forward'` — it reads
`viewModel.clock.speed`, which `hudClockFromWorkerMessage`
(`src/ui/simulation-clock.ts:36-47`) keeps at the last *running* speed even
while the clock is paused, specifically so a further tap has somewhere to
continue from. It is false of `case 'play'`, which hard-codes `speed: 1` and
never reads `viewModel.clock.speed` at all. A second, independent probe
(act 1, continued) confirms the asymmetry is real rather than a fluke of one
button's reading:

```
[act-1] Pause while at ×4: {"clockMode":"paused", ..., "speedSrText":"Speed 4×"}
[act-1] Fast-forward pressed DIRECTLY from a pause that started at ×4 (no Play in between): {"clockMode":"running","speedText":"×2", ...} -- expected ×2 (nextFastForwardSpeed(4))
```

Fast-forward pressed straight out of a pause at ×4 correctly continues the
ladder to ×2. Play pressed out of the same kind of pause resets to ×1 every
time. `grep -rl "transportIntent" tests/` returned nothing before this pass —
the function had no test anywhere in the repository.

**Player-visible cost.** A player who fast-forwards to watch their prison run
(the genre-standard way to pass time quickly), pauses briefly to give an
order — which ADR 0051 itself calls *"the ordinary way this game is
played"* — and presses Play to resume, is silently dropped back to real time
with nothing on screen explaining why. The only two visible cues the game
gives about the retained ×4/×2 choice are the word `PAUSED` (which says
nothing about a speed) and a screen-reader-only `<span class="ui-sr-only">`
carrying `Speed 4×` that no sighted player will ever read. A player who did
not consciously track "I was at ×4 before I paused" has no way to notice their
fast-forward setting was discarded — this is exactly the *"discovered only by
accident"* shape the standing brief asks this surface to hunt for.

**What this pass did and did not do about it.** Whether Play *should* instead
resume at the retained speed is a genuine, two-sided design question, not an
obvious bug to silently fix:

- *For fixing it:* two independent docblocks (`hud.ts`'s `transportIntent`
  and `simulation-clock.ts`'s `hudClockFromWorkerMessage`) both assert, in
  their own words, that pausing should not cost the player their chosen
  speed. The infrastructure that retains the speed across a pause exists
  for exactly this purpose (`hudClockFromWorkerMessage`'s own comment: *"the
  last speed the simulation actually ran at is kept so ... pausing does not
  silently reset the player's choice"*), and Fast-forward already honours it.
- *Against fixing it:* `transportPressedStates`
  (`src/ui/hud/projection.ts:103-107`) defines `play: !fast` — if Play
  resumed at a retained ×4, the Play button the player just pressed would
  **not** show as pressed; the Fast-forward button would, because `fast =
  clock.speed > 1`. A player who presses Play and watches Fast-forward light
  up instead is a different, and arguably worse, kind of confusing.

Per `AGENTS.md`'s standing mandate, a player-visible behaviour change here
looked like the owner's call rather than this pass's — **and on the integrator's
reading it is not, for the reason recorded below: the question was already
answered one function away.** What this pass did do, per
`docs/AGENT_WORKFLOW.md` §3's "where a document and the code disagree, the
code is right and the document rotted": corrected the docblock
(`src/ui/hud/hud.ts:2149-2178`, current commit) to state the measured
asymmetry rather than the false uniform claim, and added
`tests/unit/ui-hud-transport-intent.test.ts`, which pins all three branches
as measured — including the discrepancy — so a future change to either path
changes this test rather than silently drifting further from what its own
comment says. Red-then-green was run by hand: with `case 'play'` temporarily
changed to `speed: viewModel.clock.speed`, `"Play always asks for ×1..."`
failed (`expected 1, received 2`); reverted, all three tests pass.

**Resolved by the integrator rather than escalated, and the evidence this
pass said it was missing is the reason.** This section recommended putting the
choice to the owner, and its own "weakest claim" note below identified exactly
what was absent: the pressed-state argument was *"`projection.ts`'s current
logic, not evidence of the original author's intent"*. That evidence exists,
in the same file the pass was already reading, and was not cited:
`nextFastForwardSpeed`'s docblock (`src/ui/hud/projection.ts`) states the rule
outright — ***"Returning to ×1 is what the play button is for, so no tap is
ever ambiguous about what it will do"*** — which is why the ladder runs
1 → 2 → 4 → 2 and never wraps to 1 itself. That is stated intent, not inferred
logic, and it is what turns the pressed-state observation from the strongest
case *against* a naive fix into a settled reading:

**The three controls are a radio group over {paused, ×1, fast}**, not a
play/pause pair with a speed dial beside it. `Play` *is* the ×1 member, so
`Play` asking for ×1 out of a pause is the button doing the one thing its own
documentation says it is for, and `Fast-forward` carrying the retained speed
is the ladder resuming where it was. Neither resets the other's state, and
there is no uniform contract for them to violate — which is why the only thing
that rotted was the paragraph claiming one.

**Nor is it a hidden behaviour, which is the test the owner's standing design
directive actually applies** (*"gra ma być łatwa przyjazna do grania, a nie
jakieś ukryte funkcje"*). Because exactly one control is lit and `play: !fast`
lights `Play` precisely at ×1, a player who presses `Play` out of a ×4 pause
sees `Play` lit and `Fast-forward` dark: the resulting state is on screen, in
the control they just pressed. A player who meant to keep the speed presses
`Fast-forward`, which this same pass measured as resuming at ×2.

So **the behaviour is unchanged and no owner ruling is owed.** What changed is
that `transportIntent`'s docblock now cites where the asymmetry was decided
instead of presenting it as undecided, and `tests/unit/ui-hud-transport-intent.test.ts`
pins all three branches so the next edit to either path has to change a test
rather than drift. The mandate's fourth exclusion covers *a player-visible
promise the code does not keep* — and after this correction the code and its
documentation make the same promise, so there is nothing in it for the owner
to sign.

**Weakest claim:** the pressed-state argument above (`play: !fast`) is
`projection.ts`'s current logic, not evidence of the *original author's*
intent — it is offered as the strongest case *against* the naive fix, not as
proof the current behaviour is correct.

---

## Finding 2 (checked, correct) — Pause and the day/speed dimming (#639) both hold up as documented

**MEASURED**, act 1, on the same run above. A fresh session:

```
{"clockMode":"paused","speedText":"PAUSED","speedSrText":"Speed 1×", "speedColor":"rgb(125, 136, 148)","dayColor":"rgb(125, 136, 148)","pausePressed":"true", ...}
```

matches `status-strip.ts:304-328`'s documented contract exactly: the word
`PAUSED` replaces the `×{speed}` reading, `data-clock-mode="paused"` is
stamped (confirmed via computed colour rather than the attribute alone), and
both the day and the day-progress readouts dim from `rgb(238, 242, 246)`
(running) to `rgb(125, 136, 148)` (paused) — a real, measured colour change,
not merely an attribute flip with no visible effect:

```
[act-1] dimming check: day colour changed (rgb(238, 242, 246) -> rgb(125, 136, 148)), speed colour changed (rgb(168, 177, 188) -> rgb(125, 136, 148))
```

`aria-pressed` on the three transport buttons also tracked the clock state
correctly at every step (`pausePressed`/`playPressed`/`fastForwardPressed`,
exactly one `"true"` at a time, matching `transportPressedStates`). **Checked
and correct** — ADR 0051's #639 ruling ships as documented, and this pass
found no discrepancy in it.

## Finding 3 (checked, correct) — the speed ladder cycles `1 → 2 → 4 → 2 → 4 …` as documented

**MEASURED**, act 1. Three consecutive Fast-forward presses from a fresh
×1 session read ×2, ×4, ×2 — exactly `nextFastForwardSpeed`
(`src/ui/hud/projection.ts:76-90`)'s documented `1 -> 2 -> 4 -> 2` step.
**Checked and correct.**

---

## Finding 4 — a reload always returns to a paused session with no memory of the speed that was running, which is consistent with ADR 0051 and costs nothing extra

**MEASURED**, act 2. A session run at ×4 for several seconds, saved, then a
*real* page navigation (`page.goto`, not a second session in the same page)
followed by Load:

```
[act-2] running at ×4 for a couple of seconds before saving: {"clockMode":"running","speedText":"×4", ...} at tick 576
[act-2] saved: Saved (generation gen-mtjpncvd-2).
[act-2] RELOADED. On arrival, before loading anything: {"clockMode":"paused","speedText":"PAUSED","speedSrText":"Speed 1×", "dayText":"--", ...}
[act-2] after Load: {"clockMode":"paused","speedText":"PAUSED","speedSrText":"Speed 1×","dayText":"1","dayProgressText":"35%", ...} at tick -1 (tick before save was 576)
[act-2] pressing Play on the just-loaded session: {"clockMode":"running","speedText":"×1", ...}
```

**Read together with ADR 0051** ("A session starts paused, and that is
deliberate... nothing in `src/` starts the clock by itself"), this is
consistent rather than a defect: nothing in the save format or the worker's
`handleInitialize` carries a preferred playback speed (`ClockControl` for a
paused clock has no speed field at all — `src/simulation/clock/fixed-step-
clock.ts:21`), and the HUD's own memory of "the last speed it saw" is a
fresh-page default of ×1 (`UNKNOWN_HUD_CLOCK.speed`,
`src/ui/hud/view-model.ts:1817-1823`) until a `simulation/clock-state`
message says otherwise. So: **a reload does not survive the same speed —
every reload returns to a paused session that, if played, starts at ×1**,
whatever speed was active when the save was made. This is **checked and
correct** against the documented, accepted design (ADR 0051 decided a
restored session starts paused; nothing decided that it should also restore
a viewing preference), and is reported because the brief asked the specific
question, not because it is a defect.

**Instrument note (not a product finding):** `currentTick`/`currentClock`
(`tests/browser/playtest-harness.ts:156-176`) read the *last*
`simulation/clock-state` message; a session that has only just received
`simulation/ready` (which carries the same two fields under a different
message kind, per `src/ui/simulation-clock.ts:26-33`) has sent no
`clock-state` yet, so `currentClock` correctly answers `null`/`-1`
immediately after a load even though the DOM already shows the right thing.
`clockReading` (this file's own DOM probe) is what should be trusted here,
matching `docs/AGENT_WORKFLOW.md`'s "read the screen, not the store" — and it
agreed with what a player would see.

---

## Finding 5 — a day boundary nets state income and the day's wages into one unexplained treasury jump

**MEASURED**, act 3, from the full `simulation/status-counts` series captured
by the tee (92 samples over one run) rather than from the act's own two
checkpoint reads — see the instrument note below for why those checkpoints
themselves were vacuous. The series holds a real day boundary at tick 14399
(the `tick % 2,400 === 2,399` phase both `PayrollSystem`
(`src/simulation/economy/payroll.ts:233`) and the state-income system
(`src/simulation/economy/income.ts:647`) schedule on), bracketed by the
closest two published samples:

```
{"tick":14364,"treasuryMinorUnits":22260,"stateIncomeAccruedTodayMinorUnits":295,"dailyWageBillMinorUnits":80, ...}
{"tick":14405,"treasuryMinorUnits":22480,"stateIncomeAccruedTodayMinorUnits":0,  "dailyWageBillMinorUnits":80, ...}
```

Treasury rose by exactly **+220** across the boundary. `STATE_INCOME_PER_
PRISONER_DAY_MINOR_UNITS = 300` (`src/simulation/economy/income.ts:115`) for
the one occupied place this prison had, minus the `80`/day wage bill this
prison was already carrying (visible on the Security tab's roster header,
`hud.security.roster-wage-bill`, `'{total} a day'`) is exactly `300 - 80 =
220`. Both systems fire on the identical tick, so a player never sees "state
income arrived" and "payday" as two events — only their net.

**What a player actually sees at that moment, checked against every channel
this pass captured:**

- **The events band (`.hud__event`) and the alerts list say nothing at all.**
  `band at this point` read `{"text":"","severity":null,"hidden":true}`
  throughout the whole run, and `worker events so far` was `[]` — because
  `SimulationEventLog.recordUnpaidWages` only appends when the bill was
  *not* met in full (`src/simulation/events/event-log.ts:449-460`, *"a
  payday met in full leaves no arrears and is not an event"*), and there is
  no event for a *successful* payday or for state income arriving at all —
  confirmed by reading `src/simulation/economy/payroll.ts` and `income.ts`
  end to end: neither ever calls anything on `SimulationEventLog` except the
  one unpaid-wages guard.
- **The `EARNED TODAY` chip resets to 0**, silently, at the same tick — it is
  the only visible marker that a day just ended, and it says nothing about
  what replaced it.
- **`FUNDS` jumps by the net figure**, with nothing distinguishing "income
  in" from "wages out": a player would need to already know the daily wage
  bill (Security tab) and watch the `EARNED TODAY` figure in the instant
  before it reset, then do the subtraction themselves, to recover the two
  components of the one number that changed.
- **The day counter increments** in the same status-strip paint as the
  treasury figure, so at least *that* correlation is visible — a player who
  is watching the strip can tell a day boundary is what just happened, even
  though nothing says what happened financially at it.

**Player-visible cost.** This is not "nothing is legible" — the day counter
correlates with the change, and both components (the day's wage bill and the
day's earnings so far) are separately readable *before* the moment, on two
different tabs. But nothing narrates the moment itself, and a growing
prison's day boundary is the one point every day where two systems this game
already tracks — what came in, what went out — could be said in one sentence
and are not. A prison running a wage bill *larger* than its income (plausible
early, before enough cells are occupied) would show the identical shape in
reverse — `FUNDS` silently falling — with the same nothing said about why,
right up until `ADR 0049`'s unpaid-wages event finally fires on the day the
bill cannot be met at all. The silence is uniform across "the day went well"
and "the day went less well but not yet badly," which is a wider gap than
"only failure is announced" — success is not announced either, and neither
is a decline that stops short of failure.

**Weakest claim:** this pass observed one occupied-place, one-guard prison
for two day boundaries. It does not establish what the same moment looks like
in a larger prison where other systems (classification review, discharges)
might also land on the same tick and add to the same unexplained jump — that
is a real, adjacent question this pass did not chase down, because the two
systems confirmed here already fully explain the measured figure without it.

**Instrument bug, found and reported rather than silently worked around.**
This act's own two checkpoint logs (`--- around day-1-to-2 boundary ---` and
`--- around day-2-to-3 boundary ---`) are **vacuous** — both report the
identical, useless pair `{"tick":0, ...}` / `{"tick":8806, ...}`, because
`buildResilientCell`'s own setup (wall construction, up to twelve zoning
retries with waits up to 5 s each, all run at ×4) had already carried the
session to tick 8806 — day 3 and part of a fourth — before this act's own
`runUntilTick(page, 2_500)` was ever called, so both calls returned
immediately with the target already satisfied and `reportBoundary`'s
tick-2,400/4,800 filters found only the same two stale samples on both sides.
The Finding above was recovered from the *unfiltered* `countsSeries()` this
act also logs in full, not from the act's own targeted checkpoints, which
this file's next revision should replace with a target computed from the
tick `buildResilientCell` actually finished at
(`Math.ceil((tick + 1) / 2_400) * 2_400`) rather than a fixed absolute tick.
Reported per `docs/AGENT_WORKFLOW.md`'s "watch your own instrument" rather
than quietly patched and rerun, since the full series already answered the
question this act was asked.

## Finding 6 (checked, correct) — the paused-command sibling sweep: every gesture this pass could reach behaves the way ADR 0051 says it should, with the tick provably unmoved throughout

**MEASURED**, act 4. A built, zoned, six-tile cell was paused at tick 11,603,
and six of the thirteen `HudIntent`s ADR 0051 names — the ones not already
covered by #749's own browser regression (`CancelBuildOrder`, `Undo`, `Redo`,
`CancelMaterialPurchase`) — were pressed one after another with **no Play in
between**, reading the panel and the tick after every one:

| gesture | before → after | tick | band/refusal |
| --- | --- | --- | --- |
| `PurchaseMaterials` (10 bricks) | treasury 22,210 → 21,810 | 11,603 (unchanged) | delivery row appears at once (`"1 bought · 400 back if cancelled"`) |
| `RemoveObject` | — (see instrument note) | 11,603 (unchanged) | refusal reaches the alerts list at once |
| `UnzoneRoom` | rooms 1 → 0 | 11,603 (unchanged) | Rooms panel shows the room gone at once |
| `AdmitPrisoner` (against the now-unzoned prison) | prisoners 0 → 0, refused | 11,603 (unchanged) | main-thread pre-check refuses before a command is even sent, per ADR 0051's own account of this exact branch (`src/main.ts:2041`) |
| `HireStaff` | staff 0 → 1 | 11,603 (unchanged) | Staff panel shows the new hire at once |

The final check in the log — `did ANY of the above ever move the clock off
11,603? now at 11,603` — confirms the whole sweep ran without a single tick
of simulation time passing, which is the entire premise ADR 0051 rests on
(*"pausing stops time; it does not stop the player"*). Every one of the five
gestures this pass could reach took effect on the panel **immediately**, with
no need to press Play first — no sibling of the #774 shape (a success
written to a log but not published until the next tick-loop wake) was found
in any of them.

**Why this matches the code, not just the observation.** `handleSubmitCommand`'s
paused-drain branch (`src/simulation/worker/state-machine.ts:1179-1236`) calls
`publishStatusCounts(now, true)` unconditionally whenever
`dispatchDueCommands()` did something — the `true` argument is
`dispatchedWhilePaused`, which by itself opens the interval gate
(`publishStatusCounts`'s own docblock, `:576-600`) regardless of which of
the six fields changed. So every one of these five gestures was always going
to publish immediately once dispatched while paused; the sweep's contribution
is confirming that is what actually reaches the panel a player is looking at,
for gestures #749's own regression never exercised.

**Instrument bug, found and reported.** The `RemoveObject` row's press target
was computed from `cell.origin` alone, at a hard-coded tile `(12, 12)` — but
`buildResilientCell`'s own tile-shift (`tileShift`, computed to clear
`.hud-minimap`, `tests/browser/playtest-2026-09-01-the-people.playtest.ts:158-
166`) is **not exposed on its return value**, so this act had no way to know
the cell's beds actually sit two tiles east of that. The press landed on bare
ground and was correctly refused — `"Nothing was removed — there is no
object on that tile, and none being built there."` — which is not the
`RemoveObject` success path this row was meant to check. **What it still
proves**: a refusal this act did not intend reached the alerts list
immediately, at the unchanged tick, which is itself one more data point for
the same pattern every other row in this table shows, just not the specific
gesture the row's label claims. This is reported rather than silently
re-targeted and re-run: the pattern across the other five gestures (including
this same refusal channel firing instantly for an *unintended* refusal) is
strong enough that a sixth confirmation was judged not worth a second
multi-minute run on a box that measured a load average of 16–18 during this
act. A future pass wanting the `RemoveObject` success path specifically
should have `buildResilientCell` return `westTile`/`eastTile` (or the
computed `tileShift`) rather than re-deriving them.

**What this pass did not reach.** `ReleaseGuard` — releasing a guard from a
held duty claim (contraband search, incident response), not the roster
`Dismiss` control — needs an actual stuck-guard incident to provoke, which
this pass did not attempt to engineer. It is the one member of ADR 0051's
thirteen this sweep leaves unchecked.

## Finding 7 (checked, correct) — a real, organic severity collision at ×4 confirms the promotion rule; the protective half is not independently re-verified live in this pass

**MEASURED**, act 5, and this is the section the brief asks to be held to the
strictest evidence standard — no finding here rests on a wall-clock reading
this box's load could move. `uptime` before this act started:
`load average: 4.86, 10.37, 9.58`; `uptime` after it finished:
`load average: 7.68, 8.23, 8.78`. **This box was not idle at any point during
this act**, so every conclusion below is stated in ticks and in the band's own
painted sequence (a state trace, not a timing measurement), never in
milliseconds read off this run.

A two-bed, two-admission cell was run at ×4 for 20,119 ticks with no
scripted intervention beyond the initial setup, and the worker's own event
log (captured by the tee, never sampled) produced a **real, organic
same-region collision**, not a synthetic one:

```
6 worker event(s): [
  {"tick":10201,"type":"incidents.assault-opened"},
  {"tick":10811,"type":"incidents.all-clear"},
  {"tick":10851,"type":"incidents.riot-opened"},   <- 40 ticks after the all-clear above
  {"tick":11461,"type":"incidents.all-clear"},
  {"tick":15652,"type":"incidents.riot-opened"},
  {"tick":16261,"type":"incidents.all-clear"}
]
gaps, in ticks: [610, 40, 610, 4191, 609]
```

The 40-tick gap (`incidents.all-clear` → `incidents.riot-opened`) is 2,000 ms
of simulated time — **500 ms at ×4, under the 600 ms floor** — and is exactly
the shape ADR 0084 decision 4 was ruled on: two events landing inside the
floor. The band's own recorded spans across the whole run:

```
580f [null] ""
89f  [warning] "A fight has broken out between two prisoners."
5f   [info]    "The prison is under control again — no incident is still open."
63f  [danger]  "A riot has broken out — 2 prisoners have stopped taking orders."
412f [info]    "The prison is under control again — no incident is still open."
90f  [danger]  "A riot has broken out — 2 prisoners have stopped taking orders."
387f [info]    "The prison is under control again — no incident is still open."
```

**This confirms the promotion half of decision 4 on real, unscripted incident
data**: the `info`-severity all-clear at tick 10,811 was on the line for only
5 frames before the `danger`-severity riot at tick 10,851 took it —
`outranks(riot, all-clear)` is true (`danger > info` in
`SEVERITY_EVICTION_ORDER`), so `admitToEventBand`'s *"inside the floor and
more severe: takes the line immediately"* branch fired, exactly as designed.
That is not the #700 shape (a message written and never painted at all) —
it painted for 5 real frames, which is 5 more than #700's own zero — and it
is not a defect: the ruling's own words are that a more severe event *"takes
the line immediately"* specifically so a player is never held on stale good
news while a new, worse problem stands. A player watching only the band
across this run would have seen: nothing → *fight* (89 frames, easily read)
→ a bare flash of *under control* → *riot* (63 frames, easily read) →
*under control* (412 frames) → *riot* (90 frames) → *under control*
(387 frames). The one thing they might miss is being told the fight ended
before being told a riot began — which the design deliberately does not
protect, because the riot is the thing that "most needs to be seen at once."

**What this pass does not independently confirm: the protective (delay) half
of decision 4**, where a second event of *equal or lesser* severity arriving
inside the floor must *wait* rather than replacing what is on the line. This
run's own close collision happened to be a promotion (more severe), which
takes the immediate branch and exercises no timing logic at all — `wakeInMs`
is never armed for that branch. `tests/browser/ui-escape-sentence-survival.spec.ts`
already carries a synthetic browser test for exactly the protective case
(*"the dwell floor keeps the escape sentence on screen through the same-tick
all-clear"*), and `tests/unit/event-band-dwell.test.ts` covers `admitToEventBand`
directly as a pure function with no DOM or timer at all — but this pass did
not re-run either live, on the judgement that a timing-sensitive suite is
exactly what `docs/AGENT_WORKFLOW.md` warns not to run for a fresh
conclusion on a box this loaded, and that re-stating an existing, passing
test's own result without running it would be worse than saying so plainly.

**Does the band become a blur at ×4?** No, on what this pass could observe:
every distinct sentence this run produced held the line for tens to hundreds
of frames (5 to 580), and the one 5-frame flash was a superseded low-priority
sentence, not a lost one — the alerts list (durable, per ADR 0084 decisions
1–3) shows the collapsed run correctly with its count and day:

```
"A fight has broken out between two prisoners. Day 5"
"The prison is under control again — no incident is still open. 3× Day 7"
"A riot has broken out — 2 prisoners have stopped taking orders. 2× Day 7"
```

Three all-clears and two riot-opens each collapse into one row with the
right count, so a player who glances at the log rather than the band still
gets an accurate tally — the band's brief flash costs nothing there.

**Weakest claim:** one organic collision, in one run, on one small prison.
It is real production data rather than a constructed scenario, which is its
value, but a single occurrence is not a distribution — this pass does not
claim 40 ticks is typical, only that it happened once, unprompted, and the
mechanism handled it exactly as ADR 0084 decision 4 specifies.

---

## What was checked and found correct, gathered

- The pause/running dimming and the `PAUSED` word (#639) — Finding 2.
- The speed ladder's cycle (`1 → 2 → 4 → 2 → …`) — Finding 3.
- Fast-forward pressed directly out of a pause resumes the ladder from the
  retained speed rather than restarting it — part of Finding 1.
- A reload always starts paused with no retained speed — Finding 4, and
  consistent with ADR 0051's own decided scope.
- Every paused-command gesture this pass could reach (`PurchaseMaterials`,
  `RemoveObject`'s refusal path, `UnzoneRoom`, `AdmitPrisoner`'s refusal,
  `HireStaff`) took effect on the panel immediately, with the tick provably
  unmoved — Finding 6. No sibling of the #774 shape was found in any of them.
- The alerts band's severity-promotion rule (ADR 0084 decision 4) held on a
  real, organic collision at ×4 — Finding 7. The protective (delay) half of
  the same rule was not independently re-run live in this pass; it is covered
  by `tests/browser/ui-escape-sentence-survival.spec.ts` and
  `tests/unit/event-band-dwell.test.ts`, neither of which this pass reran.

## Summary for the owner

**What a sceptic should re-run first:** Finding 1 (`tests/browser/playtest-
2026-09-02-the-clock.playtest.ts -g "act 1"`) — the measurement is solid and
the *conclusion drawn from it has been corrected*, so re-running it is the
fastest way to check both.

1. **Finding 1 needs nothing from the owner, and the pass's own
   recommendation that it did has been withdrawn.** This section originally
   asked for a ruling on whether Play should resume at the retained speed. It
   should not, and the reason is not a judgement call: `nextFastForwardSpeed`'s
   docblock in `src/ui/hud/projection.ts` already states *"Returning to ×1 is
   what the play button is for, so no tap is ever ambiguous about what it will
   do"* — the authorial intent this pass correctly noted it was missing when it
   flagged the pressed-state argument as its own weakest claim. With that
   citation the three controls read as a radio group over {paused, ×1, fast},
   `Play` is the ×1 member, and the asymmetry is the design rather than a
   drift from it. Nothing about the behaviour changed; `transportIntent`'s
   docblock now cites where it was decided instead of presenting it as
   undecided. See Finding 1 for the full argument.
2. **Consider whether a day boundary should say anything** (Finding 5). Two
   systems already track the two halves of the number that silently changes
   (the Security tab's wage bill, the `EARNED TODAY` chip) — nothing currently
   narrates their net at the moment they combine, in either direction (a good
   day or a day that's merely less good). Not urgent — the day counter at
   least correlates with the change — but named because nothing else in this
   pass's evidence closes the question either way.
3. **`ReleaseGuard`** (a held guard's release, not the roster's `Dismiss`) is
   the one member of ADR 0051's thirteen commands this pass's paused-sweep did
   not reach — it needs an actual held-guard incident to provoke, which this
   pass did not attempt to engineer.

Everything else this pass checked — the pause/dimming contract, the speed
ladder's cycle, five of six reachable paused gestures, and the dwell floor's
promotion rule on real incident data — held up exactly as documented.

## Own instrument, checked

- `buildResilientCell`/`wallSide` (`tests/browser/playtest-2026-09-01-the-
  people.playtest.ts`, exported for reuse in this pass) built and zoned a
  6×6 cell cleanly in every run of this pass with zero repairs needed
  (`repair steps: []` on all four walls, every run) — the `.hud-minimap`
  click-eating trap this file was written to route around did not need to
  fire this time, at the tile shift it already computes.
- Act 3's own two day-boundary checkpoints were vacuous on the first run
  (fixed absolute tick targets already passed by the time setup finished) —
  found, reported and fixed in this file (targets are now computed relative
  to the tick setup actually finishes at).
- Act 4's `RemoveObject` row targeted a hard-coded tile that
  `buildResilientCell`'s own minimap tile-shift had already moved the cell's
  beds off of, so it exercised a refusal rather than the removal success
  path — found and reported rather than silently re-targeted, since the same
  tick-unchanged/immediate-publish pattern the row was checking for was
  already confirmed by the other five gestures in the same sweep.
