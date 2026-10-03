# Common Room upholstered bench: retained shaders and softer light

## Actual consumer and retained assembly

Base: `54aa78a9af4ec55232a740b85089c3e7177c8028`. Branch: `codex/common-room-cycles-20261003`.

The existing Common Room basic 7 x 7 template places two paid `bench-wooden` objects at offsets (1,1) and (3,3). Its existing `room.common-room` / `object.bench` context selects `furniture.common-room.upholstered-bench`. The dedicated model already has 35 parts: all 33 original parts and the two previously accepted front arm supports. This change retains every raw mesh, topology, modifier, assignment, evaluated position and normal, all eight complete material graphs, full bounds and four actual triangle-interior contacts. The original 2 x 1 footprint, all four orientations, camera target, pivot and picking geometry are unchanged.

The original shader Base Color inputs already equal the approved diffuse RGBA. Deliberate creator roughness values remain: cloth, seams, timber and rubber 0.72; petrol steel 0.55 / metallic 0.34; stainless fittings 0.42 / metallic 0.65. The separate viewport roughness 0.4 is not transferred. No graph synchronization or new palette was required.

## Genuine same-source comparison

Blender 5.2.1 LTS, one CPU thread, actual saved Blender source. The two Workbench before images at 60/e40 and 300/e40 exactly reproduce the released PNGs. The two Cycles after images exactly equal the corresponding new production exports. All four were opened and inspected: retained upholstered seams and timber caps become softer and more tactile, with clearer rounded depth and steel response.

| Pose | Released Workbench | Saved Cycles |
| --- | --- | --- |
| 60/e40 | [Before](./before-workbench-yaw60-elev40.png) | [After](./after-soft-original-materials-yaw60-elev40.png) |
| 300/e40 | [Before](./before-workbench-yaw300-elev40.png) | [After](./after-soft-original-materials-yaw300-elev40.png) |

The bounded Staff/Laundry profile supplies CPU Cycles, 64 samples, seed 0, no denoise or adaptive sampling, AgX / None, exposure 0, gamma 1, neutral ambient and three broad area lights. There is no extra floor plane or altered authored geometry. Initial preparation protected 710 source/history/catalog/renderer/UI/browser files exactly.

## Complete real export and controls

All 72 canonical poses were genuinely rendered in 73.93335759994807 seconds: 12 yaws (0 through 330, step 30) and six elevations (20 through 70, step 10). Resolution remains 256 RGBA, orthographic scale 4, 64 pixels per tile, pivot (128,128), target (1,0.5,0.52). Four independent real repeats at 30/120/210/300 e40 are byte exact, taking 3.7374300000374205 seconds total. A separate canonical 45/e45 preview was rendered and opened; it leaves the 72-pose receipt and descriptor unchanged.

The original producer entry point dispatches to the new saved source. The accepted ID and manifest URL are unchanged. Old sources, all historical 72 PNGs and an explicit Workbench descriptor archive remain available.

Six actual production failures were observed: a disconnected riser in a saved .blend; wrong dedicated producer asset; valid decoded PNG with matching body/filename/descriptor hashes but opaque border; old Workbench descriptor delivered to the current typed consumer; missing registry entry; and original producer callback dispatch omission. Every control then restored exact bytes and returned GREEN. The production receipt covers 724 restored files. Shared contact and PNG decoder errors retain their original Cot/Staff prefixes; the mutated source and frame are the actual Common Room model.

Both strict TypeScript projects pass. Seven focused suites pass: 201 tests, with one existing optional generic Blender-PATH skip. The dedicated Blender controls actually ran against the pinned executable. Existing context fallback controls remain active, including wrong room, partial containment, outside and planned objects. The new typed consumer proves both real template owners and whole rotated occupied footprints for q0 and q1, selecting the exact new 60/e40 body in both camera arrangements. This is source-level renderer consumption proof, not a public purchase or native run.

## Runtime pins and remaining acceptance

- Source: `assets/source/blender/furniture.common-room.upholstered-bench.soft-light.blend`
- Source SHA256: `70be43170198172589904862ed627e0c3360be9da4788fb93098feb7b4ecb4c7`
- Descriptor: `/game-content/oblique-furniture.common-room-bench.v1.json`
- Canonical LF descriptor SHA256: `9e3f229fd79302f2164a1152e7f429d5274e68dfb448601f858aaacad70ede11`
- 60/e40 body: `/assets/environment/oblique/furniture.common-room.upholstered-bench-yaw+60-elev40.a75487c09dc1.png`
- Body SHA256: `a75487c09dc18f99526dc77265c93764fad2927b2a2beb762057ad36f99e1ab0`
- 300/e40 body: `/assets/environment/oblique/furniture.common-room.upholstered-bench-yaw+300-elev40.fbf9376425bb.png`
- Body SHA256: `fbf9376425bb06eb59655fadc59417e5310b309beb4e875fc78138407f63b779`

Root still owns integration, build, native public UI and appearance acceptance. The existing `tests/browser/common-room-upholstered-evidence.ts` retains its older source/image pins; update those only in root's native lane. Exact old Workbench RGB checks cannot serve as a new shader acceptance claim. Public response bytes, real Blob decode, whole paused V10 snapshot preservation and actual visual calibration remain pending. No native fixture, helper, browser, server, renderer, UI, persistence, room template, price, footprint, palette or general mapping was changed.

See [HANDOFF](./HANDOFF.md), [PLAN](./PLAN.md), the actual matrix/repeat receipts and six RED/restore logs.
