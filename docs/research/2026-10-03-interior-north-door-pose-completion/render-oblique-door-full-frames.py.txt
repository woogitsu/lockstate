"""Publish the existing open cell door for all oblique yaw poses."""
from __future__ import annotations
import importlib.util, json
from pathlib import Path
import bpy

spec = importlib.util.spec_from_file_location("oblique_bed_door", Path(__file__).with_name("render-oblique-bed-door-frames.py"))
assert spec and spec.loader
modules = importlib.util.module_from_spec(spec); spec.loader.exec_module(modules)
ASSET_ID = "door.interior.open.full"; SLUG = "cell-door-open"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"

def main() -> None:
    modules.pipeline_common.require_blender_version(); modules.setup_scene(); modules.YAW = tuple(range(-180, 180, 15))
    frame = modules.append_collection(modules.WALL, "wall.interior.doorframe.full")
    leaf = modules.append_collection(modules.LEAF, "door.interior.leaf.open")
    modules.render_module(ASSET_ID, SLUG, modules.LEAF, [modules.WALL], resolution_px=512)
    frame.hide_render = True; leaf.hide_render = True
    registry = json.loads(REGISTRY.read_text(encoding="utf-8")); entries = registry["entries"]
    replacement = {"assetId": ASSET_ID, "manifest": f"/game-content/oblique-{SLUG}.v1.json"}
    index = next((i for i, entry in enumerate(entries) if entry["assetId"] == ASSET_ID), None)
    if index is None: entries.append(replacement)
    else: entries[index] = replacement
    modules.pipeline_common.write_text(REGISTRY, json.dumps(registry, indent=2) + "\n")

if __name__ == "__main__": main()
