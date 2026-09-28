"""Publish authored cell, corridor, and canteen floor tiles for full camera yaw."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "oblique_bed_door", SCRIPT_DIR / "render-oblique-bed-door-frames.py")
assert spec and spec.loader
modules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modules)

FLOORS = (
    ("floor.cell.sealed-concrete", "floor-cell"),
    ("floor.linoleum.institutional", "floor-corridor"),
    ("floor.canteen.terrazzo", "floor-canteen"),
)
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.setup_scene()
    modules.YAW = tuple(range(-180, 180, 15))
    for asset_id, slug in FLOORS:
        collection = modules.append_collection(modules.CATALOG, asset_id)
        origin = next((item for item in collection.all_objects
                       if item.name == asset_id + ".origin"), None)
        if origin is None:
            raise RuntimeError(f"{asset_id} has no tile origin")
        origin.location = (0, 0, 0)
        bpy.context.view_layer.update()
        modules.render_module(asset_id, slug, modules.CATALOG, [], resolution_px=128)
        collection.hide_render = True

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    floor_ids = {asset_id for asset_id, _ in FLOORS}
    entries = [entry for entry in registry["entries"] if entry["assetId"] not in floor_ids]
    entries.extend({"assetId": asset_id, "manifest": f"/game-content/oblique-{slug}.v1.json"}
                   for asset_id, slug in FLOORS)
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
