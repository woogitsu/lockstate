# Dedicated medical bed physical detail

2026-10-03. Isolated base `da685c52902e2a1318594017cf90a35b689005bc`, branch `codex/medical-bed-angled-detail-20261003`. No browser started.

## Existing source and genuine consumer

Existing `medical-bed-wooden` builds `object.medical-bed` (numeric 2), authoritative footprint 1 x 2, sleep-surface/medical-treatment capabilities. Its default consumer is `furniture.medical-bed.variants`; the actual Infirmary plan places it at local (1,1) beside the medicine cabinet. No gameplay identity, material palette or template changes belong here. The cabinet and Office Desk already integrated in this base stay untouched.

Original `assets/source/blender/furniture.medical-bed.variants.blend`, SHA256 `1737b03a3ee1342e813e7096e0aef189f05d714d5a69437a8fe490c026d232be`, has eleven selected meshes and four materials. All 594 evaluated faces are outward. Independent actual Blender audit includes bevel modifiers, object matrices and inverse-transpose normal transforms ([source-audit.json](source-audit.json)). Its source bounds are `[-.460000008,-.910000026,-.090000004]` to `[.460000008,.910000026,1.259999990]`. Existing rigid grounding +.090000004 and min-corner anchor produce `[.039999992,.089999974,0]` to `[.960000038,1.910000086,1.350000024]`. All four orientations fit and the existing 64 pixels per tile camera target `[.5,1,.675]` is valid. This is physical refinement of a correct source, not an alignment or inward-normal repair.

Earlier branches `codex/medical-bed-top-refine-2026-09-25` (764e5407b6e988f552ea93062cd33b88af78f5ab) and `codex/medical-bed-mark-2026-09-26` (dd9c951367312937cbb81d69ae0cc10855622790) contain the historical environment catalogue, not a competing dedicated standalone eleven-part source. The original source's current authorship commit is `7b7ecd26e371c8037981aede112c815de36aabb1`.

## Actual dedicated source

New `assets/source/blender/furniture.medical-bed.angled-detail.blend`, SHA256 `d18a702e585d6e69f15602d9e9f294bc0c539da3f78bf4f48fe1330da286c4fe`, retains all eleven original parts. Raw vertex/topology/polygon material-index bytes, material slots, all four complete material values/graphs and writable scalar-array modifier values are unchanged. Only the previously accepted uniform rigid grounding translation is baked into the new source; relative assembly positions stay intact. Original blend bytes are unchanged. Retained evaluated geometry maximum rigid-translation error is `1.1920928955078125e-07`.

Sixty-five additional real meshes model four caster wheels/hub caps/forks/brake treads/linkages, two side safety rails with washable grips/posts/pivot mounts, twin scissor links and bearing tracks, cross shafts and a lift actuator, plus a control backing plate/fasteners/raised buttons. All use only the original four materials. There are 76 meshes and 7776 evaluated polygons, all outward. Full retained and added raw geometry/material/modifier identities are recorded in the dedicated provenance; a separate auditor reopens both actual sources without importing the model guard.

The added side hardware expands XY only, still within the authoritative 1 x 2 rectangle: centered grounded bounds `[-.489000022,-.910000026,0]` to `[.489000022,.910000026,1.350000024]`; min-corner loaded bounds `[.010999978,.089999974,0]` to `[.989000022,1.910000086,1.350000024]`. Unit fit and measured target `[.5,1,.675000011920929]` retain the accepted silhouette height and 64 pixels per tile. All four rotations fit.

[Actual original/refined source comparison](medical-bed-source-detail-comparison.png) was opened at original resolution at four real camera yaws. The wheels, side rails and scissor mechanism are visible alongside the retained linen/end panels. This is authored source inspection, not native player acceptance.

Two genuine winding controls reverse only the retained bed-base faces, preserving raw vertex bytes: one producer control before saving, one loaded-source control after hash preflight. Both fail actual evaluated outward normals; byte-exact script restoration passes native verification. Neither original nor dedicated source file changes ([winding-controls.json](winding-controls.json)). The wrapper already verifies actual source/material/raw identities, grounded four-orientation geometry and all 72 camera vectors/span.

## Remaining scoped work

Canonical 72 pose export/repeat, only the approved medical-bed MODELS tuple/bed-only guard dispatch, actual producer/decoded-PNG controls, focused checks and a genuine q0/q1 Infirmary worker/SaveLoad fixture follow. Medicine Cabinet dispatch/source and all shared functions remain untouched. Native pixels and consumer-removal acceptance are queued for the parent; no hosted completion is claimed.

## Canonical export and real negative controls

All 72 poses and the descriptor repeat byte-for-byte (73/73 files). Descriptor SHA256 is `ba270bbadd9f4f821f7a0748c2bddc9c23b7e85d494935b3fb317ffc75dc265a`. Every 256 x 256 frame was independently decoded; minimum transparent margin is 53 pixels. The [all 72 pose sheet](all72-pose-contact-sheet.png) was opened at original resolution; the original linens/end panels remain readable, with visible caster and lifting detail at lower elevations. [export-repeat-and-borders.json](export-repeat-and-borders.json) records every actual frame hash/bounds. Only the previous 72 same-bed frame references were retired.

Production integration changes only the medical-bed tuple and bed-only guard dispatch in `render-medical-oblique.py`. Medicine Cabinet tuple/dispatch, shared functions and default callbacks remain unchanged. `--verify-bed` uses the actual common production dispatch without opening or rendering the cabinet. Three actual dispatch controls (old source, wrong Y fit and wrong target) fail; byte-exact common-wrapper restoration returns native verify 0 ([medical-dispatch-controls.json](medical-dispatch-controls.json)).

Eleven actual dedicated loaded-source/camera controls fail: omitted caster, moved safety rail, moved original control, changed original bevel/material graph, changed wheel material, wrong scale/target/canonical descriptor/camera span/camera vector. Script exact restoration returns native verify 0 and both original/dedicated blends stay byte-identical ([producer-controls.json](producer-controls.json)). Together with the two genuine reversed-winding controls this proves actual authored data and geometric normal enforcement.

A real opaque pixel was placed on the image edge, with the actual referenced PNG SHA and filename updated consistently. Hash, filename, signature and dimensions passed; the independently decoded transparent border assertion failed. A separate canonical target mutation also fails. PNG/descriptor byte-exact restoration returns unit exit 0 ([decoded-consumer-controls.json](decoded-consumer-controls.json)). No border or hash assertion was weakened.

Focused dedicated/medical/pipeline contracts pass 7 tests across 3 suites, with the generic live pipeline case skipped when Blender is absent from runner PATH. Direct pinned native source/camera/export checks above executed explicitly. App and tools TypeScript exit 0. Genuine q0/q1 worker Build/SaveLoad, native physical-detail inspection and mapping-negative acceptance remain queued; no browser was launched.

## Prepared genuine native fixture - not run

`tests/browser/dedicated-medical-bed-player-build.spec.ts` prepares three serial native cases: actual Storage Room/Delivery Bay capacity and IndexedDB save, then genuine Infirmary q0 and q1 worker completion. The fixture keeps both actual bed/cabinet objects present. It verifies the bed's literal placed ID (`object:21:6` / `object:23:6`), authoritative anchors/orientation, uniquely resolved completed `medical-bed-wooden` source order `room-template-000000000002-2-object-000`, matching location/orientation, and paused whole worker data equality through real Save/Load. It does not inject completed state or shorten the construction route. Failed runs preserve actual snapshot/FullHD output.

The historical accepted q0 bed region `(705,425,170,175)`, RGB79,102,108 and >100 threshold remain unchanged. q1 is explicitly provisional: estimated region `(830,350,200,200)`, RGB89,113,120 from the actual new yaw30/elevation40 source PNG, >100 threshold. This source-derived colour is preparation, not native calibration. The parent must open completed/loaded native images, preserve any provisional failure and isolate the actual consumed pose before accepting it. A separate six-click genuine camera view captures the loaded caster/rail/lift geometry. Missing-default-consumer q0/q1 negatives and exact restoration are still required before acceptance.

App and tools TypeScript pass. A direct production build exits 0 with worker `worker-CkJCK9IC.js`, 438431 bytes, SHA256 `ec3ab3962b29af941f5f20213c9da3e06b4c984092c4b5d6e8ba79799324db2b`. [prepared-build-receipt.json](prepared-build-receipt.json) records actual source/descriptor identities and `nativeBrowserStarted: false`. No artifact matcher/config or browser process was added. This is a compiled pending fixture, not native or hosted acceptance.
