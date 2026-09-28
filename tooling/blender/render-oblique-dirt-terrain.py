"""Publish the compacted-earth tile for every 15-degree yaw and three elevations."""
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

SOURCE = modules.ROOT / "assets/source/blender/floor.terrain.dirt.blend"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"
ASSET_ID = "floor.terrain.dirt"
SLUG = "floor-terrain-dirt"


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.setup_scene()
    modules.YAW = tuple(range(-180, 180, 15))
    modules.append_collection(SOURCE, ASSET_ID)
    modules.render_module(ASSET_ID, SLUG, SOURCE, [], resolution_px=128)
    existing = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = [entry for entry in existing["entries"] if entry["assetId"] != ASSET_ID]
    entries.append({"assetId": ASSET_ID,
                    "manifest": f"/game-content/oblique-{SLUG}.v1.json"})
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
