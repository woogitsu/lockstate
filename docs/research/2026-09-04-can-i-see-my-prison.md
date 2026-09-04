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

**The building reads and the prison does not.** A player standing back from a
finished prison can see, unmistakably, where their land ends, where the walls
are, and that the box in the middle is a room — the wall and floor artwork
ADR 0052 landed does that job well, and at 8x it is genuinely good.
Everything *alive* is missing. With **six prisoners and three guards standing
in a running prison, the screen showed exactly two figures, and both were
guards** (`21-the-cell-block.png`), because the worker had all nine actors on
**two tiles** and one sprite per tile is drawn; the six prisoner crops taken at
the coordinates the worker gave are byte-identical to the guard crop. Nothing
moved in any sample — `0 of them with a non-zero velocity` — and nothing that
*happened* was drawn: by day 8 the strip read `2 CONTRABAND` and the alert
column named a phone and some currency, and the canvas was unchanged. The
building states are worse than the finished ones in the direction that matters:
a queued wall is a faintly lighter brown band on brown dirt, a queued **bed
inside a cell is invisible** because the planned-object tint and the housing
zoning tint are both blue, and the rectangle a player has just dragged for a
room **disappears the instant they release the mouse** and exists only as a
number in a panel. Two of those are "the art is not done yet" and are marked as
such; the other three are the game drawing nothing for a state it is in.

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

## 5. Six prisoners, one tile, one figure — and the figure is a guard

**MEASURED, act 2 (the central measurement of this pass).** A prison with a
zoned 6x6 cell, six beds, a toilet, six admitted prisoners and three hired
guards, run to day 7. The two channels, read at the same moment:

*The worker*, off the render-actors keyframe:

```
the worker on actors: tick 13516: 6 prisoner(s), 3 guard(s), 0 of them with a non-zero velocity
  prisoners at ["12.00,12.00","12.00,12.00","12.00,12.00","12.00,12.00","12.00,12.00","12.00,12.00"]
  guards at    ["16.00,16.00","12.00,12.00","16.00,16.00"]
```

*The strip*, off the DOM at the same moment: `6 PRISONERS`, `3 STAFF`,
`1 ROOMS`, and `roomOccupants: 6` in the counts.

*The screen*: `20-a-populated-prison-full-frame.png` and
`21-the-cell-block.png` show **exactly two figures, and both of them are
blue-uniformed guards.** Not one prisoner is visible anywhere.

**The magnification settles why.** `22-actor-0-prisoner-at-12.0-12.0.png` is a
6x crop centred on the tile the worker says the first prisoner is standing on.
There is a figure there and it is **a guard**: nine actors occupy two tiles,
and on each of those tiles one sprite is drawn over all the others.

**VERIFIED, read, for the ordering.** Depth is a pure function of the anchor
row: `sprite.image.setDepth(depthForAnchor(placement.y + TILE_SIZE_PX / 2,
'actor'))` at `src/rendering/phaser/actor-layer.ts:146`, and
`depthForAnchor(row, 'actor')` is `row * DEPTH_ROW_STRIDE + 1` off
`src/rendering/depth.ts:14-31`. Two actors on one tile therefore get the
**identical** depth, Phaser's sort is stable, and the array order decides who
is on top — an order that puts every prisoner before every guard by
construction (`actors-from-snapshot.ts:149-172`, *"Prisoners in ascending
entity index … then guards"*, and the same two blocks in
`render-actors-keyframe.ts`). So on a shared tile **the guard always wins and
the prisoners are always the ones hidden.**

**Two separate things, and they should not be merged.** (a) The simulation puts
six prisoners on one tile — that is not the renderer's doing and is not this
pass's finding to diagnose. (b) Given co-located actors, the renderer draws one
of them and gives the player no indication that there are more. (b) is a
rendering decision with an obvious cheap answer (a stack count, a fan-out
offset, anything) and no decision recorded against it that I found.

**What it costs a player:** the PRISONERS chip says six and the world shows
none. Every question a watching player could ask — where are they, what are
they doing, is anyone in a cell — is unanswerable from the screen, and the
screen does not say it is unanswerable.

## 6. Nothing moves, and the wire agrees

**MEASURED, act 2.** `0 of them with a non-zero velocity`, and every one of the
nine positions is an exact integer tile (`12.00,12.00`, `16.00,16.00`) with no
sub-tile component at all, at tick 13516 of a running x4 clock.

**This confirms ADR 0088's own caveat rather than refuting #740.** ADR 0088 is
Accepted and says in its status section, before the signature, that *"a newly
hired guard spawns **on** its derived sector's post tile (ADR 0036 decision 2's
deliberate coincidence), so ordinary early-game hiring has no distance to
cross, and `Travelling` will be a state a player sees rarely even now."* Three
guards hired into a one-room prison is exactly that case: one is at the sector
post, two are unassigned, and none of them has anywhere to walk. **So #740's
observation — nothing walks — is still what the screen shows, and the reason is
the one ADR 0088 wrote down in advance.** I did not reach a case with a distance
to cross; see §9.

**Not measured, and I will not claim it:** whether a prisoner *ever* walks.
Every sample I have is of a prisoner standing on a bed tile. The locomotion
machinery is real (`LOCOMOTION_SUBTILE_UNITS` is 256,
`src/simulation/locomotion/locomotion.ts:76`, and layout 2 of the payload
carries a velocity for exactly this), and I saw it carry zeroes.

## 7. Things happen, and the world does not draw any of them

**MEASURED, act 2.** By day 8 the strip read `2 CONTRABAND` and the Alerts
column held *"Contraband found: Currency. Day 6"* and *"Contraband found:
Phone. Day 8"* (`23-zoomed-in-full-frame.png`, `24-standing-back-full-frame.png`).
Two things happened, in two different places, on two different days. **The
canvas is identical before and after either of them** — no marker, no flash, no
icon, nothing at the tile, nothing on the actor who was carrying it.

**JUDGEMENT, and this is the honest shape of the answer to the question:** the
world is a *floor plan*, not a view of a running prison. Everything that
happens is reported in words in a panel, and the canvas carries the building
and the population count only. A player who is watching the world rather than
reading the rail learns nothing.

This is the screen-side confirmation of the code-side census in
`docs/research/2026-09-04-what-the-game-shows-nobody.md` — where that record
found `hud/contraband`'s 72 members with no consumer (its §5.5), this pass
found that the *canvas* says nothing about contraband either, so both channels
are silent about the same event and the alert row is the only survivor.

## 8. Standing back works: the plot, the walls and the room all read

**MEASURED, act 2.** `24-standing-back-full-frame.png`, after twelve wheel
notches out. Three things a player needs are all legible at that distance:

- **The owned plot** is outlined in blue and the land beyond it is shaded down,
  so the playfield has an edge. (`OWNED_OUTLINE_COLOR` `0x6ea8fe` and
  `UNOWNED_SHADE_ALPHA` `0.45`, `appearance.ts:264-274`.) On the arrival screen
  (`01-a-brand-new-prison-full-frame.png`) it is **not** visible, and that is
  not a defect: one 32x32 chunk is owned (`src/simulation/runtime/new-session.ts:433`)
  and at 1440x900 the viewport sees about 22 tiles, so the whole screen is
  inside the plot.
- **The prison** is an unmistakable white-walled box on brown ground.
- **The room** is unmistakably a room, because the floor art plus the category
  tint carries at any zoom (`07-a-zoned-cell.png`, `07c-the-zoned-floor.png`
  at 8x — real linoleum under a blue wash).

**Where "what a place is" stops working is *which* place.** The tint is keyed by
the room's **category**, not its type — `ZONING_TINT_BY_CATEGORY`,
`appearance.ts:84-96`, eleven entries — while `room-catalog.ts` declares
**eighteen** room types. So a Cell and a Holding Cell are one blue
(`room-catalog.ts:92,98`, both `housing`); a Kitchen and a Canteen are one
orange (`:115,122`); a Shower Room and a Laundry one cyan (`:128,133`); a Yard
and a Common Room one green (`:138,142`); a Storage Room, a Delivery Bay and a
Garbage Room one yellow (`:170,175,180`); a Solitary Cell and a Security Office
one red (`:103,159`). **Seven groups of rooms are indistinguishable on the
world**, and nothing else on the canvas names a room.

## 9. Two instrument failures, recorded rather than hidden

**Both were caught by the instrument contradicting a picture, which is the
reason this pass keeps the two channels apart.**

1. **A queue readout stood in for a measurement, and answered "empty" about a
   block that was not on screen.** Act 1's first version waited on
   `waitForQueueEmpty` and then compared two screenshots. The wait returned
   immediately because `panelText('.hud-build__queue')` answered
   `".hud-build__queue: not laid out"` and the helper treats that as an empty
   queue (`playtest-harness.ts:327-352`), and the two screenshots came back
   **byte-identical** (`md5 630aafc2… 630aafc2…`). That reading is equally
   consistent with *"a built wall looks exactly like a planned one"* and with
   *"the wall was never built"*, and the run could not tell them apart. The act
   was rewritten to sample the same patch ten times with the simulation tick
   printed beside each frame; §1 is that sequence, and it separates the two
   immediately.
2. **The actor tee read a guessed envelope path and reported an empty prison.**
   It read `payload.payload.body` where the message carries
   `payload.delta.data` — `deltaMessageSchema` at
   `src/simulation/protocol/types.ts:538-559` and `arrayBufferPayloadSchema` at
   `:73-82`. A wrong path on an optional chain throws nothing, so the whole of
   act 2's first run printed *"the worker has published no actor keyframe at
   all"* about a prison with six prisoners and three guards standing in it, and
   produced none of the per-actor crops. That run is kept at
   `act2-broken-tee.log`; the numbers in §5 are from the re-run after the fix.

## 10. What I did not reach

- **A guard with somewhere to walk.** Every guard in these runs was hired into
  a one-room prison and spawned on or beside its post, which ADR 0088's status
  section says in advance has no distance to cross. So I have not seen the walk
  clip play in a real prison, and *"the walk cycle never plays"* is **not**
  claimed. What would settle it: a prison with a sector post several tiles from
  the hire origin, or an incident far from a guard, sampled at the 100 ms
  keyframe cadence.
- **A prisoner walking.** Same gap, same reason: every prisoner sample I have
  is a standing one.
- **A delivery landing, and a job completing, as *events*.** §1 and §3 watch a
  wall and a bed *become* built, which is the visual half; I did not pair a
  `simulation/events` message against a canvas diff at the same tick.
- **An incident.** None fired in these runs (the strip read `0 INCIDENTS
  Clear` throughout), so what an incident looks like on the canvas is unmeasured.
- **A dozen rooms.** Every act here has exactly one room, so "a dozen rooms"
  is unmeasured and the seven colour collisions in §8 are read off the tables
  rather than seen side by side on one screen.
- **A `uiScale` other than 100 %**, and any viewport other than 1440x900.

## 11. Weakest claim, and what would change my mind

**The weakest claim is §5's second half — that the renderer's ordering is what
hides the prisoners.** What is MEASURED is that six prisoners and one guard
share tile (12,12) and that the figure drawn there is the guard. The ordering
argument (equal depth, stable sort, prisoners first in the array) is VERIFIED by
reading three files, but I never drew two actors on one tile *in a controlled
way and swapped their order* — so "the guard wins because it is later in the
array" is a reasoned explanation of a measured fact, not itself a measurement.

**What would settle it:** two actors on one tile whose array order is known and
reversed between two frames, with the sprite on top identified either way. A
single prisoner alone on a tile appearing correctly (which act 3's crowd should
show, since 22 prisoners cannot all fit the same bed) would also weaken the
alternative explanation — that prisoner sprites are not drawn at all — which I
consider already excluded by the contact sheet in §4 loading the same atlas the
renderer resolves, but not excluded by anything I saw on the game canvas.

---

## Appendix — the screenshots, in the order they were taken

| file | what it is |
| --- | --- |
| `01-a-brand-new-prison-full-frame.png` | the arrival screen: flat dirt, a faint grid, no plot edge in view |
| `02-bare-ground-close.png`, `02b-bare-ground-magnified.png` | the same ground at 1x and 8x, for the comparisons below |
| `03-order-to-wall-f0…f9-tick*.png` | ten frames of one wall run, from order to wall, with the tick in the filename |
| `04-after-the-wall-window.png` | the finished six-tile wall in context |
| `05-an-enclosed-box-of-wall.png` | three sides built and one side still ordered — the two states side by side |
| `05b-a-corner-of-it.png` | a wall corner at 8x: an east-west elevation meeting a north-south coping |
| `06-a-pending-rectangle.png` | the world immediately after the zoning drag: nothing |
| `07-a-zoned-cell.png`, `07b-…-full-frame.png`, `07c-the-zoned-floor.png` | the zoned cell, and its floor at 8x |
| `08-order-to-bed-f0…f7-tick*.png` | eight frames of one bed, from order to bed |
| `20-a-populated-prison-full-frame.png`, `21-the-cell-block.png` | six prisoners and three guards alive; two figures on screen |
| `22-actor-N-…-at-12.0-12.0.png` | 6x crops centred on each actor the worker reported; the six prisoner crops are byte-identical to the guard's |
| `23-zoomed-in-full-frame.png` | zoomed in six notches, with two contraband alerts standing and nothing on the canvas about either |
| `24-standing-back-full-frame.png` | zoomed out twelve notches: the owned plot's blue outline and the shaded land beyond it |
| `40-actor-contact-sheet.png`, `41-actor-true-size-prisoner-then-guard.png` | the two actor atlases, cut with the manifest's own rectangles, at 2x and at true in-game size |
