# Kitchen stove oblique module

Procedural Blender asset for the 2x1 commercial kitchen stove. The module uses the shared adjustable orthographic camera contract: 12 yaw poses (30 degrees) and six elevations (20–70 degrees), transparent 128px RGBA frames, and a 64px-per-tile nominal scale. The top deck, four burners, twin oven windows, rear splash guard, controls, status light and feet are separate readable meshes so the camera can expose the silhouette at game zoom.

- Source: `assets/source/blender/furniture.kitchen.stove.variants.blend`
- Rebuild: `blender -b --python assets/source/blender/scripts/build_kitchen_stove.py`
- Runtime catalog: `public/game-content/oblique-furniture.kitchen-stove.v1.json`
- Registry id: `furniture.kitchen.stove.variants`
- Footprint: 2 x 1 tiles
