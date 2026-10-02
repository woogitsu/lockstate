# Staff Room desk from the existing Blender model

The twenty room plans already have a canonical oblique asset for every placed object. The Staff Room nevertheless displayed the generic office desk. The repository contains a more readable employee desk with a lamp, open ledger, paperwork tray, cup and steel pedestal in `assets/source/blender/furniture.office.desk.employee.blend`; this change reuses that authored model instead of making a duplicate. The existing buildable remains `object.desk`, 2 x 1 occupied squares, with the same construction cost, collision and saved identity. Reception and other rooms retain the generic desk.

## Geometry and export

The original Blender source SHA-256 is `4a7134622b170fae660aeb1a8155aa9adee4b54cff02c2fcdd8a0ea19dd7218c`. Its 49 meshes were centred on `(0,0)`, with evaluated source bounds X `[-0.920,0.920]`, Y `[-0.430,0.483]`, Z `[0,1.270]`. The runtime anchors placed objects at their **minimum tile corner**. A camera target change alone cancels out in the sprite/world projection, so the old centred render could spill into neighbouring tiles.

The new renderer translates the existing geometry by `(1,0.5)` in Blender and rejects out-of-footprint bounds. Blender 5.2 measured the resulting bounds X `[0.080,1.920]`, Y `[0.070,0.983]`, Z `[0,1.270]` inside the authoritative 2 x 1 square. It generates 12 yaw x 6 elevation poses at 512 px / 8 orthographic tiles = exactly 64 px per world tile. All 72 PNGs have transparent borders and SHA-256 entries in the manifest. [Yaw 45°, elevation 45° preview](./preview-yaw45-elev45.png) shows the authored desk at native resolution.

Two full renderer passes produced the same manifest SHA-256 `9cb94d947cc99c72a58a99a9231760f162e0ff40a78a812587836f76cf879733`. The Staff Room-only render selector requires the entire 2 x 1 footprint to fit inside the published room rectangle. Unit tests cover the real projection for built versus planned desks, absent/other rooms, source hash, 72 frame hashes and the camera scale equation. Temporarily replacing the Staff Room selector with the generic desk produced red 1/4, then restoring it returned 4/4 green. Changing the first manifest frame hash to zeroes produced red 1/3, then restoring it returned 3/3 green.



## Obsolete frame cleanup

Root removed the72 replaced reception-employee-desk-yaw PNGs after confirming zero references in current game-content JSON or tracked text. The original manifest/frames remain in published ancestor c53a2d6518; a scoped LFS fetch was checked before removal. Every removal path was validated inside public/assets/environment/oblique. The72 new employee-variants poses remain, and31 art/mapping/index cases pass after cleanup. Actual worker/SaveLoad acceptance is recorded separately below.
## Actual player proof at 1920 x 1080

The [production browser spec](../../../tests/browser/staff-room-desk-player-build.spec.ts) places Storage Room and Delivery Bay, waits for both worker queues and saves in IndexedDB. A fresh browser context loads that real save, places Staff Room, waits for its worker queue, observes `object.desk` at anchor `(21,6)`, then saves and loads once more. The two stages passed 2/2 with the standard 60-second test and 10-second assertion budgets, without injected construction commands.

- [Worker-completed Full HD screenshot](./worker-completed-fullhd.png) and [reloaded Full HD screenshot](./loaded-fullhd.png) show the employee desk, chairs, room floor, walls and door in the actual oblique scene.
- The fixed desktop region contains **1,547** authored grey RGB `(148,145,139)` pixels before Save and **1,547** after Load. Its rectangle isolates the desk from nearby chairs and room floor.
- Changing only the production Staff Room asset selector to the generic desk reduced the oracle to **zero** pixels and failed the desk stage (1/2 tests passed). Restoring the map byte-for-byte returned the same real-player spec to 2/2 green. The mutation confirms that the screenshot proof exercises the employee desk consumer.
