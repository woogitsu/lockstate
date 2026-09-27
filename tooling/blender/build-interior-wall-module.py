"""Author a square-pivot interior wall kit with full and low cutaway variants.

The images are a first oblique-camera module for the future adjustable view.
They are deliberately separate from the current overhead wall atlas: the
existing renderer's projection and wall occlusion rules are still 2D.
"""
from __future__ import annotations

import json
import hashlib
import struct
import sys
import zlib
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/wall.interior.cutaway.blend"
OUTPUT = ROOT / "public/assets/environment/modules"


def strip_png_metadata(path: Path) -> None:
    """Remove Blender's per-render EXIF/text chunks from an otherwise stable PNG."""
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


def material(name: str, color: tuple[float, float, float, float], roughness: float):
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    return result


def box(collection, name, location, scale, surface, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for previous in list(obj.users_collection):
        previous.objects.unlink(obj)
    collection.objects.link(obj)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft molded edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 1
        obj.modifiers.new("Weighted corners", "WEIGHTED_NORMAL")
    return obj


def polygon_prism(collection, name, outline, low, high, surface):
    """Extrude a concave wall junction as one mesh, with no coincident faces."""
    count = len(outline)
    vertices = [(x, y, low) for x, y in outline] + [(x, y, high) for x, y in outline]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [(index, (index + 1) % count, (index + 1) % count + count, index + count)
              for index in range(count)]
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(surface)
    return obj


def wall_run(collection, label, center, length, axis, height, plaster, coping, skirting, highlight):
    """Build one straight run through a full tile without moving its pivot."""
    x, y = center
    horizontal = axis == "x"
    body = (length, 0.25, height) if horizontal else (0.25, length, height)
    top = (length, 0.28, 0.08) if horizontal else (0.28, length, 0.08)
    stripe = (length - 0.08, 0.085, 0.012) if horizontal else (0.085, length - 0.08, 0.012)
    box(collection, f"{label} painted core", (x, y, height / 2), body, plaster, 0.012)
    box(collection, f"{label} coping", (x, y, height + 0.04), top, coping, 0.006)
    box(collection, f"{label} enamel line", (x, y, height + 0.085), stripe, highlight)
    if horizontal:
        for side in (-1, 1):
            box(collection, f"{label} skirting {side}", (x, y + side * 0.128, 0.12),
                (length, 0.022, 0.24), skirting)
    else:
        for side in (-1, 1):
            box(collection, f"{label} skirting {side}", (x + side * 0.128, y, 0.12),
                (0.022, length, 0.24), skirting)


def build_shape(collection, shape, height, surfaces):
    plaster, coping, skirting, seam, highlight = surfaces
    if shape == "straight":
        wall_run(collection, "straight", (0, 0), 1.0, "x", height, plaster, coping, skirting, highlight)
        for x in (-0.485, 0.485):
            box(collection, f"vertical panel joint {x}", (x, -0.128, height / 2),
                (0.009, 0.005, max(height - 0.25, 0.12)), seam)
    elif shape == "corner.inner":
        wall_run(collection, "inner east arm", (0.06, -0.38), 0.88, "x", height,
                 plaster, coping, skirting, highlight)
        wall_run(collection, "inner south arm", (-0.38, 0.06), 0.88, "y", height,
                 plaster, coping, skirting, highlight)
        box(collection, "inner corner tie", (-0.38, -0.38, height / 2),
            (0.25, 0.25, height), plaster)
    elif shape == "corner.outer":
        wall_run(collection, "outer west arm", (-0.06, 0.38), 0.88, "x", height,
                 plaster, coping, skirting, highlight)
        wall_run(collection, "outer north arm", (0.38, -0.06), 0.88, "y", height,
                 plaster, coping, skirting, highlight)
        box(collection, "outer corner tie", (0.38, 0.38, height / 2),
            (0.25, 0.25, height), plaster)
    elif shape == "end":
        wall_run(collection, "terminated run", (-0.11, 0), 0.78, "x", height,
                 plaster, coping, skirting, highlight)
        box(collection, "finished end post", (0.31, 0, height / 2),
            (0.16, 0.30, height), coping, 0.015)
        box(collection, "end post enamel cap", (0.31, 0, height + 0.05),
            (0.18, 0.32, 0.10), highlight, 0.01)
    elif shape == "junction.t":
        wall_run(collection, "T crossbar", (0, 0), 1.0, "x", height,
                 plaster, coping, skirting, highlight)
        wall_run(collection, "T positive-y stem", (0, 0.25), 0.5, "y", height,
                 plaster, coping, skirting, highlight)
        box(collection, "T joint continuous plaster", (0, 0, height / 2),
            (0.29, 0.29, height), plaster)
        box(collection, "T joint coping", (0, 0, height + 0.04),
            (0.31, 0.31, 0.08), coping)
    elif shape == "junction.cross":
        outline = [(-0.5, -0.125), (-0.125, -0.125), (-0.125, -0.5),
                   (0.125, -0.5), (0.125, -0.125), (0.5, -0.125),
                   (0.5, 0.125), (0.125, 0.125), (0.125, 0.5),
                   (-0.125, 0.5), (-0.125, 0.125), (-0.5, 0.125)]
        polygon_prism(collection, "cross dark skirting", outline, 0, 0.24, skirting)
        polygon_prism(collection, "cross continuous plaster", outline, 0.24, height, plaster)
        polygon_prism(collection, "cross coping", outline, height, height + 0.08, coping)
    elif shape == "doorframe":
        # The central clear opening remains transparent even in the cutaway.
        for side in (-1, 1):
            x = side * 0.44
            box(collection, f"door jamb {side}", (x, 0, height / 2),
                (0.12, 0.25, height), plaster, 0.008)
            box(collection, f"door metal reveal {side}", (x - side * 0.071, -0.06, height / 2),
                (0.018, 0.26, height), coping)
            box(collection, f"door jamb low guard {side}", (x, -0.135, 0.12),
                (0.12, 0.022, 0.24), skirting)
        if height > 1:
            box(collection, "door lintel", (0, 0, height - 0.08),
                (1, 0.27, 0.16), plaster, 0.008)
            box(collection, "lintel top coping", (0, 0, height + 0.04),
                (1, 0.28, 0.08), coping)
            box(collection, "door head shadow", (0, -0.14, height - 0.19),
                (0.75, 0.015, 0.025), seam)
    else:
        raise RuntimeError(f"Unknown wall module {shape}")


def main():
    pipeline_common.require_blender_version()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 32
    scene.eevee.use_raytracing = False
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "Medium High Contrast"

    plaster = material("warm pale plaster", (0.57, 0.56, 0.52, 1), 0.91)
    coping = material("blue grey metal coping", (0.39, 0.46, 0.50, 1), 0.64)
    skirting = material("dark blue grey skirting", (0.22, 0.29, 0.34, 1), 0.78)
    seam = material("recessed plaster joint", (0.40, 0.43, 0.43, 1), 0.94)
    highlight = material("pale enamel inlay", (0.60, 0.66, 0.68, 1), 0.72)

    # All assets have the same full-square pivot. Their physical wall core is
    # thinner, but this footprint guarantees identical rotation and swapping.
    shapes = ("straight", "corner.inner", "corner.outer", "end", "doorframe",
              "junction.t", "junction.cross")
    variants = (("full", 2.50), ("cutaway", 0.52))
    for shape in shapes:
        for variant, height in variants:
            asset_id = f"wall.interior.{('module' if shape == 'straight' else shape)}.{variant}"
            collection = bpy.data.collections.new(asset_id)
            scene.collection.children.link(collection)
            collection["assetId"] = asset_id
            collection["footprintTiles"] = [1.0, 1.0]
            collection["pivotTile"] = [0.5, 0.5]
            collection["heightTiles"] = height
            build_shape(collection, shape, height, (plaster, coping, skirting, seam, highlight))

    world = bpy.data.worlds.new("neutral studio")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes.get("Background").inputs["Color"].default_value = (0.72, 0.77, 0.82, 1)
    world.node_tree.nodes.get("Background").inputs["Strength"].default_value = 0.7
    light_data = bpy.data.lights.new("soft north-west light", "AREA")
    light = bpy.data.objects.new("soft north-west light", light_data)
    scene.collection.objects.link(light)
    light.location = (-3, -4, 7)
    light_data.energy = 600
    light_data.shape = "DISK"
    light_data.size = 5

    camera_data = bpy.data.cameras.new("oblique game preview")
    camera = bpy.data.objects.new("oblique game preview", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 3.15
    camera.location = (3.2, -5.5, 4.1)
    target = Vector((0, 0, 1.15))
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()

    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    entries = []
    for shape in shapes:
        for variant, height in variants:
            selected = f"wall.interior.{('module' if shape == 'straight' else shape)}.{variant}"
            for collection in bpy.data.collections:
                if collection.name.startswith("wall.interior."):
                    collection.hide_render = collection.name != selected
            scene.render.filepath = str(OUTPUT / f"{selected}.png")
            bpy.ops.render.render(write_still=True)
            strip_png_metadata(Path(scene.render.filepath))
            entries.append({"assetId": selected, "image": f"{selected}.png",
                            "footprintTiles": [1, 1], "pivotTile": [0.5, 0.5],
                            "heightTiles": height,
                            "sha256": hashlib.sha256(Path(scene.render.filepath).read_bytes()).hexdigest(),
                            "camera": "orthographic-oblique-preview"})
    pipeline_common.write_text(OUTPUT / "wall.interior.modules.manifest.json",
                               json.dumps({"schemaVersion": 1, "source": SOURCE.name, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
