# Oblique cell fixtures at the game camera scale

This batch adds three already-used object models to the modular Blender
camera pipeline: `object.toilet` uses the existing combined
`fixture.cell.toilet_sink` model, `object.storage-rack` uses
`furniture.storage.rack.wooden`, and `object.chair` uses
`furniture.chair.wooden`. These mappings are present in the current game
catalog. The separately named `object.sink` is outside this batch and gets no
new gameplay or visual claim here.

`tooling/blender/render-oblique-cell-fixtures.py` reuses the same scene setup,
camera grid and manifest writer as the [bed and door modules](OBLIQUE_BED_DOOR_RUNTIME_ART.md).
Each model has nine transparent 512 × 512 frames at 64 px/tile with world
ground pivot (256, 256). The six-asset registry resolves each logical model
to a content-hashed frame manifest. The existing selector and Phaser loader
serve all 54 frames, so no camera, world scene, HUD or gameplay code changed.

## Full HD review

The Phaser preview ran in Chromium at 1920 × 1080 and loaded all **54/54**
frame URLs with HTTP 200. At yaw +45°/elevation 25°, it switched from the
wall, bed and door to each of the three fixtures and captured:

- `lockstate-oblique-cell-toilet-yaw45-elev25.png`
- `lockstate-oblique-cell-storage-rack-yaw45-elev25.png`
- `lockstate-oblique-cell-chair-yaw45-elev25.png`

The files are in the system temporary folder. The preview shows 3× inspection
and the authored 64 px/tile size together. At normal size the toilet's pale
bowl and turquoise cistern remain distinct; the rack keeps visible shelves
and stored goods; the chair retains its wooden seat and separate back and
front posts. The chair and rack are small because their game footprints are
one tile, so final in-game judgement still depends on the oblique painter's
floor, walls and depth ordering.

A second Blender 5.2.1 render produced identical hashes for all **27 PNGs and
four JSON files**. The registry contract test checks every source hash, frame
hash, angle and pivot. Removing the chair from the generator caused the test
to fail on its missing registry identity; restoring the generator and
rerendering made it pass. Full game-scene placement awaits the separate
oblique world painter.
