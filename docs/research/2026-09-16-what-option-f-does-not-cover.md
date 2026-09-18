# What ADR 0091 option F does not cover, played

**Date:** 2026-09-16.
**Tree:** `origin/main` at `ca82e946` (the merge of #1261), in a worktree cut
from it. Node v24.19.0, real Chromium, 1440x900, one worker.
**Instrument:** `tests/browser/playtest-2026-09-16-what-option-f-does-not-cover.playtest.ts`,
run through `tests/browser/playwright.playtest.config.ts` on port 45430.
**Author's standing:** this record measures; it decides nothing and changes no
production code.

> **Environment caveat, stated rather than implied.** Git LFS is unprovisioned
> in this container, so every actor atlas fails to decode and
> `World renderer: InvalidStateError: The source image could not be decoded.`
> appears in every run. **No claim here rests on a pixel.** Every figure is DOM
> text read through `innerText` or a `performance.now()` stamp taken inside the
> page.

## Three findings, in one paragraph each

1. **The ADR's act-3-step-E claim is false as a general claim, and that is
   measured rather than reasoned.** A `RemoveWall` press resolved by its
   **object arm** does not retire a standing `remove-wall.*` refusal: on screen,
   `.hud__event` read *"The object was removed"* while `.hud__refusal`, one
   grid row away, read *"there is no object on that tile"* — the same
   two-adjacent-rows contradiction option F was chosen to kill, about the same
   press, surviving F. A wall-arm press in the same session retired it.
2. **F's band lifetime on a route the player repeats is 350.4 ms**, against the
   600 ms `EVENT_BAND_DWELL_FLOOR_MS` the owner ruled for the event band. Two
   orders of magnitude better than option D's 2 ms, and still under the floor
   F's own argument invokes.
3. **#780's abandoned-rectangle refusal survives 102.9 seconds**, 24 wall
   orders and 3.5 in-game days, and dies at the first successful zoning —
   against a pre-F baseline of 5.9 minutes and eight in-game days.

## The question

ADR 0091 decision 2 was ruled on 2026-09-16 and shipped the same day as #1261:
the refusal band retires its sentence when a **decided outcome of the same
command route** arrives, where the route is the supersession key's own prefix.
The alerts list keeps the row — that divergence is what option F buys.

#1261's own pull request body named two things the change does not cover, and
one figure the choice of F over option D rests on, and measured none of the
three. This record measures all three by playing.

## 1. `RemoveWall`'s object arm — the ADR's claim is FALSE, measured

### What the ADR claims

> **Kills the measured contradiction**: act 3 step E was a **successful
> `RemoveWall`** while a `remove-wall.nothing-to-remove` refusal stood. Same
> route, so F retires it — the two bands stop disagreeing about one press.
> — `docs/adr/0091-what-clears-the-refusal-band.md`, option F's cost table

### The mechanism, re-derived before running anything

`session-commands.ts`'s `RemoveWall` branch (`:910`) tries the **object arm
first** — `objectPlacement.remove(...)` at `:933`, the identical call
`RemoveObject`'s own branch makes at `:838`. When that arm wins, the branch
supersedes under `removeObjectSupersessionKey` (`:940`), whose key is
`remove-object:<x>:<y>` (`refusal-log.ts:818`). Only when the object arm
answers `nothing-to-remove` does the branch reach the edge and supersede under
`removeWallSupersessionKey`, `remove-wall:<x>:<y>:<edge>`
(`refusal-log.ts:832`).

`supersessionKeyRoute` (`refusal-log.ts:123`) is everything before the first
`:`. Run against the two builders in this tree:

```
remove-wall key: remove-wall:18:19:north -> route remove-wall
remove-object key: remove-object:14:14  -> route remove-object
routes equal? false
```

`noteRouteDecided` (`refusal-log.ts:235`) returns without marking when the
routes differ. So a `RemoveWall` press resolved by the object arm cannot retire
a standing `remove-wall.*` refusal — **predicted from the code, then measured
on the screen rather than left as a reading.**

### Measured

Both cases were run against an **identical** standing refusal: one `RemoveWall`
press on an empty tile, screen (240,482), tile (8,16), which put this in the
corner:

> `Nothing was removed — there is no object on that tile, none being built
> there, and no finished wall there either.`

**The wall arm — the band retires.** A 6x6 cell's own wall run at tiles
(10..17, 20). One press on a completed wall's edge produced
`RemoveWall 10,20 north`, and afterwards:

| surface | reading |
| --- | --- |
| `.hud__refusal` | **`not laid out`** — the corner is empty |
| `.hud__event` | `The order was cancelled. Anything already spent past the point of no return stays spent.` |
| `.hud-alerts__list` | still carries the `Nothing was removed …` row, `Warning` |

The 20 ms band recorder logs the transition to `<hidden>` at page
t=165169.9 ms. **F works, and the band/list divergence it buys is visible on
one screen.**

**The object arm — the band does NOT retire.** A separate prison: the same 6x6
cell, zoned on the first attempt, one `bed-wooden` built and standing at tile
(14,14). The same standing refusal from the same empty-tile press. Then one
press on the bed produced `RemoveWall 14,14 north` — the **same command**, the
same gesture — and the object arm won:

| surface | reading |
| --- | --- |
| `.hud__refusal` | **`Nothing was removed — there is no object on that tile, none being built there, and no finished wall there either.`** |
| `.hud__event` | `The object was removed — the money it cost does not come back.` |
| `.hud-alerts__list` | both rows, plus the earlier `Cell designated.` |

The band recorder logs **no transition at all** across that press: the corner
went `<absent>` → `<hidden>` → the refusal at t=27799.3 ms and stayed there.

**Then, in the same session, the same route decided.** One further press on the
cell's west wall produced `RemoveWall 12,14 west`, and the corner emptied at
t=290598.8 ms. So the difference is the arm and nothing else: same command
type, same session, same standing refusal, one press retires it and the other
does not.

### What this costs, stated as what was seen

The two-adjacent-rows contradiction option F was chosen to kill **survives F on
the object arm**, and the object-arm version is sharper than the one the ADR
measured. `.hud__event` says *"The object was removed"* while `.hud__refusal`,
one grid row away, says *"there is no object on that tile"* — about the same
press, at the same tile, at the same moment.

### Was act 3 step E itself the object arm? Inference, not measurement

Act 3 of the 2026-09-15 cold-start record (PR #1243, not on `main`) drove **one
tile edge** through five steps, and at step D the Build queue read
`1 being built`. Two facts about this tree bear on which arm answered step E,
and both were checked here:

- `ordersBuildingObjects` (`object-placement-service.ts:924`) skips any order
  whose buildable has no `placesObjectId`, and `wall-brick`
  (`construction/definition.ts:84-90`) has none. **A wall order is invisible to
  the object arm**, in progress or not.
- The object arm's standing-object path raises *"The object was removed — the
  money it cost does not come back"*, measured above. Step E's recorded event
  is *"The order was cancelled…"*, which the object arm produces only from a
  cancelled **object** order.

So on the record's own narrative — one tile edge, a wall order — step E was
most probably the **wall arm**, and the ADR's sentence is probably right about
*that* instance. **This is an inference from a narrative and the code, not a
measurement of act 3**, which ran on a branch this pass did not re-run. What is
measured is the general claim, and the general claim is false: a successful
`RemoveWall` does **not** retire a standing `remove-wall.*` refusal when an
object is what it removed.

**Nothing was changed.** #1261 left `RemoveWall`'s keying alone because it is
#492's deliberate *"the fact this press changed is the tile"*, and altering it
is a decision the owner takes.

## 2. F's own band lifetime on a route the player repeats — 350 ms, under the floor

F was chosen over D on one number: D's band lifetime is **2 ms** inside an
ordinary wall drag, against the **600 ms** `EVENT_BAND_DWELL_FLOOR_MS`
(`src/ui/hud/event-band-dwell.ts:52`) the owner ruled for the *event* band.
That figure was measured before F existed. Measured now, on the shipped code:

Two raw `page.mouse.click`s with nothing between them — deliberately not the
playtest harness's `press`, which spends a `waitForTimeout(100)` and two
`page.evaluate` round trips per gesture. The first lands on empty ground and
refuses; the second lands on a completed wall of the same run and succeeds.

```
TIGHT SEQUENCE commands: ["RemoveWall@193419.9","RemoveWall@193912.4"]
TIGHT SEQUENCE band:     ["195202.5 \"Nothing was removed …\"","195552.9 \"<hidden>\""]
TIGHT SEQUENCE: 492.5ms between the refusing press and the deciding press
F'S BAND LIFETIME on a repeated route: 350.4ms
```

**350.4 ms, against the 600 ms floor.** So on a route the player repeats, F
does inherit a weakened form of the defect it was chosen to avoid: the sentence
is on screen for a little over half the minimum the owner ruled an ordinary
event needs in order to be readable, and the player's own next press is still
the clock.

**Three honesties about that number, because it is the one most likely to be
over-read.**

1. **It is not 2 ms and the difference is two orders of magnitude.** D's 2 ms
   came from eight `PlaceBuildOrder`s inside *one* drag; 350 ms comes from two
   separate deliberate presses. F is enormously better than D here and the
   comparison this section makes is against the 600 ms floor, not against D.
2. **492.5 ms is a floor on the gesture, not a measurement of a player.** It is
   how fast two `page.mouse.click`s complete in this container. A player
   clicking two adjacent tiles could be faster or slower; nobody has watched
   one.
3. **The route has to be repeated for this to bite at all**, which is the whole
   of F. Re-confirmed here: the same standing refusal survived a whole eight-
   command wall run in the first test, byte-identical, with the recorder
   logging no transition — exactly ADR 0091's M1, on the shipped code.

**And a supporting figure, re-measured.** ADR 0091's M3 says a removal gesture
is one command rather than a run. Confirmed: a removal **drag** across six
tiles produced **1** command, `RemoveWall 16,20`. So the "drag that refuses
eight times" shape does not exist for removal, and the 350 ms above needs two
deliberate presses rather than one gesture.

## 3. #780's different-location case

### What the ADR says it does not fix

> **What it does not fix, stated plainly**: #780's plain different-location
> case for a route the player never repeats. A `zone.not-enclosed` refusal
> about a rectangle the player abandons stands until they zone something else
> or refuse something else.

### The baseline this is measured against

The 2026-09-15 cold-start record (acts 4-5, PR #1243, **not on `main`** and so
cited by pull request rather than by path) measured the **pre-F** status quo: a
probe refusal survived *"24 walls, a zoned Cell, two beds and a toilet, two
admits, a hire and eight in-game days"* — 5.9 minutes of play — and the alerts
list re-sorted it below each new arrival.

### Measured, post-F

A cold start in which the **first** thing the player does after buying bricks
is draw a 3x3 Cell on open ground at tiles (8,15)-(10,17), confirm it, and
never return to it. The corner took the refusal:

> `The room was not zoned — this room type must be enclosed, and the area you
> drew is open on at least one side.`

Then an ordinary cold start was played past it, with the corner read at every
milestone:

| milestone | page t | tick | `.hud__refusal` |
| --- | --- | --- | --- |
| the abandoned rectangle refused | 73,705.6 ms (band) | 1,782 | the `not-enclosed` sentence |
| after the north wall run (6 orders) | 98,069.1 ms | 3,655 | unchanged |
| after the south wall run (12) | 110,046.2 ms | 4,598 | unchanged |
| after the west wall run (18) | 122,058.2 ms | 5,576 | unchanged |
| after the east wall run (24) | 137,721.5 ms | 6,836 | unchanged |
| the build queue emptied, 24 walls up | 143,817.4 ms | 7,332 | unchanged |
| **designate attempt 1 accepted, `rooms=1`** | 180,337.7 ms | 10,250 | **`not laid out`** |

The 20 ms recorder puts the clearing transition at **176,604.0 ms**, so the
refusal's measured survival is

> **102.9 seconds — 24 wall orders, four wall runs, the build queue emptying,
> ticks 1,782 → 10,250 (8,468 ticks, 3.5 in-game days at
> `DAY_LENGTH_TICKS = 2,400`, four day boundaries crossed) — and it ends at the
> first successful zoning.**

**The designation was accepted on the first attempt**, which matters: a retried
designation refuses `zone.not-enclosed` again and *replaces* the standing
record, which would have emptied the corner of the abandoned rectangle by the
old rule and confounded the reading. One attempt, one clearing, one cause.

**The alerts list keeps the row**, as F intends: after the zoning it reads the
`not-enclosed` sentence with `Warning`, then `Cell designated. Day 5` with
`Info` and `Clear this alert`. The pre-F record's observation that the refusal
ends up sorted below dated, dismissible acknowledgements while carrying neither
is therefore **unchanged by F** — F moved the corner, not the list.

### So how much of #780 survives F

The ADR's cost line is right about the mechanism and reads pessimistically
against how this route is actually played. `zone` **is** a route the player
repeats: the cold start's whole purpose is to zone a room, and decision 1 made
the `ZoneRoom` success path supersede under **both** `zone:` and `zone-area:`
keys unconditionally, so a `not-enclosed` refusal filed under either prefix
sees its own route decided on every successful zoning.

What survives is the case where the player abandons a rectangle and then never
zones or attempts to zone anything again — which the 102.9 seconds above says
is not the cold start. Against the pre-F baseline the refusal no longer reaches
the beds, the toilet, the admits, the hire or days 5-8; it dies at the cell.
**#780's different-location case is narrowed by F from "the rest of the
session" to "until the next zoning attempt", and on this route that is about a
hundred seconds.**

## What this record does not establish

- **Why the object arm's keying is what it is** beyond #492's quoted sentence.
  That is a decision, and it is the owner's.
- **Whether act 3 step E was the wall arm**, as distinct from whether the ADR's
  general claim holds. §1 says which of those is measured and which is inferred.
- **What a real player's press cadence is.** Every timing here is this
  container's.

## Weakest claim, named

**That 350.4 ms is a fair reading of F's band lifetime in ordinary play.** It
is a real measurement of a real sequence, and the sequence was constructed to
be the fastest one that triggers the rule — a refusing removal press followed
immediately by a succeeding one. Whether a player ever performs that pair is
not established by it, and the first test in the same file shows the same
refusal living **135 seconds** across a wall run and a queue wait when the
route is not repeated. So the honest statement is a *range* whose bottom is
350 ms, not a typical lifetime.

**What would change my mind:** a watched player, or a cadence distribution
taken from the command stream of an unscripted session. Either would replace a
constructed worst case with a real one.
