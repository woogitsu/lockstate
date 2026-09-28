"""Publish isolated bed and complete open door modules in the wall pose grid."""
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

_wall_spec = importlib.util.spec_from_file_location(
    "build_interior_wall_module", Path(__file__).with_name("build-interior-wall-module.py"))
assert _wall_spec and _wall_spec.loader
_wall_module = importlib.util.module_from_spec(_wall_spec)
_wall_spec.loader.exec_module(_wall_module)
strip_png_metadata = _wall_module.strip_png_metadata

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/environment/oblique"
CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
WALL = ROOT / "assets/source/blender/wall.interior.cutaway.blend"
LEAF = ROOT / "assets/source/blender/door.interior.leaf.open.blend"
YAW = (-45, 0, 45)
ELEVATION = (25, 45, 65)
TARGET = Vector((0, 0, 0))
RADIUS = 12.0


def append_collection(path: Path, name: str):
    with bpy.data.libraries.load(str(path), link=False) as (available, loaded):
        if name not in available.collections:
            raise RuntimeError(f"{path.name} lacks {name}")
        loaded.collections = [name]
    collection = loaded.collections[0]
    bpy.context.scene.collection.children.link(collection)
    return collection


def setup_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = False
    scene.render.film_transparent = True
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"
    world = bpy.data.worlds.new("neutral studio")
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    background.inputs["Color"].default_value = (0.72, 0.77, 0.82, 1)
    background.inputs["Strength"].default_value = 0.7
    light_data = bpy.data.lights.new("soft north-west light", "AREA")
    light_data.energy = 600
    light_data.shape = "DISK"
    light_data.size = 5
    light = bpy.data.objects.new("soft north-west light", light_data)
    scene.collection.objects.link(light)
    light.location = (-3, -4, 7)
    camera_data = bpy.data.cameras.new("oblique module camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 8.0
    camera = bpy.data.objects.new("oblique module camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera


def render_module(asset_id: str, slug: str, source: Path, dependencies: list[Path]) -> None:
    scene = bpy.context.scene
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames = []
    for yaw in YAW:
        for elevation in ELEVATION:
            azimuth = math.radians(yaw)
            pitch = math.radians(elevation)
            scene.camera.location = (TARGET.x + RADIUS * math.sin(azimuth),
                                     TARGET.y - RADIUS * math.cos(azimuth),
                                     TARGET.z + RADIUS * math.tan(pitch))
            scene.camera.rotation_euler = (TARGET - scene.camera.location).to_track_quat("-Z", "Y").to_euler()
            stem = f"{slug}-yaw{yaw:+03d}-elev{elevation:02d}"
            staging = OUTPUT / f"{stem}.staging.png"
            scene.render.filepath = str(staging)
            bpy.ops.render.render(write_still=True)
            strip_png_metadata(staging)
            digest = hashlib.sha256(staging.read_bytes()).hexdigest()
            final = OUTPUT / f"{stem}.{digest[:12]}.png"
            staging.replace(final)
            frames.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                           "image": f"/assets/environment/oblique/{final.name}",
                           "sha256": digest})
    manifest = {"schemaVersion": 1, "assetId": asset_id, "source": source.name,
                "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "sourceDependencies": [{"source": path.name,
                                        "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
                                       for path in dependencies],
                "resolutionPx": [512, 512], "nominalPixelsPerTile": 64,
                "pivotPx": [256, 256], "cameraTargetTiles": list(TARGET),
                "projection": "orthographic", "yawDegrees": list(YAW),
                "elevationDegrees": list(ELEVATION), "frames": frames}
    path = ROOT / f"public/game-content/oblique-{slug}.v1.json"
    pipeline_common.write_text(path, json.dumps(manifest, indent=2) + "\n")


def main() -> None:
    pipeline_common.require_blender_version()
    setup_scene()
    bed_id = "furniture.cell.bed.single.variants"
    bed = append_collection(CATALOG, bed_id)
    origin = next((item for item in bed.all_objects if item.name == bed_id + ".origin"), None)
    if origin is None:
        raise RuntimeError("Cell bed source lacks bottom-center origin")
    origin.location = (0, 0, 0)  # source catalog distributes models among gallery slots
    bpy.context.view_layer.update()
    render_module(bed_id, "cell-bed", CATALOG, [])
    bed.hide_render = True

    frame = append_collection(WALL, "wall.interior.doorframe.full")
    leaf = append_collection(LEAF, "door.interior.leaf.open")
    bpy.context.view_layer.update()
    render_module("door.interior.open.full", "cell-door-open", LEAF, [WALL])
    frame.hide_render = True
    leaf.hide_render = True
    registry = {"schemaVersion": 1, "entries": [
        {"assetId": "wall.interior.module.full", "manifest": "/game-content/oblique-modules.v1.json"},
        {"assetId": "wall.interior.module.west.full", "manifest": "/game-content/oblique-wall-west.v1.json"},
        {"assetId": "wall.interior.module.cutaway", "manifest": "/game-content/oblique-wall-cutaway.v1.json"},
        {"assetId": bed_id, "manifest": "/game-content/oblique-cell-bed.v1.json"},
        {"assetId": "door.interior.open.full", "manifest": "/game-content/oblique-cell-door-open.v1.json"},
        {"assetId": "door.interior.open.west.full", "manifest": "/game-content/oblique-cell-door-west-full.v1.json"},
        {"assetId": "door.interior.open.west.cutaway", "manifest": "/game-content/oblique-cell-door-west-cutaway.v1.json"},
    ]}
    pipeline_common.write_text(ROOT / "public/game-content/oblique-module-registry.v1.json",
                               json.dumps(registry, indent=2) + "\n")


if __name__ == "__main__":
    main()
