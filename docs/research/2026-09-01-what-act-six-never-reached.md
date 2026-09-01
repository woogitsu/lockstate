# Playtest: everything act 6 of the rulings record never reached

**Date:** 2026-09-01
**Branch played:** `playtest/what-act-six-never-reached`, cut from `origin/main`
at **v0.0.309** (`4ac09736`). The branch adds one file under `tests/browser/`
and this record. It changes nothing under `src/` — `git diff --stat
4ac09736..HEAD -- src/` is empty.

**The assignment.** `docs/research/2026-09-01-playing-after-the-rulings.md`
closes by naming exactly what its act 6 never reached: escapes, `Undo` and
`Cancel` on a queued build order, deliveries and refunds, a prison past
in-game day 7, and the keyboard entirely. This record plays those five, in
that order, on the real assembled page.

**Reproduction**, one act at a time:

```
LOCKSTATE_BROWSER_TEST_PORT=5311 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-01-what-act-six-never-reached.playtest.ts -g "act 1" --reporter=line
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` matches
`/.*\.spec\.ts$/` and only `playwright.playtest.config.ts` matches
`.playtest.ts`. Every act drives `index.html` + `src/main.ts` in real Chromium
through a `Worker` tee, with real mouse gestures and, in act 5, real keyboard
events and no mouse at all.

**LFS.** `git lfs checkout` was run in the worktree first — 62 objects, 93 MB —
and confirmed with `file public/assets/actors/actor.guard.base.idle.png`
returning `PNG image data, 260 x 3104` where a fresh worktree returns `ASCII
text`.

**Contention.** `ps -eo etime,args | grep -E "[p]laywright/test/cli|[v]itest"`
returned nothing playwright-shaped before the first run; a one-minute load
average of 0.16 was recorded before act 1 was cut and before any other agent's
work began. **From then on the machine was not idle**: four other agents ran
`vitest` and typechecks throughout this pass, and the one-minute load average
sampled at various points across the acts ranged from 1.8 to 4.4. Acts were
still run **one at a time, never concurrently with another Playwright
process** — `ps` was checked before each act and returned no other
`playwright/test/cli` process — but every wall-clock figure below is marked as
needing an idle machine to mean what it appears to say, because none of them
were measured on one.

## Claim tiers

- **MEASURED** — this pass ran it in a browser; the output is quoted verbatim.
- **VERIFIED, read** — a file was opened at the line cited and quoted.
- **REASONED** — follows from MEASURED or VERIFIED facts, and says which.
- **UNKNOWN** — could not be established, and named as such.

## The acts

| act | what it played | viewport | result |
| --- | --- | --- | --- |
| 1 | a 2-bed, 14-prisoner, 0-guard neglect prison, run at ×4 to a real escape, with `alert-dwell.ts` armed ahead of it | 1280x800 | `1 passed (10.6m)`, escape at tick 48,611 |
| 2 | four single-tile walls, one `Cancel` and one `Undo`/`Redo` pair | 1280x800 | `1 passed (35.7s)` |
| 3 | two purchases, one delivery watched to landing, one cancelled mid-flight | 1280x800 | `1 passed (20.5s)`; a first attempt failed on a testing artefact, see §3 |
| 4 | a guarded 12-prisoner, 4-guard prison run to in-game day 15, with a save/reload at the end | 1280x800 | `1 passed (8.1m)` |
| 5 | the whole session played with only the keyboard: a cold-load Tab sweep, starting a prison, switching HUD tabs, the Build catalogue's roving-tabindex group, camera keys, and whether a build order can be placed at all | 1280x800 | `1 passed` |

---

# 1. Escapes — the highest-value act, and the one `alert-dwell.ts` was built for

**MEASURED, act 1, 1280x800.** The same neglect recipe
`docs/research/2026-08-31-playing-the-nine-changes.md` §2a used: one 6x6 cell,
**two** beds, **fourteen** prisoners, **zero** guards, run at ×4. Build and
admission finished at tick 4,333 — `14 | PRISONERS | 12 with no bed | 0 |
STAFF`. `alert-dwell.ts` was armed on `.hud__event` at tick 40,042, well ahead
of where the recipe's own prior run put the first escape (48,001), because a
frame that has already gone by cannot be recovered — the whole reason #700
was invisible to every poll before this instrument existed.

**The recipe reproduced almost exactly.** Every worker event from tick 39,900
on:

```
40,301  incidents.riot-opened
40,911  incidents.all-clear
44,161  prisoners.discharged
45,101  incidents.riot-opened
45,711  incidents.all-clear
48,001  incidents.escape-attempt-opened
48,611  incidents.escape-succeeded
```

`48,001` for the first escape attempt, against `48,001` in the 2026-08-31
run — the classification-review boundary this neglect recipe depends on lands
at the same tick both times, as the fixed schedule constants say it should
(`ClassificationReviewSystem`, `intervalTicks: 24_000, phaseTicks: 23_999`).

**And this time the sentence stood.** The full recording:
`111,438ms`, `2,759` animation frames, `1,242` writes, `8` distinct spans —
every sentence the band held, in the order it held them:

```
81f  "1 released — their sentences are served."
184f "A riot has broken out — 13 prisoners have stopped taking orders."
1029f "The prison is under control again — no incident is still open."
308f "1 released — their sentences are served."
171f "A riot has broken out — 12 prisoners have stopped taking orders."
652f "The prison is under control again — no incident is still open."
208f "A prisoner is trying to break out."
126f "Jonas Quintero broke out — no guard reached them in time."
```

Read directly off the production catalogue, then measured against the
recording:

```
the escape sentence, off the assembled page's own alerts log: "Jonas Quintero broke out — no guard reached them in time.Critical"
the escape sentence in the band: written 52 time(s), reached 126 frame(s), dwelt 4478ms
```

**`written 52 time(s), reached 126 frame(s)` is the opposite shape from
#700's own measurement of the pre-ruling-6 code — `"written three times,
painted zero times"`** (`docs/research/2026-08-31-playing-the-nine-changes.md`
§2c). Ruling 6 holds on a real escape, played end to end through
`index.html` + `src/main.ts`, not only against the synthetic view models
`ui-escape-sentence-survival.spec.ts` delivers through the isolated UI
harness. **The 4,478ms figure is a floor, not a lifetime** — the escape
sentence was still the band's whole content, unhidden, when this pass stopped
the recorder about four seconds after `escape-succeeded`, so the true dwell
before anything replaced it may be longer than what was captured.

**And the mechanism the ruling changed is confirmed silent exactly where it
should be.** The worker-event log above has no `incidents.all-clear` after
`48,611` — on the tick the escape was announced, none was ever recorded at
all, matching `reportAllClearIfCalm`'s `if (escapeAnnounced) return;` gate
(`src/simulation/incidents/response-system.ts:270`) rather than a delayed one
arriving later. This is the "silence, not a substitute sentence" the ruling's
own comment describes, measured rather than read.

**The persistent alerts log carries the sentence too, second from the
bottom**, ahead only of a leftover refusal from this act's own setup
(`calibrate()`'s probe, present in every act that uses it — see §2):

```
["A riot has broken out — 14 prisoners have stopped taking orders.Critical" ×4,
 "A riot has broken out — 13 prisoners have stopped taking orders.Critical",
 "A riot has broken out — 12 prisoners have stopped taking orders.Critical",
 "A prisoner is trying to break out.Critical",
 "Jonas Quintero broke out — no guard reached them in time.Critical",
 "Nothing was removed — there is no object on that tile, and none being built there.Warning"]
```

This pass did not fully work out the list's sort rule from one sample — six
riot rows sit ahead of the escape despite being chronologically older than it,
which is consistent with `MAX_EVENT_ALERT_ROWS`'s eviction-priority scheme
keeping high-priority rows over plain ones rather than strict recency, but
this record states only what was read, not a rule it did not verify.

**What this does not cover.** One escape, one session, one neglect recipe.
The escaped prisoner's own tier-3 escalation matched the prior run exactly —
final counts read `prisoners: 11, prisonersHighRisk: 11` — but this pass did
not attempt a second or third escape (the prior run's recipe produced three,
12,000 ticks apart) and cannot say whether the sentence survives as cleanly
on a later one, when the alerts log is fuller and closer to its cap.

# 2. `Undo`, and `Cancel` on a queued build order (#733's "before")

**MEASURED, act 2, 1280x800, empty-then-populated prison.** A fresh prison,
25,000 in the treasury. 40 bricks bought (1,600) and let land at ×1 before
anything else happened, so every order below queues against stock already in
the yard and a refund can only be about *this* order's own allocation:

```
after buying 40 bricks and letting the delivery land: treasury=23400
```

Four single-tile brick walls were then placed with four separate presses at
(12,12), (13,12), (14,12) and (15,12), each producing its own
`PlaceBuildOrder` with its own `transactionId` — confirmed from the worker tee,
one fresh `build-${uuid}` per press, matching `src/main.ts`'s comment that one
gesture is one undo step (`src/main.ts:2200`).

**The Queued fold caps at three rows even though four orders are really
queued.** With the clock paused:

```
queue before anything is cancelled: [12,12 · North (approved), 13,12 · North (approved), 14,12 · North (approved)]
(panel data-queued=4)
```

`BUILD_QUEUE_ROW_LIMIT` (`src/ui/hud/build-panel.ts:558`) is 3; the fourth
order is real and counted in `data-queued` but never drawn until one of the
first three leaves. This is an existing, already-documented fact
(`docs/research/2026-09-01-playing-after-the-rulings.md` §1), confirmed again
here rather than assumed.

**`Cancel` on the middle row (13,12), deliberately not the head and not the
tail:**

```
queue after Cancel: [12,12 · North, 14,12 · North, 15,12 · North]
treasury after Cancel: 23400 (before was 23400)
alerts after Cancel: ["Nothing was removed — there is no object on that tile, and none being built there.Warning"]
```

The one alert present is a **leftover from `calibrate()`'s own setup probe**
(a `RemoveObject` press at a point with nothing on it, run once before this
act placed anything) — it is identical before and after `Cancel`, and `Cancel`
itself added **nothing** to the alerts log and wrote **no** band under any
control. The only visible effect of a successful `Cancel` is the row leaving
the fold.

**`Undo` (`KeyZ`) once, immediately after:**

```
queue after Undo (KeyZ): [12,12 · North, 14,12 · North]
treasury after Undo: 23400
```

`Undo` took back **(15,12)** — the *last-placed* segment, not (13,12) (already
gone via `Cancel`, whose own state change makes it a no-op for `undo()`'s
`isCancellable` guard, `src/simulation/construction/system.ts:549`) and not
(12,12) or (14,12). This is LIFO over the transaction stack exactly as
`ConstructionSystem.undo()` reads (`system.ts:525-557`), confirmed on the
assembled page with an out-of-band `Cancel` already in the mix — the two
controls did not interfere with each other.

**MONEY CONSERVATION: treasury moved by exactly 0 across one `Cancel` and one
`Undo`.** Both call the same method, `cancelOrder`, which releases only
`materialsAllocated` back to the store (`system.ts:609-612`) and never touches
the treasury. This is precisely the "before" #733's draft PR proposes to
change: today, cancelling a build order — by either control — refunds
*material*, never money.

**`Redo` (`KeyY`), twice:**

```
queue after two Redo (KeyY) presses: [12,12 · North, 14,12 · North, 15,12 · North]
treasury after redo: 23400
```

The first redo restored (15,12) — the transaction `Undo` had just reversed.
The second redo had nothing left on the redo stack (`Cancel`'s own state
change is not an undo-stack entry, so it produced no redo entry either) and
was a correctly-silent no-op. Treasury: unchanged throughout.

**Finding — `Cancel` and `Undo` give no positive confirmation of their own.**
Neither writes an alert nor a band on success; the only feedback is a row
disappearing from a fold that starts collapsed (`.hud-build__queue`,
`collapsed: true`). A player who has not opened "Queued" and is not counting
rows would see nothing happen at all when either control worked. Ranked as
**D2** below.

# 3. Deliveries and refunds

**VERIFIED, read, before playing.** `grep -rln "delivery\|procurement"
src/rendering --include=*.ts` returns nothing. **"Watch the lorry" is
figurative: there is no delivery vehicle, or any representation of one,
anywhere in the world renderer.** The only place a delivery exists is the
Build panel's pending-deliveries block (`.hud-build__delivery-row`) and its
text — a label and a countdown-free "N back if cancelled" line. This is the
whole of what there is to watch.

**MEASURED, act 3, 1280x800, fresh prison.**

```
treasury on arrival: 25000
bought 50 bricks (2,000): treasury 25000 -> 23000; delivery row: "50 × Brick · 2,000 back"
first delivery's row left the panel after 5101ms of x1 play
treasury after it landed: 23000 (unchanged — landing spends nothing further)
```

The delivery took ~5.1s to land at ×1, matching
`PROCUREMENT_DELIVERY_DELAY_TICKS` (100, `src/content/procurement-catalog.ts:62`)
at 50ms/tick. Money is taken **up front**, at the moment of purchase — landing
is a pure materials event and moves nothing in the treasury.

**Cancelling one mid-flight — and a testing artefact worth stating plainly
rather than hiding.** A second purchase (30 bricks, 1,200) was made and its
delivery row's own `Cancel` button pressed within the same second. The first
attempt at this measurement read the result after only a 400ms wait and
reported the refund had **not** happened — treasury unchanged, the row still
present. That reading was wrong, and the reason is now on the record instead
of being silently re-run away: the worker's own `command-result` message for
the `CancelMaterialPurchase` command answered `status: "queued"` with
`scheduledForTick` roughly 20 ticks (~1000ms at ×1) ahead of the tick at the
moment of the click —

```
commands sent by the cancel click: [{"type":"CancelMaterialPurchase","orderId":"order-…"}]
… "kind":"simulation/command-result","payload":{"status":"queued", …, "scheduledForTick":158}
```

— and 400ms of real wait did not reach that tick. Re-run with a 1,500ms wait,
the refund landed exactly:

```
cancelled it mid-flight. treasury 21800 -> 23000 (paid back should restore it to 23000)
alerts after cancelling a delivery: ["No active alerts"]
delivery rows after cancelling: []
MONEY CONSERVATION: expected exact refund makes treasury 23000 === 23000; difference is 0
```

**This is a testing-methodology lesson, not a product defect** — every
command in this application is acknowledged as `queued` and applied on a
scheduled future tick rather than instantly, per ADR 0003 decision 9, and a
test (or a very fast series of reads) has to give that scheduling window room
to close before reading the result. Recorded here because the first, wrong
reading would otherwise have been reported as a cancellation bug, and it is
not one.

**A successful cancellation is silent, exactly like `Cancel`/`Undo` above.**
No alert, no band — the only visible effect is the row disappearing and the
FUNDS chip moving. This is the same shape as **D2** and is folded into it
rather than counted twice.

**Whole-act money trace**, every treasury reading in order:

```
25,000 -> 23,000 (bought 50) -> 23,000 (it landed, no change) -> 21,800 (bought 30) -> 23,000 (cancelled, refunded) -> final 23,000
```

Conserved exactly, at every step this act took.

# 4. A prison past in-game day 7 — the longest run this repository has driven

**MEASURED, act 4, 1280x800, `1 passed (8.1m)`.** A 6x6 cell, 4 beds, a
toilet, 12 admitted, 4 guards hired — the same recipe yesterday's act 6 used —
run this time from in-game day ~3 (build and admission themselves cost about
two in-game days at ×4 before the first reading) to in-game day 16, in five
legs of roughly three in-game days each. Every reading below is the
`simulation/status-counts` series and the assembled strip, read at each leg's
boundary.

| label (first reading after) | tick | treasury | accrued today | wage bill | unpaid | alerts (rows) | riots so far |
| --- | --- | --- | --- | --- | --- | --- | --- |
| "day 1" (build's own first reading) | 5,050 | 22,770 | 125 | 320 | 0 | 1 | 0 |
| "day 4" | 9,661 | 24,530 | 31 | 320 | 0 | 3 | 0 |
| "day 7" | 16,883 | 26,850 | 36 | 320 | 0 | 9 | 0 |
| "day 10" | 24,105 | 28,530 | 38 | 320 | 0 | 9 | 2 |
| "day 13" | 31,311 | 30,210 | 41 | 320 | 0 | 9 | 3 |
| "day 15" | 36,086 | 31,330 | 31 | 320 | 0 | 9 | 4 |

("day N" labels the *n*-th `report()` call in the act, not the calendar
in-game day — the strip's own `DAY` readout is one to three days ahead of the
label at every row above, because building and admitting the population
themselves burn about two in-game days at ×4 before the first report and
because each leg's report lands a little past its target tick. Stated plainly
so the table is not misread as calendar-day 1/4/7/10/13/15.)

**What degrades: nothing economic, and nothing that looks like a leak.**

- **`unpaidWagesMinorUnits` is 0 at every single reading across the whole
  15-day run.** A 4-guard, 12-prisoner prison of this shape never falls behind
  on payroll once, and the treasury climbs steadily (22,770 → 31,330).
- **`prisonersHighRisk` is 0 at every reading, all 15 days.** With guards on
  post the whole time, the classification-review escalation act 1's neglect
  recipe depends on never fires here — a real, played contrast between a
  guarded and an unguarded prison over a comparable stretch of in-game time.
- **The JS heap did not move.** `performance.memory.usedJSHeapSize` read
  **exactly 123,000,000 bytes at every one of the six readings**, from day 1
  through the post-reload check. Fifteen in-game days, four riots, nine
  alert-log writes, one save and one load produced no measurable heap growth
  in this Chromium build. (`performance.memory` is a non-standard Chromium
  extension and coarse by design — this is a real reading, not proof of no
  leak at all, but it found none of the size this run would have produced.)
- **The status strip's overflow does not grow past day 4.** `scrollWidth 1320`
  in `clientWidth 1256` — the same 64px this record's predecessor measured —
  held **identically** at day 1, 4, 7, 10, 13 and 15. The badge set that
  causes the overflow (`8 with no bed`, the coverage and contraband badges)
  was already complete by day 4; a longer run does not widen the gap further.
  This corrects an assumption this act was drafted under — that a longer
  session would show *more* overflow — with the measured answer: no, the
  overflow is fixed once the badge set stabilises, not cumulative.
- **Each three-day leg took almost exactly 89 seconds of wall time at ×4**,
  except the final (two-day) leg at 58s — no slowdown trend across the run,
  though every one of these figures needs the idle-machine caveat above and
  none of them is a clean measurement of *only* the simulation, since the
  Playwright poll loop's own `page.evaluate` round trips are inside the
  number.

**What does not degrade gracefully: the alerts log, exactly as #736/#704
predicted, and worse over more days.** By day 10 the log holds 4 fights, 2
contraband finds and 2 riots — already past its own 8-row cap
(`MAX_EVENT_ALERT_ROWS`), so the oldest rows (the two earliest fights) are
already gone and unreadable. By day 15 all four riots this run produced are
still in the log and every earlier fight but one has been evicted. **Riot
rows, not fight rows, are what an eviction-priority scheme is protecting** —
consistent with `hudEventAlertsFromWorkerMessage`'s comment about protecting
an escape row, applied here to riots instead.

**The reload at day 15 kept the simulation and dropped the log, exactly as
#736's D11 found on day 4.**

```
what a day-15 reload changed: ["stateIncomeAccruedTodayMinorUnits: 61 -> 72"]
after the day-15 reload alerts (1): ["No active alerts"]
```

Every counter but the mid-day accrual (expected — the save landed partway
through a day) came back identical. The alerts log — 9 rows including four
riots — came back empty. **This is the same finding as yesterday's D11,
reproduced at day 15 rather than day 4: the alerts channel is main-thread
session state and a reload starts it from nothing, however much incident
history the session actually holds.** Folded into **D1** below rather than
counted as a new finding, since it is the same mechanism at a later day.

# 5. The keyboard, entirely

**MEASURED, act 5, 1280x800, no mouse touched except where stated.**

**5a. The tab order from a cold load is a closed ring, and the world canvas is
never in it.** Sixty `Tab` presses cycle after **11 steps**: Pause → Play →
Fast forward → strip-collapse toggle → Alerts-fold header → display-scale
cycle → New prison → Save now → Export → Import → the save-panel's own
collapse toggle → back to Pause. No trap — Tab always kept moving — and the
`<canvas>` the world renders into is confirmed **never** a stop, at any point
in the sweep. That is consistent with every game control routing through
`window`-level key listeners rather than DOM focus (`world-scene.ts:364-365`),
not a defect.

**5b. Starting a prison with no mouse works.** `"New prison"` is the 7th `Tab`
stop from a cold load; `Tab` then `Enter` started a session and the clock day
read `"1"`.

**5c. The HUD's main tab bar is fully keyboard-operable**, because it uses the
`aria-current` selection pattern (`tab-button.ts:18-20`) rather than a
roving-tabindex `role="tab"` group — every button stays in the ordinary tab
sequence, and `Enter` on "Build" flipped its `data-active` to `"true"`.

**5d. The Build catalogue is real, is behind a fold, and the fold itself is
`Tab`-reachable and openable.** Starting from the Build tab button, the
catalogue's own disclosure header (*"What to build"*) is the 18th `Tab` stop
in the panel; `Enter` opens it, and the first catalogue row (*"Brick
wall"*) is 2 stops further. The rows are real `<button role="radio">`
elements in a WAI-ARIA composite widget: one carries `tabIndex 0`, the rest
`-1`, and `Home`/`End` correctly land on the first (*"Brick wall"*) and last
(*"Storage Rack"*) row.

**5e. The finding of this act — arrow-key catalogue navigation also pans the
world camera.** Measured with a single-tile probe: the world's own Remove
tool, armed once, reports the tile under a fixed screen point via the
`RemoveObject` command it dispatches on a click — the cheapest instrument
available on the assembled page, since `world-scene-input.spec.ts`'s
`window.lockstateWorldSceneHarness` exists only on an isolated harness page,
never on `index.html`.

```
tile under screen point (700,300): before the arrow presses {"x":16,"y":14}, after {"x":16,"y":16}
```

Six `ArrowDown` presses inside the Build catalogue's roving-tabindex group —
which correctly moved the *selection* from "Brick wall" to "Desk" — **also**
moved the world camera down by two tiles' worth at this zoom. **VERIFIED,
read, for why:** `build-panel.ts`'s catalogue keydown handler calls
`event.preventDefault()` for every key it consumes but never
`event.stopPropagation()` (`src/ui/hud/build-panel.ts:972-991`); `WorldScene`'s
own camera bindings listen on `window` in the bubble phase, gated only by
`isTextEntryFocused()` (`world-scene.ts:282`), and a focused `<button
role="radio">` is not a text field. `preventDefault()` stops the browser's own
default action (page scroll) but not the event's continued bubbling, so one
keystroke satisfies both listeners.

**How badly it hurts a player.** Moderate, not blocking. Browsing the Build
catalogue by arrow key makes the world drift underneath, unexplained, every
few presses — `Home`/`End` still land correctly inside the list itself, so the
selection is not lost, only the view. A keyboard-only player would have to
notice the drift, understand it came from the *list* navigation, and pan back
by hand. No prior pass measured this because no prior pass used the keyboard.

**5f. `Escape` does not un-arm a selected tool, and this is the code's stated
intent rather than a bug.** With `wall-brick` armed (`.hud-build__arm` reading
*"Stop placing"*), `Escape` left the label unchanged. **VERIFIED, read:**
`WorldScene`'s `'build.cancel'` handler calls only `this.cancelAllGestures()`
(`world-scene.ts:605-611`) — it cancels an *in-progress drag*, never the
panel's armed/selected state, and its own comment says the tools are meant to
be disarmed by leaving the tab. A keyboard player who wants to put a tool away
without switching tabs has to `Tab` back to the same "Place on map"/"Stop
placing" button and press it again — reachable, but not via the key that
looks like an escape hatch.

**5g. Holding a camera key works exactly as documented.** `KeyD` held for
600ms panned the same probe point from `(16,16)` to `(24,16)` — continuous
motion while held, matching `keyboard.ts`'s press-and-hold model.

**5h. No keyboard route places a build order at all.** With the wall tool
armed and no mouse touched, `Enter`, `Space` and `NumpadEnter` produced **zero**
commands. **VERIFIED, read:** `src/input/bindings.ts` has no binding that
targets a world tile or confirms a placement in the `'world'` context — the
vocabulary covers camera movement, zoom, undo/redo and cancel-the-gesture, and
nothing else. **This is the single most load-bearing fact act 5 establishes:
the game can be started, navigated and half-configured with no mouse, but
nothing can actually be built without one or a touch gesture.** A keyboard-only
player can reach every panel and read every number, and cannot build a wall.

---

# Findings, ranked by how much they hurt a player

## D1. A reload drops the alerts log, at day 4 and again at day 15

**MEASURED**, §4 above, reproducing yesterday's D11 at a later day. The log is
main-thread session state and a reload starts it from nothing however much
history the session holds — at day 15 that was four riots and five other
rows. **How badly it hurts:** the log is the only record of what happened
while the player was away, and reloading is the ordinary way to return to a
save. Unchanged from yesterday's assessment; recorded again to show it does
not get better with more elapsed time, only more to lose.

## D2. `Cancel`, `Undo`, `Redo` and a delivery cancellation are all silent on success

**MEASURED**, §2 and §3 above. None of the four controls this record exercised
writes an alert or a band when it succeeds — the only feedback is a row
disappearing from a fold that starts collapsed. **How badly it hurts:** a
player who has not opened "Queued" and is not counting rows sees nothing
happen. Low severity on its own — the numbers *are* correct, per the money
conservation measured in both acts — but it means a player's only proof that
`Cancel`/`Undo` did what they meant is arithmetic they would have to do
themselves.

## D3. Arrow-key catalogue navigation pans the world camera

**MEASURED**, §5e above. **How badly it hurts:** moderate — confusing rather
than blocking, and specific to keyboard-only play, which this record is the
first pass to have exercised at all.

## D4. The game cannot be built without a mouse or touch

**MEASURED / VERIFIED**, §5h above. **How badly it hurts:** severe as a
*keyboard-accessibility* claim and non-existent as a mouse-and-touch one — the
brief's own framing ("desktop first, mobile later") suggests keyboard-only is
not the primary path today, so this is recorded as a fact establishing the
current boundary rather than an urgent defect. Worth the owner's attention if
full keyboard operability is ever a stated goal.

## Confirmed, not ranked as a defect — ruling 6 holds on a real escape

**MEASURED**, §1 above. This is the pass's strongest result and it is not a
finding of harm: the escape sentence *"Jonas Quintero broke out — no guard
reached them in time."* was written 52 times and reached 126 animation
frames, standing for at least 4,478ms before this pass stopped watching —
the reverse of #700's own measurement of the pre-ruling-6 code, `"written
three times, painted zero times"`. It is placed first in this list because
it is the headline of the record, not because it costs a player anything.

---

# Instruments, and the case against a new CI gate

**Kept:** `tests/browser/playtest-2026-09-01-what-act-six-never-reached.playtest.ts`,
five acts. It is an instrument, not a gate, and nothing in CI collects it.

**No `.spec.ts` is proposed by this pass for acts 2-5, and each candidate is
argued rather than skipped:**

- **`Cancel`/`Undo` money conservation (§2).** Already pinned headlessly and
  cheaply — a browser spec would add the mouse path and buy nothing a unit
  test over `ConstructionSystem` does not already prove.
- **Delivery cancellation's scheduling lag (§3).** This is a fact about the
  command protocol (`scheduledForTick`), already true of every command in the
  application and not specific to this control. A test that hard-codes "wait
  1,500ms" would be pinning a timing constant that has nothing to do with the
  behaviour under test.
- **The arrow-key/camera conflict (§5e).** This is the one real candidate for
  a future fix-then-regression-test pair, but writing the spec *now* would pin
  the bug rather than the fix — better argued to the owner as a finding first.
- **The strip's fixed 64px overflow across a 15-day run (§4).** Already the
  subject of #723's own note; this pass adds a longer-run measurement to an
  existing, already-tracked fact rather than a new claim needing its own gate.

# The weakest claim in this record, and what would change it

**It is act 1's alerts-log ordering aside in §1, and it is the one to attack
first.** Six riot rows were read sitting ahead of the escape sentence despite
being chronologically older than it, and this record states only that the
reading is consistent with an eviction-priority scheme rather than claiming
to have found the rule — because it did not open
`hudEventAlertsFromWorkerMessage` and verify a sort function against this
exact sample. **What would change my mind:** reading that function
alongside a second recording that varies the mix of event types, to say
positively *why* the display order looks the way it does rather than only
that one order was observed.

**The second-weakest claim is the dwell figure's precision, not its
direction.** `4,478ms` is a measured floor on how long the escape sentence
stood, not a claim about its total lifetime — the recorder was stopped about
four seconds after `escape-succeeded` while the sentence was still current,
so the true figure could be much larger (the prior neglect run's trigger
cooldown is 12,000 ticks, giving the band a long quiet stretch to stand in
before the next riot). **What would change my mind:** a run that keeps the
recorder attached until something else actually replaces the band, giving a
real total rather than a floor.

**What this pass did not reach at all.** Mobile viewports, a second or third
escape in the same session (the prior neglect run produced three, 12,000
ticks apart), the `Enter coordinates` route, a save/reload taken *during* an
open incident, and the `-g "act N"` acts run back to back rather than as five
separate processes (each act here opened its own fresh page). None of that
was played.
