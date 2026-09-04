# A tablet and nothing else — how far does a touch-only player get?

**Date:** 2026-09-04
**Tree played:** `0e614c7` (**v0.0.451**), in worktree `/workspace/wt-touch-only`
on branch `agent/playtest-touch-only`. Nothing under `src/` differs from that
commit — `git diff --stat 0e614c7 -- src/` is empty — and the running page
confirmed it from inside: the status strip read `v0.0.451 · 0dadbc6`, where
`0dadbc6` is this branch's instrument-only commit.

**Question, as given:** *a person picks this game up on a tablet. They have a
touchscreen and nothing else — no keyboard, no mouse, no right-click, no
hover, no scroll wheel. How far into Lockstate can they actually get?*

**The standard is the product's own.** `AGENTS.md` architectural boundary 10:
*"Input must support remapping, QWERTY/AZERTY and touch/pointer interaction."*
So the test is not whether a workaround exists — it is whether a touch-only
player is **led**.

**The two viewports, and why these two.** **1024×768 landscape** and
**768×1024 portrait**: one device, rotated. An iPad (9th/10th generation, and
the mini) reports exactly these CSS pixel sizes, so holding the device fixed
while turning it isolates *orientation* from *size* — every difference below is
the rotation and nothing else. 768 is also the interesting number:
`hud.css`'s narrow layout is `@media (max-width: 720px)`
(`src/ui/hud/hud.css:3716`) and `styles.css`'s is the same
(`src/styles.css:82`), so **a tablet held in portrait is 48px above the phone
breakpoint** and gets the full desktop rail.

---

## The verdict, in one paragraph

**A touch-only player gets all the way through — arrival, panning, zooming,
walls, a zoned room, objects, the clock, a guard and a prisoner — and every
single thing they cannot do is a thing they cannot *undo*.** The gesture layer
is the strongest part of this game: measured with real touch events, a
one-finger pan delivers exactly what it is asked for (+4 tiles for 256px) even
when the finger ends **on** the HUD rail (−5 of −6 at landscape, −9 of −8.4 at
portrait); two fingers pan the camera while the wall tool is armed and
submit **zero** build commands; a pinch zooms and un-zooms; the minimap takes a
tap; and across all five tabs at both viewports **not one visible control is
below the 44px tap target**. What fails is everything around the gesture. The
Build catalogue at tablet landscape is a **124px window on 924px of rows —
2 of 21 tappable** — and the Rooms catalogue a **153px window on 837px, 3 of
18, with `Cell` not among them**; a tap where a row's own coordinates say it is
lands on the *Remove* button or on the save panel, silently. On three of the
five tabs the save panel's **Export, Import, Load and Delete are all outside
its own 87px box**. Six controls on the arrival screen — the three clock
transport buttons included — carry their only words in a **hover tooltip**, on
a device that has no hover, while the primitive one directory over states the
rule they break. The one sentence that teaches the world tool tells this player
to *"Click"*, and offers three ways to move the camera of which **two do not
exist on a tablet**. And a finished wall still comes down only with `KeyZ`
(#928), which on this device means the first wall drawn in the wrong place is
in the prison for the rest of the session.

---

## Reproduction

`tests/browser/playtest-2026-09-04-touch-only.playtest.ts`, one act at a time.
Nothing in CI collects it — `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=5311 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-touch-only.playtest.ts -g "act 4"
```

| act | what it plays |
| --- | --- |
| 1 | the arrival screen, all five tabs, every control's box, and every hover tooltip |
| 2 | the camera: one-finger pan, pans that cross the HUD, two fingers while armed, pinch, the clamps |
| 3 | every tab's scroll containers and every control a tap at its own centre does not reach |
| 4 | the whole game with fingers, tablet **landscape** |
| 5 | the whole game with fingers, tablet **portrait** |
| 6 | getting out of a mistake with no keyboard |
| 7 | the **WHERE** readout on a device with no hover |
| 8 | the Build and Rooms catalogues: geometry, `touch-action`, three gestures |
| 9 | the discriminator for act 8's split result |

**The instrument never calls `page.mouse` or `page.keyboard`.** That is not a
flourish. `playtest-harness.ts`'s `press`, `drag`, `calibrate`, `armBuildable`,
`buy` and `buildAndPopulate` all drive the game with the mouse, and
Playwright's `locator.click()` is a *mouse* click even inside a `hasTouch`
context — so a touch playtest built on them would measure a mouse and report
about a finger. Taps go through `page.touchscreen.tap`; drags and every
multi-finger gesture go through CDP `Input.dispatchTouchEvent`, for the reason
`tests/browser/world-scene-touch.spec.ts` gives (one `page.touchscreen` finger
cannot express a second). Everything a finger does not touch — `installTee`,
`sentCommands`, `currentTick`, `panelText`, `latestCounts` — is reused
unchanged.

**Presses were proved to land.** Every world press is preceded by
`document.elementFromPoint` at the exact point and the act fails if anything
but the canvas is on top; every HUD tap is preceded by the same check against
the control itself. **Two of this round's findings are that check failing**
(§2, §3), and three of this round's *instrument faults* are it failing on me
(§11).

**LFS.** `git lfs checkout` was run in the worktree first;
`file public/assets/actors/actor.guard.base.idle.png` → `PNG image data, 260 x
3104`. No claim here is about rendering, but a worktree that had skipped it
would have run green with no art.

**No claim rests on wall-clock time.** The box was at a one-minute load average
of 12.8–14.9 with four other testers' browsers live; every timing claim is in
simulation ticks read from `simulation/clock-state`.

**What was already on record, and is not re-reported as new.** #517 (on a
*phone* the Build panel covers the whole map while the hint says "point at the
world"), #899 (at 375×812, 8.2% of the viewport is canvas — its table also
already carries **1024×768 at 49.6% and 92 press-reachable tiles**, which this
round reproduces to the tile), #902 (both catalogues hide three quarters of
themselves; corrected, then closed) and #928 (a finished wall comes down only
with `KeyZ`). Where a finding below extends one of those it says so in its
first line.

---

## The findings

### 1. The Build catalogue at tablet landscape is a two-row window on twenty-one rows, and the Rooms catalogue does not show `Cell` at all — extends #902 with tablet numbers

**MEASURED**, act 8, both viewports, on a fresh prison:

```
[landscape 1024x768] catalogue with the Buy disclosure folded: {"box":"238x124 at 761,352","clientHeight":124,"scrollHeight":924,"rowsInList":21,"rowsWhollyInsideTheBox":2,"overflowY":"auto"}
[landscape 1024x768] catalogue with the Buy disclosure OPEN:   {"box":"238x88 at 761,291","clientHeight":88,"scrollHeight":924,"rowsInList":21,"rowsWhollyInsideTheBox":2,"overflowY":"auto"}
[landscape 1024x768] of 21 catalogue rows a finger can tap 2: ["wall-brick","door-wooden"]
[landscape 1024x768] the Rooms catalogue: {"clientHeight":153,"scrollHeight":837,"rows":18,"tappable":3,"tappableIds":["room.staff-room","room.classroom","room.canteen"]}

[portrait 768x1024] catalogue with the Buy disclosure folded: {"box":"238x316 …","rowsWhollyInsideTheBox":7}
[portrait 768x1024] catalogue with the Buy disclosure OPEN:   {"box":"238x158 …","rowsWhollyInsideTheBox":3}
[portrait 768x1024] of 21 catalogue rows a finger can tap 4: ["wall-brick","door-wooden","bed-wooden","bench-wooden"]
[portrait 768x1024] the Rooms catalogue: {"clientHeight":345,"scrollHeight":837,"rows":18,"tappable":8,"tappableIds":["room.staff-room","room.classroom","room.canteen","room.kitchen","room.cell", …]}
[portrait 768x1024] … catalogue now: {"box":"238x88 …","rowsWhollyInsideTheBox":2}   ← after buying materials
```

**VERIFIED, read.** `src/ui/hud/hud.css:1256-1262` — `.hud-build__list` is
`min-height: var(--hud-build-catalogue-floor); overflow-y: auto`.
`src/ui/tokens.css:415` — that floor is `calc(2 * var(--tap-target))`, and
`src/ui/tokens.css:390` puts `--tap-target` at 44px, so the floor is exactly
the two rows measured. `src/ui/hud/hud.css:1740` drops it to **one** row while
a build queue exists (`.hud-build[data-queued]`).

**REASONED.** This is #902's ratio, at the viewport #902 did not measure. Its
own corrected numbers are *5 whole rows of 21* and *5 of 18* at 1440×900, with
`Cell` the **fifth and last wholly-visible row**; rotating the same page to a
landscape tablet takes that to 2 and 3, and `Cell` off the box. #902's comment
also says *"`Cell` … is below the fold at 1280×800 … and at 900×600"*, so
1024×768 lies inside a range it already suspected — this is the tablet
instance, with the figure.

**And on a tablet #902's "instrument artefact" resolves the other way.** #902
was narrowed because Playwright adds `--hide-scrollbars` to every headless
launch, and with the flag off all three boxes answer 15px. Its own comment then
concedes what remains: *"overlay scrollbars (macOS, iOS, Android, ChromeOS)
have no width and paint only during a scroll the player has no reason to
start."* A tablet is exactly that platform, so the *originally filed* condition
— a list with more below rendering identically to a list that has ended — is
the tablet's real condition, not the artefact. **This is REASONED from #902's
verified reading, not measured here**: this suite cannot make a scrollbar
appear, which is that comment's other finding. The proven edge-fade fix was
built and then **withdrawn** (`13c50289`, *"revert(hud): withdraw the edge
fade; #902 is not this file's to decide"*), so nothing in the tree at v0.0.451
paints a sign — `grep -n "background-attachment" src/ui/hud/hud.css` is empty.

**Player cost, and how sure.** High confidence on the numbers, high on the
cost. `Cell` is the room the game's own refusal chain points a newcomer at
(`2026-09-04-the-first-ten-minutes.md`), and on a landscape tablet it is not
where a tap can reach it. `Bed` is not tappable either — act 4 needed **one
finger drag** on the list to buy one, and then **one drag back the other way**
to re-arm `Wall`, because the catalogue keeps its scroll position and `Wall` is
the *first* row.

### 2. A tap where a catalogue row says it is lands on another control, and nothing says so

**MEASURED**, acts 3 and 4. The instrument's own guard is the evidence: it
compares `document.elementFromPoint` at a control's centre with the control,
and act 4's first landscape run **died** on it:

```
Error: tapping .hud-build__list [data-buildable="bed-wooden"] at (880,400.5625)
  Expected: "OK"
  Received: "button.ui-action hud-build__remove"
```

The same for `wall-brick` after the list had been scrolled, twice, differently
per viewport:

```
[arm wall-brick] a tap where .hud-build__list [data-buildable="wall-brick"] says it is lands on div.save-panel__actions instead
[arm wall-brick] a tap where .hud-build__list [data-buildable="wall-brick"] says it is lands on select.hud-build__category instead
```

Act 3 enumerates the whole set per tab. At **landscape**: 22 controls on the
Build tab, 20 on Rooms, 4 on Security, **0 on Overview and 0 on Regime**. At
**portrait**: 18, 15, 0, 0, 0. Each row names what a tap reaches instead —
`Bench` → `button.ui-action`, `Bookshelf` → `span.ui-value`, `Chair` →
`span.ui-eyebrow`, `Desk` → `button.ui-section__header`, `Fridge` → `canvas`,
and everything past that → `null` (off the viewport entirely).

**Why it matters more than "scroll to it".** The rows land on *other live
controls*. `Bench`'s coordinates sit on a `ui-action` — on the Build tab that
is *Place on map* or *Remove*. So a player who taps at the place a row
occupies does not get nothing; they get **a different action**, and the only
sign is that the arm state changed.

**Player cost:** JUDGEMENT, and I am confident: this is the class of failure
this repository has already paid for three withdrawn findings on, from the
tester's side. A player has no `elementFromPoint`.

**Known?** Not in this form. #902 is about not knowing there is more; this is
about what the coordinates of a hidden row *do*.

### 3. On three of five tabs the save panel's Export, Import, Load and Delete are all outside its own box

**MEASURED**, act 3, landscape:

```
[landscape 1024x768 · build] scroll containers …: {"selector":"aside.save-panel","scrollHeight":240,"clientHeight":87,"overflowY":"auto","touchAction":"auto"}
[landscape 1024x768 · build] controls a tap at their own centre does NOT reach:
   button.save-panel__button "Export" -> hit canvas.
   button.save-panel__button "Import" -> hit canvas.
   button.save-panel__button "Load"   -> hit div.ui-panel__body
   button.save-panel__button "Delete" -> hit div.ui-panel__body
```

The same four on the Rooms tab and on the Security tab; **none** on Overview or
Regime, where the rail gives the panel its full 320px. At portrait it is `Load`
and `Delete` on the Build and Rooms tabs.

**VERIFIED, read.** `src/styles.css:56-73` — `.save-panel` is
`width: var(--hud-rail-panel-width); overflow-y: auto` with *"no `max-height`
of its own on purpose"*, taking its height from the rail. So the panel shrinks
to 87px when a tab panel wants the rail, and its buttons keep their layout
position outside it.

**Player cost:** the whole save/load/delete surface. A player who wants to save
before doing something risky must first notice that an 87px box holding 240px
of content has more in it, and drag it. HIGH confidence in the measurement,
JUDGEMENT on the cost — but note that `2026-09-04-does-a-prison-come-back.md`
already established that this game **autosaves and never says so**, which makes
an unreachable *Save now* worse than it looks.

### 4. Six controls on the arrival screen carry their only words in a hover tooltip — the three clock buttons among them

**MEASURED**, act 1, identical at both viewports:

```
[landscape 1024x768] text that exists only in a hover tooltip: [
 { "selector": "button.ui-icon-button",      "title": "Pause",                        "paintedText": "" },
 { "selector": "button.ui-icon-button",      "title": "Play at normal speed",         "paintedText": "" },
 { "selector": "button.ui-icon-button",      "title": "Fast forward",                 "paintedText": "" },
 { "selector": "button.ui-icon-button",      "title": "Collapse",                     "paintedText": "" },
 { "selector": "button.display-scale__cycle","title": "Change the interface scale",   "paintedText": "100%" },
 { "selector": "button.ui-icon-button",      "title": "Collapse",                     "paintedText": "" }
]
```

`paintedText` is the element's text with every `.ui-sr-only` descendant
removed, because `src/ui/primitives/primitives.css:73-83` clips those to
`inset(50%)` — present to `innerText`, invisible on the glass.

**VERIFIED, read, and the two primitives contradict each other.**
`src/ui/primitives/icon-button.ts:33` puts the label in
`attributes: { type: 'button', title: options.label }` and in a
`screenReaderText` span, and nowhere else.
`src/ui/primitives/action-button.ts:8-10`, one file over, states the rule:

> *"It carries a visible word, not a glyph and not a keyboard letter. **Touch
> has no hover, so a tooltip is not a label**, and a shortcut letter printed on
> a control is meaningless on a device with no keyboard — `docs/INPUT.md`."*

`createIconButton` is used by the three transport buttons
(`src/ui/hud/status-strip.ts:159,165,171`), by every panel's collapse chevron
(`src/ui/primitives/panel.ts:49`) and by every list-row action
(`src/ui/primitives/list-row.ts:163`) — which is what the **alerts Dismiss**
control is (`src/ui/hud/hud.ts:2093-2129`, `icon: 'dismiss'`).

**Player cost.** The clock is the one true dead end this repository has already
measured — `2026-09-04-the-first-ten-minutes.md`: *"24 orders placed, 1,920
already spent, `24 waiting · 0 being built`, … and `/clock/i` matches nothing
in the whole laid-out HUD — one press of Play builds it."* On a desktop a
puzzled player hovers the three glyphs and reads *"Play at normal speed"*. On a
tablet there is nothing to hover: the words exist, are keyed, are shipped, and
are unreachable by this device. That is the same shape as #903 and #928 —
*"it works with a keyboard"* not satisfying boundary 10 — one input mode over.

### 5. The one sentence that teaches the world tool is written for a mouse and a keyboard

**VERIFIED, read.** `src/content/default-locale-en.ts:1216`:

> `'hud.build.arm-hint': 'Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera.'`

and `:1253`, for objects:

> `'hud.build.arm-hint-object': 'Click a tile inside a designated room to place it. One press, one object. Two fingers, the middle button or the arrow keys still move the camera.'`

**MEASURED**, act 2 — the sentence renders in full at both tablet viewports and
is not clipped (`scrollHeight=53 clientHeight=53 clipped=false`), so this is
about its words and not its box.

Of the three camera routes it names, **one exists on a tablet**. There is no
middle button and no arrow keys: `src/input/bindings.ts:11-35` binds
`ArrowUp/Down/Left/Right`, `Equal` and `Minus` to `device: 'keyboard'`, and
`DEFAULT_KEYBOARD_BINDINGS` is the only binding table in the file. The verb is
*"Click"*. And the Rooms tool's hint —
`'hud.rooms.arm-hint': 'Drag a rectangle across the tiles this room should
cover.'` (`:1933`, rendered at `src/ui/hud/rooms-panel.ts:1316`) — names **no
camera route at all**, on the tab where a room bigger than the reachable
square has to be drawn (§6).

**Player cost:** JUDGEMENT. Two thirds of the help is inapplicable, and the
third that applies is the one a tablet player is least likely to guess. Under
`AGENTS.md`'s partly-released fourth exclusion this is now ours to word — and
the rule there is *verify, then write*, so the replacement has to name what the
code actually binds for the device it is being read on.

### 6. At tablet landscape the largest cell a finger can draw without moving the camera is 4×4, and three room types need more

**MEASURED**, act 4 and act 5, after a real touch calibration of the
screen-to-tile transform:

```
[landscape 1024x768] calibration: tile (0,0) top-left at (-512, -640)
[landscape 1024x768] tiles a finger can reach without moving the camera: 92 spanning x 8..23, y 11..21
[landscape 1024x768] the largest square cell a finger can draw in one camera position -- every point of its
                     closed rectangle, sampled every half tile, on canvas: 4x4 at {"x0":15,"y0":12}
[portrait 768x1024]  tiles a finger can reach without moving the camera: 80 spanning x 10..21, y 9..23
[portrait 768x1024]  the largest square cell a finger can draw in one camera position … 6x6 at {"x0":10,"y0":10}
```

**Turning the tablet is the fix, and it is a large one.** Portrait has *fewer*
reachable tiles than landscape — 80 against 92 — and a **larger drawable cell**:
6×6 against 4×4, because the rail takes a column out of the middle of a
landscape screen and leaves an L, while a portrait screen leaves a tall
rectangle. Nothing in the game says so.

The 92 reproduces #899's *"92/192 press-reachable tiles"* at this viewport to
the tile, from an independent instrument. **What is new is the second line**:
92 reachable tiles are not 92 *usable* ones, because a wall run is aimed at a
tile **edge**, so a cell of side `s` needs every point of its closed rectangle
— sampled every half tile, `(2s+1)²` lattice points — on canvas. That takes
the landscape figure from a **reachable** 92 tiles to a **drawable** 4×4.

**VERIFIED, read.** `src/content/room-catalog.ts:124` — `room.canteen` carries
`{ type: 'minimum-size', minWidth: 6, minHeight: 6, minTiles: 36 }`, and `:144`
and `:149` carry two more at **5×5**. `room.cell`'s own minimum is only 2×3
(`:94`), so **the starter cell is not what this blocks** — three room types
are, and so is the 6×6 the shared harness and every prior playtest build.

**The workaround exists and is not free.** Two fingers pan while the tool is
armed (§8), so a player can pan mid-build; and a pinch zooms out, which shrinks
a tile below 64px and buys reach at the cost of aim. Neither is mentioned by
the Rooms hint, which is the panel where a canteen is drawn (§5).

**Player cost:** MEASURED constraint, JUDGEMENT on cost. Nothing refuses the
player; they simply cannot complete one gesture, and the failure mode of trying
is a rectangle that ends where the HUD begins.

### 0. The whole game does come out, at portrait, with nothing but fingers

Recorded first among the numbers because it is the answer to the question as
asked. **MEASURED**, act 5, one uninterrupted touch run at 768×1024:

```
[portrait 768x1024] the largest square cell a finger can draw in one camera position … 6x6 at {"x0":10,"y0":10}
[portrait 768x1024] wall run north: 6 command(s)   south: 6   west: 6   east: 6
[portrait 768x1024] queue after the four runs: "QUEUED\n11 waiting · 1 being built"
[portrait 768x1024] the Build panel says the queue is empty … tick 2815
[portrait 768x1024] designate attempt 1: rooms=1 | panel said ["OPEN ON AT LEAST ONE SIDE","MUST BE ENCLOSED"]
[portrait 768x1024] bed at (11,11): 1 command(s)   (12,11): 1   (13,11): 1
[portrait 768x1024] after building: rooms=1 accommodationCapacity=3
[portrait 768x1024] after one Hire tap: staff=1
[portrait 768x1024] after one Admit tap: prisoners=1 roomOccupants=1
[portrait 768x1024] status strip: … 1 PRISONERS … 1 STAFF … 1 COVERAGE Covered … 1 ROOMS … 22,260 FUNDS | 161 EARNED TODAY | DAY 3 …
```

New prison, materials bought, clock started, a 6×6 cell walled in four
finger drags, the rectangle **accepted on the first designation attempt**,
three beds placed, a guard hired and a prisoner admitted **into a bed**
(`roomOccupants=1`, not merely `prisoners=1`) and earning — all of it with
`page.touchscreen` and `Input.dispatchTouchEvent` and nothing else. Two finger
drags on a catalogue were needed along the way (§1); nothing was blocked.

That is boundary 10 kept, at one of the two orientations, and it is the
strongest single result of this round.

### 7. Getting out of a mistake: #928 reproduced with a finger, and the only visible way-back control on the Build tab is one that cannot do it

**#928 already owns the headline** — a finished wall comes down only with
`KeyZ`. Its evidence was six *mouse* presses. **MEASURED here with a finger**,
act 6, at 1024×768, after a four-segment wall run was placed and built:

```
[mistake] the mistaken wall run: 4 × PlaceBuildOrder wall-brick x=15..18 y=13 edge=north
[mistake] the Remove control reads "Stop removing"
[mistake] Remove tapped exactly on the wall edge:            [{"type":"RemoveObject","x":15,"y":13}]
[mistake] Remove tapped on the tile the wall belongs to:     [{"type":"RemoveObject","x":15,"y":13}]
[mistake] refusal band: "Nothing was removed — there is no object on that tile, and none being built there."
[mistake] re-arming and re-tapping the same edge: [{"type":"PlaceBuildOrder", … x=15,y=13,edge:"north"}]
[mistake] refusal band after re-tapping the edge: "The build order failed — that order already exists."
```

So the touch route submits a real command and is answered with a sentence
saying **there is nothing there**, on a tile a wall is standing on. The second
probe is weaker than it looks and is reported as such: *"that order already
exists"* establishes that the order at that edge persists, which is consistent
with a standing wall but is not the same statement.

**VERIFIED, read.** `src/simulation/objects/object-placement-service.ts:582-620`
— `remove` looks at `this.placedObjects.objectAt(tile)` and then at
`this.orderBuildingObjectAt(tile)`, and refuses `'nothing-to-remove'`
otherwise. **No wall edge appears anywhere in it.** That is #928's protocol
sweep confirmed from the other end.

**And the whole vocabulary of getting back is invisible here.** Act 6's last
reading is every control on screen whose words suggest undoing something, at
1024×768 on the Build tab with one order queued:

```
[{"text":"Delete","className":"save-panel__button","visible":true},
 {"text":"Remove","className":"ui-action","visible":true},
 {"text":"Cancel","label":"Cancel: 2 × Wood Plank · 130 back","visible":false},
 {"text":"Cancel","label":"Cancel: 20 × Brick · 800 back","visible":false},
 {"text":"Cancel","visible":false}, {"text":"Cancel","visible":false},
 {"text":"Cancel","visible":false}, {"text":"Cancel","visible":false},
 {"text":"Remove rooms","visible":false}]
```

**Two visible, seven not.** The two are `Remove` — which the lines above show
cannot take a wall down — and the save panel's `Delete`, which deletes the
whole prison. Six `Cancel` controls exist and none of them is laid out.

**Why they are not laid out, exactly, and it is milder than it looks.** The
queue block arrives **folded**: `.hud-build__queue` reads *"not laid out"* while
`data-queued` is `"1"` and the queued section's own header is a live 246×44 tap
target at `(757, 695.9)` reading `Queued1 waiting · 1 being built`. And that
fold is deliberate — `src/ui/hud/build-panel.ts:2010` says *"`queueSection`
opens collapsed, on purpose and with a measurement behind it"*, with #625 cited
as the record of what putting a *requirement* inside it once cost. So the
cancel of a **pending** order is one tap on a reachable header away. It is the
cancel of a **finished** one that does not exist, which is #928.

**The one thing that does work, and nothing says it does.** A second finger
arriving mid-run abandons the run: `[mistake] a second finger mid-run produced:
[]` — zero commands from a six-step wall drag that was interrupted. That is
`src/rendering/scene/world-scene.ts:558-563`'s claim, executed with fingers at
a tablet viewport (#517 measured it at 375×812). It is the touch analogue of
`Escape`, which `src/input/bindings.ts:36` binds to the keyboard and nothing
else — and **the on-screen sentence describes two fingers as the way to move
the camera, never as the way to cancel** (§5).

### 8. What works, and it is most of the gesture layer

Reported because an empty category backed by numbers is a result, and because
this is the half of boundary 10 that is kept.

**MEASURED**, act 2, at both viewports, with the whole gesture inside the
measured unobstructed square. The instrument reads the tile under a fixed
screen point through a real `Remove` press, so it is quantised to **±1 tile**;
that matters below.

```
[landscape] one-finger drag of 256px leftward, entirely on canvas, no tool armed -> tile x 17 -> 21 (a full pan: +4 tiles)
[portrait ] one-finger drag of 408px leftward, entirely on canvas, no tool armed -> tile x 13 -> 20 (a full pan: +6.375 tiles)
[landscape] one-finger drag of 384px rightward that ends ON the HUD rail        -> tile x 21 -> 16 (a full pan: -6.0 tiles)
[portrait ] one-finger drag of 536px rightward that ends ON the HUD rail        -> tile x 20 -> 11 (a full pan: -8.4 tiles)
[landscape] one-finger drag while armed produced 4 command(s) … wall-brick x=15..18 y=17 edge=north
[portrait ] one-finger drag while armed produced 4 command(s) … wall-brick x=10..13 y=17 edge=north
[landscape] two-finger pan of 128px while the wall tool is armed: 0 build command(s), tile x 16 -> 18
[portrait ] two-finger pan of 204px while the wall tool is armed: 0 build command(s), tile x 11 -> 15
[landscape] pinch out 100->240px (x2.40): ~240px per tile;  after eight more pinches out: ~240px per tile
[landscape] pinch back in 240->100px: ~60px per tile;       after sixteen pinches in:    ~13px per tile
[portrait ] pinch out 100->240px (x2.40): ~131px per tile;  after eight more pinches out: ~196px per tile
[portrait ] pinch back in 240->100px: ~49px per tile;       after sixteen pinches in:    ~13px per tile
```

So: **a one-finger pan is exact** (+4 of +4, +7 of +6.375); **a horizontal pan
that ends on the HUD rail is not stolen** (−5 of −6 and −9 of −8.4, both inside
±1); a one-finger drag while armed builds instead of panning, exactly as the
modal arbitration promises; two fingers pan the camera *while a tool is armed*
and submit **nothing**, which is the property `docs/INPUT.md`'s gesture bullet
asserts and `src/rendering/scene/world-scene.ts:558-563` implements; and
**both ends of `ZOOM_BOUNDS` are reachable by finger** — the clamped-out
reading of ~196px per tile at portrait against the 192px that `max: 3` predicts
for a 64px tile, and ~13px against the 12.8px `min: 0.2` predicts, at both
viewports.

**One reading in this set is not clean and is reported as unresolved.** The
*vertical* pan that ends on the status strip came back **+3 tiles at both
viewports**:

```
[landscape] one-finger drag of 214px upward, ending ON the status strip (bottom edge y=78) -> tile y 13 -> 16 (a full pan: +3.3 tiles)
[portrait ] one-finger drag of 290px upward, ending ON the status strip (bottom edge y=78) -> tile y 13 -> 16 (a full pan: +4.5 tiles)
```

Landscape is complete within ±1. **Portrait is a tile and a half short**, and
+3 is what a pan truncated where the finger crosses `y=78` would give
(328 − 78 = 250px = 3.9 tiles) rather than what the full 290px would. That is
one sample per viewport and the two disagree, so this is a **measurement, not a
diagnosis**: I do not know whether the vertical crossing loses part of the
gesture, and I have not established a cause or a cost. What would settle it is
the same drag repeated at several lengths with the *camera* read directly
(`world-scene-harness.html` exposes `scroll()`, which is not quantised) rather
than through a tile press. **No camera bound is involved** — `grep -rn
"setBounds\|worldBounds" src/rendering/` is empty. Note also that the
horizontal crossing at **portrait** is unambiguous (full travel, truncation
would have given −7), so whatever this is, it is not "the HUD always takes the
rest of the gesture".

**Every visible control clears the tap target, everywhere.** Act 1, all five
tabs, both viewports: *"17 visible control(s); **0 below the 44px tap
target**"*, *"43 visible control(s); 0 below the 44px tap target"*, and so on
for all ten combinations. The `+` stepper on the buy field measures exactly
`44x44` (act 6). I expected this to fail somewhere and it does not.

**The minimap is a second camera route a finger can use.**
`src/ui/hud/hud.ts:1513` — `minimapSurface.addEventListener('click', …)`, and a
touch tap produces a click. On arrival it says `MINIMAP IS NOT AVAILABLE YET`
and occupies 684 of the reach grid's cells (≈5.6% of a landscape tablet
screen), which is a separate matter for the world-view surface.

### 9. The WHERE readout tells a finger nothing until the finger has already committed

**MEASURED**, act 7, both viewports:

```
[landscape 1024x768] before anything is armed:                 "WHERE\nPoint at the world"
[landscape 1024x768] armed, finger not yet down:               "WHERE\nPoint at the world"
[landscape 1024x768] one finger down and still, no movement:   "WHERE\n17, 13 · West"
[landscape 1024x768] mid-drag, 128px along:                    "WHERE\n3 × North from 17, 14"
[landscape 1024x768] after the finger lifts:                   "WHERE\nPoint at the world"
```

**VERIFIED, read.** `src/rendering/scene/world-scene.ts:583-588`, on the branch
that feeds this readout before a press: *"Nothing is being built and no button
is down: keep the ghost under the cursor so the edge rule is legible before the
first click. **Touch never reaches here**, which is why the drag preview exists
as well."*

So the readout is honest and it is live — but for a mouse it answers *before*
the commitment and for a finger only *during* one. The consequence is specific
rather than general: a wall run **extends from where the finger landed**, so a
player who reads `17, 13 · West`, sees it is wrong, and slides to the right
edge gets a run starting at the wrong place rather than a run in the right one.

### 10. Buying by finger costs one tap per unit unless the soft keyboard is used

**MEASURED**, act 6: *"buy quantity field starts at `"2"`; one tap on + gives
`"3"`"*, and *"the + stepper is 44x44"*.

**VERIFIED, read.** `src/ui/primitives/number-field.ts:119-151` — the field is
`inputmode: 'numeric', step: '1'` with a `−` and a `+` button each incrementing
by one. So 60 bricks is 58 taps by stepper, or a tap on the field and three
keystrokes on the tablet's numeric soft keyboard. The soft-keyboard route is
real and `inputmode: numeric` is exactly the attribute that makes it pleasant;
this is friction rather than a wall, and it is recorded because the alternative
route is 58 taps.

---

## Two things this round refutes

**A horizontal pan that crosses the HUD is not truncated on touch.** This act's
*first* run reported a one-finger pan delivering about a third of what it was
asked for, and the finger had ended under the status strip. That reading was an
instrument fault — the gesture started 40px inside the free square's corner and
left the square almost immediately. The corrected act measures the crossing
deliberately in both axes: **horizontally it is complete at both viewports,
unambiguously so at portrait**; vertically it is complete at landscape and a
tile and a half short at portrait, which §8 reports as unresolved rather than
resolving in either direction. #878's truncation was a *mouse* defect (#898
fixed it) and #899 says so in terms: *"It is not a touch-input problem. Touch
never lost its moves."* That holds for the horizontal case here, measured
independently on a tablet; the vertical sample is the one thing in this round I
would not put weight on.

**`touch-action` is not what stops a flick, and the flick that failed was my
instrument.** Act 8 measured two one-finger scrolls of the same list
disagreeing: `Input.synthesizeScrollGesture` moved `.hud-build__list` by 0 and
a raw `Input.dispatchTouchEvent` drag moved it by 185, at the same point over
the same distance. The hypothesis was `styles.css:22`'s
`html, body { touch-action: none }` beating `hud.css:59-69`'s
`touch-action: auto` opt-in by the spec's intersection rule. **Act 9 refutes
it**: with `html`/`body` relaxed to `auto` from the test, the synthesised flick
still answers 0. And the raw drag is the trustworthy instrument, because it was
shown to *respect* the property — 0 with the list itself set to
`touch-action: none`, 185 with that put back:

```
[touch-action] synthesised finger flick as shipped:                                    scrollTop 0 -> 0
[touch-action] with html/body relaxed to auto (TEST-ONLY, nothing under src/ changed): scrollTop 0 -> 0
[touch-action] a raw one-finger drag, as shipped:                                      scrollTop 0 -> 185
[touch-action] the same raw drag with the LIST ITSELF set to touch-action: none:        scrollTop 0 -> 0
[touch-action] and with it put back:                                                   scrollTop 0 -> 185
```

So **the catalogues do scroll by finger.** §1 is a geometry finding, not a
reachability wall, and this note exists so nobody reads it as one.

---

## Instrument faults, recorded rather than hidden

Three, all mine, all caught by the guard rather than by luck.

1. **Gestures anchored 40px inside the free square's corner.** At portrait that
   put one pinch finger at `x=-6`, off the viewport, and returned nonsense in
   both directions (`3 -> 2 -> 1` for a pinch out then a pinch back in); at
   landscape it ran a pan under the status strip. Every act-2 gesture is now
   confined to the measured square. **The first act-2 log is discarded.**
2. **The reachable-cell search required only tile centres.** A wall run is
   aimed at an edge, so both end-to-end acts died — `wall north start:
   (416,64) is covered by span.ui-eyebrow.ui-stat__label` and `(32,64) is
   covered by div.ui-stat`. The search is now a half-tile lattice over the
   closed rectangle. **The 5×5 and 6×6 figures in §6 are from the corrected
   search.**
3. **Written-down tile coordinates.** Act 6 used tiles (6,6)/(12,6)/(6,10),
   which are fine at 1440×900 and off-screen at 1024×768 where the calibrated
   origin is `(-512,-640)`: `mistaken wall start: (-96,-256) is covered by
   NOTHING`. Both end-to-end acts and the mistake act now take their
   coordinates from the measured reachable block. **This corrected the headline
   figure in §6 downward**: the centres-only search answered 5×5 at landscape
   and the half-tile search answers **4×4**. The 5×5 figure appears nowhere in
   this record.

And one belonging to somebody else's surface, noted in one line and not chased:
**a world tap before `New prison` submits nothing and says nothing.** The
intent reaches `ObjectTool.place` and the host refuses it with *"No simulation
session is running yet, so the order cannot be submitted."* to `console.warn`
and to no surface a player can see. Measured once, by act 2 failing without a
`New prison` tap.

---

## What I did not reach

- **A real device.** Everything here is Chromium with `hasTouch: true` at a
  tablet viewport, driven through CDP. That reproduces CSS-pixel layout and the
  touch event stream; it does not reproduce a physical finger's contact area,
  an overlay scrollbar, iOS Safari's gesture arbitration, or the on-screen
  keyboard resizing the viewport when the buy field takes focus. §1's
  overlay-scrollbar sentence is REASONED from #902's reading for exactly this
  reason.
- **`isMobile: true`.** The runs set `hasTouch` and an explicit viewport, and
  left Playwright's `isMobile` off, so the page was not served with a mobile
  viewport-meta emulation or a mobile user agent. `index.html` does carry
  `width=device-width, initial-scale=1.0, viewport-fit=cover`, so a real tablet
  lands on the same CSS pixel sizes; a device-pixel-ratio difference would not
  move any figure here.
- **Interface scale.** `--tap-target` is `calc(44px * var(--ui-scale))` and the
  strip carries a `Change the interface scale` control; every measurement here
  is at 100%. Scaling **up** on a tablet would take more of the screen from the
  canvas, which is the direction §1 and §6 already hurt in, and nothing here
  measures it.
- **Portrait's second half.** *(see the numbers section)*
- **Long-press, double-tap, three fingers.** `TouchGestureTracker` pairs the
  moved finger with exactly one peer and `docs/INPUT.md` says the third pointer
  is a spare, so a three-finger gesture has no meaning to find; a long-press
  and a double-tap have no binding at all and were not probed for one.
- **A screen reader.** Out of scope and squarely the keyboard-only tester's
  neighbour: the `.ui-sr-only` labels §4 is about are the accessible names, and
  they are correct. It is the sighted touch player who cannot read them.

---

## My weakest claim

**That the catalogue rows a tap "does not reach" are a real trap rather than a
tester's artefact.** The measurement is solid and repeated across four acts and
both viewports, and the failure mode is exactly right — a row's coordinates sit
on a live control, so the tap does something else. What I cannot show is that a
*person* aims at those coordinates. A player looks at the screen; the hidden
rows are not painted there, so what they see is a two-row list, and they may
simply never aim at row seven. The claim that survives either way is the
geometry: 2 of 21 and 3 of 18, with `Cell` and `Bed` outside the box.

**What would change my mind:** a run that reproduces §2 the way a person
reaches those rows — drag the list until a row *is* painted, then tap it — and
finds that every painted row is reachable. If that comes back clean, §2 collapses
into §1 and the ranking changes.

**The second weakest is §1's overlay-scrollbar sentence**, which is REASONED
from #902's verified reading of `playwright-core`'s `--hide-scrollbars` and not
measured here, because this suite cannot make a scrollbar appear. **What would
change my mind:** one launch of this page in a browser without that flag at
1024×768 with a touch pointer, reading `offsetWidth - clientWidth` on
`.hud-build__list`.
