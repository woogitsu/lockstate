"""Rebuild the waste bin as one overhead silhouette in the canonical scene.

Run with Blender 5.2 against environment.mvp.catalog.blend. The collection is
rebuilt from fixed dimensions and names, so repeated runs are idempotent.
"""

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()

ASSET_ID = "fixture.cell.waste_bin"
COLLECTION = bpy.data.collections[ASSET_ID]
ORIGIN = bpy.data.objects[f"{ASSET_ID}.origin"]
PREFIX = "Waste bin refinement."

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


teal = material("Waste bin refinement deep teal enamel", (0.11, 0.38, 0.41))
teal_light = material("Waste bin refinement lit enamel", (0.24, 0.54, 0.55))
dark = material("Waste bin refinement black cavity", (0.018, 0.028, 0.031))
steel = material("Waste bin refinement brushed steel", (0.53, 0.57, 0.57), 0.38)
paper = material("Waste bin refinement pale paper", (0.73, 0.72, 0.64))
orange = material("Waste bin refinement orange scrap", (0.55, 0.23, 0.11))


def attach(obj, name, mat):
    obj.name = PREFIX + name
    obj.data.materials.append(mat)
    for coll in tuple(obj.users_collection):
        coll.objects.unlink(obj)
    COLLECTION.objects.link(obj)
    obj.parent = ORIGIN
    obj.matrix_parent_inverse = ORIGIN.matrix_world.inverted()
    return obj


def cylinder(name, x, y, z, radius, depth, mat, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth,
        location=(ORIGIN.location.x + x, ORIGIN.location.y + y, z))
    return attach(bpy.context.object, name, mat)


def box(name, x, y, z, width, height, depth, mat, bevel=0.0):
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


def torus(name, x, y, z, radius, thickness, mat):
    bpy.ops.mesh.primitive_torus_add(major_radius=radius, minor_radius=thickness,
        location=(ORIGIN.location.x + x, ORIGIN.location.y + y, z))
    return attach(bpy.context.object, name, mat)


# The body is a broad teal shape with a dark opening; the shell remains visible
# outside the cavity even when the 256 px render is drawn in a 64 px tile.
cylinder("tapered shell", 0, 0.055, 0.37, 0.355, 0.69, teal)
cylinder("lit upper shoulder", 0, 0.055, 0.716, 0.355, 0.055, teal_light)
cylinder("open liner", 0, 0.055, 0.751, 0.255, 0.020, dark)
torus("continuous steel rim", 0, 0.055, 0.761, 0.282, 0.015, steel)

# A solid enamel hinge bridge crosses the old gap between two circular tops.
box("lid hinge bridge", 0, -0.205, 0.80, 0.42, 0.22, 0.10, teal, 0.035)
box("hinge highlight", 0, -0.205, 0.861, 0.32, 0.035, 0.012, steel, 0.005)
box("raised rectangular lid", 0, -0.33, 0.885, 0.65, 0.26, 0.07, teal_light, 0.045)
box("lid dark inset", 0, -0.335, 0.923, 0.51, 0.15, 0.009, teal, 0.025)
box("lid front edge", 0, -0.205, 0.929, 0.62, 0.032, 0.014, steel, 0.006)

for index, (x, y, angle) in enumerate(((-0.10, 0.04, 0.35), (0.09, -0.055, -0.36))):
    scrap = box(f"paper {index}", x, y, 0.772, 0.11, 0.09, 0.018, paper, 0.005)
    scrap.rotation_euler.z = angle
card = box("orange discarded card", 0.10, 0.15, 0.773, 0.13, 0.08, 0.02, orange, 0.005)
card.rotation_euler.z = 0.18

box("pedal linkage", 0, 0.40, 0.10, 0.08, 0.19, 0.05, teal, 0.01)
box("broad pedal", 0, 0.475, 0.125, 0.30, 0.13, 0.05, steel, 0.018)
box("pedal grip", 0, 0.476, 0.155, 0.22, 0.072, 0.009, dark, 0.006)

assert len(COLLECTION.objects) == 16, "waste bin refinement has unexpected geometry"
assert all(obj == ORIGIN or obj.name.startswith(PREFIX) for obj in COLLECTION.objects)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
