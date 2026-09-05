# A big prison — what happens when the prison is finally large

**Date:** 2026-09-05
**Tree played:** `b984445f`, **v0.0.475**, in worktree `/workspace/wt-a-big-prison`
on branch `agent/playtest-a-big-prison`. `origin/main` was re-checked at the
start of the session and was still `b984445f`, so the newest tree is the one
played. Nothing under `src/` differs from that commit — this branch's only
changes are `tests/browser/playtest-2026-09-05-a-big-prison.playtest.ts`, this
file and the `docs/research/README.md` row. The running page confirmed the
version from inside itself: the status strip reads
`LockState.io | PRE-ALPHA | v0.0.475 · 4a76c03` (act 0), where the short hash is
this branch's instrument-only commit.

**Question, as given:** *every playtest in this repository so far has been
small. The largest was 30 prisoners; most were four to twelve. Build a big
prison — many blocks, many rooms, as many prisoners as the game will take — and
find out what happens.*

**LFS.** `git lfs checkout` was run in the worktree before anything, confirmed
by `file public/assets/actors/actor.guard.base.idle.png` →
`PNG image data, 260 x 3104, 8-bit/color RGBA`.

**The GPU is software.** Every act ran under swiftshader — the page logs
*"Automatic fallback to software WebGL has been deprecated"* on load. No claim
below is about frame rate, and none should be read as one.

---

## Claim tiers

- **MEASURED** — produced by one of the runs below and quoted from its output.
- **VERIFIED, read** — a file in this repository was opened at the line cited.
- **REASONED** — follows from a MEASURED or VERIFIED fact stated beside it.
- **JUDGEMENT** — what a *player* would do or feel, and marked as such.

Nothing here is **FROM MEMORY**. The weakest claim is named at the end.

**The two channels are kept apart.** Sentences come from `.hud` or a named
panel's `innerText`; numbers come from the worker — `simulation/status-counts`
and `simulation/clock-state` through the harness tee, and `hud/*` projections
through a second tee this instrument adds (see *Apparatus*). No claim mixes
them.

**No claim rests on wall-clock time.** The box is shared with a second tester.
Durations are in simulation ticks, in command counts, in DOM nodes and in
bytes. Where a real-time figure appears at all it is labelled as such and is
never the load-bearing part of a claim.

---

## Reproduction

```
LOCKSTATE_BROWSER_TEST_PORT=5331 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-a-big-prison.playtest.ts -g "act 1"
```

Nothing in CI collects it: `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`. A playtest is evidence, never a gate.

| act | what it plays | result |
| --- | --- | --- |
| 0 | the reachable canvas at zoom 1, the keyboard zoom, and the size of the plot | `1 passed` |
| 0b | the apparatus proved on one 3×3 room before 176 walls are spent on it | (filled in below) |
| 1 | eight rooms, three cell blocks, 64 beds, 64 admissions, 10 guards, run past day boundaries | (filled in below) |

---

## Apparatus — what was built by gesture and what by the harness

The brief asks for this distinction explicitly, because it decides what a
finding proves.

- **Every build gesture is a real mouse gesture.** Walls are `drag`s along tile
  edges, doors and furniture are `press`es on tile centres, materials are
  bought through the Build panel's Buy fold, rooms are designated by arming the
  Rooms panel and dragging a rectangle, prisoners are admitted by clicking
  *Admit a prisoner* once each and guards by clicking *Hire Guard* once each —
  all through `tests/browser/playtest-harness.ts`'s `press`, `drag`, `buy`,
  `armBuildable` and `tab`.
- **`buildAndPopulate` is deliberately *not* used.** It builds one 6×6 cell at
  fixed tiles `(12,12)-(17,17)` and computes every point as
  `originX + tx * 64`, which is only true at zoom 1 — and a prison that fills
  the plot does not fit on a 1440×900 screen at zoom 1 (§1). What this
  instrument does instead is drive the same primitives from a layout table.
- **One thing is not a gesture, and it is a read.** `__ask` posts a
  `simulation/request-projection` for `hud/prisoner-roster` and `hud/room-list`
  with `limit: 500` — the same projection the HUD asks for, with a window the
  HUD never uses (`PRISONER_ROSTER_ROW_LIMIT` is 4). It advances no tick, draws
  no RNG and never touches `SimulationCommandSender`'s sequence. Every claim
  about *what a player sees* is from the panels; the projection is only ever
  used for claims about what the simulation is doing.

---
## 1. The prison has a hard ceiling nobody states: one 32×32 chunk, and a fifth of it is on screen at once

**VERIFIED, read.** A new session owns exactly one chunk, and the write has a
single call site:

```ts
world = new SparseWorld(32);
world.load(initialChunk);
world.setOwned(initialChunk, true);
```

`src/simulation/runtime/new-session.ts:431-433`, where `initialChunk` is
`{ x: chunkCoordinate(0), y: chunkCoordinate(0) }` (`:422-425`). Nothing else in
`src/` calls `setOwned` — `grep -rn "setOwned" src/` answers that line and one
comment about it, `src/simulation/prisoners/discharge-system.ts:77`, which says
so in its own words: *"they do not walk to a gate, because there is no gate:
`world.setOwned` has one call site at session creation"*. There is no land
purchase, no chunk acquisition command and no expansion of any kind.

**REASONED.** So the largest prison this game can hold is **1,024 tiles**, and
that — not `DEFAULT_PRISONER_CAPACITY`'s 5,000 — is the real bound on "as many
prisoners as the game will take". A bed is `1×2`
(`src/content/object-catalog.ts:97`), so the arithmetic ceiling is a few hundred
beds in a prison with no walls, no circulation and no rooms; a prison that is
actually laid out is far below that. The README's *"several thousand active
actors"* is a claim about the kernel, and nothing a player can build reaches it.

**MEASURED, act 0.** At the config's 1440×900 and the camera's arrival zoom of
1, a pointer can reach 194 tile centres:

```
[act0] zoom 1 origin: tile (0,0) top-left = (-304, -574)
[act0] zoom 1: 194 tile centres are on canvas, 114 are covered
[act0] zoom 1 pressable tile box: x 5..26, y 10..22
[act0] zoom 1 covered, first 12: ["5,9=div.hud-strip","6,9=div.hud-strip", …]
```

**194 of 1,024 — 18.9% of the plot.** The origin `(-304, -574)` is the same one
four earlier records derived, so the arrival camera has not moved.

**MEASURED, act 0, the zoom.** Four presses of `Minus` (`camera.zoom.out`,
`src/input/bindings.ts:34`; `KEYBOARD_ZOOM_STEP` is 1.25,
`src/rendering/scene/world-scene.ts:86`) put the whole plot on screen:

```
[act0] zoomed-out x samples: [{"sx":420,"tx":4},{"sx":560,"tx":9},{"sx":700,"tx":15},
                              {"sx":840,"tx":20},{"sx":980,"tx":25},{"sx":1120,"tx":31}]
[act0] zoomed-out tile pitch from the read-back = 25.926 px (zoom = 0.4051)
```

**JUDGEMENT.** A player who wants to see their whole prison has to zoom out to
about 40%, at which a tile is 26 px. That is workable, and the four keypresses
are not signposted anywhere: `hud.build.arm-hint` names the arrow keys for
panning and nothing on screen names `-` or `+`.

## 2. With the whole prison on screen, the HUD stands on 122 tiles of it — and a press there submits nothing at all

**MEASURED, act 0c.** Zoomed out four notches so the plot fits, the laid-out HUD
boxes at 1440×900 are, verbatim:

```
[act0c] laid-out HUD boxes: ["hud-strip: 0,0 1440x78","hud__refusal: 0,78 1440x32",
  "hud__corner: 0,406 422x425","hud__rail: 1152,110 288x720","hud__aside: 1152,110 288x180",
  "save-panel: 1164,176 264x114","hud__side: 1152,299 288x532",
  "ui-panel hud-build: 1164,311 264x508","hud__tabs: 502,831 435x69"]
```

and the measured transform is `origin (300.65, 31.20)`, `pitch 26.2256`
(`zoom 0.40977`, against the arithmetic `1/1.25⁴ = 0.4096` — the instrument
bisects two column boundaries 30 tiles apart rather than assuming it).

**MEASURED, act 0c**, `document.elementFromPoint` at every one of the 1,024 tile
centres, with the Overview tab open (`'.'` pressable, `'#'` covered):

```
00 ################################
01 ################################
02 ................................
…
14 ................................
15 ####............................
…
29 ####............................
30 ........################........
31 ........################........
```

**122 of 1,024 tile centres cannot be pressed at all** — 64 in the top two rows
under `.hud-strip`, 60 in a 4×15 block at the lower left under `.hud__corner`,
and 32 in the bottom two rows under `.hud__tabs`. Every one of them is *drawn*:
the world is visible under all three.

**Two things this measurement corrects.** `.hud__refusal` is laid out across the
full width at `0,78 1440x32` and covers row 2's tile centres geometrically — and
row 2 reads pressable, so that band does not take pointer events. And
`.hud__rail`, the widest panel on screen, starts at x=1152 while the plot's
right edge is at x≈1140, so **the rail costs the player no plot at all** at this
viewport. The two that do cost plot are the strip and the corner.

**REASONED, and it is the reason this record's prison is shaped as it is.** A
press on a covered point produces no command whatever — act 0b measured exactly
that and it looked like a broken game rather than a covered button:

```
  [wall] shower north: 0 command(s)
  [wall] shower west: 0 command(s)
  [wall] shower east: 0 command(s)
  [wall] shower south-west: 1 command(s)
```

Three of the five wall runs of a room at plot rows 1–3 submitted nothing,
because their gesture line ran under `.hud-strip`. The two that did submit were
the two below it. Nothing on screen said so; the refusal band still read
`"Nothing was removed — there is no object on that tile, and none being built
there."`, left over from the previous gesture.

**JUDGEMENT.** A player building at the top or lower-left of their own plot,
zoomed out to see it, will drag a wall and get *nothing* — no wall, no refusal,
no sound. They will conclude the build tool is broken. The fix a player finds is
to pan, and nothing tells them to.

