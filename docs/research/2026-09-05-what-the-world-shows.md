# What does the world view show a player, now that the sprites are real?

**Date:** 2026-09-05
**Question:** every visual claim this repository holds was made either from a
tree whose `public/assets/**` was Git LFS pointer text — in which case the
browser loses **every actor atlas**, logs `InvalidStateError: The source image
could not be decoded`, and **passes anyway**, because the simulation lives in
the worker and does not care whether anything was drawn — or by reading code.
The one previous attempt at the world view (issue
[#944](https://github.com/matmaxalez/lockstate/issues/944)) reported four
prisoners and a guard piled on a single tile and two byte-identical
screenshots, and it was measured with no sprites at all. So: **can a player
tell the people apart, does the prison read as a place, and does the world show
state or only the HUD?**

**Tree played:** `6104f7e` (**v0.0.492**), in worktree `/workspace/wt-playtest`
on branch `playtest/what-the-world-shows`. **Nothing under `src/` differs from
that commit on this branch**; it adds one `*.playtest.ts` instrument, this
record and its screenshots. The status strip's own version line confirms the
tree from inside the running page in every screenshot below: `v0.0.492 ·
6104f7e` for acts 0 and 1, `v0.0.492 · 6a181d3` and later for the acts run
after this branch's own instrument-only checkpoints.

**The art was present, and that is the precondition every earlier record
failed.** `git lfs checkout` in this worktree returned in **0.043 s** — the
objects were already materialised by the checkout in this container, so there
was nothing to do — and `file public/assets/actors/actor.guard.base.idle.png`
answers `PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced`. All 62
Git LFS paths are real image bytes: 46 PNGs at 1448×1086, 5 at 2080×3104 and 5
at 260×3104. And the check that actually matters, because the failure mode is
silent: **every act's browser console holds exactly one line**, Phaser's own
version banner (`Phaser v4.2.1 (WebGL | Web Audio)`). No `Failed to process
file`, no decode error, no page error. Every screenshot below is of a page that
loaded all of its art.

**Reproduction**, one act at a time. Nothing in CI collects it —
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, and
`tests/browser/playwright.playtest.config.ts` is the config that matches
`*.playtest.ts`:

```
LOCKSTATE_BROWSER_TEST_PORT=5323 ./node_modules/.bin/playwright test \
  -c tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-05-what-the-world-shows.playtest.ts \
  --grep "act 1"
```

**Fifty-seven files are committed under
`docs/research/2026-09-05-what-the-world-shows/`** and they are the evidence, not
illustration. `act0-*` is the empty world; `act1-*` the first populated prison;
`act2-*` the showroom; `act3-working*`/`act3-sealed*` the controlled pair;
`act4-twelve*`/`act4-fifty*` the crowds; `act5-frame-0..5` and
`act8-frame-0..7` the motion runs; `act6-*` the four room types; `act7-zoom-*`
the wheel. A `-full` suffix is the whole 1440×900 page, no suffix is the crop
at 1:1, and `-xN` is that crop magnified N times.

Every crop below is a rectangle of the **page** in CSS pixels at the config's
1440×900 viewport with `devicePixelRatio` 1, so a file named `…-room.png` is
exactly the pixels a player's eye receives. Files with an `-xN` suffix are the
same crop upscaled N× by nearest neighbour in the page itself
(`imageSmoothingEnabled = false`), so they invent nothing: every pixel in them
was on screen.

---

## The answer, in one paragraph

**The people are excellent and the furniture does not exist.** A prisoner is an
orange jumpsuit and a dark cap, a guard is a mid-blue uniform with a peaked cap
and a badge, and at 1:1 on the default viewport, without clicking anything,
they are unmistakable — sharply rendered, correctly scaled, eight-directional,
and drawn in front of the wall they stand beside. Walls are real stone with a
drop shadow; a zoned room's floor is real institutional linoleum, and it reads
as an interior against the brown dirt outside it. **Then every single object a
player can build draws as the same flat blue-grey slab.** A bed and a toilet are
the same rectangle in the same colour; so are a stove, a desk, a shower head and
a security console. This is not a bug and it is not a missing asset: it is
written down. `SPRITE_BY_OBJECT_ID` in `src/rendering/world/environment-art.ts`
is `{}`, all twenty catalogued objects are listed in
`OBJECTS_ON_COLOUR_FALLBACK`, and `STRUCTURE_APPEARANCE` in
`src/rendering/world/appearance.ts` carries exactly two rows — `wall-brick` and
`door-wooden` — so everything else takes `CATEGORY_FALLBACK.object`,
`topFill: 0x7f8ba0` over `sideFill: 0x55607a`, which is the slab, pixel for
pixel. Meanwhile the bed and the toilet **ship**, as 1448×1086 renders, in
`public/game-content/source-art/`. What that costs a player is the whole of
question 2: a room's floor tells you it is a room, its tint tells you which
category of room, and its contents tell you nothing at all.

**And to the third question — state or only the HUD — the answer is only the
HUD, measured rather than asserted, twice.** A cell nobody can enter and a
working cell, same tiles, same crop, same population, same `roomCapacity`:
**6,061 differing pixels of 147,456, 4.11%**, thirty-two of the thirty-six
tiles pixel-identical, and the whole difference is the door the player built
plus four prisoner sprites overlapping slightly differently in the same corner.
A second, independent pair — a sealed cell at day 4 against a working one at day
11 — returns that map digit for digit. At fifty prisoners, with a
fight in the alerts column and thirty-eight people with nowhere to sleep, the
world view shows **two orange lumps and one guard** — and the lump holding
twelve people and the lump holding thirty-eight are the same picture, `0`
differing pixels of 128,000 over the region that contains it. #944 said a
working cell and a dead cell screenshot identically; with no art that was
guaranteed, and with the art it is 95.89% true. **And nothing in it moves:**
eight frames over 1,878 ticks of a *ready* prison changed once, and the change
was a door finishing construction.

---

## 1. Act 0 — arrival, before anything is built

`New prison`, then nothing. Screenshot:
`2026-09-05-what-the-world-shows/act0-arrival-full.png`.

The canvas is the **whole** 1440×900 viewport (`{"x":0,"y":0,"width":1440,
"height":900}`, `devicePixelRatio` 1) and the HUD floats over it. The world is
uniform brown dirt with a 64 px grid — one terrain, no variation, no landmark
anywhere. That is not a rendering fault: `src/rendering/world/environment-art.ts`
says why in its own words, and the sentence is worth having verbatim because it
explains six things at once —

> `SparseWorld.setTerrain` has no caller anywhere outside `SparseWorld` itself,
> so every tile in every session is terrain `dirt`, forever

(verbatim in `src/rendering/world/environment-art.ts`).

Two things a player can read on arrival and act on:

- The **MINIMAP** panel is present, sized, and says `MINIMAP IS NOT AVAILABLE
  YET`. It is the only panel on the opening screen that promises nothing.
- The **INTAKE** panel says *"A prison needs a cell before it can admit anyone.
  It does not need a free bed: an arrival with none waits until a bed is free."*
  Two sentences, both true, on the control they are about.

And two absences worth recording because they bound everything below:

- **There is no zoom control anywhere in the DOM, and the game zooms.** A sweep
  of every `button` and `[role="button"]` for
  `zoom|camera|centre|center|minimap|fit` returned **nothing**, and the only
  hint the page offers is the Build panel's *"Two fingers, the middle button or
  the arrow keys still move the camera"* — which names panning and not zoom.
  `WorldScene` zooms on the wheel at `camera.zoom * (deltaY > 0 ? 0.9 : 1.1)`
  (`src/rendering/scene/world-scene.ts:511`), on the keyboard at
  `KEYBOARD_ZOOM_STEP` `1.25` (`:86`), across
  `ZOOM_BOUNDS = { min: 0.2, max: 3 }` (`:68`) — a fifteen-fold range. **So a
  player is offered a fifteen-fold zoom and told about none of it**, which
  against the owner's standing brief of *no hidden mechanics* is the plainest
  hidden mechanic I found. (Pinch is a third path and it is dead by the scene's
  own admission: *"two-finger zoom has been dead since the scene was written,
  silently, because nothing exercised it in a real browser"*, at
  `src/rendering/scene/world-scene.ts:325`.) Act 7 plays the wheel.
- **The staff catalogue has exactly one row**, `staff-role.guard`. Five actor
  atlases ship — cook, guard, medic, prisoner, staff — and only two of the five
  populations can appear in a session. See §7.

## 2. Act 1 — four prisoners, two guards, and whether you can tell them apart

A doorless 6×6 cell at tiles (12,12)–(17,17), four beds, one toilet, four
prisoners admitted, two guards hired, run to tick 7506 (day 4) at ×4.

Screenshots: `2026-09-05-what-the-world-shows/act1-full.png` (the whole page),
`act1-room.png` (the room, 1:1 — **this is the file to look at**),
`act1-room-x3.png`, `act1-anchor-tile-x8.png`.

### Can you tell the people apart? Yes, easily.

At 1:1, in a 512×512 crop, with no clicking and no zoom:

- **Prisoners** are orange jumpsuits with a dark cap, facing the camera.
- **Guards** are mid-blue uniforms with a blue peaked cap and a light badge on
  the chest.

They differ in hue, in value and in silhouette, they are the same scale as each
other, and nothing about them is ambiguous. The atlases are 8-directional and
the frames are 256×384 with a foot pivot at (128,352)
(`public/assets/actors/actor.prisoner.base.atlas-manifests.json`), and each
sprite is drawn into a **64×96 CSS px** quad — `scale = (tileSizePx *
footprintTiles) / frame.rect.width` = `64 * 1 / 256` = `0.25`
(`src/rendering/actors/sprite-placement.ts:73`, with `TILE_SIZE_PX` `64` and
`ACTOR_FOOTPRINT_TILES` `1` at `src/rendering/tile-metrics.ts:21` and `:31`),
of which the figure fills rather more than half the width. They are lit and
shaded and legible at that size.
**This is the strongest thing in the world view and no previous record could
see it.**

The honest bound: only **two** of the five shipped populations were on screen,
because only guards are hireable (§7).

### Is the prison legible as a place? The shell yes, the contents no.

- **Walls** are drawn with real stone texture and a drop shadow on the outside
  face, and they read as a perimeter rather than as a line.
- **The floor** inside the designated room is a blue-speckled institutional
  tile, unmistakably an interior against the brown dirt one tile away. That
  blue is `env.floor.institutional` under `ZONING_TINT_BY_CATEGORY.housing`
  (`0x4f7fd0`) at `ZONING_TINT_ALPHA_OVER_ART` = `0.14`
  (`src/rendering/world/appearance.ts`).
- **The four beds and the toilet are flat blue-grey slabs**: a light top face
  over a darker band, no frame, no mattress, no pillow, no bowl. A bed and the
  toilet are the same shape in the same colour, and the only thing that tells
  them apart on screen is that the beds are in a row and the toilet is not.

### Stacking, and the part that has already been fixed

The four prisoners stand in the room's north-west corner — the room instance's
`anchorTile`, exactly as `docs/research/2026-09-04-why-they-stack.md`
established from the worker — but they are **not** drawn at one point. They are
fanned along a south-east cascade, so four separate figures are visible and
countable.

That is `src/rendering/actors/crowd-spread.ts`, which landed for #944 §4 and
whose own docblock states its bound before anything else does: `rank 0` does not
move, the fan is monotone on both axes, it goes south and east only, and it is
bounded inside the tile at `CROWD_SPREAD_SPAN_TILES_X` = `0.44` and
`CROWD_SPREAD_SPAN_TILES_Y` = `0.3` — 28 px by 19 px at `TILE` 64. My
measurement off `act1-anchor-tile-x8.png`, read at ⅛ scale: feet at (27,21),
(36,29), (46,36), (61,42) — a total span of about 34×21 px across three gaps,
against the 28×19 the constants specify. The few pixels of disagreement are my
eye on an 8× upscale, not a finding; what the reading establishes is that the
fan is there, monotone on both axes, and inside one tile. **So what #944
reported — several actors on a tile drawn as one figure — is not what the game
does today**, and a record that repeats it is repeating a fixed defect.

### One thing that is odd and one thing that is not

- **Two guards were standing inside a cell that has no door — and the reason is
  the harness, not the game.** `NEW_PRISON_ORIGIN_TILE` is `{ x: 16, y: 16 }`
  (`src/main.ts:621`), the tile the composition root supplies for staff and for
  arrivals with nowhere to be, and the 6×6 cell every playtest in this
  repository builds spans (12,12)–(17,17) — **which contains it.** So the guards
  did not walk into a sealed room; the room was drawn around the spot they
  appear at. My own measurement off `act1-full.png` puts them at tile (16,15)
  and (16,16), which is that tile and its neighbour.

  That is worth more than the oddity it explains: **a screenshot of that cell is
  not evidence that anybody walked anywhere**, and any future playtest that uses
  `buildAndPopulate` and reads guard position as movement is reading the spawn
  tile.
- **An idle actor never moves a pixel, and that is the art, not a stuck
  animation.** The `idle` clip in every atlas manifest is `fps: 1` with exactly
  **one frame per direction**; only `walk` has eight frames at `fps: 10`. So a
  standing figure is a still image by construction, and reporting it as a
  frozen animation would be wrong.

## 3. Act 2 — the showroom: what each buildable actually draws

A 10×9 brick enclosure at tiles (12,12)–(21,20), zoned as a Cell, with
**eighteen** objects placed inside it — one press per row of the build
catalogue, two tiles apart, in catalogue order. Screenshots:
`2026-09-05-what-the-world-shows/act2-showroom.png` (1:1 — **this is the file
to look at**), `act2-showroom-x2.png`, `act2-row-one-x4.png`,
`act2-showroom-full.png`.

**Eighteen different things were built and the screen shows one thing eighteen
times.** A bed, a toilet, a desk, a chair, a dining table, a bench, a
bookshelf, a fridge, a prep counter, a washing machine, a shower head, a
storage rack, a medicine cabinet and a security console are all the same flat
light blue-grey rectangle with a darker band along its bottom edge. There is no
texture, no outline detail, no gradient, no icon, no label. At 4× magnification
(`act2-row-one-x4.png`) the floor under them is a photographed institutional
linoleum with individual speckles resolving; the objects are two flat fills and
a one-pixel border.

**The only thing that varies is the rectangle's size**, because the footprint
comes from the object catalogue. Across all twenty catalogued objects there are
exactly **four** sizes — 1×1, 1×2, 2×1 and 3×2
(`src/content/object-catalog.ts:97` to `:116`) — so twenty objects share four
silhouettes and nothing else.

### Then the code, and it says so itself

- `STRUCTURE_APPEARANCE` (`src/rendering/world/appearance.ts:148`) has exactly
  **two** rows: `wall-brick` and `door-wooden`. Everything else resolves
  through `structureAppearance` (`:196`) to
  `CATEGORY_FALLBACK[buildable.category]`, and **22 of the 23 buildables in
  `src/simulation/construction/definition.ts` carry `category: 'object'`** (one
  carries `'wall'`, none carries `'utility'`). So every object on screen is
  `CATEGORY_FALLBACK.object` — `heightTiles: 0.4`, `topFill: 0x7f8ba0`,
  `sideFill: 0x55607a` — which is the light top face and the dark band, pixel
  for pixel.
- `CATEGORY_FALLBACK.utility` (`0x4fd0a2`, a green) therefore has **no reachable
  caller**: no buildable has that category. A colour in the table nothing can
  draw.
- `SPRITE_BY_OBJECT_ID` (`src/rendering/world/environment-art.ts:186`) is `{}`,
  and all twenty catalogued object ids are listed in
  `OBJECTS_ON_COLOUR_FALLBACK` (`:146`).

**None of that is a bug, and the modules say so before I do.** The docblock over
`OBJECTS_ON_COLOUR_FALLBACK` prices the decision and closes it in its own words:

> Objects are the declared next slice, not an oversight.

(verbatim in `src/rendering/world/environment-art.ts`.) It also records that
seven of the twenty have no sheet at all and that the other thirteen do —
`furniture.cell.bed.single.variants`, `fixture.cell.toilet_sink`,
`furniture.corridor.bench.variants` and the rest — held back at roughly 1.5 MB
of download each.

**So the finding is not "the art is missing". It is what the gap costs a player,
which nobody had looked at.** The thirteen sheets that exist are good: I opened
`public/game-content/source-art/furniture.cell.bed.single.variants.45bfa2e0ab8d.png`
and `public/game-content/source-art/fixture.cell.toilet_sink.18b4c51aa610.png`
and they are eight-view renders of a steel prison bunk and a steel
toilet-and-basin unit. On screen, the bunk and the basin are the same
rectangle. A player looking at their prison can read *where the rooms are* and
*who is in them* and cannot read *what is in them* — not "cannot read it
easily": there is no information on screen to read.

### The one thing I could not tell from the picture, and it matters

**Four of the eighteen presses placed a different object from the one
selected**, and I only know because the instrument tees the worker commands:
`stove-brick` produced a `fridge-brick`, `medical-bed-wooden` produced a
`storage-rack-wooden`, and `utility-panel-brick` and `waste-bin-brick` both
produced a `security-console-brick`. The door press at the end did the same.

**I am calling that my instrument, not the game, and here is the reasoning
rather than the label.** `armBuildable` in `tests/browser/playtest-harness.ts`
clicks the catalogue row, then reads `.hud-build__arm`'s text and only re-arms
when it starts with `place` or `draw`. If clicking a row while a tool is armed
never released it, the *first* object would be right and all seventeen after it
wrong; fourteen were right, so the release does happen and the four failures are
the label being read before it re-rendered — on a box at load average 9. What I
did **not** establish is what that control reads at each step, so I make no
claim about the panel's behaviour, only about my own helper's race.

It leaves one reading that is entirely about the game, though: **with the
command log in front of me I still cannot point at which slab is wrong.** The
four mismatched objects differ in footprint from the ones I asked for, so the
picture is not identical — and there is nothing on screen that says which
rectangle is a stove and which is a fridge, so the error is undetectable by
looking. That is the same finding as the paragraph above, stated the sharpest
way I found.

### And one oddity worth someone else measuring

The 3×2 dining table pressed at tile (21,13) — the room's easternmost interior
column — is **drawn straddling the perimeter wall**, its light face continuing
east past the wall line at page x=1104 and out of the room. The 2×1 objects
pressed at (21,15) and (21,17) do the same. Every one of those presses was
accepted, nothing was refused, and the build queue emptied. Whether the
simulation reserved the tiles outside the room, or only the renderer drew them
there, I did not establish and it is not answerable from a screenshot.
Screenshot: `2026-09-05-what-the-world-shows/act2-showroom-full.png`, top right.

## 4. Act 3 — a working cell and a sealed one, side by side

Two runs, identical geometry, identical population (four prisoners, two
guards), both driven to **tick 24,000** and cropped to the same 384×384
rectangle. One has a wooden door built into the south wall of tile (14,17); the
other does not. Screenshots: `2026-09-05-what-the-world-shows/act3-working.png`
and `act3-sealed.png`, with `-full.png` and `-x3.png` beside each.

**A door is drawn with real artwork, and it is the sharpest possible contrast
with §3.** The working cell's south wall carries a textured steel door with a
vertical window slot and a handle plate — `EDGE_ART_BY_NUMERIC_ID` maps
`DOOR_EDGE_NUMERIC_ID` to `env.door.interior.face`/`.cap`
(`src/rendering/world/environment-art.ts:75`). Eight tiles away in the same
picture, the bed a prisoner sleeps in is a rectangle of `0x7f8ba0`.

### The controlled pair, and it is the largest finding in this record

**The first attempt at this act was spoiled and the second was not, and both
are reported.** In the first sealed run the toilet press placed a fifth bed
instead of a toilet — the `armBuildable` race act 2 measured — so that cell read
`roomCapacity=5` against the working cell's `4`, and the run then threw
`stuck at tick 20031, wanted 24000` on `runUntilTick`'s default 180 s budget at
load average around 9. Given a fifteen-minute budget and re-run, act 3b placed
its toilet, reached **tick 24,135**, and reported `roomCapacity: 4`,
`accommodationCapacity: 4`, `roomOccupants: 4` — the working cell's numbers
exactly, minus the door.

So the pair is:

| | working (act 3a) | sealed (act 3b) |
| --- | --- | --- |
| door | wooden door, south wall of (14,17) | none |
| tick | 24,214 | 24,135 |
| prisoners / occupants | 4 / 4 | 4 / 4 |
| `roomCapacity` | 4 | 4 |
| staff | 2 | 2 |
| treasury | 28,530, rising | 30,450, rising |
| Rooms panel | ready | `Cell at 12, 12 is missing / a door — nobody can get in` |

**Differing pixels: 6,061 of 147,456 — 4.11%.** Per tile, out of 4,096 each:

```
      x12    x13    x14    x15    x16    x17
y12:  385    798    896    896    14     0
y13:  0      0      0      0      0      0
y14:  0      0      0      0      0      0
y15:  0      0      0      0      0      0
y16:  0      0      0      0      0      0
y17:  0      0      3072   0      0      0
```

**Thirty-two of the thirty-six tiles are pixel-identical.** The 3,072 pixels at
(14,17) are the door itself. The 2,989 across row y=12 are the four prisoner
sprites overlapping slightly differently in the same corner tile — same tile,
same four orange figures, same pose family.

**The same measurement, taken twice, independently, gives the same map.** Before
act 3b was re-run I compared act 1's *sealed* cell at tick 7506, **day 4**,
against act 3a's *working* cell at tick 24,214, **day 11** — a different pair,
seven in-game days apart, cropped from a differently-padded file — and it
returned `6,061` of `147,456`, `4.11%`, and this per-tile map digit for digit.
Three regions checked separately in that pass came back at **exactly zero**: the
two guards (36,864 px), a four-by-two patch of open floor (32,768 px), and every
tile in rows y=13 through y=16.

So, to the brief's third question — **does the world show state, or only the
HUD?** A prison whose only cell nobody can enter, and a working prison, are the
same picture apart from the door the player built. No distress, no need
indicator, no posture, no tint, no icon, nothing. Every bit of "how is my prison
doing" lives in the HUD, and the strip's whole contribution is a `1 not ready`
badge beside the `ROOMS` chip.

**#944's headline claim was that a working cell and a dead cell screenshot
byte-identically. Measured without art, that was guaranteed by the art being
absent. Measured with the art, it is 95.89% true, and the 4.11% is a door.**

The measurement is reproducible from the committed files: decode
`act3-working.png` and `act3-sealed.png` and compare pixel by pixel.

## 5. Act 4 — stacking at twelve and at fifty

Twelve beds in the same 6×6 cell, twelve prisoners admitted, run to tick 9,078
(`roomCapacity: 12`, `accommodationCapacity: 12`, `roomOccupants: 12`), then
thirty-eight more Admit presses. Screenshots:
`2026-09-05-what-the-world-shows/act4-twelve.png` and `act4-fifty.png` at 1:1,
`act4-twelve-anchor-x4.png` and `act4-fifty-anchor-x4.png` magnified four
times, plus the two `-full.png` pages.

### At twelve, the crowd spread has run out of room, exactly as it says it will

`CROWD_SPREAD_SPAN_TILES_X` `0.44` and `_Y` `0.3` are 28 px by 19 px at
`TILE` 64, and the fan divides that span across `count - 1` gaps. At four that
is ~9 px a rank and four countable figures (§2). **At twelve it is ~2.5 px a
rank**, and what is on screen is a single corrugated orange mass with a comb of
overlapping cap brims along its top edge. You can see that it is many people —
the brims are individually visible and countable — and you cannot see twelve
people.

That is `src/rendering/actors/crowd-spread.ts` behaving as documented rather
than failing: its docblock says in terms that *"two or three actors on a tile
read as two or three figures; twenty-two read as a crowd standing on one tile
rather than as one person. It reports the crowd. It does not count it, and it
does not unstack it."* Twelve is past the point where reporting is all it can
do. **The finding is not about the renderer; it is that a twelve-prisoner
prison, at the default zoom, shows the player one orange smudge in a corner and
no way to tell whether it is three people or thirty.**

### And the room the twelve live in has stopped reading as a room

Twelve beds fill nearly the whole 6×6 floor, and because every object is
§3's flat slab, a fully furnished cell is a **wall-to-wall field of
`0x7f8ba0`** with the linoleum showing only in the strip the beds do not reach.
So the one thing the world view does well for rooms — the floor art that says
"this is an interior" — is covered up by the thing it does worst, in exactly
the prison a player is trying to build. `act4-twelve.png` is that picture.

### At fifty, a prison of fifty people is two orange smudges

Thirty-eight more Admit presses, 49 s of clicking, and the counts read
`prisoners: 50`, `prisonersInIntake: 38`, `roomCapacity: 12`,
`roomOccupants: 12`. The strip reads `50 PRISONERS  38 with no bed`,
`COVERAGE Understaffed`, `1 ROOMS  1 not ready`; the Intake panel reads
`38 waiting with no bed to sleep in`, `IN INTAKE 38 of 50`,
`38 at Cell Assignment`; and the alerts column has picked up *"A fight has
broken out between two prisoners. Day 6"* and *"No incident is still open — but
the last one ran out of time instead of being contained, and everyone caught in
it was hurt. Day 6"*.

**On screen there are two orange lumps and one guard.** One lump is the twelve
housed prisoners on the room's `anchorTile` (12,12); the other is the
thirty-eight unhoused on `NEW_PRISON_ORIGIN_TILE` (16,16), with a guard drawn
in front of it. The second guard is somewhere inside that lump and cannot be
seen at all. Screenshot: `2026-09-05-what-the-world-shows/act4-fifty-full.png`.

**And the two lumps are the same size.** The pile of twelve and the pile of
thirty-eight are both one bounded fan inside one tile, because the fan's span is
a constant. Measured on the two magnified anchor crops, over the 320×400 region
of the `-x4` files that contains the pile: **0 differing pixels of 128,000**
between `act4-twelve-anchor-x4.png` and `act4-fifty-anchor-x4.png`. Thirty-eight
further admissions changed that tile by nothing, which is correct — they went
to a different tile — and is also the point: **there is no drawn difference
between twelve people in a place and fifty.**

So, to the brief's fourth question — what does the stacking cost a player
trying to read their prison? At four it costs nothing. At twelve it costs the
count. At fifty it costs the population: a fight has broken out, thirty-eight
people have nowhere to sleep, the prison is understaffed, and the world view's
entire report on all of that is two orange shapes that look exactly like each
other.

## 5b. Act 5 — nothing moves, and once with the confound removed

Six crops of the same 512×512 rectangle, 2 s of wall clock apart, at ×4 speed,
in the standard four-prisoner two-guard prison. Ticks 5,976 → 6,221 → 6,445 →
6,671 → 6,895 → 7,120: **1,144 ticks, just under half an in-game day.**

**Every one of the five comparisons against frame 0 came back at 0 differing
pixels of 409,600.** Not "almost identical" — the six files are the same
picture. Nobody took a step, nobody turned, nothing animated. That is partly
the art: `idle` in every atlas manifest is `fps: 1` with exactly one frame per
direction, so a standing figure is a still image by construction and only
`walk` has frames. But a *still* figure and a figure that never goes anywhere
are different things, and this measures the second.

**The confound, and act 8 removes it.** Act 5's prison is the doorless cell
`buildAndPopulate` builds, so it is a prison where nothing legal can happen and
"nothing moved" has an innocent explanation. Act 8 is the same measurement —
eight frames, 2.5 s apart — after a wooden door is built into the south wall
and the Rooms panel reports the room ready (`NOT READY` block absent,
`roomCapacity: 4`, `accommodationCapacity: 4`, `roomOccupants: 4`).

### Act 8 — the same answer in a cell that works

Eight frames, ticks **6,914 → 8,792**: 1,878 ticks, about **0.78 of an in-game
day**, in a *ready* cell with four prisoners who have four beds and a toilet and
a door, and two guards. Frames:
`2026-09-05-what-the-world-shows/act8-frame-0.png` through `act8-frame-7.png`.

**Exactly one thing changed in the whole run, and it was not a person.** Frames
0, 1, 2 and 3 are pixel-identical; frames 4, 5, 6 and 7 are pixel-identical;
and between 3 and 4 **7,434 pixels of 409,600 (1.81%)** changed, inside a single
66×113 px box at the south wall of tile (14,17). Looking at the two files: frame
3 has a translucent tan block sitting in the wall line, and frame 4 has the
finished steel door. **The door finished being built.** Nobody walked, nobody
turned, no prisoner went to a bed or a toilet, in either half of the run.

So the confound is removed and the answer does not change: **in a prison that
works, over three quarters of an in-game day, the world view is a still
picture.** The one thing it animates is construction.

(That translucent block is the world view's *only* state indicator that I found
— `appearance.ts` carries `PLANNED_ALPHA` `0.35` and `BUILDING_ALPHA` `0.65`
(`src/rendering/world/appearance.ts:276` and `:277`) for exactly this. **Which
phase the block was in, and why it was still drawn after `waitForQueueEmpty`
reported an empty queue and the Rooms panel reported the room ready, I did not
establish**, and it is worth someone else's ten minutes: a renderer that shows
a door unbuilt while the simulation counts it built is a disagreement, and I
have a screenshot pair and no diagnosis.)

## 6. Act 6 — the same box, designated four different ways

The same 6×6 brick enclosure, built four times in four fresh prisons and
designated **Cell** (category `housing`), **Kitchen** (`food`), **Solitary
Cell** (`security`) and **Classroom** (`education`) — the four widest-apart
hues in `ZONING_TINT_BY_CATEGORY` (`src/rendering/world/appearance.ts:84`):
`0x4f7fd0`, `0xd0854f`, `0xd05a4f`, `0x9a4fd0`. No objects, no people, so the
floor is all there is to read. Screenshots:
`2026-09-05-what-the-world-shows/act6-cell.png`, `act6-kitchen.png`,
`act6-solitary.png`, `act6-classroom.png`, each with an `-x2`.

**Every room type is drawn on the same floor image.** `zonedFloorSprite`
(`src/rendering/world/environment-art.ts:104`) returns
`'env.floor.institutional'` for **any** known zoning id — the function does not
branch on category at all, and its own docblock says so: *"One floor for every
category today."* Eleven categories, one floor. The only thing that separates
them is `zoningTint` washed over it at `ZONING_TINT_ALPHA_OVER_ART` `0.14`
(`src/rendering/world/appearance.ts:110`), which is deliberately weak, for a
reason **that constant's own** docblock gives and which is correct: at `0.28`
*"a photographed linoleum floor stops reading as a floor and becomes a coloured
rectangle again"*.

**What 14% buys, measured.** Mean RGB over the same 192×192 patch of clean
floor in each picture:

```
cell       (housing,   0x4f7fd0)   mean floor RGB = (109.4, 126.6, 149.4)
classroom  (education, 0x9a4fd0)   mean floor RGB = (119.5, 120.1, 149.4)
kitchen    (food,      0xd0854f)   mean floor RGB = (126.8, 127.4, 132.0)
solitary   (security,  0xd05a4f)   mean floor RGB = (126.8, 121.6, 132.0)

pairwise Euclidean RGB distance
  cell      vs classroom :  12.0
  cell      vs kitchen   :  24.7
  cell      vs solitary  :  25.2
  classroom vs kitchen   :  20.3
  classroom vs solitary  :  19.0
  kitchen   vs solitary  :   5.8
```

**A Kitchen and a Solitary Cell are 5.8 RGB units apart**, on a speckled
photographic floor, seen at 64 px a tile. That is not a subtle distinction; it
is no distinction. The widest pair **of the four I measured** — a Cell against
a Solitary Cell — is 25.2, which is the difference between "bluish grey" and
"warm grey". Looking at the four pictures: the Cell is recognisably blue, the
Classroom is a blue-violet I can tell from it, and the Kitchen and the Solitary
Cell are the same neutral warm grey to my eye. The other seven categories are
unmeasured (§9).

**And the palette is coarser than the room list before the alpha touches it.**
Eighteen room types map onto **eleven** categories
(`src/content/room-catalog.ts:92` onward) and eleven categories map onto one
floor image, so a Kitchen and a Canteen, a Cell and a Holding Cell, a Solitary
Cell and a Security Office, a Shower Room and a Laundry, a Yard and a Common
Room, and all three of Storage Room, Delivery Bay and Garbage Room are each
**exactly** the same pixels. Eighteen designations, eleven washes, one floor.

So, to the brief's second question — does a room read as the thing it was
designated? **A room reads unmistakably as a room** (§2: the floor art against
brown dirt is the world view's second-best trick). **It does not read as which
room.** A player who designates a Kitchen and comes back an hour later has no
way to tell it from the Solitary Cell next door, and once it is furnished (§5)
the floor is under a field of slabs anyway.


## 6b. Act 7 — what the wheel does, and the edge of the world

Same four-prisoner prison. Five wheel notches out, seven more, then eighteen
back in — the wheel's step is `0.9` and `1.1`
(`src/rendering/scene/world-scene.ts:511`). Screenshots:
`2026-09-05-what-the-world-shows/act7-zoom-default.png`, `act7-zoom-out-5.png`,
`act7-zoom-out-12.png`, `act7-zoom-in-6.png`.

**The wheel zooms, smoothly, and nothing on the page acknowledges it.** No
readout, no chip, no percentage, no reset control; the status strip is byte-for-
byte the same string before and after twelve notches. The one number the strip
does carry, `INTERFACE SCALE 100%`, is the HUD's own text scale and does not
move with the camera — so the page shows a percentage that looks like a zoom
level and is not one.

**At five notches out (zoom ≈ 0.59) the world is still perfectly readable.**
Orange prisoners, blue guards, the room's floor against the dirt: everything §2
says survives. This is a better default for looking at a prison than the
default is, and no control offers it.

**At twelve notches out (zoom ≈ 0.28) the whole world fits on screen, and it is
a 32×32-tile square with nothing in it.** Measured off the screenshot by
scanning for `VOID_COLOR` `0x0b0e12` (`src/rendering/world/appearance.ts:45`):
the non-void span is **580 px across and 580 px down**, which at 0.2824 is
2,054 world px — **32.1 tiles each way**. That is not an inference, it is the
documented shape: *"A new session owns exactly chunk (0,0) of a 32-tile
world"* (`src/main.ts:603`). Outside it the camera background shows through
because an unloaded chunk gets no draw calls at all, which
`src/rendering/world/appearance.ts:37` states — *"`TileLayer.updateChunks` gives an unloaded chunk **no draw calls at all** and lets the camera background show through, so \"the void\" is painted by the background and bounded by wherever loaded chunks stop"*.

So the zoom a player is not told about is also the only way to answer *"how big
is my prison allowed to get"*, and the answer it gives is a hard-edged square
of empty dirt with a 6×6 box in the middle of it. At that zoom the four
prisoners are a five-pixel orange fleck.

**At 1.57× (eighteen notches back in) the sprites hold up.** The atlas frames
are 256×384 and drawn at 0.25, so there is a great deal of headroom; magnified
they are crisp rather than soft, and a guard's badge and cap are individually
readable.



## 7. Three of the five shipped populations can never appear

`public/assets/actors/` ships five complete actor asset sets — `actor.cook.base`,
`actor.guard.base`, `actor.medic.base`, `actor.prisoner.base`,
`actor.staff.base` — each with an `idle` sheet, a `walk` sheet and an
atlas manifest, all 8-directional. The Security tab's hire list offers exactly
one role, `staff-role.guard`, and the `STAFF` chip counted `2` after two hires
with two guards on screen. So **a cook, a medic and a generic staff member are
art the game has and cannot show**, and the play-test question *"guard,
prisoner, staff, cook — can you tell them apart"* can only be answered for two
of the four. What I can say about the other three is that their sheets decode
(the console is clean and the loader pulls all five) and nothing more.

## 8. What this adds up to

**Nine readings, in the order I would act on them.** The state finding is
first because it is the one the brief asked for and the one that was measured
rather than argued.

0. **A working prison and a sealed one are the same picture apart from the door
   the player built** — 4.11% of pixels, thirty-two of thirty-six tiles
   identical (§4) — and at fifty prisoners, with a fight in the alerts column
   and thirty-eight people with nowhere to sleep, the world view's whole report
   is two orange lumps that are pixel-identical to each other over the region
   that holds them (§5). **The world view carries no state. All of it is in the
   HUD.**

1. **The people are the best thing in this game and nobody had seen them.**
   Two populations, unmistakable at 1:1 with no zoom and no click. This is not a
   caveat-laden pass; it is the answer to the brief's first question and the
   answer is yes.
2. **A room's contents carry no information at all.** Twenty catalogued objects,
   two flat colours, four silhouettes. Not "hard to tell apart" — there is
   nothing on screen to tell apart, and the sheets for thirteen of the twenty
   are already in the repository. The gap is declared in
   `src/rendering/world/environment-art.ts` and priced there at roughly 1.5 MB
   per sheet; what was not on record is that it is the single largest gap
   between what the world view could say and what it says.
3. **A fifteen-fold zoom exists and the page never mentions it.** Wheel and
   keyboard, `ZOOM_BOUNDS = { min: 0.2, max: 3 }`, no control, no hint, and the
   one hint that is there names panning only. Against *no hidden mechanics*
   this is the plainest one in the world view.
4. **#944's headline picture is already fixed and a report that repeats it is
   repeating a fixed defect.** `crowd-spread.ts` fans co-located actors, and
   four prisoners on one tile are four countable figures.
5. **`buildAndPopulate`'s canonical 6×6 cell contains the spawn tile**
   `NEW_PRISON_ORIGIN_TILE` `{ x: 16, y: 16 }`, so guards standing in a sealed
   room are not evidence that anything walked, and no playtest using that
   helper can read guard position as movement.
6. **The minimap says `MINIMAP IS NOT AVAILABLE YET`**, which means the one
   surface that would let a player see a prison larger than a screen is a
   placeholder, and the zoom that would substitute for it is the hidden
   mechanic in item 3.
7. **A room reads as a room and not as which room.** One floor image for all
   eighteen room types, eleven category tints at 14% alpha over it, and the two
   I measured closest — a Kitchen and a Solitary Cell — are **5.8 RGB units**
   apart (§6).
8. **Nothing moves, in a prison that works.** Act 5: six frames over 1,144
   ticks, `0` differing pixels of 409,600, in a sealed cell. Act 8, same
   measurement in a *ready* cell with a door: eight frames over 1,878 ticks and
   **one** change, which was the door finishing construction (§5b). Nobody
   walked in either.
9. **The whole world is a 32×32-tile square** and the only way to see that it
   is is the undocumented zoom (§6b).

**What I am deliberately not proposing.** Whether object art should be drawn is
already decided and scheduled by the module that declines to draw it; that is
not mine to re-decide, and this record adds only the cost side of it. Whether
zoom should have a control is a UI decision on a surface another agent owns in
this session (`src/ui/**`). Nothing under `src/` is touched on this branch.

## 9. My weakest claim, and what I did not reach

**Weakest: that a player cannot read what is in a room.** What I measured is
that eighteen objects draw two colours and four silhouettes, which is a fact
about pixels. "A player cannot read it" is an inference from that fact. A player
who has learned the four footprints and remembers what they put where can read
a good deal — a 1×2 in a cell is a bed because nothing else in a cell is 1×2.
What would change my mind is watching someone identify objects in a room they
did not build. What strengthens it is that the game offers no other channel:
there is no hover label on a placed object anywhere in what I exercised.

**Second weakest: the four wrong objects in act 2 are my instrument.** The count
argument (fourteen right, four wrong; a systematic failure would give one right
and seventeen wrong) is sound as far as it goes, and I did not log the arm
control's text at each step, so I have not *seen* the mechanism. If someone
re-runs act 2 with that logging and finds the label already reading `Place …`
when the wrong object went down, the reading flips to the game and it is a
serious defect. I have made no claim about the panel.

**Third: I do not know why the door was still drawn as a construction block
after the queue said empty.** Act 8's frames 3 and 4 are the evidence and I have
no diagnosis; the two candidate readings — a render phase that lags the
simulation, or the queue readout emptying before the order does — are both
plausible from where I stand and I did not separate them.

**Not a claim of mine at all:** anything about whether the simulation reserved
the tiles the straddling dining table is drawn over. I saw pixels crossing a
wall and said so.

### What I did not reach

- **Seven of the eleven room-tint categories.** Act 6 measured four
  (`housing`, `food`, `security`, `education`). `administration`, `hygiene`,
  `logistics`, `medical`, `operations`, `recreation` and `utility` are
  unmeasured, and the two I would look at next are `hygiene` `0x4fc0d0` and
  `utility` `0x4fd0a2`, which are the two closest hues in the table.
- **Any viewport but 1440×900, and touch.** The playtest config is 1440×900 at
  `devicePixelRatio` 1. `tests/browser/playtest-2026-09-04-touch-only.playtest.ts`
  owns the touch surface.
- **Three of the five shipped populations.** Cook, medic and generic staff
  cannot be hired (§7), so I have no screenshot of them and cannot say whether
  they are distinguishable from a guard, which is half of the brief's first
  question.
- **More than one room at a time.** Every act builds exactly one room, so what
  a twenty-room prison reads like — and whether eleven category tints at 14%
  survive being adjacent rather than compared across four separate screenshots —
  is unmeasured, and it is the case that matters most for §6's finding.
- **Whether an object is ever hoverable or selectable.** I pressed tiles with
  build tools only. If there is an inspect gesture, I did not find it and did
  not look for it. This is load-bearing for §3's weakest claim: an object with a
  hover label would be readable despite the slab.
- **Anything at all above four prisoners in a prison that works.** Acts 4's
  crowds were in a cell with no door, so the twelve and the fifty were not
  doing anything they could have been doing. Whether a working prison of fifty
  looks different is unmeasured.
- **The gate suites.** This branch adds no `*.spec.ts` and touches no `src/`,
  so no gate's behaviour changes; I ran the five documentation contracts in
  `tests/foundation/` and nothing else. Those reported `41 passed`, `3 failed`,
  and **all three failures are pre-existing and none names this record**: two
  are `docs/adr/STATUS-QUEUE.md` citations that resolve on disk but on no
  published ref, and the third is
  `documentation-commit-citation-contract.test.ts`'s own depth check, which
  fails because `git rev-parse --is-shallow-repository` is `true` in this
  container. Verified by re-running the file and grepping its output for this
  record's filename: zero matches.
