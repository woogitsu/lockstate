"""Author a weatherproof 1x1 Yard skin of the existing waste-bin object."""
from __future__ import annotations

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/fixture.yard.steel-waste-bin.blend"


def material(name: str, rgb: tuple[float, float, float], metallic: float = 0.0):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*rgb, 1.0)
    item.use_nodes = True
    surface = item.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*rgb, 1.0)
    surface.inputs["Metallic"].default_value = metallic
    surface.inputs["Roughness"].default_value = 0.52
    return item


def block(name, position, half_size, finish, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=position)
    item = bpy.context.object
    item.name = name
    item.scale = half_size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    item.data.materials.append(finish)
    if bevel:
        mod = item.modifiers.new("weather-softened edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        item.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return item


def tube(name, position, radius, length, finish, axis="z"):
    rotation = {
        "x": (0.0, math.pi / 2, 0.0),
        "y": (math.pi / 2, 0.0, 0.0),
        "z": (0.0, 0.0, 0.0),
    }[axis]
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=length, location=position, rotation=rotation)
    item = bpy.context.object
    item.name = name
    item.data.materials.append(finish)
    return item


def build() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    steel = material("powder-coated petrol steel", (0.10, 0.25, 0.30), 0.35)
    dark = material("charcoal inner liner and rubber", (0.10, 0.15, 0.16))
    rim = material("brushed stainless edge", (0.54, 0.62, 0.61), 0.62)
    marker = material("small amber safety marker", (0.81, 0.54, 0.16))
    shadow = material("panel recess", (0.055, 0.13, 0.15))

    # All visible geometry stays within the occupied minimum-corner 1x1 tile.
    block("anchored dark base", (0.5, 0.5, 0.045), (0.37, 0.37, 0.045), dark, 0.018)
    for x in (0.2, 0.8):
        for y in (0.2, 0.8):
            tube("stainless anchor bolt", (x, y, 0.092), 0.018, 0.013, rim)
    block("sealed steel body", (0.5, 0.5, 0.49), (0.31, 0.31, 0.39), steel, 0.045)
    # Vertical pressed ribs make the silhouette distinct from the cylindrical
    # indoor pedal bin, even at 20-degree elevation and game-scale zoom.
    for x in (0.31, 0.5, 0.69):
        block("front pressed steel rib", (x, 0.181, 0.49), (0.014, 0.013, 0.31), rim, 0.008)
        block("back pressed steel rib", (x, 0.819, 0.49), (0.014, 0.013, 0.31), rim, 0.008)
    for y in (0.31, 0.5, 0.69):
        block("left pressed steel rib", (0.181, y, 0.49), (0.013, 0.014, 0.31), rim, 0.008)
        block("right pressed steel rib", (0.819, y, 0.49), (0.013, 0.014, 0.31), rim, 0.008)

    block("rain-hood undertray", (0.5, 0.5, 0.92), (0.36, 0.36, 0.045), shadow, 0.02)
    block("weatherproof pitched cap", (0.5, 0.5, 1.065), (0.38, 0.38, 0.055), steel, 0.035)
    block("cap stainless lip front", (0.5, 0.12, 1.055), (0.36, 0.013, 0.016), rim, 0.006)
    block("cap stainless lip rear", (0.5, 0.88, 1.055), (0.36, 0.013, 0.016), rim, 0.006)
    for x in (0.25, 0.75):
        block("rain hood spacer", (x, 0.5, 0.975), (0.035, 0.035, 0.085), steel, 0.01)
    # A dark, recessed front slot remains legible instead of implying an open
    # trash cavity that rain can enter. The colored mark is identification only.
    block("front waste aperture", (0.5, 0.138, 0.805), (0.215, 0.018, 0.060), dark, 0.015)
    block("front aperture lip", (0.5, 0.114, 0.741), (0.23, 0.016, 0.012), rim, 0.006)
    block("front amber marker", (0.5, 0.176, 0.35), (0.09, 0.008, 0.04), marker, 0.006)

    anchor = bpy.data.objects.new("FootprintOrigin (1x1 square, minimum corner)", None)
    bpy.context.collection.objects.link(anchor)
    anchor.location = (0.5, 0.5, 0)
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    for item in bpy.data.objects:
        if item.type != "MESH":
            continue
        evaluated = item.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        evaluated.to_mesh_clear()
    bounds = [(min(point[axis] for point in points), max(point[axis] for point in points)) for axis in range(3)]
    assert 0 <= bounds[0][0] < bounds[0][1] <= 1, bounds
    assert 0 <= bounds[1][0] < bounds[1][1] <= 1, bounds
    assert 0 <= bounds[2][0] < bounds[2][1] <= 1.2, bounds
    print(f"evaluated 1x1 bounds: {bounds}")
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    print(f"authored existing-waste-bin Yard variant: {SOURCE}")


if __name__ == "__main__":
    build()
