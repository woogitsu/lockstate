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
