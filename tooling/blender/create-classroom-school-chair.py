"""Author a classroom visual skin for the existing one-square chair object."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/furniture.classroom.school-chair.blend"


def material(name: str, rgb: tuple[float, float, float], metal=0.0, rough=0.64):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*rgb, 1.0)
    item.use_nodes = True
    surface = item.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*rgb, 1.0)
    surface.inputs["Metallic"].default_value = metal
    surface.inputs["Roughness"].default_value = rough
    return item


def block(name, position, half_size, finish, bevel=0.0, tilt=0.0):
    bpy.ops.mesh.primitive_cube_add(location=position)
    item = bpy.context.object
    item.name = name
    item.scale = half_size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    item.rotation_euler.x = tilt
    item.data.materials.append(finish)
    if bevel:
        modifier = item.modifiers.new("moulded corner", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        item.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return item


def bar(name, position, radius, length, finish, axis="z"):
    rotation = {
        "x": (0, math.pi / 2, 0), "y": (math.pi / 2, 0, 0), "z": (0, 0, 0),
    }[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=length,
        location=position, rotation=rotation)
    item = bpy.context.object
    item.name = name
    item.data.materials.append(finish)
    return item


def build() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    steel = material("powder-coated petrol frame", (0.10, 0.25, 0.30), 0.34, 0.55)
    dark = material("non-marking charcoal rubber", (0.12, 0.17, 0.18))
    shell = material("muted blue-grey moulded seat", (0.31, 0.40, 0.40))
    light = material("seat light-catching surface", (0.39, 0.48, 0.47))
    edge = material("recessed seat rim", (0.17, 0.26, 0.28))
    silver = material("captive steel fasteners", (0.58, 0.63, 0.61), 0.65, 0.42)
    wood = material("sealed timber writing-room accent", (0.50, 0.43, 0.30))

    # The existing `object.chair` occupies exactly one whole game square.
    # Front is -Y, consistent with the old chair's source orientation.
    for x in (0.23, 0.77):
        for y in (0.21, 0.78):
            block("non-marking foot", (x, y, 0.028), (0.067, 0.066, 0.028), dark, 0.012)
            bar("tubular chair leg", (x, y, 0.25), 0.028, 0.44, steel)
        bar("rear upright", (x, 0.78, 0.74), 0.029, 0.57, steel)
        bar("seat-to-back bracket", (x, 0.73, 0.48), 0.024, 0.17, steel, "y")
        bar("seat captive rivet", (x, 0.22, 0.545), 0.014, 0.018, silver)
    bar("front transverse stretcher", (0.5, 0.22, 0.19), 0.021, 0.54, steel, "x")
    bar("rear transverse stretcher", (0.5, 0.77, 0.26), 0.021, 0.54, steel, "x")
    block("seat pan dark lip", (0.5, 0.46, 0.49), (0.34, 0.29, 0.04), edge, 0.035)
    block("moulded seat shell", (0.5, 0.45, 0.535), (0.33, 0.28, 0.045), shell, 0.065)
    block("slight seat crown", (0.5, 0.44, 0.583), (0.26, 0.215, 0.004), light, 0.003)
    block("back shell dark rim", (0.5, 0.775, 0.83),
        (0.35, 0.038, 0.215), edge, 0.030, -math.radians(8))
    block("broad classroom back shell", (0.5, 0.729, 0.83),
        (0.33, 0.038, 0.195), shell, 0.048, -math.radians(8))
    block("back front soft highlight", (0.5, 0.685, 0.845),
        (0.27, 0.006, 0.145), light, 0.006, -math.radians(8))
    # A narrow warm insert identifies classroom furniture without adding a
    # new object function or turning it into a desk.
    block("sealed timber lower back strip", (0.5, 0.686, 0.68),
        (0.24, 0.007, 0.013), wood, 0.004)
    for x in (0.24, 0.76):
        bar("back retaining fastener", (x, 0.678, 0.75), 0.013, 0.016, silver, "y")

    origin = bpy.data.objects.new("FootprintOrigin (1x1 square, minimum corner)", None)
    bpy.context.collection.objects.link(origin)
    origin.location = (0.5, 0.5, 0)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    print(f"authored existing classroom chair visual variant: {SOURCE}")


if __name__ == "__main__":
    build()
