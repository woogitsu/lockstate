# Four-cell wing and shower oblique art review

The same 15×4 tile module composition was drawn at 1920×1080 for yaw −90°,
−45°, 0°, 45°, and 90° at elevation 45°. It contains four three-tile-wide
cells, a corridor, and a three-tile-wide shower room. The browser harness
`tooling/qa-oblique-cell-wing.mjs` loads the published oblique registry,
manifests, and transparent PNGs at native 64 px/tile scale. This is a module
composition inspection, not the game scene's projector or room logic.

| Yaw | Prior shower art gap | Ceramic floor and wall shower |
| --- | --- | --- |
| −90° | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-before-yaw-90.png) | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-after-yaw-90.png) |
| −45° | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-before-yaw-45.png) | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-after-yaw-45.png) |
| 0° | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-before-yaw0.png) | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-after-yaw0.png) |
| 45° | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-before-yaw45.png) | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-after-yaw45.png) |
| 90° | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-before-yaw90.png) | [PNG](evidence/oblique-cell-wing-shower/lockstate-oblique-cell-wing-after-yaw90.png) |

## Finding and correction

Before this change the oblique registry had neither `floor.shower.ceramic`
nor `fixture.shower.head`. At native scale the shower room was identical to
an empty cell. The existing Blender catalog already contained ceramic tile
and a shower head, so the floor could be published directly. A straight
oblique render of the catalog shower head looked like a circular floor basin.
The oblique publisher derives a slim wall riser, small control panel,
overhead arm and spray disc from the catalog's material palette. It is mounted
against the north edge of a full tile. This derivation changes only the
oblique render; the existing top-down game art and source catalog remain
unchanged.

Both assets are registered with 24 yaw positions at 15° intervals and three
elevations (25°, 45°, 65°). They keep the shared 512×512 transparent frame,
`pivotPx: [256,256]`, and 64 px/tile. The 144 selected images total 1,803,607
bytes. The registry test was red for the two missing identities before the
render and green after publication. Blender 5.2.1 rerendered the frames with
the same content hashes.

The shower room becomes distinct in the overview because the blue-grey
ceramic floor contrasts with cell concrete, and the narrow head reads as wall
plumbing rather than a basin. At yaw 45° and 90° the near full-height side
wall hides some of the shower; scene-level cutaway selection remains the
integration owner's work. This PR supplies selectable art modules, not an
automatic consumer in the unmerged world scene.

To reproduce, serve the worktree with Vite, set `LOCKSTATE_PREVIEW_ORIGIN` to
that local origin, and run `node tooling/qa-oblique-cell-wing.mjs`. Set
`LOCKSTATE_SHOW_SHOWER=0` for the baseline images. Render the art with pinned
Blender 5.2 using `blender -b -t 4 --python-exit-code 1 --python
tooling/blender/render-oblique-shower-room.py`.
