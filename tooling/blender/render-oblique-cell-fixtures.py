"""Publish existing in-game cell fixtures in the shared oblique module grid.

The combined toilet/sink belongs to `object.toilet` in the current catalog;
this does not introduce the separately reserved `object.sink` gameplay/art.
"""
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

MODELS = (
    ("fixture.cell.toilet_sink", "cell-toilet"),
    ("furniture.storage.rack.wooden", "cell-storage-rack"),
    ("furniture.chair.wooden", "cell-chair"),
)
BASE_ASSET_IDS = (
    "wall.interior.module.full",
    "wall.interior.module.west.full",
    "wall.interior.module.cutaway",
    "furniture.cell.bed.single.variants",
    "door.interior.open.full",
    "door.interior.open.west.full",
    "door.interior.open.west.cutaway",
)
FLOOR_ASSET_IDS = (
    "floor.cell.sealed-concrete",
    "floor.linoleum.institutional",
    "floor.canteen.terrazzo",
)
ACTOR_ASSET_IDS = ("actor.prisoner.base", "actor.guard.base")
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.setup_scene()
    for asset_id, slug in MODELS:
        if asset_id in ("fixture.cell.toilet_sink", "furniture.chair.wooden"):
            modules.YAW = tuple(-165 + index * 30 for index in range(12))
            modules.ELEVATION = (20, 30, 40, 50, 60, 70)
        else:
            modules.YAW = (-45, 0, 45)
            modules.ELEVATION = (25, 45, 65)
        collection = modules.append_collection(modules.CATALOG, asset_id)
        origin = next((item for item in collection.all_objects
                       if item.name == asset_id + ".origin"), None)
        if origin is None:
            raise RuntimeError(f"{asset_id} has no bottom-center origin")
        origin.location = (0, 0, 0)
        bpy.context.view_layer.update()
        modules.render_module(asset_id, slug, modules.CATALOG, [])
        collection.hide_render = True

    existing = json.loads(REGISTRY.read_text(encoding="utf-8"))
    by_id = {entry["assetId"]: entry for entry in existing["entries"]}
    if not all(asset_id in by_id for asset_id in BASE_ASSET_IDS):
        raise RuntimeError("Base oblique module registry is incomplete")
    entries = list(existing["entries"])
    for asset_id, slug in MODELS:
        if asset_id in by_id:
            continue
        floor_index = next((index for index, entry in enumerate(entries)
                            if entry["assetId"] in FLOOR_ASSET_IDS), len(entries))
        entries.insert(floor_index, {"assetId": asset_id,
                                     "manifest": f"/game-content/oblique-{slug}.v1.json"})
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
