# Kitchen fridge: retained enamel, glass and steel under softer light

## Verified existing consumer

Base `dfec4ab5dec746ec08161dc7cbb2de71ed4eaba6`, branch `codex/kitchen-fridge-cycles-20261004`. Actual object ID `object.fridge`, public purchase `fridge-brick`, existing Kitchen6x6 template offset(1,3), footprint1x1. The existing global mapping selects `furniture.kitchen.fridge.variants` and `/game-content/oblique-furniture.kitchen-fridge.v1.json`; no new alias, room, object or gameplay definition is introduced.

Original dedicated source `furniture.kitchen.fridge.angled-detail.blend` SHA256 `0cb6861e636324cf4d1e6ad35c1739cbac6068f32eb702244f5ddb196715f3d5` contains97 parts (73 retained plus24 prior fixings). All raw vertices/topology/modifiers/material assignments/evaluated positions/normals/full bounds are retained. Six complete graphs and24 existing evaluated mesh-bound overlap checks are protected; these original guards are not misrepresented as triangle-interior witnesses.

Creator shader RGBA already equals approved diffuse. Original Principled roughness remains enamel.30, freezer glass.16, handle.20, rubber.30, status.28, steel.22; original metallic values remain. No viewport material flattening or diffuse/roughness transfer is used. The existing ONE(.5,.5,0) mincorner translation is already present in the new saved scene; do not apply another. Original target(.5,.5,1.1999999284744263),256RGBA/ortho4/64ppU/pivot128/all four1x1 occupied orientations remain.

## Actual same-source saved comparison

| Pose | Released Workbench | Saved shader Cycles |
| --- | --- | --- |
| 60/e40 | [Before](./before-workbench-yaw60-elev40.png) | [After](./after-soft-original-materials-yaw60-elev40.png) |
| 300/e40 | [Before](./before-workbench-yaw300-elev40.png) | [After](./after-soft-original-materials-yaw300-elev40.png) |

Both true Workbench before bodies exactly reproduce the released source PNGs. Four original comparison pictures and both final reopened-source after pictures were opened. The retained enamel gains a soft gradient; inset glass, warm handles and authored rounded corners remain readable. Literal64-sample no-denoise soft lighting produced visible stochastic grain on the large enamel panel and steel top; its genuine saved source9c0f4da50cb87f9286cca2c97bb54662bf3ddecf8b37f4c47ebd996b10481220 and after pictures remain as a separate draft. One bounded128/CPU OpenImageDenoise comparison clears this observed grain. There is no repeated512 study and no global profile change. The existing three soft lights/neutral ambient and all material graphs stay unchanged; only this fridge sample/denoise setting is pinned. Two old source AREA lights are replaced by the accepted three in the new presentation source; original source bytes remain.

Final actual saved source `assets/source/blender/furniture.kitchen.fridge.soft-light.blend` SHA256 `1bad1e58abc9cd6c7a5773742df6b365ceb85db0a1e20d3c20a46c2e2508ce7d`.
Actual reopened60/e40 body SHA256 `6d705ce7fcb58f091d1f974716fe988cecea85167f6402ea5e55ba563b04b0c6`.
Actual reopened300/e40 body SHA256 `a6d73e1d54a877812e867aa877d5deda3c944259b35dd95506be64e31ce77fbc`.
Initial575 released source/history/catalog/template/renderer/UI/browser files are protected exactly. Old source and all old72 images remain.

## Completed source/export proof and native boundary

Actual72 genuine Cycles poses finished in208.3341738000163s, CPUthread1. Four independently rerendered30/120/210/300e40 bodies are byte exact in12.10734010010492s. Every historical72 body remains. Final72 source60/300 bodies exactly equal the inspected reopened-source samples; current60 and opposite210 exported views were also opened.

Seven real production REDs cover saved handle-contact loss, dedicated asset dispatch, hash-valid PNG decoded border failure, old Workbench descriptor consumed by the current typed renderer, actual registry omission, canonical callback omission and shared Kitchen callback omission (which incorrectly repeats the anchor translation and escapes the1x1 footprint). Every exact restore is GREEN, with731 protected source/render/catalog/template/renderer/UI/browser files unchanged. Both original dedicated entrypoints and the selected shared Kitchen callback are verified without rerendering other fixtures. The original mount guard checks evaluated mesh AABB overlap, not triangle-interior contact.

Both previous live-source tests genuinely failed before their source assertions were corrected; all original73/97 structural and material guards remain. The formerly selected old Workbench descriptor also genuinely fails the new typed consumer. Thirteen focused suites65G/1existing optional generic Blender-PATHskip; two strict TypeScript projects0. The pinned real Blender controls ran independently.

Current typed q0/q1 template consumer uses Kitchen6x6 at(4,4), owner `room-template-000000000002-2-object-002`: q0(5,7)/orientation0/camera60e40 and q1(6,5)/orientation1/camera-30e40. Whole1x1 projected occupied footprint and unchanged stove/prep/fridge template contents are asserted. Both select the actual source60/e40 exact PNG. This is source-level real template and renderer consumption, not a native purchase/SaveLoad result.

Root owns source integration/build/browser and genuine composed Kitchen public UI/HTTPbody/Blob/V10/visual acceptance. Source pictures do not establish native playability. No pixel ROI, new material threshold or native fixture was invented. Existing aliases/mapping/registry/material palette/gameplay remain.

Reproduce via `tooling/blender/prepare-kitchen-fridge-cycles.py`, then `--refresh-saved-comparison` or `--verify-saved`, using `--background --threads 1 --python-exit-code 1`. No UI/renderer/native observer/helper/fixture/config/schema/save/gameplay/palette/collision change is included.
