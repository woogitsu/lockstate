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

## Active delivery lanes

Keep three isolated worktrees moving in parallel: (1) Blender modules and
consistent camera poses, (2) square-first construction and ready-made rooms,
and (3) Full HD HUD, controls and visible template previews. The renderer
integration joins their verified outputs. A finished worker takes the next
independent issue so the visual redesign does not stall on CI polling. Record
the actual merged result and production visual check before calling a slice
shipped.

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

## 2026-10-01 integration checkpoint — not a release claim

The production composition root is under review in [#1894](https://github.com/woogitsu/lockstate/pull/1894). Its current implementation connects angled-world Build/Rooms/Objects gestures, minimap and zoom; the keyboard bridge uses the existing remappable adapter for pan, rotation and tilt. Separate HUD angle buttons and pose-dependent model loading are being integrated. Full HD local browser checks are useful evidence, but this stack still needs full exact-head CI, serial main CI and production verification before it is called shipped.

[#1898](https://github.com/woogitsu/lockstate/pull/1898) corrects the square template footprint from #1882. Wall orders now use the exact preview coordinates. Shared square barriers feed enclosure and navigation without writing irreversible legacy edges. Rendering reads occupied squares in both views, preserves construction identities and avoids duplicate paint. All three currently available templates have completed build/furnishing and actual save-envelope round-trip coverage. Queued object footprint protection reuses the existing #1605 implementation; that original issue remains open until its integrated result reaches main.

Remaining acceptance work, in priority order:

1. Complete screenshot and collision checks after construction and Save/Load in both renderers; retain full-square walls alongside legacy edges.
2. Move ordinary freehand Build gestures from edge runs to occupied square runs. The template correction alone does not satisfy the owner's whole-square building requirement.
3. Integrate and verify existing additional room plans from the #1644 stack before expanding the catalog to every room type. The owner's decision was the complete template system; three templates are an intermediate state.
4. Re-render Blender frames whose non-transparent pixels touch a frame edge. Art QA found clipping in the desk, bin and sink pose catalogs; runtime frame selection fixes alone do not correct truncated source art.
5. Join all reviewed increments, pass exact-head CI, then verify the actual deployed game. Keep art, gesture/input and integration QA in separate worktrees.

## 2026-10-01 furnished catalog integration checkpoint

The dependent branch codex/integrate-full-room-plans-20261001 ports the existing four-cell row, canteen and kitchen implementations (13f3bb9969, 1b013ea4ea, db890d72da) and mirrored object-width correction f53a61a12c onto the corrected square-wall stack. All six plans are selectable in the catalogue. Twelve scheduled build/furnish/save-envelope/load cases cover normal and mirrored copies, including all four separately designated cells. Five focused suites pass 40 tests; mutating the coordinator to designate only the first room produces two failures, restored production passes; TypeScript passes.

Existing room/object names are reused for canteen, kitchen and fixtures. The row label reuses the previously authored Four-cell row / Blok czterech cel wording. This is not the complete eighteen-room catalog or a release: mouse-on-map template placement and worker-backed cost display still need integration, then remaining room types and exact-head release gates.

## Complete room-type coverage checkpoint

The furnished catalogue now contains twenty plans covering all eighteen released room types. Fourteen additional plans cover holding/solitary cells, reception, laundry, yard, common room, classroom, infirmary, security/staff offices, storage, deliveries, garbage and utilities. Authored dimensions meet actual room requirements; object footprints and mirrored widths are checked against content definitions. Yard is an open 8-by-8 zone with no indoor shell. Existing localized room/object names are reused, with no new outward-facing promises.

All forty normal/mirrored construction, furnishing and save-envelope/load cases pass. Six focused suites pass 192 tests, including independent complete-room coverage and saved enum union contracts. Mutating Yard into an indoor shell and overlapping classroom seats produces four failures; restoring production passes. TypeScript passes. Pending template IDs extend the existing versioned field, without a new field or migration. This evidence does not prove Full HD catalogue usability or mouse placement; those acceptance checks remain assigned to the HUD integration agent.

## Pending-plan safety checkpoint

Existing fixes for #1646 (full pending interior claim), later ordinary wall reservations, #1608 (cancel whole shell when one member is lost), #1669 (paused Cancel/Undo reconciliation), and #1664 (safe coordinate bounds) are now integrated into the corrected all-room catalogue. These are reused source commits, not duplicated issues. The integration adds the missing tileCoordinate import detected by the current TypeScript and runtime test.

Mutation removing pending interior reservation and paused reconciliation causes three session failures. Restored production passes five suites (197 tests) and TypeScript. Full browser coverage and the complete reversible transaction requirement #1657 remain acceptance work; shell cancellation alone is not full completed-room Undo.

## Completed indoor-room transaction checkpoint — owner format approval pending

The #1657 full reversible transaction direction is implemented for nineteen indoor plans. Furniture shares the shell transaction; cancellation removes all members and zoning, late fixture refusal rolls back accepted work, and Redo restores the room obligation without duplicating fixtures. Actual save envelopes retain optional roomTemplates.undone and roomTemplates.completed metadata (version 1); old saves without these fields use empty lists. The format extension remains a draft pending the owner's exact-field approval. It must not merge before that decision.

Five suites pass136tests and TypeScript, including nineteen completed indoor-room build/save/load/Undo/save/load/Redo cycles. A production mutation grouping furniture separately fails the Basic Cell transaction case; restored tests pass. Cache geometry/content revisions correctly increase across Undo/Redo, so content comparison checks every saved plane while excluding only those revision counters. Shell-free Yard still requires a proper zoning transaction; no fake construction order is introduced to pretend it is finished.

CI repair PR1895 merged at bf976ac9fe after exact head560cc632f929 passed all checks and mergeability was CLEAN. Serial main CI run36905140655 is in progress; no further main merge is authorized by a partially completed run.
