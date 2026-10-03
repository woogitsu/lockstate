# Staff Room padded chair: retained functional seating

## Actual source checkpoint

Verified by Blender 5.2.1 LTS (one process/thread1). Actual `staff-room-basic` 6?6 template keeps employee Desk (1,1) and Chairs (1,2), (3,3). Current room selector uses default wooden-chair for these chairs; this is a missing dedicated staff-seating presentation, not a claim existing geometry is broken.

Source: `assets/source/blender/furniture.staff-room.padded-chair.blend`, SHA256 `47004797588d92173e4140bc307ac3db73ed322ac2e1d2472f99c10475956109`. Original current wooden chair `acd0e9decb3bb451b44e8354e797fb5656825f4748bbed832bab61659f06cd88` remains byte exact. All 52 original parts, four complete stored graphs and evaluated positions retained; 54 total meshes after two substantial connected charcoal seat/back pads. Full original bounds unchanged: `{'min': [-0.3859996795654297, -0.485249400138855, 0.0], 'max': [0.3859996795654297, 0.4852507412433624, 1.3200000524520874]}`. 1?1, 64 pixels/tile, original target `[.5,.5,.6600000262260437]`. Charcoal uses the existing `shade` graph; no new material/palette.

Three evaluated triangle-interior contacts are recorded in provenance. Seat?original wooden seat witness `[0.0, 0.09000000357627869, 0.6050000190734863]`; back?walnut rail and dark inset independently witnessed. Original timber perimeter and fixings stay visible.

Actual saved `.blend` seat-pad +1Z mutation fails the physical contact guard before source SHA/raw guards (RED exit1); exact source bytes restored, real producer GREEN exit0. Actual producer ASSET_ID?default-chair mutation fails dispatch (RED1); exact producer restoration GREEN0. Seven protected source/producer/registry/context files match before/after hashes. Reproduce: `python tooling/verify-staff-room-chair-proof.py --source-only`. Receipts/logs are in this directory.

## Remaining work

72 genuine canonical exports, visual inspection, bounded repeats and actual hash-valid PNG negative; runtime registry and Staff Room-only context integration with strict typed source/dispatch controls. No browser, native acceptance, build or full verify claimed. Root owns those boundaries. [Durable plan](./PLAN.md).
