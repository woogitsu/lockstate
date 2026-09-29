"""Isolate the authored 2×1 employee desk for the oblique game camera.

The gallery stays immutable, preserving all other source hashes. Its packed
grey-oak texture and visible ledger, lamp, drawer and paper tray travel with
this dedicated source instead of relying on the gallery at render time.
"""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
SOURCE = ROOT / "assets/source/blender/furniture.office.desk.employee.blend"
ASSET_ID = "furniture.office.desk.employee.variants"


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
        raise RuntimeError("Employee desk lacks its ground origin")
    origin.location = (0, 0, 0)
    bpy.context.view_layer.update()
    bpy.ops.file.pack_all()
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE), check_existing=False, compress=True)


if __name__ == "__main__":
    main()
