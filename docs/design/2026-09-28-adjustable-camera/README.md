# Adjustable camera and square-first building: visual direction

Recorded 2026-09-28 from the owner's request in Polish: allow the player to
change the viewing angle with the mouse, keyboard and on-screen controls, as in
city-building games; make construction intuitive on full squares and offer
ready-made rooms. The game is designed and verified at **1920 × 1080 and above**.

This is a production brief, not a claim that the current Phaser renderer already
draws these images. The six images below are generated **concepts**. Their floor
plans, object counts and camera angles are illustrative rather than a measured
set of views of one exact 3D scene. The actual `.blend` source and runtime
renders must be built and tested separately. No concept PNG is loaded by the
game.

## Visual references

| Image | Question it answers | Keep | Correct before shipping |
| --- | --- | --- | --- |
| [Low oblique](./view-low-oblique.png) | Does a shallow angle add depth? | Readable wall faces, material contrast | Foreground walls hide too much; cut them away |
| [Medium oblique](./view-medium-oblique.png) | Can a deeper angle remain playable? | Room depth and strong door silhouettes | Preserve consistent square tile sizes and footprint |
| [Cell close-up](./cell-closeup.png) | Can the cell furniture remain legible? | Bed, toilet, sink, locker, door are distinct | Foreground wall must lower on focus/build hover |
| [Wing mid-angle](./wing-mid-angle.png) | How does a repeated cell wing read? | Repetition, corridor, shower, canteen, yard | All cell footprints must use one canonical grid |
| [Room template preview](./room-template-preview.png) | Can a ready-made cell show what will really be built? | Filled floor squares, distinct wall squares, open door gap | Ghost must match simulation command and refuse overlap before click |
| [Wing high-angle](./wing-high-angle.png) | Is strategic overview still readable? | Many rooms and people remain visible | High angle must not turn walls back into misleading hairlines |

The concepts intentionally use original shapes and materials. Prison Architect
is an interaction/readability reference, not an asset source.

## Player contract

1. Mouse drag in the camera mode turns the view horizontally and raises/lowers
   the angle. Keyboard shortcuts and on-screen controls offer the same actions.
   A build drag never rotates the camera. Inputs are remappable, and focused
   text fields or dialogs consume their own keys.
2. The cursor always points to one **logical square** on the ground plane.
   Before clicking, the entire occupied square or template footprint is filled
   in the preview. A wall's vertical face is decoration above that square, not
   another placeable location.
3. The tile under the cursor and the selected build footprint stay fixed while
   the camera turns. Picking is the inverse of the displayed ground-plane
   projection, including zoom, pan, yaw and elevation. The same world command
   reaches the simulation at every angle.
4. A near wall that covers the selected room, an actor or the active build
   footprint lowers to a short cutaway. This is purely visual. The full square
   still blocks movement and carries the same cost, ownership and save data.
   Highlighted doors retain a visible opening and remain clickable.
5. Saved games retain the current authoritative grid. The camera is presentation
   state; it cannot change pathfinding, room membership or wall collision.

## Technical direction to prove, not assume

The current renderer is Phaser 4 with a top-down camera; see `docs/CAMERA.md`,
`docs/RENDERING.md` and `src/rendering/scene/world-scene.ts`. Its coordinate
contract and browser tests are for that camera. Merely skewing a screenshot or
substituting one angled wall sprite cannot give a movable camera: floor picking,
wall occlusion, object depth, facing and culling would disagree. A static PNG
from one Blender viewpoint does not rotate continuously.

Implement the camera as a renderer-side state and a shared projection/inverse
for the ground plane. Keep the simulation grid unchanged. Choose the runtime
representation by an instrumented spike on one **cell + corridor + actor**:

- Option A: projected floor/wall geometry in Phaser with Blender-authored
  material atlases and multi-view object sprites loaded only as needed.
- Option B: a bounded multi-view sprite atlas for the entire visible scene,
  with measured angle-step, memory and download limits.

Prefer A if it meets the existing frame and asset budgets. It supports smooth
mouse rotation without dozens of near-duplicate PNGs for each module. If A
cannot meet those budgets, document the measured limit and use B with an
explicit angle-step rather than claiming free rotation. Neither option may be
merged on a concept image alone. The existing Blender wall kit on
`codex/wall-cutaway-art-2026-09-28` is genuine source art, but its current PNGs
show **one** angle; they are a geometry/material reference and an integration
fixture, not a complete rotating atlas.

## Delivery slices and acceptance gates

| Slice | Product result | Proof |
| --- | --- | --- |
| 1. Camera geometry spike | One cell and corridor turn without changing simulation tiles | Absolute projection/picking examples, real browser screenshot at two yaw and two elevations |
| 2. Square construction | Wall and door preview fill actual occupied squares at every angle | Drag/build at four camera poses yields the same tile command and saved world |
| 3. Blender modular kit | Full/cutaway wall, corner, end, door frame and cell props share tile origin | Reproducible `.blend` render, manifest, visual seam review at 1920 × 1080 |
| 4. Visibility/depth | Near walls lower; actors, doors and beds remain readable | Real scene screenshots and interaction checks with selected and unselected rooms |
| 5. Ready-made rooms | Cell and service-room ghost previews match their final footprint | Collision/cost/door preflight, click placement and load/save browser tests |
| 6. Shipping | Responsive Full HD HUD and game scene, green exact-head CI | CI, mergeability, serial main CI, staged and production visual checks |

The first gate is deliberately a small playable slice. It resolves the
continuous-rotation versus asset-atlas tradeoff before remodelling every object.
Do not turn the entire art catalog into one-angle oblique PNGs and then discover
that the camera cannot move.

## Real Phaser camera spike at Full HD

The browser spike in `tests/browser/oblique-spike.html` uses Phaser 4 and the
shared projection code. It draws one cell, a corridor, a door gap, a person and
full/short wall prisms from a square grid. These are flat diagnostic colors,
**not final game art or a player-visible mode**. The three screenshots are from
the same scene at a physical 1920 × 1080 viewport:

| Yaw / elevation | Actual browser output |
| --- | --- |
| -45° / 25° | [Shallow side view](./spike-yaw-minus45-elev25-fullhd.png) |
| 0° / 45° | [Straight view](./spike-yaw0-elev45-fullhd.png) |
| +45° / 65° | [High side view](./spike-yaw-plus45-elev65-fullhd.png) |

At all three poses, a click at the projected centre of logical tile (2, 2)
selects exactly (2, 2); the visible yellow selection fills the whole square.
The browser test passed 1/1. A deliberate one-tile offset in pointer picking
made it fail with `tileX: 3`; restoring the picker returned the test to green.
This proves the projection, rendered square and inverse pointer hit in the
small scene. It does **not** establish framerate, occlusion correctness for a
large prison, art fidelity, or integration with `WorldScene`. Those are the
next delivery gates.

## Active delivery lanes

Keep three isolated worktrees moving in parallel: (1) Blender modules and
consistent camera poses, (2) square-first construction and ready-made rooms,
and (3) Full HD HUD, controls and visible template previews. The renderer
integration joins their verified outputs. A finished worker takes the next
independent issue so the visual redesign does not stall on CI polling. Record
the actual merged result and production visual check before calling a slice
shipped.

### First renderer foundation on this branch

`src/rendering/camera/oblique-projection.ts` now expresses the ground-plane
projection, its inverse pointer hit, four-corner culling bounds and anchored
angle change. It starts from the existing top-down Phaser framing without a
tile jump. Six focused tests cover absolute coordinates at 30°/90° elevation,
90° yaw, cursor anchoring, bounds and invalid poses. A deliberate sign mutation
in the yaw transform made the 90° test fail (`1000` instead of `920`); restoring
the code made all six pass. **This foundation is not wired into `WorldScene`**:
no player can turn the view yet, and the sprite depth/cutaway rules are still
required before exposing the control.

`src/rendering/camera/oblique-geometry.ts` additionally projects a whole
1 × 1 tile and the full/cutaway wall prism from the **same unchanged base
quad**. Its view-direction depth helper replaces the fixed south-row order in
the eventual renderer. Four focused tests check the actual 64-unit footprint,
both wall heights and yaw-dependent sorting. This geometry is likewise a
renderer foundation, not yet a loaded game layer.

## Reusable concept prompt set

These are **normalized prompts for new exploration**, not a claim that each
image was generated from an identical scene or seed. For comparable future
views, create a single canonical Blender scene and render it at fixed camera
poses. Use this base: “Original polished painterly 3D game art for a prison
management simulation, modular full-square tile grid, warm concrete and brick,
muted green, readable beds/doors/toilets/people, near walls cut away when they
hide interiors, no HUD or text, 16:9 1920 × 1080, no copied game art.” Add:

- `view-low-oblique.png`: shallow ~25° elevation, close prison cells.
- `view-medium-oblique.png`: stronger ~45° elevation, same visual language.
- `cell-closeup.png`: ~30° elevation, one furnished 3 × 4 cell and corridor.
- `wing-mid-angle.png`: ~50° elevation, two rows of cells, shower, canteen, yard.
- `room-template-preview.png`: ~35° elevation, teal full-square floor ghost,
  amber full-square wall ghost, one visible door gap.
- `wing-high-angle.png`: ~70° elevation, tactical wing overview with legible
  rooms, doors and people.

## Related work

- [#1592](https://github.com/woogitsu/lockstate/issues/1592) tracks the adjustable
  camera and its real-game acceptance gates.
- Build square footprint and basic room catalog: #1587, then additional room
  patterns in #1589 (stacked).
- Wall/cutaway Blender kit: `codex/wall-cutaway-art-2026-09-28`.
- On-screen camera pan: #1590. Rotation input contract: #1591. Both are separate
  from the renderer's still-missing angled projection.
