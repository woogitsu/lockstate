"""Publish ground-level mown grass in the existing 24×3 oblique grid."""
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

SOURCE = modules.ROOT / "assets/source/blender/floor.terrain.grass.blend"
ASSET_ID = "floor.terrain.grass"
SLUG = "floor-terrain-grass"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.setup_scene()
    modules.YAW = tuple(range(-180, 180, 15))
    modules.append_collection(SOURCE, ASSET_ID)
    modules.render_module(ASSET_ID, SLUG, SOURCE, [])
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = [entry for entry in registry["entries"] if entry["assetId"] != ASSET_ID]
    entries.append({"assetId": ASSET_ID,
                    "manifest": f"/game-content/oblique-{SLUG}.v1.json"})
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
