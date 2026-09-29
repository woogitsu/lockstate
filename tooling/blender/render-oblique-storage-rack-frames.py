"""Publish the existing cell storage rack on the complete oblique pose grid."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy

script_dir = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("oblique_bed_door", script_dir / "render-oblique-bed-door-frames.py")
assert spec and spec.loader
modules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modules)

ASSET_ID = "furniture.storage.rack.wooden"
SLUG = "cell-storage-rack"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.setup_scene()
    modules.YAW = tuple(range(-180, 180, 15))
    collection = modules.append_collection(modules.CATALOG, ASSET_ID)
    origin = next((item for item in collection.all_objects if item.name == ASSET_ID + ".origin"), None)
    if origin is None:
        raise RuntimeError(f"{ASSET_ID} lacks its bottom-center origin")
    origin.location = (0, 0, 0)
    bpy.context.view_layer.update()
    modules.render_module(ASSET_ID, SLUG, modules.CATALOG, [])
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = registry["entries"]
    replacement = {"assetId": ASSET_ID, "manifest": f"/game-content/oblique-{SLUG}.v1.json"}
    index = next((i for i, entry in enumerate(entries) if entry["assetId"] == ASSET_ID), None)
    if index is None:
        entries.append(replacement)
    else:
        entries[index] = replacement
    modules.pipeline_common.write_text(REGISTRY, json.dumps(registry, indent=2) + "\n")


if __name__ == "__main__":
    main()
