# Canonical cell and corridor angle study

This is a controlled Blender image grid for choosing how the adjustable world
view should be rendered. It is not a Phaser implementation or a new gameplay
room. The [wall module kit](WALL_CAMERA_ART_PLAN.md) supplies the authored
straight runs, corners and door frame; the cell floor, bed, open door leaf and
orange actor are neutral scene stand-ins.

## Reproduce

From the repository root, with pinned Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tooling/blender/render-interior-cell-angle-study.py
```

The source scene is `assets/source/blender/interior-cell-angle-study.blend`,
saved with the central camera at yaw 0°, elevation 45°. The same model, wall
instances, open door leaf, actor, bed, material palette, one area light and
world ambient remain fixed for all nine renders. Only camera position and
rotation change. The source wall collection is loaded from
`wall.interior.cutaway.blend` rather than reconstructed for the study.

The camera is orthographic at scale 16.5 and aims at `(0, 1, 1)` from radius
12. Yaw is −45°, 0°, +45° relative to the corridor's south-facing view;
elevation is 25°, 45°, 65°. Every output is 1280 × 720 RGBA. The fixed area
light is at `(−4, −5, 9)`, energy 900, disk size 5, with ambient strength
0.6. The exact per-image camera coordinates, instance positions and SHA-256
values are in `assets/rendered/camera-study/manifest.json`. Cycles CPU uses
24 samples and denoising; no adaptive sampling. Two consecutive complete
generations on Blender 5.2.1 produced identical SHA-256 values for all nine
canonical PNGs.

## What the nine views show

| Camera yaw | 25° elevation | 45° elevation | 65° elevation |
| --- | --- | --- | --- |
| −45° | [West wall hides the actor](../assets/rendered/camera-study/cell-yaw-45-elev25.png) | [Actor torso reappears](../assets/rendered/camera-study/cell-yaw-45-elev45.png) | [Actor and bed readable](../assets/rendered/camera-study/cell-yaw-45-elev65.png) |
| 0° | [Actor and doorway visible](../assets/rendered/camera-study/cell-yaw+00-elev25.png) | [Actor, bed and doorway visible](../assets/rendered/camera-study/cell-yaw+00-elev45.png) | [Actor and bed from above](../assets/rendered/camera-study/cell-yaw+00-elev65.png) |
| +45° | [East wall hides bed](../assets/rendered/camera-study/cell-yaw+45-elev25.png) | [Bed partly hidden](../assets/rendered/camera-study/cell-yaw+45-elev45.png) | [Actor and bed mostly visible](../assets/rendered/camera-study/cell-yaw+45-elev65.png) |

As a reproducible visibility proxy, thresholding the orange actor color
(`R > 125`, `R > 1.55G`, `R > 1.7B`, `G > 30`) yields **206** orange pixels at
−45°/25°, against **2,528** at 0°/25°. That is an 92% loss of visible actor
color at the low left angle. At −45°/45° the count rises to 1,148 and at
−45°/65° to 1,598. These counts measure visible orange pixels in the saved
images, not actor area in world units; changes in projection also affect them.

## Seam and occlusion findings

- The near wall is cut away and the side/back walls stay full in **every**
  render. Rotating or elevating the camera alone does not adapt the cutaway.
  At −45°/25° the west full wall hides the actor despite the open near side.
- A dark vertical gap is visible where the west straight wall meets the
  north-west corner at −45°. The opposite corner/straight joint shows a
  similar detachment at +45°. The central head-on view conceals much of this.
  A shared tile-center pivot is therefore insufficient to guarantee a sealed
  seam: the corner arm endpoints and straight-run centerlines need a common
  edge-placement contract before runtime selection.
- The open leaf is a deliberately simple door stand-in. Its frame is authored
  Blender art. The low front wall exposes the door gap, but full-height corner
  modules on a near side would hide it at oblique angles.
- Nine pre-rendered views can measure discrete camera choices. They do not
  establish smooth interpolation between them or correct wall depth order in
  Phaser. Those are renderer decisions and are outside this study.

The contract test checks the full 3 × 3 grid, fixed lighting and scale,
source wall hash, each camera coordinate and the nine PNG hashes. Mutating the
central entry's elevation from 45° to 46° made it fail; the restored manifest
passed.
