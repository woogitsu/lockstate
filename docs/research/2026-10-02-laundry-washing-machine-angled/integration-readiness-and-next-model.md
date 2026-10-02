# Laundry readiness and next existing model — 2026-10-02

## Exact read boundaries

The published model inventory was read at `4f0ad8a7865504172fdfc416cce0440743b2fb78` (`codex/integrate-kitchen-prep-20261002`). The older full-room integration branch is still `3eeeddc2d276714fee6a7c8420270b78d2e49b3c`; it is not used as the current kitchen inventory. Pending dedicated washing work is frozen separately at `e2d1f3274026311d907f7961bf9ffbfb9ae50bc6`. No root checkout or source/export files were edited during this audit.

The machine-readable [inventory](model-inventory.json) records all21 defined object IDs, their authoritative dimensions, exact buildable IDs, default asset IDs, canonical descriptor/source paths and digests, frame counts, camera targets and evidence paths. Exactly20 have actual construction entries; `object.sink` does not. All default catalogs already have72poses. There is no wholly missing buildable manifest to invent. Three published kitchen models have dedicated `.angled.blend` physical-detail sources; the fourth dedicated source is the pending washing model on this branch. A filename suffix is not a completeness criterion: retained source models and separately authored contextual variants can already contain adequate physical geometry.

### Recorded native evidence inventory

These are committed historical records read for scope, not browser tests rerun in this audit. A scoped research receipt not found here does not prove the route was never executed. Existing synthetic preset screenshots are not counted as worker/player acceptance.

| Existing buildable | Object / footprint | Recorded native evidence |
| --- | --- | --- |
| bed-wooden | object.bed /1x2 | Cell cot: worker+SaveLoad, q0, consumer negative |
| medical-bed-wooden | object.medical-bed /1x2 | Infirmary paired fixture: q0, independent palettes, consumer negative |
| toilet-brick | object.toilet /1x1 | Dense retained Cell toilet: q0, worker+SaveLoad, consumer negative |
| shower-head-brick | object.shower-head /1x1 | Shower Room q0/q1, worker+SaveLoad, consumer negative |
| washing-machine-brick | object.washing-machine /2x1 | Dedicated source/export verified; new model native q0/q1 pending |
| desk-wooden | object.desk /2x1 | Generic Reception q0/q1, worker+SaveLoad, consumer negative |
| chair-wooden | object.chair /1x1 | Individual q0 and genuine rotated Reception q1, SaveLoad, consumer negative |
| stove-brick | object.stove /2x1 | Dedicated Kitchen q0/q1, worker+SaveLoad, consumer negative |
| prep-counter-brick | object.prep-counter /2x1 | Dedicated Kitchen q0/q1, worker+SaveLoad, consumer negative |
| fridge-brick | object.fridge /1x1 | Dedicated Kitchen q0/q1, worker+SaveLoad, consumer negative |
| dining-table-wooden | object.dining-table /3x2 | Canteen q0/q1, worker+SaveLoad, consumer negative |
| bench-wooden | object.bench /2x1 | Default Holding Cell q0/q1, worker+SaveLoad, consumer negative |
| bookshelf-wooden | object.bookshelf /2x1 | Native player spec present; no scoped receipt located in this research census |
| medicine-cabinet-wooden | object.medicine-cabinet /1x1 | Infirmary q0, standalone cabinet consumer, independent negative |
| security-console-brick | object.security-console /2x1 | Rotated Security Office q1, worker+SaveLoad, actual yaw-sign negative |
| storage-rack-wooden | object.storage-rack /1x1 | Default individual q0; rotated Storage Room then legitimate Unzone q1; SaveLoad/negative |
| loading-dock-door-wooden | object.loading-dock-door /3x1 | Native player spec present; no scoped receipt located in this research census |
| waste-bin-brick | object.waste-bin /1x1 | Yard variant has native individual placement/SaveLoad/consumer negative; default indoor source is separate |
| utility-panel-brick | object.utility-panel /1x1 | Native player spec present; no scoped receipt located in this research census |
| exercise-station | object.exercise-station /2x1 | Actual individual Yard placement, worker+SaveLoad, consumer negative |
| none | object.sink /1x1 | Deliberate no-buildable boundary; retained source/export audit only |

Six accepted contextual model rows are enumerated separately in JSON: Yard bench and bin, Common Room bench, Classroom chair, Storage Room rack and Staff Room desk. Their selectors and authored sources remain preserved. Their evidence is not substituted for a default-model consumer.

## Laundry three-case consumer readiness

Actual capacity uses `storage-room-basic` at(5,5) and `delivery-bay-basic` at(12,5): two contextual `furniture.storage-room.timber-rack` consumers and one default `utility.loading-dock-door.variants`. Their canonical descriptors are `/game-content/oblique-furniture.storage-room-rack.v1.json` and `/game-content/oblique-utility.loading-dock-door.v1.json`. The actual `laundry-basic` at(20,5) contains exactly two `washing-machine-brick` entries, both consuming `utility.washing-machine.variants` through the existing `/game-content/oblique-utility.washing-machine.v1.json`. All three fixture types retain registered72pose catalogs. Structural walls/regular doors remain the inherited production consumers; none is manually inserted by this fixture.

The pending descriptor requires source `assets/source/blender/utility.washing-machine.angled.blend`, digest `f2940130e2ec10ad814800bb15418441b48238881c3d038d69168d597f89e8ae`, measured target `[1,.5,.7825000286102295]` and actual64pixels-per-tile. Its manifest hash is `2c44d5a2c6f0b2497b4d3ad99c2da3de05a2bc2933bc1fb9295adb4d95cb5a32`. The own exporter checks its canonical output against the actual runtime registry; the repeat collector rejects the old source identity before reading frames.

Code review of `dedicated-laundry-washing-machine-player-build.spec.ts` confirms:

- capacity commands are exactly the two native room-plan requests, followed by real queue completion and actual IndexedDB `storageState({indexedDB:true})`;
- each later case begins in a fresh context loaded from that save, selects the native clockwise rotation control and emits exactly one Laundry plan command; q0 omits `quarterTurns`, q1 supplies1;
- authoritative completed anchors must be(21,6),(23,6),orientation0 or(24,6),(24,8),orientation1, matching the actual6x6 plan and2x1 object rectangles;
- the snapshot probe only sends `simulation/request-snapshot` for consistency reads; it never inserts objects, completion, materials, orientation or saved JSON;
- all orders must advance under the inherited10second progress guard to zero; the room count must become3;
- real Save now/Load must preserve both worker anchors/orientations and paused native pixel counts; each case retains separate completion/load screenshots and JSON observations;
- the pending palette regions are provisional source-derived candidates, not claimed calibrated acceptance. Soft pixel assertions preserve Load diagnostics while still making the case fail;
- the default-consumer-only negative removes precisely the existing washing mapping row, rebuilds production, compares whole simulation-worker bytes and repeats both real routes; finally restores exact mapping/source bytes and runs the original cases. No construction/state mutation is used.

Offline production build and three-case listing pass. No browser or preview server was launched. Native raw snapshots and pixels therefore remain pending, not inferred from this code review.

## Proposed next scoped model: default indoor waste bin

This is a measured source/export calibration gap for an already consumed object. `waste-bin-brick` constructs `object.waste-bin` (numeric19), capability `waste-disposal`, authoritative1x1. `garbage-room-basic` places it twice. Default selector is `fixture.cell.waste_bin`; accepted Yard selector is the different `fixture.yard.steel-waste-bin` and stays untouched.

The existing standalone source `assets/source/blender/fixture.cell.waste_bin.blend` is already authored with a cylindrical body, shoulder, base, neck, lid, knob, hinge, foot pedal and label. Read-only native Blender audit:12meshes, five original materials, SHA256 `acac99dd51895f561f0b25b1e7453c0290141ed6c7953f123575b2cb8bb95963`, source bytes unchanged. Evaluated bounds X[-.349999994,.349999994],Y[-.430000007,.544999957],Z[0,.934000015]; full names/materials/evaluated-vertex receipt is [next-bin-source-audit.json](next-bin-source-audit.json).

Actual `render-waste-bin-oblique.py` has128pixel frames and orthographic span1.55, giving **82.5806451613pixels-per-tile**, while its descriptor declares64. Its camera is positioned around XY(0,0) with yaw0 on +X; the descriptor declares target `[.5,.5,.4]`, and the shared square pipeline's yaw0 world basis is−Y. The difference in camera centers alone is not claimed as a proven native offset: source-centered exports can compensate through their runtime pivot/target. The actual scale equation and yaw convention need explicit correction and independent native checks. All72 existing poses do not establish the advertised calibration.

Rigid source translation by(.5,.442500025,0), with no XY scale, fits all existing evaluated vertices inside1x1: X[.150000006,.849999994],Y[.012500018,.987499982],Z[0,.934000015]. Thus the original assembly can be retained without stretching; target height can be measured at.4670000075. These are proposed preparations, not applied changes or native acceptance.

Proposed lease after washing acceptance: own retained-source extraction/refinement and standalone shared-camera wrapper, dedicated source/provenance, existing default-bin descriptor and72referenced frames only. Preserve all12 original meshes/five materials; add only useful physical lid hinge, pedal linkage, rolled rim/seam or fastener detail inside the measured square when source inspection establishes a genuine detail gap. Preserve identity, palette, gameplay, registry and all contextual models. First prove native bounds/all4orientation/camera-vector/nominalscale guards, real producer omissions/camera mutations and deterministic byte repeat. Then actual Garbage Room worker construction q0/q1, independent bin pixels, SaveLoad and default-consumer-only negative with exact restoration, under original limits. No source or export edits have begun for this proposal.
