"""Isolate the institutional linoleum tile as a calm Reception floor.

The shared environment catalog stays immutable. Room identity tint is still
applied in the game, while this source only changes the physical substrate.
"""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
SOURCE = ROOT / "assets/source/blender/floor.reception.linoleum.blend"
BASE_ASSET_ID = "floor.linoleum.institutional"
ASSET_ID = "floor.reception.linoleum"


def recolor(name: str, new_name: str, color: tuple[float, float, float, float]) -> None:
    item = bpy.data.materials[name]
    item.name = new_name
    item.diffuse_color = color
    item.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = color


def main() -> None:
    pipeline_common.require_blender_version()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(CATALOG), link=False) as (available, loaded):
        if BASE_ASSET_ID not in available.collections:
            raise RuntimeError(f"Missing {BASE_ASSET_ID} in {CATALOG.name}")
        loaded.collections = [BASE_ASSET_ID]
    collection = loaded.collections[0]
    bpy.context.scene.collection.children.link(collection)
    origin = next((item for item in collection.all_objects
                   if item.name == BASE_ASSET_ID + ".origin"), None)
    if origin is None:
        raise RuntimeError("Institutional linoleum lacks its tile origin")
    collection.name = ASSET_ID
    origin.name = ASSET_ID + ".origin"
    origin.location = (0, 0, 0)

    # A washable pale buff linoleum contrasts with compacted earth without
    # competing with the blue-grey desk, warm chairs, or the existing room tint.
    recolor("Institutional cool grey-green linoleum", "Reception pale buff linoleum",
            (0.68, 0.65, 0.57, 1))
    recolor("Institutional linoleum fine joint", "Reception fine taupe joint",
            (0.48, 0.47, 0.43, 1))
    recolor("Linoleum pale mineral flecks", "Reception cream mineral flecks",
            (0.78, 0.75, 0.67, 1))
    recolor("Linoleum dark mineral flecks", "Reception muted stone flecks",
            (0.53, 0.51, 0.46, 1))
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), check_existing=False, compress=True)


if __name__ == "__main__":
    main()
