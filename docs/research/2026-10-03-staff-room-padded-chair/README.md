# Staff Room padded chair: retained functional seating

## Actual source checkpoint

Verified by Blender 5.2.1 LTS (one process/thread1). Actual `staff-room-basic` 6?6 template keeps employee Desk (1,1) and Chairs (1,2), (3,3). Current room selector uses default wooden-chair for these chairs; this is a missing dedicated staff-seating presentation, not a claim existing geometry is broken.

Source: `assets/source/blender/furniture.staff-room.padded-chair.blend`, SHA256 `47004797588d92173e4140bc307ac3db73ed322ac2e1d2472f99c10475956109`. Original current wooden chair `acd0e9decb3bb451b44e8354e797fb5656825f4748bbed832bab61659f06cd88` remains byte exact. All 52 original parts, four complete stored graphs and evaluated positions retained; 54 total meshes after two substantial connected charcoal seat/back pads. Full original bounds unchanged: `{'min': [-0.3859996795654297, -0.485249400138855, 0.0], 'max': [0.3859996795654297, 0.4852507412433624, 1.3200000524520874]}`. 1?1, 64 pixels/tile, original target `[.5,.5,.6600000262260437]`. Charcoal uses the existing `shade` graph; no new material/palette.

Three evaluated triangle-interior contacts are recorded in provenance. Seat?original wooden seat witness `[0.0, 0.09000000357627869, 0.6050000190734863]`; back?walnut rail and dark inset independently witnessed. Original timber perimeter and fixings stay visible.

Actual saved `.blend` seat-pad +1Z mutation fails the physical contact guard before source SHA/raw guards (RED exit1); exact source bytes restored, real producer GREEN exit0. Actual producer ASSET_ID?default-chair mutation fails dispatch (RED1); exact producer restoration GREEN0. Seven protected source/producer/registry/context files match before/after hashes. Reproduce: `python tooling/verify-staff-room-chair-proof.py --source-only`. Receipts/logs are in this directory.

## Completed canonical exports and runtime context

Actual serial Blender 5.2.1/thread1 rendered **all72** canonical poses (12 yaws0..330 by30, elevations20..70 by10), resolution256?256, pivot128?128, ortho4,64pixels/tile, target unchanged. Dedicated descriptor: `/game-content/oblique-furniture-staff-room-padded-chair.v1.json`, canonical LF SHA256 `718fda5f4874146a71622a4db9814950acd845fa79aad85c8f935d56f42814c0`. Every real PNG body hash/path, decoded RGBA and transparent border verified by producer and typed tests. Four bounded repeats (30/120/210/300,e40) match complete matrix bytes; no second72 render.

Actual four exported sides were opened, compared to the retained original at the same poses, and measured in [comparison](./actual-four-view-comparison.json). Full pads are readable from front/side; rear timber/steel construction stays visible with natural back-pad occlusion. Semantic retention comes from complete raw/evaluated mesh/graph contracts, rather than claiming every original part must remain pixel-visible through occlusion. No added palette or new cloth shader.

Runtime adds one descriptor registry entry and one `room.staff-room/object.chair` field. Default wooden chair, Classroom student-chair, Reception waiting-armchair and Staff employee Desk remain selected in their own contexts. Existing Classroom/Reception negative rows now correctly expect the new Staff presentation while retaining all former controls. Neither20publictemplates/18roomdefinitions nor collision/price/save/worker/protocol/HUD/renderer changed.

Current typed `createRoomTemplateBuildPlan('staff-room-basic',origin4,4,sequence2,q0/q1)` proves literal owner suffix001/002 and anchors: q0 `(5,6),(7,7)`; q1 `(7,5),(6,7)`, orientation0/1 respectively. Completed room interior `(5,5,4,4)` and all three retained fixtures preserved. Runtime projection at world60/e40,q0 and world?30/e40,q1 demands the exact same local source60/e40 frame:

`/assets/environment/oblique/furniture.staff-room.padded-chair-yaw+60-elev40.3d0fd0a02317.png`

SHA256 `3d0fd0a023174ec0a0fa897f33a57d1e07630a5201ec093f394a65634e399646`.

Actual initial old/default context:4RED/4GREEN. Actual final context omission:3RED/5GREEN?exact restoration8GREEN. Actual registry omission:1RED/7GREEN?exact restoration8GREEN. Whole occupied-footprint/outside/cross-room and planned/building default controls remain. [Repeatable consumer proof](../../../tooling/verify-staff-room-chair-consumer-proof.py).

Actual valid256RGBA PNG negative painted `(0,0)=(120,90,60,255)`, with descriptor/filename/body hashes all recalculated; production decoder rejected its clipped border (RED1), then exact descriptor/frame restoration GREEN0. Saved-source physical and dispatch controls also repeated. **80 protected files** byte exact before/after; [production receipt](./actual-production-controls.json), [consumer receipt](./actual-consumer-controls.json). Reproduce `python tooling/verify-staff-room-chair-proof.py`; no historical PNGs claimed as new output.

Final scoped gates: **32 passed/one skipped across six suites**, strict application/browser/tooling TypeScript GREEN. Generic live determinism test skipped because its default Blender command is absent from PATH; direct genuine Blender source/72/negative/repeat proofs above were actually run.

## Pending native boundary

No browser/server/build/fullverify/native acceptance ran in this lane. Root will accept actual network descriptor/PNG/decoded body and calibrate each paid chair in the running game. The existing `tests/browser/wooden-chair-player-build.spec.ts` route has real capacity bootstrap and Staff6?6q0/q1SaveLoad owners at origin20,5. Its legacy timber RGB/ROI calibration measures the old wooden chair and must not be presented as validation of these new charcoal pads; no new threshold/ROI was guessed here. Whole paused snapshots, original budgets/actions and owner rules remain. [Durable plan](./PLAN.md).

Actual new source60/e40 preview:

![Actual Blender Staff Room padded chair](../../../public/assets/environment/oblique/furniture.staff-room.padded-chair-yaw+60-elev40.3d0fd0a02317.png)
