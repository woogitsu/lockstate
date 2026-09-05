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
**19 controls on overview, 44 on build, 40 on rooms, 43 on security, 18 on
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
`src/input/actions.ts`'s registry that a binding could point at.

**READ**, `src/rendering/scene/world-scene.ts`: `camera.scrollX`/`scrollY` are
written at `:559` (touch pan), `:604-605` (middle-drag pan) and `:650`
(continuous keyboard pan), and **none of the three clamps the result.** The
scene calls `setBounds` nowhere. `ZOOM_BOUNDS` (`:68`) is the only clamp in the
file. §3 of the baseline record measured this at v0.0.344 and it is unchanged.

---
