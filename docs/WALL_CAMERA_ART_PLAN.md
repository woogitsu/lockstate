# Interior wall art for an adjustable camera

## First authored module

`tooling/blender/build-interior-wall-module.py` generates a warm plaster wall
kit in Blender 5.2: straight run, inner and outer corners, finished end,
door frame, T junction and four-way crossing. Each has full (2.50 tiles high)
and cutaway (0.52 tiles high) variants, for fourteen transparent 256 × 256
renders. The colors follow the current
interior wall's warm plaster, blue-grey coping and dark skirting. Every module
has a full 1 × 1 tile footprint and pivot at tile center `(0.5, 0.5)`, even
though its wall core is thinner. This keeps rotations and height swaps aligned.
The `.blend` source and output manifest are committed alongside the PNGs.

Generate with Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tooling/blender/build-interior-wall-module.py
```

The two images are an art module available under `public/assets/environment/modules/`.
The current Phaser world still uses its existing overhead wall face and cap.
It has no adjustable camera angle, depth sorting or cutaway selection yet; the
new images must not be selected in that renderer until those three rules are
implemented and verified against walls, doors and room contents. A simple
replacement would make high walls obscure cells without a way to inspect them.

## Integration order

1. Specify a camera angle range and a stable tile-to-screen projection. Keep
   the authoritative world coordinates and simulation snapshots unchanged.
2. Draw one full wall segment with neighboring floor and actor at 1920 × 1080.
   Verify that adjacent wall modules meet at the seam and preserve door gaps.
3. Switch to the low cutaway where the camera would otherwise hide the selected
   room or a character. Confirm the full/cutaway transition is legible at
   default zoom and does not change collision or room ownership.
4. Inspect the authored door frame, corner and junction orientations against
   the selected room boundary before enabling arbitrary camera rotation. The
   fourteen modules cover the core wall topology; the renderer must still
   choose orientation and cutaway state from the actual wall-edge graph.

The source script requires the pinned Blender 5.2 version. The local run on
2026-09-28 used Blender 5.2.1 LTS and rendered both variants successfully.
The script removes Blender's changing PNG metadata; two consecutive runs on
this machine produced identical SHA-256 values for all fourteen rendered modules.
The contract test checks all fourteen committed images against their manifest
hashes, size, alpha format, common footprint and center pivot. Mutating the
T junction pivot from `(0.5, 0.5)` to `(0.4, 0.5)` made it fail, then the
restored manifest passed. The crossing is an extruded polygon mesh so its
four arms share one surface; the first overlapping-box prototype produced
visible speckles at the joint and was replaced after visual inspection.
