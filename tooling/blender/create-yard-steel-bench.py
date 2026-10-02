"""Author a weatherproof 2x1 Yard variant of the existing bench object."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/furniture.yard.steel-bench.blend"


def material(name: str, rgb: tuple[float, float, float], metallic: float = 0.0):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*rgb, 1.0)
    item.use_nodes = True
    surface = item.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*rgb, 1.0)
    surface.inputs["Metallic"].default_value = metallic
    surface.inputs["Roughness"].default_value = 0.55
    return item


def block(name, position, half_size, finish, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=position)
    item = bpy.context.object
    item.name = name
    item.scale = half_size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    item.data.materials.append(finish)
    if bevel:
        modifier = item.modifiers.new("soft outdoor edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        item.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return item


def round_bar(name, position, radius, length, finish, axis="z"):
    rotation = {
        "x": (0.0, math.pi / 2, 0.0),
        "y": (math.pi / 2, 0.0, 0.0),
        "z": (0.0, 0.0, 0.0),
    }[axis]
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=20, radius=radius, depth=length,
        location=position, rotation=rotation,
    )
    item = bpy.context.object
    item.name = name
    item.data.materials.append(finish)
    bevel = item.modifiers.new("machined rim", "BEVEL")
    bevel.width = min(0.012, radius * 0.25)
    bevel.segments = 2
    return item


def build() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    steel = material("powder-coated petrol frame", (0.10, 0.25, 0.30), 0.34)
    dark = material("charcoal anchor rubber", (0.12, 0.17, 0.18))
    timber = material("sealed weathered timber", (0.50, 0.43, 0.30))
    timber_edge = material("end-grain shadow", (0.33, 0.29, 0.22))
    silver = material("stainless fixings", (0.58, 0.63, 0.61), 0.65)
    warm = material("small warm safety marker", (0.82, 0.57, 0.18))

    # Four fixings and paired legs stay inside x[0,2], y[0,1]. The front is
    # toward -Y, matching the source orientation of other room furnishings.
    for x in (0.24, 1.76):
        for y in (0.23, 0.75):
            block("anchored rubber foot", (x, y, 0.035), (0.13, 0.11, 0.035), dark, 0.016)
            round_bar("anchor bolt", (x, y, 0.076), 0.018, 0.012, silver)
        block("front steel leg", (x, 0.23, 0.245), (0.043, 0.045, 0.20), steel, 0.018)
        block("rear steel leg", (x, 0.75, 0.40), (0.043, 0.045, 0.36), steel, 0.018)
        block("side seat bearer", (x, 0.49, 0.45), (0.047, 0.29, 0.04), steel, 0.014)
        block("back support", (x, 0.75, 0.80), (0.043, 0.048, 0.25), steel, 0.013)
    block("front seat rail", (1.0, 0.20, 0.46), (0.77, 0.036, 0.036), steel, 0.012)
    block("rear seat rail", (1.0, 0.74, 0.46), (0.77, 0.036, 0.036), steel, 0.012)

    # Three distinct planks and two back slats remain readable at gameplay
    # scale; subtle end-grain plates prevent a flat single-color rectangle.
    for index, y in enumerate((0.30, 0.47, 0.64)):
        block(f"seat timber slat {index + 1}", (1.0, y, 0.52), (0.81, 0.068, 0.037), timber, 0.016)
        for x in (0.19, 1.81):
            block("sealed slat end grain", (x, y, 0.52), (0.012, 0.064, 0.033), timber_edge, 0.005)
    for index, z in enumerate((0.74, 0.94)):
        block(f"back timber slat {index + 1}", (1.0, 0.73, z), (0.81, 0.045, 0.066), timber, 0.013)
        for x in (0.19, 1.81):
            round_bar("back captive rivet", (x, 0.675, z), 0.021, 0.015, silver, "y")

    for x in (0.24, 1.76):
        block("rounded end arm", (x, 0.48, 0.69), (0.06, 0.27, 0.043), steel, 0.03)
        block("arm tip marker", (x, 0.22, 0.694), (0.052, 0.018, 0.035), warm, 0.01)

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
    print(f"authored existing-bench Yard variant: {SOURCE}")


if __name__ == "__main__":
    build()
