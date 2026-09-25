"""Refine the stocked shelf silhouette in the canonical environment scene.

Run with Blender 5.2 in background against environment.mvp.catalog.blend.
Only furniture.storage.rack.wooden is changed. Re-running is idempotent.
"""

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common  # noqa: E402

pipeline_common.require_blender_version()

ASSET_ID = "furniture.storage.rack.wooden"
COLLECTION = bpy.data.collections[ASSET_ID]
ORIGIN = bpy.data.objects[f"{ASSET_ID}.origin"]
PREFIX = "Rack refinement."

# Object names are global in a .blend. Clear all objects owned by this pass,
# including any that a previous save left linked to another collection.
for obj in list(bpy.data.objects):
    if obj.name.startswith(PREFIX):
        bpy.data.objects.remove(obj, do_unlink=True)
assert not any(obj.name.startswith(PREFIX) for obj in bpy.data.objects)
created_names = []


def material(name, color, roughness=0.78):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1)
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


cardboard = material("Rack kraft cardboard", (0.49, 0.32, 0.16))
cardboard_edge = material("Rack cardboard edge", (0.27, 0.16, 0.08))
paper = material("Rack ivory inventory label", (0.73, 0.73, 0.64))
muted_red = material("Rack red stock mark", (0.43, 0.16, 0.12))
canvas = material("Rack muted blue canvas", (0.18, 0.28, 0.31))
canvas_edge = material("Rack canvas fold shadow", (0.07, 0.13, 0.15))
shadow = material("Rack under-shelf shadow", (0.055, 0.045, 0.036))
steel = bpy.data.materials["Canteen worn steel"]


def box(name, xyz, dims, mat, bevel=0.004):
    object_name = PREFIX + name
    assert bpy.data.objects.get(object_name) is None, f"duplicate rack detail: {object_name}"
    bpy.ops.mesh.primitive_cube_add(size=1, location=(ORIGIN.location.x + xyz[0], ORIGIN.location.y + xyz[1], xyz[2]))
    obj = bpy.context.object
    obj.name = object_name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        modifier = obj.modifiers.new("Soft manufactured edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    for coll in tuple(obj.users_collection):
        coll.objects.unlink(obj)
    COLLECTION.objects.link(obj)
    obj.parent = ORIGIN
    obj.matrix_parent_inverse = ORIGIN.matrix_world.inverted()
    created_names.append(object_name)
    return obj


# Dark horizontal pockets keep the stepped boards separate under overhead light.
for index, (y, z) in enumerate(((-0.285, 1.11), (0.005, 0.77), (0.295, 0.43))):
    box(f"recess {index}", (0, y + 0.067, z), (0.71, 0.105, 0.013), shadow)
    box(f"steel rail {index}", (0, y + 0.128, z - 0.004), (0.75, 0.018, 0.035), steel, 0.003)

# Replace featureless pale cubes with a kraft carton, a labelled supply box,
# and a soft canvas packet. Their top marks survive a 64-pixel tile render.
for name in ("Middle carton", "South carton", "South folded bundle.0", "South folded bundle.1", "South bundle strap"):
    old = COLLECTION.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)

box("middle carton", (0.19, 0, 0.952), (0.25, 0.135, 0.15), cardboard, 0.01)
box("middle carton central seam", (0.19, 0, 1.031), (0.012, 0.105, 0.003), cardboard_edge, 0)
box("middle carton label", (0.252, 0, 1.034), (0.062, 0.074, 0.002), paper, 0)
box("middle carton mark", (0.252, 0, 1.036), (0.037, 0.009, 0.002), muted_red, 0)

box("south supply crate", (-0.18, 0.29, 0.60), (0.27, 0.15, 0.16), cardboard, 0.007)
for x in (-0.294, -0.066):
    box(f"south crate edge {x}", (x, 0.29, 0.682), (0.013, 0.135, 0.006), cardboard_edge, 0)
box("south crate printed band", (-0.18, 0.29, 0.686), (0.14, 0.026, 0.003), muted_red, 0)

for y, z, width in ((0.267, 0.585, 0.255), (0.315, 0.621, 0.238)):
    box(f"canvas packet {y}", (0.18, y, z), (width, 0.067, 0.052), canvas, 0.014)
    box(f"canvas hem {y}", (0.18, y + 0.027, z + 0.028), (width - 0.024, 0.008, 0.004), canvas_edge, 0)
box("canvas tie", (0.18, 0.29, 0.655), (0.03, 0.143, 0.008), paper, 0)

# The old crate's solid top looked like another box. Give it a recessed lid
# and two narrow timber slats while preserving its footprint and height.
box("north crate lid inset", (-0.19, -0.29, 1.374), (0.226, 0.089, 0.004), cardboard_edge, 0)
for x in (-0.275, -0.105):
    box(f"north crate lid slat {x}", (x, -0.29, 1.379), (0.046, 0.088, 0.006), cardboard, 0.002)

owned_names = {obj.name for obj in bpy.data.objects if obj.name.startswith(PREFIX)}
assert len(created_names) == len(set(created_names))
assert owned_names == set(created_names), "rack refinement left stale or renamed objects"
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
