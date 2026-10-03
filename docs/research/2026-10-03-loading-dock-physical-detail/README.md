# Retained Loading Dock Door physical detail

2026-10-03. Own branch `codex/loading-dock-angled-detail-20261003`, isolated base `70fef87534e748def564e223152259653e916c74`. No browser or server started.

## Actual next-model selection

The existing Canteen table already has 62 real retained meshes: walnut planks, a bolted steel frame, fixed stools, trays, plates and utensils, plus accepted original q0/q1 player evidence. Kitchen sink is not a new genuinely buildable fixture in the current catalogue. Neither is duplicated for another batch. The concrete next source gap is the actual Loading Dock Door.

Existing `loading-dock-door-wooden` builds `object.loading-dock-door` (numeric 18), footprint 3 x 1, delivery-access capability. Default consumer remains `utility.loading-dock-door.variants`. The actual `delivery-bay-basic` 6 x 6 plan places it at local (1,1). The earlier branch `codex/loading-dock-door-art-2026-09-23` (74316348578dd36151d7bd2c20c801e03d360de2) contains the historical environment catalogue; the current standalone seven-part source is preserved separately.

## Original actual source audit

Original `assets/source/blender/utility.loading-dock-door.variants.blend` SHA256 `9a8b5cd29ed5809ec1c3f2c6f36f3d97d3a9a7f69551c0743e096591c26908c4` contains door/handle/header/two hinges/threshold/window. Four existing materials are amber status, control panel, monitor glass and warm charcoal. All 42 raw faces and 378 evaluated faces are genuinely inward. Independent centroid-normal auditing applies actual inverse-transpose object normal transforms and bevel modifiers ([source-audit.json](source-audit.json)). All seven original parts are convex boxes, so this solid-center audit is applicable.

Original source bounds `[-.949999988,-.219999999,0]` to `[.949999988,.170000002,1.779999971]` already fit the accepted X scale 1.5 and min-corner translation `(1.5,.5,0)`: loaded `[.075000048,.280000001,0]` to `[2.924999952,.670000017,1.779999971]`. Target `[1.5,.5,.89]`, shared 64 pixels per tile and all four footprint orientations are valid. This is actual inward topology correction and physical detail, not an alignment defect.

## Approved dedicated source

New `assets/source/blender/utility.loading-dock-door.angled-detail.blend`, SHA256 `7eeca158b9e5f92abb139ab8164f5dd7a2aa2f2ca47936e4b08e4ea6c79a3aac`, keeps the original seven raw vertex/material-index bytes, complete material graphs, object matrices and writable scalar-array modifier values. Every original polygon order is deliberately reversed; unchanged raw topology is not claimed. Bidirectional evaluated point-set maximum error is `1.1920928955078125e-07`. The original blend bytes stay unchanged.

Fifty-seven actual additional meshes form four window glazing stops/eight fasteners, six hinge knuckles with twelve leaves and twelve bolts, two pull backing plates/four bolts, a latch backing plate/escutcheon/barrel and four threshold ribs/two fixings. All use only the original four materials. There are 64 meshes and 7128 evaluated faces, all outward. Full retained before/corrected and all authored raw topology/material/modifier identities are recorded in the new provenance.

New source bounds `[-.949999988,-.219999999,0]` to `[.949999988,.200000003,1.779999971]` add rear hinge depth within the same 3 x 1 occupied rectangle. Accepted X fit 1.5 and target `[1.5,.5,.89]` remain unchanged. The original body/glass/amber bars and proportions are retained. The [actual four-yaw comparison](loading-dock-source-detail-comparison.png) was opened at original resolution: corrected solid edge shading and real glazing/hinge/grip/latch hardware are visible. This is source inspection, not player acceptance.

Two real winding controls reverse only retained door faces and confirm raw vertex bytes unchanged: producer-only before save, and loaded-only after source hash preflight. Both fail actual evaluated outward normals. Byte-exact builder/wrapper restoration returns native verification 0; both blends stay byte-identical ([winding-controls.json](winding-controls.json)). The dedicated guard verifies every actual authored raw/evaluated/material identity, all four fitted rectangles and all 72 camera vectors/span. An initial scratch script adaptation used a mismatched selector before creating any production script; its harness failure remains in ignored raw output and is not counted as a model failure.

## Remaining scoped work

Canonical 72 pose repeat, only the existing standalone Loading Dock exporter tuple/early guard dispatch, additional actual producer/decoded-PNG controls and focused checks follow. Shared exporter functions, all other models, native routing, gameplay/schema/copy and workflows stay unchanged. New-source actual Build/SaveLoad pixels are parent-owned queued acceptance; no native or hosted completion is claimed.

## Canonical export, production dispatch and negative controls

The dedicated export repeats all 72 PNGs and the canonical descriptor byte-for-byte (73/73). A separate full run through the original production entry point `render-loading-dock-door.py` also matches all 73 baseline files. Descriptor SHA256 is `c747970e23e5c738571c5ba396f6db2dd29a16600647652d0e46929eee83fc2f`. Every actual frame was independently decoded, minimum transparent margin 21 pixels ([export-repeat-and-borders.json](export-repeat-and-borders.json)). The [all 72 pose sheet](all72-pose-contact-sheet.png) was opened at original resolution. Only the old 72 same-gate frame references were retired.

The standalone production wrapper changes only its Loading Dock source tuple and early dedicated source/camera guard dispatch; its original fallback geometry check remains intact. `--verify` now exercises all 72 actual guarded camera poses and all four occupied orientations. Shared exporter functions and other model tuples remain unchanged. Three real original-entry-point controls (old inward source, wrong Y fit, wrong target) fail; byte-exact restoration returns native verify 0 ([dock-dispatch-controls.json](dock-dispatch-controls.json)).

Eleven actual dedicated controls fail: omitted latch, moved glazing stop, moved retained handle, changed original bevel/material graph, changed authored latch material, wrong scale/target/canonical descriptor/camera span/camera vector. Byte-exact restoration returns native verify 0; both source files stay byte-identical ([producer-controls.json](producer-controls.json)). Together with the two winding controls this is 16 actual source/dispatch failures followed by exact restoration.

A real opaque PNG edge pixel was published under its correct updated content-hash filename and referenced SHA. Signature, dimensions, hash and filename passed, while the decoded border assertion failed. A separate actual canonical target mutation also fails; descriptor/PNG exact restoration passes ([decoded-consumer-controls.json](decoded-consumer-controls.json)). An initial scratch test selector accidentally repeated the word detail and selected no test file. That raw harness result is retained separately and does not count as either consumer control; the corrected actual test runs produce the two semantic failures above. No thresholds or guards were weakened.

Three focused dedicated/default/pipeline suites pass 6 tests with one generic live Blender case skipped when Blender is absent from runner PATH. Explicit pinned native source/export/camera checks executed independently above. App and tools TypeScript exit 0. No native routing, browser/server process or workflow changes belong to this model checkpoint. New-source genuine player Build/SaveLoad, q0/q1 physical inspection and consumer-removal acceptance remain queued for the parent.
