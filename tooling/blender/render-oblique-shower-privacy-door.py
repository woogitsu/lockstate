"""Publish an open wet-room privacy door at full and cutaway heights."""
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

SOURCE = modules.ROOT / "assets/source/blender/door.shower.privacy.open.blend"
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"
VARIANTS = (
    ("door.shower.privacy.open.full", "shower-privacy-door-full"),
    ("door.shower.privacy.open.cutaway", "shower-privacy-door-cutaway"),
)


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.YAW = tuple(range(-180, 180, 15))
    for asset_id, slug in VARIANTS:
        modules.setup_scene()
        modules.append_collection(SOURCE, asset_id)
        modules.render_module(asset_id, slug, SOURCE, [])
    existing = json.loads(REGISTRY.read_text(encoding="utf-8"))
    ids = {item[0] for item in VARIANTS}
    entries = [entry for entry in existing["entries"] if entry["assetId"] not in ids]
    entries.extend({"assetId": asset_id,
                    "manifest": f"/game-content/oblique-{slug}.v1.json"}
                   for asset_id, slug in VARIANTS)
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
