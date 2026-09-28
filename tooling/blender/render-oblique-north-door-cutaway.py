"""Render the open north cell door with a lowered frame and leaf."""
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

ASSET_ID = "door.interior.open.cutaway"
SLUG = "cell-door-north-cutaway"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.YAW = tuple(range(-180, 180, 15))
    modules.setup_scene()
    modules.append_collection(modules.WALL, "wall.interior.doorframe.cutaway")
    leaf = modules.append_collection(modules.LEAF, "door.interior.leaf.open")
    hinge = next((item for item in leaf.all_objects if item.name == "Open leaf hinge pivot"), None)
    if hinge is None:
        raise RuntimeError("Open door source lacks hinge pivot")
    hinge.scale.z = 0.52 / 2.28
    bpy.context.view_layer.update()
    modules.render_module(ASSET_ID, SLUG, modules.LEAF, [modules.WALL])

    existing = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = []
    for entry in existing["entries"]:
        if entry["assetId"] == ASSET_ID:
            continue
        entries.append(entry)
        if entry["assetId"] == "door.interior.open.full":
            entries.append({"assetId": ASSET_ID,
                            "manifest": f"/game-content/oblique-{SLUG}.v1.json"})
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
