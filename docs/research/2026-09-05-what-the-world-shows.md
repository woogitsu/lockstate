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

- **There is no zoom or camera control anywhere in the DOM.** A sweep of every
  `button` and `[role="button"]` for `zoom|camera|centre|center|minimap|fit`
  returned **nothing**. The Build panel's own hint says *"Two fingers, the
  middle button or the arrow keys still move the camera"* — so the camera pans
  and there is no evidence in the DOM that it zooms. Every reading in this
  record is therefore at *the* zoom, not at *a* zoom.
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
(`public/assets/actors/actor.prisoner.base.atlas-manifests.json`), and the
figures on screen are lit, shaded and legible at the ~35×55 px they occupy.
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
fanned along a south-east cascade, roughly 9 px per rank in x and 7 in y, so
four separate figures are visible and countable.

That is `src/rendering/actors/crowd-spread.ts`, which landed for #944 §4 and
whose own docblock states its bound before anything else does: `rank 0` does not
move, the fan is monotone on both axes, it goes south and east only, and it is
bounded inside the tile at `CROWD_SPREAD_SPAN_TILES_X` = `0.44` and
`CROWD_SPREAD_SPAN_TILES_Y` = `0.3` — 28 px by 19 px at `TILE` 64. My
measurement off `act1-anchor-tile-x8.png`, read at ⅛ scale: feet at (27,21),
(36,29), (46,36), (61,42), so a 34×21 px total span across three gaps. That is
the documented fan, working. **So the picture #944 predicted — four people
drawn as one — is not what the game does today**, and a record that repeats
that prediction is repeating a fixed defect.

### One thing that is odd and one thing that is not

- **Two guards were standing inside a cell that has no door.** The room's
  perimeter is unbroken brick and there are two blue figures on its floor. I did
  not establish how they got there and I am not calling it a defect; it is
  recorded because it is the one thing in act 1 that a player would read as
  wrong.
- **An idle actor never moves a pixel, and that is the art, not a stuck
  animation.** The `idle` clip in every atlas manifest is `fps: 1` with exactly
  **one frame per direction**; only `walk` has eight frames at `fps: 10`. So a
  standing figure is a still image by construction, and reporting it as a
  frozen animation would be wrong.

## 3. Act 2 — the showroom: what each buildable actually draws

_Pending — see §9._

## 4. Act 3 — a working cell and a sealed one, side by side

_Pending — see §9._

## 5. Act 4 — stacking at twelve and at fifty

_Pending — see §9._

## 6. Act 6 — the same box, designated four different ways

_Pending — see §9._

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

_Pending — written once every act has run._

## 9. My weakest claim, and what I did not reach

_Pending._
