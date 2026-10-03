# Laundry retained Cycles handoff

Base: published root `8aed964b8319ca9a24d521a5a131073abe2c209a`.
Own branch: `codex/laundry-retained-cycles-production-20261003`.

## Ordered source chain

Imported inspected draft:
1. `2fe0370d45` (equivalent `ebeaa96988564ebf5cceed83f67590b92a5bac2c`).
2. `6ca3dc459f` (equivalent `d08beae7f99cde569102a40e281b34a065887e1b`).
3. `bbf4ab97fc` (equivalent `b4b8d6cd496a937e02e3227a71596790fc7435c0`).
Then production:
4. `3460f83282a732e16737caeef21b2d3525d96e85` saved source and true source producer guards.
5. `ffff26eae78aa000f3aefe3a35734133e7c44a1d` genuine 72 and typed consumer RED?GREEN.
6. Final proof/pins commit follows these.

If root already imported original draft three, skip equivalent imported commits and pick only production three. Each canonical research row may conflict with concurrent root rows: retain every existing row; insert this own new row inside the first continuous three-column table. No root document was rewritten.

## Exact consumed source and bodies

Accepted existing asset ID remains `furniture.laundry.linen-rack`; existing `room.laundry/object.storage-rack` selector and single registry URL remain unchanged. The actual live descriptor switches its source and all 72 frame bodies. No alias/format/runtime mapping changes required.

- Source: `assets/source/blender/furniture.laundry.linen-rack.soft-light.blend`.
- Source SHA256: `2916717c4dd17d7be39a5725858b2356e53181cb735f2faeb28963d0adafa299`.
- Descriptor: `/game-content/oblique-furniture-laundry-linen-rack.v1.json`.
- Descriptor LF canonical-text SHA256: `92928c0b7ce2e9d18959940fd0f70509ab0e09d3a2816bf4bc8a55d9fcc3eb14` (raw deployment newline SHA recorded independently by observer).
- Source 60/e40 image: `/assets/environment/oblique/furniture.laundry.linen-rack-yaw+60-elev40.65f80634dc02.png`.
- Source 60/e40 SHA256: `65f80634dc026fa83c95fcf81ee40e539f0f947ab8dc0b03f0c0eb377b883716`.
- Source 300/e40 SHA256: `786c3ef1acf85395eafbcda450120e41e9338c232a64d4a05015960878a4423e`.

Old authored `.blend` SHA `779d11f79c28b8049ccd3371d840c75b52cd153439f3882e28c593d05dd964ec` and every old Workbench72 remain intact. Old descriptor archived at `assets/source/blender/furniture.laundry.linen-rack.workbench-descriptor.v1.json`. Its old standalone Workbench producer remains intact for historical source inspection; current production command is the new Laundry-only Cycles entry point below.

## Actual reproducible pipeline

Windows exact invocation:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --threads 1 --python-exit-code 1 --python tooling/blender/render-laundry-linen-rack-cycles.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --threads 1 --python-exit-code 1 --python tooling/blender/render-laundry-linen-rack-cycles.py -- --repeat-four
& 'C:/Users/matma/AppData/Local/Programs/Python/Python314/python.exe' tooling/verify-laundry-cycles-production.py
```

Actual matrix: Blender 5.2.1 LTS, Cycles CPU, thread1,64 samples,seed0,adaptive off,denoising off,AgX/None/exposure0/gamma1; 84.8933703seconds. Four independent actual renders total 4.9987663seconds, each normalized PNG byte exact. Deterministic transparent RGBA256, orthographic4 tiles,64px/tile,pivot128; camera target(.5,.5,.7039999961853027). Source already stores the existing min-corner translation(.5,.5,0), so new producer does not translate it again. No floor plane: soft self-shadowing only.

Saved `.blend` panel displaced one tile genuinely fails triangle-contact guard before source hash. Producer asset dispatch mutation fails. Valid256 RGBA bad-border PNG has recomputed CRC/body SHA/path/descriptor and fails decoded silhouette guard. Old Workbench descriptor, omitted registry entry and omitted actual Laundry context each fail real q0/q1 typed consumer expectations; exact restore returns GREEN. 232 model/history/palette/registry/context files byte exact after all controls. Three prior draft saved-source controls (physical contact/light omission/camera) retained; no duplicate full72 run.

Actual final source checks: seven suites,19 PASS/1 optional generic Blender-on-PATH SKIP, strict source and tooling types exit0. Pinned actual Blender producer/render/control/repeats executed GREEN; optional generic PATH skip is not a missing actual Blender run. No build/fullverify/native run in this lane.

## Native lease and remaining acceptance

Root authorized hash/source/frame-only changes in `tests/browser/laundry-linen-rack/art-fixture.ts` and its unit source literal. Public action/helper files untouched. Native evidence assertion unit accepts actual new descriptor/body; old generic rack still rejects. Both recorded actual q0/q1 owners, original washers, paid rack orientation0/cost65, wholeV9 payload and all network/realBlob decoder checks retained. No new RGB/ROI threshold guessed or reduced.

Root executable existing opt-in route:

```powershell
$env:LOCKSTATE_LAUNDRY_LINEN_NATIVE='1'
$env:LOCKSTATE_ARTIFACT_TEST_PORT='<root leased port>'
node node_modules/@playwright/test/cli.js test --config tests/browser/laundry-linen-rack/native.audit.config.ts
```

Exactly existing three serial cases: public storage/delivery capacity seed; q0 Laundry public template plus separately paid rack; q1 public template plus separately paid orientation0 rack. Existing60s/expect10s/workers1/retries0 unchanged. Both canonical world60/e40. Public paused Save/Load and exact whole V9 equality remain required; no initial HUD clock broadcast dependency. Actual FullHD PNG screenshot/network body/loader Blob delivery and independent visual evaluation/calibration are PENDING root genuine build/browser. Samples and typed source checks do not establish product acceptance. Root owns any View opener migration; no browser helper was edited here.
