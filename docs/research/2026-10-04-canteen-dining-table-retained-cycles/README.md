# Canteen dining table: retained authored shaders in soft Cycles

Baseab0d3262390d297ad890320163756801d88c28bf, own branchcodex/canteen-table-cycles-20261004. Actual existing object.dining-table/public dining-table-wooden maps globally to furniture.dining.table.wooden and /game-content/oblique-furniture.canteen-dining-table.v1.json. Actual Canteen8x8 template retains its two3x2tables and four benches; no new alias/catalog/template/gameplay/price.

Original source furniture.canteen.dining-table.angled-detail.blend SHA5f27967600a64ce4ded10a01fe6217ea849c2be9b57ff92353fd60b97af4ede1 has65 parts(62retained+3rail/post arms),10 complete material graphs and6 genuine triangle-interior contacts. All raw/evaluated geometry/topology/modifiers/normals/contacts/packed texture/material graphs/bounds are unchanged. Deliberately retained original thin bevel degenerates remain guarded by the existing audit. All four occupied3x2/2x3 orientations, ONE(1.5,1,0) anchor translation, target1.5/1/.4725,256RGBA/ortho4/64ppU/pivot128 remain.

Existing renderer is Workbench. The same authored assembly is now saved under the accepted three broad area lights/neutral ambient/AgXNone/CyclesCPU1/64samples/no-denoise/seed0/noadaptive. Creator materials already have accepted BaseRGBA: wornsteel rough.64/metal.38, wood.76, galvanized.59, porcelain.25, shade.90, steel.45 and light.75. The four wooden planks have original packed Image Texture through Mix to BaseColor; their newly visible grain is authored texture, not an invented material replacement. No uniform roughness raise or viewport flattening. No extra floor/shadow geometry.

| Existing pose | Released Workbench | Actual reopened saved Cycles |
| --- | --- | --- |
| 60/e40 | [Before](./before-workbench-yaw60-elev40.png) | [After](./after-soft-original-materials-yaw60-elev40.png) |
| 300/e40 | [Before](./before-workbench-yaw300-elev40.png) | [After](./after-soft-original-materials-yaw300-elev40.png) |

All four original samples and both actual reopened after pictures were opened. The original packed timber grain becomes visible; plates/trays and rounded frame gain soft depth. There is no material mismatch or clear stochastic artifact warranting an override of64/no-denoise. The two Workbench bodies reproduce historical published PNGs exactly. Actual reopened after bodies equal the original in-memory samples.

Saved source assets/source/blender/furniture.canteen.dining-table.soft-light.blend SHA2564f92eb8cebdb7f5d343f5ca49869c317535867932f05ab805bbd33b60144728f.
Source60/e40 body035429e3f5027d77cec5224b1a8edd9ef19a2ad07ab3b315327599486006b2c0; source300/e40 body52b7a3854df2e27210552fe8896bcc56b2012d4d392d9e3dff2c9b42e4a22e8d.
647 original source/frame/registry/catalog/template/renderer/UI/browser files remain exact. First coherent source/sample checkpoint; full72/repeats/production controls/current typed consumer follow. Root native/public delivery/Blob/V10/scene appearance acceptance pending. No native/playability claim from source pictures.
