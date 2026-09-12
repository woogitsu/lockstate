# Does the world view show `'unreachable'`, now that ADR 0108 shipped it?

**Date:** 2026-09-11
**Question:** issue #1022 measured that a sealed cell and a working one differ
by 4.11% of pixels, and the 4.11% is a door -- the world view carries no
condition state. That was measured before ADR 0108 existed, against the
`'doorway'` / `'no-way-in'` vocabulary alone. ADR 0108 has since shipped a
fourth value, `'unreachable'` -- a door on the room's perimeter that nothing
outside can reach -- and the Rooms panel now carries a sentence for it. **Does
the world view carry anything for it either, now that the answer exists?**

**Tree played:** `c4cfc565` (v0.0.586), worktree
`/workspace/lockstate/.claude/worktrees/agent-a6308e46c5e48be9a`, branch
`agent/1022-world-signal`. `git lfs checkout` run first;
`file public/assets/actors/actor.guard.base.idle.png` answered `PNG image
data, 260 x 3104`, so the art was present. Instrument:
`tests/browser/playtest-2026-09-11-does-unreachable-show-in-the-world.playtest.ts`,
run via
`LOCKSTATE_BROWSER_TEST_PORT=5433 node_modules/.bin/playwright test -c
tests/browser/playwright.playtest.config.ts
tests/browser/playtest-2026-09-11-does-unreachable-show-in-the-world.playtest.ts`.
Nothing in CI collects a `.playtest.ts` file; this is evidence, not a gate.

## Method

Two independent "New prison" runs, each building the same 6x6 walled cell
`buildAndPopulate` makes (tiles (12,12)-(17,17)), zoned `room.cell`, furnished
with 2 beds and a toilet, with a door on its south edge at tile (14,17):

- **`reachable`** -- the door as built, corridor open beyond it.
- **`blocked`** -- the same cell and door, plus three more wall segments
  boxing in the one tile the door opens onto (14,18) on its other three
  sides (west, south, east). This is ADR 0108's own act-4a fixture in
  miniature: *"a furnished cell, a real door on its south boundary, and the
  one tile that door opens onto boxed in on its other three sides."*

Both runs read the Rooms panel's text for `room.cell` and screenshot the same
384x384 CSS-pixel crop of the room's interior (tiles (12,12)-(17,17), no
padding), so the two images can be compared pixel for pixel.

## What the Rooms panel says

**`reachable`**, after the door was built -- no access-related need line at
all (the room's `access` is `'doorway'`, which carries no need entry, by
design: decision 3 of ADR 0108 only NEEDS lines for `'no-way-in'` and
`'unreachable'`).

**`blocked`**, after the boxing walls went up:

```
NOT READY
1 of 1
Cell at 12, 12 is missing
a way in — nothing outside can reach its door
```

verbatim, matching `'hud.rooms.needs-unreachable'` in
`src/content/default-locale-en.ts`. **ADR 0108's reachability engine and its
HUD wiring are live and correct on today's tree**, for exactly the scenario
its own fixture describes.

## What the world view shows

Byte-identical PNG files: no (73,293 bytes against 74,477). Decoded to raw
RGBA pixels in a Chromium page (`getImageData`, no library) and compared
pixel by pixel: **1,945 of 147,456 pixels differ (1.32%)**, concentrated in
two bands with zero differing pixels between them -- rows 4-63 (near the two
beds) and rows 336-383 (the door and the south wall line) of a 384-row crop.

**This is not a condition cue, and three things say so.** First, the boxing
walls added for `blocked` sit at tile row 18, entirely *outside* the crop
rectangle (which ends at row 17), so nothing added lies in the frame. Second,
`TileLayer.paintChunk` (`src/rendering/phaser/tile-layer.ts:298-416`) is the
whole of what draws a tile and it reads three inputs -- the floor sprite, the
zoning tint, the edge art -- verified by reading the function, none of which
depend on `RoomAccess` or anything computed from it; nothing calls
`roomAccess`, `roomReachability` or reads `RoomListRowViewModel.access`
anywhere under `src/rendering/`. Third, the two bands sit at the fixed
furniture and the door -- exactly where a wall's drop-shadow or a sprite's
antialiasing would differ between two independently loaded pages on this
container's software rasteriser (`docs/AGENT_WORKFLOW.md` §2 records the same
renderer, `SwiftShader`, on this class of container) -- rather than spread
across the plain floor tiles a condition wash would cover.

**Weakest claim: the 1.32% is measured and not diagnosed.** Two candidate
mechanisms are named above (extra-wall shadow bleed at the south edge;
independent-load rendering nondeterminism at both edges) and neither was
confirmed by, for instance, diffing two `reachable` runs against each other to
establish a same-state noise floor. What the code reading does establish
without needing that control: no input `TileLayer` reads varies with
`RoomAccess`, so whatever produced these 1,945 pixels, it was not a condition
cue, because there is no code path that could produce one.

## Screenshots

`world-reachable.png`, `world-blocked.png` -- the two 384x384 crops described
above, both showing the same furnished cell with its door, indistinguishable
to a player.

## Conclusion

Issue #1022's finding survives, in the one place ADR 0108 did not touch: the
world view. The Rooms panel now correctly tells a player their door leads
nowhere. The tile the player is looking at gives no sign of it at all.
