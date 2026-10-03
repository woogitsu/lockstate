# Modern square-wall retained-material study and full-module adoption

Current source state: the existing accepted full-wall descriptor consumes72
genuine approved-material Cycles frames. Source/consumer proof is complete;
actual built-game/native visual acceptance is pending root. The two earlier
draft stages below remain explicit history, including the rejected literal
grey-graph presentation. Low/cutaway and floor art are unchanged.

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

At the bounded draft checkpoints there was no runtime source/descriptor/
registry/context/alias,18room palette, floor art,
world picking, gameplay, copy, save or UI change. No browser/server/build/native
run. AI modern concept is direction only; none of its pixels enter these renders.

## Approved material synchronization variant

Root authorized exactly the original diffuseRGBA and roughness transfer into
each same Principled material. [Actual variant](actual-approved-material-variant.json)
records nine transfers. Every graph field outside Base Color/Roughness is exact;
all59 raw/evaluated parts, modifiers, normals and bounds remain exact. All58
retained contacts were independently measured on actual evaluated mesh BVH
surfaces; these are touching witnesses, not invented interior overlap.

Separate genuinely saved scene SHA256
`53c35a0013a93ed662983a2888031c8377ba1965981e3ef98757e20547bd9cd8`:
[approved-materials source](draft.wall.square.brick.full.approved-materials.blend).
The unchanged directional profile renders the same two canonical poses:
[−45/e45](after-cycles-approved-materials-yaw-45-elev45.png) and
[135/e45](after-cycles-approved-materials-yaw+135-elev45.png).
They restore the authored charcoal footing and masonry/cap color differentiation
with softer directional face depth. Original source and literal grey-graph draft
are retained. Only the two explicitly approved shader inputs differ.

Three complete real translated modules were also rendered together at both
poses: [Workbench−45](joined-before-workbench-yaw-45-elev45.png),
[Cycles−45](joined-after-cycles-approved-materials-yaw-45-elev45.png),
[Workbench135](joined-before-workbench-yaw+135-elev45.png),
[Cycles135](joined-after-cycles-approved-materials-yaw+135-elev45.png).
Those are177 actual meshes with original materials, not duplicated bitmap art.
Original mortar/cap seams remain visible. Four independently projected top-cap
center5×5 diagnostic patches at each yaw gave **zero mean RGB delta** between
the single module and joined center module: [measured sensitivity](actual-joined-neighbor-sensitivity.json).
This is bounded source illumination evidence, not full seam or native acceptance.

[Actual saved shader control](actual-approved-material-controls.json): reverting
the charcoal footing's shader to default grey was saved in Blender, rejected by
the real producer (exit1), restored byte exactly and accepted (exit0). All2643
protected source/frame/runtime files remained byte exact. Low/cutaway source,
floor and accepted aliases stay outside this specific full-module adoption.

## Full72 and real existing consumer completion

Actual standalone source `wall.square.brick.full.soft-light.blend` is the
inspected approved-material scene, SHA53c35a0013a93ed662983a2888031c8377ba1965981e3ef98757e20547bd9cd8.
The original square-wall producer delegates only its full branch to the new
bounded producer; historical `prepare_scene` and the low branch are retained.
The original source and all old72 frames remain byte exact, with an archived
Workbench descriptor. Registry URL and existing built-square selector are unchanged.

[Actual matrix](actual-production-matrix.json):72 genuine renders,168.1306337s,
CPU/thread1/64samples;512RGBA/ortho8/64pixels-per-tile/target(.5,.5,0), original
24×3 camera grid. Canonical sample bodies match the inspected draft photos exactly.
Four independently reopened source renders at−135/−45/45/135,e45 were byte exact:
[repeat receipt](actual-production-four-repeats.json).

The real existing typed world consumer first rejected the old Workbench source
against the new literal pin: [before RED](actual-old-Workbench-consumer-RED.log).
After actual descriptor export it selects the new source and exact canonical body
at both−45/e45 and135/e45 with the unchanged projected whole1×1 footprint.
[Production controls](actual-production-controls.json) then repeated six real
negative controls: saved cap source mutation, producer dispatch mutation,
hash-valid512RGBA PNG with matching filename/descriptor hashes but invalid opaque
border, old Workbench descriptor, omitted registry entry and actual built-square
selector changed to low. Every RED was followed by exact restoration GREEN.
All2713 protected source/frame/floor/alias/selector/runtime files restored exactly.

Final six focused suites:23passed/1generic optional Blender-on-PATH skip; actual
pinned Blender renders and controls ran separately. Both strict TypeScript
targets exit0. No test assertion or PNG validation was disabled.
[Exact integration handoff](INTEGRATION_HANDOFF.md) carries source/descriptor/frame
pins, executable commands and the pending actual-game boundary. No browser,
server, build, fullverify, native acceptance or global style adoption claimed.
