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
63 extra solids; restoration returned it to green. The production composition
root now has an explicit `?renderer=oblique` opt-in. It verifies the oblique
module registry before constructing Phaser, passes the verified catalogs into
`ObliqueWorldScene`, and exposes the same feed, minimap, selection and zoom
ports as the top-down scene. A catalog failure paints an explicit startup error
instead of silently falling back. The default URL keeps the registry-free
`WorldScene` path. This branch also paints the first authored PNG frame for
mapped walls, doors and objects over the geometric fallback. The opt-in scene
now forwards build, room and object gestures through the established tool ports,
projects their live tile footprints, and keeps the minimap, zoom and Save/Load
paths active. The cutaway and full square construction gates remain separate.

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

## Blender stove module (2026-10-01)

A production-ready source asset is now authored for the kitchen lane:
`assets/source/blender/furniture.kitchen.stove.variants.blend`. The
reproducible `build_kitchen_stove.py` script renders 72 transparent 128 px
frames (12 yaw poses × 6 elevations), and their hashes are recorded in
`public/game-content/oblique-furniture.kitchen-stove.v1.json`. The catalog is
registered as `furniture.kitchen.stove.variants` in the oblique module
registry. The model is a two-tile commercial stove with four burners, twin oven
faces, controls, splash guard and feet.

This is authored Blender art and a verified runtime catalog, but it is not yet
shown by the production `WorldScene`: the next integration step is to resolve
an oblique object-sprite consumer for `object.stove`, then verify placement,
cutaway/depth ordering and Save/Load in the real Full HD scene. The module is
therefore a concrete art increment, not a claim that the complete angled mode
has shipped.

### Kitchen fridge Blender module (2026-10-01)

The kitchen lane now also has a one-tile refrigerator source at
`assets/source/blender/furniture.kitchen.fridge.variants.blend`, with 72
transparent yaw/elevation frames and a verified catalog at
`public/game-content/oblique-furniture.kitchen-fridge.v1.json`. It is registered
as `furniture.kitchen.fridge.variants`. Like the stove module above, this is
real authored art and a loader-ready catalog; the production renderer still
needs the object-sprite consumer and Full HD placement/depth/Save-Load proof.
## Documentation gate integration checkpoint, 2026-10-01

Reopened live ownership declarations and object-removal class/method references after the full-plan stack shifted source coordinates. Quoted actual declarations beside the anchors without raising budgets. The archived enclosure fault still points past EOF; its diagnostic now records the actual 296-line file. Three documentation suites pass 19 tests after the previously observed quotation budget failure. Feature root remains draft pending the two save-field decision; HUD mouse integration is pushed in draft PR1906, and Yard transaction implementation continues separately.


## Combined camera and mouse-build checkpoint

Merged HUD mouse integration 2a4c65e079 and camera inventory follow-up 3237bc451e into the full catalogue root. Integration exposed two template labels outside HUD_MESSAGE_KEY, CRLF-sensitive composition source matching on Windows, and shifted live quote anchors. Registry references and line-ending normalization fix those failures without removing pinned wiring. Removing the production staff-coverage cadence call fails the contract (1 red); restoring it passes both composition and HUD registry suites (40 tests). Quotation plus those two suites pass 52 tests; TypeScript passes. Full runtime Blender validation and Yard reversible zoning remain independent active work; no release claim is made.


## Pointer interruption safety, issue1907

Four production-path tests reproduced unintended template placement after pointer cancellation, lost capture, release outside the map, and switching templates during an unfinished press. The bridge now binds the press to both pointer ID and selection revision and clears it on interruption, outside release, window blur and Escape. A fresh press still places the selected plan. Focus-loss regression coverage is included; focused bridge/tool/composition tests pass 36 tests and TypeScript passes. No new player copy or save-format field is introduced.


## Accepted command versus newer hover, issue1908

A delayed room-plan confirmation was discarded when moving the cursor triggered a newer hover query, leaving the tool armed after placement. The production-path test fails before the fix (armed true instead of false). Accepted placement now disarms the matching original selection irrespective of newer hover queries; stale refusals still cannot repaint newer previews, and a newly armed selection is protected from older confirmations. Eleven bridge/tool tests and TypeScript pass. This is a source integration checkpoint; browser acceptance remains separate.


## Near-wall visibility integrated checkpoint

Merged camera agent47eee44860 into the combined feature root. The pure world projection lowers camera-facing walls with room interiors behind them, switches the matching authored cutaway asset, preserves full door height and never changes the worker's occupied square, edge, collision or saved world. Agent proof includes yaw0/elevation45 and yaw180/elevation65 FullHD browser cases (2 green); identity-height mutation makes the pixel test red. Root integration passes six suites75tests including completed-room Save/Load/Undo/Redo and whole-room catalogue/protocol cases; TypeScript passes. This does not replace true Blender-runtime QA or owner approval of the pending save metadata.


## All twenty plans reversible backend integration

Integrated Yard source checkpoints53009f866b/c0c6011646/d3b2ad35ec. Yard records an actual reversible zoning gesture in shared history, without fabricating a wall BuildOrder or consuming materials. Its hooks are reattached from existing plan metadata after load; the status projection exposes Undo/Redo availability. Rejected Redo is guarded against resurrecting an empty-shell plan. Root transaction/Redo/complete-catalogue suites pass65tests and TypeScript. Player success wording remains owner-reserved and pending; this integration is draft, with browser Yard acceptance not yet established because the QA worker bootstrap did not complete.

## Full room fixture art mapping checkpoint

Integrated the authored art composition7dd7075d1f into the feature root. A new catalogue-derived check found fourteen missing fixture mappings before integration and five afterward: bed, toilet, shower head, dining table and bench. Those five now resolve to existing Blender pose catalogs. All nineteen fixture types in the twenty plans resolve through the production object mapping to registered catalogs with complete pose grids and Blender source declarations; mapping/projection/coverage suites pass46tests after the observed red cases. This checks routing and catalog metadata, not PNG completeness or final runtime appearance. Full-square wall geometry and actual textured Full HD play remain separate acceptance work.

Removing the production bed mapping deliberately makes the coverage suite fail one of twenty cases; restoring it returns20green. Camera checkpoints34c58dd4ed and16b5ccee28 now pin the full/low heights to0.75/0.34 tiles and lower camera-facing corner walls with diagonally adjacent interiors. Root projection/catalogue/research-index checks pass29tests. Research records for real mouse placement, completed square walls and Yard history are indexed; native Windows CRLF and linked path separators no longer create false index failures.

The earlier Yard browser bootstrap limitation was superseded by the built-game test committed in423628c04e: real Full HD64-square ghost, interruption without placement, fresh mouse placement, and Save/Load between Undo and Redo passed in11.2seconds. No wall BuildOrder was created; room count went1 to0 to1. Save-field approval and truthful success wording remain pending owner decisions, so the combined feature PR remains draft.

## Authored square walls and catalogue usability integrated

Merged Blender checkpoint1d41b9a4ee: full and low brick square models now match the projection heights0.75 and0.34 tiles, with72 authored poses each. Root wall/catalogue/registry suites pass23tests, and the official Windows production build generates and verifies client and Worker output. Camera picking testded85d9dd1 is also integrated; its independent branch proved four yaw directions and two elevations through actual mouse placement, with a deliberately broken yaw projection detected before restoration.

Integrated HUD cardsf092035b36/2049c77c0a/c0f4c0cb0a/b90bb56fbc. The twenty plans show dimensions, authored footprint miniatures and fixture counts before selection; the long four-cell diagram keeps its controls visible in Full HD. Actual built-game browser passed, and shrinking the bed's two-tile card footprint deliberately failed that case before restoration. The source screenshot is recorded in the indexed room-plan-cards research folder. Native inventory CLI issue1575 is corrected with Node's file URL conversion; regeneration reports588authored strings and the inventory gate passes. Final combined textured-cell camera controls and full room fixture rendering are actively being verified by separate agents; these source and build checkpoints do not establish a production release.

## Full verification and representative textured room checkpoint

A complete native Windows Vitest run on d0a001b7b8 finished with6012passed,48failed and8skipped tests across532files. This is a red full-suite result, not a release gate. Follow-up isolated the missing shell environment: setting the existing LOCKSTATE_BASH option to installed Git Bash makes deploy-secret and Worker-source suites pass111tests without changing their assertions or installing WSL. Other platform-specific source/path checks still need reconciliation. Actual integration defects found by the same run were repaired: new mouse bridge is included in the locale scanner; save-bundle source scanning uses fileURLToPath instead of a URL pathname; cards use direct dimensions rather than an undeclared CSS variable. Source anchors were reopened and the fully repaired ADR0031 no longer consumes its old exception budget. Six focused suites pass135tests, including the complete save shape and all design tokens.

Art composition586d932f63 is integrated with real classroom/kitchen/infirmary/laundry render evidence at three Full HD camera poses: all projected built solids use loaded Blender frames and no fallback drawing. The indexed report names its limits: direct render-frame fixtures do not prove construction-worker or Build-dialog flows, near walls still hide some low fixtures, and wall surfaces remain visually plain. Actual completed-cell Save/Load and camera-control checks continue separately; all19fixturetypes are the next texture-coverage step. No production rollout is claimed.

## Full catalogue and actor occlusion integration

Integrated the expanded actual-scene fixture harness for all20plans and all19fixturetypes, deriving room numeric zoning identities from the room registry instead of painting every floor as a cell. The independent agent reported21browser cases green across three poses; the combined cutaway version still needs its updated visual pass. The camera change hides only low wall pieces that actually overlap built interior fixtures in projection; occupied wall squares remain unchanged. Root integrated that change and the HUD fix for an invalid hidden numeric coordinate erasing an otherwise valid mouse-placement material quote (#1912).

Issue1913 is fixed in the real Phaser scene: reusable actor Graphics follow the same sorted depth as authored wall and furniture images. A Full HD pixel test proves the rear actor's lower torso is hidden and the foreground actor stays visible; restoring the old depth fails with56wrong pixels, restoring the fix passes. Before/after evidence is in the indexed actor-depth research folder. This is pushed feature work, not a production-release claim.

Next visual integration requirement: the angled ground painter currently uses flat Graphics despite existing authored floor materials. Reuse existing top-down Blender floor textures via exact planar quad projection, preserving the grid at intermediate yaw; do not approximate ground with nearest-angle overlapping PNGs. Existing floor source geometry is centered at worldXY0 with footprint[-0.5,+0.5], so a tile anchors at its center. Room-specific materials and terrain mappings already exist in environment-art; retain approved kitchen and Yard colors. Actual floor seam/picking/SaveLoad/browser verification is required before claiming that integration finished. In parallel, agents verify stationary-cursor previews after camera turns and wide mirrored room placement.

## Exact floor material integration checkpoint

The flat-ground gap above is now repaired in the WebGL production scene. Existing authored overhead floor textures use Mesh2D batches on the exact projected full-square footprint, including intermediate yaw37/elevation53 and yawminus63/elevation25. Room-specific and terrain identities come from the shared environment-art module, with the existing tint-over-art/ownership/grid rules above the material. Missing art and Canvas retain normal fills. No new art files or simulation/save policy were introduced.

Actual1920×1080 Yard evidence covers64zoned texturedtiles at threeposes. A pixel test fails with spread0 when meshes are deliberately transparent; restored floor and actor tests pass2/2. A separate32-pixel geometry mutation fails the exact-corner test and restoration passes2/2. TypeScript and floor/index tests pass7/7. Screenshots and verification limits are in the indexed oblique-floor-art research folder. The completed-cell Save/Load case passes after integration but exposed older local oblique LFS pointers, so full-cell texture evidence is not inferred from that case. A separate agent is verifying production floor pixels across Save/Load. Wide-template and ordinary Build stationary-cursor fixes are integrated;12drag directions/boundary cases and real112-square mirrored placement were proved independently. Three preview-fit policies remain review proposals until a concrete owner choice; no production rule has changed.


## Brick detail integration checkpoint

Integrated the Blender detail pass b5dd5c83ad into the combined feature root: the existing full/low square models retain exact 1x1 footprints and 0.75/0.34 heights, with authored staggered masonry, recessed joints and cap stones across 144 refreshed frames. Root hydrated the LFS source and images and passed eight catalog/world-projection cases. Deliberately replacing one production manifest frame hash with zeros makes the catalog test fail one case; restoring the manifest passes both cases. The standalone full-wall render was inspected and shows the joints and cap grid. Actual combined Full HD scene appearance remains a separate art-agent acceptance step; this is not a production-release claim.

## Authored actor consumer source checkpoint

The registry already carries Blender prisoner/guard catalogues, but the angled scene previously ignored actor art and drew every role with the same orange Graphics glyph. Projection now carries the role's existing catalogue and exact continuous feet anchor; pose texture selection and sorted image painting consume those frames, while unknown roles or missing textures retain the graphics fallback. Eight projection cases and TypeScript pass. A deliberate prisoner-to-guard mapping mutation fails the role/anchor case, and restoring it passes both focused cases. Actual actor pixels and wall occlusion with the authored frames still require browser verification; no animation or production-release claim is made.

## Owner decision: full large-pattern preview, 2026-10-02

After reviewing the six actual Full HD comparison frames, the owner selected option 3: show the whole pattern, pan the camera and preserve the selected construction origin until the next physical mouse movement. This authorizes the pan-locked production policy; it does not bypass terrain/overlap validation, approve the separately pending save-history fields or approve new player messages. The pure fit API is integrated and passes five focused tests; the HUD agent is implementing repeated-selection, rotation/mirror, cancellation and exact committed-origin behaviour. The one-shot comparison controller remains review evidence, not the finished implementation.

The masonry runtime evidence is integrated: the art agent's actual-scene run passed21cases covering20plans and19fixturetypes at three camera poses, and inspected kitchen/laundry frames show the new joints and cap grid. That run predates the new actor consumer; authored actor pixels and Save/Load floor evidence remain separate acceptance tasks.

## Approved fit completion and moving actor checkpoint, 2026-10-02

The owner-selected full-preview pan policy is integrated. Actual production tests pass at1920x1080 and2560x1080; a separate stationary-row overlap case passes with exact retained origin after camera rotation and a genuine worker refusal on the occupied footprint. The detailed evidence is in docs/design/2026-10-02-approved-room-preview-fit/README.md. No terrain or collision validation was bypassed.

Authored prisoner/guard pixels and wall depth are verified in the actual angled scene. Moving actors now reuse Phaser Images, including culled slots, rather than creating and destroying every actor image on each position update. The production reuse mutation fails actual browser identities; restoration passes both image/depth and movement cases. Detailed evidence and limits are in docs/research/2026-10-02-oblique-authored-actors/README.md. Cook, medic and staff frames are being rendered from the existing Blender sources by the art agent. Save-history fields and new player-copy approvals remain separately pending; these checkpoints do not claim a production release.

## Role art and canonical feed integration checkpoint

All216 cook/medic/staff Blender frames, source/PNG hash contracts and registry entries are integrated. The canonical feed-ID mismatch discovered as issue1922 is corrected: real snapshot prisoner/guard identifiers now resolve authored art rather than the fallback, while cook/medic/staff canonical catalogue IDs are supported. Actual scene role pixels, wall depth, actor pooling and solid reuse all pass4/4 browser cases; making actor art invisible fails the role pixels, then restoration passes. The inspected Full HD screenshot and detailed population-lifecycle limits are in docs/research/2026-10-02-oblique-role-actors/README.md. Staff snapshot positions are still not published; do not claim all populations' gameplay lifecycle is finished.

The modal keyboard fix for issue1918 is integrated and prevents camera movement behind an open native room-plan dialog. Camera Save/Load rotation also passed unchanged in a warm production test; issue1921 separately records cold Vite startup spending the test clock. PR1897 was merged at exact green head6aeaf7ac7705b2378c6e1f30de55cda94f24feec after the previous main CI completed. Serial main CI on mergea1d80ce3fe113a6c98fece3e8f705fc05cf1cfcd is running. The angled production composition PR1894's three stale verification failures were repaired and pushed as453433c32a; no test timeout or assertion budget was increased.

## Approved preview and label completion checkpoint

Option 3 remains the integrated owner policy: full footprint fit, camera pan and retained world construction origin until physical pointer movement. Keyboard rearming of all 20 plans is integrated and verified in the real application. The cost readout now avoids the projected floor and HUD-safe bounds; issue 1925 records the measured 17-square obstruction and zero-overlap restored center and mirrored edge views. Root source verification passes 16 focused unit cases and TypeScript. The corrected 216 staff-role orientations also pass actual canonical-role pixel acceptance, 1/1, with the refreshed Full HD screenshot. Test startup warming is separate infrastructure and keeps the existing 60-second gameplay budget. These are integration-branch results, not a production release.

## Independent actor headings and modal-origin key checkpoint

Issue1927 is repaired in the actual scene: authored frames are selected per actor using published world motion/facing relative to camera yaw. Facing-only changes update a standing actor, and same-role guards no longer share one heading. Camera-only selection mutation failed the real scene; restoration passes. The complete authored actor file now passes5/5 in48.5seconds, covering canonical staff role pixels, prisoner/guard wall depth, actor image reuse, solid image reuse/depth and independent headings. Source unit/modal/index verification passes13/13 and TypeScript passes. Snapshot publishers still supply zero movement/no facing, so this is not a claim of finished simulation-facing history or walk clips.

An additional issue1918 edge case is integrated: pressing a camera key first in a modal/text context does not arm a held world action if the dialog closes before key-up. The adapter's source regression and mutation were red before restoration; the agent's real Full HD case passes1/1, with a fresh key press afterward still moving the camera. This complements the existing modal context rule.

Next active scopes: a new authored Yard exercise station and real content integration; reversible quarter-turn room geometry plus a concrete save/history proposal; snapshot-facing data-flow audit. Rotated geometry alone is not playable room rotation. Changes remain on the integration branch; PR1894/main CI gates and separately pending owner save/player-copy choices still control release.

## Rotation proposal and verification inventory checkpoint

Root integrated the dormant quarter-turn geometry, canonical construction adapter and reviewable state proposal. The combined geometry/adapter/index run passes69/69 and TypeScript passes. The two separate owner decisions are pending: durable optional orientation fields with absent0 old-save compatibility, and allowing rectangular room minima in either orientation. No save fields, rotated player control or relaxed room minima have been activated.

A fresh full local Vitest run reports6121 passed,47 failed,2 skipped across543 files. It is not a green full-suite claim. Four failures identify stale named UI scan inventories and a HUD quote literal outside the message registry. The repair names the new label-position/preview-fit/quote modules and routes the existing catalogue-value key through HUD_MESSAGE_KEY without changing player text; all52 cases in the three affected gate files pass afterward, and TypeScript passes. Other full-run failures remain unaudited or environment-bound, including bash/WSL deploy-secret checks where this Windows host has no installed WSL distribution. Do not infer all remaining failures are environmental or waive Linux CI.

## Snapshot headings and catalogue keyboard checkpoint — 2026-10-02

The integration branch now preserves the existing saved `inFlight` prisoner and guard headings in snapshot projection. It leaves velocity zero and does not invent facing for old saves without headings. This supersedes the previous checkpoint's no-facing limitation; it adds no save field or migration. Rendering-feed and service boundary tests pass65/65; actual paused Save/Load browser proof is assigned separately and is not yet claimed.

All20 room-plan cards now share the existing one-stop roving focus helper. Arrow/Home/End changes focus without changing the chosen plan; Enter/Space activates. Polish Full HD evidence, actual worker quote and the production mutation are preserved in [catalogue keyboard proof](../../research/2026-10-02-room-catalogue-keyboard/README.md).

Canteen zoning calibration now uses the registered Blender tile rather than an obsolete PNG's average colour. Existing real-PNG tint/legibility tests pass23/23, with approved colours and opacity unchanged. See [calibration evidence](../../research/2026-10-02-canteen-calibration/README.md).

Windows guard-pool/deployment/security scanners formerly compared native backslash paths with canonical slash paths, including incorrectly treating the declaration as a consumer. Only diagnostic path normalization changed. Baseline8red/4green became12green. Mutating the real search-system pool call still causes the consumer contract to fail; restoring production source returns12green. TypeScript passes. The earlier full-suite baseline remains a baseline, not a full-green claim.

Three active independent scopes remain: corrected min-corner Blender exercise-station source/72 renders, actual snapshot-heading Save/Load proof, and protection against a delayed numeric placement reply overwriting a newly chosen template's status. Main and PR1894 browser CI remain in progress; no merge or production release is inferred from local proof.

## New Yard source and delayed placement acceptance checkpoint

The new Blender exercise station and72 deterministic camera renders are on the integration branch. Source min-corner bounds fit2×1 squares. Camera target agrees between source and manifest; resolution256 / orthographic span4 gives exact64px per tile. The exporter/manifest scale gate catches the earlier3.7span mismatch. Root source/frame/scale test passes1/1 and TypeScript passes. This is genuine source art, not yet a live buildable or a placement acceptance claim. See [model and twelve actual poses](../../research/2026-10-02-yard-exercise-station/README.md).

Numeric room-plan placement now rejects obsolete completion status when another card/mirror choice supersedes the request. Actual delayed-worker Full HD browser proof: removing the production revision guard fails14.6seconds later when the old reply overwrites Yard's clear status; restoring the guard passes in4.3seconds. Selection/focus, current zero-cost quote and no erroneous PlaceRoomTemplate command are checked. Root dialog/tool suites pass7/7. [Durable worker proof and screenshot](../../research/2026-10-02-room-plan-status-revision/README.md).

Main CI run36936677731 completed successfully. PR1894 browser still runs; it has not been merged. Camera agent's paused real Import/Load test passed1/1, but its production browser mutation proof is still pending, so that acceptance is not complete. Next parallel work: existing bench's outdoor Blender variant, compact camera HUD controls, and camera pointer cancellation/remapping audit. Root will connect the new station to actual content with construction/collision/save acceptance before claiming gameplay integration.

## Exercise station content integration checkpoint

The authored station now has a real object catalogue entry, width2/height1, a localized Build name, a buildable recipe and the registered oblique renderer mapping. It uses the existing anchored-fixture brick procurement route; material quantity2 and work60 follow the existing width-derived object rule. Catalogue material value is80minor units at the unchanged brick unit price40. No new material, price, simulation action, save field or mandatory Yard requirement was added. The recreation capability uses the existing object-capability system; no exercise animation or new Yard bonus is claimed.

A real kernel command test purchases materials, zones an outdoor8x8Yard, places and completes the station, proves both squares occupied and the adjacent square free, refuses an overlapping order, then encodes/decodes/restores the save and compares the placed-object state. Changing the production buildable to finish as a bench makes this test fail; restoring passes. Combined kernel/content/cost/room-art tests pass39/39 and TypeScript passes. Actual player Build placement and authored-model pixels in the browser remain the next acceptance step; this is pushed branch work, not production release.


## Production composition merge and station contracts, 2026-10-02

PR1894 was merged as b4ed27c55bb52646cd7ff655cbc5275e0e2279b7 after exact head029deb18a1a38a7a1dda44065962b1ff8d712130 had all checks successful, MERGEABLE/CLEAN, and prior serial main CI36936677731 succeeded. The new serial main CI36948369126 is running; deployment has not been confirmed. The production composition exposes the angled renderer through `?renderer=oblique`; default overhead behaviour remains unchanged.

The new exercise station's explicit catalogue counts, furniture membership, consumed-content inventory and generated player-string inventory are reconciled: six targeted suites pass81/81 and TypeScript passes. Its angled Blender model is registered; overhead rendering explicitly retains the colour fallback because no overhead sprite exists. The stale Remove locale source citation is re-aimed to its declaration without raising the quotation budget. Full local-suite green is not claimed.

Three independent scopes remain active: actual station player placement/collision/SaveLoad proof, outdoor bench context integration, and pointer cancellation/remapping. Browser work is serialized to one worker to avoid concurrent headless CPU pressure.


## Actual station player acceptance and outdoor bench integration

The real player station flow now passes1/1 at Full HD with a filled two-square ghost, third-square exclusion, quoted80 matching treasury25000 to24920, completed worker construction, occupied-second-square refusal and production Save/Load. Removing only its authored asset mapping fails with zero steel pixels; restoration passes. Root inspected the completed Full HD screenshot. See [player acceptance and screenshots](../../research/2026-10-02-exercise-station-player-build/README.md). This is integration-branch acceptance, not deployed station availability.

The existing bench now selects a Blender weatherproof variant only when its entire completed footprint lies inside an authoritative Yard rectangle. Indoor, partial, absent and planned contexts retain their previous appearance. No buildable, price or save identity changed. Bench context/art, world projection and station command integration pass13/13; TypeScript passes. Actual bench player placement remains queued behind the camera pointer-cancellation browser proof.


## Camera cancellation and platform verification checkpoint

Issue1935 is fixed: a right-button turn cannot resume after window blur or pointer cancellation. The unchanged actual Full HD test failed when the production pointer reset was removed, then passed after restoration; final screenshot run passes1/1 in13.5seconds. The source and [durable proof](../../research/2026-10-02-oblique-camera-cancel/README.md) are integrated. No browser timeout was increased.

Four existing evidence contracts falsely failed Windows CRLF/backslash input. Normalize read text line endings and diagnostic repository paths only; assertions and enumerated membership stay unchanged. Their baseline4failures becomes23/23green. A deliberate production clock guard inversion still fails the HUD cadence contract1/5; restoring returns23/23green. TypeScript passes. The separate shell secret gate still needs a working Bash environment on this host, and whole-suite green is not claimed.


## Native Bash and Build occupied-area checkpoint

The earlier local shell failures were environment selection, not rejected game secrets: setting the existing LOCKSTATE_BASH override to the installed native Git Bash made deploy-secret and worker-telemetry suites pass111/111 without changing scripts or gates. Published commit citations pass after explicitly fetching the four published feature refs omitted by this checkout's restricted fetch mapping. Navigation ADR text normalization returns17/17 combined documentation/navigation tests.

Build now publishes canonical selected object dimensions and an exact occupied-area-at-anchor readout. It remains a single-object order with the existing catalogue material valuation. Focused production branch mutation failed before restoration; actual keyboard switching and Escape browser acceptance is queued. Root uses literal multiplication symbols so the generated string inventory equals the runtime value, and re-aims ADR0031's queue-limit citation onto its declaration. The broad local run recorded6220passed,5failed,2skipped; its five failing cases all pass in their unchanged targeted suites after these corrections and reduced concurrent load53/53. This is not a claim that the entire broad suite passed.


## Player bench acceptance, object selection fix and independent camera landings

Actual New prison -> Yard -> existing bench Build -> completed worker order -> production Save/Load passes1/1 in28.9seconds, with the original object.bench identity and authored outdoor pixels preserved. Changing only the context selector from Yard to Canteen makes the pixel check fail; restoring returnsgreen. Root inspected the loaded Full HD screenshot in the existing Yard bench research record.

Issue1939's inactive sibling tool was clearing ObjectTool's active hover on keyboard object selection. BuildTool now withdraws the shared readout only on an actual armed-to-disarmed transition. Keyboard bench-to-station selection keeps exact2x1 area and origin; Escape clears it. The unchanged Full HD test is red with the production guard removed, then green5.6seconds after restoration. Root readout, footprint and foundation gates pass25/25 and TypeScript passes.

Camera fixes can land independently of the pending template-history save decision. PR1940 contains only cancellation, adapted to main's existing hoveredWorldPoint, a Full HD case and proof. Root's isolated-main production artifact mutation fails window-blur equality; restored artifact passes1/1 (7.3seconds suite). PR1941 independently fixes remapped legacy input losing a rotate action by selecting a vacated, conflict-free existing physical position while retaining user bindings. Actual remapped AZERTY labels, rotation and custom pan were proven by the camera agent. Both require exact-head green checks, CLEAN/MERGEABLE and serial main CI before merge. Their attachment attempts hit the app's100-attachment limit; the GitHub PRs exist.

Three independent next scopes: actual Blender weatherproof variant of existing waste-bin with Yard context and player acceptance, recognizable selected Build object thumbnails, and focus-aware keyboard camera behaviour. Browser leases remain serialized.


## Yard waste-bin player acceptance and current parallel scopes

The existing 1x1 waste-bin now has an authored weatherproof Blender variant selected only inside an authoritative Yard rectangle. No price, buildable identity, capabilities or save field changed. Source bounds, 72 deterministic poses and renderer mapping are integrated. The actual Full HD route New prison -> Yard -> Build waste bin -> worker completion -> Save/Load passes1/1. Replacing only the Yard visual with the indoor cylinder makes the unchanged browser pixel check fail380 versus required1000; restoration passes. Root inspected the loaded screenshot. See [actual player evidence](../../research/2026-10-02-yard-steel-waste-bin/README.md). This proves branch integration, not deployed availability.

Root integrated the source and player evidence and pushed them. Camera cancellation PR1940 passed verification and assets after correcting a version citation; its browser gate and prior serial main CI36948369126 still run. Input-remap PR1941 verification is red and the camera agent is repairing its actual log failure. Neither is merged while the gates remain incomplete.

Three independent agents continue: next authored Blender furnishing, recognisable catalogue thumbnails with transparent margins cropped within the unchanged row, and camera input when focus enters catalogue radio controls. Browser tests remain serialized to one lease. Owner decisions for persistent template history, quarter-turn fields and swapped minimum room dimensions remain pending; these are not silently released by an unrelated preview-fit approval.


## First Cell procurement bootstrap integrated

Issue1750 / reviewed PR1751's carrier guard was absent from the full-plan branch. Root restored its real-runtime regression, which now reaches the full command path: live and JSON Save/Load variants both strand the first Cell after furnished Storage Room and Delivery Bay with zero prisoners. Reapplying the guard makes both cases pass, with10/10 combined route foundation/regression cases and TypeScript green. Existing prices, stored state and physical carry once a prisoner exists are retained. Source and prepared real-player dialog acceptance are pushed; browser proof waits behind the camera focus repair and the HUD active-row visibility audit, so player completion is not yet claimed. See [bootstrap evidence](../../research/2026-10-02-first-cell-delivery-bootstrap/README.md).

Catalogue thumbnails now have actual Full HD proof: authored transparent bounds are cropped into the existing row box; whole-frame mutation fails; restoration passes1/1, zero CSP errors and a real404 restores the hammer fallback. Root inspected the station screenshot and integrated the proof. The camera agent reproduced held-arrow motion after focus enters a catalogue radio and is repairing that case. The art agent models an existing bench variant for Common Room in Blender; only source is ready, not player acceptance.


## Actual first Cell from the furnished-route save and input focus acceptance

The first-Cell player path is accepted on the integration branch: two serial actual UI stages pass2/2 under unchanged60s/10s limits, connected by the first browser's real IndexedDB save loaded in a fresh browser. Removing the living-carrier guard leaves18 orders stalled in the second stage; restoration and artifact rebuild pass2/2. Root integrated the proof and inspected its screenshot. The screenshot records neighbouring delivery/storage rooms rather than centring the completed Cell, so a follow-up camera-centred capture is prepared and awaits the shared browser lease. The logical completion and saved-state assertions are already proven.

Held world arrows now stop on focus entering the catalogue radiogroup (#1943). The actual browser regression is green2/2, production release mutation red1/2 and restored green2/2; root input tests pass43/43 with TypeScript. Authored Common Room bench source,72poses and context are integrated, with12 related tests green; actual player proof remains assigned to art. New room-card fixture/door diagrams remain on the HUD agent branch pending actual Full HD acceptance.

Main serial CI36948369126 and staging Deploy36955209725 both succeeded for the independently landed angled composition. The deploy's production job was skipped. Direct reads of both public hosts returned403 from this tool environment, so current public version and runtime pixels are not independently confirmed. PR1899's outdated body was replaced with the current scope, verified evidence, dependency chain and three pending owner decisions.

## Full-preview decision and readable room plans: integrated checkpoint

The owner reconfirmed option3: show the whole pattern, pan the camera, retain the chosen construction origin until the next physical mouse movement. This is the existing integrated policy; the confirmation does not release any unrelated pending persistence decision.

The follow-up first-Cell capture now passes both real player stages again (43.9s and28.2s). Root inspected the centred complete Cell with bed, toilet and doorway after loading the actual furnished-route save. Common Room upholstered bench player build and Save/Load evidence is also integrated, with context-selector mutation red followed by restored green.

All20 room-card miniatures now group furniture by its full occupied footprint and distinguish doors by shape. Actual Full HD acceptance is green, changing the production bed rectangle to a single-square span is red, and restoration is green. Root inspected the catalogue screenshot. The selected large diagram still uses per-square furniture dots; the HUD agent is improving that separate surface next. Root verifies110 focused miniature, projection, design-token and research-index cases, plus TypeScript. This is not a fresh full-suite or production-release claim.

Shallow-angle actual picking at yaw30/elevation25 degrees places the Basic cell at the square indicated by the ghost. The central placement case passes1/1; inverse-projection unit mutation previously produced3 failures before restoration. Blender work proceeds on a Classroom-only chair variant inside the existing1x1 footprint, keeping object identity, cost and saved-state semantics unchanged. Three agents continue on art, camera lifecycle and the selected room diagram. Changes and evidence are pushed to GitHub.

## Selected diagram and Classroom chair integration checkpoint

The selected large diagram now groups furniture as full rectangles too, preserving tile indexing and outlining the containing fixture when the worker reports a blocked square. Actual Full HD mirrored row acceptance passes1/1; reducing only the selected bed to one square fails; restoring passes1/1. Root inspected the refreshed screenshot. This supersedes the previous per-square-dot limitation, without changing the modal dimensions or fit policy.

The Blender school chair source,72 deterministic poses and Classroom-only completed-object consumer are integrated and pushed. Mesh bounds stay inside1x1; existing object.chair identity and price are preserved. Art is checking actual player construction and Save/Load before runtime acceptance is claimed. HUD is addressing stale previous Ready/Blocked while a newly opened plan query is pending; camera is checking removal of a frozen plan when the worker session is replaced. Browser runs remain serialized.

Independent main-based PR1945 isolates the held-arrow focus fix from the pending template release. Input/index46cases and TypeScript pass; making adapter release a no-op gives a targeted failure, then exact restoration gives41input cases green. The PR stays draft pending its separate production-browser acceptance and exact-head full CI. PR1940 and1941 still have browser CI in progress and are not merged. No pending owner save-history, quarter-turn or minimum-dimension decision has been inferred from preview approval.

## Pointer fix landed and pending-query verdict correction

PR1940 completed exact-head full CI atcd973c4b2658cb48b5f76a871d7d2e445b6d768a with CLEAN/MERGEABLE. Previous serial main CI36948369126 was green; root squash-merged it as19d616cec139d0ca4e649c38544c1a8e1d4e0907. Issue1935 is closed. The new main CI must finish before another merge; this does not establish deployment completion.

Issue1946 now has an integrated correction: starting a new room-plan query withdraws the previous Ready/Blocked verdict and tile/fixture marks, disables Submit and sets aria-busy until the current result or failure. Invalid origins do not launch a query and end the busy state. Root verifies18 dialog-status, Classroom context and index cases with TypeScript; real worker browser acceptance remains queued.

The first Classroom player experiment displayed four authored chairs and survived Save/Load, but root found180s test and90s assertion overrides and rejected that experiment as acceptance. Its old-texture mutation failed and the source mapping was restored. Art is rewriting the player proof under unchanged60s/10s limits with normal game fast-forward and actual saved-state stages as needed. Do not report the extended-budget experiment as completed runtime validation. Camera now has the exclusive browser lease for session-replacement ghost cancellation; root main held-arrow proof is next, followed by the corrected chair test and pending-query UI proof.

## Session preview acceptance and independent held-arrow delivery

Issue1947's production fix is integrated: worker replacement or failed claim disarms the outgoing fitted plan. Actual Full HD keyboard Save preserves its preview, Load and New prison remove it without submitting a stale plan. The real case passes1/1, removing only the production stand-down call leaves the ghost visible and fails, and restoration passes1/1. The source changes no saved format or camera pose.

Main-based PR1945 now has its own actual production artifact evidence, rather than borrowing integration proof: baseline2/2green11.8s, scene-release mutation1/2red12.1s, exact source restoration and artifact rebuild2/2green12.1s. One worker and original60s/10s budgets are preserved. Root inspected the refreshed screenshot, pushed dfda579bb1 and marked the PR ready for review, still subject to exact-head CI and serial main gates. Browser lease passed to the corrected Classroom acceptance; HUD pending-query proof is next.

A read-only audit found clean local commits a070e935c650d288a0c4aac3545ee3f868c08da6 on the earlier template-entry branch absent from all remote refs. Root preserved that exact commit at wip/template-entry-audit-preserved-20261002 and verified the remote SHA, without advancing the old PR branch or altering its source. Its stale PR1751 CI failure concerns ADR0042 quoted anchors; it is not a green release gate for this integration.

## Owner reconfirmation and bounded runtime acceptance — 2026-10-02

The owner selected **3 — show the whole pattern, pan the camera and preserve the construction location** in the clickable preview-fit decision. Keep the existing integrated policy: retain the chosen world origin until the next physical mouse movement; illegal ground remains illegal. This confirms preview behavior only, not the pending persistence/history or quarter-turn decisions.

The authored Classroom chair now has accepted real-player proof under the original 60-second test and 10-second assertion budgets: baseline 1/1 green (46.7s), old-chair production mapping mutation red, restored artifact 1/1 green (44.3s). All four completed chairs survive actual Save/Load with independently measured pixels. Source, 72 poses, context consumer and proof are integrated and pushed; see [Classroom chair](../../research/2026-10-02-classroom-chair/README.md).

Issue1946 pending-plan reopen proof is now integrated: actual worker baseline green, stale-verdict mutation red and restored artifact green (8.5s). Root inspected the final blocked-pending screenshot: old collision markings and verdict are absent, current query is busy and numeric submission disabled. TypeScript passes after integration. See [pending reopen](../../research/2026-10-02-room-plan-pending-reopen/README.md).

Serial main CI36959628731 is still running. PR1941's previous browser job ended cancelled after 90 minutes; its artifact includes a real keyboard-only room-removal timeout, so it is not classified as a purely environmental failure. One exact-job rerun is underway, without increased budgets or workers. PR1945 is ready but remains subject to exact-head full CI and the serial main gate.

Three independent work surfaces continue: authored Storage Room rack, new-prison camera framing after an off-map pan, and matching room-plan legend shapes. New-session framing was reproduced in the actual browser; its production fix and mutation/restore acceptance are being recorded before integration. These integration results do not establish production deployment.

## Local keyboard-room-removal follow-up

The failed CI1941 attempt1 artifact contains a genuine keyboard room-removal timeout; it has not been dismissed as infrastructure-only. Root reproduced the exact head887aa65bde66d5c65173b923b3f723b9d9897e2d in an isolated worktree and ran only the existing assembled-page case with its existing slow-test budget, one worker and no retry. Process6777 ended exit0, 1/1 green (1.1m). This is a local result, not proof that the remote job is green; the exact-job attempt2 remains in progress.

The camera new-session correction is integrated as269ab5d2b7 after resolving the callback conflict by retaining both outgoing-plan standDown and revision-gated centering of the incoming world. Strict TypeScript and research-index5/5 pass; root opened the actual new-prison Full HD capture. The selected-plan legend now shares the actual rectangular furniture and door-gap shapes; root90 focused status/design/index cases pass. Its actual browser mutation proof is still being completed by HUD.

PR1945 was DIRTY after pointer cancellation landed. Root merged current main into its own branch, preserving the existing pointercancel/lostpointercapture cleanup as well as the new held-arrow radio-focus release, and pushed830fa5742c. TypeScript passes. Its new exact-head CI is required before merge; previous-head proof and runs are not silently treated as current-head full CI.

## Storage Room and legend runtime completion — 2026-10-02

The authored Storage Room rack has actual Full HD player acceptance integrated as8b6c3ed4a4: two racks complete through the worker and remain at the same anchors after Save/Load. Separate authored-frame pixel counts1581/1486 are unchanged after loading. Old generic mapping mutation fails at0 pixels against>800; exact restoration passes1/1 in35.9s under the original60s/10s budgets. Root inspected the actual loaded room screenshot and pushed model,72poses, consumer and proof.

The room-plan legend is accepted asbbcfbc1e3b: actual shape baseline passes, old circle mutation fails, restoration passes; actual computed-color baseline passes, removing semantic fixture ink fails RGB230/237/241 versus24/52/66, restoration passes. Root opened the final Full HD screenshot and verified dark rectangular Furniture ink and the doorway gap inside the unchanged modal.

Next independent work surfaces: an authored Cell bed in its authoritative1x2 footprint (not1x1), Load-time held-pointer gesture cancellation, and an discoverable HUD renderer selector preserving the current worker, feed and unsaved game. Current angled view remains URL opt-in; do not claim a live renderer selector exists before its real-game integration and acceptance. The selector audit found global input listeners require old-scene shutdown rather than sleeping it.

## Main integration and Load gesture acceptance — 2026-10-02

Current main release7f55deb6a9 is incorporated through merge54c91ea4a8. Conflict review retained the integration branch's later square geometry, cutaway/actor/model consumers, compact pose controls, input remap repair and pointer cleanup; main's native Windows build/release changes remain incorporated. The locale inventory generator combines escaped value cells with quoted source-key anchors. A stale build-queue CSS citation was corrected to its opened source line, without increasing any anchor budget. Strict TypeScript and focused input/projection/inventory/composition/quotation checks pass; no fresh full-suite claim.

Issue1949 is integrated in a23cb1a01f plus12110ae1df/f99445ef47. Actual Full HD held right-button Load fails before the production boundary release and passes after; the independent held Build drag emits2 PlaceBuildOrder commands into the loaded worker without the release and0 after restoration. Root inspected the actual restored screenshot and ran54 input/projection/index cases plus TypeScript. Room/Object held gestures are not separately proven by these two cases.

The live-renderer selector controller and asynchronous HUD control are integrated as dormant ports with6 focused unit cases and TypeScript green. Architecture draft reviewed by the integrator permits production wiring against the same worker/feed/tools, old-scene SHUTDOWN cleanup, lazy preparation before deactivation and rollback. It is not yet a working in-game view selector. Retaining camera centre and pose in presentation memory is requested; no saved preference/default/deploy change is implied. Three agents continue on actual selector wiring, missing middle-button angled panning, and dedicated1x2 Cell cot art.

## Full-footprint Cell cot and middle-button panning — 2026-10-02

The authored Cell cot source and 72-pose consumer are integrated as b4153ee387/1bb20a871e and pushed with all 73 LFS objects. Root inspected the old/new comparison and confirmed the model stays within the existing 1×2 bed footprint. The existing bed identity, cost and collision are unchanged. Focused cot, legacy environment integrity and research-index checks pass 56/56; TypeScript passes. Actual player Build/worker/SaveLoad acceptance is still pending, with the art agent holding the exclusive browser lease.

Middle-button ground-anchor panning is integrated as 53c4605f00. The agent reproduced unchanged viewport while Build was armed, then obtained 2/2 real Full HD browser passes. Removing only middle-button movement made the movement case fail; retaining held pan state across Load made the session case fail; exact restorations passed. Root reviewed source cleanup for blur, pointercancel, Load and shutdown, and ran 14 projection unit checks plus TypeScript. Detailed screenshots and run evidence are being preserved by the camera agent.

The live-renderer controller now honestly exposes failed recovery and permits retry (a57fae7606, five focused cases). Actual same-session renderer wiring is pushed on the HUD agent branch but not yet accepted into the integrated runtime: exact camera centre/zoom restoration and actual unsaved-game transitions remain to prove. Do not treat a controller or a selector label as release completion. Serial main CI36959628731, PR1945 CI36962766742 and PR1941 attempt2 are confirmed live; no merge gate is inferred from partial green checks.
## Actual cot acceptance and live-renderer integration — 2026-10-02

The Cell cot actual player proof is accepted as51cbd90f1e/edf0fa85c1. The player completes delivery/storage then Basic cell through the worker, retains the 1×2 bed anchor21,6, and loads the real IndexedDB save. The authored blanket measures1212 pixels in both completed and loaded captures. Replacing only the bed consumer with its old alias makes the actual pixel check fail at0 against>700; restoring the bytes returns2/2green. Root opened the actual loaded Full HD capture. Art now audits the already-authored72-pose toilet work before creating another model, avoiding duplicate effort.

Production same-session renderer wiring is integrated through6fa6f07a51 plus59cd8c2660, registry correctionede14a4f07 and prepared runtime tests1c8dfd2642. It retains one Phaser Game, worker, current feed/tools, cached verified catalogues, exact world centre and per-mode in-memory zoom/angles. No save preference/default or deployment configuration changes. Actual browser acceptance remains incomplete: the HUD agent reproduced a partial-activation native-listener leak11→14 and owns the scene cleanup correction. A working label/controller/build does not count as completed view-switch acceptance.

A bounded two-worker non-browser audit first returned6283passes/23failures/2skips. Twenty shell checks failed because Windows selected WSL Bash without a distribution; Git Bash explicitly first in PATH made the111 focused secret-gate/Worker checks pass. The three remaining findings were a stale exact HUD module list, two Staff source anchors that moved to the opened3048 line, and remote commit refs absent from the narrow local fetch. Root preserved the strict module/quoted-anchor contracts, registered the new live-view message keys, and fetched all published branch refs. Focused HUD/anchor/commit checks33/33 passed. The subsequent entire audit returned6308passes/1failure/2skips; the sole missing documented prepared browser test was then integrated and its link/index gates15/15 passed. This records scoped repairs, not a fresh all-green full-suite result. Application and tool TypeScript checks and the production artifact build pass.

Serial main CI36959628731 is now terminal success, including verify/assets/browser. PR1945 CI36962766742 and PR1941 attempt2 remain live at the latest check; neither is merged on partial green. Three independent agents continue on existing toilet model integration, actual renderer rollback/listener recovery, and mixed-button camera/Build semantics.
## Partial renderer activation cleanup — 2026-10-02

Root integrated the precise centre-square runtime assertion asaa01004461 and early native-listener cleanup as83dfc7f541. Both scene types register callback-specific SHUTDOWN cleanup before adding native listeners, so an interrupted CREATE can withdraw the listeners already attached. Root reviewed the source order, application/tool TypeScript and28 focused HUD/controller/cache/view checks pass, and the coherent changes are pushed. The HUD agent reports actual unsaved-world roundtrip and503 recovery green, then final3/3green in24.3s. The partial-activation probe exposed two real leaked canvas handlers; a separate extra window pointerdown listener was inspected and identified as Playwright hit-target interception, not game input. Production cleanup-order mutation and exact restoration are still underway before runtime acceptance. A tracked-only WIP snapshot724010549ff7754a3e2a57099877ba7ad5a2648d is preserved on wip/live-renderer-cleanup-20261002-0710 without modifying the agent checkout or refs/stash.

The toilet audit found an existing green72-pose PR but no actual player proof. Its evaluated source mesh, reset to the model origin, crosses negative X/Y and exceeds the authoritative1×1 rectangle. The art agent is correcting this bounded source alignment instead of duplicating models or accepting manifest hashes as visual correctness. Camera prepares mixed-button ownership checks; HUD retains the exclusive browser lease until its mutation/restoration cases are terminal.
## Live HUD view switch accepted — 2026-10-02

The final renderer-switch runtime proof is integrated as434afa922a and supersedes the pending runtime boundary above. Three actual Full HD cases pass: world→angled→world retains the same unsaved worker, snapshot, command list, URL and centre Build square16,16; registry503 leaves the old scene playable and retry succeeds; interrupted native attachment rolls back without leftover game listeners. Reinstating late Oblique SHUTDOWN registration is red at13 game listeners instead of11; exact restoration returns3/3green in24.6s. Root opened the real angled-view capture and verified the visible native selector, square preview and pose buttons. Fifteen documentation-link/index checks pass. This is integrated branch acceptance, not a claim that production has deployed it or that the independent clipped target text is fixed. Camera now holds the browser lease for mixed-button Build/turn ownership; art corrects toilet footprint and HUD fixes target readability independently.
## Main remap delivery and mixed-button safety — 2026-10-02

PR1941 exacthead887aa65bde66d5c65173b923b3f723b9d9897e2d completed all checks successfully after its single exact-job rerun and was CLEAN/MERGEABLE. Prior serial main CI36959628731 was terminal success; its release commit differed only in package version. Root squash-merged1941 as78dc96cb9b59acf0e38485a79e2ec98301faf581 and verified main still retains the existing pointercancel/lostpointercapture cleanup. Issue1938 is closed. New serialmainCI36968171803 is confirmed live and blocks a next merge until green. Root integrated main as4641468b18, retaining both research rows and running48 input/index checks plus TypeScript successfully.

Issue1954 mixed mouse buttons is integrated asd80cf3c4e2 with full actual browser regression and proof0726e1ec3c. Before the fix, holding camera-turn RMB and pressing LMB while Build was armed sent4 unintended PlaceBuildOrder commands into the real worker. Serial gesture ownership and matching pressed-button release restore2/2green in18.3s; removing only the LMB guard makes1/2red with the same4 orders, exact restoration passes. Root reviewed the three source guards and ran application/tools TypeScript plus62 input/projection/index checks successfully. Coherent changes are pushed.

Next independent surfaces continue: toilet model alignment and72deterministic poses, complete readable Build target/count/catalogue value including effective FullHD zoom viewport, and remaining Room/Object held-gesture Load regressions. HUD owns the exclusive browser lease; camera prepares the next cases offline and art renders source corrections. Neither partial PR1945 CI nor the new running main CI is treated as merge approval.
## Readable build targets and aligned toilet poses — 2026-10-02

The owner's option 3 remains the accepted construction-preview policy: show the entire footprint, pan the camera and keep the selected world origin until physical pointer movement. The existing acceptance above is preserved; this checkpoint introduces no new terrain permission or save format.

Build target readability is integrated as5ba80b0f4d/74ab742ec2. The exact square count, origin and catalogue value wrap within the rail; the minimum three-line slot keeps following controls stationary. Actual artifact cases at1920x1080,2560x1080 and an effective960x540 CSS viewport pass3/3 in20.6s. Restoring production nowrap fails with358px content inside260px. This reduced CSS viewport is not a claim of changing browser chrome zoom. Root opened the1920 capture and ran92 target/token/index cases plus application and tools TypeScript successfully. The separately observed black terrain band remains under investigation.

Existing dense toilet art is imported and corrected as70c55ec737/e99c501bdb, avoiding a duplicate model. The standalone Blender export uses evaluated geometry aligned to the authoritative1x1 square; measured local bounds areX[.176,.916],Y[.088,.9622],Z[.005,1.1025]. All72 poses and the authored source are pushed. The root source initially remained an LFS pointer; hydrating the actual model restored its manifest hash and seven dense-art/index checks pass. The first actual Build/worker/SaveLoad pair passes2/2, but its independent pixel mutation/restoration acceptance remains pending. Do not claim production deployment or final toilet runtime acceptance from that first pair alone.

PR1945 acquired a research-index conflict after1941 landed. Root preserved both reports, merged current main into the owned branch as681e4ea0fa and pushed it after48 input/index cases and TypeScript passed. This requires new exact-head CI; old-head results are not current-head approval. Serial main CI36968171803 remains in progress at this checkpoint. Three independent agents continue on actual toilet acceptance, Room/Object Load gestures, and the ground-band renderer audit; browser use stays serial.
## Dense toilet player acceptance completed — 2026-10-02

Toilet runtime proof is accepted as8929697bdf/00ce675d6c and supersedes the provisional boundary above. The real player completes Storage/Delivery then Basic cell through the worker, retains the authoritative1x1 toilet anchor22,9, and saves/loads through IndexedDB. The fixed screen region contains141 authored glaze pixels before and after loading. A missing-asset production mapping mutation makes that exact check fail at0; restoring the original mapping returns2/2green. This tests the actual model consumer, not an old-model comparison. Root opened the loaded Full HD image and reviewed the pixel/anchor assertions; tool TypeScript and five research-index cases pass. Source, poses and proof are preserved on GitHub. Camera now owns the serial browser lease for Room/Object Load gesture acceptance, while HUD diagnoses ground coverage offline and art prepares the next missing contextual model.
## Room and object gesture Load acceptance — 2026-10-02

The remaining held Room/Object Load cases are accepted throughc67c7f545c/b205fd5f88/6c356e309a/9ca93c18ec/b062057d06. The final browser spec is byte-identical to the agent's verified2a03054421 version, including fresh valid gestures after Load. Actual baseline passes2/2 in22.9s. Removing only production cancelGesture from releaseSessionInput makes both cases red: Rooms retains its outgoing2x3 readout and one bed PlaceObject reaches the loaded worker. Exact restoration passes2/2 in22.2s; a fresh Room confirmation and exactly one fresh Object command work. No new production defect or duplicate Issue is claimed. Root tool TypeScript and15 documentation-link/index cases pass; changes are pushed.

PR1899's body now has actual Markdown paragraphs and current accepted model, view-switch, target and mouse-gesture evidence instead of literal escaped newline sequences. Its pending owner save/orientation/minimum decisions and dependency/full-CI gates remain explicit. Independent next work: Staff Room contextual employee desk from the existing Blender source, cursor-anchored angled wheel zoom, and keyboard focus recovery for the native renderer selector. The ground-band audit is preserving raw framebuffer versus composited capture evidence; no ground-painter fix is justified by the current diagnosis.
## Staff Room desk source integration — 2026-10-02

The detailed existing employee desk Blender source is integrated for the Staff Room only as24fbd10103/550bcd1e03. It preserves object.desk identity,2x1 footprint, catalogue price and save semantics. The minimum-corner-aligned evaluated model fitsX[.080,1.920],Y[.070,.983]. All72 poses are pushed; two complete renders have identical manifest hash9cb94d947cc99c72a58a99a9231760f162e0ff40a78a812587836f76cf879733. Root inspected the desk preview and confirmed paperwork/accessories are visible. Its actual source is furniture.office.desk.employee.blend (not the logical variants ID); hydrating the LFS source fixed the local pointer/hash mismatch without changing the contract. Root31 art/mapping/index cases and application TypeScript pass. Actual Staff Room worker completion and Save/Load proof is prepared by the art agent and remains pending until its browser lease.

The ground-band diagnosis is integrated through39cd716aa0. Root opened the raw framebuffer image showing continuous terrain where the composited page capture has a black strip. Six coverage/index cases and tool TypeScript pass. This locates the discrepancy beyond the game framebuffer; it does not prove its downstream cause or claim a production rendering fix.
## Cursor-anchored angled wheel zoom accepted — 2026-10-02

Issue1955 is integrated as2b00a02a55/9e20c9702f. Actual Full HD baseline wheel input at a stationary cursor after changing yaw/elevation moved the Build square18,22 to17,21. The projection now retains the indicated ground point under native wheel input; keyboard and HUD zoom still use the viewport centre. The actual case includes World-to-Angled switching and passes1/1 in13.4s; removing only the wheel pivot reproduces the same failure, restoring it passes1/1 in13.6s. Root reviewed the projection/scene patch and ran15 projection/index cases plus application and tools TypeScript successfully. Source and evidence are pushed; current production delivery is not claimed.

Three independent agents remain active: actual Staff Room desk completion/SaveLoad acceptance is queued, HUD native keyboard-selector focus recovery has a reproduced issue1956 and scoped fix under browser acceptance, and camera audits held construction gestures during view changes. No optional duplicate orbit test or lower-priority phone feature replaces the Full HD mouse/keyboard priority.

## Staff Room player acceptance and next integration — 2026-10-02

The Staff Room acceptance is now complete on this branch as a9130bbd87/958f264ee8, superseding its pending status above. The actual Full HD player completes Storage/Delivery through workers, saves, loads in a fresh browser context, builds Staff Room, and saves/loads again. The desk remains at authoritative anchor21,6; the isolated desktop region contains1547 authored grey pixels before and after Load. Substituting only the generic production desk mapping makes the same check fail at zero; exact restoration passes2/2. Root opened the loaded screenshot and verified19 art/documentation/index checks plus tools TypeScript. See [the actual player evidence](../../research/2026-10-02-staff-room-desk/README.md). This proves integration, not production deployment.

The owner reconfirmed preview option3: fit the entire room pattern, pan the camera, and retain the chosen world origin until physical pointer movement; no terrain permission changes. Three independent agents continue on held Build endpoint reprojection during camera movement, native selector focus during delayed failure, and Blender Kitchen footprint alignment tracked in issue1957. Root is preparing the independent cursor-wheel correction against current main for delivery while the larger template branch retains its explicit pending save-policy decisions.

## Held preview, keyboard refusal and Kitchen sources — 2026-10-02

Held Build endpoint correction is integrated as04b52f2211/3ec28a76e3. The real Full HD baseline kept six preview squares after two keyboard zoom actions although physical pointer movement and eventual worker commands selected five. Reprojecting the stationary endpoint preserves the pressed world square and updates the preview to the actual five commands. Actual fixed1/1green, production-block mutation1/1red and restored1/1green are recorded in the [held Build evidence](../../research/2026-10-02-held-build-camera-preview/README.md). Application/tools TypeScript and ten projection cases pass; the research index omission was corrected and all five index cases pass.

Selector focus evidence now includes the fourth delayed503+Tab case, integrated as64daf58aab: guarded production1/1green, unconditional reportValidity mutation1/1red with focus stolen back to View, restored1/1green. Truthful refusal state remains visible. This supersedes the earlier fourth-case pending status.

Kitchen source/export integration is110458a0a5/2d0703e306. The three existing Blender models now fit their authoritative squares: stove and prep counter2x1, fridge1x1; all216 poses are pushed with64 pixels per tile and deterministic repeated-render hashes. Root inspected the stove preview and ran ten Kitchen/hash/index checks successfully. [Kitchen evidence](../../research/2026-10-02-kitchen-square-fixtures/README.md) still marks real worker construction and Save/Load pixel acceptance pending; do not infer that acceptance from source bounds or render hashes. The art agent owns the only browser lease for this actual proof.

Independent wheel delivery is [PR1958](https://github.com/woogitsu/lockstate/pull/1958), based on current main, with built-client wheel-in/out acceptance and exact production mutation/restoration. Full exact-head CI and serial main CI remain required; neither merge nor deployed availability is claimed here.

## Kitchen player acceptance and solo continuation — 2026-10-02

The owner explicitly requested solo work; this supersedes earlier three-agent directions. No subagents are running, and subsequent development, Blender integration and delivery are performed by root.

Kitchen actual acceptance is integrated asf6432bf9a6/9cb5c385f8 and supersedes the pending runtime boundary above. The real worker completes Storage/Delivery, IndexedDB is saved and loaded in a fresh page, then Kitchen at20,5 is built and saved/loaded again. Stove21,6, prep counter23,6 and fridge21,8 retain their authoritative anchors. Exact authored palette counts225/1697/672 are identical before and after Load; missing-stove production mapping makes its count zero and the second stage red, exact restoration returns2/2green. Root opened the loaded Full HD screenshot and ran ten Kitchen/hash/index cases plus tools TypeScript successfully. This proves the pictured completed player scene, not all angles or deployed availability. The source,216 poses and acceptance are preserved on GitHub.

## Solo touch-input integration — 2026-10-02
Root integrated native two-finger navigation and touch release correction through cd3bdec31a. Native two-pointer camera pan submits zero construction orders; native cancellation and held mouse/touch capture loss also submit zero. A fresh native single-touch release submits exactly one square. Combined production artifact case passed in 5.3 seconds on the source branch, following the earlier actual normal-release failure and restoration. Application TypeScript passed after integration. This is branch integration evidence, not deployed availability. Solo work remains the owner's current direction; no agents are used.

Integrated production client rebuilt successfully; the same complete native-input case passed 1/1 in 7.0 seconds on this branch (one worker, standard timeouts).

## Shared catalog failure recovery — 2026-10-02
Issue1960 records an actual unit-level concurrency defect: a second caller sharing an offline request bypassed its own verified fallback. Fix a82f43b852 applies recovery per caller while retaining one network request. Four registry cases pass, including independent fallback maps and retry after failure. Removing only failed-cache eviction makes the retry case red (one network attempt instead of two); exact production restoration returns4/4green. Application TypeScript passed with the fix. No actual browser outage or deployed availability is inferred from these unit cases.


## Solo Blender Laundry alignment — 2026-10-02
Root evaluated the existing washing-machine Blender geometry: X[-.85,.85], Y[-.59,.42], outside its minimum-corner2x1 footprint. A scoped wrapper reuses the verified Kitchen exporter and preserves the source, object ID, price and saved state. Corrected evaluated bounds X[.15,1.85], Y[.028,.836], Z[0,1.56]. All72 poses now use256px/4tiles=64 pixels per tile, checked transparent borders and deterministic PNG normalization. Root opened the actual45/45 preview. Actual Laundry worker construction/SaveLoad proof and repeated full-render hash comparison remain pending; this is source/render integration only.

Repeated full72-frame render has identical manifest SHA2563ed65a7523e002e505e26da791b134e972c47b8f71ac68d261f0f8c009c980f3. Actual production-client player flow passes2/2: Storage/Delivery capacity built and IndexedDB reloaded in a fresh page, Laundry completed with authoritative washing-machine anchors21,6 and23,6, saved and reloaded with identical anchors. Case durations43.2/37.9seconds stay inside the existing60second budget. Root opened [the loaded FullHD screenshot](./laundry-loaded-fullhd.png), showing both authored models inside the room. A palette pixel assertion plus missing-model mutation/restoration is still pending before final art acceptance.

Laundry visual checks now sample the authored blue door palette separately in both fixed model regions before and after SaveLoad, require more than100pixels each and identical counts. Corrected artifact baseline passes2/2 (43.5/42.5s); missing-mapping mutation was inconclusive because the fresh page timed out before clicking Load, not on pixels. Exact mapping restoration and rebuild pass2/2 (43.9/37.5s). No mutation acceptance is claimed; final missing-model sensitivity remains pending. Tools TypeScript passes.


## Laundry visual acceptance completed — 2026-10-02
The previous missing-asset mutation remains explicitly inconclusive. A new production consumer mutation replaced only object.washing-machine with the existing generic desk asset, preserving normal catalog loading. Setup passed; real Laundry completion failed precisely on authored door pixels (0 instead of more than100). Exact byte restoration and rebuilt production client returned2/2green (43.0/38.1seconds). Separate door regions for both machines have equal palette counts before and after SaveLoad. The pending consumer sensitivity boundary is now satisfied for this FullHD player scene; no all-angle or deployed-availability claim is made.


## Solo security/utility Blender alignment — 2026-10-02
The generic evaluated-source audit now accepts a source basename and authoritative width/height. Hydrated original models had negative footprint coordinates: security console X[-.88,.88],Y[-.485,.38] for2x1; utility panel X[-.55,.55],Y[-.485,.30] for1x1. Export-only transforms now fit security X[.12,1.88],Y[.0635,.842] and panel X[.06,.94],Y[.0635,.77]. Existing sources remain unchanged. The existing deterministic square exporter produced72poses per model at256px/4tiles=64pixels per tile and checked transparent borders. Root opened both30/40 renders. Actual worker/SaveLoad/pixel proof and repeated-export comparison remain pending.

Repeated144-frame export matches both manifests byte-for-byte: security a0d3ed3daf82ea98fd2372b9c2638edf6cc68898f77c6ddcdf2d3863445fcc51, utility f9f3496cfb75521bd7bf17e447566f0e1eb58aa70ea7fafaf935ebcd972ded4b. New integrity cases verify every PNG byte hash, hydrated source hashes,72poses each,256resolution/64pixels-per-tile and footprint-centred targets. Both pass; replacing the first security frame hash with zeroes makes1/2red; exact restoration returns2/2green. Existing26 registry/mapping cases also pass. These checks do not replace pending actual worker/SaveLoad consumer proof.

## Security console player baseline — 2026-10-02
Root's built production-client player flow passes2/2 (45.6/32.3seconds): Storage/Delivery worker capacity, fresh-page IndexedDB Load, Security Office real worker completion, exact object.security-console anchor21,6 and one approved security-office-basic command, then SaveLoad retaining the anchor. Root opened [the actual loaded FullHD scene](./security-loaded-fullhd.png): the authored console is visible inside the room. This is a baseline; palette/mutated-consumer acceptance remains pending, and Utility Room is not covered by this test.


## Utility panel player baseline — 2026-10-02
Actual built-client flow passes2/2 (42.2/28.4seconds): Storage/Delivery completed, fresh IndexedDB page Load, Utility Room real worker completion with object.utility-panel anchor22,6 and exact utility-room-basic command, SaveLoad retaining the anchor. Root opened [the loaded FullHD scene](./utility-loaded-fullhd.png). Panel geometry is visible, but the door partially obscures its front at this selected camera angle; a clearer angle and palette/mutated-consumer test remain required for final art acceptance. No production deployment is claimed.


## Security console visual acceptance completed — 2026-10-02
Both built-client stages pass with authored display palette RGB31/94/99 in a fixed console-only region, more than100pixels before and after Load and equal counts. Baseline43.2/33.2s. Substituting only object.security-console's production mapping with the existing generic desk produces red exactly on console display pixels (0), while real setup and construction pass. Exact byte restoration and rebuilt client return2/2green (43.9/34.9s). This supersedes the security baseline's pending visual-consumer boundary for this FullHD scene. Utility panel consumer sensitivity remains pending; no production deployment is claimed.


Utility Room readable-angle baseline passes2/2 (43.6/35.5seconds). Four real HUD Rotate camera right clicks turn the initial-45degree yaw to+15degrees before the construction capture. Load preserves the session camera pose, so the test no longer rotates again after Load. Root opened [the readable loaded view](./utility-readable-angle-fullhd.png): the front teal panel is exposed and the door is to its left. This corrects the test's viewing position, not source geometry or save policy. Palette assertions and production consumer mutation remain pending.


## Utility panel visual acceptance completed — 2026-10-02
Authored teal display pixels (RGB41/113/118) are sampled in a fixed panel-only region before and after SaveLoad, requiring more than100 pixels and identical counts. Baseline2/2green45.1/37.5seconds. Replacing only object.utility-panel's production mapping with the existing generic desk leaves setup/construction working but fails exactly on authored panel pixels (0). Exact source-byte restoration and a rebuilt production client return2/2green45.0/33.6seconds. Tools TypeScript passes. This completes consumer sensitivity for the readable FullHD scene, not all-angle coverage or deployment. Three authorized parallel agents now cover loading-dock Blender, FullHD HUD menu and room-template coverage; browser execution is serialized.

## Owner decisions and parallel integration — 2026-10-02
The owner explicitly approved through clickable decisions in this conversation:
- Optional simulation.roomTemplates.undone and completed save fields; older saves without them load empty lists.
- quarterTurns and objectOrientation values0..3; older absent values mean0. This authorizes the proposed save-format compatibility strategy for room-template rotation.
- Rectangular room minima accept either orientation (e.g.2x5 or5x2), retaining minimum tile count and other requirements.
These remove the three previously recorded owner-decision blockers. Implementation and actual acceptance of rotation are still pending; approval is not completion. Gameplay/persistence and UI/preview are assigned to separate agents; root integrates their results.
Integrated Layout Escape fix preserves armed Build in standard and angled FullHD200% views (baseline red, scoped fix green, production mutation red, exact restoration green). Mirrored and normal Delivery Bay pending/completed SaveLoad now check both worker projections; targeted producer mutation red and exact restoration45/45green. Loading dock now has actual construction/SaveLoad browser proof with anchors13,6 and21,6, authored glazing2522pixels before/afterLoad, consumer mapping mutation0red and exact rebuilt restoration2/2green. Hosted availability and exact-head CI remain unverified.

Root integrated validation at4df4429595: actual rebuilt production Layout Escape cases2/2green (world2.6s, angled5.3s;10.9s total). Delivery readiness + complete catalogue43/43green; tools TypeScript passes. Three agents now implement approved authoritative rotation/save/history, tool controls/preview and rendered object orientation on disjoint surfaces. None of those pending rotation changes is claimed complete or deployed.


Integrated rotation checkpointb51831047a joins authoritative orientation/save/history, UIcontrols/full occupied previews and corrected Blender facing. Root's combined run confirms179 actual history matrix/domain cases plus UI and renderer cases green; the generated inventory had CRLF-only checkout mismatch, regenerated through its existing tool and6/6green. Both TypeScript projects pass. Actual rotated model browser acceptance is in flight with the art agent; Template Escape capture and collision atomicity receive separate agents. PR1945 merged asd2293aa8d856 after exact-head green/CLEAN; serialmainCI36994796706 was confirmed live. #1962 records Layout Escape; PR1899 now reflects the three approvals and remains dependent/draft.


Actual integrated rotation acceptance atb51831047a: native90degree control submits quarterTurns1, real worker console anchor23,6 orientation1 andfrontdisplay1116pixels persist through SaveLoad. Deliberately reversing only production yaw composition leaves correct authoritative objects but displaypixels0red; byte-exact restore/rebuild2/2green43.6/35.6seconds. Root openedthecommittedFullHD loaded screenshot. 160-plan simulation matrix and four command-atomic collision cases complement this specific player/renderer scene; no all-angle or hosted-deployment claim. Evidence docs/research/2026-10-02-rotated-console-rendering/README.md.

## Bookshelf visual acceptance and current parallel work — 2026-10-02

The actual built-client Classroom flow now proves bookshelf anchor21,6 through worker construction and Save/Load, and174 authored spine pixels in the loaded scene. Baseline2/2green42.3/43.4seconds; substituting only its production mapping with the generic desk yields the intended0-pixel failure after successful bootstrap; byte-exact restoration/rebuild2/2green44.3/43.0seconds. Root opened the loaded1920x1080 screenshot. [Bookshelf evidence](../2026-10-01-oblique-bookshelf/README.md) records the tested angle and retained historical files. No hosted availability is claimed.

The approved rotation draft now states the implemented checkpoint and links actual runtime and rendered player evidence, keeping its earlier sink audit as historical. Three agents continue on independent surfaces: release/gameplay integration, FullHD ghost-label visibility and medical Blender source/export alignment. The separately based Layout Escape fix is pushed as PR1963; exact-head CI and serial main remain delivery gates. Local browser execution is serialized to limit CPU use.

## Verify input decision and medical integration — 2026-10-02

The owner explicitly approved the proposed verify-job hydration step for Blender sources and angled PNGs, including later models under the same two globs. [The exact proposal and approval](../2026-10-02-verify-art-hydration/README.md) preserve its scope. The source-byte/hash and PNG decoding assertions remain unchanged; fresh Ubuntu CI must confirm the full gate. Static CI/retry/partition checks pass58/58 after applying the patch.

Medical export40349455d2 is integrated as84bff0e11c: original Blender sources stay byte-identical, the cabinet export retains its9 authored meshes and omits11 foreign bed meshes, and both fixtures use the shared64pixels-per-tile camera with evaluated footprint bounds. Both repeated72-pose exports are byte-identical and scoped integrity checks pass. Actual worker-built Infirmary/SaveLoad pixel acceptance is in progress with the art agent. HUD quote text obstruction was disproved for tested FullHD100/200% scenes; regression and deliberate obstruction sensitivity are integrated as9d45d0588c without changing ghost production. Wheel PR1958 merged asf198f6d949 after exact-head green/CLEAN and prior serialmain green; new serialmainCI37000775751 was confirmed live before any subsequent merge.

## Medical player acceptance completed — 2026-10-02

The built-client Infirmary now has completed real-worker construction, Save/Load and independent bed/cabinet pixel acceptance. Baseline2/2green; removing both production art bindings keeps authoritative objects correct but fails all four palette assertions; exact byte restoration and rebuild return2/2green. Root opened the actual loaded Full HD image. The accepted spec joins the existing artifact gate, with complementary source-suite exclusion and a mutation-sensitive partition check. [Detailed acceptance](../../research/2026-10-02-infirmary-export-alignment/player-acceptance.md) records measured anchors and counts. The Blender build identifier is explicitly upstream, with the full pinned executable digest, rather than a nonexistent Lockstate commit citation. Three agents continue on dining-table Blender alignment, live native plan transformation and offline artwork loading. This remains local acceptance; exact release CI and hosted delivery are separate.

## Dependency refresh and live plan edits — 2026-10-02

Root merged the complete main-based dependency71e25921a6 into the integration branch as47c49256f3. Resolution preserves the newer room-aware art, square-wall cutaway, object orientation, middle drag and touch lifecycle; the updated wheel case retains renderer-switch coverage. Both TypeScript targets,203 targeted art/camera/square-wall/tint/documentation checks and the production build pass. The published branch contains the owner-approved verification hydration step. PR1898 and its serial-main delivery gate still require exact terminal CI; this preparation is not a production merge.

The actual live plan-edit regression is integrated: native controls retain the chosen world origin, complete fixtures/doors and quote, and the latest real-worker preflight verdict wins when an obsolete blocked response arrives later. Baselinegreen7.4s, revision-guard mutationred17.5s, exact rebuilt restorationgreen8.3s. [Evidence](../../research/2026-10-02-room-plan-live-orientation.md) distinguishes real worker replies from injected synthetic verdicts. The accepted case now joins the existing artifact gate with complementary source-suite exclusion. Agents next cover native catalogue Escape, saved mid-stride actor positions and aligned Canteen dining art.

## New bug fixes and retained Canteen art — 2026-10-02

Verified new Issues1964/1965 now have integrated corrections: paused Load projects authoritative saved sub-tile walk offsets without advancing time, and native catalogue Escape owns its key before world cancellation. Actor position baseline and progress mutation each fail in all four directions; restoration passes78 related cases. Catalogue baseline and propagation mutation fail at100/200% FullHD; exact rebuilt restoration passes2/2. Its accepted regression joins the existing artifact gate. Older saves retain the existing fallback; no save schema changes.

The existing dining table's62 authored meshes were extracted into a standalone Blender source and exported through the same64pixels-per-tile camera. Geometry lies inside3x2 in all four orientations,72 poses repeat byte-for-byte, and the existing canonical registry identity now consumes the aligned manifest. Root's targeted dining/registry/locomotion/preview checks pass24/24, alongside55 feed checks and both TypeScript targets. [Source/export record](../../research/2026-10-02-canteen-dining-table-alignment/README.md) preserves the prior authorship and mutation evidence. The art agent is completing actual normal/rotated worker construction, Save/Load and consumer mutation acceptance; this paragraph makes no completed player or deployment claim.

## Dining acceptance, input ownership and entrance history — 2026-10-02

The preceding dining acceptance boundary is now closed for the tested Full HD scenes. Real worker tables at21,6/24,6 (orientation0) and25,6/25,9 (orientation1) retain authored plate counts through Load:655/666 and643/635 respectively. Removing only the production dining binding fails eight before/after palette assertions while authoritative anchors remain correct; exact byte restoration and rebuild pass all three cases. Root opened both committed loaded screenshots. [Player acceptance](../../research/2026-10-02-canteen-dining-table-alignment/player-acceptance.md) retains an initial rotated timing failure alongside the later exact restored run, rather than claiming every attempt passed.

Issue1966 records a distinct native picker failure: a camera key released inside the operating system popup could resume map rotation after closing plans. Modal input ownership now discards excluded held codes. The actual artifact fails before the fix and under production mutation, then passes after exact restoration; focused input and documentation checks are green. The dining and native picker cases join the existing artifact gate with complementary source-suite exclusions, retaining its one worker and timeouts.

The #1672 entrance-history fix is integrated: after Undo and later furniture, a fresh plan refuses a blocked exterior approach before adding any orders or spending money. Root confirms24 related history/placement cases and TypeScript green. Full reversibility and the existing later-edit Redo policy remain unchanged. Two ADR0116 fragments now sit beside their own source anchors, correcting the reproduced LF-only Ubuntu failure without changing the guard or quotation budget. These are local integration results; exact-head CI and serial-main gates still precede production delivery.

Local cleanup removed four confirmed redundant scratch files after backup-hash and persisted GitHub checkpoint verification. Production mapping bytes stayed unchanged; needed sources, evidence, worktrees, dependencies and live process files were preserved. Three agents continue with authored shower graphics, native View input ownership and template collision/atomicity.

Aligned handwash and shower exports are now integrated. The sink keeps its original Blender bytes and all17 meshes; the shower extracts the existing43 authored meshes, including21 nozzles, while preserving the original catalogue. Both use the independently verified64pixels-per-tile shared camera, fit their occupied1x1 tile in all four rotations, and repeat72 frames byte-for-byte. Root opened both actual exported frames and confirms201 combined registry/integrity/entrance/documentation cases green. [Sink evidence](../../research/2026-10-02-handwash-sink-alignment/README.md) explicitly preserves its deliberate no-buildable boundary; [shower evidence](../../research/2026-10-02-shower-head-alignment/README.md) still requires actual normal/rotated construction and Load, now in progress. Legacy entrance edge rejection for #1661 is integrated; its separate outside-square-wall boundary is being investigated through actual commands before accepting that broader claim.

