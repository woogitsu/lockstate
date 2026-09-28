# Cell scene seam and cutaway follow-up

This follows the [nine-angle art study](CAMERA_ANGLE_ART_STUDY.md) on the
same cell geometry, camera positions, orthographic scale 16.5, 1280 × 720
resolution, and one area light at `[-4, -5, 9]` with energy 900 and size 5.
The original nine images and their source `.blend` are preserved in
[`baseline/`](../assets/rendered/camera-study/baseline/manifest.json).

## Corner to straight seam

The previous corner arms were offset by 0.38 tile. Their plaster and coping
did not reach the straight run's x=0/y=0 centerline, leaving dark vertical
gaps from oblique cameras. Inner and outer corners now use one concave prism
per material. Arms follow the same centerlines as straight modules, have the
same 0.25-tile thickness, and terminate at the neighboring tile edge
(`±0.5`). The center tile pivot remains `[0.5, 0.5]`.

| Angle | Before | Joined corner |
| --- | --- | --- |
| −45° yaw, 25° elevation | [Gap at northwest joint](../assets/rendered/camera-study/baseline/cell-yaw-45-elev25.png) | [Joint closed](../assets/rendered/camera-study/cell-yaw-45-elev25.png) |
| +45° yaw, 65° elevation | [Gaps at east joints](../assets/rendered/camera-study/baseline/cell-yaw+45-elev65.png) | [Joints closed](../assets/rendered/camera-study/cell-yaw+45-elev65.png) |

## Low western camera visibility

At −45°/25°, the full west wall still hides the actor after sealing the
joint. For this art study, the measured candidate rule is **yaw ≤ −30° and
elevation ≤ 30°**: select the cutaway variants for west wall modules 1–3 and
the northwest inner corner. The [candidate render](../assets/rendered/camera-study/cell-yaw-45-elev25-west-cutaway.png)
keeps the exact −45°/25° camera, lighting, scale and scene; only those four
module collections change. It is an authored visibility option, not a
runtime selection rule yet.

The visible orange actor proxy uses `R>125`, `R>1.55G`, `R>1.7B`, `G>30` on
decoded RGBA pixels. It counts **206** in the original image, **205** after
the seam repair with full west modules, and **3,554** with the candidate
cutaway, a 17.3× gain over the repaired full-wall view. The threshold
measures visible color, not world-space actor area. The rule has been tested
at the sampled low western angle only; other positions and continuous
angles need the renderer's own occlusion policy.

The Blender script saves all ten images and their SHA-256 values in the
[manifest](../assets/rendered/camera-study/manifest.json). Its contract test
checks the original nine samples, source hash, camera grid, candidate choice,
visibility gain and PNG hashes. This PR changes art sources and evidence;
runtime projection and gameplay are separate work.
