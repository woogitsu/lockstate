# Playtest: the world view — camera, panning, and the panel that sits on top of it

**Date:** 2026-09-02
**Branch:** `docs/playtest-the-world-view`, cut from `origin/main` at
**v0.0.344** (`e41a8482`). The strip's own version line confirms this
throughout the run (every screenshot below shows `v0.0.344 · e41a848`).

**Surface:** the world view itself — panning, zoom, what a player can and
cannot reach, and how the HUD interacts with the canvas underneath it. Six
prior playtests played money, rooms, save/reload, alerts, people and the first
five minutes; none had played the camera and the canvas.

**The brief's concrete hypothesis:** `.hud-minimap` is a real panel with
`pointer-events: auto` sitting directly over the world canvas, found **twice**
already — 2026-08-29 at 900x600, and 2026-09-01 at 1280x800 — swallowing
clicks meant for the world and ruled *"not a defect claim — the camera pans"*
both times. The question this pass was asked to answer: is that a player
problem, not just an instrument problem?

## Reproduction

`tests/browser/playtest-2026-09-02-the-world-view.playtest.ts`, one act at a
time:

```
LOCKSTATE_BROWSER_TEST_PORT=5330 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-02-the-world-view.playtest.ts -g "act 1" --reporter=line
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` matches
`*.spec.ts` only, and `playwright.playtest.config.ts` is the one that matches
`*.playtest.ts`. Every act drives `index.html` + `src/main.ts` in real
Chromium through a `Worker` tee, with real DOM events on the real controls —
no synthetic view model is ever injected, and every quoted sentence below is
read off the DOM (`innerText`, `textContent`, `getBoundingClientRect`,
`elementFromPoint`/`elementsFromPoint`), never off simulation state.

**LFS**: `git lfs checkout` was run in the worktree first (62 objects, 93 MB),
confirmed with `file public/assets/actors/actor.guard.base.idle.png` returning
`PNG image data, 260 x 3104`.

**No wall-clock timing claim is made anywhere in this record.** Every camera
movement Act 4 and Act 5 report is driven by a fixed *pixel* distance, either
dispatched as a single synthetic `mousemove` (§3, §4) or read back through
`calibrate()`'s screen-to-tile bisection (a real, re-derived measurement each
time, never predicted from a previous one). Where real elapsed time appears
(Act 5's `waitForQueueEmpty`), it is logged and explicitly not used in any
assertion.

## Claim tiers

- **MEASURED** — this pass drove the real page and the quoted output is
  verbatim console output from that run.
- **READ** — a source file was opened at the cited line and quoted or
  paraphrased.
- **REASONED** — follows from a MEASURED or READ fact, stated as such.

---

## §0 — The concrete hypothesis, measured: what fraction of the world does the HUD cover

**MEASURED**, at all four viewports the brief named, on a fresh prison, Build
tab, two ways on the same page for a cross-check with no shared assumptions:

1. **Exact.** `hud.css:60-65`'s own "opts back in" selector —
   `.hud-strip, .hud__corner > *, .hud__aside > *, .hud__side > *,
   .hud-tabs__inner` — is this codebase's own claim for the complete set of
   islands with `pointer-events: auto`. Every matching, visible element's rect,
   clipped to the canvas, is unioned by a sweep-line algorithm: no sampling
   error.
2. **Sampled**, as an independent check that does not trust the CSS comment:
   a grid of `document.elementFromPoint` probes at 8px spacing across the
   whole canvas rect, counting how many resolve to something other than the
   canvas itself.

| viewport | canvas area | exact covered | exact % | sampled % | agreement |
|---|---|---|---|---|---|
| 1280×720 | 921,600 px² | 409,409.9 px² | **44.42%** | 45.07% | 0.65 pts |
| 1280×800 | 1,024,000 px² | 430,529.9 px² | **42.04%** | 42.43% | 0.39 pts |
| 1440×900 | 1,296,000 px² | 469,487.4 px² | **36.23%** | 36.38% | 0.15 pts |
| 1920×1080 | 2,073,600 px² | 554,679.9 px² | **26.75%** | 27.08% | 0.33 pts |

The two independent methods agree within 0.65 percentage points at every
viewport, which is what a grid at 8px spacing should read as noise around an
exact number — corroboration, not restatement. **These are all measured with
nothing on the Buy fold or arm state changed from what a player meets on
arrival**; a second pass with `wall-brick` armed and its Buy fold open (a
player about to spend money on the thing they are looking at) read
**identically** at every viewport — the Build panel's width does not change
with that state, so this specific worst case is an empty category with the
number that establishes it.

**Largest single contributors, 1280×800 (arrival state):**

| element | width×height | area | % of canvas |
|---|---|---|---|
| `.hud-minimap` | 398×372 | 148,056 px² | 14.5% |
| `.hud-build` (right rail) | 264×457.25 | 120,714 px² | 11.8% |
| `.hud-strip` (top) | 1280×78.48 | 100,460 px² | 9.8% |
| `.save-panel` | 264×97.08 | 25,629 px² | 2.5% |
| `.hud-tabs__inner` (bottom) | 411.4×57.19 | 23,527 px² | 2.3% |
| `.display-scale` | 264×46 | 12,144 px² | 1.2% |

At 1920×1080 the ordering changes — `.hud-build` (176,154 px², the buildable
list has room to show more rows at this height) overtakes `.hud-minimap`
(148,056 px², unchanged in absolute size at every viewport since #545's
scaling reads off `--ui-scale`, which does not grow at these particular sizes)
as the single largest contributor. `.hud-minimap`'s own footprint is unchanged
across all four viewports — 398×372 everywhere — because nothing here changes
`--ui-scale`.

**Reading this against the brief's stale-measurement warning:** issue #775
widened `.hud-minimap` from 224px to 396px on 2026-09-01, and this pass's own
measured panel width is **398px** (396 plus the panel's own hairline border),
confirming the current, non-stale figure rather than repeating either the
2026-08-29 record's pre-#775 number or 2026-09-01's already-post-#775 one
(which read 401px tall against this pass's 372px tall — the difference is the
alerts section holding zero rows here versus whatever it held there, since the
minimap panel's height is `min-height: 0` down its whole flex chain and
shrinks to its content).

**So: at 1280×800, 42% of the visible world is behind a HUD element that
accepts the pointer, at every one of the four viewports named, on a fresh
prison, before anything else has been added to the screen.** This is a
measurement, not by itself a claim about cause or player-visible cost — those
are §1 and §3 below.

*Screenshots:* `docs/research/2026-09-02-the-world-view/act1-arrival-*.png`
and `act1-buying-*.png`, one pair per viewport.

---

## §1 — A blocked click gives the player no feedback at all

**MEASURED**, 1280×800, `wall-brick` armed:

`.hud-minimap`'s live rect on this run: `x:12 y:346.8125 w:398 h:372`
(`right:410`, `bottom:718.8125`) — the exact figure moved slightly from
2026-09-01's `y:317.8 h:401` (a different alerts-section content height, per
§0), confirming the brief's warning that any earlier footprint is stale and
should be read live, which `buildResilientCell`
(`tests/browser/playtest-2026-09-01-the-people.playtest.ts:158-166`) already
does and this pass's own instrument also does throughout.

A press at the rect's centre, `(211, 532.8)`:

```
elementsFromPoint before: [
  {"tag":"DIV","cls":"hud-minimap__surface", ...},
  {"tag":"DIV","cls":"ui-panel__body", ...},
  {"tag":"SECTION","cls":"ui-panel hud-minimap", ...}
]
press -> commands: []
refusal band: "hidden" -> "hidden"; event band: "hidden" -> "hidden"
elementsFromPoint after: [unchanged]
```

The same press, 259px to the right at `(470, 532.8)` — outside the panel, on
bare canvas, in the same row:

```
elementsFromPoint before: [{"tag":"CANVAS", ...}, {"tag":"DIV","cls":"", ...}]
press -> commands: [{"type":"PlaceBuildOrder","definitionId":"wall-brick","x":13,"y":18,"edge":"north", ...}]
refusal band: "hidden" -> "hidden"; event band: "hidden" -> "hidden"
```

**The comparison is the finding.** The identical gesture, one tile over,
either sends a command or it does not; the game's only two channels for
telling the player something happened at all — `.hud__refusal` and
`.hud__event` — are silent in *both* cases, so a click over the minimap is
**indistinguishable, from the player's chair, from a click that landed and had
nothing to say**. There is no third state on screen for "your click did not
reach the world." Cause, at `file:line`: `hud.css:60-65` opts `.hud-minimap`
into `pointer-events: auto`; the panel is created at `hud.ts:1437-1454` with no
click handler of its own, so the browser simply delivers the click to the
panel's DOM node and Phaser's canvas never sees a `pointerdown` for it —
nothing refuses the click, because nothing downstream of the DOM ever receives
it to refuse.

**Player-visible cost, stated as a question rather than invented:** a player
who wants to build in the bottom-left ~14.5% of their screen (§0) clicks,
nothing on screen changes, and the two prior records' own ruling — *"the
camera pans, so a small window is not a hard limit"* — assumes the player then
tries panning rather than concluding the tool is broken. Whether a player
actually does that, this repository cannot measure; nobody plays the game yet.
What *is* measured is that the game gives them zero information to make that
inference from — no cursor change, no tooltip, no refusal, nothing.

---

## §2 — The minimap is decorative, not a navigation control

**READ.** `hud.ts:1415-1422`'s own comment: *"A placeholder, honestly labelled
in visible text. Minimap rendering belongs to the renderer, not to the HUD;
this is the frame it will draw into."* `minimapSurface` is one `eyebrowText`
node reading `MINIMAP IS NOT AVAILABLE YET` with no click handler attached to
it or to the panel around it anywhere in `hud.ts`.

**MEASURED**, confirming the READ behaviourally rather than trusting the
comment: `calibrate()`'s screen-to-tile origin before and after three presses
at different points inside `.hud-minimap__surface` (its centre, and 8px inside
each of two opposite corners):

```
origin before: {"originX":-384,"originY":-624}
press at surface centre (211,484) -> commands: []
press at surface near top-left corner (107,380) -> commands: []
press at surface near bottom-right corner (315,588) -> commands: []
origin after three minimap presses: {"originX":-384,"originY":-624}
```

Zero commands from any of the three presses, and the camera's screen-to-tile
origin is bit-for-bit identical before and after. **The minimap does not
navigate.** A player who has read §1's silence as "try clicking the minimap
instead, that panel probably moves the camera" — the obvious guess for a panel
titled MINIMAP sitting where a minimap usually goes — gets the same silent
nothing a second time.

---

## §3 — Panning has no clamp, and the void it pans into has no landmark

**READ.** Grepped the whole of `src/rendering/scene/world-scene.ts` for any
bound on camera position: none exists. `ZOOM_BOUNDS` (`world-scene.ts:68`,
`{min:0.2, max:3}`) is the only clamp in the file, applied only to zoom
(`zoomAtScreenPoint`, used at the three call sites that change zoom:
wheel `:370-380`, keyboard `:640-655`, pinch `:433-446`). `camera.scrollX`/
`scrollY` are written directly at four sites — middle-drag (`:468-469`),
one-finger touch pan (`:423-424`), two-finger pinch's recentring (`:437-438`),
and the continuous keyboard pan in `update()` (`:512-514`) — and none of the
four clamps the result. Grepped `src/ui/**` and `src/rendering/**` for a
"recenter"/"return to prison"/"home camera" control: none exists.
`frameCameraOnFirstWorld` (`world-scene.ts:1088-1096`) centres the camera on
the loaded world's bounds exactly once, guarded by `this.framedOnWorld`, on
the first frame a world exists, and never again — a fact
`world-scene-input.spec.ts:9-19`'s own docblock for issue #202 already states
in these words: *"Coming back to empty land twenty tiles from the prison is
indistinguishable from a crash, and `frameCameraOnFirstWorld` points the
camera at the prison exactly once, so nothing recovers the view."* That test
file guards against a *keyboard* key getting stuck across a focus loss (fixed);
it does not and could not guard against a player choosing to pan a long way on
purpose, which is what this section measures.

**MEASURED**, 1280×800, on a fresh, empty prison (the 32×32 chunk at (0,0),
i.e. tiles x:0–31, y:0–31 — `src/simulation/runtime/new-session.ts:411-423`):

```
tile (0,0) screen origin at arrival: {"originX":-384,"originY":-624}
[4 middle-drags of 800px each, same direction]
tile (0,0) screen origin after 4 drags: {"originX":-3584,"originY":-624}
tile-origin shift: dx=-3200 dy=0
[4 middle-drags of 800px each, exact opposite direction]
tile (0,0) screen origin after the return drags: {"originX":-384,"originY":-624}
```

800px per drag × 4 drags = exactly 3,200px, and the origin shifted by exactly
3,200 in the dragged axis — not approximately: `camera.scrollX -=
dx / camera.zoom` (`world-scene.ts:468`) at the arrival zoom of 1 makes the
world-unit distance equal to the screen-pixel distance, verified rather than
assumed. The **exact** reverse gesture — same magnitude, opposite direction,
zoom never touched in between — returned the origin to the bit-identical
starting value. So panning is reversible *in principle*: there is no hard
lock, no wall a drag cannot cross back over.

**What that reversibility does not supply is any way to *find* the reverse
direction.** `act4-far-from-prison.png` (taken at the far end of the drag
above, 50 tiles past the 32-tile-wide owned chunk) shows: a fully black
screen — measured, not eyeballed, in §4 below the same colour value as
`VOID_COLOR` — the HUD strip still reading `0 PRISONERS`/`25,000 FUNDS` as
normal, the Build panel still offering `Brick wall`/`Wooden door`/`Bed`, and
the minimap still reading `MINIMAP IS NOT AVAILABLE YET`. Nothing on that
screen says which way the prison is, how far, or that a prison exists at all.
A player who pans this far by curiosity or by holding a key too long (the
`update()` keyboard pan is frame-time driven and easy to overshoot, though its
*rate* is not reported here as it would be a wall-clock claim) is looking at
the same picture whether they are 3 tiles or 300 tiles off, with only trial
panning to find their way back — the minimap that would ordinarily answer
"which way" is the placeholder measured decorative in §2.

*Screenshots:* `act4-before-pan.png`, `act4-far-from-prison.png`,
`act4-returned.png`.

---

## §4 — The frontier: building past the owned chunk grows it silently, and it renders correctly

**READ.** `src/simulation/construction/system.ts:340-365`'s own comment
states the mechanism precisely: an approved build order whose own tile sits in
a chunk that does not exist yet writes its edge on completion, and
`SparseWorld.setTopEdge` materialises the chunk to hold it — *"a visible
change… not hidden behind this fix."* `appearance.ts:29-42` states how an
unowned-but-loaded tile is supposed to look: real terrain, darkened by
`UNOWNED_SHADE_COLOR` (`0x05070a`) at `UNOWNED_SHADE_ALPHA` (`0.45`) —
distinct from `VOID_COLOR` (`0x0b0e12`), which is not a tile fill at all but
the Phaser camera's background colour showing through where `TileLayer` draws
nothing (`appearance.ts:29-42`, `tile-layer.ts:349-352`).

**MEASURED**, 1280×800: panned right 900px so tiles x≥32 (chunk (1,0), never
loaded on a fresh prison) are on screen, screenshotted
(`act5-frontier-before-build.png`), then a `wall-brick` order placed on the
east edge of tile (31,15) — the frontier of the owned chunk:

```
press near the east edge of tile (31,15) -> commands: [{"type":"PlaceBuildOrder","definitionId":"wall-brick","x":32,"y":15,"edge":"west", ...}]
refusal band: unchanged ("Nothing was removed..." — the calibrate() probe's own leftover text, not this press's)
```

The order's *own* tile is `x:32` (west edge of the not-yet-owned tile, the
same physical wall `edge-picking` canonicalises the other way from what was
clicked) — exactly the "own tile refused, far tile owned" case
`system.ts:340-365`'s comment describes — and it was accepted, not refused: the
refusal band did not change from the press. The order was let run to
completion (`waitForQueueEmpty`, polled — not timed), and the same camera
position was screenshotted again (`act5-frontier-after-build.png`), confirmed
by `calibrate()` to be the pixel-identical camera position as the "before"
shot.

**Pixel measurement, not eyeballing — the two screenshots decoded and sampled
at identical coordinates** (a standalone PNG decoder, zlib + the five PNG
filter types, run against the two committed files; reproducible with any PNG
library):

| point (screen px) | before | after |
|---|---|---|
| (900, 350) | `(11, 14, 18)` = `0x0B0E12` = **exactly `VOID_COLOR`** | `(59, 49, 39)` |
| (800, 350) | — | `(59, 49, 39)` |

`(59, 49, 39)` is within rounding of the arithmetic `appearance.ts` predicts
for `dirt` (`0x6a5744` = `(106, 87, 68)`) shaded at 45% by `UNOWNED_SHADE_COLOR`
(`0x05070a` = `(5, 7, 10)`): `106×0.55 + 5×0.45 ≈ 60.6`,
`87×0.55 + 7×0.45 ≈ 51.0`, `68×0.55 + 10×0.45 ≈ 41.9` — `(61, 51, 42)` against
the measured `(59, 49, 39)`, a few units off for JPEG-free PNG compositing and
tile-alternation (`dirt`'s `fillAlternate` differs slightly from its `fill`).
**This is checked and correct**: the frontier chunk materialises exactly as
`system.ts`'s comment says, renders exactly as `appearance.ts`'s shading
formula says, and the player is shown *something changed* the instant they
look — no separate disclosure sentence exists or is needed, because the
change is the same kind of visible fact a placed wall always is.

*Screenshots:* `act5-frontier-before-build.png`,
`act5-frontier-after-build.png` (visually near-identical at a glance — the
pixel table above is why this section does not rest on eyeballing them).

---

## §5 — Discoverability of the controls that would answer §0–§3

**READ.** The only player-facing sentence describing camera controls at all:
`hud.build.arm-hint` — *"Click a tile edge to place a wall. Drag along it to
lay a run. Two fingers, the middle button or the arrow keys still move the
camera."* (`src/content/default-locale-en.ts:1056`) — rendered unconditionally
inside the Build panel (`build-panel.ts:1119,2062`; its *text* toggles between
arm and remove hints, its presence does not). Three gaps, each grepped rather
than assumed:

- **It is Build-tab only.** `hud.rooms.arm-hint` (`default-locale-en.ts:1473`,
  *"Drag a rectangle across the tiles this room should cover."*) says nothing
  about the camera, and Security, Regime and Overview have no arm-hint
  equivalent at all. A player who never opens Build sees no camera
  instruction anywhere in the game.
- **It omits the mouse wheel and WASD.** `grep -in "zoom\|scroll\|wheel\|wasd"`
  over every player-facing string in `default-locale-en.ts` matches nothing
  except the `input.action.camera.zoom.*` labels (below) — the one sentence
  that exists names "two fingers, the middle button, the arrow keys" and never
  the wheel (bound at `world-scene.ts:369-381`) or `WASD`
  (`src/input/bindings.ts:11-14`, identical bindings to the arrow keys it does
  name).
- **The keys it does name have no remapping surface, despite one existing in
  code.** `input.action.camera.up/down/left/right/zoom.in/zoom.out`
  (`default-locale-en.ts:1693-1698`) are real locale strings with real
  `descriptionKey`s in `src/input/actions.ts:33-49` — the shape a keybinding
  settings screen would read — and `grep -rln "input\.action\."` under `src/`
  finds exactly two files: `actions.ts`, which defines them, and
  `default-locale-en.ts`, which translates them. Nothing under `src/ui/`
  reads either. `AGENTS.md` boundary 10 requires remapping support; the
  *mechanism* for it exists (`loadInputSettings`/binding tables) and no UI
  surfaces it — `grep -rln "loadInputSettings\|saveInputSettings\|rebind"`
  under `src/ui/` and `src/main.ts` returns nothing.

None of this is reported as a defect on its own — a locale key with no
renderer is exactly the shape `AGENTS.md`'s fourth exclusion names as the
owner's, not an agent's, to add or remove — but it is the direct answer to
"is it obvious how" a player finds every part of their own prison: the one
sentence that exists is easy to miss (it is Build-tab only), understates what
is available (three of five bound gestures go unmentioned), and there is
nowhere in the shipped game to discover the rest.

---

## Instrument bugs found and fixed in this same pass

Per the brief's own warning that this playtest is testing the exact mechanism
that has broken five previous instruments:

1. **The exact-coverage sweep-line union first returned `NaN` at every
   viewport.** `-Infinity - (-Infinity)` is `NaN` in IEEE 754, and the
   algorithm's initial merge step computed exactly that from its
   `-Infinity` sentinels. Caught immediately because the independent
   grid-sample cross-check (§0) read a sane percentage on the same run while
   the "exact" figure read `NaN` — the disagreement the function's own
   docblock says to watch for. Fixed by starting the running interval from the
   first real rectangle rather than a sentinel (the fix and the reasoning are
   both in the instrument file's own comment at the fixed line).
2. **A multi-step OS-level middle-drag (`page.mouse.down`/`.move({steps:12})`/
   `.up`) is not the deterministic gesture it looks like under load.** Logging
   every raw DOM `mousedown`/`mousemove`/`mouseup` the page received showed
   Chromium dispatching a textbook-correct 12-step sequence with `button`/
   `buttons` set exactly right — and the camera still did not move on some
   drags and moved a different amount than the dragged distance on others:
   four consecutive 800px drags (alternating direction) measured shifts of
   `-800, +666, 0, +666`. This is CDP-level `mousemove` coalescing under load
   (`ps` showed another agent's Vitest run mid-test), not a `WorldScene`
   defect — `playtest-into-the-lock.playtest.ts` and
   `playtest-just-in-time.playtest.ts` already use this exact idiom
   successfully elsewhere in this repository, on presumably quieter runs.
   Fixed by dispatching one `mousedown`, one `mousemove` straight to the final
   point, and one `mouseup` synchronously in-page via
   `canvas.dispatchEvent` — no OS input queue to coalesce against. Verified
   exact and repeatable across the 1-, 4- and 8-stroke cases this pass ran.
3. **A build point computed off the un-panned camera origin can be off the
   visible viewport entirely.** An earlier draft of §4 panned the camera to
   look at the frontier, then panned back by the exact inverse before
   pressing — computing the press point from the *original* origin, which put
   tile 31 at screen x=1660 on a 1280-wide viewport, off-screen. The press
   produced zero commands, briefly reading as a §1-shaped defect before the
   off-screen coordinate was noticed. Fixed by building from the panned
   position directly, using `originPanned` rather than `origin` for the
   point's coordinates.

---

## What this pass checked and found correct

- The exact-union and grid-sample coverage measurements agree within 0.65
  percentage points at all four named viewports (§0).
- `.hud-minimap`'s current live footprint (398×372 at 1280×800) reflects
  issue #775's 2026-09-01 width change and is not the stale 224px or 401px
  figure either prior record measured (§0, §1).
- A click landing on open canvas, one tile clear of any HUD panel, reliably
  produces a `PlaceBuildOrder` (§1) — the mechanism is not broken generally,
  only where a panel sits over it.
- The camera's pan-by-drag arithmetic (`scrollX -= dx/zoom`) is exact to the
  pixel against a real, independently re-derived `calibrate()` reading, in
  both directions, at zoom 1 (§3).
- Building on the frontier of the owned chunk is accepted without refusal,
  materialises the neighbouring chunk on completion (not on submission,
  matching `system.ts`'s own documented timing), and renders it with the
  exact colour `appearance.ts`'s shading formula predicts — confirmed by
  decoding the committed screenshots, not by eye (§4).
- `frameCameraOnFirstWorld` really does run only once, guarded by
  `this.framedOnWorld`, and really has no counterpart control anywhere in
  `src/ui` or `src/rendering` (§3, READ).

## What this pass did not reach

- **Touch and keyboard panning were not driven live.** §3's unbounded-pan
  claim is verified for middle-drag; the keyboard path (`update()`, frame-time
  driven) and the one/two-finger touch paths are READ as sharing the same
  unclamped `scrollX`/`scrollY` writes, not separately measured, because doing
  so honestly would need a frame-rate-independent way to drive them that this
  pass did not build.
- **Whether a real player, given §1's silence and §2's decorative minimap,
  actually concludes the game is broken rather than trying the camera.**
  Nobody plays the game yet; this record states the mechanism and the absence
  of feedback, not the player's inference from it.
- **Viewports below 1280 wide and touch-only layouts.** The brief named four
  desktop viewports; a narrower or touch-primary layout may change §0's
  numbers and was not measured here.
- **Whether the minimap is planned to become a real navigation surface.**
  `hud.ts:1415-1422`'s comment says rendering "belongs to the renderer," which
  reads as a stated intent rather than a shipped one; this pass reports what
  exists today, not the roadmap.
