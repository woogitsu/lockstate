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

## Actual render-feed scene at Full HD

The follow-up scene in `src/rendering/scene/oblique-world-scene.ts` now reads a
real `RenderFrame` from the existing `RenderFeed` and projects loaded ground
tiles, wall and door edges, structures and actors from the current simulation
grid. The `tests/browser/oblique-world-harness.ts` scene uses an actual
`SparseWorld` snapshot with one walled cell, a door, a bed and an actor. These
1920 × 1080 browser captures are output from that scene, not concept art:

| Yaw / elevation | Actual render-feed output |
| --- | --- |
| -45° / 25° | [Shallow pose](./render-feed-yaw-45-elev25-fullhd.png) |
| 0° / 45° | [Straight pose](./render-feed-yaw0-elev45-fullhd.png) |
| +45° / 65° | [High pose](./render-feed-yaw45-elev65-fullhd.png) |

The same logical tile (3, 3) is selected at all three angles. The selected
footprint fills its entire projected square. Static tiles and solids are
reprojected only when the frame revision, camera pose or viewport changes;
the test checks that idle browser frames do not repaint them. Actor movement
can repaint the raised layer without rebuilding the ground. A deliberate
mutation that projected every *empty* north edge made the unit test fail with
63 extra solids; restoration returned it to green. This is still a plain
diagnostic renderer. It has no final art, wall cutaway, construction ghosts or
player-visible switch in `main.ts`, and the browser fixture is a small scene
rather than the frame-cost acceptance test for a large prison.

## First Blender modules inside the actual scene

The composition branch joins the camera scene to authored north and west wall,
cutaway wall, north and west doors, bed, toilet, rack and chair modules. Cell and canteen
zoning select their matching Blender floor tile, while unzoned ground retains
the baseline terrain appearance. Its browser fixture loads the real
content-hashed PNGs and checks that each camera pose chooses the matching bed
frame. It renders the same immutable world and selected square as above:

| Yaw / elevation | Blender art with selected-room cutaway |
| --- | --- |
| -45° / 25° | [Shallow view](./blender-cutaway-render-feed-yaw-45-elev25-fullhd.png) |
| 0° / 45° | [Straight view](./blender-cutaway-render-feed-yaw0-elev45-fullhd.png) |
| +45° / 65° | [High view](./blender-cutaway-render-feed-yaw45-elev65-fullhd.png) |

Selecting a ground square lowers only nearby walls *in front of* it. The
unchanged edge layers still carry their full collision and save state. A
browser mutation that reversed the near-wall depth comparison cut the far
wall instead and failed the test; restoration passed. Authored cutaway art now
replaces nearby wall geometry at the selected camera pose. Door cutaways still
use geometry. The scene loads only the needed camera frames into Phaser's
texture cache. Prisoner and guard idle sprites now use camera-matched Blender
frames; walking animation still needs a motion-specific treatment. Unzoned
ground has not reached final art quality. Depth and
asset loading must be measured on a much larger prison before replacing the
current player view.

## Active delivery lanes

**Integration checkpoint, 2026-09-28 (PR #1623, `aa1723f7e`):** the optional
`/?oblique-preview=1` route now uses the live prison, adjustable yaw and
elevation controls, mouse movement, map zoom/minimap navigation, Blender
wall/door/floor/furniture/actor modules, and a whole-tile room-template ghost
with a preflight verdict and cost. The Cell, Canteen, Shower and Infirmary
templates can be selected in the HUD and placed through the real command
path. A stale placement reply no longer replaces a newer ghost. The Full HD
placement and stale-reply browser flows pass, including Save/Load coverage;
the larger placement flow still takes about 1.7 minutes locally, so rendering
performance needs work before this replaces the default top-down view.
Ground art updates for newly loaded camera frames are now batched into one
repaint rather than 29. Additional room templates, clearer selected-tool
state, Escape behavior, corner art and smaller ground textures are in separate
reviewed branches. This is an integration branch, not a production release.

**Later checkpoint (`e34dabd8c`):** the running Full HD angled route also
offers Laundry and Classroom plans, places a whole-square wall by click or
rectangle drag as one Undo transaction, and places an object at the shown
footprint. Escape puts down an armed plan and Build selection follows the
actual tool. Doorway guards now reject later plans, walls and objects that
would block the only approach to a pending or completed cell, including after
Save/Load. The drag rectangle is submitted correctly, but its live ghost
still shows the hovered single square; the scene now exposes both live drag
endpoints so the HUD can paint the exact pending footprint and total catalogue
estimate. Ground frame crop, batched texture loading and corner modules remain
in separate PRs until their exact-head CI is green and integration passes.

**Integration checkpoint (`3ff00027a`, 2026-09-28):** the oblique scene now
accepts a screen-space zoom pivot and pan deltas, preserving the pointed ground
square through a pose change. The Full HD route also exercises the existing
Build remove tool against completed wall edges, and leaves modified keyboard
shortcuts to the browser. The HUD worker has reproduced a wheel-zoom pointer
drift in Build and is wiring this scene port to fix it. For #1663 the owner
chose to block overlapping zones while a paid room template is pending; PR
#1680 contains that behavior and is already an ancestor of this integration
branch, though it is not on `main`. Separate draft PRs
#1714 and #1716 cover 90-degree Canteen and Large Cell plans with Save/Load.
The Blender ground, texture-loader and corner work is pushed on isolated
branches; these slices are not yet declared shipped or on production.

**Input checkpoint (`6ece6d1cc`, 2026-09-28):** the Full HD angled preview
accepts wheel zoom anchored beneath the pointed square, keyboard pan through
the saved WASD/arrow bindings, and middle-button map drag. The latter does not
place an armed Build order. These controls passed their real-browser checks
after integration on this branch. The owner-requested zone reservation from
#1663 is present in this branch's ancestry, but none of these preview changes
is on `main` yet. The Save/Load room-plan browser flow exposed an intermittent
long reload; investigate that before treating the complete flow as verified.

Keep three isolated worktrees moving in parallel: (1) Blender modules and
consistent camera poses, (2) square-first construction and ready-made rooms,
and (3) Full HD HUD, controls and visible template previews. The renderer
integration joins their verified outputs. A finished worker takes the next
independent issue so the visual redesign does not stall on CI polling. Record
the actual merged result and production visual check before calling a slice
shipped.

**Integrator handoff, 2026-09-28:** the art worker owns coherent Blender modules
and the four-cell wing, the gameplay worker owns whole-footprint validation and
template command parity, and the HUD worker owns camera controls and visible
template previews. The integrator owns `src/main.ts` and the oblique scene until
the preview branch is pushed, then hands its exact SHA to HUD for the stacked
application wiring. The preview route `/?oblique-preview=1` reads the live
simulation feed and paints a newly created prison, but it is an integration
gate only: its build gestures and camera HUD are not yet connected. The next
player-facing milestone is a real Full HD browser flow that creates a prison,
rotates it by mouse, keyboard and buttons, places a cell template on filled
squares, and reloads the same saved footprint. Test that flow before enabling
the new scene by default.

The live preview now also has the Full HD camera HUD bridge and a ground-hover
callback that reports the logical tile after pointer movement **and** camera
rotation. `onTileSelected` reports the left press; these two ports are the
input seam for the square/template ghost and its checked placement command.
Shower-room zoning and finished shower heads select the matching Blender
modules. The remaining gate is to wire the actual template tool and its
preflight verdict to those ports, then prove the placed room survives Save/Load.
For a shower room north of its entrance, the north-edge door selects the
Blender privacy frame and switches to its cutaway frame when it would hide the
selected tile. West-edge doors continue using their west-facing module; the
privacy frame has no west-facing geometry yet.

**Highest-priority continuation for every future session:** keep those three
workers directed at this camera/building/art delivery until the selectable
angle, whole-square construction, usable cell/room patterns and Blender art
are present together in the running game. When a worker finishes, give it the
next independent task in its lane. Push each reviewed coherent increment to
GitHub; do not spend a whole run only watching checks. Owner-approved control
methods are mouse, keyboard and on-screen buttons, with a freely adjustable
angle rather than one fixed isometric view.

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
