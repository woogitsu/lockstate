# Oblique cell module visual audit (2026-09-28)

The same cell and corridor arrangement was composed from the published transparent
module PNGs in a 1920×1080 browser canvas at elevation 45° and yaw −90°, −45°,
0°, 45°, and 90°. Each capture shows a 2× inspection view beside the native
64 px/tile view. The arrangement contains cell and corridor floors, a north
wall, west wall, west doorway, bed, prisoner, and guard. The browser harness is
`tooling/qa-oblique-cell-composite.mjs`; it reads the real published manifests
and image URLs. This is a module-composition inspection, not a claim about the
game scene's projector or its wall-occlusion rules.

| Yaw | Before | After |
| --- | --- | --- |
| −90° | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-before-yaw-90.png) | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-after-yaw-90.png) |
| −45° | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-before-yaw-45.png) | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-after-yaw-45.png) |
| 0° | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-before-yaw0.png) | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-after-yaw0.png) |
| 45° | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-before-yaw45.png) | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-after-yaw45.png) |
| 90° | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-before-yaw90.png) | [PNG](evidence/oblique-cell-lighting/lockstate-oblique-cell-composite-after-yaw90.png) |

## Finding and correction

The actor frame publisher loaded each original `.blend` file's directional-atlas
lights and colour grade. The wall, doorway, bed and floor publishers instead
created a neutral studio with a single soft north-west light. In the cell
composition this left the orange prisoner and blue guard with a different
light direction and flatter/darker fabric highlights than the furnishings.
`pipeline_common.configure_oblique_module_lighting()` now provides that one
studio to the environment and actor publishers. It disables only the source
file's lights for render; it does not modify the authored `.blend` source or
any gameplay data. Both actor manifests now select the corrected 72-frame
sets. The old content-hashed PNGs remain available for previously published
immutable image URLs.

Across all five views, the actors remain on the same ground pivot, the bed and
door retain their footprint, and the full/cutaway west variants continue to
produce the expected occlusion. Every module retains a 512×512 frame,
`pivotPx: [256,256]`, and `nominalPixelsPerTile: 64`. The straight north and
west wall pieces leave a visible corner seam in this deliberately minimal
composition because the existing corner piece was not included. This audit
does not attribute that join to the Blender geometry; the game consumer must
choose the corner piece when such edges meet.

## Reproduce

Serve this worktree with Vite and set the preview-origin environment variable to that local
origin. Run `node tooling/qa-oblique-cell-composite.mjs` for the current art.
Set the actor-baseline environment variable to the parent commit and run the same command
for the prior actor manifests. The captures are written to the system temp
directory. Re-render actors with pinned Blender 5.2 using
`blender -b -t 4 --python tooling/blender/render-oblique-actor-frames.py`.

Two consecutive Blender runs produced the same published filenames and frame
hashes. The actor manifests changed in all 144 frame hashes after the intended
lighting correction. The pinned live Blender determinism test and the oblique
registry/catalog contracts passed; the 1920×1080 captures were visually
reviewed at native and 2× scale.

## North-west corner follow-up

The source wall kit already had `wall.interior.corner.inner.full` and
`wall.interior.corner.inner.cutaway`, but neither had oblique frames in the
runtime registry. The follow-up publisher rotates those same authored meshes
by −90° to point the two arms east and south for the cell's north-west join.
It publishes 72 yaw/elevation poses for each height with the shared 512×512
frame, 64 px/tile scale, and `(256,256)` pivot. The manifests are selected by
the existing oblique module loader; the game scene still needs to choose this
corner identity at a matching join.

The comparison harness uses `LOCKSTATE_USE_CORNER=0` for the pair of straight
pieces and the default setting for the authored corner. The same cell,
corridor, actors and bed are used in each pair:

| Yaw | Straight join | Authored corner |
| --- | --- | --- |
| −90° | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-before-yaw-90.png) | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-after-yaw-90.png) |
| −45° | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-before-yaw-45.png) | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-after-yaw-45.png) |
| 0° | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-before-yaw0.png) | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-after-yaw0.png) |
| 45° | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-before-yaw45.png) | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-after-yaw45.png) |
| 90° | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-before-yaw90.png) | [PNG](evidence/oblique-cell-corner/lockstate-oblique-cell-corner-after-yaw90.png) |

At yaw 45° the straight pieces leave crossed metal caps above the join; the
authored corner forms one continuous cap and plaster face. At yaw 0° and 90°
the cap and vertical face also line up without a projecting straight-piece
end. At negative yaw the low corner preserves visibility into the cell. The
comparison is a browser module composition; it does not prove the unmerged
world scene's occlusion or automatic corner selection. A repeated Blender 5.2.1
render produced the same 144 image hashes. The registry/catalog test first
failed for the two missing entries, then passed with 17 complete entries.
