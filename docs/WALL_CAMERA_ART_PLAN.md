# Interior wall art for an adjustable camera

## First authored module

`tooling/blender/build-interior-wall-module.py` generates a one-tile warm
plaster wall in Blender 5.2 and two transparent 256 × 256 renders:
`wall.interior.module.full` (2.50 tiles high) and
`wall.interior.module.cutaway` (0.52 tiles high). The colors follow the current
interior wall's warm plaster, blue-grey coping and dark skirting. Both variants
share the same footprint, model origin and orthographic oblique camera, so a
renderer can swap them without changing the simulation wall. The `.blend`
source and output manifest are committed alongside the PNGs.

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
4. Add door frames, corners and wall junctions as separate Blender modules
   before enabling arbitrary camera rotation. The current pair is a straight
   wall proof, not a complete architecture set.

The source script requires the pinned Blender 5.2 version. The local run on
2026-09-28 used Blender 5.2.1 LTS and rendered both variants successfully.
The script removes Blender's changing PNG metadata; two consecutive runs on
this machine produced identical SHA-256 values for the rendered full wall.
The contract test checks both committed images against their manifest hashes,
size, alpha format and common footprint. Mutating the cutaway height from
0.52 to 0.53 made it fail, then the restored manifest passed.
