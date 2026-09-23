# Is the bed the right way up, and does one object make a cell furnished?

**Date:** 2026-09-06
**Question:** two things landed within hours of each other and nobody had
looked at either in a running game. [#1028](https://github.com/matmaxalez/lockstate/pull/1028)
(`977129a8`) drew the first catalogued object from the environment atlas —
`object.bed` — and **its own author named the weakest claim and left it
standing**: *"The browser test proves the bed is drawn from the atlas; it does
not prove the bed is drawn right way up. Its pixel probe would pass on a frame
rotated 180° or mirrored, because it only requires the colour to differ from
the slab."* And [#1026](https://github.com/matmaxalez/lockstate/pull/1026)
(`9bb526a6`) put a zoom control on screen for a fifteen-fold range the game had
never mentioned, which nobody had used while playing. Meanwhile
[ADR 0097](../adr/0097-what-the-world-view-is-required-to-communicate.md) was
accepted by the owner together with option A (`71c9aeb4`), and its option D —
*a furnished cell drawn as furnished answers the "what is here" half of the
world view's obligation on its own* — had stopped being a wait and become a
measurement that could be taken. So: **is the bed the right way up, does a
furnished cell read as furnished, how far does one object get, and is the zoom
usable?**

**Tree played:** `9b43fb0d` (**v0.0.504**), in worktree
`…/scratchpad/wt-play` on branch `playtest/the-first-furnished-cell`.
**Nothing under `src/` differs from that commit on this branch**; it adds one
`*.playtest.ts` instrument, this record and its screenshots. The status strip
confirms the tree from inside the running page in every full screenshot below:
`v0.0.504 · 9b43fb0`.

**The art was present, and that is the precondition every earlier visual claim
in this repository failed.** In this container the worktree carried the bytes
on checkout: `file public/assets/actors/actor.guard.base.idle.png` answers
`PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced`, `git lfs
version` answers `git-lfs/3.4.1`, and `du -sh .git/lfs` answers `54M`. **No
`git lfs checkout` was needed or run.** `git lfs ls-files` names 62 paths and
`file` over all of them returns **0 pointers**: 46 PNGs at 1448×1086, 5 at
2080×3104, 5 at 260×3104 and **6 Zstandard-compressed `.blend` sources**.
(`2026-09-05-what-the-world-shows.md` calls all 62 "real image bytes" and then
enumerates 56 of them; the other six are the Blender files under
`assets/source/blender/`. The conclusion is unaffected — none of the 62 is a
pointer — but the sentence was six files wrong and is corrected here.)

**And the check that actually matters, because the failure mode is silent:
every one of the five acts printed its whole browser console, and every one
holds exactly one line** — Phaser's own version banner,
`Phaser v4.2.1 (WebGL | Web Audio)`. No `Failed to process file`, no
`InvalidStateError: The source image could not be decoded`, no page error.
Every screenshot below is of a page that loaded all of its art.

**Reproduction**, one act at a time. Nothing in CI collects it —
`tests/browser/playwright.config.ts` is `testMatch: /.*\.spec\.ts$/`, and
`tests/browser/playwright.playtest.config.ts` is the config that matches
`*.playtest.ts`:

```
LOCKSTATE_BROWSER_TEST_PORT=5371 ./node_modules/.bin/playwright test \
  -c tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-06-the-first-furnished-cell.playtest.ts \
  --grep "act 1"
```

Screenshots are committed under
`docs/research/2026-09-06-the-first-furnished-cell/`. A `-full` suffix is the
whole 1440×900 page at `devicePixelRatio` 1; no suffix is a crop of the page in
CSS pixels, so a file named `…-cell-furnished.png` is exactly the pixels a
player's eye receives; `-xN` is that crop upscaled N× by nearest neighbour in
the page itself (`imageSmoothingEnabled = false`), so it invents nothing.

**Thirty-seven files are committed there and they are the evidence, not
illustration.** `act0-*` is the opening screen and the zoom control on it;
`act1-cell-bare*`/`act1-cell-furnished*` are the controlled pair act 2
measures; `act1-one-bed*` is the single bed the orientation question is decided
on; `act1-bed-source-crop*` are the packer's input and its own turn of it;
`act1-armed-preview*` is a bed mid-construction; `act1-zoom-*` and `act3-zoom-*`
are both ends of the range and the round trip back; `act3-lived-in*` is the same
cell with people in it; `act4-just-after-placing*`/`act4-long-after-placing*`
are the pair that catches the fourth bed finishing.

---

## The answer, in one paragraph

**The bed is the right way up.** Pillow at the north end, folded blanket at the
foot, at every zoom, established three independent ways and not by reading the
rotation code: the shipped sheet's crop has the pillow at the **west**, the
packer's own quarter-turn reproduced in the page from the declared numbers puts
it at the **north**, the screenshot of the game agrees, and a luminance-profile
correlation between the reconstruction and the screen prefers the un-flipped
orientation by **0.0953 against 0.3379**, a factor of 3.5. **A furnished cell
now differs from the same cell unfurnished by 20.91% of its pixels, of which
16.93% is the four beds** — against the 4.11% that
`2026-09-05-what-the-world-shows.md` measured between a working cell and a
sealed one, where the whole 4.11% was a door. **One object gets further than it
sounds**: at the default zoom four beds along the north wall make the room
unmistakably a dormitory, and at zoom 0.2 — the whole 32×32 world on screen at
once — the four beds are *still individually countable*. What it does not get is
the other half of ADR 0097's requirement: a bed says what is here, and nothing
in the world still says whether the room **works**. The toilet standing three
tiles away in the same frame is the flat `0x7f8ba0` slab it has always been, and
it is the object a cell requires second. **The zoom control is findable, usable
and exactly correct at both ends** — measured off the screenshots at zoom
**3.000** and **0.199** — and both ends are worth having. Four other things went
wrong in front of me, one of which is that the HUD counts a bed as capacity the
instant it is ordered, while the world honestly draws it as a ghost for
thousands of ticks afterwards.

---

## 1. Act 1 — is the bed the right way up

**MEASURED, three ways that do not share a failure.** Screenshots:
`act1-one-bed.png` (one bed at 1:1, 64×128 CSS px — its whole footprint) and
`act1-one-bed-x8.png`; `act1-cell-furnished.png` and `-x3`;
`act1-bed-source-crop.png` and `act1-bed-source-crop-turned.png`.

### What the packer is fed

`src/rendering/assets/environment-sprites.ts:184-190` declares `env.object.bed`
as `sourceRectPx {x: 740, y: 288, width: 460, height: 230}` of
`furniture.cell.bed.single.variants`, `runtimeSizePx 256×128`,
`quarterTurns: 1`, with the note *"Single bed seen from directly above, made,
pillow to the north once turned."*
`src/rendering/assets/environment-atlas-plan.ts:155-158` passes
`definition.sourceRectPx` and `definition.quarterTurns` through unchanged, and
`public/game-content/source-art.v1.json` maps that asset id to
`source-art/furniture.cell.bed.single.variants.45bfa2e0ab8d.png`,
`dimensionsPx {1448, 1086}`.

The instrument fetches **that** file from the running dev server, cuts **that**
rectangle, and writes it out: `act1-bed-source-crop.png`. It is one bed seen
from directly above, made, **pillow at the left — the west**, a dark folded
blanket at the right. So the declared note's premise is true of the shipped
bytes, and it was not taken on trust.

### What the packer's own turn makes of it

`drawFrame` (`src/rendering/phaser/environment-textures.ts:141-152`) is three
statements: `translate(x + width, y)`, `rotate(Math.PI / 2)`,
`drawImage(cut, 0, 0, height, width)`. The instrument runs exactly those three
on the crop above and writes `act1-bed-source-crop-turned.png`: **the pillow is
at the top.** A canvas `rotate` of `+π/2` is clockwise, so the crop's left edge
becomes the destination's top edge — west becomes north.

### What the game actually drew

`act1-one-bed-x8.png` is the 64×128 page rectangle of tile (14,12)–(14,13),
magnified eight times. **Pillow at the north end, mattress, dark folded blanket
at the south end, tubular head and foot rails.** Not rotated 180°. It agrees
with the reconstruction above, which is the point: the reconstruction and the
screenshot come from different code paths — a `<canvas>` in the page versus
Phaser's atlas, a texture and a `TileSprite` — and they agree.

And **numerically**, so it does not rest on my eyes: the mean vertical
luminance profile of the reconstructed frame against the same profile of the
on-screen bed, both normalised and resampled to 64 samples over the middle 40%
of the width, gives **MAD 0.0953 as drawn and 0.3379 flipped end-for-end**.

### The one thing this cannot exclude, and why it does not matter

**A mirror about the bed's long axis is not excluded by any of the above, and
the reason is measurable: the bed is nearly symmetric about that axis.** The
reconstruction's own horizontal profile against its reverse is **MAD 0.0985**,
where the vertical one is 0.2644 — so the east–west direction carries about a
third of the signal, and the on-screen comparison there (0.1598 as-is against
0.1905 mirrored) is too close to rule on. It is excluded by *reading* instead,
and the read is short: `drawFrame` applies only `translate` and `rotate`, with
no negative scale on either axis, and `acquireSprite`
(`src/rendering/phaser/tile-layer.ts:235-260`) sizes a `TileSprite` with
positive extents. **There is nowhere for a mirror to happen.** And if one did,
a bed this symmetric would look identical to a player, which is the honest end
of that thread.

**So #1028's standing weakest claim is discharged in the direction its author
hoped**, and by evidence in the repository rather than an offline reproduction.

---

## 2. Act 2 — what four beds are worth, in pixels

**MEASURED.** One prison photographed twice — walls, zoning, floor, toilet,
camera and *zero* actors identical, the build tool disarmed and the pointer
parked on empty ground at the same coordinates for both frames — so the two
files differ by what was built between them. `act1-cell-bare.png` against
`act1-cell-furnished.png`, both the 384×384 page rectangle of the 6×6 cell.

**30,828 differing pixels of 147,456 — 20.91%.** Per tile, out of 4,096 each:

```
      x12    x13    x14    x15    x16    x17
y12:  196    3033   3033   3033   2799   0
y13:  0      3291   3291   3291   3187   0
y14:  0      0      0      0      0      0
y15:  1664   26     0      0      0      0
y16:  3867   64     0      0      0      0
y17:  52     1      0      0      0      0
```

It decomposes exactly, and the three parts sum to the whole:

| region | pixels | of the crop | what it is |
| --- | --- | --- | --- |
| columns 13–16, rows 12–13 | **24,958** | **16.93%** | the four beds |
| columns 12–13, rows 15–17 | 5,674 | 3.85% | the **toilet finishing construction** between the two frames |
| the north-west corner tile | 196 | 0.13% | unexplained; see §6 |
| | **30,828** | **20.91%** | |

**The beds fill 24,958 of the 32,768 pixels their own footprints claim — 76.2%
of the rectangle the player was told the object takes.** The rest of each
footprint is the floor showing past the bed's rails, which is correct: a bed is
narrower than a tile.

**Against the number this repository already had:**
`2026-09-05-what-the-world-shows.md` measured a working cell against a sealed
one at **6,061 of 147,456, 4.11%, and the whole 4.11% was a door** — the same
crop, the same size, the same instrument. Four beds are **four times** that, and
unlike the door they are spread across eight tiles instead of one.

**But the comparison that decides the question is not with a slab-era
screenshot, it is with the slab in the same frame.** `act1-cell-furnished-x3.png`
holds both: four beds drawn from the atlas along the north wall, and the toilet
at (12,16) drawn as `CATEGORY_FALLBACK.object` — a flat `0x7f8ba0` top face over
a `0x55607a` side face, a rectangle with a fake elevation and no other
information in it. The bed tells you which way a prisoner lies; the toilet tells
you a thing is there. That is the whole of what one object bought, and it is
visible in one picture.

---

## 3. Does that change the answer to "can a player tell whether this room works"?

**Partly, and the honest split is ADR 0097's own.** The ADR requires the world
view to communicate *what is here* and *whether it works*.

**"What is here" moved, measurably.** `act3-lived-in-x3.png` is the same cell
with four prisoners and two guards living in it at tick 7,422. Without clicking
anything a player can see: four beds along the north wall, the direction each
sleeps, a prisoner standing at the head of the first one, two guards in the
middle of the floor, a toilet in the south-west corner, institutional linoleum,
stone walls. The 2026-09-05 pass's sentence — *"a room's floor tells you it is a
room, its tint tells you which category of room, and its contents tell you
nothing at all"* — **is no longer true of a cell.** It is still true of every
other room in the game.

**"Whether it works" did not move at all.** The cell in `act3-lived-in` is
`1 not ready` — the Rooms panel says *"Cell at 12, 12 is missing / a door —
nobody can get in"* — and there is nothing whatever in the picture that says so.
No distress, no posture, no tint, no icon. The beds look exactly as they would
in a working cell. Everything about "is this prison all right" is still in the
HUD, exactly as the earlier pass measured, and one bed does not touch it.

**How far one object gets, said plainly:** it answers *what is this room for*
and *how many people can it hold*, both at a glance and both for the first time.
It does not answer *is anyone using it*, *is it finished*, or *is anything
wrong*.

**What the next object would have to be, and it is not a matter of taste.**
`src/content/room-catalog.ts:91-96` gives `room.cell` exactly four requirements,
and two of them are objects: `object.bed` and **`object.toilet`**. A cell is the
only room a new player builds; a toilet is the only other thing that room
requires; and `fixture.cell.toilet_sink.18b4c51aa610.png` already ships, 1.28 MiB
of it, sitting unmapped in `OBJECTS_ON_COLOUR_FALLBACK`
(`src/rendering/world/environment-art.ts:207-227`). Adding it is one row in
`SPRITE_BY_OBJECT_ID` (`:260-262`) plus one rectangle in
`environment-sprites.ts`, and it would take the canonical starting room from
half-drawn to fully drawn. **Any other object leaves the first room a player
builds still showing a slab.**

---

## 4. Act 0, 1 and 3 — the zoom control, used while playing

**MEASURED.** Screenshots: `act0-zoom-control.png` and `-x4`,
`act1-zoom-max-full.png`, `act1-zoom-min-full.png`,
`act3-zoom-max-centre.png`, `act3-zoom-min-centre-x4.png`,
`act1-zoom-round-trip-full.png`.

### Findable

It is on the opening screen with nothing built, above the minimap, at
`{x: 12, y: 446.8, width: 162.5, height: 46}` in a 1440×900 viewport. It is a
legend reading `ZOOM` and two 44×44 buttons at `(70, 448)` and `(122, 448)`,
each a magnifier glyph with a `−` and a `+` and a `title` of `Zoom out` /
`Zoom in`. The substring `zoom` occurs **12 times** in `document.body.innerHTML`
— the 2026-09-05 pass measured **zero** on `bd6fa322`, and its finding *"a
player is offered a fifteen-fold zoom and told about none of it"* is closed.
Every one of the 18 presses this pass made landed on the button, checked with
`elementFromPoint` before each click.

### Correct at both ends, and this is arithmetic on the screenshots

`ZOOM_BOUNDS` is `{min: 0.2, max: 3}` and `KEYBOARD_ZOOM_STEP` is `1.25`
(`src/rendering/scene/world-scene.ts:68`, `:86`), so five presses in is
`1.25^5 = 3.05` and lands on the clamp, and thirteen out is `3 / 1.25^13 = 0.165`
and lands on the other one. Both do:

- **Zoom in ×5.** In `act1-zoom-max-full.png` and `act3-zoom-max-full.png` the
  floor's tile grid lines fall at x = 527, 719, 911 — a pitch of **192 px**,
  which is `TILE_SIZE_PX 64 × 3`. **Zoom 3.000.**
- **Zoom out ×13.** In `act1-zoom-min-full.png` and `act3-zoom-min-full.png` the
  whole world is a single rectangle on screen: x 516–923, y 246–653, **408 px**
  square in both runs, for a 32×32 world. That is 12.75 px a tile against a
  predicted 12.8, so **zoom 0.199** — the 0.4 px is the antialiased edge row my
  scan does not count as dirt. **The whole 32×32 world fits, with 500 px of page
  to spare on each side.**

### Does it help or hurt

**Both ends help, and the far end helps more than expected.** At zoom 3
(`act3-zoom-max-centre.png`) two guards are 100 px tall, and you can read the
peaked cap, the badge on the chest and which way each is facing — the thing the
2026-09-05 pass said the *hidden* zoom was the only substitute for. At zoom 0.2
(`act3-zoom-min-centre-x4.png`) the prison is an 80×90 px square in the middle
of the world and **the four beds are still four countable pale bars**, the two
guards two blue dots, the prisoner one orange one. A player can see the shape of
what they have built and where it sits in the world, which is the job the panel
reading `MINIMAP IS NOT AVAILABLE YET` is not doing.

**What hurts at zoom 3, and it is not the zoom's fault.** Two things:

1. **The HUD does not get out of the way.** The zoom island, the MINIMAP panel
   and the ALERTS list occupy the left 410 px of the page and the world runs
   under them, so at zoom 3 roughly a third of what you zoomed in to see is
   behind furniture. At zoom 1 that costs you six tiles; at zoom 3 it costs you
   two.
2. **The refusal band stops being readable.** It is drawn over the world with a
   translucent ground, and at zoom 1 over dark dirt the orange sentence is
   crisp (`act1-zoom-min-full.png`); at zoom 3 over pale linoleum
   (`act1-zoom-max-full.png`) *"Nothing was removed — there is no object on
   that tile, and none being built there."* is barely legible. Same sentence,
   same band, two zoom levels apart.

**The round trip returns.** Five in, thirteen out, eight back in, and
`act1-zoom-round-trip-full.png` is the default view again. Nothing about the
range is one-way.

---

## 5. Act 4 — three beds appear and the fourth does not

**MEASURED**, and it is the play defect of this pass.

Act 1 placed four beds, verified all four presses, watched
`accommodationCapacity` reach `4`, and photographed **three solid beds and one
translucent one** (`act1-cell-furnished-x3.png`, rightmost). The ghost survived
`waitForQueueEmpty`, a fast-forward, twelve more seconds, disarming the build
tool and parking the pointer on empty ground 600 px away.

**It is not the placement preview**, which was the first guess and is wrong: the
preview is an `AreaOverlay` — a tinted rectangle with an outline
(`src/rendering/scene/world-scene.ts:1192-1199`,
`src/rendering/phaser/area-overlay.ts:80`) — and cannot draw a bed. A
translucent *bed* can only come from `acquireObjectSprite` with
`alphaFor(structure.phase)` below 1 (`src/rendering/phaser/tile-layer.ts:508-521`,
`:622-631`), which is `PLANNED_ALPHA 0.35` or `BUILDING_ALPHA 0.65`
(`src/rendering/world/appearance.ts:275-276`).
`act1-armed-preview-x4.png` shows it plainly: the same bed art, same
orientation, at reduced alpha, with the floor's speckle visible through the
mattress.

So act 4 placed the same four beds **one at a time**, reading the Build panel
and the counts after each:

| after the bed at | tick | `roomCapacity` | `accommodationCapacity` |
| --- | --- | --- | --- |
| column 13 | 6,744 | 1 | 1 |
| column 14 | 7,193 | 2 | 2 |
| column 15 | 7,642 | 3 | 3 |
| column 16 | 8,091 | 4 | 4 |

**Every one of those counts moved on the press, not on the build.** The
screenshot taken moments after the last press still shows the fourth bed as a
ghost; the screenshot taken after a further **12,788 ticks** shows it solid, and
the difference between those two frames is **6,448 pixels of 147,456 — 4.37% —
of which 6,252 are exactly the two tiles the fourth bed stands on**:

```
      x12    x13    x14    x15    x16    x17
y12:  196    0      0      0      2961   0
y13:  0      0      0      0      3291   0
```

So the world was telling the truth all along and the HUD was ahead of it:
**a bed becomes capacity the moment it is ordered.** The Build panel's queue and
deliveries readouts were both `(hidden)` at every one of those five samples —
the panel says nothing about an order in flight once the queue fold has
collapsed — so a player who orders four beds is told they have four beds, sees
three, and has nowhere to look for the fourth.

**What this does not establish.** How long a bed takes to build: bracketed at
**more than ~2,000 ticks and at most 12,788**, because I photographed the two
ends and did not poll the transition. And whether counting an ordered bed as
capacity is intended — no ADR covers it, and it may well be deliberate (a
prisoner assigned to a bed being built arrives about when it is finished). The
finding that stands regardless is the *silence*: nothing on screen distinguishes
"four beds" from "three beds and one on the way".

---

## 6. Everything else that went wrong in front of me

1. **A refusal from day 1 was still on the band on day 6.** *"Nothing was
   removed — there is no object on that tile, and none being built there."* was
   caused by the harness's calibration press on day 1 and was still the refusal
   band's whole content at tick 9,936, day 6, after a room was designated, six
   objects were built and the camera had been zoomed eight times. This is
   **by design** —
   [ADR 0091](../adr/0091-what-clears-the-refusal-band.md) and
   `src/ui/hud/hud.ts:1543-1558` make a simulation refusal stand until another
   one replaces it or the simulation stops publishing it — so it is reported as
   a *playability* observation and not a bug: what a player experiences is a
   standing orange sentence about a click they made four in-game days ago,
   beside a prison that is now doing something else entirely.
2. **The same sentence in the alerts list carries no day stamp**, where the row
   directly above it reads *"Cell designated. Day 2"*. Two rows in one list, one
   dated and one not.
3. **A machine id is shown to the player.** The PRISONS panel reads
   `Saved (generation gen-mtpbjpn8-4).` — `src/content/default-locale-en.ts:2666`
   is `'save.status.saved': 'Saved (generation {generation}).'`, and the
   substitution is an internal generation handle. It is true, which is what the
   fourth exclusion requires, and it is not a sentence a player has any use for.
4. **A 14×14 block at the room's north-west corner changes shade between frames
   in which nothing about that corner changed.** 196 pixels at x 0–13, y 0–13 of
   the crop, from `(185,174,158)` to `(113,105,93)`, in **both** independent
   pairs (bare→furnished, and just-after→long-after), identically, always in the
   same direction. 14 px is `EDGE_WALL_THICKNESS_TILES 0.22 × 64 = 14.08`
   rounded, so it is a wall-corner block and no part of any bed. **I did not
   establish the cause** and it is named here as the pass's loosest thread.
5. **At zoom 3 the linoleum's repeat is obvious.** Every tile carries the same
   speckles in the same places (`act3-zoom-max-centre.png`), which at zoom 1 is
   invisible and at zoom 3 makes a floor of forty identical stamps. It is the
   consequence `environment-sprites.ts` chose deliberately when it picked a
   swatch that "tiles seamlessly at one tile per repeat", and the zoom control
   that shipped this week is what makes it visible.

---

## 7. Claim tiers, weakest claims named, and what this did not reach

**MEASURED** (a number read off a running page or off a committed screenshot):
the bed's orientation and the two profile MADs; 30,828/147,456 and its
three-way decomposition; 24,958 of 32,768 footprint pixels; 6,448/147,456 and
its per-tile map; the four capacity readings; 192 px and 408 px and the zoom
values derived from them; the zoom control's box and button geometry; 12
occurrences of `zoom`; one console line per act; 62 LFS paths with 0 pointers.

**VERIFIED, read** (a file opened at the line cited): every `file:line` in this
record was opened, including `environment-sprites.ts:184`,
`environment-textures.ts:141`, `environment-art.ts:261`, `tile-layer.ts:622`,
`appearance.ts:275`, `world-scene.ts:68` and `:1192`, `room-catalog.ts:91`,
`object-catalog.ts:97`, `main.ts:2647`, `hud.ts:1543`,
`default-locale-en.ts:465` and `:2639`. Every commit sha cited was checked
individually with `git cat-file -e <sha>^{commit}`: `9b43fb0d`, `977129a8`,
`9bb526a6`, `71c9aeb4`, `01fef637`, `948a5fcd`, `bd6fa322`.

**INFERRED:** that the fourth bed's ghost was a build order rather than a
preview — argued from the shape of the two code paths and then *confirmed* in
act 4 by the ghost becoming solid; and that the toilet's 3.85% is its own
construction finishing rather than anything else, which is argued from its
location and from the ghost visible in `act1-cell-bare-x3.png` and is not a
controlled re-run.

**How I verified what I actually placed**, which
[#1017](https://github.com/matmaxalez/lockstate/issues/1017) makes necessary —
`armBuildable` (`tests/browser/playtest-harness.ts:308-312`) reads the arm
label immediately after clicking and under load arms the *previous* buildable
without failing. Two independent checks, both in the logs:

- **Every press's own command.** `PlaceObject` carries `definitionId`
  (`src/main.ts:2647`), which is what the world gesture submitted rather than
  what the panel believed. All eight bed presses across acts 1 and 4 reported
  `placed bed-wooden at tile <x>,<y> (asked for <x>,<y>)`; **0 mismatches, 0
  presses that produced no command.**
- **The simulation's own count.** `accommodationCapacity` went 0 → 4 in act 1
  and 0 → 1 → 2 → 3 → 4 in act 4. `object.bed` and `object.medical-bed` are the
  only `sleep-surface` objects (`src/content/object-catalog.ts:97`), and no
  medical bed was bought, so four is four beds.

### The weakest claims in this record, named

1. **An east–west mirror of the bed frame is not excluded by pixels**, only by
   reading `drawFrame`. The measurement that would exclude it is too weak to
   rule, and I measured *why*: the bed's own horizontal asymmetry is MAD 0.0985
   against 0.2644 vertically.
2. **The 196-pixel wall corner is unexplained** (§6.4). It recurs identically in
   two independent pairs, which rules out noise and rules in *something*, and I
   did not find what.
3. **The 20.91% is one prison at two ticks, not two prisons in identical
   states.** The toilet's completion is inside it and is separated by region
   rather than by control. The 16.93% for the beds is clean; the 20.91% headline
   is not a "furnished versus unfurnished" figure and should not be quoted as
   one.
4. **A bed's build time is bracketed, not measured**: >~2,000 and ≤12,788 ticks.
5. **Whether capacity should count an ordered bed is not ruled on here.** I
   measured that it does; I did not establish that it should not.

### What this pass did not reach

- **The other two routes to zoom.** Only the two HUD buttons were pressed. The
  wheel, the pinch and the `+`/`-` keys were not exercised, so nothing here says
  whether the new control and the old routes agree.
- **A prisoner in a bed.** Four prisoners lived in the cell for thousands of
  ticks and none was ever observed *on* a bed; the actors stood. Whether sleep
  is drawn at all is unanswered, and it is the obvious next question now that
  the bed exists.
- **A second furnished object**, because there is no second object with art.
- **Any room other than a cell**, and any prison larger than the canonical 6×6.
- **The minimap**, which still reads `MINIMAP IS NOT AVAILABLE YET`.
- **Whether the zoom survives a reload**, and whether a save records it.
