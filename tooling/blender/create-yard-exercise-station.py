"""Author a compact two-square outdoor exercise station for future Yard content.

The source is centered on (0,0), with a 2x1 occupied-square footprint. The
separate oblique renderer supplies cameras; this file stores authored geometry.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/furniture.yard.exercise-station.blend"


def material(name: str, rgb: tuple[float, float, float], metallic: float = 0.0):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*rgb, 1.0)
    item.use_nodes = True
    surface = item.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*rgb, 1.0)
    surface.inputs["Metallic"].default_value = metallic
    surface.inputs["Roughness"].default_value = 0.49
    return item


def block(name, position, half_size, finish, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=position)
    item = bpy.context.object
    item.name = name
    item.scale = half_size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    item.data.materials.append(finish)
    if bevel:
        modifier = item.modifiers.new("rounded forged edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        item.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return item


def tube(name, position, radius, length, finish, axis="z", vertices=20):
    rotation = {
        "x": (0.0, math.pi / 2, 0.0),
        "y": (math.pi / 2, 0.0, 0.0),
        "z": (0.0, 0.0, 0.0),
    }[axis]
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=length,
        location=position, rotation=rotation,
    )
    item = bpy.context.object
    item.name = name
    item.data.materials.append(finish)
    bevel = item.modifiers.new("machined rim", "BEVEL")
    bevel.width = min(radius * 0.22, 0.018)
    bevel.segments = 2
    item.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return item


def build() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    navy = material("powder-coated petrol steel", (0.11, 0.27, 0.32), 0.34)
    silver = material("brushed stainless grip", (0.54, 0.62, 0.61), 0.68)
    gold = material("warm safety sleeve", (0.86, 0.59, 0.18), 0.08)
    rubber = material("weatherproof charcoal rubber", (0.12, 0.17, 0.17))
    inset = material("anti-slip inset", (0.20, 0.27, 0.26))

    # Four anchored plates define a legible 2x1 occupied-square footprint.
    for x in (-0.78, 0.78):
        for y in (-0.27, 0.27):
            block("anchored rubber foot", (x, y, 0.045), (0.17, 0.17, 0.045), rubber, 0.025)
            block("anti-slip inset", (x, y, 0.091), (0.12, 0.12, 0.006), inset, 0.01)
            for bolt_x in (-0.10, 0.10):
                tube("captive foot bolt", (x + bolt_x, y, 0.099), 0.017, 0.012, silver)

    # The taller pull-up bridge sits to the north; an orange sleeve marks each
    # graspable end, so the shape remains readable in a 128 px angled sprite.
    for x in (-0.78, 0.78):
        tube("tall uprights", (x, 0.27, 0.86), 0.055, 1.62, navy)
        tube("closed post cap", (x, 0.27, 1.68), 0.068, 0.035, gold)
    tube("pull-up bridge", (0, 0.27, 1.56), 0.042, 1.62, silver, "x")
    for x in (-0.56, 0.56):
        tube("grip sleeve", (x, 0.27, 1.56), 0.052, 0.22, gold, "x")

    # A low parallel-bar pair provides a second exercise silhouette while
    # keeping all visible geometry inside the same occupied two-square strip.
    for x in (-0.78, 0.78):
        tube("low support", (x, -0.27, 0.45), 0.047, 0.83, navy)
        tube("low joint", (x, -0.27, 0.88), 0.062, 0.04, gold)
    tube("parallel grip", (0, -0.27, 0.87), 0.041, 1.62, silver, "x")
    for x in (-0.52, 0.52):
        tube("parallel sleeve", (x, -0.27, 0.87), 0.051, 0.19, gold, "x")
    for x in (-0.78, 0.78):
        tube("side stabilizer", (x, 0, 0.27), 0.031, 0.54, navy, "y")

    origin = bpy.data.objects.new("FootprintOrigin (2x1 squares, centered)", None)
    bpy.context.collection.objects.link(origin)
    origin.location = (0, 0, 0)
    bpy.context.scene.render.engine = "BLENDER_WORKBENCH"
    bpy.context.scene.display.shading.light = "STUDIO"
    bpy.context.scene.display.shading.studio_light = "paint.sl"
    bpy.context.scene.display.shading.color_type = "MATERIAL"
    bpy.context.scene.display.shading.show_shadows = True
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    print(f"authored source: {SOURCE}")


if __name__ == "__main__":
    build()
