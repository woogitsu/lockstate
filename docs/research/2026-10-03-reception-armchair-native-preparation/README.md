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

The opt-in public UI recipe and real response-body/decoder evidence helper are the next prepared checkpoint. Actual gameplay placement/drawing, separate visual calibration for BOTH chairs, consumer omission controls and before/after Load screenshots remain pending root's serial native run. No guessed colors, thresholds or ROI.
