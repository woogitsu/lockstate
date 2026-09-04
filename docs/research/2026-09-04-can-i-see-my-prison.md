# Can I see my prison? — what the world on screen tells a player who just watches

**Date:** 2026-09-04
**Tree played:** `0e614c7` (**v0.0.451**), in worktree
`/workspace/wt-can-i-see-my-prison` on branch
`agent/playtest-can-i-see-my-prison`. Nothing under `src/` differs from that
commit — `git diff --stat 0e614c7 -- src/` is empty — and the strip's own
version line confirms it from inside the running page: `v0.0.451 · 0e614c7` on
the arrival screenshot, `v0.0.451 · 0d9a34a` once this branch's first
instrument-only commit exists.

**The LFS check, first, because this question is the one it can silently
ruin:**

```
$ file public/assets/actors/actor.guard.base.idle.png
public/assets/actors/actor.guard.base.idle.png: PNG image data, 260 x 3104, 8-bit/color RGBA, non-interlaced
```

`PNG image data`, not `ASCII text`. A worktree that skipped `git lfs checkout`
would have drawn a world with no actor sprites in it and run green, and every
sentence below about what a person looks like would have been worthless.

**Question, as given:** *a player builds a prison, sets it running, and then
just watches it. Looking at the screen — the world, not the panels — can they
tell what is going on?*

---

## The verdict, in one paragraph

*(written after acts 1 and 4; acts 2 and 3 fill in the populated half)*

---

## Reproduction

`tests/browser/playtest-2026-09-04-can-i-see-my-prison.playtest.ts`, one act at
a time. Nothing in CI collects it — `tests/browser/playwright.config.ts` is
`testMatch: /.*\.spec\.ts$/` and `playwright.playtest.config.ts` is the config
that matches `*.playtest.ts`.

```
LOCKSTATE_BROWSER_TEST_PORT=5312 node node_modules/@playwright/test/cli.js test \
  --config tests/browser/playwright.playtest.config.ts \
  tests/browser/playtest-2026-09-04-can-i-see-my-prison.playtest.ts -g "act 1"
```

Every screenshot cited below is written by the run into the scratchpad
directory named in the instrument's `SHOTS` constant, under the filename
quoted.

---

## 1. A built wall is unmistakable; the order that becomes it is nearly invisible

**MEASURED, act 1.** One six-tile wall run was ordered on the north edge of row
12 and then watched for ten frames, each a 8x magnification of the same three
tiles with the simulation tick printed beside it:

```
    frame 0 at tick 2077: 3837f8e4
    frame 1 at tick 3029: 3837f8e4  (identical to the frame before)
    frame 2 at tick 3746: 3837f8e4  (identical to the frame before)
    frame 3 at tick 4424: 86460c33  <-- THE WORLD CHANGED
    frame 4 at tick 5103: 86460c33  (identical to the frame before)
    …
    frame 9 at tick 8467: 86460c33  (identical to the frame before)
```

`03-order-to-wall-f0-tick2077.png` is the order. It is a **faintly lighter
brown band on brown dirt** — no outline a player would notice, no hatching, no
icon. `03-order-to-wall-f3-tick4424.png` is the same three tiles once the crew
has laid them: a photographed concrete wall in near-white, with a coping along
its top and a hard black shadow at its foot. Side by side the two are not
comparable; alone, only the second one says anything.

**VERIFIED, read.** That is exactly what the tables prescribe.
`alphaFor(phase)` at `src/rendering/phaser/tile-layer.ts:555-564` returns
`PLANNED_ALPHA` for a planned structure, and `PLANNED_ALPHA` is `0.35`
(`src/rendering/world/appearance.ts:276`). The slab painted at that alpha is
the *same* geometry the finished thing gets — `paintSlab`,
`tile-layer.ts:540-552` — so a planned wall is the finished wall at 35 %
opacity, and 35 % of `wall-brick`'s `topFill` `0x9a6a52`
(`appearance.ts:149-156`) over `dirt`'s `0x6a5744` (`:64`) is brown on brown.

**JUDGEMENT, and this is the part that matters for the question:** a player
who has just paid for twenty-four wall segments and is looking at the world
cannot see that anything is pending there. Act 1's own instrument was fooled by
this first — see §7.

**Not "the art is not done yet".** The finished wall has art and looks
excellent. What is missing is a *distinguishing mark for the pending state*,
which is a rendering decision and not an asset.

## 2. The rectangle you just dragged vanishes the moment you let go

**MEASURED, act 1.** `06-a-pending-rectangle.png` is the world immediately
after a 6x6 room-zoning drag from tile (12,12) to (17,17), with the Rooms panel
holding the rectangle and offering *Designate 6 × 6*. **There is no rectangle
on the world at all.** The interior of the walled box is bare dirt, identical
to the ground outside it.

**VERIFIED, read.** `WorldScene.commitArea` clears the overlay on release —
`this.areaOverlay?.clear()` at `src/rendering/scene/world-scene.ts:998`, three
lines before it hands the rectangle to `RoomTool.place`. So the preview exists
only *during* the drag; the pending state that follows it, which is the state
the player has to make a decision in, is drawn nowhere.

**JUDGEMENT:** this is the one moment in the loop where the player has
something selected and has to confirm it, and the world is silent about what
they selected. The panel's *"Designate 6 × 6"* is the only record, and it names
a size rather than a place.

## 3. Every object in the game is the same blue-grey block, and inside a cell the order for one is invisible

**MEASURED, act 1.** A single `bed-wooden` was ordered at tile (13,14) inside
the zoned cell and watched the same way.
`08-order-to-bed-f0-tick20341.png` — the order — is a **thin dark rectangle
outline over the blue floor and nothing else**; the fill is the same blue-grey
as the floor it stands on. `08-order-to-bed-f3-tick22612.png` — the finished
bed — is a flat slate-blue 1x2 slab with a darker strip along its south edge.
No headboard, no mattress, no bed.

**VERIFIED, read, and it is every object, not this one.**
`OBJECTS_ON_COLOUR_FALLBACK` at
`src/rendering/world/environment-art.ts:146-167` lists **all twenty** catalogued
objects, and `SPRITE_BY_OBJECT_ID` at `:186` is `{}` — so `objectSprite()`
answers `undefined` for every one of them and the painter draws
`CATEGORY_FALLBACK[category]`. There are **three** such categories
(`appearance.ts:159-184`): `wall` grey, `object` slate-blue `0x7f8ba0`,
`utility` green `0x4fd0a2`. A bed, a chair, a desk, a dining table, a
bookshelf, a stove, a fridge and a toilet are therefore **one colour**, and
differ on screen only by footprint.

**The invisibility of the pending one is a colour collision, not an alpha
problem.** The planned tint is `PLANNED_OBJECT_TINT`, which is
`CATEGORY_FALLBACK.object.topFill` by construction (`appearance.ts:225`) — a
blue-grey — and the `housing` zoning tint a cell floor carries is
`0x4f7fd0` (`appearance.ts:85`), also blue. At 35 % one over the other leaves
the outline as the only mark.

**Which half is "the art is not done yet":** the *bed not looking like a bed*
is, explicitly — `environment-art.ts:131-145` says the next slice is objects
and gives the download cost as the reason. The *planned bed being invisible
against the floor it is planned on* is not: it is two colours chosen
independently that happen to collide.

## 4. A person is legible, and a guard is legible as a different person

**MEASURED, act 4.** `41-actor-true-size-prisoner-then-guard.png` draws the
eight authored idle directions of `actor.prisoner.base` and `actor.guard.base`
at **exactly the size the world draws them** — a 256x384 authored frame on a
64px tile is quarter scale (`docs/RENDERING.md`, *Coordinates*) — on the real
`dirt` colour. A prisoner is an orange-jumpsuited figure; a guard is a
blue-uniformed figure in a peaked cap. **At true size the two are told apart
instantly, by colour alone**, before any detail resolves.

`40-actor-contact-sheet.png` is the same frames at 2x with the walk cycles
under them. The walk clips are eight frames of real leg swing in both
populations, so a walking figure has something to be drawn as.

**JUDGEMENT, against the same picture:** the *eight directions* do not survive
the size. South (frame 1) and north (frame 5) differ by a chest badge a few
pixels across and by whether the face is on; at 64x96 on brown ground they read
as the same standing figure. East and west read, because the silhouette turns.
So a player can tell *a person* and *which kind of person*, and cannot reliably
tell *which way they are facing* while they stand still.

**Not a defect: the idle clip is one frame.** `actor.guard.base`'s manifest
declares `"idle": {"fps": 1, … "south": [ one rectangle ]}` — one frame per
direction. A standing actor is a still image by design, so nothing about a
motionless figure is a rendering failure.
