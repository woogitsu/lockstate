"""Publish four dirt-to-grass overlay directions in the 24×3 camera grid."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "oblique_bed_door", SCRIPT_DIR / "render-oblique-bed-door-frames.py")
assert spec and spec.loader
modules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modules)

SOURCE = modules.ROOT / "assets/source/blender/floor.terrain.dirt-grass.edge.blend"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"
DIRECTIONS = ("north", "east", "south", "west")


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.YAW = tuple(range(-180, 180, 15))
    for direction in DIRECTIONS:
        modules.setup_scene()
        asset_id = f"floor.terrain.dirt-grass.edge.{direction}"
        modules.append_collection(SOURCE, asset_id)
        modules.render_module(asset_id, f"floor-dirt-grass-edge-{direction}", SOURCE, [])
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = [entry for entry in registry["entries"]
               if not entry["assetId"].startswith("floor.terrain.dirt-grass.edge.")]
    entries.extend({"assetId": f"floor.terrain.dirt-grass.edge.{direction}",
                    "manifest": f"/game-content/oblique-floor-dirt-grass-edge-{direction}.v1.json"}
                   for direction in DIRECTIONS)
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
