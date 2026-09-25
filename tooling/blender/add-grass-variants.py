"""Add three mown-turf variants to the refined canonical Blender scene.

Run on environment.mvp.catalog.blend with Blender 5.2. This calls the shared
geometry builder for the new collections only, preserving every existing
refined object and its origin. Running twice is idempotent.
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

original = bpy.data.collections["terrain.grass.mown"]
def material_of(name):
    obj = original.objects[name]
    return obj.data.materials[0]

catalog.MATERIALS["grass_base"] = material_of("Mown grass mat")
catalog.MATERIALS["grass_blade_dark"] = material_of("Short grass blade.0")
catalog.MATERIALS["grass_blade_light"] = material_of("Short grass blade.1")

ids = [f"terrain.grass.mown.variant-{suffix}" for suffix in "bcd"]
for asset_id in ids:
    existing = bpy.data.collections.get(asset_id)
    if existing is not None:
        for obj in list(existing.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        bpy.data.collections.remove(existing)

# Existing origins are part of the reviewed scene; append new slots after all
# occupied catalogue positions rather than rebuilding and shifting them.
origins = [obj for obj in bpy.data.objects if obj.name.endswith(".origin")]
next_slot = 1 + max(round(obj.location.y / 7) * 6 + round(obj.location.x / 7) for obj in origins)
for offset, asset_id in enumerate(ids):
    catalog.create_model(asset_id, (1, 1), next_slot + offset)
    collection = bpy.data.collections[asset_id]
    assert collection["assetId"] == asset_id
    assert tuple(collection["footprintTiles"]) == (1, 1)
    assert len(collection.objects) == 130  # origin, mat, 110 blades, 18 clusters

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
