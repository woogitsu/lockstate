"""Render west-edge cutaway wall from the authored north-edge Blender collection."""
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

_wall_spec = importlib.util.spec_from_file_location(
    "build_interior_wall_module", Path(__file__).with_name("build-interior-wall-module.py"))
assert _wall_spec and _wall_spec.loader
_wall_module = importlib.util.module_from_spec(_wall_spec)
_wall_spec.loader.exec_module(_wall_module)
strip_png_metadata = _wall_module.strip_png_metadata

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/wall.interior.cutaway.blend"
OUTPUT = ROOT / "public/assets/environment/oblique"
MANIFEST = ROOT / "public/game-content/oblique-wall-west-cutaway.v1.json"
ASSET_ID = "wall.interior.module.west.cutaway"
YAW = tuple(range(-180, 180, 15))
ELEVATION = (25, 45, 65)
TARGET = Vector((0, 0, 0))
RADIUS = 12.0


def main() -> None:
    pipeline_common.require_blender_version()
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    collection = bpy.data.collections.get("wall.interior.module.cutaway")
    if collection is None:
        raise RuntimeError("Missing source collection wall.interior.module.cutaway")
    for item in bpy.data.collections:
        if item.name.startswith("wall.interior."):
            item.hide_render = item != collection
    quarter_turn = Matrix.Rotation(math.pi / 2, 4, "Z")
    for item in collection.all_objects:
        item.matrix_world = quarter_turn @ item.matrix_world
    bpy.context.view_layer.update()
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = False
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.camera.data.type = "ORTHO"
    scene.camera.data.ortho_scale = 8.0
    OUTPUT.mkdir(parents=True, exist_ok=True)
    entries = []
    for yaw in YAW:
        for elevation in ELEVATION:
            azimuth = math.radians(yaw)
            pitch = math.radians(elevation)
            scene.camera.location = (TARGET.x + RADIUS * math.sin(azimuth),
                                     TARGET.y - RADIUS * math.cos(azimuth),
                                     TARGET.z + RADIUS * math.tan(pitch))
            scene.camera.rotation_euler = (TARGET - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
            stem = f"wall-module-west-cutaway-yaw{yaw:+03d}-elev{elevation:02d}"
            staging = OUTPUT / f"{stem}.staging.png"
            scene.render.filepath = str(staging)
            bpy.ops.render.render(write_still=True)
            strip_png_metadata(staging)
            digest = hashlib.sha256(staging.read_bytes()).hexdigest()
            image = OUTPUT / f"{stem}.{digest[:12]}.png"
            staging.replace(image)
            entries.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                            "image": f"/assets/environment/oblique/{image.name}",
                            "sha256": digest})
    data = {"schemaVersion": 1, "assetId": ASSET_ID, "source": SOURCE.name,
            "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            "resolutionPx": [512, 512], "nominalPixelsPerTile": 64,
            "pivotPx": [256, 256], "cameraTargetTiles": list(TARGET),
            "projection": "orthographic", "yawDegrees": list(YAW),
            "elevationDegrees": list(ELEVATION), "frames": entries}
    pipeline_common.write_text(MANIFEST, json.dumps(data, indent=2) + "\n")


if __name__ == "__main__":
    main()
