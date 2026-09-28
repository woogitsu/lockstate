"""Publish authored cell, corridor, and canteen floor tiles for full camera yaw."""
from __future__ import annotations

import argparse
import importlib.util
import json
import sys
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "oblique_bed_door", SCRIPT_DIR / "render-oblique-bed-door-frames.py")
assert spec and spec.loader
modules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modules)

FLOORS = (
    ("floor.cell.sealed-concrete", "floor-cell", modules.ROOT / "assets/source/blender/floor.cell.warm-concrete.blend"),
    ("floor.linoleum.institutional", "floor-corridor", modules.CATALOG),
    ("floor.canteen.terrazzo", "floor-canteen", modules.ROOT / "assets/source/blender/floor.canteen.warm-terrazzo.blend"),
)
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def main() -> None:
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", default="", help="comma-separated floor asset ids; default is all")
    args = parser.parse_args(sys.argv[separator + 1:])
    selected = set(args.only.split(",")) if args.only else {item[0] for item in FLOORS}
    unknown = selected - {item[0] for item in FLOORS}
    if unknown:
        raise ValueError(f"Unknown floor asset ids: {sorted(unknown)}")
    modules.pipeline_common.require_blender_version()
    modules.setup_scene()
    modules.YAW = tuple(range(-180, 180, 15))
    for asset_id, slug, source in FLOORS:
        if asset_id not in selected:
            continue
        collection = modules.append_collection(source, asset_id)
        origin = next((item for item in collection.all_objects
                       if item.name == asset_id + ".origin"), None)
        if origin is None:
            raise RuntimeError(f"{asset_id} has no tile origin")
        origin.location = (0, 0, 0)
        bpy.context.view_layer.update()
        modules.render_module(asset_id, slug, source, [], resolution_px=128)
        collection.hide_render = True

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = registry["entries"]
    for asset_id, slug, _ in FLOORS:
        if asset_id not in selected:
            continue
        updated = {"assetId": asset_id, "manifest": f"/game-content/oblique-{slug}.v1.json"}
        index = next((index for index, entry in enumerate(entries)
                      if entry["assetId"] == asset_id), None)
        if index is None:
            entries.append(updated)
        else:
            entries[index] = updated
    modules.pipeline_common.write_text(REGISTRY, json.dumps(registry, indent=2) + "\n")


if __name__ == "__main__":
    main()
