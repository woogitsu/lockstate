# Medical bed: actual retained Cycles source

Own isolated base `25f8dbc45138b2c14c05ee98dd71789321bc7c25`, branch `codex/infirmary-medical-bed-cycles-20261004`. This is genuine Blender source work, not game/native acceptance.

## Reopened source and connections

Blender5.2.1 LTS reopened the actual76-part `furniture.medical-bed.angled-detail.blend`, SHA256 `d18a702e585d6e69f15602d9e9f294bc0c539da3f78bf4f48fe1330da286c4fe`. Actual evaluated mesh-bound groups have sizes3/13/1/7/37/1/1/2/7/1/1/2. [Original inspection](./actual-existing-source.json) preserves all bounds/adjacency/material readings. A mesh-bound group is not a triangle-contact assertion.

Only13 physically required connections are added: mattress deck support, two lower bearing attachments, two lift cross-shaft bearing mounts, four continuous caster axles and four rail coupling sockets. Every new part joins two retained solids, with26 real triangle-interior witnesses. All76 raw meshes/topology/material assignments/modifiers/evaluated positions/normals/transforms remain exact; the new89-part assembly forms one mesh-bound group. The first shallow bearing attachment failed actual triangle containment at the beveled base; [original failure](./prepare-original.raw.txt) remains. The corrected attachment penetrates the actual base interior; no guard was relaxed.

Original four Principled shaders all used BaseRGBA(.8,.8,.8,1)/rough.5/metal0 despite explicit authored diffuse/roughness properties. The assigned dedicated-source correction transfers **only** BaseRGBA and Roughness to those exact authored properties. Four old/new input records and complete material graphs with every other input/node/link/property unchanged are retained in [the actual reopened source receipt](./actual-before-after.json). This is the requested existing-material pipeline repair, not new palette approval. Original source and source72/body mappings remain immutable at this checkpoint.

## Saved source and genuine two-pose samples

Saved `assets/source/blender/furniture.medical-bed.soft-light.blend`, SHA256 `786abf1ae0e37b99ddb507618918f04472560a68f78bcd22a7f3b5097c822c2c`. Footprint1x2, min-corner(.5,1,0), target(.5,1,.675000011920929),256RGBA/ortho4/64pixels-per-tile remain. Original evaluated bounds are unchanged. New dedicated scene uses the existing three broad soft lights read-only, CPU/thread1/128samples/seed0/noadaptive/AgXNone/OpenImageDenoiseCPU, no ground geometry. Shared profile/light/palette files stay unchanged.

Original76 Workbench60/300e40 samples are byte-exact against their published frames. Connected89 Workbench and soft89 samples share geometry. Soft comparisons were rerendered from the **actual saved .blend** with retained geometry/graph/contact/profile validation, [raw saved-source run](./saved-comparison.raw.txt). These are source renders, not UI screenshots.

![Connected source before](./before-connected89-workbench-yaw60-elev40.png)
![Actual saved source after](./after-soft-authored-materials-yaw60-elev40.png)

Reproduce with pinned Blender `--background --factory-startup --threads 1 --python-exit-code 1 --python tooling/blender/prepare-medical-bed-cycles.py`; use `-- --refresh-saved-comparison` to reopen and revalidate the saved source without resaving it. Complete72 export/four repeats/production source and consumer omission controls are the next bounded step, not yet claimed. Root owns genuine game build/browser/native and any native helper changes.
