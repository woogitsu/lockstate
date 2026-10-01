"""Render the authored Yard station at all supported angled camera poses."""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/furniture.yard.exercise-station.blend"
OUTPUT = ROOT / "public/assets/environment/oblique"
PREVIEW = ROOT / "assets/intermediate/yard-exercise-preview"
MANIFEST = ROOT / "public/game-content/oblique-furniture.yard-exercise-station.v1.json"
ASSET_ID = "furniture.yard.exercise-station"
YAW = tuple(range(0, 360, 30))
ELEVATION = tuple(range(20, 80, 10))
TARGET = Vector((0.0, 0.0, 0.82))
PREVIEW_ONLY = "--preview" in sys.argv


def assert_clear_border(path: Path) -> None:
    image = bpy.data.images.load(str(path), check_existing=False)
    try:
        width, height = image.size
        pixels = image.pixels[:]
        for y in (0, height - 1):
            for x in range(width):
                if pixels[(y * width + x) * 4 + 3] > 0.001:
                    raise ValueError(f"model clips the top/bottom border: {path}")
        for y in range(height):
            for x in (0, width - 1):
                if pixels[(y * width + x) * 4 + 3] > 0.001:
                    raise ValueError(f"model clips the side border: {path}")
    finally:
        bpy.data.images.remove(image)


def configure() -> tuple[bpy.types.Scene, bpy.types.Object]:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Generate the authored .blend first: {SOURCE}")
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    camera_data = bpy.data.cameras.new("YardModuleCamera")
    camera = bpy.data.objects.new("YardModuleCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 3.7
    scene.camera = camera
    return scene, camera


def point_camera(camera: bpy.types.Object, yaw: int, elevation: int) -> None:
    azimuth = math.radians(yaw)
    tilt = math.radians(elevation)
    direction = Vector((
        6 * math.cos(tilt) * math.sin(azimuth),
        -6 * math.cos(tilt) * math.cos(azimuth),
        6 * math.sin(tilt),
    ))
    camera.location = TARGET + direction
    camera.rotation_euler = (TARGET - camera.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    scene, camera = configure()
    poses = [(45, 45)] if PREVIEW_ONLY else [(yaw, elevation) for yaw in YAW for elevation in ELEVATION]
    target = PREVIEW if PREVIEW_ONLY else OUTPUT
    target.mkdir(parents=True, exist_ok=True)
    frames = []
    for yaw, elevation in poses:
        point_camera(camera, yaw, elevation)
        temp = target / f"yard-exercise-yaw{yaw:+03d}-elev{elevation}.render.png"
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        assert_clear_border(temp)
        digest = hashlib.sha256(temp.read_bytes()).hexdigest()
        if PREVIEW_ONLY:
            print(f"preview {temp} sha256 {digest}")
            continue
        name = f"furniture.yard.exercise-station-yaw{yaw:+03d}-elev{elevation:02d}.{digest[:12]}.png"
        output = OUTPUT / name
        temp.replace(output)
        frames.append({
            "yawDegrees": yaw,
            "elevationDegrees": elevation,
            "image": f"/assets/environment/oblique/{name}",
            "sha256": digest,
        })
    if PREVIEW_ONLY:
        return
    manifest = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "source": "assets/source/blender/furniture.yard.exercise-station.blend",
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "resolutionPx": [256, 256],
        "nominalPixelsPerTile": 128,
        "pivotPx": [128, 128],
        "cameraTargetTiles": [1.0, 0.5, 0.82],
        "projection": "orthographic",
        "yawDegrees": list(YAW),
        "elevationDegrees": list(ELEVATION),
        "frames": frames,
    }
    pipeline_common.write_text(MANIFEST, json.dumps(manifest, indent=2) + "\n")
    print(f"rendered {len(frames)} verified poses: {MANIFEST}")


if __name__ == "__main__":
    main()
