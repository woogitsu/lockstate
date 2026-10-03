# Canteen wooden bench: genuine retained soft shaders

Base20b83bf994ea5b08d1be4545cc453315cc28941f, own branchcodex/canteen-bench-cycles-20261004. Actual Canteen8x8 template contains two dining tables and four bench-wooden objects. Canteen selects existing object.bench/global furniture.corridor.bench.variants at /game-content/oblique-canteen-bench.v1.json. CommonRoom explicitly selects furniture.common-room.upholstered-bench; Yard selects steel bench. All mappings/aliases/catalog/templates/prices stay unchanged.

Original grounded source8518e5d755352f6511bcb4f2165674e1bca44f918f945e7c5cfa09b60ba05986 contains46 parts:40 retained authored parts+2lower ties+4ground shoes. All geometry/topology/modifiers/evaluated positions/normals/9complete material graphs/packed textures/8ground triangle-interior contacts+6lower-tie triangle contacts are preserved. All four2x1/1x2 orientations, ONE(1,.5,0) anchor transform, target1/.5/.44325,256RGBA/ortho4/64ppU/pivot128 remain.

Current released producer uses Workbench. Original packed timber grain now appears through unchanged shader graphs under the accepted three broad area lights/neutral ambient/AgXNone/CyclesCPU1/64samples/no-denoise/seed0/noadaptive. Wornwood rough.76, roundededge.66, wornsteel.64/metal.38, steel.45/recess.82/shade.90 remain intentional creator values; no viewport flattening or uniform roughness transfer. No floor/shadow geometry is added.

| Pose | Actual released Workbench | Actual reopened saved Cycles |
| --- | --- | --- |
| 60/e40 | [Before](./before-workbench-yaw60-elev40.png) | [After](./after-soft-original-materials-yaw60-elev40.png) |
| 300/e40 | [Before](./before-workbench-yaw300-elev40.png) | [After](./after-soft-original-materials-yaw300-elev40.png) |

All four original samples and both actual reopened after pictures were opened. Both before bodies reproduce released PNGs exactly. Saved after bodies equal original samples and show stronger original timber grain and softer frame/board depth. No clear stochastic artifact warrants a sample/denoise override; shared profile and CommonRoom/Table/Kitchen sources remain unchanged.

Saved source assets/source/blender/furniture.corridor.bench.soft-light.blend SHA256b4e5ca9317c74e0f8182937658c0a3f7026f114fcb7e1661101628cbd75c4e94. Actual source60/e40 body5ad7afdb520ed6cb58c5dd87e652a5e7165d7095d593b48708f40746bc90ac8f;300/e40 body68b214f705690e56ccf978a18223ccb6b850627055d641b74a1e2d960344dc29.722 initial historical source/frame/catalog/template/renderer/UI/browser files retain exact bytes. Initial incorrect local descriptor path was corrected before any source/render change; its failure log is retained separately, not counted as a production negative.

First coherent source/sample checkpoint;72/four repeats/actual production negatives/current Canteen typed consumer follow. Root owns build/browser/native public owners/HTTPbody/Blob/V10/material calibration; no native/playability result from source pictures. No src/UI/helper/config/schema/save/cost/alias/room-palette change.
