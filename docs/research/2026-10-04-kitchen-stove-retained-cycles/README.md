# Kitchen stove: retained shaders under softer light

## Verified existing consumer

Root base `85f4471ebebc08f50400ee606c613197999be39a`, isolated branch `codex/kitchen-cooker-cycles-20261004`. The real catalogue calls this `object.stove`, purchased as `stove-brick`; there is no new cooker definition. The existing Kitchen basic 6 x 6 template contains a stove, prep counter and fridge. Its current dedicated `furniture.kitchen.stove.variants` ID and `/game-content/oblique-furniture.kitchen-stove.v1.json` descriptor will be retained.

The genuine released source `furniture.kitchen.stove.angled-detail.blend`, SHA256 `2a912331e9c20a35ea417c25d371cf89a5f80092c3f066504c7b792cb1a042a2`, has all 96 authored parts: 80 retained parts and 16 previously accepted grate shoes. Every full graph of the six creator materials, all evaluated surfaces/normals, 32 actual triangle-interior contacts and all four rotated occupied footprints are retained. Original shader Base Colors already equal approved diffuse RGBA. Deliberate roughness remains: brushed steel .24, cast iron .30, enamel .33, oven glass .18, burner glow .32 and status green .28. No viewport material flattening or palette transfer is used.

## Genuine saved-source before/after

The two actual Workbench before renders at 60/e40 and 300/e40 exactly reproduce their released PNG bodies. Both were opened. The final soft after renders are made again from the actual saved Blender source and were compared with the earlier in-memory render; both are byte exact. The author steel, enamel and glass now respond to broad soft lights, with readable retained controls, grate assemblies and inset oven fronts.

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

This checkpoint publishes saved source and authentic inspected comparisons. The following final production section records the completed genuine72, independent repeats, real producer controls and focused verification. It is not a native or production gameplay acceptance result. Root owns the browser/build/integration lease and later evaluates the actual Kitchen scene. No renderer, UI, native observer/helper/fixture, persistence, schema, price, collision, camera, palette, template, config or alias is changed.

Reproduction uses Blender5.2.1 LTS with `--background --threads 1 --python-exit-code 1` and `tooling/blender/prepare-kitchen-stove-cycles.py`, followed by `--refresh-saved-comparison` or `--verify-saved`. The bounded original64 study uses `tooling/research/compare-kitchen-stove-soft-samples.py`, optionally `--denoised`; study outputs are separate from final saved-source pictures. Logs preserve actual executed commands/output. No AI bitmap enters the game.

## Complete genuine production and restoration

All 72 canonical poses were genuinely rendered from the saved source in 250.92783699999563 seconds. Four independent actual repeats at 30/120/210/300 e40 are byte exact (14.765765700023621 seconds total). The final reopened-source 60/300 comparison pictures equal the actual production bodies. The old source and all 72 Workbench PNGs remain; an explicit historical descriptor archive preserves their source/body pins.

The two original dedicated stove entry points and the stove-only entry in the shared Kitchen producer now consume the new saved source. The other Kitchen models retain their source entries and producers. Actual canonical callback omission and shared callback omission were observed RED and restored GREEN; removing the shared callback caused a real duplicate-anchor translation and occupied-footprint failure. Neither consumer is silently left on Workbench.

Seven real production REDs cover a disconnected grate shoe in an actually saved .blend, wrong dedicated asset dispatch, a correctly hashed/decoded PNG with opaque border, old Workbench descriptor delivered to the current typed consumer, registry omission, canonical callback omission and shared Kitchen callback omission. Every mutation was exactly restored, with 731 source/history/descriptor/producer/registry/catalog/renderer/UI/browser files matching byte for byte. All four repeated bodies passed actual PNG decoding.

Both strict TypeScript projects pass. Twelve focused suites pass: 206 tests GREEN, one existing optional generic Blender-PATH skip. Actual pinned Blender controls ran; the generic skip does not substitute for them. The two previous strict live-source tests were observed RED, then only their current source expectations were corrected; original mesh, material, normal, contact, camera and body guards remain active.

Canonical LF descriptor SHA256: `135cde5a764c1cfee7bc28abf91ec2c5c317d73c1044c8aecc46756783400ea7`. Actual source60/e40 image: `/assets/environment/oblique/furniture.kitchen.stove.variants-yaw+60-elev40.2c45a7fe1656.png`; source300/e40: `/assets/environment/oblique/furniture.kitchen.stove.variants-yaw+300-elev40.aed487667fa9.png`. Source/body full hashes are recorded above.

The typed genuine template consumer uses owner `room-template-000000000002-2-object-000`: q0 anchor(5,5), orientation0, occupied2 x 1, camera world60/e40; q1 anchor(8,5), orientation1, occupied1 x 2, camera world-30/e40. Both select exact source60/e40. Prep counter and fridge contents remain unchanged. This proves source-level renderer consumption and does not claim a public purchase, delivered HTTP response/Blob decode, whole V10 snapshot or native appearance result. Root owns those acceptance steps.

See [HANDOFF](./HANDOFF.md) for the scoped chain, actual command profile and integration boundary.
