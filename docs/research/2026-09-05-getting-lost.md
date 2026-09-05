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
[act6] save panel after reload: "... New Prison (1 gen) | Load | Delete | Local saves only — no network required."
[act6] camera immediately after reload: UNREADABLE -- no session is running, so a world press submits nothing
```

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
