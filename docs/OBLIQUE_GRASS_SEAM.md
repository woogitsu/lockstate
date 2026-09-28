# Grass beside dirt in the rotating world

The real `/?oblique-preview=1` app starts on dirt, and its current UI has no terrain paint control. To inspect grass without changing the game, `tooling/qa-live-oblique-grass-seam.mjs` opens the actual `ObliqueWorldScene` browser harness and changes only its served fixture response: an 8×8 world has dirt on one side and grass on the other. The checked-in renderer and scene files remain untouched. Five 1920×1080 screenshots show the same boundary at yaw −90°, −45°, 0°, 45°, and 90°.

The largest material problem is that grass remains a flat green surface beside the now textured dirt module. The older `terrain.grass.mown` catalog mesh is a raised 0.08-tile mat; rendering it directly for oblique use adds a visible height lip and heavy repeated tile edges. This change authors a ground-level plane with periodic olive turf material and publishes `floor.terrain.grass` at the shared ground pivot. In the candidate comparison, the grass gains restrained texture without a raised edge or dark per-tile border. The **hard color boundary** between the two terrain IDs remains; blending that boundary would require neighbor-aware selection in the scene and is outside this art-only PR.

- Source: `assets/source/blender/floor.terrain.grass.blend`.
- Renderer: `tooling/blender/render-oblique-grass-terrain.py`.
- Manifest: `public/game-content/oblique-floor-terrain-grass.v1.json`.
- 24 yaw poses × elevations 25°, 45°, 65°, 512 px transparent frames, 64 px/tile, pivot `(256,256)`.

| Yaw | Live renderer fixture | Flat grass with Blender dirt | Blender grass with Blender dirt |
| --- | --- | --- | --- |
| −90° | [image](evidence/oblique-grass-seam/live-yaw-90.png) | [image](evidence/oblique-grass-seam/candidate-before-yaw-90.png) | [image](evidence/oblique-grass-seam/candidate-after-yaw-90.png) |
| −45° | [image](evidence/oblique-grass-seam/live-yaw-45.png) | [image](evidence/oblique-grass-seam/candidate-before-yaw-45.png) | [image](evidence/oblique-grass-seam/candidate-after-yaw-45.png) |
| 0° | [image](evidence/oblique-grass-seam/live-yaw0.png) | [image](evidence/oblique-grass-seam/candidate-before-yaw0.png) | [image](evidence/oblique-grass-seam/candidate-after-yaw0.png) |
| 45° | [image](evidence/oblique-grass-seam/live-yaw45.png) | [image](evidence/oblique-grass-seam/candidate-before-yaw45.png) | [image](evidence/oblique-grass-seam/candidate-after-yaw45.png) |
| 90° | [image](evidence/oblique-grass-seam/live-yaw90.png) | [image](evidence/oblique-grass-seam/candidate-before-yaw90.png) | [image](evidence/oblique-grass-seam/candidate-after-yaw90.png) |

The registry contract went red with 22 published modules against 23 expected, then the registry, catalog and determinism suites passed 9/9 after rendering. Repeating the Blender 5.2 render produced the same catalog SHA256. Game-scene selection of terrain ID `grass` remains the integration branch's responsibility; these screenshots do not claim that the current app already loads this asset.
