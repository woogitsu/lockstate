# Playtest, mouse only: what a new player meets on the way to a first cell

Recorded 2026-08-29 against `origin/main` at `6c309fc` (v0.0.200), in a real
Chromium at 1440x900, driving `index.html` + `src/main.ts` -- not a harness
page. The script is `tests/browser/playtest-mouse-route.spec.ts`; every number
below is pasted from its output, and every `file:line` was opened.

The brief was the owner's: *"znajdź bugi i błędy grając, bo ja nie mogłem
postawić więzienia itp grając sam"* -- find bugs by playing, because I could
not build a prison playing on my own.

## 0. Calibration, corrected

Tile (0,0)'s top-left is screen **(-304, -574)** at 1440x900, and one tile is
64 screen px. Measured by bisecting a `RemoveObject` probe -- a press on bare
ground that changes nothing, so the measurement cannot disturb what it
measures -- not assumed.

The general rule that fits it is `(viewportW/2 - 1024, viewportH/2 - 1024)`:
the camera arrives centred on world (1024, 1024), which is the *corner* of
tile (16,16) = `NEW_PRISON_ORIGIN_TILE` (`src/main.ts:606`). The `(-224,-512)`
carried in the previous brief is that same rule at a 1600x1024 viewport, so it
was right and not portable.

## 1. The route dead-ends, and the game does not say so

Rooms tab -> Cell -> "Draw on map" -> drag a 4x4 rectangle -> "Designate 4 × 4".

The button is live. The press produces
`{"type":"ZoneRoom","roomId":"room.cell","x":17,"y":17,"width":4,"height":4}`.
The worker answers:

    "refusal":{"sequence":14,"tick":0,"reason":"zone.not-enclosed"}

`ROOMS` in the status strip stays `0`. No room row appears. Nothing on screen
changes. Every `PlaceObject` after that -- bed, toilet -- is refused
`place-object.outside-room`, also with nothing on screen.

**The refusal sentence exists and is correct.** It is in the DOM:

    [{"id":"refusal-14",
      "text":"The room was not zoned — this room type must be enclosed, and
              the area you drew is open on at least one side.Warning",
      "boxWidth":0,"boxHeight":0}]

Zero by zero. Three facts explain it, and none of them is a mistake on its own:

1. `src/ui/hud/hud-state.ts:51` -- `collapsedPanels: ['alerts']`, with the
   reason above it: *"Alerts start folded. The HUD frames the world and must
   not cover it; a list that is empty most of the time should not hold open a
   rectangle over the prison to say so."*
2. `src/ui/hud/hud.ts:1239` builds that section with **no `trailing`** badge.
   Measured on the arrival screen, the folded header has exactly two children,
   a chevron and the word ALERTS:
   `{"headerText":"ALERTS","ariaExpanded":"false","sectionCollapsed":"true",
     "childElementCount":2}`
   Contrast the Build panel's queue, which is *also* collapsed on arrival and
   *does* pass `trailing: queueCount` (`src/ui/hud/build-panel.ts:1521-1528`),
   so its folded header still reads "1 waiting · 0 being built".
3. Nothing un-folds it. The only `set-panel-collapsed` for `'alerts'` anywhere
   in `src/` is the header's own toggle (`src/ui/hud/hud.ts:1244`).

So the whole refusal channel -- about forty reasons in `REFUSAL_LABEL_KEYS`,
`src/ui/simulation-alerts.ts:34-73` -- is dark for a player who has not
happened to open a box that never asks to be opened.

**What would establish the cause:** the three lines above are the mechanism and
are opened; nothing further is needed for *why the row is 0x0*.
**What would establish the impact:** whether real players fail here, which this
repository cannot read. What can be said is that this playtest, told to build a
prison, could not, and could not find out why from the screen.

### Checked and withdrawn: the enabled Designate button

Leaving the control live over an open rectangle is deliberate and reasoned at
`src/ui/hud/rooms-panel.ts:1164-1190` (issues #493/#498): `classifyArea` can be
stale while the session is paused, and disabling on a stale `'open'` blocked
designations the simulation would have accepted. The panel warns instead --
measured, the note reads `"OPEN ON AT LEAST ONE SIDE"` before the press.

That reasoning ends in *"the control stays live and the real simulation still
decides"*. The simulation's decision is delivered through §1. The two
decisions are each defensible and compose into a dead end.

### The four requirement lines are not four of the same thing

A Cell prints one block: `"NEEDS AT LEAST 2 × 3 TILES\nMUST BE ENCLOSED\nNEEDS
1 × BED\nNEEDS 1 × TOILET"`. Measured, they behave in three different ways:

| line | when it applies | Designate |
| --- | --- | --- |
| NEEDS AT LEAST 2 × 3 TILES | before zoning | **disabled** (`rooms-panel.ts:1567`) |
| MUST BE ENCLOSED | before zoning | enabled, press refused, refusal invisible |
| NEEDS 1 × BED | after zoning | n/a |
| NEEDS 1 × TOILET | after zoning | n/a |

Two of the four are things you add later; that is the model the list teaches.
One of the other two silently is not.

## 2. The informed route works

Buy 60 bricks -> Fast forward -> lay four wall runs with the mouse -> wait for
construction -> then zone the same rectangle. Result: `"rooms":1`, and
`"zoning":{"sequence":1,"tick":2333,"enclosure":"sealed","requirement":"enclosed"}`.
The game is finishable with the mouse. The ordering is the whole difficulty,
and nothing states it.

## 3. Save, reload, load, after a mouse-built prison

Built with the mouse (four wall runs, a zoned Cell, a bed and a toilet), saved
with "Save now", navigated with `page.reload()`, loaded with "Load":

- before: `1 ROOMS`, `22,600 FUNDS`, day 2 18%
- after: `1 ROOMS`, `22,600 FUNDS`, day 2 20%
- the room comes back with its needs: `"NOT READY / 1 of 1 / Cell at 12, 12 is
  missing 1 × Bed"`
- the build queue comes back: `"1 waiting · 0 being built"`

Nothing was found missing. Two smaller things, stated as observations:

- The Rooms panel's *selection* resets to the first row ("Staff Room") after a
  load; it was "Cell" before.
- The alerts list is folded again after a load, as on any fresh page.

## 4. Doors, and objects beyond bed and toilet

Both reached, both correct as far as the command boundary goes.

- A drag along the south edge of row 15 produces `y:16, edge:"north"` -- the
  same edge, named from the other side.
- A door press on that edge produces
  `{"definitionId":"door-wooden","x":12,"y":16,"edge":"north"}`.
- The catalogue offers 21 rows: `wall-brick`, `door-wooden` and 19 objects.
  `object.sink` is in `src/content/object-catalog.ts:100` and is **not** in the
  catalogue -- and that is deliberate and documented at
  `src/simulation/construction/definition.ts:330`, *"`object.sink` is
  deliberately not here"*. Checked before reporting; not a defect.

## 5. Touch and pinch: nothing found

Never exercised on the assembled page before. All measured, all correct:

- `New prison`, the tab bar and the catalogue rows all answer `tap()`.
- A one-finger tap on the world with the wall tool armed produces
  `{"definitionId":"wall-brick","x":16,"y":13,"edge":"west"}` -- the nearest
  edge to the tapped point, correctly.
- A two-finger pinch-out about the viewport centre zooms: the *same* screen
  point (700,300) resolves to `y:13` before and `y:15` after, which puts the
  camera at roughly 3x. The pinch itself produced **0** stray commands.
- A one-finger drag with a tool armed lays a run rather than panning -- which
  is exactly what the panel's own hint promises: *"Drag along it to lay a run.
  Two fingers, the middle button or the arrow keys still move the camera."*

An empty category, and the numbers above are what establish it.

## 6. Smaller observations, cause not established

- **The refusal is a latch.** `src/simulation/worker/state-machine.ts:517`
  publishes `this._runtime.refusals.last` with every counts message. At tick
  2334 the payload still carried
  `"refusal":{"sequence":13,"tick":0,"reason":"remove-object.nothing-to-remove"}`
  from tick 0, and the alerts list still read that sentence after 2300 ticks in
  which nothing had been refused. The snapshot shape is deliberate
  (`state-machine.ts:451-494`); whether a stale warning with no timestamp is
  what a player should read when they finally open the box is a product
  question, not a measurement.
- **"Awaiting Materials" is one click away.** An order that can never start --
  a bed ordered when only bricks were bought -- reads `"1 waiting · 0 being
  built"` folded, and `"Brick wall · 12, 12 · North / Awaiting Materials /
  Cancel"` when the queue is opened. The reason exists; the folded state does
  not carry it. Much milder than §1, because the count badge is there.
- **A renderer warning at reload, not reproduced.** One
  `World renderer: TypeError: Failed to fetch at fetchJson
  (src/rendering/assets/atlas-library.ts:19)` appeared at a `page.reload()`
  issued while the clock ran at 2x. Three plain reloads produced none, and
  `/assets/actors/asset-registry.json` fetched `{"ok":true,"status":200}` from
  the reloaded page every time. The likely reading is the outgoing page's
  in-flight request being aborted by the navigation. **I did not establish
  that**, and I did not see the reloaded page lose its art.
- **The Rooms panel folds itself on every arm** (`rooms-panel.ts:444`, "starts
  folded on every arm") and again after a confirm. It reads as deliberate --
  get out of the way of the map -- and it cost this playtest a run before the
  script accounted for it. Whether a player finds their way back to a panel
  that closed itself is a question, not a finding.

## Weakest claim, and what would change my mind

The weakest is §1's *impact*: that the folded Alerts box is why the owner could
not build a prison. What I measured is that the explanation is 0x0 pixels and
that no affordance points at it. What I did not measure is the owner's actual
session -- they may have opened Alerts and read the sentence and been stopped by
something else entirely.

What would change my mind: the owner saying they had the Alerts box open, or a
second player getting through the zone step unaided with it still folded. Either
would move §1 from "this is the wall" to "this is a wall".
