"""Rebuild the interior door face in the canonical Blender 5.2 scene.

Fixed names and dimensions make repeated execution idempotent. The one-tile
footprint, origin, overhead camera and runtime mapping remain unchanged.
"""

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()

ASSET_ID = "door.interior.face"
COLLECTION = bpy.data.collections[ASSET_ID]
ORIGIN = bpy.data.objects[f"{ASSET_ID}.origin"]
PREFIX = "Interior door face refinement."

for obj in list(COLLECTION.objects):
    if obj != ORIGIN:
        bpy.data.objects.remove(obj, do_unlink=True)


def material(name, rgb, roughness=0.72):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*rgb, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


plaster = material(PREFIX + "plaster", (0.58, 0.59, 0.58))
steel = material(PREFIX + "galvanized steel", (0.50, 0.55, 0.56), 0.42)
steel_light = material(PREFIX + "lit steel", (0.72, 0.76, 0.76), 0.34)
steel_shadow = material(PREFIX + "dark steel", (0.16, 0.20, 0.21))
walnut = material(PREFIX + "walnut leaf", (0.43, 0.21, 0.105))
walnut_edge = material(PREFIX + "panel shadow", (0.15, 0.075, 0.041))
walnut_bevel = material(PREFIX + "panel bevel", (0.58, 0.32, 0.16))
walnut_field = material(PREFIX + "panel field", (0.38, 0.18, 0.09))


def attach(obj, name, mat):
    obj.name = PREFIX + name
    obj.data.materials.append(mat)
    for coll in tuple(obj.users_collection):
        coll.objects.unlink(obj)
    COLLECTION.objects.link(obj)
    obj.parent = ORIGIN
    obj.matrix_parent_inverse = ORIGIN.matrix_world.inverted()
    return obj


def box(name, x, y, z, width, height, depth, mat, bevel=0):
    bpy.ops.mesh.primitive_cube_add(size=1,
        location=(ORIGIN.location.x + x, ORIGIN.location.y + y, z))
    obj = bpy.context.object
    obj.dimensions = (width, height, depth)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new("Soft stamped edge", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return attach(obj, name, mat)


def cylinder(name, x, y, z, radius, depth, mat, vertices=24):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
        location=(ORIGIN.location.x + x, ORIGIN.location.y + y, z))
    return attach(bpy.context.object, name, mat)


# Preserve the established elevation within the same 1x1 transparent tile.
box("wall surround", 0, 0, 0.04, 1, 1, 0.08, plaster)
box("head coping", 0, -0.468, 0.084, 1, 0.064, 0.005, steel_light)
box("recessed doorway", 0, 0.055, 0.085, 0.91, 0.87, 0.008, steel_shadow)
box("walnut door leaf", 0, 0.064, 0.096, 0.76, 0.80, 0.012, walnut)

for x in (-0.436, 0.436):
    box(f"steel jamb {x}", x, 0.055, 0.106, 0.073, 0.89, 0.02, steel, 0.004)
    box(f"jamb rebate {x}", x * 0.91, 0.05, 0.118, 0.012, 0.80, 0.004, steel_shadow)
box("steel header", 0, -0.390, 0.108, 0.94, 0.068, 0.018, steel_light, 0.005)
box("dark threshold", 0, 0.475, 0.106, 0.86, 0.034, 0.010, steel_shadow)

# A dark rebate, bright bevel and darker inset field replace the flat beige
# rectangles. The four-pixel relief survives the 256->128->64 game reduction.
for y, label in ((-0.18, "upper"), (0.20, "lower")):
    box(f"{label} recessed shadow", 0, y, 0.111, 0.60, 0.265, 0.010, walnut_edge, 0.008)
    box(f"{label} raised walnut bevel", 0, y - 0.007, 0.119,
        0.54, 0.210, 0.012, walnut_bevel, 0.008)
    box(f"{label} inset field", 0, y - 0.006, 0.128,
        0.48, 0.155, 0.010, walnut_field, 0.005)
    box(f"{label} lower catchlight", 0, y + 0.094, 0.129,
        0.48, 0.012, 0.004, walnut_bevel)

# A broad plate plus a dark lever reads as a lock at zoom 1. The latch sits
# inside the same leaf and does not change any game hit box or interaction.
box("latch dark socket", 0.302, 0.004, 0.129, 0.092, 0.140, 0.010,
    steel_shadow, 0.008)
box("latch steel plate", 0.303, 0.004, 0.137, 0.070, 0.118, 0.010,
    steel_light, 0.008)
box("latch dark lever", 0.295, 0.004, 0.146, 0.035, 0.075, 0.010,
    steel_shadow, 0.006)
cylinder("latch pivot", 0.297, -0.028, 0.151, 0.012, 0.008, steel)

for y in (-0.265, 0.29):
    box(f"left hinge {y}", -0.38, y, 0.122, 0.038, 0.065, 0.011,
        steel_light, 0.004)

assert list(COLLECTION.get("footprintTiles")) == [1, 1]
assert all(obj == ORIGIN or obj.name.startswith(PREFIX) for obj in COLLECTION.objects)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
