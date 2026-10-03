# Kitchen fridge oblique module

One-tile institutional refrigerator authored as a Blender scene for the adjustable oblique camera. The tall freezer and lower chilled door use separate handles and glass/enamel panels so they remain readable through camera yaw and elevation. `build_kitchen_fridge.py` deterministically emits the 12 × 6 transparent frame catalog.

- Source: `assets/source/blender/furniture.kitchen.fridge.variants.blend`
- Rebuild: `blender -b --python assets/source/blender/scripts/build_kitchen_fridge.py`
- Runtime catalog: `public/game-content/oblique-furniture.kitchen-fridge.v1.json`
- Footprint: 1 × 1 tile
