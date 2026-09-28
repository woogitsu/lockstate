"""Publish the north-west inner corner in full and cutaway oblique poses."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

spec = importlib.util.spec_from_file_location(
    "wall_source", Path(__file__).with_name("build-interior-wall-module.py"))
assert spec and spec.loader
wall_source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wall_source)

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/wall.interior.cutaway.blend"
OUTPUT = ROOT / "public/assets/environment/oblique"
REGISTRY = ROOT / "public/game-content/oblique-module-registry.v1.json"
YAW = tuple(range(-180, 180, 15))
ELEVATION = (25, 45, 65)
TARGET = Vector((0, 0, 0))
RADIUS = 12.0
VARIANTS = (("full", "wall-corner-north-west-full"),
            ("cutaway", "wall-corner-north-west-cutaway"))


def main() -> None:
    pipeline_common.require_blender_version()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = False
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.camera.data.type = "ORTHO"
    scene.camera.data.ortho_scale = 8.0
    OUTPUT.mkdir(parents=True, exist_ok=True)
    quarter_turn = Matrix.Rotation(-math.pi / 2, 4, "Z")
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    for variant, slug in VARIANTS:
        source_id = f"wall.interior.corner.inner.{variant}"
        asset_id = f"wall.interior.corner.inner.north-west.{variant}"
        collection = bpy.data.collections.get(source_id)
        if collection is None:
            raise RuntimeError(f"Missing source collection {source_id}")
        for item in bpy.data.collections:
            if item.name.startswith("wall.interior."):
                item.hide_render = item != collection
        # The authored arms point east and north. Rotate to east and south,
        # matching the north and west edges of the canonical cell.
        for item in collection.all_objects:
            item.matrix_world = quarter_turn @ item.matrix_world
        bpy.context.view_layer.update()
        entries = []
        for yaw in YAW:
            for elevation in ELEVATION:
                azimuth = math.radians(yaw)
                pitch = math.radians(elevation)
                scene.camera.location = (RADIUS * math.sin(azimuth),
                                         -RADIUS * math.cos(azimuth),
                                         RADIUS * math.tan(pitch))
                scene.camera.rotation_euler = (
                    TARGET - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
                stem = f"{slug}-yaw{yaw:+03d}-elev{elevation:02d}"
                staging = OUTPUT / f"{stem}.staging.png"
                scene.render.filepath = str(staging)
                bpy.ops.render.render(write_still=True)
                wall_source.strip_png_metadata(staging)
                digest = hashlib.sha256(staging.read_bytes()).hexdigest()
                image = OUTPUT / f"{stem}.{digest[:12]}.png"
                staging.replace(image)
                entries.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                                "image": f"/assets/environment/oblique/{image.name}",
                                "sha256": digest})
        manifest = {"schemaVersion": 1, "assetId": asset_id, "source": SOURCE.name,
                    "sourceSha256": source_hash, "resolutionPx": [512, 512],
                    "nominalPixelsPerTile": 64, "pivotPx": [256, 256],
                    "cameraTargetTiles": list(TARGET), "projection": "orthographic",
                    "yawDegrees": list(YAW), "elevationDegrees": list(ELEVATION),
                    "frames": entries}
        pipeline_common.write_text(ROOT / f"public/game-content/oblique-{slug}.v1.json",
                                   json.dumps(manifest, indent=2) + "\n")
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    ids = {f"wall.interior.corner.inner.north-west.{variant}" for variant, _ in VARIANTS}
    entries = [entry for entry in registry["entries"] if entry["assetId"] not in ids]
    entries.extend({"assetId": f"wall.interior.corner.inner.north-west.{variant}",
                    "manifest": f"/game-content/oblique-{slug}.v1.json"}
                   for variant, slug in VARIANTS)
    pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
