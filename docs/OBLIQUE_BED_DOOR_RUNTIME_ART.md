# Oblique bed and open-door modules

This batch extends the [wall module runtime pipeline](OBLIQUE_MODULE_RUNTIME_ART.md)
with two isolated Blender modules. The cell bed comes from
`environment.mvp.catalog.blend` collection
`furniture.cell.bed.single.variants`. The open door composes the full
galvanized frame from `wall.interior.cutaway.blend` with the walnut hinged
leaf from `door.interior.leaf.open.blend`. It renders as one transparent module
so the aperture and its leaf can be selected together.

Each module has nine poses (yaw −45°/0°/+45° × elevation 25°/45°/65°),
512 × 512 RGBA frames, orthographic scale 8, 64 px/tile and camera target at
world ground origin. The shared (256, 256) pivot can be used by the future
oblique world painter without a pose-dependent image offset. Content-hashed
PNG URLs and source hashes live in the per-module manifests; the
[`registry`](../public/game-content/oblique-module-registry.v1.json) resolves
logical asset IDs to those manifests. The same TypeScript selector and Phaser
texture loader used for the wall serve the bed and door.

The [browser preview](../art-angle-preview.html) is a real Phaser scene at
1920 × 1080. It loaded all 27 PNGs with HTTP 200 and switched the texture
from wall 0°/45° to bed +45°/25° and door −45°/65° using the module and
angle controls. The normal-size view on its right uses the authored scale;
the enlarged view on the left exposes the modeled materials and silhouette.
Screenshots are saved in the system temporary folder as
`lockstate-oblique-wall-yaw0-elev45.png`,
`lockstate-oblique-bed-yaw45-elev25.png`, and
`lockstate-oblique-door-yaw-45-elev65.png`.

Visual review: the bed's grey woven mattress, white pillow, muted orange
blanket and dark rails remain separate at +45°/25°. The open door's metal
frame retains a clear centre while its hinged wooden leaf reads at the
opposite shallow angle; at −45°/65° the leaf is intentionally near edge-on.
The real game-scene draw order and angle controls depend on the separate
oblique world painter. This batch does not change gameplay, HUD or simulation.
