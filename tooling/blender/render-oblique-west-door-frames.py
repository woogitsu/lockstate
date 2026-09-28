"""Render open west-facing cell doors at full and cutaway wall heights."""
from __future__ import annotations

import importlib.util
import json
import math
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
    ("door.interior.open.west.full", "wall.interior.doorframe.full", "cell-door-west-full", 1.0),
    ("door.interior.open.west.cutaway", "wall.interior.doorframe.cutaway",
     "cell-door-west-cutaway", 0.52 / 2.28),
)
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def render_variant(asset_id: str, frame_id: str, slug: str, leaf_height_scale: float) -> None:
    modules.setup_scene()
    frame = modules.append_collection(modules.WALL, frame_id)
    leaf = modules.append_collection(modules.LEAF, "door.interior.leaf.open")
    hinge = next((item for item in leaf.all_objects if item.name == "Open leaf hinge pivot"), None)
    if hinge is None:
        raise RuntimeError("Open door source lacks hinge pivot")
    hinge.scale.z = leaf_height_scale
    bpy.context.view_layer.update()
    west_turn = Matrix.Rotation(math.pi / 2, 4, "Z")
    for collection in (frame, leaf):
        for item in collection.all_objects:
            if item.parent is None:
                item.matrix_world = west_turn @ item.matrix_world
    bpy.context.view_layer.update()
    modules.render_module(asset_id, slug, modules.LEAF, [modules.WALL])


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.YAW = tuple(range(-180, 180, 15))
    for asset_id, frame_id, slug, leaf_height_scale in VARIANTS:
        render_variant(asset_id, frame_id, slug, leaf_height_scale)
    existing = json.loads(REGISTRY.read_text(encoding="utf-8"))
    ids = {asset_id for asset_id, _, _, _ in VARIANTS}
    entries = []
    for entry in existing["entries"]:
        if entry["assetId"] in ids:
            continue
        entries.append(entry)
        if entry["assetId"] == "door.interior.open.full":
            entries.extend({"assetId": asset_id,
                            "manifest": f"/game-content/oblique-{slug}.v1.json"}
                           for asset_id, _, slug, _ in VARIANTS)
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
