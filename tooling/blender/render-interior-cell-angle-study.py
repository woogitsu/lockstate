"""Render one fixed cell/corridor scene at nine orthographic camera angles.

This is an art/projection study. It does not select wall sprites in Phaser.
Run with the repository's pinned Blender 5.2 from the repository root.
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
WALL_SOURCE = ROOT / "assets/source/blender/wall.interior.cutaway.blend"
SOURCE = ROOT / "assets/source/blender/interior-cell-angle-study.blend"
OUTPUT = ROOT / "assets/rendered/camera-study"
YAW_DEGREES = (-45, 0, 45)  # zero looks from the corridor toward the cell
ELEVATION_DEGREES = (25, 45, 65)
TARGET = Vector((0.0, 1.0, 1.0))
RADIUS = 12.0
ORTHO_SCALE = 16.5
RESOLUTION = (1280, 720)


def stable_png(path: Path) -> bytes:
    """Canonicalize RGBA rows and discard Blender's changing PNG metadata."""
    source = path.read_bytes()
    if source[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"{path} is not a PNG")
    header = None
    color_chunks = []
    idat = bytearray()
    offset = 8
    while offset < len(source):
        size = struct.unpack(">I", source[offset:offset + 4])[0]
        kind = source[offset + 4:offset + 8]
        data = source[offset + 8:offset + 8 + size]
        if kind == b"IHDR":
            header = data
        elif kind in (b"sRGB", b"gAMA", b"cHRM"):
            color_chunks.append((kind, data))
        elif kind == b"IDAT":
            idat += data
        offset += 12 + size
    if header is None:
        raise RuntimeError(f"{path} has no IHDR")
    width, height, depth, color, compression, filter_method, interlace = struct.unpack(">IIBBBBB", header)
    if (depth, color, compression, filter_method, interlace) != (8, 6, 0, 0, 0):
        raise RuntimeError(f"{path} must be non-interlaced RGBA8")
    raw = zlib.decompress(bytes(idat))
    stride = width * 4
    pixels = bytearray(stride * height)
    previous = bytearray(stride)
    position = 0
    for row in range(height):
        filter_type = raw[position]
        position += 1
        line = bytearray(raw[position:position + stride])
        position += stride
        if filter_type == 1:
            for i in range(4, stride):
                line[i] = (line[i] + line[i - 4]) & 255
        elif filter_type == 2:
            for i in range(stride):
                line[i] = (line[i] + previous[i]) & 255
        elif filter_type == 3:
            for i in range(stride):
                left = line[i - 4] if i >= 4 else 0
                line[i] = (line[i] + ((left + previous[i]) >> 1)) & 255
        elif filter_type == 4:
            for i in range(stride):
                left = line[i - 4] if i >= 4 else 0
                upper_left = previous[i - 4] if i >= 4 else 0
                predictor = left + previous[i] - upper_left
                distances = (abs(predictor - left), abs(predictor - previous[i]),
                             abs(predictor - upper_left))
                chosen = (left, previous[i], upper_left)[distances.index(min(distances))]
                line[i] = (line[i] + chosen) & 255
        elif filter_type != 0:
            raise RuntimeError(f"Unsupported PNG filter {filter_type}")
        pixels[row * stride:(row + 1) * stride] = line
        previous = line

    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)

    unfiltered = bytearray()
    for row in range(height):
        unfiltered += b"\x00" + pixels[row * stride:(row + 1) * stride]
    result = bytearray(source[:8]) + chunk(b"IHDR", header)
    for kind, data in color_chunks:
        result += chunk(kind, data)
    result += chunk(b"IDAT", zlib.compress(bytes(unfiltered), 9)) + chunk(b"IEND", b"")
    path.write_bytes(result)
    return bytes(pixels)


def orange_pixel_count(pixels: bytes) -> int:
    """Visibility proxy for the fixed orange actor, excluding the brown door."""
    count = 0
    for index in range(0, len(pixels), 4):
        red, green, blue = pixels[index:index + 3]
        if red > 125 and red > green * 1.55 and red > blue * 1.7 and green > 30:
            count += 1
    return count


def material(name, color, roughness=0.8):
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    return result


def box(name, location, dimensions, surface, rotation=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.rotation_euler.z = math.radians(rotation)
    obj.data.materials.append(surface)
    return obj


def module(collection, name, asset_id, x, y, yaw=0):
    obj = bpy.data.objects.new(name, None)
    bpy.context.scene.collection.objects.link(obj)
    obj.instance_type = "COLLECTION"
    obj.instance_collection = collection[asset_id]
    obj.location = (x, y, 0)
    obj.rotation_euler.z = math.radians(yaw)
    obj["sourceAssetId"] = asset_id
    return {"name": name, "assetId": asset_id, "tile": [x, y], "rotationDegrees": yaw}


def set_camera(camera, yaw, elevation):
    azimuth = math.radians(yaw)
    pitch = math.radians(elevation)
    camera.location = (TARGET.x + RADIUS * math.sin(azimuth),
                       TARGET.y - RADIUS * math.cos(azimuth),
                       TARGET.z + RADIUS * math.tan(pitch))
    camera.rotation_euler = (TARGET - camera.location).to_track_quat("-Z", "Y").to_euler()


def main():
    pipeline_common.require_blender_version()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.cycles.seed = 0
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"

    ids = ["wall.interior.module.full", "wall.interior.module.cutaway",
           "wall.interior.corner.inner.full", "wall.interior.corner.inner.cutaway",
           "wall.interior.corner.outer.full",
           "wall.interior.doorframe.full", "wall.interior.doorframe.cutaway"]
    with bpy.data.libraries.load(str(WALL_SOURCE), link=False) as (available, loaded):
        missing = sorted(set(ids) - set(available.collections))
        if missing:
            raise RuntimeError(f"Wall source lacks {missing}")
        loaded.collections = ids
    wall_collections = {item.name: item for item in loaded.collections}

    concrete = material("warm cell concrete", (0.42, 0.42, 0.39, 1))
    corridor = material("corridor terrazzo", (0.48, 0.50, 0.48, 1))
    blanket = material("navy blanket", (0.11, 0.20, 0.27, 1))
    linen = material("off-white pillow", (0.78, 0.76, 0.68, 1))
    steel = material("bed steel", (0.20, 0.25, 0.28, 1), 0.55)
    uniform = material("prisoner orange", (0.78, 0.28, 0.10, 1))
    skin = material("actor skin", (0.54, 0.35, 0.23, 1))
    door = material("door walnut", (0.31, 0.16, 0.08, 1))
    ground = material("stage ground", (0.16, 0.18, 0.19, 1))
    box("stage ground", (0, 1, -0.10), (12, 10, 0.12), ground)
    box("cell floor", (0, 2, 0), (4, 4, 0.08), concrete)
    box("corridor floor", (0, -1, 0), (4, 2, 0.08), corridor)
    box("bed steel frame", (1.0, 2.1, 0.30), (0.85, 1.9, 0.38), steel)
    box("bed blanket", (1.0, 2.25, 0.52), (0.79, 1.35, 0.07), blanket)
    box("bed pillow", (1.0, 1.30, 0.54), (0.70, 0.34, 0.08), linen)

    # A visible stand-in marks the occlusion problem without making this a
    # gameplay animation or changing the actor pipeline.
    box("actor legs", (-0.65, 2.0, 0.48), (0.28, 0.30, 0.82), uniform)
    box("actor torso", (-0.65, 2.0, 1.14), (0.45, 0.27, 0.70), uniform)
    head = pipeline_common.add_mesh_object(
        "actor head stand-in",
        pipeline_common.uv_sphere_mesh("actor head stand-in mesh", radius=0.22,
                                       segments=16, ring_count=8),
        (-0.65, 2.0, 1.68),
    )
    head.data.materials.append(skin)
    # The open leaf is a scene stand-in; the Blender kit provides the frame.
    box("open door leaf stand-in", (0.36, -0.30, 1.03), (0.10, 0.76, 2.04), door, 30)

    instances = []
    for x in (-1, 0, 1):
        instances.append(module(wall_collections, f"north wall {x}", "wall.interior.module.full", x, 4))
    for y in (1, 2, 3):
        instances.append(module(wall_collections, f"west wall {y}", "wall.interior.module.full", -2, y, 90))
        instances.append(module(wall_collections, f"east wall {y}", "wall.interior.module.full", 2, y, 90))
    instances.append(module(wall_collections, "south wall left low", "wall.interior.module.cutaway", -1, 0))
    instances.append(module(wall_collections, "south door frame", "wall.interior.doorframe.full", 0, 0))
    instances.append(module(wall_collections, "south wall right low", "wall.interior.module.cutaway", 1, 0))
    # These are the authored corner modules rather than improvised geometry.
    for name, asset, x, y, angle in (
        ("north-west corner", "wall.interior.corner.inner.full", -2, 4, -90),
        ("north-east corner", "wall.interior.corner.outer.full", 2, 4, 0),
        ("south-west low corner", "wall.interior.corner.inner.cutaway", -2, 0, 0),
        ("south-east low corner", "wall.interior.corner.inner.cutaway", 2, 0, 90),
    ):
        instances.append(module(wall_collections, name, asset, x, y, angle))

    world = bpy.data.worlds.new("fixed neutral ambient")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.60, 0.66, 0.70, 1)
    world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.6
    light_data = bpy.data.lights.new("single area light", "AREA")
    light = bpy.data.objects.new("single area light", light_data)
    scene.collection.objects.link(light)
    light.location = (-4, -5, 9)
    light_data.energy = 900
    light_data.shape = "DISK"
    light_data.size = 5

    camera_data = bpy.data.cameras.new("angle-study orthographic camera")
    camera = bpy.data.objects.new("angle-study orthographic camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ORTHO_SCALE
    set_camera(camera, 0, 45)

    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))

    entries = []
    for yaw in YAW_DEGREES:
        for elevation in ELEVATION_DEGREES:
            set_camera(camera, yaw, elevation)
            name = f"cell-yaw{yaw:+03d}-elev{elevation:02d}.png"
            path = OUTPUT / name
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)
            pixels = stable_png(path)
            entries.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                            "image": name, "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                            "orangePixelCount": orange_pixel_count(pixels),
                            "cameraLocation": [round(value, 6) for value in camera.location]})

    # Candidate art-only cutaway for the measured low-left occlusion case.
    # Keep the canonical nine images unchanged: this tenth image differs only
    # in the west wall and north-west corner's full/cutaway collection choice.
    changed = []
    for obj in bpy.context.scene.objects:
        if obj.name.startswith("west wall ") or obj.name == "north-west corner":
            replacement = ("wall.interior.corner.inner.cutaway" if obj.name == "north-west corner"
                           else "wall.interior.module.cutaway")
            obj.instance_collection = wall_collections[replacement]
            obj["sourceAssetId"] = replacement
            changed.append({"name": obj.name, "assetId": replacement})
    set_camera(camera, -45, 25)
    cutaway_path = OUTPUT / "cell-yaw-45-elev25-west-cutaway.png"
    scene.render.filepath = str(cutaway_path)
    bpy.ops.render.render(write_still=True)
    cutaway_pixels = stable_png(cutaway_path)
    cutaway_entry = {"selectionRule": {"yawDegreesAtMost": -30, "elevationDegreesAtMost": 30},
                     "referenceImage": "cell-yaw-45-elev25.png",
                     "image": cutaway_path.name,
                     "sha256": hashlib.sha256(cutaway_path.read_bytes()).hexdigest(),
                     "orangePixelCount": orange_pixel_count(cutaway_pixels),
                     "changedInstances": changed,
                     "yawDegrees": -45, "elevationDegrees": 25}
    wall_source_sha = hashlib.sha256(WALL_SOURCE.read_bytes()).hexdigest()
    manifest = {"schemaVersion": 1, "source": SOURCE.name,
                "wallSource": WALL_SOURCE.name, "wallSourceSha256": wall_source_sha,
                "lighting": {"type": "one area light", "location": [-4, -5, 9], "energy": 900,
                             "size": 5, "worldAmbientStrength": 0.6},
                "resolution": list(RESOLUTION), "projection": "orthographic",
                "orthoScale": ORTHO_SCALE, "target": list(TARGET),
                "sourceSceneCamera": {"yawDegrees": 0, "elevationDegrees": 45},
                "yawDegrees": list(YAW_DEGREES), "elevationDegrees": list(ELEVATION_DEGREES),
                "instances": instances, "entries": entries,
                "cutawayCandidate": cutaway_entry}
    pipeline_common.write_text(OUTPUT / "manifest.json", json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
