"""Append four seamless water tiles to the canonical Blender environment scene.

Run with Blender 5.2 on environment.mvp.catalog.blend. Existing collection
origins and material assignments remain untouched. Re-running is idempotent.
"""

import importlib.util
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
source = Path(__file__).with_name("create-environment-catalog.py")
spec = importlib.util.spec_from_file_location("environment_catalog", source)
catalog = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalog)

catalog.MATERIALS["water_surface"] = catalog.still_water_material()
catalog.MATERIALS["water_glint"] = catalog.material(
    "Water broken sky reflection", (0.16, 0.43, 0.47, 1), 0.28)
catalog.MATERIALS["water_glint_dim"] = catalog.material(
    "Water subdued reflection", (0.07, 0.30, 0.34, 1), 0.35)

ids = ["terrain.water.still"] + [f"terrain.water.still.variant-{suffix}" for suffix in "bcd"]
existing_origin = bpy.data.objects.get(f"{ids[0]}.origin")
if existing_origin is not None:
    next_slot = round(existing_origin.location.y / 7) * 6 + round(existing_origin.location.x / 7)
else:
    origins = [obj for obj in bpy.data.objects if obj.name.endswith(".origin")]
    next_slot = 1 + max(round(obj.location.y / 7) * 6 + round(obj.location.x / 7) for obj in origins)
for asset_id in ids:
    existing = bpy.data.collections.get(asset_id)
    if existing is not None:
        for obj in list(existing.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)

for offset, asset_id in enumerate(ids):
    catalog.create_model(asset_id, (1, 1), next_slot + offset)
    collection = bpy.data.collections[asset_id]
    assert collection["assetId"] == asset_id
    assert tuple(collection["footprintTiles"]) == (1, 1)
    assert len(collection.objects) == 9  # origin, continuous mat and seven reflections

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
