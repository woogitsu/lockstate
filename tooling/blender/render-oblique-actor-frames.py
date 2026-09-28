"""Render idle prisoner and guard models for the full-turn oblique art grid."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

spec = importlib.util.spec_from_file_location(
    "build_interior_wall_module", Path(__file__).with_name("build-interior-wall-module.py"))
assert spec and spec.loader
wall = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wall)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/environment/oblique"
REGISTRY = ROOT / "public/game-content/oblique-module-registry.v1.json"
ACTORS = (("actor.prisoner.base", "actor-prisoner"),
          ("actor.guard.base", "actor-guard"))
YAW = tuple(range(-180, 180, 15))
ELEVATION = (25, 45, 65)
TARGET = Vector((0, 0, 0))
RADIUS = 12.0
MODEL_SCALE = 0.5  # source atlas mesh is taller than its in-game foot-pivot sprite


def render_actor(asset_id: str, slug: str) -> None:
    source = ROOT / f"assets/source/blender/{asset_id}.blend"
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    scene.frame_set(1)  # the authored idle pose
    root = bpy.data.objects.get("SpriteRoot")
    if root is None:
        raise RuntimeError(f"{source.name} lacks a ground-anchored SpriteRoot")
    root.scale = (MODEL_SCALE,) * 3
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
    scene.camera.data.ortho_scale = 8.0  # 512 / 8 = 64 px per tile
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = []
    for yaw in YAW:
        for elevation in ELEVATION:
            azimuth = math.radians(yaw)
            pitch = math.radians(elevation)
            scene.camera.location = (RADIUS * math.sin(azimuth),
                                     -RADIUS * math.cos(azimuth),
                                     RADIUS * math.tan(pitch))
            scene.camera.rotation_euler = (TARGET - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
            stem = f"{slug}-yaw{yaw:+03d}-elev{elevation:02d}"
            staging = OUTPUT / f"{stem}.staging.png"
            scene.render.filepath = str(staging)
            bpy.ops.render.render(write_still=True)
            wall.strip_png_metadata(staging)
            digest = hashlib.sha256(staging.read_bytes()).hexdigest()
            image = OUTPUT / f"{stem}.{digest[:12]}.png"
            staging.replace(image)
            frames.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                           "image": f"/assets/environment/oblique/{image.name}",
                           "sha256": digest})
    manifest = {"schemaVersion": 1, "assetId": asset_id, "source": source.name,
                "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "resolutionPx": [512, 512], "nominalPixelsPerTile": 64,
                "pivotPx": [256, 256], "cameraTargetTiles": list(TARGET),
                "projection": "orthographic", "yawDegrees": list(YAW),
                "elevationDegrees": list(ELEVATION), "frames": frames}
    pipeline_common.write_text(ROOT / f"public/game-content/oblique-{slug}.v1.json",
                               json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    pipeline_common.require_blender_version()
    for asset_id, slug in ACTORS:
        render_actor(asset_id, slug)
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    ids = {asset_id for asset_id, _ in ACTORS}
    entries = [entry for entry in registry["entries"] if entry["assetId"] not in ids]
    entries.extend({"assetId": asset_id, "manifest": f"/game-content/oblique-{slug}.v1.json"}
                   for asset_id, slug in ACTORS)
    pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
