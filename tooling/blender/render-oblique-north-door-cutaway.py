"""Render the open north cell doorway as a low frame with a clear aperture."""
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

ASSET_ID = "door.interior.open.cutaway"
SLUG = "cell-door-north-cutaway"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.YAW = tuple(range(-180, 180, 15))
    modules.setup_scene()
    frame = modules.append_collection(modules.WALL, "wall.interior.doorframe.cutaway")
    modules.add_cutaway_threshold(frame)
    modules.render_module(ASSET_ID, SLUG, modules.WALL, [])

    existing = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = existing["entries"]
    updated = {"assetId": ASSET_ID, "manifest": f"/game-content/oblique-{SLUG}.v1.json"}
    index = next((index for index, entry in enumerate(entries) if entry["assetId"] == ASSET_ID), None)
    if index is None:
        after_full = next(index for index, entry in enumerate(entries)
                          if entry["assetId"] == "door.interior.open.full")
        entries.insert(after_full + 1, updated)
    else:
        entries[index] = updated
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
