"""Publish every camera pose of the authored square-grid low wall."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import bpy

_render_spec = importlib.util.spec_from_file_location(
    "render_oblique_bed_door_frames", Path(__file__).with_name("render-oblique-bed-door-frames.py"))
assert _render_spec and _render_spec.loader
_render = importlib.util.module_from_spec(_render_spec)
_render_spec.loader.exec_module(_render)

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/wall.square.brick.low.blend"
ASSET_ID = "wall.square.brick.low"


def main() -> None:
    _render.pipeline_common.require_blender_version()
    _render.setup_scene()
    _render.append_collection(SOURCE, ASSET_ID)
    _render.YAW = tuple(range(-180, 180, 15))
    _render.render_module(ASSET_ID, "square-brick-low-wall", SOURCE, [])
    registry_path = ROOT / "public/game-content/oblique-module-registry.v1.json"
    registry = json.loads(registry_path.read_text(encoding="utf-8"))
    entry = {"assetId": ASSET_ID,
             "manifest": "/game-content/oblique-square-brick-low-wall.v1.json"}
    if not any(item["assetId"] == ASSET_ID for item in registry["entries"]):
        registry["entries"].append(entry)
    _render.pipeline_common.write_text(registry_path, json.dumps(registry, indent=2) + "\n")


if __name__ == "__main__":
    main()
