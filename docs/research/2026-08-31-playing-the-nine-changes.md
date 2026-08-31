# Playtest: nine changes landed overnight — does the escape sentence reach a pixel, is a weapon anything the player can see, and does the Rooms tool read as friction?

**Date:** 2026-08-31
**Branch played:** `agent/playtest-2026-08-31`, cut from `main` at **v0.0.273**
(`6b5dc8d`), which is the release commit carrying
[#685](https://github.com/matmaxalez/lockstate/pull/685),
[#690](https://github.com/matmaxalez/lockstate/pull/690),
[#640](https://github.com/matmaxalez/lockstate/pull/640) /
[#693](https://github.com/matmaxalez/lockstate/pull/693),
[#650](https://github.com/matmaxalez/lockstate/pull/650),
[#691](https://github.com/matmaxalez/lockstate/pull/691),
[#681](https://github.com/matmaxalez/lockstate/pull/681) and
[#694](https://github.com/matmaxalez/lockstate/pull/694). The branch adds one
file under `tests/browser/` and changes nothing under `src/`.

**`main` moved once underneath this pass and it does not touch anything here.**
By the time the runs finished, `main` was **v0.0.274**, and
`git diff --stat 6b5dc8d..origin/main -- src/` is two files, both under
`src/services/localization/` — a new chunked catalogue loader and a one-line
export beside it. Neither is named by a rooted path here, because neither exists
in the tree this record was written in. No finding below rests on either.

**Reproduction:** `tests/browser/playtest-2026-08-31.playtest.ts`, run with

```
LOCKSTATE_BROWSER_TEST_PORT=5199 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-08-31.playtest.ts -g "act 1"
```

Nothing in CI collects `.playtest.ts`. Viewport 1440x900, real Chromium, mouse
gestures only, driving `index.html` + `src/main.ts` through a `Worker` tee.

**LFS.** `git lfs checkout` was run in the worktree first — 62 objects, 93 MB —
and confirmed with `file public/assets/actors/actor.guard.base.idle.png`
returning `PNG image data, 260 x 3104` rather than `ASCII text`.
`docs/AGENT_WORKFLOW.md` records a playtest that ran green with no actor sprites
at all, which is why this is checked rather than assumed. **No claim here is
about rendering the world**; every claim is about HUD text, a DOM box, a tick or
a treasury value.

**The brief, in the owner's own words:** *"znajdź bugi i błędy grając, bo ja nie
mogłem postawić więzienia itp grając sam"* — find defects **by playing** — under
the standing directive *"gra ma być łatwa przyjazna do grania, a nie jakieś
ukryte funkcje"*.

## Runs

| run | act | result | what it added, or what it cost |
| --- | --- | --- | --- |
| act1 (first) | 1 | abandoned | hung on `click()` of a `Cancel` that is in the DOM and has no box — **that hang is finding 1** |
| act1c | 1 | `1 failed (1.7m)` | the same hang with a 20 s cap, which produced the timeout log quoted in §1c |
| **act1d** | 1 | **`1 passed (8.3m)`** | the whole money route, the hire control, and the band's first painted sentence |
| act2a | 2 | `1 failed (3.8m)` | five cells in a terrace: two designated, one refused on my wall geometry, the fourth's drag lost under the rail — **that loss is §8** |
| **act2b** | 2 | **`1 passed (3.6m)`** | four disjoint enclosed rooms, four presses each, every field identical |
| act3a | 3 | killed at 2 min | killed deliberately: the instrument was wrong, and §2c is why it mattered |
| **act3b** | 3 | **`1 passed (21.8m)`** | tick 100,404, three escapes, the write log and the frame log |
| **act4a** | 4 | **`1 passed (22.5s)`** | where the world is at 1440x900, asked of `elementFromPoint` |
| **act5a** | 5 | **`1 passed (47.5s)`** | #685, and the refused *Admit* in §12a |

**Contention, sampled rather than assumed.** A sampler wrote
`ps -eo args | grep -c "[p]laywright/test/cli"` and the load average every 60 s
for the whole session. What was on the machine:

- **Another agent's `vitest` processes were on the machine for the whole
  session**, sampled every 60 s: `vitest=3` at the quietest and `vitest=9` at
  the busiest, never zero. The one-minute load average on 4 cores ran 2.25 →
  **9.89**, peaking at 07:20 in the middle of act3b's escape window.
- Another agent's `app-shell.spec.ts -g "what a zoned room is missing"` run was
  live for part of it, twice.
- **This pass ran up to three of its own Playwright runs at once** — act3b on
  port 5201 for its whole 21.8 minutes, with act2b (5202), act4a (5203) and
  act5a (5204) overlapping it. All four are mine and all four are named here.

**What the contention did to act 3, measured rather than assumed, and the answer
is nothing.** The escape sentence's own write timestamps give the rate for free,
because each is paired with a tick: the first escape wrote at page t=655,850 ms
on tick 48,611 and the third at t=955,858 ms on tick 72,611. That is **24,000
ticks in 300,008 ms — 79.998 ticks per wall second**, against the ×4 ideal of
exactly 80 — measured across the window that contains all three escapes, on a
machine whose load average was between 3.9 and 9.9 throughout it. **A ×4 clock
under load 9.9 lost 0.003% of its ticks**, which is a useful number in its own
right and is the second time this repository has measured contention costing a
playtest nothing (`2026-08-30-playing-main-after-fifteen-changes.md` measured
80.005 against 79.991).

And the figure the finding actually turns on is a *difference* inside one frame
budget: the escape write and the all-clear write are **1 ms, 0 ms and 0 ms**
apart. No amount of scheduler pressure closes a gap that is already zero, and
pressure would if anything *widen* it — so contention can only have made this
pass's result more conservative, never less.

**So no wall-clock duration below is load-bearing.** Every figure this record
rests on is a tick, a treasury value, a press count, a DOM box in CSS pixels or
panel text — all of which come from the simulation or the layout and not from
the scheduler. Where a duration in milliseconds is quoted it is labelled and is
part of a *comparison between two events in the same run*, never an absolute.

**One thing this pass broke, and it was another agent's.** Clearing a stale Vite
server, it ran `pkill -f "vite/bin/vite"`, which matched a second agent's dev
server on port 5188 and killed it while that agent's `app-shell.spec.ts` run was
live. That run will have failed with its web server gone. Recorded because a
failure in someone else's log with no cause in their diff is exactly the kind of
thing `docs/AGENT_WORKFLOW.md` says costs hours, and because the fix is one
line: kill by PID, never by pattern, on a shared box.

## Claim tiers

- **MEASURED** — this pass ran it and the output is quoted verbatim.
- **VERIFIED, read** — a file was opened at the line cited and quoted.
- **REASONED** — follows from two MEASURED or VERIFIED facts, and says so.
- **UNKNOWN** — could not be established, and named as such.

---

# Part A — what the player meets, in the order they meet it

## 1. The whole money route works, and the one control it needs has no box

**This is the finding of the pass, and it is a consequence of two changes that
are each correct on their own.**

### 1a. A wall buys itself, and the arithmetic is legible

**MEASURED**, act1d, a fresh prison, the Buy fold never opened, four wall runs
dragged around tiles (12,12)–(17,17):

```
[act1] treasury before any order: 25000
[act1] after the north run: treasury=24520 queue="QUEUED\n6 waiting · 0 being built"
[act1] after the south run: treasury=24040 queue="QUEUED\n12 waiting · 0 being built"
[act1] after the west  run: treasury=23560 queue="QUEUED\n18 waiting · 0 being built"
[act1] after the east  run: treasury=23080 queue="QUEUED\n24 waiting · 0 being built"
```

480 per six-segment run, 80 per segment, 24 segments for 1,920 — with **no
procurement press at any point**. #640 does what it says.

### 1b. The report of that spending is painted into a 0x0 box

**MEASURED**, the same run, from a sampler inside the page that records every
change of the `.hud-build__deliveries` block:

```
{"t":98538,"blockHidden":"false","pending":"24",
 "header":"On the way24 bought · 1,920 back if cancelled",
 "rows":["2 × Brick · 80 backCancel","2 × Brick · 80 backCancel","2 × Brick · 80 backCancel"],
 "visibleRows":3,"width":0,"height":0}
```

and, probed directly:

```
[act1] the first delivery row and the fold above it:
       {"rowHidden":"false","rowBox":"0x0","buyRowHidden":"true","buyRowDisplay":"none"}
[act1] is the first Cancel visible to a player? false
```

Every internal signal says this block is on screen. It is **not** `hidden`, it
carries `data-pending="24"`, three rows are filled with correct text, and the
header quotes the correct refundable total. It occupies **zero pixels**, because
its ancestor does not.

**VERIFIED, read** — `src/ui/hud/build-panel.ts:1293`, `:1308` and `:1311`:
`deliveriesBlock` is the last child of `buyRow`, and the statement after that
element is `buyRow.hidden = true`.
**VERIFIED, read** — `src/ui/hud/build-panel.ts:1430`: `paintDeliveries` sets
`row.element.hidden = false` on every row it fills, which is why
`:not([hidden])` matches a row nobody can see.

**This half is not new.**
[`2026-08-30-a-wall-that-buys-itself.md`](./2026-08-30-a-wall-that-buys-itself.md)
§2b established it and stated it well: *"The purchase the game makes on the
player's behalf is announced only inside the procurement fold — the exact fold
#627 exists so that the player never has to find."* This pass reproduces it at a
different viewport with a different instrument, and adds the box measurement
(`0x0`, `display: none` on the ancestor) rather than only the `not laid out`
verdict.

### 1c. What is new: the control #693 just fixed is in there too

#693's subject is a **cancellation**: *"Cancelling a `jit:` delivery now
withdraws queued build orders until the prison no longer has to buy the material
back."* The only producer of that command in the interface is the `Cancel` button
on a delivery row — which §1b just measured at `0x0`.

**MEASURED**, the cost of that, as a hang. The first run of act 1 called
`click()` on a row matched by `:not([hidden])` and never returned; act1c capped
it at 20 s and produced the log:

```
TimeoutError: locator.click: Timeout 20000ms exceeded.
  - locator resolved to <button type="button" class="ui-action" aria-busy="false"
      data-tone="default" aria-label="Cancel: 2 × Brick · 80 back">…</button>
  - attempting click action
    2 × waiting for element to be visible, enabled and stable
      - element is not visible
```

**And with the fold opened by hand, everything #693 promises happens.**
MEASURED, act1d:

```
[act1] NOTHING TO CANCEL with the fold shut. Opening .hud-build__buy-toggle …
[act1] deliveries after opening the Buy fold: "ON THE WAY\n24 bought · 1,920 back if cancelled\n2 × Brick · 80 back\nCancel\n…\nand 21 more on the way — these arrive first, and the rest come into view as they land."
[act1] Cancel controls with a box, fold open: 3
[act1] cancelling from inside the fold. row says "2 × Brick · 80 back | Cancel" | treasury 23080 | queue "QUEUED\n24 waiting · 0 being built"
[act1] treasury right after Cancel = 23160 (delta 80)
[act1] queue right after Cancel: "QUEUED\n23 waiting · 0 being built"
```

The refund is exactly the 80 the row promised, **and the queue went from 24
waiting to 23** — the withdrawal #693 landed, seen from the chair. Then Play:

```
[act1] clock: {"mode":"running","speed":4}
[act1] t+5000ms  into Play: treasury=23160 queue="QUEUED\n14 waiting · 1 being built"
[act1] t+10000ms into Play: treasury=23160 queue=".hud-build__queue: not laid out"
[act1] t+15000ms into Play: treasury=23160 queue=".hud-build__queue: not laid out"
```

**The 80 stayed refunded across Play and past the procurement pass**, which is
the exact defect #687 described and #693 fixed. `0 taken back out`, measured
from the interface rather than from a test double.

**So the statement, with the cause and the cost kept separate.**

- **Observation.** #640 spends the player's money at the press, #693 makes the
  refund survive, and both the report of the spending and the only control that
  reverses it live inside a disclosure that starts shut and that #640 exists so
  the player never has to open. The control measures `0x0` and twenty seconds of
  actionability polling.
- **What would establish the cause**: nothing further — it is read, at
  `build-panel.ts:1293-1311`, and the DOM box agrees.
- **What would establish the impact**: a decision about where a spend the game
  makes on the player's behalf should be reported. That is copy and layout, so
  it is the owner's, and #636 already lists this surface under "copy owed to the
  owner". **Not filed here as a defect.** What this pass adds is that the
  question is no longer only about a *report*; it is about a *control*.

### 1d. Re-dragging a wall run over finished walls says an order exists

**MEASURED**, act1d, after the perimeter was built and one order had been
withdrawn by the cancellation, re-dragging all four runs:

```
[act1] north(again): treasury=23160 refusal="The build order failed — that order already exists."
[act1] south(again): treasury=23160 refusal="The build order failed — that order already exists."
[act1] west(again):  treasury=23160 refusal="The build order failed — that order already exists."
[act1] east(again):  treasury=23080 queue="QUEUED\n1 waiting · 0 being built" refusal="The build order failed — that order already exists."
```

The last line is the coherent part and it is worth saying plainly: the one
segment the cancellation withdrew was re-orderable, and it cost **80 again**, so
cancel-then-rebuild is money-neutral end to end.

The wording is the observation. `hud.alert.refusal.build.duplicate-order`
(`src/content/default-locale-en.ts:250`) is *"The build order failed — that
order already exists."* — and what actually exists on those tiles is a **wall**.
A player who has watched the wall go up is told an *order* is in the way. The
locale comment beside it explains the phrase as transcribed from
`place-object.duplicate-order` for *"the identical fact"*, which it is at the
command layer and is not from the chair.

- **Observation.** For the ordinary gesture of dragging over work already done,
  the sentence names the wrong object.
- **What would establish the impact**: whether players re-drag. This pass did it
  because the cancellation had left a hole; **UNKNOWN** how common that is.
- No new wording is proposed here: a replacement sentence is copy.

## 2. The escape sentence: it exists, it fires, and the all-clear lands on the same tick

**This is what act 3 was built for, and the answer needed an instrument that no
CI assertion has.**

### 2a. A neglected prison really does lose somebody, and the route is the one #681 opened

**MEASURED**, act3b: one 6x6 cell with **two** beds for **fourteen** prisoners
and **zero** guards, run at ×4 from tick 360. The status strip states the
neglect plainly and continuously:

```
| 14 | PRISONERS | 12 with no bed | 0 | STAFF | 0 | COVERAGE | 0 understaffed · 14 unguarded | 1 | ROOMS | …
```

Every event the prison produced, in order, from the worker tee:

```
assault-opened            5601   all-clear   6211
riot-opened               8501   all-clear   9111
riot-opened              13301   all-clear  13911
riot-opened              18101   all-clear  18711
riot-opened              22901   all-clear  23511
riot-opened              27701   all-clear  28311
riot-opened              32501   all-clear  33111
riot-opened              37301   all-clear  37911
riot-opened              42101   all-clear  42711
prisoners.discharged     43621
prisoners.discharged     44201
riot-opened              46901   all-clear  47511
incidents.escape-attempt-opened   48001
incidents.escape-succeeded        48611
incidents.all-clear               48611
```

A riot every **4,800 ticks** exactly, each lapsing **610 ticks** after it opens
because nobody comes. And then, at tick 48,832:

```
[act3] tick=48832 prisoners=11 highRisk=11 residents=2 staff=0 treasury=29620
```

**`highRisk=11` of 11**, having been `highRisk=0` for the previous twenty in-game
days. That is `ClassificationReviewSystem` firing at tick **47,999** — its
schedule is `intervalTicks: 24_000, phaseTicks: 23_999`
(`src/simulation/prisoners/classification-review-system.ts:255`) and every
prisoner classified before tick 23,999 was eligible for the first time — and
raising the whole population into tier 3 off nine lapsed riots' worth of
disciplinary findings.

**So the chain #681 built is real and a player can walk into it by neglect**:
overcrowd, hire nobody, let riots lapse, and at the second review boundary the
prison is told its whole population is high risk. Two ticks of game time later
the first escape attempt opens, and 610 ticks after that somebody is gone. This
is the first record of an escape reached by *playing* rather than by a fixture.

**And it happens three times, on a clock.** The run's complete escape record:

| attempt opened | succeeded | all-clear |
| --- | --- | --- |
| 48,001 | 48,611 | 48,611 |
| 60,001 | 60,611 | 60,611 |
| 72,001 | 72,611 | 72,611 |

**Exactly 12,000 ticks apart**, which is
`DEFAULT_SECTOR_QUIET_TICKS_AFTER_ESCAPE_ATTEMPT`
(`src/simulation/incidents/trigger-system.ts:123`) — the trigger system's own
cooldown — and **610 ticks from opening to gone** every time, which is the
response deadline running out with nobody to answer it. So a neglected prison
loses one prisoner every five in-game days, indefinitely; the population fell
from fourteen to six over the run, between escapes and served sentences.

**In all three, the escape and the all-clear carry the same tick.** That is not
one run's coincidence; it is what §2b shows the code doing.

### 2b. The escape and the all-clear are recorded on the same tick, and the band holds one sentence

**MEASURED**, from the list above: `incidents.escape-succeeded` and
`incidents.all-clear` both carry **tick 48611**.

**VERIFIED, read**, and this was predicted from the code before the run
confirmed it:

- `src/simulation/incidents/response-system.ts:620` — `lapse` records the escape
  inside the `if (outcome.escaped)` loop.
- `src/simulation/incidents/response-system.ts:625` — the next statement is
  `this.reportAllClearIfCalm(tick)`, and `:240-243` shows it fires whenever
  `openIncidentCount === 0`. The escape's own lapse is what makes the prison
  calm, so it *always* fires straight after the last open incident lapses.
- `src/simulation/worker/state-machine.ts:701-723` — `publishEvents` posts one
  `simulation/event` per event in a single loop.
- `src/ui/simulation-events.ts:356` — `hudEventNoticeFromWorkerMessage`, whose
  docblock is explicit: *"**The newest event is the one on the line.** … Nothing
  is stacked and nothing comes back: an event pushed off the line is still in the
  log."*

**And the log the player can read is behind a fold that starts shut.**
**VERIFIED, read** — `src/ui/hud/hud-state.ts:53`: `collapsedPanels: ['alerts']`,
and the alerts list is a `ui-section` inside the minimap panel
(`src/ui/hud/hud.ts:1253-1283`).

**MEASURED**, the test process's own poll right after the escape, one tick-loop
later:

```
[act3]   band now: "The prison is under control again — no incident is still open."
```

### 2c. The answer: written three times, painted zero times

**MEASURED**, act3b, `1 passed (21.8m)`, tick 100,404, three escapes.

**The `MutationObserver` saw the sentence every time, correct in every
particular** — 14,875 writes recorded, and these are the three that matter with
their immediate neighbours:

```
{"t": 655697, "text": "A prisoner is trying to break out.",                             "severity": "danger", "hidden": "false"}
{"t": 655850, "text": "Delia Cabrera broke out — no guard reached them in time.",       "severity": "danger", "hidden": "false"}
{"t": 655851, "text": "The prison is under control again — no incident is still open.", "severity": "info",   "hidden": "false"}

{"t": 805865, "text": "A prisoner is trying to break out.",                             "severity": "danger", "hidden": "false"}
{"t": 805867, "text": "Ursula Sandoval broke out — no guard reached them in time.",     "severity": "danger", "hidden": "false"}
{"t": 805867, "text": "The prison is under control again — no incident is still open.", "severity": "info",   "hidden": "false"}

{"t": 955857, "text": "A prisoner is trying to break out.",                             "severity": "danger", "hidden": "false"}
{"t": 955858, "text": "Ewan Abara broke out — no guard reached them in time.",         "severity": "danger", "hidden": "false"}
{"t": 955858, "text": "The prison is under control again — no incident is still open.", "severity": "info",   "hidden": "false"}
```

The sentence renders. It names somebody. `data-severity` is `danger`. `hidden`
is `false`. **It stands for 1 ms, then 0 ms, then 0 ms** before the all-clear
takes the line.

**The `requestAnimationFrame` log — every distinct text the browser actually
produced a frame for, across 21.8 minutes — has 52 entries and the escape
sentence is not one of them.** What the frames show at each escape:

```
{"t": 648209, "text": "A prisoner is trying to break out.",                             "severity": "danger"}
{"t": 655852, "text": "The prison is under control again — no incident is still open.", "severity": "info"}
{"t": 798224, "text": "A prisoner is trying to break out.",                             "severity": "danger"}
{"t": 805868, "text": "The prison is under control again — no incident is still open.", "severity": "info"}
{"t": 948248, "text": "A prisoner is trying to break out.",                             "severity": "danger"}
{"t": 955859, "text": "The prison is under control again — no incident is still open.", "severity": "info"}
```

`grep` over the frame log for `broke out` returns the riot sentence (*"A riot has
broken out"*) and nothing else. The 100 ms poll's 52 samples do not contain it
either, exactly as §7 predicted before the run.

**So the statement, and the cause and the impact separately.**

> **Observation.** `{name} broke out — no guard reached them in time.` is
> produced, correct, named, `danger`-banded and unhidden, and in three escapes
> across 21.8 real minutes of play it reached **zero frames**. What the player
> sees at an escape is *"A prisoner is trying to break out."* for **7.6
> seconds**, and then *"The prison is under control again — no incident is still
> open."*

- **What establishes the cause**, and it is read rather than inferred: the two
  events share a tick (§2b, and measured three times), `publishEvents` posts them
  back to back in one worker task
  (`src/simulation/worker/state-machine.ts:701-723`), and the band keeps only the
  newest (`src/ui/simulation-events.ts:356`). Two DOM writes inside one frame
  budget produce one paint, and it is the second one.
- **What establishes the impact.** The sequence a player reads — a danger
  sentence about an *attempt*, then an all-clear — is *"the attempt was
  contained"*. It was not; somebody is gone and the population count drops. That
  is the exact reading issue #683 was filed against and that #691 was written to
  end: the escape's own research record says the all-clear *"is also what stops a
  `'danger'` band standing over a calm prison for the rest of a session"*, and
  here it stops the danger band before it exists.
- **And the log is not the fallback it is described as.** `simulation-events.ts`
  says *"an event pushed off the line is still in the log"*. MEASURED, the alerts
  fold opened by hand at the end of the run:

  ```
  [act3] alerts section data-collapsed on arrival = true
  [act3] alerts list while folded: ".hud-alerts__list: not laid out"
  [act3] alerts list after opening it: ["A riot has broken out — 6 prisoners have
    stopped taking orders.","Critical","The prison is under control again — no
    incident is still open.","Info", … four such pairs … ,"Nothing was removed —
    there is no object on that tile, and none being built there.","Warning"]
  ```

  Eight rows, four riot/all-clear pairs and the stale removal refusal. **No
  escape row survived.** `MAX_EVENT_ALERT_ROWS` is 8
  (`src/ui/simulation-events.ts`), the last escape was at tick 72,611, and the
  four riots between then and tick 100,404 filled the cap. So a player who
  notices the population fall and goes looking finds nothing about it — twelve
  in-game days later.

**This is the one finding in this record that is a straightforward miss rather
than a product question**, and it is worth saying why it slipped: it is not
reachable by any assertion. #691's own author noted the sentence had not been
seen painted and left it to CI, and CI cannot see this — a test that reads the
DOM after the event sees the all-clear and passes; a test that reads it *during*
would have to know to look between two message tasks. The instrument that finds
it is a frame log, and nothing in the repository had one.

**What would change my mind**: a frame log at a different speed. All three
escapes here were at ×4. At ×1 the two events are still the same *tick*, so the
arithmetic does not change — but that is a prediction, not a measurement, and
this pass did not take it.

### 2d. A weapon: nothing, in the prison where weapons exist

**The brief asked what the player sees when a weapon becomes reachable. In the
prison that produces weapons, the answer is a zero.**

**MEASURED**, act3b's status strip on the day of the escape, and every reading
before it:

```
| 11 | PRISONERS | 9 with no bed | 0 | STAFF | 0 | COVERAGE | 0 understaffed · 11 unguarded
| 1 | ROOMS | 0 | INCIDENTS | Clear | 0 | CONTRABAND | 29,620 | FUNDS | …
```

`0 CONTRABAND`, in a prison where eleven prisoners had just been raised into tier
3 — the step that draws contraband under [ADR 0080](../adr/0080-when-the-prison-asks-what-a-prisoner-is-carrying.md)
— and where an escape then succeeded, which `canAttemptEscape`
(`src/simulation/incidents/flashpoint.ts`) gates on `contrabandSeverity > 0`. So
something was being carried, by the escape's own precondition, and the only
contraband surface in the game read `0`.

**MEASURED**, act1d's strip, the well-run prison with four guards, for contrast:

```
| 10 | PRISONERS | 4 with no bed | 4 | STAFF | 10 | COVERAGE | Covered
| 1 | ROOMS | 0 | INCIDENTS | Clear | 1 | CONTRABAND | 25,310 | FUNDS | …
```

`1 CONTRABAND` — a search found something in the prison with guards, and
`highRisk` was `0` there throughout, so that item came in at intake and was not
a weapon (only tier 3 draws one).

**VERIFIED, read**, why the two runs differ:

- `src/simulation/presentation/status-strip-projection.ts:552` —
  `contrabandDiscovered: source.searchSystem?.getMetrics().itemsDiscovered ?? 0`.
  The strip counts items **discovered**, never items held.
- `src/simulation/contraband/sector-search-duty.ts:124-126` — a sweep is ordered
  only if the sector has an assigned guard **and**
  `claimableGuardIds(this.guards).length >= policy.requiredGuardCount`. Its own
  docblock says it: *"a spare guard walks them."*

So the two facts compose into one sentence, and it is a statement about the game
rather than about a bug:

> **The prison that manufactures weapons is, by construction, the prison with no
> spare guard to find them.** Tier 3 is reached by neglect; discovery needs
> slack. A player who under-guards gets the weapon and never hears about it —
> the first they know is a prisoner missing.

- **What would establish the impact**: a product decision about whether an
  undiscovered weapon should be visible at all. There is a real argument that it
  should not — a prison that has not searched has not found anything, and saying
  otherwise would be the player knowing something the prison does not. **This is
  not filed as a defect** for exactly that reason.
- **What is a gap regardless of that argument**: even when a search *does* find
  something, the strip shows a **bare count with no name**. `contraband.weapon.name`
  ('Weapon'), `contraband.drug.name`, `contraband.phone.name`,
  `contraband.currency.name` and `contraband.tool.name` are all authored
  (`src/content/default-locale-en.ts:127-131`), and
  `grep -rn "contraband\.weapon\.name" src/ui/` returns nothing. So a found
  weapon and a found phone render identically: `1`. **After #681 that is the
  difference between "somebody had a mobile" and "somebody is armed"**, and it is
  the first change that makes the distinction reachable.
- **Not filed, and it is the owner's**: the fix is either a ninth strip item or a
  panel, both layout and copy.

> **Corrected 2026-08-31, and both directions are marked rather than
> overwritten.** The owner ruled on this row the same day — ruling 3 on #703,
> *"The message names what contraband was found."* Three sentences above are
> worth going through one at a time, because only one of them is simply false
> and the other two fail in more interesting ways:
>
> - ***"`grep -rn "contraband\.weapon\.name" src/ui/` returns nothing"* is
>   still true, and it was the wrong grep — that is the sharper correction.**
>   The keys now have a reader: `src/ui/hud/projection.ts` paints
>   `HudCountsViewModel.contrabandNameKey` as the contraband chip's badge, the
>   same shape #506 finding 2 gave the incidents chip. The *literal* is
>   deliberately still absent from `src/ui/`, because the HUD may not
>   hand-write a content key — the key arrives from
>   `ContrabandCategoryDefinition.nameKey` through the projection, exactly as
>   `roomNameKey` reaches the roster panel. So a grep for the literal cannot
>   distinguish "no reader" from "correctly plumbed", and the grep that answers
>   the question is `grep -rn "contrabandNameKey" src/ui/`. **The evidence in
>   this row was sound about the gap and would have gone on reading as a gap
>   after it was closed**, which is the durable lesson here.
> - ***"a found weapon and a found phone render identically: `1`"* is false for
>   a prison whose finds are all one category, and still true for a mixed
>   haul.** A badge qualifies the whole count, so naming a category the count
>   is only partly made of would be a false statement about the prison; the
>   projection withholds the name instead. Measured over thirteen seeds of a
>   played prison at sixteen in-game days: **seven name a category and six are
>   mixed** (`tests/integration/contraband-search-duty.test.ts` carries the
>   table).
> - ***"the fix is either a ninth strip item or a panel, both layout and copy"*
>   survives as the statement about the remaining half**, and the estimate of
>   what it needs was right. Naming *each* of several finds requires a
>   per-discovery message, that message requires a sentence joining a name to
>   what happened, no such sentence is authored, and a sentence is the owner's
>   (`AGENTS.md`, the fourth exclusion). The half that needed no sentence is
>   shipped; the half that needs one is proposed, not written.

### 2e. What the same mechanism gives the player when the two events are 70 ticks apart

**MEASURED**, §6: assault-opened at 29,151, all-clear at 29,221, and the opening
sentence held the band for **744 ms** at ×4. The escape pair is **zero** ticks
apart.

## 3. #690 measured: four presses per room, uniform, and nothing swallowed

**This is the measurement #690 asked for by name.** Its own weakest claim was
that standing the tool down is the right trade, and that *"it costs one press per
extra room, paid by the player who already knew the tool stayed armed"* might
read as friction rather than as confirmation.

**MEASURED**, act2b, `1 passed (3.6m)`: a 2x2 grid of four 3x3 cells inside a
48-segment wall grid, all four clear of the rails, designated one after another:

```
[act2] cell 1: 4 press(es) + 1 drag in 11907ms -> rooms=1 | Confirm visible=true
  | fold on arrival=false mid-drag={"collapsed":"true","armBox":"0x0"}
  | after drag={"collapsed":"false","confirmBox":"147x44","confirmHidden":"false"}
  | arm "Draw on map data-armed=false" -> "Stop drawing data-armed=true"
  -> after confirm data-armed=false
[act2] cell 2: 4 press(es) + 1 drag in 11626ms -> rooms=2   … identical fields
[act2] cell 3: 4 press(es) + 1 drag in 11462ms -> rooms=3   … identical fields
[act2] cell 4: 4 press(es) + 1 drag in 11927ms -> rooms=4   … identical fields
[act2] four designations later: rooms=4 roomCapacity=0 treasury=21160
```

Every field is identical across all four rooms. Read as a verdict on #690:

1. **Four presses and one drag, every time**: the tab, the room type, *Draw on
   map*, *Designate*. No press was ever swallowed, which is precisely the
   failure #684 describes — the old behaviour's second press sent
   `armed: false` and the next drag did nothing.
2. **The arm control tells the truth at every step and always has a box when it
   is the thing to press.** `Draw on map / data-armed=false` before,
   `Stop drawing / data-armed=true` after, and `data-armed=false` again after
   the confirm. The panel comes back reading what the player is about to press
   next, which is exactly what `standDownAfterConfirm`'s docblock promises.
3. **The fold behaves as claimed and the arm control's disappearance is real.**
   `mid-drag={"collapsed":"true","armBox":"0x0"}` — while the rectangle is being
   dragged the panel is folded to its header and the arm control has no box at
   all. That is the state #684 was about; the difference #690 makes is that the
   state the player comes back to is *disarmed*, so the control they find is the
   one they want.

**The judgement the brief asked for, stated as a judgement.** Four presses for a
room, with the fourth being a *Designate* the player is looking at, reads as
confirmation and not as friction. Two things make it so, and both are
measurements above rather than taste: the count is **uniform** — a player who
does it once has learned it for every room — and the panel's state on return is
never the state they left it in mid-gesture, so there is no press that does
nothing. The old three-press loop was cheaper only for a player who already knew
an invisible fact.

**What would change my mind**: a room count high enough that the fourth press
compounds. This pass did four. At forty, "one extra press per room" is forty
extra presses and the arithmetic starts to matter; **UNKNOWN**, and it is
measurable by extending act 2.

### 3a. The Rooms panel's enclosure verdict disagreed with the outcome, in both directions

**MEASURED.** The panel text read immediately after the drag and before the
confirm, beside what the confirm then did:

| designation | panel said | outcome |
| --- | --- | --- |
| act2b cell 1 | `OPEN ON AT LEAST ONE SIDE` | **accepted**, `rooms=1` |
| act2a cell 3 | `OPEN ON AT LEAST ONE SIDE` | refused: *"this room type must be enclosed, and the area you drew is open on at least one side"* |

So at the moment the player is looking at the *Designate* button, the verdict
beside it is not a reliable predictor of what pressing it will do. It was wrong
about an enclosed rectangle and right about an open one, in two runs.

- **Observation.** The live verdict and the command's answer are computed from
  different reads of the world.
- **What would establish the cause**: this is the shape
  [`2026-08-29-playtest-ordering-and-the-second-room.md`](./2026-08-29-playtest-ordering-and-the-second-room.md)
  §7 already recorded — *"the Rooms panel's enclosure verdict is read off a world
  view a snapshot replaces and a completed wall does not mark dirty"* — and
  `playtest-harness.ts`'s `buildAndPopulate` still carries a twelve-attempt retry
  loop written for it. **This pass did not re-derive that cause and does not
  claim it.** What it adds is that the verdict is now wrong in the *permissive*
  direction too, which a retry loop cannot paper over: a retry fixes "it said no
  and meant yes", not "it said no and the room went in anyway".
- **What would establish the impact**: whether a player reads the verdict before
  pressing. Both of this pass's runs pressed regardless, so **UNKNOWN**.

### 3b. Four designated cells report `roomCapacity=0`, and the panel says why

`rooms=4 roomCapacity=0`, and the Rooms panel closes with:

```
"NOT READY","4 of 4","Cell at 12, 12 is missing","1 × Bed","1 × Toilet",…
```

Four rooms, none of them usable, and the panel names the missing objects per
room with a count of how many rooms are in that state. **No finding** — this is
the surface working. Recorded because "I designated four cells and the prison
still holds nobody" is the next thing an ambitious player asks, and the answer is
on screen.

## 4. #650's hire control is right, laid out, and reads plainly

**MEASURED**, act1d, the Security tab of a prison with one furnished cell, at
1440x900, with nothing folded by hand:

```
[act1] hire control reads: "Hire Guard · 80"
[act1] staff panel text: ["STAFF","GUARD COVERAGE","0 of 0","Covered",
  "This prison has the guards it asks for.","WHO TO HIRE","Guard","Selected",
  "Hire Guard · 80","Costs 80 now and 80 a day in wages.",
  "A new guard starts unassigned.","ON DUTY","0 held · 0 free",
  "Nobody is assigned right now.",
  "A released guard stays hired and goes back to the pool."]
```

All three of #650's strings are on screen at once, unclipped: the button's own
`Hire Guard · 80`, the owner's approved sentence *"Costs 80 now and 80 a day in
wages."*, and the displaced clause *"A new guard starts unassigned."* restored
as its own line.

And after four presses:

```
[act1] after four hires: staff=4 dailyWageBill=320 treasury=22370
[act1] staff panel after hiring: [… "ON DUTY","0 held · 4 free", …,
  "ON THE PAYROLL","320 a day"]
```

22,690 → 22,370 is 320 taken at the press for four guards, and the payroll badge
reads **"320 a day"** — the word #650's later commit added, so the figure is not
a bare number beside a header that names people. #650's own weakest claim was
that a bare figure there would read as a headcount; it is not bare, and this run
had no trouble with it.

**No finding against #650.** Recorded so it is not re-checked.

## 5. What a well-run prison sees over thirteen in-game days

**MEASURED**, act1d, one 6x6 cell with six beds and a toilet, four guards, ten
admissions, run to tick 30,153 (day 13):

```
[act1] tick=26214 prisoners=10 highRisk=0 residents=6 treasury=22350
[act1] tick=27521 prisoners=10 highRisk=0 residents=6 treasury=23830
[act1] tick=28803 prisoners=10 highRisk=0 residents=6 treasury=25310
[act1] tick=30153 prisoners=10 highRisk=0 residents=6 treasury=25310
```

Three things worth having:

1. **The economy is legible and the prison is solvent.** The balance opens at
   25,000, bottoms at 22,350 having paid for a perimeter, twelve beds, a toilet
   and four guards, and is back above its opening by day 13 — roughly 1,480 per
   in-game day net with ten prisoners and a 320 wage bill.
2. **`highRisk=0` throughout, past the first review boundary.** #681's own
   commit says a well-run prison cannot tell the contraband draw happened, and
   over thirteen days this one could not: no prisoner was raised into tier 3.
3. **`4 with no bed` stood on the status strip for the whole run** and the
   Intake panel said why, unfolded:

```
["INTAKE","Collapse","Admit a prisoner","4 waiting with no bed to sleep in",
 "A prison needs a cell before it can admit anyone. It does not need a free
 bed: an arrival with none waits until a bed is free.","IN INTAKE","4 of 10",
 "4 at Cell Assignment"]
```

Twelve bed *orders* were accepted and the room reported
`roomCapacity=6 accommodationCapacity=6`, so six of the twelve beds are what the
room could hold. The panel tells the player the consequence in one sentence and
does not say the cell is full — **UNKNOWN** whether that matters, and it is not
one of this pass's targets.

## 6. The events band paints, and here is the sentence that proves it

**MEASURED**, act1d, from the in-page sampler, the only two events the well-run
prison produced:

```
[act1] events: [{"sequence":1,"type":"incidents.assault-opened","tick":29151},
                {"sequence":2,"type":"incidents.all-clear","tick":29221}]
[act1] band samples:
 [{"t":2867,   "text":"", "severity":"", "hidden":"true",  "width":0,   "height":0,
   "color":"rgb(134, 178, 207)","background":"rgba(134, 178, 207, 0.14)"},
  {"t":479234, "text":"A fight has broken out between two prisoners.",
   "severity":"warning","hidden":"false","width":1440,"height":32,
   "color":"rgb(232, 180, 99)","background":"rgba(232, 180, 99, 0.14)"},
  {"t":479978, "text":"The prison is under control again — no incident is still open.",
   "severity":"info","hidden":"false","width":1440,"height":32,
   "color":"rgb(134, 178, 207)","background":"rgba(134, 178, 207, 0.14)"}]
```

So at 1440x900 the band is **1440x32**, the `warning` tone resolves to a real
amber (`rgb(232, 180, 99)` on `rgba(232, 180, 99, 0.14)`) distinct from the
`info` blue, and the sentence is full-width and unclipped. Nothing about the band
mechanism is broken.

**And the number that matters for §2: the opening sentence held the line for 744
ms.** The two events are **70 ticks** apart (29,151 → 29,221) and the clock was
at ×4, which is 875 ms of simulated time; the sampler saw 744 ms of it. That is
what the player gets to read when an incident opens and closes 70 ticks apart.

---

# Part B — the surfaces around them, and the changes that need no argument

## 8. Where the world is at 1440x900, asked of the browser

**MEASURED**, act 4, `1 passed (22.5s)`. Every `.ui-panel` box that takes the
pointer, and then a sweep of `document.elementFromPoint` over a 100 px grid,
`.` where a press reaches the world canvas and `#` where it reaches the HUD:

```
--- Build tab showing at 1440x900 ---
  panel: hud-strip   0,0      1440x48  pointer-events=auto
  panel: hud-minimap 12,503   226x316  pointer-events=auto
  panel: hud-build   1164,264 264x555  pointer-events=auto
  y=100 ...........###
  y=200 ...........###
  y=300 ...........###
  y=400 ...........###
  y=500 ...........###
  y=600 ##.........###
  y=700 ##.........###
  y=800 ##.........###

--- Rooms tool armed (the panel folds itself to its header) at 1440x900 ---
  panel: hud-rooms   1164,772 264x47
  y=100 ...........###
  y=200 ...........###
  y=300 ...........###
  y=400 ..............
  y=500 ..............
  y=600 ##............
  y=700 ##............
  y=800 ##.........###
```

Three facts fall out, and the first is act 2's own cause.

1. **With the Build tab showing, no press at x ≥ 1164 reaches the world**, at
   any height. Act 2's fourth designation drew its rectangle from screen
   x=1232: the drag reached `hud-build` and the world never saw it, so no
   rectangle existed and the Confirm stayed hidden. *"The HUD covered it"* was
   the guess; this is the measurement, and it rules out the alternatives
   (unowned land, an off-map tile) because `elementFromPoint` answers the
   browser's own question about which element takes the press.
2. **The press is consumed silently.** No command was submitted and no refusal
   band appeared — correctly, since nothing refused anything. A player dragging
   a wall along the right-hand quarter of the screen gets no wall and no
   sentence. The camera pans, so this is recoverable rather than a lock, and it
   is what a panel over a world always does; it is recorded because it is the
   thing that cost this pass two runs and because nobody had the number.
3. **#690's fold does what its docblock claims, and this is the payoff.** With
   the Rooms tool armed the panel shrinks from `264x555` to `264x47` and the
   whole rail column at y=400..700 becomes world. That is `drawingFolded`
   earning its place, measured at a desktop viewport for the first time — the
   commit's own figure was *"the largest square of bare world … is 16px"* at
   375x812.

**What this does not establish**: whether the same is true at any other
viewport, and whether the top-right band (`###` at y=100..300 with the Rooms
panel folded away) is the host's save panel or something else. **UNKNOWN** —
the sweep names the `.ui-panel` boxes and that band is not one of them.

## 9. One misclick with *Remove* armed leaves a red sentence up for the rest of the session

**MEASURED**, and it turned up as noise in every act before it was recognised as
a finding. `playtest-harness.ts`'s `calibrate` arms *Remove* and presses empty
tiles — which is an ordinary misclick, not a test-only gesture. From that press
onward, in act1d and in both act 2 runs, the refusal band read:

```
[act1]   refusal band: "Nothing was removed — there is no object on that tile, and none being built there."
```

after each of four wall runs, and in act2b it was still the band's text after
**48 wall segments were ordered and built and four rooms were designated and
accepted** — several minutes of successful play under a red sentence about
something that failed once.

**VERIFIED, read** — why, exactly, and the design is per-key rather than
sticky-by-accident:

- `src/simulation/worker/state-machine.ts:559`: `publishStatusCounts` puts
  `this._runtime.refusals.last` on every counts payload.
- `src/simulation/refusals/refusal-log.ts:149`: `supersede(key)` clears the
  standing refusal **only if the key matches**.
- `src/simulation/refusals/refusal-log.ts:538`: a removal's key is the *tile* —
  `remove-object:${x}:${y}`.

So the band clears when a removal on **that same tile** later succeeds, or when
any other refusal replaces it. On a tile the player pressed by mistake and never
returns to, neither happens.

- **Observation.** The band is a "most recent refusal", not a "current problem",
  and at the scale of a play session those differ by minutes.
- **What would establish the cause**: done, above — the key is the tile.
- **What would establish the impact**: whether a player reads a stale red band as
  "something is wrong now". This pass cannot know that, and the sentence itself
  is past-tense and accurate about the press it describes. **UNKNOWN.**
- **Not filed as a defect and no wording proposed.** Two options exist and both
  are the owner's: give the band a lifetime, or key a removal refusal to
  something coarser than a tile. `refusal-log.ts:454` already argues the
  keying direction deliberately — *"does not withdraw a refusal that is still
  true"* — so the narrow key is a decision, not an oversight.

## 10. The only surface that names a risk tier shows four rows of fourteen, in entity order

**MEASURED**, act3b, the Regime tab of a fourteen-prisoner prison:

```
[act3]   regime roster: ["REGIME","Collapse","TODAY'S BLOCKS","General Population",
  "43% THROUGH","Allows Work, Education, Free Association","High Risk","36% THROUGH",
  "Allows Sleep, Meal, Hygiene","PRISONERS","4 of 14","Ewan Abara","Association",
  "Hygiene","Low","Rafal Zielen","Association","Hygiene","Minimal",
  "Bram Lindqvist","Idle","Hunger","Minimal","Nadia Xavier"]
```

**VERIFIED, read**: `src/ui/hud/regime-panel.ts:156` —
`PRISONER_ROSTER_ROW_LIMIT = 4`, and `:546` slices to it. And
`src/simulation/presentation/prisoner-projection.ts:406-420`: the projection
walks the entity store by index and pages by position, with the docblock stating
the rule outright — *"Rows are **not** sortable by an arbitrary column here."*

So the badge that carries a prisoner's tier — the one `describePrisonerRow`
tones `warning` for the high-risk group — is shown for the first four prisoners
by entity index, and the panel says `4 of 14`.

- **Observation.** #681 makes tier 3 reachable by review, and the tier is the
  gate on both a weapon and an escape. The player's only per-prisoner view of
  that tier is four rows in arrival order out of a population that this pass ran
  at fourteen.
- **What would establish the cause**: done — the limit is a constant and the
  order is entity index, both read above, and the projection's docblock names
  paging as the intended answer rather than sorting.
- **What the badge does when there *is* a tier-3 prisoner: it says so.**
  MEASURED, act3b's last roster read, after the reviews had raised everybody:

  ```
  "PRISONERS","4 of 6","Rafal Zielen","Sleeping","Hygiene","High",
  "Bram Lindqvist","Sleeping","Hygiene","High","Omar Duarte","Idle","Hunger","High",
  "Samir Gruber"
  ```

  Three `High` badges where the same panel read `Low, Minimal, Minimal` twenty
  in-game days earlier. So the surface works; the question is only its size and
  its order.
- **What would establish the impact**: whether a prison ever holds a tier-3
  prisoner *outside* the first four entity indices in ordinary play. This run
  cannot say, because by the time it had tier-3 prisoners it had **six**, and
  four of six is most of them. A population of thirty with one raised prisoner is
  the case that matters and this pass did not reach it. **UNKNOWN.**
- The status strip publishes `prisonersHighRisk` and does **not** show it. The
  strip's eight items are prisoners, staff, coverage, rooms, incidents,
  contraband, funds and earned-today (`src/ui/hud/projection.ts`). So "how many
  of my prisoners are high risk" has a count on the wire and no pixel — the
  shape #629 puts in the same class as a promise the code does not keep. **Not
  filed**: a ninth strip item is layout and copy, which is the owner's.

## 11. #694's negative balance was never approached, in either prison

**MEASURED.** Neither prison this pass built came close to a negative balance,
and the neglected one was the *richer* of the two:

| run | opening | lowest reading | closing reading |
| --- | --- | --- | --- |
| act1d, four guards, ten prisoners | 25,000 | 22,350 (tick ~26,200) | 25,310 (tick 30,153) |
| act3b, no guards, fourteen prisoners | 25,000 | 22,340 (after the build) | 31,780 and rising (tick 63,885) |

The reason is not subtle and is worth stating because it is a *balance* fact
rather than a bug: a prison with **no staff** has no wage bill, and state income
per prisoner-day keeps arriving whatever the prison is like to live in. Act3b
paid 2,660 to build, hired nobody, and then earned about 360 per in-game day
while its population rioted every 4,800 ticks and lost three prisoners to the
outside.

- **So #694's loan surface was not exercised at all**, which matches the brief's
  own note that it is *"not reachable from any player command yet"*. Nothing here
  contradicts that; nothing here confirms it either. **This pass did not reach
  it.**
- **The observation worth passing on**: under-guarding is currently the
  *profitable* strategy on the balance sheet. It costs prisoners, and prisoners
  are the income, so the loss shows up eventually — three of fourteen gone by
  tick 60,611 — but there is no point in the twenty-five in-game days played
  where money pressed on the player at all. Whether that is the intended shape is
  a balance question and **is not this pass's to answer**; ADR 0017 decision 5
  routes magnitudes to [#29](https://github.com/matmaxalez/lockstate/issues/29).

## 12. #685: a tab press before the first *New prison* costs nothing now

**MEASURED**, act5a, three tab presses on a page that has never had a prison:

```
[act5] pressed the build tab before any prison exists:    refusal=".hud__refusal: not laid out" unavailable=".hud__unavailable: not laid out"
[act5] pressed the rooms tab before any prison exists:    refusal=".hud__refusal: not laid out" unavailable=".hud__unavailable: not laid out"
[act5] pressed the security tab before any prison exists: refusal=".hud__refusal: not laid out" unavailable=".hud__unavailable: not laid out"
[act5] strip before New prison: … | 0 | PRISONERS | … | DAY | -- | Through the day | --
```

No band appeared, so there is no false message to read — which is the half of
#685 that was about a sentence. The day readout is `--`, correctly: there is no
prison.

And the prison then works. **MEASURED**, the same run, a wall run dragged after
those three presses:

```
[act5] day readout after New prison: "1"
[act5] one wall run after a pre-boot tab press: treasury 25000 -> 24520 queue="QUEUED\n6 waiting · 0 being built"
```

The worker the tab press used to spend is alive: the order was accepted, priced
and queued. **No finding against #685.**

The admission that followed was refused, correctly, because one wall run is not a
room — and the sentence is a real one rather than a code:

```
HUD action failed {"actionId":"admit-prisoner","error":{"message":
  "This prison has no room to hold a prisoner, so nobody can be admitted into it."}}
```

### 12a. The one thing act 5 turned up on its way past: a refused *Admit* names no cause, and the sentence that would exists

**MEASURED**, act5a. Pressing *Admit a prisoner* in a prison with a wall and no
designated room produced two different messages in two different places:

```
HUD action failed {"actionId":"admit-prisoner","error":{"message":
  "This prison has no room to hold a prisoner, so nobody can be admitted into it."}}   ← console only

[act5] refusal at the end: "Nobody was admitted — the request was refused."           ← the band
[act5] after one Admit: ["INTAKE","Collapse","Admit a prisoner","A prison needs a cell
  before it can admit anyone. It does not need a free bed: an arrival with none waits
  until a bed is free."]                                                              ← the panel's standing hint
```

**VERIFIED, read**, and this is why the two differ rather than one being broken:

- `src/main.ts:2530-2531` — the refusal is a **client-side pre-flight**:
  `if (viewModel.counts.rooms === 0) throw new Error('This prison has no room to
  hold a prisoner, so nobody can be admitted into it.')`. It never reaches the
  worker.
- `src/content/default-locale-en.ts:943` — the band's sentence is
  `hud.refusal.admit-prisoner`, *"Nobody was admitted — the request was
  refused."*, and the family's own comment states the design: *"No sentence here
  names a cause … The cause travels to the host as the thrown `Error`, which is
  English diagnostic text and therefore must not reach the screen."*
- `src/content/default-locale-en.ts:238` — and the sentence that **does** name
  this cause is already authored: `hud.alert.refusal.admit.no-accommodation`,
  *"Nobody was admitted — there is no room to put a prisoner in yet."* It is
  produced only by a **simulation** refusal, which this press never became.

- **Observation.** For the one refusal the main thread diagnoses *itself*, the
  player is told the outcome and not the cause, while a localised sentence naming
  exactly that cause ships in the same file.
- **What would establish the impact**: the Intake panel's standing hint says the
  same thing in advance and is on screen unfolded, so a player who reads the
  panel is not stuck. Whether they read it before pressing is **UNKNOWN**.
- **Not filed as a defect, and no wording proposed.** The generic family exists
  for a stated reason and the fix — routing a *known* pre-flight cause to its
  existing key — is a change to how refusals are reported, which touches copy
  the owner approved.

---

# Part C — this pass's own instrumentation, corrected in the open

## 7. Six things this pass got wrong, each paid for once

**This heading said "Four" for eleven commits and the list had six items by
then**, which is the tally-rot `docs/AGENT_WORKFLOW.md` §4 names — *"a sentence
asserting an absence or a count rots first"*. Corrected rather than overwritten,
because the count was accurate when it was written and adding 7e and 7f never
touched the word.

**7a. `:not([hidden])` is not "visible", and it cost two runs in two different
panels.** `paintDeliveries` sets `row.element.hidden = false`
(`src/ui/hud/build-panel.ts:1430`) and the Rooms panel's Confirm is a *hidden*
but *enabled* button, so both `Locator.count()` on `:not([hidden])` and
`isEnabled()` said yes to a control with no box. Playwright then polled
actionability for twenty seconds saying `element is not visible`. The gate that
answers the player's question is `isVisible()`, and both acts use it now. **This
is worth more than the runs it cost**: the same wrong gate in a `.spec.ts` would
be a test that passes for the wrong reason, and the fact that two unrelated
panels both present this shape is the class rather than the instance.

**7b. `counts.tick` is not the tick.** Act 1 logged `tick=0` three times while
the clock read `{"mode":"running","speed":4}` and the build queue visibly drained
from 24 waiting to empty. That is `playtest-harness.ts`'s documented trap read
from the other end: the worker skips a `simulation/status-counts` publication
whose payload equals the last one, the tick rides the envelope rather than the
counts, and wall construction changes no counts field — so the tick froze at the
last publication while the prison worked. `currentTick` (which reads
`simulation/clock-state`) is the one to use, and the harness says so; act 1's
progress lines quote the counts tick and are labelled here rather than corrected
in the log, because the log is the evidence.

**7c. Five rooms inside one room is four refusals.** Act 1's Rooms measurement
designated the whole enclosed 6x6 as room 1 and then tried to subdivide it, so
`rooms` never left 1. The press counts it produced are still valid — the panel
does the same four presses whether the designation is accepted or refused — but
the *designation* measurement had to be re-run against four disjoint enclosures,
which is act 2.

**7d. `pkill -f "vite/bin/vite"` killed another agent's dev server.** Recorded in
the front matter with the remedy: on a shared box, kill by PID. This one was not
paid for by this pass; it was paid for by somebody else's run.

**7f. The playtest file was committed as a binary blob for eight commits.** The
frame sampler's sentinel was written as `let lastFrameText = ' ';` and a heredoc
turned the space into a literal **NUL byte**, one of them, at offset 7,812.
`git diff` then reported the whole file as `Bin 0 -> 44968 bytes` and showed
none of its 907 lines. It *worked* — a NUL is as good a sentinel as a space —
and it made the only artefact this pass produced under `tests/` unreviewable,
which is the worse half of the trade. It is `string | undefined` now, and the
comment beside it says why.

**7e. The bare-world probe in act 2 was too shallow to answer its own question.**
It walked `.hud > *` and filtered `pointer-events: none`, which returns only
`hud-strip 0,0 1440x48` — the rail *containers* inherit `pointer-events: none`
from `.hud` and the panels inside them re-enable it, so the panels are invisible
to that query. Act 4 asks the browser instead, with `elementFromPoint`.

---

# Part D — what this pass did not reach, and its weakest claim

## 13. Not reached

- **#694's negative balance and its loan.** Never approached; §11 has the
  balances. Both prisons ended richer than they started.
- **A tier-3 prisoner outside the roster's four visible rows.** Reached the
  easier half — §10 now quotes three `High` badges — and not the hard half: act 3
  had six prisoners by the time it had tier-3 ones, so "four of fourteen hides
  the dangerous one" was never actually tested. A larger population would.
- **The Rooms tool at a room count where "one extra press per room" compounds.**
  Four rooms; §3 says what forty would need.
- **Any viewport other than 1440x900.** §8's sweep is one viewport. #690's own
  argument is about 375x812 and this pass did not go there.
- **Reached, and the answer is in §2c**: the alerts fold is not a way back. It
  held eight rows, four riot/all-clear pairs and a stale refusal, and no escape
  row at all. What this pass did *not* try is opening the fold **immediately**
  after an escape, which is the only window in which the row could still be
  there.
- **A save/restore across an escape.** Not attempted.
- **Anything about rendering the world.** LFS content was present, and no claim
  here is about a sprite.

## 14. Weakest claim, and what would change my mind

**The weakest claim in this record is §3's judgement that four presses per room
reads as confirmation rather than friction.** (§2c, the escape sentence, is the
strongest: three escapes, a write log and a frame log, and the sentence in one
and not the other.) Everything else here is a tick, a
box, a string or a treasury value; that one is a reading of an experience, taken
by an agent driving a mouse through a script, which is exactly the population
whose judgement about friction is least like a player's. The count is solid — 4,
uniform, five times in act 1 and four in act 2 — and the inference from the count
is not.

**What would change my mind**: a session that designates ten or more rooms in
one sitting and shows the fourth press being made *before* the panel has
finished repainting, or the owner saying it feels like a nag. The measurement is
cheap: extend act 2's `cells` array.

**The second-weakest is §1c's framing** — that the delivery `Cancel` being inside
the Buy fold matters. The box is `0x0` and that is measured, but a player who
never cancels anything never needs the control, and #640's whole point is that
they never need the fold either. What would change my mind in the other
direction: a session that spends into ADR 0075's lock and needs the refund to get
out — which
[`2026-08-30-playing-into-the-lock.md`](./2026-08-30-playing-into-the-lock.md)
has already played, and which is the reason this is reported at all.

---

# Part E — what is owed to the owner, as five yes/no questions

Every item below is copy, layout, or both, which `AGENTS.md`'s fourth exclusion
reserves to the owner. None is filed as a defect and no replacement wording is
proposed. Each is one decision, with what the code does today and what it costs
to leave alone.

| # | The decision | What the code does today | If left alone |
| --- | --- | --- | --- |
| 1 | Should a successful escape's sentence survive the all-clear that lands on the same tick? **This is the one item that is a miss rather than a product question.** | `lapse` records the escape (`response-system.ts:620`) and then `reportAllClearIfCalm` (`:625`); the band keeps the newest event only (`simulation-events.ts:356`); the alerts list that holds both starts folded (`hud-state.ts:53`) and caps at 8 rows | **Measured: written three times, painted zero times.** The player reads *"A prisoner is trying to break out."* for 7.6 s and then the all-clear, which says the attempt was contained; the log had dropped the row by the time it could be opened. §2c |
| 2 | Should the money the game spends for the player be reported outside the *Buy* fold — and should the control that reverses it be? | `deliveriesBlock` is the last child of `buyRow` and `buyRow.hidden = true` (`build-panel.ts:1293-1311`); the row and its `Cancel` measure `0x0` | #640 removed the need to open the fold and #693 fixed a refund whose only trigger is inside it. §1 |
| 3 | Should a discovered contraband item be named, now that a weapon is reachable? **Ruled 2026-08-31 and half implemented — see the note under the table.** | the strip shows `itemsDiscovered` as a bare count (`status-strip-projection.ts:552`); all five `contraband.*.name` keys are authored and `grep -rn "contraband\.weapon\.name" src/ui/` returns nothing | a found weapon and a found phone render as the same character. §2d |
| 4 | Should `prisonersHighRisk` reach the screen, and should the Regime roster show more than four rows or sort by tier? | the count crosses the protocol and no strip item reads it; `PRISONER_ROSTER_ROW_LIMIT = 4` (`regime-panel.ts:156`) and the projection pages by entity index with no sort | after #681 the tier is the gate on a weapon and on an escape, and the player's view of it is four rows in arrival order. §10 |
| 5 | Should the refusal band have a lifetime, or a removal refusal a coarser key? | the counts payload carries `RefusalLog.last` for ever (`state-machine.ts:559`) and a removal's supersession key is the tile (`refusal-log.ts:538`) | one misclick with *Remove* armed leaves a red sentence up for the rest of the session. §9 |

> **Row 3, corrected 2026-08-31.** The row's "What the code does today" column
> is left exactly as written, because a row in a table of open decisions is a
> record of what was put to the owner. What the code does *now* is in the note
> at the end of §2d: the contraband chip carries a badge naming the category
> when one word is true of the whole count, built out of the five authored
> `contraband.*.name` keys with no new copy, and it stays silent on a mixed
> haul because a badge qualifies the count beside it. The remaining half — a
> message naming *each* find — still needs one sentence the owner has to
> approve, so the row is not closed.

**Two more, smaller, and both wording rather than plumbing**: the duplicate-order
sentence names an *order* where the player sees a *wall* (§1d), and a refused
*Admit* the main thread diagnosed itself is reported without the cause it
diagnosed, while the sentence for that cause ships in the same file (§12a).

## What this pass confirms working, so it is not re-checked

- **#640** — a wall buys itself, 80 a segment, no procurement press (§1a).
- **#650** — both halves of a hire quoted, all three strings laid out at
  1440x900, and the payroll badge reading `320 a day` (§4).
- **#685** — a tab press before the first *New prison* produces no band and
  costs the worker nothing; a wall run afterwards is accepted and priced (§12).
- **#690** — four presses and one drag per room, uniform across nine
  designations in two runs, the tool standing itself down every time and the
  panel returning to *Draw on map* (§3). Its fold frees the whole rail column
  while the tool is armed (§8).
- **#693** — a cancelled `jit:` delivery refunds exactly the figure the row
  promised, takes the queue from 24 waiting to 23, and the refund is still there
  fifteen seconds into Play (§1c).
- **#681 / #691** — the chain is real and a player reaches it by neglect: tier 3
  by review, contraband with it, an escape attempt, and a prisoner gone (§2a).
