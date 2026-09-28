"""Isolate Canteen terrazzo and give it a quiet warm stone finish.

The shared gallery .blend stays immutable so unrelated art source hashes do not
move. Room identity tint is applied by the game and is not changed here.
"""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
SOURCE = ROOT / "assets/source/blender/floor.canteen.warm-terrazzo.blend"
ASSET_ID = "floor.canteen.terrazzo"


def recolor(name: str, new_name: str, color: tuple[float, float, float, float]) -> None:
    item = bpy.data.materials[name]
    item.name = new_name
    item.diffuse_color = color
    item.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = color


def main() -> None:
    pipeline_common.require_blender_version()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(CATALOG), link=False) as (available, loaded):
        if ASSET_ID not in available.collections:
            raise RuntimeError(f"Missing {ASSET_ID} in {CATALOG.name}")
        loaded.collections = [ASSET_ID]
    collection = loaded.collections[0]
    bpy.context.scene.collection.children.link(collection)
    origin = next((item for item in collection.all_objects
                   if item.name == ASSET_ID + ".origin"), None)
    if origin is None:
        raise RuntimeError("Canteen floor lacks its tile origin")
    origin.location = (0, 0, 0)

    # Matte limestone terrazzo preserves the fine joints and aggregate from
    # the authored model. The desaturated ground leaves wooden seating clear.
    recolor("Warm washable canteen terrazzo", "Muted limestone canteen terrazzo",
            (0.62, 0.51, 0.32, 1))
    recolor("Fine muted terracotta grout", "Fine taupe canteen grout",
            (0.40, 0.36, 0.31, 1))
    recolor("Pale limestone chips", "Pale limestone canteen chips",
            (0.74, 0.68, 0.56, 1))
    recolor("Ochre mineral chips", "Muted ochre canteen chips",
            (0.46, 0.41, 0.34, 1))
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), check_existing=False, compress=True)


if __name__ == "__main__":
    main()
