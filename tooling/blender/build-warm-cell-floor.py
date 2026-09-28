"""Isolate the authored cell floor and give it a warm sealed concrete finish.

The shared environment catalog stays immutable: changing its .blend would
invalidate unrelated corridor, canteen, terrain, and fixture manifests.
"""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
SOURCE = ROOT / "assets/source/blender/floor.cell.warm-concrete.blend"
ASSET_ID = "floor.cell.sealed-concrete"


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
        raise RuntimeError("Cell floor lacks its tile origin")
    origin.location = (0, 0, 0)

    concrete = bpy.data.materials["Pale sealed cool grey cell concrete"]
    ramp = next(node for node in concrete.node_tree.nodes
                if node.bl_idname == "ShaderNodeValToRGB").color_ramp
    for element, color in zip(sorted(ramp.elements, key=lambda item: item.position), (
            (0.48, 0.41, 0.33, 1),
            (0.55, 0.48, 0.39, 1),
            (0.61, 0.54, 0.45, 1))):
        element.color = color
    concrete.name = "Warm sealed cell concrete"
    concrete.diffuse_color = (0.55, 0.48, 0.39, 1)

    aggregate = {
        "Cell concrete pale aggregate": (0.71, 0.64, 0.54, 1),
        "Cell concrete fine dark aggregate": (0.37, 0.33, 0.29, 1),
    }
    for name, color in aggregate.items():
        item = bpy.data.materials[name]
        item.diffuse_color = color
        item.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = color
    bpy.context.view_layer.update()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), check_existing=False, compress=True)


if __name__ == "__main__":
    main()
