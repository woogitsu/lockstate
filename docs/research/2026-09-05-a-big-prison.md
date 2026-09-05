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

### 2a. The largest thing standing on the plot is a panel that says it does not work

**VERIFIED, read.** `.hud__corner` — the 422×425 box that costs the player 60
tiles of their own plot — holds exactly one thing:

```ts
const corner = element('div', { className: 'hud__corner', children: [minimapPanel.element] });
```

`src/ui/hud/hud.ts:1557`. Its surface is a placeholder with no map in it
(`:1508-1512`, *"minimap **rendering** belongs to the renderer, not to the HUD,
and does…"*, `:1503`), and the two sentences it can carry are
`'hud.minimap.placeholder': 'Minimap is not available yet'` and, after a click,
`'hud.minimap.navigable': 'No map is drawn here yet — click to jump the camera
there'` (`src/content/default-locale-en.ts:391,427`).

**REASONED.** So at the zoom a player needs in order to see a whole prison, the
single biggest obstruction between them and their plot is the panel that exists
to help them see it, and it currently says it cannot. It is collapsible —
`createPanel(… collapsed: isPanelCollapsed(state, 'minimap') …)`,
`src/ui/hud/hud.ts:1545` — so the escape exists; nothing points at it.

## 3. Building at scale: 173 wall segments, and the queue that draws one order at a time

**MEASURED, act 1.** The prison as built: **8 rooms — 3 cell blocks
(`room.cell`), a shower room, a classroom, a canteen, a common room and a
yard — 173 wall segments, 7 doors, 68 beds, 8 toilets and 13 other objects.**
Every wall run landed and none was lost:

```
[act1] 142 planned gesture points checked; 0 land on the HUD
  [wall] block-A north: 12 command(s)
  [wall] block-A west: 6 command(s)
  [wall] block-A east: 6 command(s)
  [wall] block-A south-west: 5 command(s)
  [wall] block-A south-east: 6 command(s)
  …
[act1] 173 wall command(s) submitted, from tick 487 to 12012
  [door] block-A at (6,9) south: 1 command(s), top=canvas
  … (7 doors, 1 command each)
```

**The arithmetic is exact.** `block-A` is 12×6, so its perimeter is
`2×(12+6) = 36` segments; one is left out for the door, and the five runs sum to
**35**. Over all seven walled rooms the plan is 180 perimeter segments minus 7
door gaps, and the run submitted **173**, to the command.

**MEASURED — money, to the minor unit.** `380 × 40 + 110 × 65 = 22,350`, and:

```
[act1] after buying 380 brick and 110 plank: funds=2650
```

25,000 − 22,350 = 2,650. The prices are `item.brick` 40 and `item.wood-plank`
65 (`src/content/procurement-catalog.ts:100-101`), the recipes 2 brick a wall
and 1 plank a bed (`src/simulation/construction/definition.ts:89,180`).

### 3a. The single crew is real, and at this size the player is slower than it is

**VERIFIED, read.** `ConstructionSystem` runs `{ intervalTicks: 10 }`
(`src/simulation/construction/system.ts:269`), advances the one in-progress
order by `order.progress += 10` (`:1419`), and takes exactly one order at a
time: `if (crewBusy) break; crewBusy = true;` (`:1412-1413`), with
`MOCK_CREW_WORKER_ID` documented as *"one id, one order in progress at a
time"* (`:251-252`). A wall is `workRequired: 50` (`:88`), a bed and a door 30
(`:179,141`).

**REASONED.** So a wall costs 5 construction ticks of work plus one to be
assigned — about 60 kernel ticks — and **173 walls is roughly 10,400 ticks of
serial queue, which is more than four in-game days** (a day is 2,400 ticks;
`src/simulation/economy/income.ts:622` — *"first on tick 2,399, after 2,400
ticks have been served"*).

**MEASURED, and this is the surprise.** It did not cost the player any waiting
at all, because **drawing the walls took longer than building them**. The 27
drag gestures spanned ticks 487 → 12,012 with the clock at 4×, and by the time
the last door was placed the queue was already empty: every one of the eight
designations was accepted **on its first attempt**.

```
[act1] designate block-A (room.cell) -> ok on attempt 1 after 13191ms, rooms 0->1
[act1] designate block-B (room.cell) -> ok on attempt 1 after 13531ms, rooms 1->2
…
[act1] designate common (room.common-room) -> ok on attempt 1 after 9144ms, rooms 7->8
[act1] after zoning: rooms=8 accommodationCapacity=0 roomCapacity=0
```

That is worth stating against the record: `buildAndPopulate` carries a retry
loop *because* the enclosure verdict is read off a world view a snapshot
replaces (`2026-08-29-playtest-ordering-and-the-second-room.md` §7), and at
this scale **it never fired once in eight rooms**. The retry is a small-prison
symptom: a 6×6 room's walls finish while the player is still holding the mouse.

**Caveat, stated plainly.** The gesture pacing is the instrument's (each `drag`
carries fixed settle waits) on a box shared with a second tester, so "the player
is slower than the crew" is a claim about *this* run and not a law. What is not
about this box is the serial queue and the 60-ticks-a-wall arithmetic, which are
read from the code.

## 4. Sixty-eight prisoners: every press landed, and the arithmetic is exact to the minor unit

**MEASURED, act 1.** Sixty-eight admissions and ten hires, one press each:

```
[act1] 68 Admit press(es) -> 68 AdmitPrisoner command(s) reached the worker, 0 threw
[act1] after admissions at tick 41160: prisoners=68 inIntake=0 residents=68 capacity=76
[act1] after 10 Hire press(es): staff=10 wageBill=800 funds=45350
```

**This is the finding `2026-09-04-hour-two.md` §1 asked for, and it is a
retirement.** That record measured *"seven of 25 Admit presses … and five of
eight Hire Guard presses … refused before they reached the worker"* at v0.0.451
with the string *"The simulation has not reported its command sequence yet"*.
At **v0.0.475**, on the same shared box, **68 for 68 and 10 for 10**, with no
`HUD action failed` line in the page console for either control. `git log
--oneline -80 origin/main | grep -i press` shows the fix landed as #942 between
v0.0.451 and v0.0.469 (the brief names it). **A run of presses no longer loses
any, and 68 is 2.7× the run that used to lose seven.**

### 4a. The economy at 68 is exact, and it is also over

**MEASURED, act 1**, three consecutive day boundaries, from the tee:

| report | tick | day | treasury | residents | wage bill |
| --- | --- | --- | --- | --- | --- |
| built | 42,548 | 18 | 45,350 | 68 | 800 |
| round 1 | 44,954 | 19 | **64,950** | 68 | 800 |
| round 2 | 47,198 | 20 | **84,550** | 68 | 800 |

**+19,600 a day, twice, to the minor unit.** `300 × 68 − 80 × 10 = 20,400 − 800
= 19,600`. `STATE_INCOME_PER_PRISONER_DAY_MINOR_UNITS = 300`
(`src/simulation/economy/income.ts:115`); the guard requirement is
`ceil(occupants / DEFAULT_SECTOR_PRISONERS_PER_GUARD)` with that constant at 8
(`src/simulation/security/sector-staffing.ts:190,147`), so 68 residents ask for
**9** guards and ten were hired.

**REASONED, and it is the shape change the question asked about.** The two sides
scale differently: income is `300 × residents` and payroll is
`80 × ceil(residents/8)`, which is `10 × residents` — **a fixed 30:1 ratio, and
the gap widens linearly for ever.** A prison that is full pays its whole guard
force out of 4% of one day's income. The build that made this prison cost
22,350, which is **1.1 days of its own operating income**; by day 20 the
treasury holds 84,550 with nothing left to buy — the plot is built out (§1) and
every room the catalogue offers that this prison wants is already standing.

**JUDGEMENT.** At small scale the money is a tutorial; at 68 it is not a
mechanic at all. Nothing in this prison can go wrong for want of money, and
there is nothing money can be spent on that the player has not already bought.

