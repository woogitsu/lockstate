# Still-water terrain

`terrain.water.still` is a one-tile Blender model for water already represented
in saved world terrain data. It is a quiet deep blue-green surface, with broad
periodic tonal movement and four irregular low-relief reflections. The tile is
opaque and reaches every frame edge. Its procedural sine fields agree at
opposite edges, while the small glints stay inset, so repeated copies meet
without a transparent margin or cut-off wave.

The restrained texture keeps rooms, walls and actors readable at the game's
64 px tile scale. The final 256 px overhead render was reviewed at native size,
from two oblique Blender cameras, and in the browser beside dirt and rock on a
1920×1080 saved-world fixture. This is an original model; no pixels from another
game or a concept sheet are used.

Rebuild the water collection by running `tooling/blender/add-water-terrain.py`
on `assets/source/blender/environment.mvp.catalog.blend` with Blender 5.2,
then run `tooling/blender/render-environment-objects.py` and
`tooling/build-rendered-art-catalog.mjs` through the ordinary environment-art
pipeline. The water image is consumed by `terrainFloorSprite('water')` when a
saved world contains water terrain; no terrain painting UI is required.
