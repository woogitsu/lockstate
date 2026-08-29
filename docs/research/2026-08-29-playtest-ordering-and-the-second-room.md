# Playtest: the ordering lead, and the route to a second room

**2026-08-29.** Mouse-driven playtest on `main` at `133a7f6` (v0.0.204), Chromium,
driving the real assembled page (`index.html` + `src/main.ts`) through a
`Worker` tee that records every command sent and every reply received.

Continues the pass recorded in `2026-08-29-mouse-playtest.md` (PR #572) and the
question issue #569's retraction left open: **the owner's complaint —
*"nie mogłem postawić więzienia … grając sam"* — still has no established
cause**, and *ordering* is the best evidence-backed candidate.

Every claim below is labelled with how it was obtained. **MEASURED** means the
run is in this repository's transcript and the numbers below are pasted from it.
**READ** means a source file was opened at the line cited. **NOT ESTABLISHED**
means exactly that.

---

## 1. The container, not the parts

#569's retraction named the method failure that produced it: *a survey that
enumerates known regions cannot find a message in a region it did not know
about.* Every dump in this pass prints `document.querySelector('.hud').innerText`
in full, plus `.hud__refusal` and `.hud__event` geometry, at every step.

**MEASURED.** At 900x600, after the naive `ZoneRoom` refusal:

```
--- .hud__refusal: {"hidden":false,"box":{"w":900,"h":32,"x":0,"y":48},
    "text":"The room was not zoned — this room type must be enclosed, and the
             area you drew is open on at least one side."}
```

The retraction holds at the binding viewport. The band is there, it is 900x32,
and it is not folded behind anything.

## 2. Nothing on screen ever says the word "wall"

**MEASURED**, by grepping the whole `.hud` innerText at each step of the naive
route at 900x600:

| moment | `/wall/i` in the whole HUD? |
| --- | --- |
| arrival, Overview tab, nothing pressed | **false** |
| Rooms tab, `room.cell` selected | **false** |
| the 4x4 rectangle drawn, before Designate | **false** |
| after the refused Designate | false (the only hit is the BUILD tab label) |

What the panel *does* say, verbatim from the Rooms panel at the moment the
rectangle is pending:

```
AREA
4 × 4 tiles at 12, 12
OPEN ON AT LEAST ONE SIDE
NEEDS AT LEAST 2 × 3 TILES
MUST BE ENCLOSED
NEEDS 1 × BED
NEEDS 1 × TOILET
```

So the game states the *rule* ("must be enclosed", "open on at least one side")
and never the *action* that satisfies it. It is a measurement, not a diagnosis.

**What would establish the cause:** a player, or the owner, saying whether
"enclosed" read to them as "go to the Build tab and lay brick walls".
**What would establish the impact:** nothing in this repository can. Nobody
plays the game yet.

**READ.** The four requirement lines are rendered as one undifferentiated block:
all four are `eyebrowText(..., 'hud-rooms__rule')` inside `.hud-rooms__rule-block`
(`src/ui/hud/rooms-panel.ts:868-946`), with no per-line state class. Only one of
the four gates the control — `confirmButton.setDisabled(pendingIsTooSmall())`,
`src/ui/hud/rooms-panel.ts:1567` — and the comment immediately above it
(`:1540-1566`) says why the enclosure case deliberately does not.

## 3. The reachable world shrinks fast, and 900x600 leaves 6x9 tiles

**MEASURED.** On a fresh prison, Build tab, no panels folded, hit-testing the
centre pixel of every tile in a 34x34 block around the camera and asking whether
`document.elementFromPoint` is the canvas:

| viewport | reachable tiles | bounding box | largest all-reachable rectangle |
| --- | --- | --- | --- |
| 1440x900 | 217 | x 5..26, y 10..22 | **15 x 12** at (8,10) |
| 1280x800 | 174 | x 6..25, y 10..21 | **12 x 11** at (10,10) |
| 1024x768 | 110 | x 8..23, y 11..21 | **8 x 10** at (12,11) |
| 900x600  | **86** | x 9..22, y 12..20 | **6 x 9** at (13,12) |

The camera calibration `(viewportW/2 − 1024, viewportH/2 − 1024)` held at all
four, checked each time against a real `RemoveObject` press rather than assumed:
1440x900 → `(-304,-574)`, 1280x800 → `(-384,-624)`, 1024x768 → `(-512,-640)`,
900x600 → `(-574,-724)`.

The biggest single blockers at 900x600, by tiles covered:
`hud-minimap__surface` 16, `hud-strip` 8, `ui-panel__body` 6.

**This is a measurement and not a defect claim.** The camera pans, so a small
window is not a hard limit on prison size. What it does bound is a *single
gesture*: a wall run or a room drag whose pointer leaves the canvas is not the
run the player drew.

**READ, and relevant to how much that bound costs:** with a mouse, the camera
pans on the **middle button only** — `if (pointer.button !== 1) return;` at
`src/rendering/scene/world-scene.ts:407`. The wheel zooms
(`src/rendering/scene/world-scene.ts:368-381`), it does not pan. The Build
panel's own hint states this, verbatim from the run: *"Click a tile edge to
place a wall. Drag along it to lay a run. Two fingers, the middle button or the
arrow keys still move the camera."* So it is **documented, in the panel, at the
moment it matters** — which is why this is filed as a measurement of the
workspace and not as a missing-affordance claim.

**NOT ESTABLISHED:** what a laptop trackpad does here. A two-finger trackpad
swipe emits `wheel`, which this code zooms with; whether that leaves a trackpad
player able to reach the world they want is not something this pass measured.
**Cheapest measurement that would settle it:** dispatch a `wheel` sequence and
re-run the reachability count above at 900x600, before and after.

**Overlap declared:** an agent is working `src/ui/**` on the UI scale (#545).
The table above is theirs to use; this pass did not touch `src/`.

## 4. The refusal band latches across unrelated actions

**MEASURED.** The calibration probe presses "Remove" on bare ground, which earns
`"Nothing was removed — there is no object on that tile, and none being built
there."` That sentence was still the whole content of `.hud__refusal` several
minutes and dozens of commands later, at both 900x600 and 1440x900 — including
while the Rooms panel showed a pending rectangle, and after a *successful*
`ZoneRoom`.

**READ.** Deliberate: `src/ui/hud/hud.ts:946-951` — *"a simulation refusal
[stays] until another replaces it or the session ends, which are the first
moments each sentence stops being true."* The previous pass recorded the same
thing from the worker side (`state-machine.ts:517`). Whether a refusal about an
action three minutes ago should still be the one sentence under the status strip
is a product question. **No cause and no impact are claimed for it here.**

## 5. Import and Export: an empty category, with the numbers

**MEASURED**, mouse-driven at 1440x900, on a fresh prison:

- **Export** fires a real `download` event; the file arrives and parses.
- **Import** of that same file is accepted, and the panel then states exactly
  what came back and what did not, verbatim: *"Restored: kernel tick and command
  queue, RNG stream states, world terrain and ownership, construction orders and
  undo/redo, entity id liveness, prisoners, needs, actions and cell assignments,
  jobs, containers and utility networks, doors, security sectors, guards and
  patrols, contraband, intelligence and searches, incidents, gangs and tunnels,
  prisoner and staff names. Not carried by this save version: room and topology
  caches (recomputed from the world), navigation caches and in-flight path
  requests (re-issued on the next tick)."*
- **Import of a non-save file** (`notes.txt`, `text/plain`, `hello, not a save`)
  is refused with a sentence that says what to do: *"That file is not a Lockstate
  save — choose a file exported from this game."*
- No `pageerror`, no console output, on any of the three.

Nothing to report. Recorded so nobody re-derives it.

## 6. The three tabs nobody had walked, at 900x600

**MEASURED**, fresh prison, verbatim:

- **Overview / Intake** — *"Admit a prisoner"* live, with *"A prison needs a cell
  before it can admit anyone. It does not need a free bed: an arrival with none
  waits until a bed is free."*
- **Security / Staff** — *"GUARD COVERAGE / 0 of 0 / Covered / This prison has the
  guards it asks for. / WHO TO HIRE / Guard Selected / Hire Guard · 80 / … /
  ON DUTY / 0 held · 0 free / Nobody is assigned right now."*
- **Regime** — *"TODAY'S BLOCKS / General Population 0% THROUGH / Allows Sleep /
  High Risk 0% THROUGH / Allows Sleep, Meal, Hygiene / PRISONERS / 0 of 0 /
  Nobody has been admitted yet."*

All three render, all three say what state they are in. The one line worth a
second look is Security's **"0 of 0 — Covered — This prison has the guards it
asks for"** on a prison with no guards: true, because an empty prison asks for
none, and it reads as reassurance at the moment a player has done nothing.
**No cause and no impact are claimed.**

## 7. The strongest thing this pass found: the Rooms panel calls a finished wall "open"

**This is the one finding here with a measured mechanism, and it lands exactly
on the ordering route.**

### What was done

Mouse-driven at 1440x900, on a fresh prison: buy 60 bricks, run the clock, lay
four wall runs around tiles 12..15 x 12..15 (16 `PlaceBuildOrder` commands), poll
the Build panel's queue **once a second** until it is gone, then re-drag the same
rectangle once a second and read the Rooms panel's note.

### What was seen, pasted

```
queue empty at page t=43395ms (poll 14)
t=49406ms (+6011ms after queue empty)  open=true
t=55580ms (+12185ms after queue empty) open=true
t=61038ms (+17643ms after queue empty) open=false
```

and the `simulation/snapshot` arrivals from the same run, timestamped on the
page's own clock by a `Worker` tee:

```
... {"t":28979,"tick":869},{"t":34695,"tick":1098},{"t":58999,"tick":2070}
```

Between `t=34695` and `t=58999` **no world snapshot arrived at all** — 24.3
seconds. The Build panel said the queue was empty at `t=43395`. The Rooms panel
went on calling the rectangle open until the first drag after `t=58999`.

The same thing at 900x600, in a separate run, with the consequence attached:

```
AREA block now: "Designate 4 × 4 | Discard | AREA | 4 × 4 tiles at 14, 13 |
                 OPEN ON AT LEAST ONE SIDE"
strip: ... | 1 | ROOMS | ...
--- .hud__refusal: {"hidden":true, ... ,"text":""}
```

The panel said *open*; the player pressed Designate anyway; **the simulation
accepted it** and `ROOMS` went 0 → 1.

### What would establish the cause

Two channels with different cadences, and the panel reads the slow one:

- The Build panel's queue comes over the **projection** channel
  (`src/ui/simulation-build-queue.ts:15` — *"Reads what is still waiting to be
  built, over the projection channel"*).
- The enclosure verdict comes from `RoomTool.classifyArea`
  (`src/ui/room-tool.ts:156`), which walks `WorldRenderView`
  (`src/rendering/world/world-view.ts:201-208`) — and that view is replaced only
  by a full **snapshot** (`src/rendering/feed/simulation-snapshot-feed.ts:523`).

The feed's own header says when it asks for one
(`src/rendering/feed/simulation-snapshot-feed.ts:41-46`), and the third bullet is
the load-bearing one:

> - after any command is accepted, since commands are what change geometry,
>   and again once the simulation reaches the tick that command was scheduled
>   for, which is when it actually changed any;

**For construction that last clause does not hold.** The tick a
`PlaceBuildOrder` is scheduled for is the tick the *order* is created. The wall
is built many ticks later, and a completion is not a command, so nothing marks
the feed dirty then. The next world the panel can read is the 30-second
consistency poll (`DEFAULT_POLL_INTERVAL_SECONDS = 30`,
`src/rendering/feed/simulation-snapshot-feed.ts:107`). The 24.3-second gap above
is that poll.

**This is a hypothesis with the timeline behind it, not a proven cause.** The
cheapest measurement that would settle it: mark the feed dirty when a
construction order completes and re-run the transcript above — if the window
collapses, the cause is named.

### What would establish the impact

Nothing in this repository. Nobody plays the game yet. What can be stated
without a player: the note is the Confirm control's `aria-describedby`
(`src/ui/hud/rooms-panel.ts:1126-1133`), so a screen-reader player is told the
rectangle is open at the moment they focus the button that would designate it.

### Why this is different from #493's accepted false negative

`src/ui/hud/rooms-panel.ts:1163-1190` accepts a false negative on purpose, and
bounds it: *"shown when it need not have been, it costs confusion for one press
and no more, because the control stays live and the real simulation still
decides"*, with the cause given as staleness *"for as long as the session stays
paused"*. Both halves are narrower than what was measured: the session was
**running** at x2, and the player who sees it has just been refused for this
exact reason and has just spent money and in-game time building the walls that
fix it. The panel then repeats the refusal's own sentence. That is not "one
press of confusion"; it is the game telling a recovering player their fix did
not work.

**Handed over rather than acted on** — this is `src/ui/**` and
`src/rendering/**`, and this pass is read-only on `src/`.

## 8. #492's fix holds. Verified, not assumed

Issue #492 — *"A simulation refusal outlives the thing it refused: a successful
zoning leaves the rejection on screen"* — was fixed by PR #496 with a **narrow**
supersession key (`src/simulation/runtime/session-commands.ts:148-163`: the same
rectangle and room type, and *"a room zoned elsewhere leaves a standing refusal
about this rectangle alone, because its key would not match"*).

**MEASURED**, walking exactly #492's steps at 900x600: refused 4x4 at (14,13),
band reads *"The room was not zoned — this room type must be enclosed…"*; walls
built; the same 4x4 designated again; `ROOMS` 0 → 1; and

```
--- .hud__refusal: {"hidden":true,"box":{"w":0,"h":0,"x":0,"y":0},"text":""}
```

Fixed, still fixed. Recorded so nobody re-derives it.

**What the narrow key leaves standing is a different sentence, and it was
measured too.** A refusal about anything the player never retries *at the same
target* stands for the whole session. The calibration probe presses Remove on
bare ground once; *"Nothing was removed — there is no object on that tile, and
none being built there."* was then the entire content of `.hud__refusal` three
in-game days later, in a working prison with 3 prisoners, 2 guards and 2 rooms.
That is the designed consequence of a per-target key, not a regression, and
whether the band should have a notion of age is the owner's call. **No cause and
no impact are claimed.**

## 9. A prison larger than one cell, with guards and prisoners and a whole day

**Not reached by the previous pass; reached here.** Mouse-driven at 1440x900, one
run, no keyboard except the purchase quantity field:

buy 160 bricks + 6 planks x2 + 6 bricks → run the clock → **eight** wall runs
(32 `PlaceBuildOrder`, two 4x4 perimeters) → two doors → zone both cells → four
objects → hire 2 guards → admit 3 prisoners → run to the next day.

It works. Verbatim, after a day:

```
3 PRISONERS | 2 STAFF | 2 ROOMS | 0 INCIDENTS Clear | 0 CONTRABAND |
17,420 FUNDS | 394 EARNED TODAY | DAY 3
REGIME: "TODAY'S BLOCKS / General Population 16% THROUGH / High Risk 3% THROUGH /
         PRISONERS 3 of 3 / Malik Tamm Sleeping Hygiene Minimal /
         Lars Balogh Sleeping Hygiene Minimal / Wanda Okafor Idle Bladder Minimal"
SECURITY: "GUARD COVERAGE 1 of 1 Covered ... ON DUTY 1 held · 1 free /
           Guard · Sector Post / Release"
INTAKE: "1 waiting with no bed to sleep in / IN INTAKE 1 of 3 / 1 at Cell Assignment"
```

Two beds for three prisoners, and the third waits at Cell Assignment — which is
what the Intake panel's own arrival sentence says will happen. No `pageerror`,
no console output, across the whole run.

**A note about the Security panel, which is #557 and not new:** it read
*"GUARD COVERAGE 0 of 0 / Covered"* immediately after two guards were hired and
*"1 of 1 / Covered"* a day later. That is ADR 0036's deliberate consequence,
already recorded; not re-reported.

## 10. What a player sees after a designation succeeds

**MEASURED.** The instant a designation is accepted, the Rooms panel folds
itself:

```
rooms panel immediately after success: catalogueVisible=false collapsed=true
.hud-rooms text: "ROOMS\nExpand"
```

and on returning to the tab to zone a second room:

```
Rooms panel on arrival: catalogue visible=false, panel data-collapsed=true,
                        header="ROOMS | Expand"
```

**READ, and it is deliberate.** `src/ui/hud/rooms-panel.ts:513` —
`folded()` is `drawingFolded` whenever the tool is armed with nothing pending,
and `drawingFolded` starts `true` on every arm press, *"because a panel that
covers the thing it operates on is not a panel the player can draw on"*
(`:439-465`). The tool stays armed, so the second rectangle can be dragged
without touching the panel at all.

What the fold costs is stated rather than judged: while it is shut, the panel
does not say **which room type is selected**, and changing it needs the header
pressed first. Nothing else confirms a designation — `.hud__event` was
`hidden: true` at every one of the seven dumps in that run, and the only change
on screen is the `ROOMS` count in the status strip. **No cause and no impact are
claimed.**

---

## Weakest claim, and the cheapest thing that would falsify it

**Weakest: that §2 is the owner's wall.** What is measured is that the word
"wall" never appears and that the rule is stated without the action. Nobody
observed the owner's session, and the previous pass made exactly this mistake
one level up — every premise checked, the conclusion invented.

**The single cheapest measurement that would falsify it:** ask the owner what
they tried after the refusal. If they had already built walls and were stopped
by something else, §2 is a nice-to-have and the cause is elsewhere.

**§7 is the stronger candidate and has its own weakest claim**: that the
30-second snapshot poll is *why* the note is wrong. The timeline fits and the
feed's own header names the rule that does not cover a construction completion,
but nothing in this pass instrumented the feed. **Cheapest falsification:** mark
the feed dirty on a completed construction order and re-run the one-second
transcript in §7. If the window survives, the cause is elsewhere.

## What this pass did not reach

- **A player.** Every impact statement above is withheld for that reason.
- **A trackpad.** §3's `wheel`-vs-pan question is open.
- **Riots, contraband, incidents.** Three in-game days, `0 INCIDENTS Clear`
  throughout; nothing was provoked.
- **Any viewport below 900x600**, and no phone.
- **The Regime tab's controls.** It was read at 900x600 and after a day; nothing
  on it was pressed.
- **Whether the finished walls are *drawn* during §7's window.** `structures`
  comes off the same snapshot as the world edges
  (`src/rendering/feed/simulation-snapshot-feed.ts:523-525`), so the same lag
  would apply, but no pixel was read. **Cheapest measurement:** screenshot the
  world at `queue empty + 2s` and at `+20s` and compare.
