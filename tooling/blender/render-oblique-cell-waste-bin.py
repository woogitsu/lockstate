"""Render the authored waste bin through the oblique runtime pipeline.

The sink keeps its one-tile footprint and existing origin.  This module is
deliberately denser than the legacy object grid: twelve yaw samples and six
elevation samples let the adjustable camera choose a nearby pose without
silhouette popping.
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

ASSET_ID = "fixture.cell.waste_bin"
SLUG = "cell-waste-bin"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"

# Twelve evenly spaced azimuths avoid the duplicated -180/180 seam.
modules.YAW = tuple(-165 + index * 30 for index in range(12))
modules.ELEVATION = (20, 30, 40, 50, 60, 70)


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.setup_scene()
    collection = modules.append_collection(modules.CATALOG, ASSET_ID)
    origin = next((item for item in collection.all_objects
                   if item.name == ASSET_ID + ".origin"), None)
    if origin is None:
        raise RuntimeError(f"{ASSET_ID} has no bottom-center origin")
    origin.location = (0, 0, 0)
    bpy.context.view_layer.update()
    modules.render_module(ASSET_ID, SLUG, modules.CATALOG, [])
    collection.hide_render = True

    existing = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = [entry for entry in existing["entries"] if entry["assetId"] != ASSET_ID]
    entries.append({"assetId": ASSET_ID,
                    "manifest": f"/game-content/oblique-{SLUG}.v1.json"})
    modules.pipeline_common.write_text(
        REGISTRY, json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()

