"""Author a one-tile interior wall and its low cutaway, then render both.

The images are a first oblique-camera module for the future adjustable view.
They are deliberately separate from the current overhead wall atlas: the
existing renderer's projection and wall occlusion rules are still 2D.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/wall.interior.cutaway.blend"
OUTPUT = ROOT / "public/assets/environment/modules"


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


def main():
    pipeline_common.require_blender_version()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.samples = 48
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

    # One unit is one logical tile. Both variants keep the same footprint and
    # origin, so the runtime may swap them without shifting a wall segment.
    for variant, height in (("full", 2.50), ("cutaway", 0.52)):
        collection = bpy.data.collections.new(f"wall.interior.module.{variant}")
        scene.collection.children.link(collection)
        collection["assetId"] = f"wall.interior.module.{variant}"
        collection["footprintTiles"] = [1.0, 0.25]
        collection["cutawayHeight"] = height
        box(collection, "painted core", (0, 0, height / 2), (1, 0.25, height), plaster, 0.015)
        box(collection, "north skirting", (0, 0.128, 0.12), (1, 0.022, 0.24), skirting)
        box(collection, "south skirting", (0, -0.128, 0.12), (1, 0.022, 0.24), skirting)
        box(collection, "metal coping", (0, 0, height + 0.04), (1, 0.28, 0.08), coping, 0.008)
        box(collection, "coping enamel stripe", (0, 0, height + 0.085), (0.90, 0.085, 0.012), highlight)
        for x in (-0.485, 0.485):
            box(collection, f"vertical panel joint {x}", (x, -0.128, height / 2),
                (0.009, 0.005, max(height - 0.25, 0.12)), seam)

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
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    entries = []
    for variant in ("full", "cutaway"):
        selected = f"wall.interior.module.{variant}"
        for collection in bpy.data.collections:
            if collection.name.startswith("wall.interior.module."):
                collection.hide_render = collection.name != selected
        scene.render.filepath = str(OUTPUT / f"{selected}.png")
        bpy.ops.render.render(write_still=True)
        entries.append({"assetId": selected, "image": f"{selected}.png", "footprintTiles": [1, 0.25],
                        "heightTiles": 2.5 if variant == "full" else 0.52,
                        "camera": "orthographic-oblique-preview"})
    pipeline_common.write_text(OUTPUT / "wall.interior.modules.manifest.json",
                               json.dumps({"schemaVersion": 1, "source": SOURCE.name, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
