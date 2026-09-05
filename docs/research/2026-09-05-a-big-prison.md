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

**`main` moved under this record while it was being played**, from `b984445f`
(v0.0.475) to `376b48bf` (**v0.0.477**), and among the merges is
`docs/research/2026-09-04-what-pressure-there-is-at-fifty.md`, which §1a and §10
below both engage with. **Every measurement here is at v0.0.475**, confirmed
from inside the running page at every act.

**LFS.** `git lfs checkout` was run in the worktree before anything, confirmed
by `file public/assets/actors/actor.guard.base.idle.png` →
`PNG image data, 260 x 3104, 8-bit/color RGBA`.

**The GPU is software.** Every act ran under swiftshader — the page logs
*"Automatic fallback to software WebGL has been deprecated"* on load. No claim
below is about frame rate, and none should be read as one.

---

## The verdict, in one paragraph

**The simulation holds and the prison does not.** Sixty-eight prisoners, eight
rooms, three cell blocks, 173 wall segments and 61,354 ticks: the kernel never
stalled, the ledger paid `300 × 68 − 80 × 10 = 19,600` at five consecutive day
boundaries to the minor unit, the DOM settled at 1,102 nodes and stayed there,
and **68 of 68 Admit presses and 10 of 10 Hire presses reached the worker** —
retiring `2026-09-04-hour-two.md` §1's lost-presses defect at 2.7× the run that
found it. What breaks is everything around the simulation. **The plot is one
32×32 chunk with no way to buy another** (`world.setOwned` has a single call
site), so "as many prisoners as the game will take" is bounded at about a
thousand tiles and not at `DEFAULT_PRISONER_CAPACITY`'s 5,000; at the zoom that
shows the whole plot, **the HUD stands on 156 of its 1,024 tiles** and a build
gesture that lands there submits *nothing at all* — the largest obstruction
being a 422×425 panel reading *"Minimap is not available yet"*. **Room
contention finally bites, at 34 contenders per place**: asked for all 68 roster
rows once a day for six days, the projection catches **fifty-one prisoners
committed to the classroom in one tick, fifty-one of them `travelling`, in a
room whose `education` ceiling is the width of one bookshelf — two** — and
exactly **two** on `action.shower` against a shower room that admits two, while
`hygiene` becomes the worst need for **half the prison** and stays there.
**Nothing on any surface names a ceiling**, and the Rooms panel calls both rooms
finished.
**Ten guards leave zero free**, four incidents lapse one-for-one, and the panel
says `Covered` next to `0 free` and `Only free guards answer incidents.` One
apparent defect — eight accommodation places with no beds under them — **did not
survive a second run of the same script** and is withdrawn in §10 rather than
filed.
Meanwhile the interface shows **4 of 68** prisoners with no page control, **1 of
5** unfinished rooms, and **3 of 10** guards; the eight-row alert cap never
bites because rows collapse, so what a player gets instead is a fight from day
18 pinned above everything on day 26. And the money stops mattering: income and
payroll scale 30:1 for ever, the whole prison cost 1.1 days of its own revenue,
and by day 26 the treasury holds 202,150 with a built-out plot and nothing to
spend it on.

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
| 0b | the apparatus, proved on one 3×3 room before 173 walls were spent on it | **failed, and the failure is §2**: three of five wall runs of a room at plot rows 1–3 submitted nothing, because their gesture line ran under `.hud-strip` |
| 0c | where the HUD stands on the plot, tile by tile, and what a press past the plot's edge does | data complete for the Overview tab and the HUD box list (§2); **stopped by hand** before the other four tab maps, which cost ~5 min each and which the box rectangles already determine |
| 1 | eight rooms, three cell blocks, 68 beds, 68 admissions, 10 guards, then eight day-long sampling rounds | run one `1 passed (14.8m)`; run two, with the readers fixed, `1 passed (17.4m)` |
| 2 | one 4×4 cell, four beds and one toilet — the control for §10 | data complete; **failed on its last line**, a malformed `hud/room-detail` request (§10) |

Acts 0b and 2 are reported as failures on purpose rather than deleted: each
failed on a real property of the application (a HUD-covered gesture; a
projection request the worker drops in silence), and both are findings.

**Act 1 was run a second time**, after two reader bugs in the instrument were
found and fixed — the prisoner roster and the build queue were both read one
level too shallow in the projection reply envelope (`view` rather than
`view.data`, see the comments on `report` and `drainQueue`), so the first run
reported `roster rows 0 of total 68` and skipped the 180-order drain. **Every
number quoted in this record is from the first run unless it says otherwise**;
the second is a repeat with the readers fixed, and where it is cited it is named
as the second run.

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
`src/input/bindings.ts:35`; `KEYBOARD_ZOOM_STEP` is 1.25,
`src/rendering/scene/world-scene.ts:86`) put the whole plot on screen:

```
[act0] zoomed-out x samples: [{"sx":420,"tx":4},{"sx":560,"tx":9},{"sx":700,"tx":15},
                              {"sx":840,"tx":20},{"sx":980,"tx":25},{"sx":1120,"tx":31}]
[act0] zoomed-out tile pitch from the read-back = 25.926 px (zoom = 0.4051)
```

### 1a. A correction to a record that merged today: the enclosable map is ten times what it says

`docs/research/2026-09-04-what-pressure-there-is-at-fifty.md` §1 reads, of its
10×10 cell: *"the biggest square the pointer can enclose at 1440×900 and it
leaves no tile over"*, and its verdict says fifty prisoners *"takes the whole of
the enclosable map to do it"*.

**MEASURED, act 0 and act 1.** That is true **at zoom 1 only**. Four presses of
`Minus` put 868 of the plot's 1,024 tiles under the pointer (§2), and this
record's prison lays out **eight rooms totalling 363 tiles, 299 of them walled**
(12×6 + 12×6 + 10×6 cell blocks, a 3×3 shower room, a 5×5 classroom, a 6×6
canteen, a 5×5 common room and an 8×8 yard) — **three times that "whole map"** —
with 173 wall segments, on the same 1440×900 viewport. The 100-tile ceiling is a
property of the arrival zoom, not of the plot. **The real ceiling is the one
32×32 chunk**, and it is about ten times larger.

**JUDGEMENT.** A player who wants to see their whole prison has to zoom out to
about 40%, at which a tile is 26 px. That is workable, and the four keypresses
are not signposted anywhere: `hud.build.arm-hint` names the arrow keys for
panning and nothing on screen names `-` or `+`.

## 2. With the whole prison on screen, the HUD stands on 156 tiles of it — and a press there submits nothing at all

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

**156 of 1,024 tile centres cannot be pressed at all**, counted row by row off
the map above: **64** in the top two rows under `.hud-strip`, **60** in a 4×15
block at the lower left under `.hud__corner`, and **32** in the bottom two rows
under `.hud__tabs` — 15% of the plot. Every one of them is *drawn*:
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

## 5. Nothing grew without bound, and the ledger is exact five times running

**MEASURED, act 1**, six reports spanning game days 18 to 24 at 68 residents,
sampled about one in-game day apart (a day is 2,400 ticks):

| report | tick | treasury | Δ | hudNodes | `usedJSHeapSize` |
| --- | --- | --- | --- | --- | --- |
| built | 42,548 | 45,350 | — | 1,063 | 148,000,000 |
| round 1 | 44,954 | 64,950 | +19,600 | 1,078 | 148,000,000 |
| round 2 | 47,198 | 84,550 | +19,600 | 1,102 | 148,000,000 |
| round 3 | 49,402 | 104,150 | +19,600 | 1,102 | 148,000,000 |
| round 4 | 51,604 | 123,750 | +19,600 | 1,102 | 148,000,000 |
| round 5 | 53,807 | 143,350 | +19,600 | 1,102 | 148,000,000 |

**`prisoners`, `roomOccupants`, `rooms`, `roomCapacity`,
`accommodationCapacity`, `staff` and `dailyWageBill` are byte-identical in all
six.** Nothing drifted, nothing stalled, nothing stopped being published.

**The node count answers the brief's question directly.** `2026-09-04-hour-two.md`
measured `hudNodes` 1,063 → 1,088 over seventeen in-game days at ≤30 residents.
At **68** the arrival page is **1,023**, the built prison **1,063**, and the
figure settles at **1,102 and stays there for four consecutive days**. The shape
does not change with population: it is a step when new blocks appear on screen
(alert rows, roster rows, the incident badge) and then flat. **No unbounded
growth of DOM nodes at 2.3× the largest population ever played.**

**`usedJSHeapSize` is not evidence and is reported as not-evidence.** Chrome
quantises it, and 148,000,000 appearing six times running is the quantiser, not
a measurement of stability. A real heap claim needs a different instrument.

**MEASURED, act 1's second run — the same shape again, over nine samples and
seven more day boundaries.** Treasury: `74,410 · 94,010 · 113,610 · 133,210 ·
152,810 · 152,810 · 172,410 · 192,010 · 211,610` — **+19,600 at every boundary
crossed, seven times**, with the one repeat being two samples inside the same
day. `hudNodes`: `1,063 · 1,078 · 1,078 · 1,078 · 1,089 · 1,089 · 1,089 · 1,089
· 1,115`, and `prisoners`, `roomOccupants`, `rooms`, `roomCapacity`,
`accommodationCapacity`, `staff` and `dailyWageBill` are byte-identical in all
nine. **Across both runs that is twelve consecutive day boundaries at exactly
`300 × 68 − 80 × 10`, and a DOM that moves by 52 nodes over sixteen in-game
days.** The second run published **916** `simulation/status-counts` messages to
the first's 819.

## 6. DEFECT — at 68 prisoners, ten guards leaves **zero** able to answer anything, and the panel says *Covered*

This is the most player-damaging thing in the run.

**MEASURED, act 1**, the Security tab dumped whole at game day 26, 68 residents,
ten guards hired:

> STAFF / GUARD COVERAGE / **9 of 9** / **Covered** / **Only free guards answer
> incidents.** / WHO TO HIRE / Guard / Selected / Hire Guard · 80 / … /
> **ON DUTY** / **10 held · 0 free** / Guard · Sector Post / Release / Guard ·
> Sector Post / Release / Guard · Sector Post / Release / **and 7 more** / A
> released guard stays hired and goes back to the pool. / ON THE PAYROLL /
> 800 a day

**VERIFIED, read**, why `0 free` is fatal rather than cosmetic.
`hud.security.held-summary` is `'{held} held · {unassigned} free'` and
`{unassigned}` is `hired − held` over the whole roster
(`src/content/default-locale-en.ts:1718,1868`, quoting
`projectHeldGuards`, `src/simulation/presentation/guard-release-projection.ts:216`).
An incident needs `requiredResponderCount`, which is
`Math.max(1, Math.ceil(severity * this.policy.respondersPerSeverityPoint))`
(`src/simulation/incidents/response-system.ts:345-347`), and the locale file's
own note on this panel puts a number on it: *"`requiredResponderCount` is
`max(1, ceil(severity * 0.5))` … every incident a session can currently open is
severity 3 or worse … so its floor is `round(0.65 * 5) = 3` and it asks for
**two**"* (`src/content/default-locale-en.ts:1880-1884`).

**REASONED.** Two free guards are needed and there are none, so nothing can be
contained — and the alerts column says exactly that, for four incidents:

```
"A fight has broken out between two prisoners. 4× Day 18",
"No incident is still open — but the last one ran out of time instead of being
 contained, and everyone caught in it was hurt. 4× Day 18",
```

**Four fights, four lapses, one for one**, with a guard force the panel calls
*Covered* and a payroll of 800 a day.

**What is new here, against the record.** `0 free` is not new — 
`2026-09-04-hour-two.md` §2 measured `3 held · 0 free` at 17 residents and
`2026-09-02-release-an-off-post-guard.md` is a whole record about the pool. **Two
things are.** First, **the honest hint has landed**: hour-two quoted
*"This prison has the guards it asks for."* beside `Covered`; v0.0.475 says
*"Only free guards answer incidents."* — #941's fix reached the player, and it
turns the panel into a readable self-contradiction rather than a lie.
**Second, and this is the scale part: over-hiring does not buy a reserve.** The
requirement at 68 residents is `ceil(68/8) = 9`
(`src/simulation/security/sector-staffing.ts:190,147`), the player hired **ten**,
and the count of free guards is still **zero**. A player who reads *"Only free
guards answer incidents"* and reacts the only way the interface allows — hire
another — gets a tenth held guard, 80 more a day, and no change whatever in what
happens to an incident.

**JUDGEMENT.** This is the one thing in a large prison a player can neither
diagnose nor fix from the interface. The panel names the rule (`only free
guards`), names the state (`0 free`), names a verdict that contradicts both
(`Covered`), and the only control it offers makes the number worse.

## 7. The interface at 68: four rows of sixty-eight, one room named of eight, three of ten guards, and a nine-day-old alert at the top of the column

**MEASURED, act 1**, every laid-out line of all five tabs at game day 26,
68 residents, 8 rooms, 10 guards. Every list is a window and every window is
small.

**The Regime tab's roster:**

> PRISONERS / **4 of 68** / Sonia Novak · Medium · Heading to Class · **Hygiene
> 20%** / Bram Kowal · Medium · Heading to Class · Recreation 35% / Fiona
> Guerra · Medium · Heading to Class · Hygiene 52% / Rafal Wagner · Medium ·
> Heading to Class · **Hygiene 0%** / **and 64 more**

`PRISONER_ROSTER_ROW_LIMIT = 4` (`src/ui/hud/regime-panel.ts:293`),
`'hud.regime.roster-count': '{shown} of {total}'`
(`src/content/default-locale-en.ts:2005`), and **there is no page control** —
the window is `roster.rows.slice(0, PRISONER_ROSTER_ROW_LIMIT)`
(`regime-panel.ts:1280`) over a projection that accepts `offset` and a `limit`
of up to `MAX_PROJECTION_PAGE_LIMIT = 500`
(`src/simulation/protocol/types.ts:369`). The data is paged; the interface is
not. **64 of 68 people are `and 64 more`.**

**The Rooms tab's audit:**

> NOT READY / **5 of 8** / **Cell at 1, 4 is missing** / 1 × Toilet

`ROOM_NEEDS_ROOMS_LIMIT = 1` (`src/ui/hud/rooms-panel.ts:407`) — one room is
named completely, and its own docblock says why: *"there is no surface in this
application that audits everything"* (`:388-392`). With **five** unfinished
rooms the player is told about one, and must finish it before being told the
next.

**The Security tab's roster:** `10 held · 0 free`, then three rows and
**`and 7 more`** — `HELD_GUARD_ROW_LIMIT = 3` (`src/ui/hud/staff-panel.ts:125`).

**The alerts column, which the brief expected to overflow, and does not:**

```
"A fight has broken out between two prisoners. 4× Day 18",
"No incident is still open — but the last one ran out of time … 4× Day 18",
"Contraband found: Tool. Day 19",
"Contraband found: Currency. 2× Day 23",
"Contraband found: Phone. 2× Day 20",
"Nothing was removed — there is no object on that tile, and none being built there."
```

**Six rows against a cap of eight** (`MAX_EVENT_ALERT_ROWS = 8`,
`src/ui/simulation-events.ts:488`), at day 26, in a prison of 68. **The cap does
not bite, because rows collapse by kind** — `4×`, `2×` — so nine incidents and
five contraband finds occupy five rows. What the player gets instead is worse
than an overflow: **the top of the column is a fight from day 18 and it is still
there on day 26**, because a collapsed row keeps the position its *first*
arrival earned (`src/ui/simulation-events.ts:646-657`, and #209's rule that
*"the position of a row the player is already reading must not change under
them"*). The newest thing is at the bottom.

**And one row that never leaves.** The last row is a build refusal produced by a
single mis-aimed remove press **on day 1**, and it is the only row in the column
with no *Clear this alert* control beside it. It is still on screen at day 26,
and it also occupies the refusal band above the minimap. **One stray click in
the first minute is a permanent line of the interface.** *(Noted in one line
because it is the other tester's surface — the build flow — and it is not
scale-specific; it is here because at 68 prisoners it is competing for the same
column as the incidents.)*

## 8. Room contention finally bites — fifty-one prisoners walking to a room that seats two

The brief's central unreached thing: `docs/adr/0062-…` decides who gets a room
when more prisoners want it than it seats, and **no playtest had ever made that
decision fire**.

**MEASURED, act 1**, the Regime tab at game day 26, 68 residents, verbatim:

> PRISONERS / 4 of 68 / Sonia Novak · Medium · **Heading to Class** · Hygiene
> **20%** / Bram Kowal · Medium · **Heading to Class** · Recreation 35% / Fiona
> Guerra · Medium · **Heading to Class** · Hygiene **52%** / Rafal Wagner ·
> Medium · **Heading to Class** · Hygiene **0%** / and 64 more

and the regime block that put them there:

> TODAY'S BLOCKS / General Population / 12% THROUGH / **Allows Work, Education,
> Free Association** / High Risk / 68% THROUGH / Allows Sleep, Meal, Hygiene

**VERIFIED, read — the ceilings this prison actually has.**
`concurrentUseCapacityFor` gates on *"the summed footprint width of the objects
inside the rectangle carrying that capability"*
(`src/simulation/prisoners/room-instance-registry.ts:99-105`), derived by
`deriveRoomCapacity` as `byCapability.set(capability, … + definition.footprint.width)`
(`src/simulation/objects/room-capacity.ts:187-189`). For this prison:

| room | objects | capability | ceiling | contenders |
| --- | --- | --- | --- | --- |
| classroom | 1 × bookshelf (`2×1`) | `education` | **2** | 68 |
| classroom | 4 × chairs (`1×1`) | `seating` | 4 | 68 |
| shower room | 2 × shower head (`1×1`) | `shower` | **2** | 68 |
| canteen | 6 benches (`2×1`) | `seating` | 12 | 68 |

**Thirty-four contenders per education place, and thirty-four per shower head.**
The previous tester computed that a classroom's ceiling of 2 would bind at
twelve prisoners; at 68 it binds by a factor of nearly six.

**MEASURED — the whole population, six times, a day apart.** In act 1's second
run the `hud/prisoner-roster` projection was asked for **all 68 rows**
(`limit: 500`, against the interface's four) at every sampling round. What each
prisoner's `currentActionId` was:

| sample | tick | what the 68 are doing | phases |
| --- | --- | --- | --- |
| built | 55,587 | `free-association` **66**, `classroom-education` **2** | travelling 38, performing 30 |
| round 1 | 58,200 | `free-association` **66**, `classroom-education` **2** | performing 57, idle 11 |
| round 2 | 60,444 | `free-association` **46**, `classroom-education` **17**, `eat-meal` 5 | travelling 51, performing 17 |
| round 3 | 62,649 | **`classroom-education` 51**, `sleep` 8, `eat-meal` 7, **`shower` 2** | **travelling 51**, performing 15, idle 2 |
| round 4 | 64,853 | `sleep` **68** | performing 62, idle 6 |
| round 5 | 67,020 | `sleep` **68** | performing 67, travelling 1 |
| round 6 | 69,183 | **`shower` 26**, `sleep` 18, `use-toilet` 16, `common-room-recreation` 5, `yard-recreation` 3 | **travelling 39**, performing 23, idle 6 |
| round 7 | 71,387 | **`eat-meal` 31**, **`eat-in-cell` 20**, `shower` 12, `use-toilet` 4, `yard-recreation` 1 | **travelling 58**, performing 5, idle 5 |
| round 8 | 73,592 | `free-association` 40, `use-toilet` 16, `shower` 9, `classroom-education` 2, `eat-meal` 1 | performing 35, travelling 18, idle 15 |

**Rounds 3, 6 and 7 are the finding, and they are exactly the shape ADR 0062 is
about.** Three different rooms, three different capabilities, and every one of
them oversubscribed by an order of magnitude at a single tick:

| round | what they committed to | how many | the room's ceiling for it | ceiling from |
| --- | --- | --- | --- | --- |
| 3 | `action.classroom-education` | **51** | **2** | one bookshelf, `2×1` |
| 6 | `action.shower` | **26** | **2** | two shower heads, `1×1` |
| 7 | `action.eat-meal` | **31** | **6** | two dining tables, `3×2` |

and the travel column says what that costs in feet: **51, 39 and 58 prisoners
`travelling` at those same three ticks.** Round 3's two `action.shower`
performers are the shower ceiling **to the unit**, and round 7's twenty
`action.eat-in-cell` are ADR 0041's canteen fallback happening in play — the
first time it has been seen outside a kernel fixture.

So the answer to *what do the losers do* is not one answer:

- **When the block does not offer education** (built, round 1) the population
  sits on `action.free-association`, whose target is
  `{ kind: 'own-accommodation' }` (`src/simulation/prisoners/actions.ts:226`) —
  **they are in their own bunks**, and the prison looks calm.
- **When the block does offer it** (rounds 2–3) they commit and walk: 17, then
  51. `findAvailableForUse` is *"an answer, not a reservation"* and *"two actors
  selecting in the same tick can both be answered this instance and only the
  first `concurrentUseCapacityFor` of them will get in"*
  (`src/simulation/prisoners/room-instance-registry.ts:968-971`), so **49 of
  those 51 walks end at a door that will not let them in.**
- **When it offers hygiene or a meal** (rounds 6–7) the same thing happens to
  the shower room and the canteen: 26 for two heads, 31 for six dining places,
  with 20 of the refused diners falling back to `action.eat-in-cell`.
- **At night** (rounds 4–5) all 68 sleep, and there is nothing to contend for.

**Nothing here is starvation, and the record should not imply it is.** ADR 0062's
own worst case was *"prisoners 22 and 23 took **zero** showers in 40,000 ticks"*;
this prison's population takes showers — 26 of them try in one tick and two
succeed. What the scale changes is the *rate*: the queue for two heads is 34
deep, so `hygiene` is the lowest need for half the prison at every sample from
round 1 onwards and never recovers.

**MEASURED — and the cost of it accumulates.** `lowestNeed` across the same 68
rows, by round:

| sample | hygiene lowest for | hunger | safety | other |
| --- | --- | --- | --- | --- |
| built | — | 3 | **59** | bladder 6 |
| round 1 | **16** | 15 | 32 | bladder 5 |
| round 2 | **32** | 24 | 3 | bladder 5, recreation 4 |
| round 3 | **28** | 30 | — | bladder 7, recreation 3 |
| round 4 | **33** | 28 | — | recreation 5, bladder 2 |
| round 5 | **35** | 26 | — | recreation 3, sleep 2, bladder 2 |
| round 6 | **31** | 30 | — | sleep 6, bladder 1 |
| round 7 | **34** | 20 | — | bladder 7, recreation 6, sleep 1 |
| round 8 | 26 | 5 | — | **bladder 29**, recreation 8 |

**Hygiene becomes the worst need for half the prison and stays there** — 16, 32,
28, 33, 35 out of 68 — against a shower room that admits **two**. Run one's
Regime panel put numbers on individuals at the same scale: `Hygiene 0%`,
`Hygiene 20%`, `Hygiene 52%` on three of its four rows. ADR 0062 predicted this
exact shape from a kernel fixture (*"a shower room at its authored 3×3 minimum
with two `1×1` shower heads — a derived hygiene ceiling of two against
twenty-four"*); at 68 it is **34 to a head**, and this is the first time it has
been watched happening in a prison somebody built with a mouse.

**One thing the projection would not give me, stated so the tables above are not
over-read.** `PrisonerRosterRowViewModel.lowestNeed.level` is a `BoundedValue`
(`src/simulation/presentation/prisoner-projection.ts:124-128`), not a number, so
the instrument's `worst` column read `Infinity` throughout and **no need *level*
in this section comes from the projection** — the columns above are counts of
*which* need is lowest, and the percentages are the Regime panel's own text.

**JUDGEMENT, and this is the playability half.** Nothing on any surface says the
classroom seats two or the shower washes two, or that those numbers are the
*width of one bookshelf* and *two shower heads*. The Rooms panel calls both
finished. Fifty-one people walk across the prison to a door that admits two, and
the only readout a player has of it is four roster rows all saying
`Heading to Class` — which reads like the regime working.

## 9. What held, plainly

Answering the brief's five questions in order, so that the things that did *not*
break are on the record as loudly as the things that did.

**Does the simulation hold?** Yes, over the range played, and it held twice.
From `New prison` to game day 26 the worker published **819
`simulation/status-counts` messages** in the first run and **916** in the
second;
the last reads `{tick: 61354, prisoners: 68, rooms: 8, roomCapacity: 76,
accommodationCapacity: 76, roomOccupants: 68, treasury: 202150,
dailyWageBill: 800, staff: 10}`. The clock never left `{mode: 'running',
speed: 4}`, the tick advanced through every one of eight sampling rounds
(42,548 → 44,954 → 47,198 → 49,402 → 51,604 → 53,807 → … → 61,354, deltas
2,202–2,406 against a requested 2,200), and no counts field ever moved
backwards or stalled.

**How far did it actually get, and what did it cost?** **68 prisoners, 8 rooms,
173 wall segments, 10 staff, on one 32×32 plot, in 61,354 ticks — 25 in-game
days.**

**The brief's premise that 30 was the record is out of date, and the correction
matters more than the record does.** `docs/research/2026-09-04-what-pressure-there-is-at-fifty.md`
housed **fifty** — it merged into `main` while this was being played — so 68 is
1.4× the largest, not 2.3×. What is unshared is the shape: that prison is *"a
10×10 cell, 100 tiles, fifty beds and no room for the toilet the game's own
Rooms panel says the room is missing"* and *"every act's cell is walled on four
sides with **no doorway**"*, which its own author calls *"a dead cell's
composition, not a well-built prison's"*. **This one is eight rooms with a door
in every wall** — the room-list projection reports `access: "doorway"` for all
seven enclosed rooms and `"gap"` for the yard, which is correct — so it is the
first playtest prison whose rooms a prisoner can walk into, and the first with
more than two rooms at all. It is also **1.4% of the README's "several thousand active
actors"**, and §1 says why a player cannot get closer: the plot is 1,024 tiles
and there is no way to buy another.

**Does anything grow without bound?** Not in 25 days at 68. `hudNodes` steps
1,023 (arrival) → 1,063 (built) → 1,078 → 1,102 and then holds 1,102 across
four consecutive day-long samples. The alerts column holds six rows against a
cap of eight, because repeats collapse.

**Does the economy change shape?** Yes, and it flattens: `+19,600` a day, five
boundaries running, with a 30:1 income-to-payroll ratio that widens with every
prisoner (§4a).

**Does contention bite?** Yes — three rooms at once, oversubscribed 25×, 13× and
5× at single ticks, with 39 to 58 of the 68 walking at those moments and nothing
on any surface naming a ceiling (§8).

**One thing I could not measure and will not claim: determinism.** No
`simulation/*` message carries a state fingerprint (`grep -rn
"fingerprint\|checksum" src/simulation/worker/ src/simulation/protocol/` returns
one unrelated comment), so a playtest has no channel to compare two runs on. The
repository's own `tests/determinism/` is the instrument for that and this record
is not evidence about it either way.

---

## 10. WITHDRAWN — the eight accommodation places with no beds do not reproduce, and the second run says so

**This section was written as a defect and is kept as a correction**, because
the correction is the more useful record.

**MEASURED, act 1, first run.** 68 bed presses, and the worker answered:

```
[act1] furnished: {"tick":30104, …,"rooms":8,"roomCapacity":76,"accommodationCapacity":76, …}
"room.cell:1:4"  … "occupancy":{"current":0,"capacity":27,"free":27,…}
"room.cell:6:11" … "occupancy":{"current":0,"capacity":27,"free":27,…}
"room.cell:6:18" … "occupancy":{"current":0,"capacity":22,"free":22,…}
```

with the Rooms panel at day 26 reading **`NOT READY / 5 of 8 / Cell at 1, 4 is
missing / 1 × Toilet`**. Twenty-seven, twenty-seven and twenty-two against 24,
24 and 20 beds placed; the surplus per block — `+3, +3, +2` — was exactly each
block's toilet count, and block A's toilets were reported missing.

**MEASURED, act 1, second run — the same script, the same layout, the same 91
object commands, and the answer is different:**

```
[act1] 91 object command(s), 0 press(es) produced nothing, from tick 22862
[act1] furnished: {"tick":36133, …,"rooms":8,"roomCapacity":68,"accommodationCapacity":68, …}
```

and the `hud/room-detail` projection, asked of each cell in turn at tick 42,091,
enumerates exactly what was built:

| cell | capacity | capabilities | beds satisfying | toilets satisfying | missing |
| --- | --- | --- | --- | --- | --- |
| `room.cell:1:4` | **24** | `sanitation`, `sleep-surface` | 24 | 3 | 0 |
| `room.cell:6:11` | **24** | `sanitation`, `sleep-surface` | 24 | 3 | 0 |
| `room.cell:6:18` | **20** | `sanitation`, `sleep-surface` | 20 | 2 | 0 |

**24 + 24 + 20 = 68, exactly the beds placed, with every toilet present and
`missingCapability: 0` on all three.** `deriveRoomCapacity` is doing precisely
what `src/simulation/objects/room-capacity.ts:184-186` says it does, and the
toilet is not counted as a sleeping place.

**So the finding is withdrawn, and what is left is a smaller and different
thing.** The two runs differ in one respect I can name: the first run's object
drain short-circuited on the harness's `not laid out` rule (§3a's note) and read
its counts **9,000 ticks earlier in the build than the second run did**, at
`tick 30104` against `tick 36133`. That explains why the first run saw a
half-finished room; it does **not** explain a capacity of 27 where 24 beds had
been ordered, and I have no reading that does. **What I can say with the
evidence I have: the shipped numbers are right when the queue is empty, and I
cannot reproduce the moment at which they were wrong.**

**One thing found on the way is a defect and is not withdrawn.** act 2's first
attempt at `hud/room-detail` passed a bare instance id where the protocol wants
`{ kind: 'id', id }` (`src/simulation/protocol/types.ts:386-389`), and **the
worker answered nothing at all** — no reply, no refusal, no fault. The request
timed out in the caller after 20 s. A malformed projection request is therefore
indistinguishable from a hung worker, which is the same shape of silence
`docs/research/` keeps finding on the player-facing side.

---

## Improvement proposals

Each is grounded in a measurement above, and each names the code that would have
to make it true. `AGENTS.md` reservation 4's release means the *words* are ours;
the requirement that a sentence be true of the code that renders it is not, so
every string below is quoted with the file that would have to produce it.

### P1. The four roster rows should be the four worst-off, not the four highest-tier

**Grounded in §7 and §8.** At 68 residents the roster's four rows read
`Medium · Heading to Class`, `Medium · Heading to Class`, `Medium · Heading to
Class`, `Medium · Heading to Class` — four indistinguishable rows and
`and 64 more`. One of them was at `Hygiene 0%` and one at `Recreation 35%`, and
which four a player sees is decided by risk tier.

**Not paging**, and the repository has already ruled that out with a reason this
proposal accepts: *"the projection walks entity indices, and `EntityStore`
recycles an index behind a wrapping generation when a prisoner leaves (ADR
0026), so an offset is not a stable name for a set of people across ticks"*
(`src/ui/simulation-prisoner-roster.ts:279-285`). That same passage names what
*would* help: *"what would make one is a filter or an ordering"*, and notes the
ordering exists while a filter does not.

**The proposal is a second four-row block: the four lowest `lowestNeed.level`.**
`PrisonerRosterRowViewModel` already carries `lowestNeed`
(`src/simulation/presentation/prisoner-projection.ts:197`), and the cost
objection does not reach it: what `projectPrisonerRoster` refuses is a
*comparison sort* over 5,000 rows (`:463-470`), and selecting the four smallest
is a linear scan with a four-element running minimum — the same `O(n)` walk the
counting sort already makes, with no allocation per prisoner. The block's
heading is the sentence to write; `'Worst off'` with the existing
`hud.regime.roster-count` shape (`{shown} of {total}`,
`src/content/default-locale-en.ts:2005`) under it is true of that selection and
of nothing else.

### P2. A room should say how many people it can serve at once — ADR 0028 phase 5's owed readout, now with a played cost

**Grounded in §8.** At one tick **51** prisoners were committed to a classroom
that seats **two**; at another **26** to a shower room that washes **two**; at
another **31** to a canteen that seats **six** — and 39 to 58 of the 68 were
`travelling` at those moments. Each ceiling is the summed footprint width of
one kind of object: a bookshelf, two shower heads, two dining tables.

**This is not a new idea and the repository says so itself.** The room
projection's own docblock: *"The concurrent-use figure is **not projected at all
yet**, and that is a gap rather than a decision: it is the Rooms tab readout ADR
0028 phase 5 owes"* (`src/simulation/presentation/room-projection.ts:235-237`),
and it names the right shape in the line above — *"The ceiling is per capability,
in `concurrentUseCapacityByCapability`, so a concurrent-use readout is a readout
of that — one number per thing the room can be used for, not one number for the
room"* (`:231-234`). The data is on the instance already
(`src/simulation/prisoners/room-instance-registry.ts:117`).

**What the player would see**, in the Rooms panel's detail block, one line per
capability the room carries: `Classroom at 24, 4 — 2 can study here at once`.
It is true because `concurrentUseCapacityFor` is the number `claimUse` gates on
(`room-instance-registry.ts:99-105`), and it is the number that turns "the
classroom is finished" into "the classroom is finished and too small".

**And the one that would have saved this prison**, in the same block, only when
the room is oversubscribed and derived from numbers the projection already
carries — the ceiling above, and the population from `hud/prisoner-population`:
`2 can study here at once, and this prison holds 68.` Nothing in that sentence
is a prediction; both halves are counts.

### P3. `Covered` must not be the word when no guard is free

**Grounded in §6.** `9 of 9 · Covered · Only free guards answer incidents.` and
`10 held · 0 free`, with four incidents lapsing.

The panel already has every number it needs: `{held}` and `{unassigned}` are
both rendered (`hud.security.held-summary`,
`src/content/default-locale-en.ts:1718`), and the verdict is chosen between
`'hud.security.coverage-met'` (`Covered`) and `'hud.security.coverage-short'`
(`Understaffed`) at `:1827,1918`. **The proposal is a third verdict for the case
that is neither**: the requirement is met *and* `unassigned === 0`.

The words: **`No one spare`**, with the hint **`Every guard is on a post — an
incident needs a free one.`** Both are true of the code that would render them:
`unassigned` is `hired − held`
(`unassigned: entityIds.length - rows.length`,
`src/simulation/presentation/guard-release-projection.ts:216`), and an incident
needs at least two free responders
(`src/simulation/incidents/response-system.ts:345-347`, with the arithmetic
spelled out at `src/content/default-locale-en.ts:1880-1884`). It
replaces a verdict that is presently the opposite of the truth beside it.

### P4. Collapse the minimap while it has no map

**Grounded in §2 and §2a.** `.hud__corner` is `0,406 422x425` and costs the
player **60 tiles** of a 1,024-tile plot, to hold a panel whose entire content is
`Minimap is not available yet`. `createPanel(… collapsed: isPanelCollapsed(state,
'minimap') …)` (`src/ui/hud/hud.ts:1545`) already supports it; the change is
which way that defaults while `hud.minimap.placeholder` is the surface's text.
No new string, and 60 tiles of prison come back.

### P5. The Build panel's arm hint should name the zoom keys, because they are bound and it already names the others

**Grounded in §1.** The whole plot fits on a 1440×900 screen only at about 40%
zoom, four presses of `-`, and nothing on screen says so. The hint that is
already there reads:

> `'hud.build.arm-hint': 'Click a tile edge to place a wall. Drag along it to lay a run. Two fingers, the middle button or the arrow keys still move the camera.'`
> (`src/content/default-locale-en.ts:1354`)

It names three ways to *move* the camera and none to zoom it — while
`{ code: 'Minus', action: 'camera.zoom.out' }` and `{ code: 'Equal', action:
'camera.zoom.in' }` are bound in contexts `['world', 'construction']`
(`src/input/bindings.ts:34-35`) and handled at
`src/rendering/scene/world-scene.ts:737-742`, so they work *while a tool is
armed*. Adding `— and the - and = keys zoom out and in.` would be true of that
binding today.

### P6. The queue readout should say how much work is in it, not how many rows

**Grounded in §3a.** `{count} waiting · {started} being built`
(`src/content/default-locale-en.ts:1509`) said `173 waiting · 1 being built`,
which tells a player nothing about a serial one-crew queue where a wall is 50
work at +10 per scheduled tick every 10 ticks.

The arithmetic is available where the rows are: `view.orders.rows` carries
`definitionId` (`src/ui/simulation-build-queue.ts:117-120`) and
`BUILDABLE_DEFINITIONS` carries `workRequired`
(`src/simulation/construction/definition.ts:88,141,179`), so the sum is
computable in `src/ui/simulation-build-queue.ts` — which is outside
`src/ui/hud/` and therefore not blocked by `AGENTS.md` boundary 1 — or in the
projection itself. **The honest sentence is about work, not time**, because the
tick-to-clock relation depends on the speed control: `{count} waiting · about
{ticks} ticks of work` is derivable and true; "about 4 days" is not, unless the
speed is read too.

---

## What I did not reach

- **Anything like "several thousand active actors".** §1 says why: the plot is
  1,024 tiles and cannot be extended by a player. 68 is what a laid-out prison
  with circulation, doors and eight rooms fits on it; a wall-less field of beds
  would fit more and would not be a prison. **The README's target is not
  reachable through the interface at all**, and closing that gap is a land
  mechanic, not a performance one.
- **Determinism.** No worker message carries a state fingerprint, so a playtest
  has no channel on which to compare two runs. §9 states this rather than
  guessing at it.
- **A clean build-throughput curve.** The instrument's first drain read the
  Build panel's text and the panel hides its queue block until a projection has
  arrived (`paintQueue`, `src/ui/hud/build-panel.ts:2311-2313`), so the 180-order
  drain went unsampled; by the time that was fixed the queue emptied *during*
  the gestures and there was nothing left to sample (§3a). The serial-crew
  arithmetic in §3a is read from the code, not measured against a draining
  queue.
- **Frame rate and rendering cost.** Every act ran on software WebGL. Nothing
  here is evidence about what a big prison costs to draw.
- **The other tester's surface**, deliberately: the build flow end to end and
  its redesign. Two things that belong to them are noted in one line each — the
  refusal row that cannot be cleared and outlives the prison (§7), and the
  Build panel hiding its own queue block immediately after a large order run
  (§3a's footnote in the instrument).
- **A second population size.** Everything here is 68 against 0. A curve — 68,
  136, 272 — would separate "grows with population" from "grows once"; the plot
  will not hold the second point.

## The weakest claim, and what would change my mind

**§10 was the weakest claim and it has been withdrawn rather than defended.**
It measured `accommodationCapacity: 76` from 68 bed presses and named the
surplus; the second run of the identical script measured **68**, and the
`hud/room-detail` projection enumerated 24 beds and 3 toilets in the room the
first run said had none. That is the method working, and it is left in the
record as a section rather than deleted because *"a measurement that only one
run has ever produced"* is exactly the shape of claim this directory should be
suspicious of — including when it is mine.

**§8's sample-size weakness is also gone**, and for the same reason: the second
run asked for all 68 roster rows rather than the interface's four, and the
`2 / 66` split reproduced at two ticks a day apart. What is *not* measured there
is a prisoner being refused at the classroom door — see the correction inside
§8.

**So the weakest surviving claim is §6's**, and its weakness is the causal step.
What is MEASURED is `10 held · 0 free` beside `9 of 9 · Covered`, and four
incidents that *"ran out of time instead of being contained"* on the same day.
What is REASONED is that the first caused the second — through
`requiredResponderCount ≥ 2` and a pool of zero. **I never watched an incident
open and go unanswered while reading the free-guard count at that tick**; I read
the count at day 26 and the lapses at day 18. What would change my mind is a
sample of `hud/incidents` and the held-guard count in the same tick, at the tick
an incident opens: if a guard is released to answer and re-posted between
samples, the pool is not zero when it matters and §6 is a readout defect rather
than a response defect. Either way `Covered` beside `0 free` is wrong, but which
kind of wrong decides what it costs.

**The second-weakest is what §8 does *not* say.** Its six whole-population
samples answer the sample-size objection — 51 committed and 51 travelling toward
a two-place room is not an inference from four rows — but **a prisoner being
*refused at the door* is still not in it.** What is measured is commitment and
travel, and that the room's ceiling is two; what is not measured is the moment
`claimUse` says no. **The contention rule ADR 0062 decides — who wins when two
arrive at once — could be firing on every one of those 49 arrivals or on none of
them, and this record cannot tell them apart.** What would distinguish them is
the `unmetDemandCycles` counter ADR 0062's own measurement uses; no
`simulation/*` message carries it, so it is a kernel-fixture question and not a
playtest one.

**A third caveat that is not a weak claim but is a constraint on all of them.**
This box carried a second tester throughout. Every claim above is in ticks,
counts, nodes or minor units for that reason, and the one place a real-time
figure appears — §3a's "the player is slower than the crew" — says so and is not
load-bearing for anything else.
