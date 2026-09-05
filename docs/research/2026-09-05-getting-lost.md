# Getting lost — can a player pan away from their prison, and does anything bring them back? — 2026-09-05

**The verdict in one line: yes, three drags, and the way back exists, works
perfectly, and is hidden behind a sentence that tells the player it does not.**
One press on the minimap surface re-centres the camera on tile **(16,16)** —
`NEW_PRISON_ORIGIN_TILE` to the tile — from a screen on which **113 of 113
sampled world points are exactly `VOID_COLOR`**. The player's problem is not
that there is no way back. It is that the only thing on the screen that is the
way back reads **`MINIMAP IS NOT AVAILABLE YET`** until after you have clicked
it, and the sentence that says *`No map is drawn here yet — click to jump the
camera there`* is only ever shown to a player who has already made the click it
is advertising.

Played on `agent/playtest-getting-lost`, merged with `origin/main` at
**v0.0.475** (`b984445f`); the tree played is the merge commit `72896dd2`, and
every act's own first log line quotes the version strip it read at run time —
`v0.0.475 · 72896dd`. Viewport **1440×900** unless a line says otherwise.
Instrument: `tests/browser/playtest-2026-09-05-getting-lost.playtest.ts`.

**Nothing in CI collects that file.** `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/`; the playtest is `*.playtest.ts` and only
`tests/browser/playwright.playtest.config.ts` collects it. It is evidence, never
a gate. **Nothing under `src/` is changed on this branch.**

This record **resumes a session an API limit cut off.** That session built the
instrument and ran acts 1 and 2 at v0.0.473 and gathered no findings; acts 1–2
were re-run here at v0.0.475 and read identically, and acts 3–7 are run here for
the first time. Where a v0.0.473 reading is quoted it is labelled as such.

## Claim tiers

Every factual claim below is labelled **MEASURED** (from a run in this record,
quoted), **READ** (the file was opened at the line cited), **REASONED** (follows
from a stated MEASURED/READ fact) or **JUDGEMENT** (what a player would do or
feel). Nothing is from memory.

## Reproduction

From `/workspace/wt-getting-lost`:

```bash
LOCKSTATE_BROWSER_TEST_PORT=5327 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-getting-lost.playtest.ts -g "act N"
```

| act | what it plays |
| --- | --- |
| **1** | arrival: where the camera starts, the minimap's footprint at five viewports, and the complete control inventory of all five tabs |
| **2** | getting lost on purpose at zoom 1: how many 800px drags, and what the screen and the HUD say when it has happened |
| **3** | both ends of `ZOOM_BOUNDS`, and how far one drag carries at each |
| **4** | the way back, counted in interactions |
| **5** | the edges: how far the world goes and whether anything degrades out there |
| **6** | across a reload and across a prison switch |
| **7** | the three candidate ways back, measured against each other, and the affordance audit |

---

## The baseline this extends

`docs/research/2026-09-02-the-world-view.md` §2–§3 measured this surface at
v0.0.344: the pan had no clamp, the minimap took presses and produced nothing,
and the far end of a four-drag pan was solid `VOID_COLOR`. Both became issues —
**#794** (pan into solid black, nothing says the way back) and **#793** (the
minimap eats clicks and does nothing). **Both are still open.** One of them is
no longer true of the code.

**READ.** `8fead7e7`, *"The minimap navigates (#793) — and the mutation that
survived a diagonal-only corner test (#802)"*, dated **2026-09-02**, added
`WorldScene.navigateToMinimapPoint` (`src/rendering/scene/world-scene.ts:1279`)
and wired it at `src/main.ts:2106`. §2 of the baseline record became false on
that date. This pass re-derived it behaviourally rather than inheriting either
the issue or the commit.

---

## §1 — Arrival: what the screen offers, and the complete inventory of it

**MEASURED**, act 1, 1440×900, on a fresh prison with one guard hired so the
prison is a thing on screen and not only an ownership shade:

```
[act1] version line: v0.0.475 · 72896dd
[act1] canvas rect: {"left":0,"top":0,"width":1440,"height":900}
[act1] visible tile box on arrival: {"left":4,"right":27,"top":10,"bottom":23, ...}
[act1] owned chunk (tiles 0..31) visible on arrival: true
[act1] measured screen px per tile on arrival: 64.00 (zoom = 1.000)
[act1] arrival pixels: 0/131 sampled world points are exactly VOID_COLOR
```

The camera arrives at zoom 1 showing tiles x 4–27, y 10–23 — **24×14 of the
32×32 owned chunk**, centred on the prison. Not one sampled world pixel is void.
This is the picture the rest of the record is measured against.

**Every camera figure in this record is read out of the running game, not
recomputed.** With the Build panel's `Remove` tool armed, a press submits a
`RemoveObject` command carrying the tile the game itself resolved under that
screen point; `probeTile` reads that tile back. `app-shell.spec.ts:4515` states
in its own words that the assembled page exposes no debug hook for camera
position, so this is the only honest instrument available, and it has the useful
property of answering in the game's own screen→tile transform rather than one
the instrument reimplements.

### 1.1 — The minimap's footprint is a fixed number of CSS pixels, so its share of the screen is a function of the viewport

The brief carries a figure measured in the last twenty-four hours — the minimap
panel at **17% of the viewport** — without the viewport it was taken at. It is
a fixed footprint, so the fraction is swept rather than quoted. **MEASURED**,
act 1, the same live rect at five viewports:

```
[act1] .hud-minimap panel {"x":12,"y":446.8125,"w":398,"h":372} = 11.42% of the 1440x900 viewport
[act1]   900x600:   .hud-minimap 398.0x372.0 = 27.42% of the viewport
[act1]   1280x720:  .hud-minimap 398.0x372.0 = 16.07% of the viewport
[act1]   1280x800:  .hud-minimap 398.0x372.0 = 14.46% of the viewport
[act1]   1440x900:  .hud-minimap 398.0x372.0 = 11.42% of the viewport
[act1]   1920x1080: .hud-minimap 398.0x372.0 = 7.14% of the viewport
```

**398×372 at every one of the five**, exactly as
`docs/research/2026-09-02-the-world-view.md` §0 measured. So *"17% of the
viewport"* is true at about **1280×720** and nowhere else in this range: the
same panel is **27.42%** on a 900×600 window and **7.14%** on a 1920×1080 one, a
factor of **3.8 between the smallest and largest viewport this repository
measures at**. The claim is not wrong; it is a claim about one window size, and
it should never be quoted without one.

**MEASURED**, act 1: `.hud-minimap` is present at **398×372 at (12,447) on all
five tabs** — overview, build, rooms, security, regime, byte-identical rect —
so nothing a player does with the tabs makes it smaller or larger.

### 1.2 — There is no control anywhere on the page that names the camera or the way home

**MEASURED**, act 1: every visible `button`, `[role="button"]` and `a[href]` on
each of the five tabs, by tag, class, `innerText`, `aria-label` and `title` —
**19 controls on overview, 44 on build, 40 on rooms, 21 on security, 18 on
regime.** The full inventory is in the act's log. Not one of them names the
camera, a position, a direction, or the prison's location. The only controls
that touch the view at all are `Collapse` (three of them, on the minimap,
build/rooms/security/regime panel and intake) and `100%` (`Change the interface
scale`).

**READ**, `src/input/bindings.ts:10-35` — the whole of
`DEFAULT_KEYBOARD_BINDINGS` for the camera:

```
KeyW/KeyS/KeyA/KeyD  -> camera.up/down/left/right
ArrowUp/Down/Left/Right -> the same four
Equal -> camera.zoom.in     Minus -> camera.zoom.out
Escape -> build.cancel      (then undo/redo)
```

**Eight pan keys, two zoom keys, and no key that returns the camera anywhere.**
There is no `camera.home`, no `camera.centre`, no action id of any such shape in
`src/input/actions.ts`'s registry that a binding could point at — the whole
camera vocabulary there is `camera.up`, `camera.down`, `camera.left`,
`camera.right`, `camera.zoom.in` and `camera.zoom.out` (`actions.ts:2-7`), six
actions, four of which are the same pan.

**READ**, `src/rendering/scene/world-scene.ts`: `camera.scrollX`/`scrollY` are
written at `:559` (touch pan), `:604-605` (middle-drag pan) and `:650`
(continuous keyboard pan), and **none of the three clamps the result.** The
scene calls `setBounds` nowhere. `ZOOM_BOUNDS` (`:68`) is the only clamp in the
file. §3 of the baseline record measured this at v0.0.344 and it is unchanged.

---

## §2 — Getting lost takes three drags, and the screen at the far end is 113 out of 113 sampled points of exactly nothing

**MEASURED**, act 2, 1440×900, zoom 1, one 800px westward middle-drag at a time.
800px at zoom 1 is **12.5 tiles** (`camera.scrollX -= dx / camera.zoom`,
`world-scene.ts:604`, and 800/64 = 12.5):

```
[act2] drag 0 (arrival):  visible tiles x 4..27,  y 10..23; owned-visible=true
[act2] after drag 1: visible tiles x 17..39, y 10..23; owned-visible=true
[act2]     pixels: 30/113 VOID_COLOR
[act2] after drag 2: visible tiles x 29..52, y 10..23; owned-visible=true
[act2]     pixels: 105/113 VOID_COLOR
[act2] after drag 3: visible tiles x 42..64, y 10..23; owned-visible=false
[act2]     pixels: 113/113 VOID_COLOR; others []; where: []
[act2] after drag 4: visible tiles x 54..77, y 10..23; owned-visible=false
[act2]     pixels: 113/113 VOID_COLOR; others []; where: []
[act2] THE PRISON LEFT THE SCREEN AFTER 3 DRAG(S) of 800px at zoom 1
```

**Three drags.** 2,400 screen pixels, 37.5 tiles. A drag is one press and one
stroke of a mouse across two thirds of a 1440px window; three of them is a
gesture a player makes in a couple of seconds while looking for somewhere to put
a wing.

At drag 3 **every single one of the 113 sampled world points is exactly
`VOID_COLOR`** (`0x0b0e12`, `src/rendering/world/appearance.ts:45` — not a tile
fill, the Phaser camera's background showing through where `TileLayer` draws
nothing, `world-scene.ts:317`). The sample skips every point a HUD element
covers *and* every point inside a `pointer-events: none` HUD island that still
paints, so the count is of world and not of chrome. The screen is black. Not
mostly black: black.

**What the rest of the screen says while that is true.** MEASURED, act 2, the
whole `.hud` `innerText` on each of the five tabs at that camera position. The
status strip reads exactly what it reads at arrival:

```
0 PRISONERS | 0 HIGH RISK | 1 STAFF | 0 COVERAGE Covered | 0 ROOMS |
0 INCIDENTS Clear | 0 CONTRABAND | 24,920 FUNDS | 0 EARNED TODAY | DAY 1 |
Through the day 0% | Speed 1× | PAUSED
```

and the minimap panel reads:

```
MINIMAP | Collapse | MINIMAP IS NOT AVAILABLE YET | ALERTS | ...
```

**Nothing on any of the five tabs names a position, a direction, a distance, or
the fact that a prison exists somewhere off screen.** Twelve numbers on the
strip and not one of them is *where you are*. JUDGEMENT: a player at this point
cannot distinguish "I panned too far" from "the game crashed and left the HUD
up", and the record already says so in those words —
`tests/browser/world-scene-input.spec.ts`'s own #202 docblock: *"Coming back to
empty land twenty tiles from the prison is indistinguishable from a crash."*

---

## §3 — Both ends of the zoom range: one end shows the whole prison, the other end shows eight tiles

**MEASURED**, act 3, 1440×900. Twelve presses of `Minus` and twelve of `Equal`
from zoom 1, which is more than the eight and five the range needs, so each end
is the clamp and not a count:

| | zoom measured | visible tiles | whole 32×32 chunk fits | sampled points void | 800px drags to lose the prison |
| --- | --- | --- | --- | --- | --- |
| fully **out** | **0.200** (12.80 px/tile) | **114 × 65** | **yes** | 88/113 | **2** |
| arrival | 1.000 (64.00 px/tile) | 24 × 14 | no | 0/131 | **3** |
| fully **in** | **3.000** (192.00 px/tile) | **8 × 5** | no | 0/113 | **5** |

Every figure is read off the running game: `measuredTilePx` bisects for the
exact screen x at which the probed tile index changes, twice, so the distance
between the two boundaries is a whole number of tiles by construction. It agrees
with `ZOOM_BOUNDS` (`world-scene.ts:68`, `{min: 0.2, max: 3}`) to three decimal
places at both ends.

**Yes, a player can see the whole prison at one end.** At zoom 0.2 the viewport
is 114×65 tiles against a 32×32 owned chunk, and `prison origin tile (16,16) on
screen: true`. That is a real answer to *"where is my prison"* — **if** the
player is looking at it when they zoom out, because `stepZoom`
(`world-scene.ts:783`) anchors the **middle of the viewport** and not the
cursor, so zooming out grows the view symmetrically about wherever the camera
already is.

**And at that end the screen is mostly void anyway**: 88 of 113 sampled world
points are `VOID_COLOR` at zoom 0.2, because a 32×32 prison in a 114×65 viewport
occupies 14% of it. REASONED from the two MEASURED rows: the "see everything"
end of the zoom range is also the end at which the prison is smallest and the
void is largest, so it answers *where* at the cost of answering *what*.

**Zoom recentres on nothing.** READ, `world-scene.ts:770-793`: `stepZoom`'s own
docblock — *"Zooms about the middle of the viewport... zooming about the camera
origin would drift whatever they were looking at off screen"* — and the body
passes `{x: viewport.width / 2, y: viewport.height / 2}` to `zoomAtScreenPoint`.
That is the right rule for a zoom key and it is **not** a way home: it preserves
the centre, so a player centred on void zooms out to more void with the same
void in the middle.

**Getting lost is cheapest at the widest zoom, not the narrowest.** MEASURED,
act 3: two drags at zoom 0.2 versus five at zoom 3 — because 800 screen pixels
is 62.5 tiles at 0.2 and 4.17 tiles at 3. REASONED: the zoom level a player
reaches for when they want an overview is the one at which one more careless
drag costs them the most ground.

---

## §4 — The way back exists, costs **one** press, and lands on the prison's origin tile to the tile

**#793 is fixed in the code and works.** The issue is still open; §2 of the
baseline record, which measured the surface decorative, became false on
2026-09-02 at `8fead7e7`.

**MEASURED**, act 4, 1440×900. Lost by four westward and two northward
800px drags, so the return is a two-axis problem and not a one-axis one:

```
[act4] lost at: visible tiles x 54..77, y 29..41; owned-visible=false
[act4] lost pixels: 113/113 VOID_COLOR
[act4] minimap sentence WHILE LOST: "MINIMAP\nCollapse\nMINIMAP IS NOT AVAILABLE YET\n..."
[act4] elementsFromPoint at the minimap centre: [{"tag":"SPAN","cls":"ui-eyebrow hud-minimap__placeholder","pointerEvents":"auto"},{"tag":"DIV","cls":"hud-minimap__surface","pointerEvents":"auto"}]
[act4] ONE press at the minimap centre -> simulation commands: []
[act4] after ONE minimap press: visible tiles x 4..27, y 10..22; owned-visible=true
[act4] after-one-press pixels: 0/113 VOID_COLOR
[act4] tile now at the middle of the screen: (16,16); NEW_PRISON_ORIGIN_TILE is (16,16)
```

**One interaction.** From a screen that is 113/113 void to a screen that is
0/113 void, with the tile at the middle of the viewport being **exactly
`NEW_PRISON_ORIGIN_TILE`**. The press submits **no simulation command** (`[]`
through the worker tee), which is correct and is the boundary
`src/rendering/` is held to (`tests/unit/rendering-module-boundaries.test.ts`).

**It is a map, not a button.** MEASURED, act 4, three more presses at three
corners of the same surface:

```
[act4]   minimap top-left     (fx=0.02,fy=0.02) -> centre tile (0,1),   visible x -11..11 y -6..7
[act4]   minimap top-right    (fx=0.98,fy=0.02) -> centre tile (31,1),  visible x  20..42 y -6..7
[act4]   minimap bottom-right (fx=0.98,fy=0.98) -> centre tile (31,32), visible x  20..42 y 25..38
```

Three distinct destinations spanning the owned chunk's own corners. READ,
`world-scene.ts:1279-1287`: `fx`/`fy` are reparameterised linearly across
`WorldRenderView.loadedBounds` in tile space and the result is `centerOn`'d.
That is a real minimap's behaviour with the picture left out.

**And it works from arbitrarily far away.** MEASURED, act 5, from **617 tiles**
east of home: `one minimap press from absurdly far: visible tiles x 4..27,
y 10..22 owned-visible=true`. There is no distance at which the way back stops
working.

### 4.1 — The way back is advertised only to players who have already found it

**This is the finding.** MEASURED, act 4, the same panel three lines apart:

```
[act4] minimap sentence BEFORE anything:  "... MINIMAP IS NOT AVAILABLE YET ..."
[act4] minimap sentence WHILE LOST:       "... MINIMAP IS NOT AVAILABLE YET ..."
[act4] minimap sentence AFTER one press:  "... NO MAP IS DRAWN HERE YET — CLICK TO JUMP THE CAMERA THERE ..."
```

**READ**, `src/ui/hud/hud.ts:1513-1523`:

```ts
minimapSurface.addEventListener('click', (event: MouseEvent) => {
  ...
  const navigated = options.onMinimapNavigate?.(point) ?? false;
  if (navigated) minimapPlaceholder.textContent = t(HUD_MESSAGE_KEY.minimapNavigable);
});
```

The sentence `hud.minimap.navigable` — *"No map is drawn here yet — click to
jump the camera there"* (`src/content/default-locale-en.ts:427`) — is written
into the DOM **by the click handler**, so it is rendered for the first time
by the very click it is instructing the player to make. Until then the surface
says `hud.minimap.placeholder` — *"Minimap is not available yet"*
(`default-locale-en.ts:391`).

REASONED from those two: **the only sentence on the screen that names the way
back is unreachable without already having taken it.** And the sentence a lost
player *does* read tells them, in as many words, that this panel is not
available. JUDGEMENT, and I hold it strongly: a player who has just panned into
solid black, reads `MINIMAP IS NOT AVAILABLE YET` on the largest panel on
screen, and concludes *"the map is not built yet, so there is no map to get me
home"* has read the screen correctly and reached the wrong conclusion. That
player will drag.

The wording itself is deliberate and its own comment says why —
`default-locale-en.ts:392-425` argues at length that refusing to author
`hud.minimap.navigable` would leave the *false* `placeholder` standing on a
surface that visibly moves the camera, and marks the wording **owner-pending**.
That reasoning is sound. What it does not cover is the state measured here: the
placeholder is still what a player who has never clicked reads, and for that
player it is exactly the false statement the comment set out to prevent.

---

## §5 — There are no edges. The world stops nowhere, and nothing degrades

**MEASURED**, act 5, 1440×900, zoom 1.

**The boundary of owned land is visible and correct.** One 800px drag east puts
the frontier mid-screen: `visible tiles x 17..39` with `edge pixels: 30/113
VOID_COLOR` — tiles 17–31 draw terrain, tiles 32–39 (chunk (1,0), never loaded
on a fresh prison) draw `VOID_COLOR`. The boundary is a hard vertical edge
between terrain and void. It is not a wall: the camera crosses it freely.

**Forty-one drags out, still going.**

```
[act5] after 40 strokes east: visible tiles x 517..539, y 10..23
[act5] far-out pixels: 113/113 VOID_COLOR; others []
```

41 strokes × 12.5 tiles = 512.5 tiles, and the visible box moved from x 4..27 to
x 517..539 — **512.5 tiles, to the tile.** No clamp, no resistance, no
deceleration, no marker.

**Further still, and nothing breaks.** A synthetic pan carried the camera to
`visible tiles x 595..617`: **617 tiles east of a 32-tile-wide prison, about
nineteen chunk-widths from home.** `absurd pixels: 113/113 VOID_COLOR`, the
status strip still reads `25,000 FUNDS | DAY 1 | Speed 1×` verbatim, and the
console carries **no errors and no page errors** — only four WebGL messages
(*"Automatic fallback to software WebGL has been deprecated"*, *"GPU stall due
to ReadPixels"*), which are properties of this headless container's software
renderer and of the instrument's own `page.screenshot` calls, not of the game.

**So the answer to "are there edges" is no**, and REASONED from `world-scene.ts`
having no `setBounds` and no clamp at any of the three scroll write sites
(§1.2), there is no distance at which one appears. A player can pan into a
region the game cannot render — that is every region outside chunk (0,0) — and
**nothing degrades when they do.** The renderer is entirely well-behaved out
there. It draws nothing, correctly, for ever.

**Instrument note, recorded rather than glossed.** The act's log line calls that
last gesture *"a synthetic million-pixel pan"*, and it is not one. The handler
is incremental — it reads `pointer - lastPanScreenPoint` on each move
(`world-scene.ts:604-606`) — so 200 `mousemove` events all dispatched to the
*same* point deliver one 5,000px delta and then 199 deltas of zero. The measured
result agrees exactly: 5,000/64 = 78.1 tiles, and the box moved from 517..539 to
595..617, which is 78. **The claim this act supports is therefore "617 tiles out
with no clamp", not "a million pixels out"**, and the larger claim is not made.

---

## §6 — A reload does not lose the camera; it loses the prison

**MEASURED**, act 6 (rewritten — see the instrument note at the end of this
section). The camera was parked deliberately east and south of the prison, not
lost, at `visible tiles x 29..52, y 17..30`, and the save panel confirmed a save
existed: `Saved (generation gen-mtnpgxvp-1).` Then the page was reloaded.

```
[act6] camera the player parked: visible tiles x 29..52, y 17..30
[act6] after reload: {"stripText":"... 0 PRISONERS 0 HIGH RISK 0 STAFF 0 COVERAGE Covered
                       0 ROOMS 0 INCIDENTS Clear 0 CONTRABAND 0 FUNDS","canvasPresent":true}
[act6] save panel after reload: "... New Prison (1 gen) | Load | Delete | Local saves only — no network required."
[act6] minimap after reload: "MINIMAP | Collapse | MINIMAP IS NOT AVAILABLE YET | ALERTS | No active alerts"
[act6] pixels immediately after reload: 145/145 VOID_COLOR; others []
[act6] camera immediately after reload: UNREADABLE -- no session is running, so a world press submits nothing
```

**The screen a player comes back to is black and the numbers on it are all
zero** — `0 PRISONERS`, `0 STAFF`, `0 ROOMS`, and **`0 FUNDS`** where the same
strip read `25,000 FUNDS` a moment earlier. 145 of 145 sampled world points are
`VOID_COLOR`. JUDGEMENT: that is the same picture as being lost, with the
numbers additionally saying the prison is empty, and the only thing on the page
that contradicts it is one row in the save panel.

**Then `Load`, which is one press, and the camera comes back on the prison and
not on the view the player left.**

```
[act6] save panel offers 1 control(s) reading "Load"
[act6] save panel after Load: "... | Loaded. | Restored: kernel tick and command queue, RNG stream
       states, world terrain and ownership, construction orders and undo/redo, ..."
[act6] camera after Load: visible tiles x 4..27, y 10..23
[act6]   shift from the parked view: dx=-25 tiles, dy=-7 tiles
[act6]   centre tile after Load: (16,17); parked centre was (41,24); NEW_PRISON_ORIGIN_TILE is (16,16)
```

**MEASURED**: the camera lands on **(16,17)** — the middle of the loaded chunk,
one tile off `NEW_PRISON_ORIGIN_TILE` because a 32-tile span's midpoint is a
half-tile — and **25 tiles west and 7 tiles north of where the player left it.**
READ, `world-scene.ts:1226-1235`: this is `frameCameraOnFirstWorld`, firing for
the first time in this page's life because the reload built a new scene with
`framedOnWorld` false.

So the answer to *"does the camera come back where it was"* is **no, and that is
the better of the two behaviours available**: the view is not restored, and what
replaces it is the prison. `docs/CAMERA.md`'s opening line is the reason — *"The
renderer owns camera state; it is not prison simulation state and must not be
written to saves"* — so there is nowhere for a parked view to have been kept.
REASONED from that plus the `Load` reading: **a page reload followed by one
press of `Load` is a fourth way back**, and it costs whatever play has happened
since the last autosave.

The page console carried, on every probe press:

```
HUD action failed {"actionId":"remove-object","error":{"message":
"No simulation session is running yet, so the order cannot be submitted."}}
```

— `src/ui/simulation-commands.ts:214`. **The reload does not resume the prison.**
The player comes back to a page with their prison in a list and a `Load` button
beside it, and the question *"where is the camera"* has no answer yet because
there is no world for a camera to be on.

That is not this record's surface —
`docs/research/2026-09-04-does-a-prison-come-back.md` and
`docs/research/2026-09-04-many-prisons.md` own the save and load story, and the
second of those already measured the `Local saves only — no network required.`
idle status and the `New Prison (1 gen)` row label. It is recorded here because
it is **the state that makes P1 below a predicate rather than a flip**: a page
where `Load` has not been pressed is a page where the minimap genuinely cannot
navigate, and the honest sentence there is the placeholder.

**Instrument note.** Act 6's first run probed the camera straight after the
reload, read `undefined`, and would have been reported as *"the camera does not
survive a reload"* — which would have been a false diagnosis of a true
measurement. The act was rewritten to measure the no-session state first and
then take the player's real next gesture. This is exactly the failure the brief
warns about, caught by the probe returning `undefined` rather than a number.

---

## §7 — A new prison started from a lost camera is born on a black screen

**MEASURED**, act 8 — a prison switch with **no reload in between**, which is
the case `framedOnWorld` never resets for:

```
[act8] prison 1, arrival: visible tiles x 4..27,  y 10..23
[act8] prison 1, lost:    visible tiles x 67..89, y 10..23; owned-visible=false
[act8]   pixels: 113/113 VOID_COLOR
[act8] prison 2, immediately after New prison: visible tiles x 67..89, y 10..23; owned-visible=false
[act8]   pixels: 113/113 VOID_COLOR; others []
[act8]   camera moved by dx=0 dy=0 tiles across the switch
```

**dx=0, dy=0.** The camera does not move at all. A player who is lost and
presses `New prison` gets a brand-new prison **and a screen that is 113 out of
113 sampled points of nothing**, with the minimap still reading `MINIMAP IS NOT
AVAILABLE YET`.

**READ**, `src/rendering/scene/world-scene.ts:1226-1230`:

```ts
private frameCameraOnFirstWorld(bounds: ... | undefined): void {
  if (this.framedOnWorld || bounds === undefined) return;
  this.framedOnWorld = true;
  this.cameras.main.centerOn(...);
}
```

`framedOnWorld` (`:262`) is a scene field set once and reset nowhere in the
file. The reload path in §6 gets a framing because a reload builds a new scene;
a prison switch keeps the scene, so the second prison gets none.

**JUDGEMENT, and this is the worst compound state in this record.** `New prison`
is the only control on any of the five tabs whose text contains the word
*prison* (MEASURED, act 7, all five tabs), it is on screen on every tab, and it
is what a lost player's eye lands on when they are looking for something about
their prison. Pressing it (a) destroys the current prison's unsaved play with no
dialog — `docs/research/2026-09-04-many-prisons.md` measured that, 0 dialogs,
tick 211 → tick 0 — and (b) leaves the player looking at the same black screen,
now with an *additional* prison somewhere off it.

The way back still works from there. MEASURED, act 8: `one minimap press in
prison 2: visible tiles x 4..27, y 10..22, owned-visible=true`.

---

## §8 — The three ways back, counted against each other

**MEASURED**, act 7, all from the same lost position (`visible tiles x 54..77,
y 29..41`, `owned-visible=false`, reached by four westward and two northward
800px drags), 1440×900, zoom 1:

| way back | interactions | what the player must already know |
| --- | --- | --- |
| **C — one press on the minimap surface** | **1** | that a panel reading `MINIMAP IS NOT AVAILABLE YET` is a control |
| **B — drag it back by hand** | **3** (two eastward, one southward) | **the direction**, which nothing on screen supplies |
| **A — press `Minus` until the prison reappears** | **5**, and see below | nothing |
| **(D — reload the page and press `Load`)** | 1 reload + 1 press | that the prison is in the save panel; costs unsaved play (§6) |

```
[act7] WAY BACK C: 1 press -> centre tile now (16,16); NEW_PRISON_ORIGIN_TILE is (16,16)
[act7] WAY BACK B: 3 drag(s) total, by someone who already knew which way to go
[act7] WAY BACK A: 5 presses of Minus put owned land back on screen
```

**Way back B's number is a lower bound and should be read as one.** It is what
the return costs someone who already knows the answer. MEASURED, act 2: the
screen at the far end is 113/113 `VOID_COLOR` and the whole HUD text on all five
tabs names no direction. JUDGEMENT: a player has eight plausible directions and
no reason to prefer any of them, so the real cost is 3 drags multiplied by
however many directions they try first — and each wrong guess makes the next one
longer.

**Way back A does not do what its number says, and the instrument caught it.**

```
[act7]   after 5 Minus: zoom 0.328, visible tiles x 31..100 y 17..56, owned-visible=true
[act7]   pixels after way back A: 113/113 VOID_COLOR
```

At five presses the visible tile box has **exactly one column of owned land in
it** — tile x=31, the chunk's east edge — which is `21` screen pixels wide at
zoom 0.328 and sits at the extreme left of the viewport, and **not one sampled
world point is anything but void.** `ownedLandVisible` is a rectangle-overlap
test on the tile box; it turns true the instant a single tile column enters the
viewport, which is a **lower bound on "the player can see their prison" and not
the same claim.** The pixel channel is the stronger one and it says black. So
zoom-out is a way back only if the player keeps pressing past the point the
geometry says they have arrived — and MEASURED, act 3, at the `ZOOM_BOUNDS`
floor of 0.2 **centred on the prison**, 88 of 113 sampled points are still void,
because a 32×32 prison in a 114×65 viewport is 14% of it.

REASONED from A, B and C together: **the cheapest way back by a factor of three
is also the only one a player has no reason to try**, and the two a player would
reach for first — drag, or zoom out — are the two that need either information
the screen withholds or more persistence than the screen rewards.

### 8.1 — What the surface advertises before the first click

**MEASURED**, act 7, on a fresh page before any click had ever landed on the
surface:

```
[act7] minimap surface affordance BEFORE any click ever lands: {
  "sentence":"MINIMAP IS NOT AVAILABLE YET",
  "cursor":"pointer", "pointerEvents":"auto",
  "title":null, "ariaLabel":null, "role":null, "tabIndex":-1,
  "tagName":"DIV", "focusableCount":116, "surfaceIsFocusable":false }
[act7] a brand-new page, before any click on the surface, still reads: "MINIMAP IS NOT AVAILABLE YET"
```

**Two channels, and they say opposite things.** The cursor is `pointer` —
**READ**, `src/ui/hud/hud.css:346-353`, whose own comment says why: *"The same
affordance every other pressable control in this file already uses... applying
the existing one to a surface that is now really clickable (issue #793)"*. The
words say `MINIMAP IS NOT AVAILABLE YET`. A player who hovers gets *press me*
and a player who reads gets *nothing here*. JUDGEMENT: reading is free and
hovering over a panel you have concluded is a placeholder is not, so most
players get the sentence and not the cursor.

**And for a keyboard player there is no way back at all.** `tagName: DIV`,
`role: null`, `aria-label: null`, `tabIndex: -1`, and the surface matches none of
the 116 focusable elements on the page. The click handler is on `click`
(`hud.ts:1513`), which a keyboard cannot reach on a non-focusable `div`. Cross-
referenced with §1.2's READ of `src/input/bindings.ts` — eight pan keys, two
zoom keys, no recentre key — **a player who does not use a mouse can get lost
with the arrow keys and has no gesture of any kind that brings them back**,
except way back D: reload and `Load`.

---

## §9 — The two open issues, verified rather than inherited

### #794 — *"A player can pan into solid black and there is nothing telling them the way back"*

**Still true in its first half and no longer true in its second, and the record
should say which.**

- *"Panning has no clamp"* — **still true.** READ, §1.2: three scroll write
  sites, no clamp, no `setBounds`. MEASURED, act 5: **617 tiles** out with no
  resistance of any kind.
- *"a solid black screen, with the HUD still reading normally"* — **still
  true, and now measured to the pixel.** MEASURED, act 2: 113/113 sampled world
  points exactly `VOID_COLOR` after **three** 800px drags.
- *"nothing on it indicating which direction their prison is"* — **still
  true.** MEASURED, act 2, the whole `.hud` text on all five tabs; MEASURED,
  act 1 and act 7, the 19/44/40/20/18 visible controls per tab.
- *"No 'return to prison' control exists anywhere in `src/ui` or
  `src/rendering`"* — **false since 2026-09-02.** One exists, it costs one
  press, and it lands on `NEW_PRISON_ORIGIN_TILE` exactly (§4). It is the
  minimap, and it is labelled as unavailable.

So #794's three shapes (clamp the pan / add a control / show something at the
edge) are now a choice between the **second done-but-unlabelled** and the third.
This record's P1 and P4 are those two.

### #793 — *"The minimap accepts clicks and does nothing with them"*

**Fixed in the code and verified working here.** `8fead7e7` (2026-09-02) added
`navigateToMinimapPoint` and wired it. MEASURED, act 4: one press moves the
camera to (16,16); three corner presses land on three distinct tiles spanning
the owned chunk; MEASURED, act 5: it still works from 617 tiles out; MEASURED,
act 8: it works in a second prison started in the same page. The issue is open
and, as written, its defect is gone.

**What survives it is smaller and sharper**: the issue's own closing question was
*"is the minimap supposed to navigate?"*, the answer landed as *yes*, and the
sentence on the surface was not brought along (§4.1). The issue's footprint
figure also needs the caveat §1.1 measures — *"14.5% of the canvas"* is a
1280×800 figure for a panel whose share runs from **7.14% to 27.42%** across the
five viewports this repository measures at.

---

## Improvement proposals

Five, ordered by the ratio of what they fix to what they cost. Each names the
file and line that would render it, and — per the brief's limit — where a
proposal is a *string*, the mechanism that would make that string true of the
code is named too. **Nothing here is implemented; this branch is read-only on
`src/`.**

### P1 — Show the sentence that is already written, before the click instead of after it

**Cost: one conditional. Fixes the single most damaging thing in this record.**

Today (`src/ui/hud/hud.ts:1508`):

```ts
const minimapPlaceholder = eyebrowText(t(HUD_MESSAGE_KEY.minimapPlaceholder), 'hud-minimap__placeholder');
```

and (`:1517-1522`) the click handler swaps in `HUD_MESSAGE_KEY.minimapNavigable`
*after* a navigation succeeds. So the true sentence exists, is translated, is
owner-pending on wording only, and is shown to nobody who needs it (§4.1).

**Why it cannot simply be flipped, and what makes it true.** *"No map is drawn
here yet — click to jump the camera there"* is true exactly when a click would
navigate, which is `WorldScene.navigateToMinimapPoint`'s own precondition:
`lastLoadedBounds !== undefined` (`world-scene.ts:1280-1281`). Before a prison
exists — and on a `Worker`-less page, `NO_SIMULATION_FEED` — it is false, which
is the case the current code is careful about. **MEASURED**, act 6: that state
is reachable in ordinary play, because a reload lands the player on exactly it.

So the shape is a *predicate*, not a flip. `hud.ts:820` already declares

```ts
readonly onMinimapNavigate?: (point: { readonly fx: number; readonly fy: number }) => boolean;
```

and `src/main.ts:2106` supplies it from a `worldScene` already in scope. A
sibling `readonly canMinimapNavigate?: () => boolean`, supplied there as
`() => worldScene.hasLoadedWorld()`, reads the **same cached field** the scene
already keeps for this exact reason — `lastLoadedBounds`'s own docblock
(`world-scene.ts:263-271`) says it exists because *"a minimap click can arrive
between two `update()`s"*. The HUD then renders `minimapNavigable` when it
returns true and `minimapPlaceholder` when it does not, and the sentence on
screen is true of the code at the moment it is on screen. No new state, no new
subscription, no new string.

### P2 — Put the way back in the panel header, where collapsing cannot take it

**MEASURED**, act 1: `.hud-minimap` is 398×372 on all five tabs and **27.42% of
a 900×600 viewport** (§1.1). A player short of screen presses `Collapse`.
**READ**, `src/ui/primitives/panel.ts:72`: `body.hidden = collapsed` — and
`hud.ts:1556` is `minimapPanel.body.append(minimapSurface, alertsSection.element)`.
REASONED from those two: **collapsing the minimap removes the only way back from
the screen, and takes the alerts list with it.** The header does not collapse;
only the body does.

So the recentre control belongs in the *header*, beside `Collapse`. `PanelOptions`
(`panel.ts:21-26`) carries `title`, `icon`, `collapse`, `className`, and
`createPanel` builds `headerChildren` at `:40-59` — an optional
`readonly actions?: readonly { icon: IconId; label: string; onActivate: () => void }[]`
pushed into `headerChildren` before the toggle is the whole change to the
primitive, and it is a primitive four other panels would be able to use.

**What it does, at each zoom level.** It calls the body of
`frameCameraOnFirstWorld` (`world-scene.ts:1231-1234`) without the
`framedOnWorld` guard — `centerOn` on the middle of `loadedBounds` — so it
writes **scroll only and never zoom**. MEASURED consequences, from act 3's two
measured ends: at zoom 3 the player lands on tile (16,16) seeing 8×5 tiles; at
zoom 1, 24×14; at zoom 0.2, 114×65 with the whole 32×32 chunk inside it. That is
the right division of labour — the button answers *where*, the zoom keys answer
*how close* — and it means the control has no zoom-dependent behaviour to
explain to anybody.

**The name is the owner's** under `AGENTS.md`'s fourth exclusion. What it must
convey is that it moves the *camera* and not the prison: the only control on any
tab whose text contains the word *prison* is **`New prison`** (MEASURED, act 7,
all five tabs), which destroys the current session's unsaved play
(`docs/research/2026-09-04-many-prisons.md`), so a recentre control named near
that phrase is a control a player will be afraid to press.

### P3 — A key, which costs no pixels at all

Every piece of this route exists and is exercised:

- `ACTION_REGISTRY` (`src/input/actions.ts:33-50`) already holds six camera
  actions, two of them `behavior: 'discrete'`.
- `DEFAULT_KEYBOARD_BINDINGS` (`src/input/bindings.ts:10-35`) already binds
  eight pan keys and two zoom keys.
- `WorldScene.handleActionEvents` (`world-scene.ts:733-745`) already switches on
  `camera.zoom.in` and `camera.zoom.out` and calls a private method for each.

A seventh action, one binding on `Home`, and one `case` calling the same
`recentreOnWorld` P2 needs. `KeyboardBinding` has no modifier vocabulary
(`bindings.ts:44-52` says so and says why) and `Home` needs none.
`tests/foundation/unconsumed-action-contract.test.ts` pins that every action
switched on there is `discrete`, so the new action is guarded on arrival.

**This is the cheapest of the five and it is not sufficient alone**: MEASURED,
act 7, the surface exposes `tabIndex: -1`, `role: null`, `aria-label: null`, and
is not matched by any focusable selector — so a keyboard-only player has **no**
way back today, and a key is the only proposal here that gives them one. It is
also the proposal a player is least likely to discover, which is why it is third
and not first.

### P4 — Say which way home is, on the world, only when home is off screen

This is #794's option 3, with both of its inputs named and neither of them new.
The scene holds `lastLoadedBounds` (`world-scene.ts:272`, refreshed every
`update()`) and Phaser's own `camera.worldView`, which `docs/CAMERA.md` pins as
equal to `visibleWorldBounds`. When the first is entirely outside the second —
which is exactly the `owned-visible=false` this record measures — draw a chevron
at the viewport edge on the bearing from the view's centre to the bounds' centre.

Presentational only, so inside `AGENTS.md` boundary 1: it reads a cached copy of
a value already read for rendering and writes only to an overlay, which is the
same standing `navigateToMinimapPoint` already has
(`world-scene.ts:1273-1275`).

**Why a marker and not a number.** A distance in tiles is a true claim and a
useless one — MEASURED, act 5, a player can be **617 tiles** out, and *"617
tiles east"* does not tell a hand how long to drag. A chevron is a direction, and
direction is the thing the screen currently withholds: MEASURED, act 2, 113 of
113 sampled world points at drag 3 are one colour, and the whole HUD text on all
five tabs names no position, direction or distance.

### P5 — Take the alerts out of the minimap panel

**READ**, `hud.ts:1556` and `panel.ts:72` (above): the alerts list is a child of
the minimap panel's body, so one press of `Collapse` hides both. The two have
nothing to do with each other — one is a map frame and one is a log — and they
are joined only because the corner holds one panel. Giving `.hud__corner` two
panels separates the collapse of a 224×224 square that draws nothing from the
collapse of the channel that says what is going wrong in the prison.

This is a layout change with a measured height budget behind it
(`hud.css:289-335` is four hundred words on that budget), so it is the largest
of the five and the one most likely to need an ADR rather than a patch.
