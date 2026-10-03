# Modern square-wall retained-material study — review draft

## Actual inventory and selected consumer

The real angled floor path is `obliqueFloorBatches` in
`src/rendering/camera/oblique-ground-art.ts`, consumed as Mesh2D in
`src/rendering/scene/oblique-world-scene.ts` through `loadProjectedFloorArt`.
It projects full overhead catalogue UV tiles onto the whole logical tile.
`tooling/blender/render-environment-objects.py` already renders actual material
graphs with Eevee and directional suns. Changing registry oblique-floor art
would not change that actual ground consumer.

Selected existing visible consumer: `structureSolid` in
`src/rendering/camera/oblique-world-projection.ts` chooses
`wall.square.brick.full` for built full-height occupied wall squares, and
`wall.square.brick.low` when the existing cutaway rule applies. This study
touches neither that selector nor the approved legacy wall/door aliases.
The prior source/detail and native footprint reports were read:
[original masonry](../2026-10-01-square-brick-wall-detail.md) and
[native whole-square alignment](../2026-10-02-native-square-wall-footprint/native-acceptance.md).

## Genuine saved-source finding

Pinned Blender5.2.1 opened released full source SHA256
`c73fcc00471682135b53049e0b74f1d71588909b245bfeac0cac6cd93d696ae1`.
All59 authored parts remain: 52 staggered side bricks, four cap stones,
recessed cap joints, charcoal footing and mortar core. Nine complete graphs,
all raw meshes/modifiers, evaluated positions, outward normals and bounds are
captured in [the actual audit](actual-retained-source-audit.json).

The saved nine diffuse colors distinguish warm/aged/pale/smoked brick,
light/shaded sandstone, recessed mortar, warm mortar bed and charcoal footing.
Their **actual saved Principled inputs** are instead uniformly Base Color
`(.8,.8,.8,1)` and Roughness`.5`, while viewport roughness is`.87`. The released
Workbench exporter reads diffuse material colors and ignores this node response.
Simply switching to Cycles therefore loses intended color differentiation.
The literal-graph draft preserves all graphs and demonstrates that deficiency;
it is not a candidate for immediate production adoption.

## Actual comparison

Genuine source renders are unedited512RGBA PNGs at the original camera:
orthographic8tiles,64pixels/tile,target(.5,.5,0), yaw−45/e45 and135/e45.
Both Workbench bodies reproduce the released source frames byte for byte.
The actual after renders use retained literal graphs, Cycles CPU/thread1,
64samples/seed0/no denoising/no adaptive sampling/AgXNone/exposure0/gamma1,
neutral world`.8`/strength`.35`, neutral SUN energy2/20° softness and the
environment producer's key direction62°elevation/−40°azimuth.

| Canonical pose | Genuine current Workbench | Genuine retained-graph Cycles |
| --- | --- | --- |
| −45/e45 | [before](before-workbench-yaw-45-elev45.png) | [after](after-cycles-literal-graphs-yaw-45-elev45.png) |
| 135/e45 | [before](before-workbench-yaw+135-elev45.png) | [after](after-cycles-literal-graphs-yaw+135-elev45.png) |

[Actual receipt](actual-before-after.json) records complete before/after physical
records, actual source/frame hashes, measured render durations and unchanged
released files. [Saved separate draft](draft.wall.square.brick.full.literal-graphs.blend)
contains genuine geometry, original graphs, actual camera and directional rig.
Workbench timings were0.414s/0.062s; Cycles2.368s/2.368s. No fullmatrix ran.

## Seam and palette boundary

A directional sun has no finite emitter distance or positional light gradient,
so it avoids repeating the furniture area-light falloff every wall tile.
It does **not** establish isolated baked sprites match a continuous joined
physical wall: neighbor occlusion and interreflection still need actual joined
source comparison. That comparison follows a usable approved palette sample.
No extra floor/shadow receiver was added; there is no world contact-shadow claim.

Recommended next bounded draft: explicitly transfer each existing approved
diffuse color and roughness into that same material's Principled inputs in a
separate retained source, keep topology/modifiers/footprint and original graphs
archived, then compare these same two poses and a genuine joined modular run.
This recommendation introduces no new color. After this literal comparison,
root explicitly approved a separate variant synchronizing **only** these two
existing material values into Principled inputs. That variant follows next;
this archived literal comparison and original source remain unchanged.

## Actual negative controls and restoration

[Actual saved-source controls](actual-saved-draft-controls.json) record three
genuine Blender writes of this owned draft: cap displacement, directional key
omission and halved camera span. The real producer rejected each saved mutant
(exit1), then accepted each exact restored source (exit0). All2641 protected
source/frame/runtime files were byte exact after restoration. A saved-source
first-pose repeat was byte exact to the original Cycles body, with actual
render output in [the repeat receipt](actual-saved-repeat.json).

Focused wall/catalog/pipeline suites:9passed/1optional generic Blender-on-PATH
live test skipped. Actual pinned Blender CLI controls and renders ran separately;
the skip is not claimed as Blender proof. No native acceptance claim.

No runtime source/descriptor/registry/context/alias,18room palette, floor art,
world picking, gameplay, copy, save or UI change. No browser/server/build/native
run. AI modern concept is direction only; none of its pixels enter these renders.
