"""Publish the existing timber-and-steel bench for every oblique camera pose."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy

_render_spec = importlib.util.spec_from_file_location(
    "render_oblique_bed_door_frames", Path(__file__).with_name("render-oblique-bed-door-frames.py"))
assert _render_spec and _render_spec.loader
_render = importlib.util.module_from_spec(_render_spec)
_render_spec.loader.exec_module(_render)

ASSET_ID = "furniture.corridor.bench.variants"
SLUG = "canteen-bench"
REGISTRY = _render.ROOT / "public/game-content/oblique-module-registry.v1.json"


def main() -> None:
    _render.pipeline_common.require_blender_version()
    _render.setup_scene()
    collection = _render.append_collection(_render.CATALOG, ASSET_ID)
    origin = next((item for item in collection.all_objects
                   if item.name == ASSET_ID + ".origin"), None)
    if origin is None:
        raise RuntimeError(f"{ASSET_ID} lacks bottom-center origin")
    origin.location = (0, 0, 0)  # the source catalog places objects in gallery slots
    bpy.context.view_layer.update()
    _render.YAW = tuple(range(-180, 180, 15))
    _render.render_module(ASSET_ID, SLUG, _render.CATALOG, [])

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    updated = {"assetId": ASSET_ID,
               "manifest": f"/game-content/oblique-{SLUG}.v1.json"}
    entries = registry["entries"]
    index = next((index for index, entry in enumerate(entries)
                  if entry["assetId"] == ASSET_ID), None)
    if index is None:
        entries.append(updated)
    else:
        entries[index] = updated
    _render.pipeline_common.write_text(REGISTRY, json.dumps(registry, indent=2) + "\n")


if __name__ == "__main__":
    main()
