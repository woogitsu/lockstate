"""Render the authored toilet and sink fixture for the adjustable oblique camera.

The collection is authored in environment.mvp.catalog.blend. This script is
standalone so a render job can rebuild the 12-yaw by 6-angle grid without
importing a wall or door authoring script. The registry is updated only after
every frame has been written and hashed.
"""
from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import pipeline_common  # noqa: E402

ROOT = SCRIPT_DIR.parents[1]
CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
OUTPUT = ROOT / "public/assets/environment/oblique"
REGISTRY = ROOT / "public/game-content/oblique-module-registry.v1.json"
MANIFEST = ROOT / "public/game-content/oblique-cell-toilet.v1.json"
ASSET_ID = "fixture.cell.toilet_sink"
YAW = tuple(-165 + index * 30 for index in range(12))
ELEVATION = (20, 30, 40, 50, 60, 70)


def strip_png_metadata(path: Path) -> None:
    """Keep only deterministic PNG chunks emitted by Blender."""
    source = path.read_bytes()
    if source[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"{path} is not a PNG")
    result = bytearray(source[:8])
    offset = 8
    while offset < len(source):
        size = struct.unpack(">I", source[offset:offset + 4])[0]
        kind = source[offset + 4:offset + 8]
        data = source[offset + 8:offset + 8 + size]
        if kind in (b"IHDR", b"sRGB", b"gAMA", b"cHRM", b"IDAT", b"IEND"):
            result += struct.pack(">I", size) + kind + data
            result += struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
        offset += 12 + size
    path.write_bytes(result)


def append_collection() -> bpy.types.Collection:
    with bpy.data.libraries.load(str(CATALOG), link=False) as (available, loaded):
        if ASSET_ID not in available.collections:
            raise RuntimeError(f"{CATALOG.name} lacks {ASSET_ID}")
        loaded.collections = [ASSET_ID]
    collection = loaded.collections[0]
    bpy.context.scene.collection.children.link(collection)
    origin = next((item for item in collection.all_objects
                   if item.name == ASSET_ID + ".origin"), None)
    if origin is None:
        raise RuntimeError(f"{ASSET_ID} has no bottom-center origin")
    origin.location = (0, 0, 0)
    bpy.context.view_layer.update()
    return collection


def setup_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = False
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    pipeline_common.apply_deterministic_render_settings(scene)
    pipeline_common.configure_oblique_module_lighting(scene)
    camera_data = bpy.data.cameras.new("oblique toilet camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 8.0
    camera = bpy.data.objects.new("oblique toilet camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene


def render_frames(scene: bpy.types.Scene) -> list[dict[str, object]]:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames: list[dict[str, object]] = []
    target = Vector((0, 0, 0))
    radius = 12.0
    for yaw in YAW:
        for elevation in ELEVATION:
            yaw_radians = math.radians(yaw)
            elevation_radians = math.radians(elevation)
            camera = scene.camera
            camera.location = (
                radius * math.sin(yaw_radians),
                -radius * math.cos(yaw_radians),
                radius * math.tan(elevation_radians),
            )
            camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()
            stem = f"cell-toilet-yaw{yaw:+03d}-elev{elevation:02d}"
            staging = OUTPUT / f"{stem}.staging.png"
            scene.render.filepath = str(staging)
            bpy.ops.render.render(write_still=True)
            strip_png_metadata(staging)
            digest = hashlib.sha256(staging.read_bytes()).hexdigest()
            final = OUTPUT / f"{stem}.{digest[:12]}.png"
            staging.replace(final)
            frames.append({
                "yawDegrees": yaw,
                "elevationDegrees": elevation,
                "image": f"/assets/environment/oblique/{final.name}",
                "sha256": digest,
            })
    return frames


def main() -> None:
    pipeline_common.require_blender_version()
    scene = setup_scene()
    collection = append_collection()
    frames = render_frames(scene)
    collection.hide_render = True
    source_hash = hashlib.sha256(CATALOG.read_bytes()).hexdigest()
    manifest = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "source": "environment.mvp.catalog.blend",
        "sourceSha256": source_hash,
        "sourceDependencies": [],
        "resolutionPx": [512, 512],
        "nominalPixelsPerTile": 64,
        "pivotPx": [256, 256],
        "cameraTargetTiles": [0, 0, 0],
        "projection": "orthographic",
        "yawDegrees": list(YAW),
        "elevationDegrees": list(ELEVATION),
        "frames": frames,
    }
    pipeline_common.write_text(MANIFEST, json.dumps(manifest, indent=2) + "\n")

    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    entries = [entry for entry in registry["entries"] if entry["assetId"] != ASSET_ID]
    entries.append({"assetId": ASSET_ID, "manifest": "/game-content/oblique-cell-toilet.v1.json"})
    pipeline_common.write_text(REGISTRY, json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()

