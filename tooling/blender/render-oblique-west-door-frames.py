"""Render open west-facing cell doors at full and cutaway wall heights."""
from __future__ import annotations

import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "oblique_bed_door", SCRIPT_DIR / "render-oblique-bed-door-frames.py")
assert spec and spec.loader
modules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modules)

VARIANTS = (
    ("door.interior.open.west.full", "wall.interior.doorframe.full", "cell-door-west-full", True),
    ("door.interior.open.west.cutaway", "wall.interior.doorframe.cutaway",
     "cell-door-west-cutaway", False),
)
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def render_variant(asset_id: str, frame_id: str, slug: str, include_leaf: bool) -> None:
    modules.setup_scene()
    frame = modules.append_collection(modules.WALL, frame_id)
    if not include_leaf:
        modules.add_cutaway_threshold(frame)
    leaf = modules.append_collection(modules.LEAF, "door.interior.leaf.open") if include_leaf else None
    west_turn = Matrix.Rotation(math.pi / 2, 4, "Z")
    for collection in (frame, leaf) if leaf is not None else (frame,):
        for item in collection.all_objects:
            if item.parent is None:
                item.matrix_world = west_turn @ item.matrix_world
    bpy.context.view_layer.update()
    modules.render_module(asset_id, slug, modules.LEAF if include_leaf else modules.WALL,
                          [modules.WALL] if include_leaf else [])


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.YAW = tuple(range(-180, 180, 15))
    cutaway_only = "--cutaway-only" in sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else False
    for asset_id, frame_id, slug, include_leaf in VARIANTS:
        if cutaway_only and include_leaf:
            continue
        render_variant(asset_id, frame_id, slug, include_leaf)
    existing = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = existing["entries"]
    for asset_id, _, slug, _ in VARIANTS:
        updated = {"assetId": asset_id, "manifest": f"/game-content/oblique-{slug}.v1.json"}
        index = next((index for index, entry in enumerate(entries) if entry["assetId"] == asset_id), None)
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
