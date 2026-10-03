# Kitchen stove: retained shaders under softer light

## Verified existing consumer

Root base `85f4471ebebc08f50400ee606c613197999be39a`, isolated branch `codex/kitchen-cooker-cycles-20261004`. The real catalogue calls this `object.stove`, purchased as `stove-brick`; there is no new cooker definition. The existing Kitchen basic 6 x 6 template contains a stove, prep counter and fridge. Its current dedicated `furniture.kitchen.stove.variants` ID and `/game-content/oblique-furniture.kitchen-stove.v1.json` descriptor will be retained.

The genuine released source `furniture.kitchen.stove.angled-detail.blend`, SHA256 `2a912331e9c20a35ea417c25d371cf89a5f80092c3f066504c7b792cb1a042a2`, has all 96 authored parts: 80 retained parts and 16 previously accepted grate shoes. Every full graph of the six creator materials, all evaluated surfaces/normals, 32 actual triangle-interior contacts and all four rotated occupied footprints are retained. Original shader Base Colors already equal approved diffuse RGBA. Deliberate roughness remains: brushed steel .24, cast iron .30, enamel .33, oven glass .18, burner glow .32 and status green .28. No viewport material flattening or palette transfer is used.

## Genuine saved-source before/after

The two actual Workbench before renders at 60/e40 and 300/e40 exactly reproduce their released PNG bodies. Both were opened. The final soft after renders are made again from the actual saved Blender source and were compared with the earlier in-memory render; both are byte exact. The author steel, emal and glass now respond to broad soft lights, with readable retained controls, grate assemblies and inset oven fronts.

| Pose | Released Workbench | Saved shader Cycles |
| --- | --- | --- |
| 60/e40 | [Before](./before-workbench-yaw60-elev40.png) | [After](./after-soft-original-materials-yaw60-elev40.png) |
| 300/e40 | [Before](./before-workbench-yaw300-elev40.png) | [After](./after-soft-original-materials-yaw300-elev40.png) |

The initial 64-sample no-denoise profile showed actual stochastic grain on the metal cooktop. The complete 64-sample saved source and both after images are retained as a distinct draft. One bounded 512-sample no-denoise comparison reduced grain but retained visible traces, at 13.23 seconds per pose. The selected Kitchen-only correction uses CPU Cycles / one thread / 128 samples / seed 0 / built-in CPU OpenImageDenoise, retaining exactly the existing three Staff/Laundry soft lights, all six shaders and approved RGBA. The shared profile and other assets are untouched. The bounded denoised draft comparison and final reopened-source pictures were opened; the noisy cooktop clears while original silhouette, grates, handles and seams remain readable. Two original source area lights are replaced in this new presentation scene by the accepted three soft area lights; the original source remains byte exact.

Current saved source: `assets/source/blender/furniture.kitchen.stove.soft-light.blend`, SHA256 `7ac1027aca308b946acf902ebf611547621227535dc70b29db1c06d3db2d03bb`.
Actual saved60/e40 SHA256 `2c45a7fe165699ebdf209ba6a092956d9e8097d3095bc5f09dd35b9344749d65`.
Actual saved300/e40 SHA256 `aed487667fa98273e0110f43295fa78f196edffb4415397f37d2797321f6ab1e`.
Retained draft64 source SHA256 `22feab9bafafbed9bdee8a716f7e32803cd71dd2b2d4cc3c56bb3aa2ae15145d`.

The production anchor is the existing ONE translation (1,.5,0). This new saved source already contains it; do not translate it again. Footprint 2 x 1, target (1,.5,1.1230000257492065), 256 RGBA, orthographic scale 4, pivot (128,128), 64 pixels per tile are preserved.

## Checkpoint and pending proof

This checkpoint publishes saved source and authentic inspected comparisons. Genuine72, independent repeated frames, real producer/source/hash-validPNG/consumer controls, strict types and focused neighbor tests follow. It is not a native or production gameplay acceptance result. Root owns the browser/build/integration lease and later evaluates the actual Kitchen scene. No renderer, UI, native observer/helper/fixture, persistence, schema, price, collision, camera, palette, template, config or alias is changed.

Reproduction uses Blender5.2.1 LTS with `--background --threads 1 --python-exit-code 1` and `tooling/blender/prepare-kitchen-stove-cycles.py`, followed by `--refresh-saved-comparison` or `--verify-saved`. The bounded original64 study uses `tooling/research/compare-kitchen-stove-soft-samples.py`, optionally `--denoised`; study outputs are separate from final saved-source pictures. Logs preserve actual executed commands/output. No AI bitmap enters the game.
