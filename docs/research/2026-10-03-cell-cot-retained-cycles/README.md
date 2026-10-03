# Retained Basic Cell cot: actual shader/light comparison

## Scope and actual consumer

Base: `c28d4815844af9081c4d16925bbf498eb3df2ff1`. The published Basic Cell template is 4?7: bed-wooden at (1,1), toilet-brick at (2,4). Existing object.bed selects furniture.cell.cot.single. The authored cot is already anchored to its whole 1?2 footprint. No catalogue, template, context or alias change is needed.

## VERIFIED source preparation

Actual Blender 5.2.1 LTS, CPU one thread. Same retained assembly before/after: 25 parts (23 original plus two existing headboard uprights), nine complete stored material graphs, six real triangle-interior contacts, all evaluated positions/topology/modifiers/normals and four rotated footprints unchanged. The original source and 72 Workbench frames remain intact. All 646 protected files are byte exact.

New saved source SHA: `1e3710b77601d6864f1de30d7b37a6220357320ae832354d3920b9fa95b17eba`.

Actual before60/e40 and300/e40 are byte exact released Workbench bodies. Authentic Cycles after60/e40 SHA9940cac80b9b6b16a4e0bde165308b4475b0d319436a6fc94bee2996b9a90e8b; after300/e40 SHA0c46d3637182dee0254f34de2789f113c4273e1bc061799899c5ffac9d3e4123. Images and timings are recorded in actual-before-after.json. Softer cloth/pillow, roundover depth and steel shading come from the genuine original shaders and the bounded Staff/Laundry soft lighting profile, with no additional ground plane.

## Material audit

All saved Principled Base Color values already exactly equal approved diffuse RGBA. create-cell-cot.py explicitly authors cloth roughness .65, steel .50 and steel metallic .38. The separate viewport roughness property is .40000000596 for the eight used materials. This is an intentional explicitly authored shader input, unlike the previously uninitialized wall graphs. No graph inputs are synchronized or replaced here: all nine full material graphs are byte-record exact. The unused fake-user Material graph is retained as well. Lighting/color management changes appearance, not intrinsic colours or room palette tokens.

## Execution

Blender executable: C:/Program Files/Blender Foundation/Blender 5.2/blender.exe

```
blender --background --threads 1 --python tooling/blender/prepare-cell-cot-cycles.py
blender --background --threads 1 --python tooling/blender/prepare-cell-cot-cycles.py -- --verify-saved
```

64 samples, seed0, CPU/thread1, no adaptive sampling, no denoising, AgX/None, exposure0/gamma1, 256RGBA, orthoscale4, 64px/tile, target(.5,1,.35). All 72 original camera poses remain the production target.

## Boundary

This checkpoint contains two authentic before/after poses and saved source only. Full72, production descriptor switch and genuine RED/restore controls follow separately. No native acceptance, browser, server, build, UI, native fixture, copy, gameplay, palette or camera changes. Actual scene acceptance belongs to root after integration.
