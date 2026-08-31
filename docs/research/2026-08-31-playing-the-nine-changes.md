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
`git diff --stat 6b5dc8d..origin/main -- src/` is two files:
`src/services/localization/chunk-catalog-loader.ts` (new) and
`src/services/localization/index.ts` (one line). No finding below rests on
either.

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
| act1c | 1 | `1 failed (1.7m)` | the same hang with a 20 s cap, which produced the timeout log quoted in §1 |
| **act1d** | 1 | **`1 passed (8.3m)`** | the whole money route, the hire control, the band's first painted sentence |
| act2a | 2 | see §3 | five disjoint enclosed rooms, four presses each |
| act3a | 3 | killed at 2 min | killed deliberately: the instrument was wrong and §2 explains why |
| **act3b** | 3 | see §2 | the same act with a `MutationObserver` and a frame sampler |

**Contention, sampled rather than assumed.** A sampler wrote
`ps -eo args | grep -c "[p]laywright/test/cli"` and the load average every 60 s
for the whole session. What was on the machine:

- Another agent's `vitest run` was live for most of act1c and act1d
  (`vitest=3` to `vitest=8`, load 2.25 → 4.34 on 4 cores).
- Another agent's `app-shell.spec.ts -g "what a zoned room is missing"` run was
  live for part of it.
- **This pass ran act 2 and act 3 concurrently on ports 5202 and 5201**, which
  is two Playwright runs of its own, both mine and both known.

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

### 2c. What the same mechanism gives the player when the two events are 70 ticks apart

**MEASURED**, §6: assault-opened at 29,151, all-clear at 29,221, and the opening
sentence held the band for **744 ms** at ×4. The escape pair is **zero** ticks
apart.

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
3 — the step that draws contraband under [ADR 0080](../adr/0080-the-prison-asks-what-a-prisoner-is-carrying.md)
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

# Part C — this pass's own instrumentation, corrected in the open

## 7. Four things this pass got wrong, each paid for once

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

**7e. The bare-world probe in act 2 was too shallow to answer its own question.**
It walked `.hud > *` and filtered `pointer-events: none`, which returns only
`hud-strip 0,0 1440x48` — the rail *containers* inherit `pointer-events: none`
from `.hud` and the panels inside them re-enable it, so the panels are invisible
to that query. Act 4 asks the browser instead, with `elementFromPoint`.

---

# Part B — the surfaces #690 and #691 are about

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
- **What would establish the impact**: whether a prison ever holds a tier-3
  prisoner outside the first four indices in ordinary play. **UNKNOWN here** —
  act3b's roster showed `Low`, `Minimal`, `Minimal` and never a `High` while
  this record was written, so this pass never had a tier-3 row to look for.
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

---

# Part D — what this pass did not reach, and its weakest claim

## 13. Not reached

- **#694's negative balance and its loan.** Never approached; §11 has the
  balances. Both prisons ended richer than they started.
- **A tier-3 prisoner in the Regime roster's four visible rows.** The roster read
  `Low, Minimal, Minimal` while act 3 was still below the review boundary, and
  the run's later roster reads were not captured before this record was written.
  So §10's *impact* half is genuinely open.
- **The Rooms tool at a room count where "one extra press per room" compounds.**
  Four rooms; §3 says what forty would need.
- **Any viewport other than 1440x900.** §8's sweep is one viewport. #690's own
  argument is about 375x812 and this pass did not go there.
- **The alerts fold as a way back to a lost sentence.** Act 3 opens it at the end
  of the run; whether the escape sentence is legible *in the list* after the band
  has moved on is answered by that dump and not by anything above it.
- **A save/restore across an escape.** Not attempted.
- **Anything about rendering the world.** LFS content was present, and no claim
  here is about a sprite.

## 14. Weakest claim, and what would change my mind

**The weakest claim in this record is §3's judgement that four presses per room
reads as confirmation rather than friction.** Everything else here is a tick, a
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
