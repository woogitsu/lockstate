"""Author a 2x1 Common Room skin for the existing bench object.

This is presentation only: the object catalogue, Build price and save identity
remain `object.bench`. Coordinates use the minimum corner of its two squares.
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
SOURCE = ROOT / "assets/source/blender/furniture.common-room.upholstered-bench.blend"


def material(name: str, rgb: tuple[float, float, float], metallic: float = 0.0, roughness: float = 0.72):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*rgb, 1.0)
    item.use_nodes = True
    surface = item.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*rgb, 1.0)
    surface.inputs["Metallic"].default_value = metallic
    surface.inputs["Roughness"].default_value = roughness
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
        modifier = item.modifiers.new("soft upholstered edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
        item.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return item


def bolt(name, x, y, z, finish):
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.016, depth=0.012,
        location=(x, y, z))
    item = bpy.context.object
    item.name = name
    item.data.materials.append(finish)
    return item


def build() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    # The muted petrol steel, warm timber and rubber are already used by the
    # Yard bench. Fabric stays inside the game's institutional teal/grey range.
    steel = material("powder-coated petrol steel", (0.10, 0.25, 0.30), 0.34, 0.55)
    dark = material("charcoal rubber", (0.12, 0.17, 0.18))
    fabric = material("warm grey teal woven upholstery", (0.31, 0.40, 0.40))
    fabric_top = material("cushion light-catching weave", (0.38, 0.47, 0.46))
    fabric_edge = material("recessed cushion seam", (0.17, 0.26, 0.28))
    timber = material("sealed warm timber arm cap", (0.50, 0.43, 0.30))
    silver = material("stainless captive fittings", (0.58, 0.63, 0.61), 0.65, 0.42)

    for x in (0.22, 1.78):
        for y in (0.19, 0.79):
            block("non-marking rubber foot", (x, y, 0.028), (0.10, 0.09, 0.028), dark, 0.012)
            block("steel upright", (x, y, 0.25), (0.035, 0.038, 0.21), steel, 0.012)
        block("side seat bearer", (x, 0.49, 0.43), (0.044, 0.34, 0.033), steel, 0.012)
        block("back support", (x, 0.78, 0.70), (0.036, 0.037, 0.26), steel, 0.013)
        block("sealed timber arm", (x, 0.48, 0.69), (0.063, 0.27, 0.037), timber, 0.026)
        bolt("arm captive fitting", x, 0.25, 0.728, silver)
    for y in (0.20, 0.78):
        block("continuous under-seat rail", (1, y, 0.43), (0.80, 0.034, 0.034), steel, 0.010)
    block("seat support panel", (1, 0.48, 0.49), (0.80, 0.31, 0.06), dark, 0.025)

    # Two independent upholstered places make this a Common Room furnishing,
    # while remaining recognisably the existing two-square bench. At 64 px per
    # tile the central seam and separated back pads survive downsampling.
    for index, x in enumerate((0.60, 1.40)):
        block(f"seat cushion {index + 1}", (x, 0.46, 0.565),
            (0.36, 0.255, 0.091), fabric, 0.075)
        block(f"seat highlight {index + 1}", (x, 0.45, 0.658),
            (0.30, 0.205, 0.004), fabric_top, 0.003)
        for y in (0.22, 0.70):
            block(f"bound seat seam {index + 1}", (x, y, 0.585),
                (0.32, 0.006, 0.008), fabric_edge, 0.003)
        block(f"back cushion {index + 1}", (x, 0.735, 0.82),
            (0.35, 0.060, 0.17), fabric, 0.045, -math.radians(7))
        block(f"back pad highlight {index + 1}", (x, 0.66, 0.85),
            (0.30, 0.008, 0.09), fabric_top, 0.007, -math.radians(7))
    block("dark center seat reveal", (1, 0.46, 0.646), (0.021, 0.22, 0.007), fabric_edge, 0.002)
    block("dark center back reveal", (1, 0.654, 0.84), (0.017, 0.009, 0.14), fabric_edge, 0.002)

    origin = bpy.data.objects.new("FootprintOrigin (2x1 squares, minimum corner)", None)
    bpy.context.collection.objects.link(origin)
    origin.location = (1.0, 0.5, 0)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    print(f"authored existing-bench Common Room variant: {SOURCE}")


if __name__ == "__main__":
    build()
