# Reception waiting armchairs: literal native preparation

Prepared from e2c7c5d4. No browser/server started and no native visual pass claimed. Root owns registry/mapping and serial built-client acceptance; other surfaces unchanged.

## Actual typed public build proof

The new kernel starts with its real owned 32x32 parcel and 25000. It receives only public typed PlaceRoomTemplate commands: Storage Room (12,18), Delivery Bay (20,18), Reception (4,4), clockwise turn 0 or 1. No private fixture placement, material grant or state injection.

| Public plan | Shell+objects orders | Debit | Remaining | Actual elapsed ticks |
| --- | --- | --- | --- | --- |
| Storage Room | 18 | 1395 | 23605 | 1251 |
| Delivery Bay | 21 | 1780 | 21825 | 1520 |
| Reception q0 and q1 | 23 | 1845 | 19980 | 1570 |

Total 62 completed ordinary orders, three completed templates, 4341 ticks, 5020 debit, 106 brick and 12 wood planks. Reception shell is 6x6, interior (5,5) size4x4. The independent literal fixture records all 19 ordered square walls, door edge/gap, desk and both chairs; completed and queued owner assertions verify actual orders.

| Turn | Door order / doorway square | Desk anchor and footprint | Chair owner001 | Chair owner002 |
| --- | --- | --- | --- | --- |
| q0 | (6,9) north / (6,9) | (5,5), 2x1, orientation0 | (5,6), orientation0 | (7,7), orientation0 |
| q1 | (5,6) west / (4,6) | (8,5), 1x2, orientation1 | (7,5), orientation1 | (6,7), orientation1 |

Object owner IDs are room-template-000000000002-2-object-000/001/002. Both chairs retain their existing object.chair role and 1x1 footprint. Actual room projection reports doorway access, seating2, workstation2, zero missing capabilities, no occupants/resident capacity. Whole stopped V8 JSON encode/decode and restored runtime snapshots compare exactly for ALL persisted subsystems in both cases. See actual-typed-q0-V8-roundtrip.json and q1.

## Genuine producer negative and exact restoration

The own checkout's actual room-template-build-plan createBuildOrder producer temporarily omitted ONLY chair orientation. q0 still passed; q1 reached literal chair owner001 with orientation0 rather than1 and failed. The production bytes were restored exactly in finally; two fresh ordinary builds and whole V8 roundtrips passed. See actual-typed-producer-RED-exact-restore-GREEN.json and actual RED/GREEN logs. Art source, descriptor, all72PNG, registry and mapping hashes remained unchanged. An earlier broader omission also stalled q1 due to the unrotated desk colliding with a chair; it was restored before the final bounded chair-specific control.

## Integration boundary

Root optional registry: furniture.reception.waiting-armchair => /game-content/oblique-furniture-reception-waiting-armchair.v1.json. Room variant room.reception/object.chair => furniture.reception.waiting-armchair; retain generic/default/Classroom chair and Reception desk.

Source SHA256 12cd91c54feb1d35603752eb7efe5c6245be190d77aa31d6e6b81121ea18457d. Actual canonical frame /assets/environment/oblique/furniture.reception.waiting-armchair-yaw+60-elev40.4e6ee8fdb156.png SHA256 4e6ee8fdb156be06a9d023f8806d90aede0b12552d048dcdba383c5f68b4cb0d. Existing source+72render evidence lives in ../2026-10-03-reception-waiting-armchair/README.md; no rerender is needed here.

## Opt-in public UI route prepared

New tests/browser/native-reception-room.recipe.ts contains three serial cases: actual public Storage+Delivery bootstrap saved through UI to immutable IndexedDB storageState, then q0 and q1 each load that actual capacity save. Only public Build / Room plans / rotation / numeric origins / Place room plan, Fast forward, Pause, Save now, Load, minimap and camera buttons write state. Worker observer sends read-only snapshot/projection requests. All source command owners and whole stopped snapshots remain asserted.

After every Loaded status the recipe checks the PUBLIC Pause button aria-pressed=true and exact whole worker snapshot equality. It never waits for currentClock after Load: the initial installed HUD clock does not imply a later observer broadcast. The sole currentClock check follows actual Fast forward clicks and checks running speed4. Public completion targets are41 for capacity and65 for Reception (orders+completed templates). Before/after Load fullhd and canvas captures belong to the SAME completed room.

Source yaw60 is q0 camera -45 +7*15, q1 -45 +1*15 +90 object orientation. Public Lower camera angle three times clamps elevation20, then Raise twice sets exact40. This reuses the actual canonical camera control (oblique-world-scene initial pose lines196/197, clamp line594; cell-cot-evidence publicHeadboardPose) and requires no private renderer access. The minimap frames tile7,7.

The helper observes ONLY real renderer descriptor/PNG and worker response bodies, terminal200 with redirect evidence, exact frameSHA, PNG header256x256, existing real HTMLImageElement/Blob decoder completion and emitted workerSHA. It pins descriptor fields,72frames and normalized LF textSHA55fa838b7d646a308ce9d97ff2167a2ffbb914aa35d9db3b7544578dab942aea; the receipt also records the exact NETWORK bodySHA (Windows CRLF checkout is95b4e9bcb69dd9e9e8420073b57c943ea77f63117e4ef237101a5db3061d3144). No synthetic image fetch or texture-reader verdict.

Run from integrated root, after registration/mapping and ordinary production build:

```text
node tooling/research/write-reception-room-native-config.mjs
node node_modules/@playwright/test/cli.js test --config assets/intermediate/reception-room-native-preparation/playwright.reception.artifact.config.ts
```

The generator was executed and inspected, without importing the production browser config or launching any browser/server. The generated opt-in config inherits existing timeout60000/expect10000/workers1/retries0 and changes only testMatch/outputDir. No slow or timeout override. Full TypeScript project+tools check passed.

 Actual gameplay placement/drawing, separate visual calibration for BOTH chairs, consumer omission controls and before/after Load screenshots remain pending root's serial native run. No guessed colors, thresholds or ROI.
