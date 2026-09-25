"""Give the canonical wooden chair a distinct back, seat, and four feet.

Run against environment.mvp.catalog.blend with Blender 5.2. The chair's
collection is rebuilt from fixed dimensions, so running twice is idempotent.
"""

import bpy

ASSET_ID = "furniture.chair.wooden"
collection = bpy.data.collections[ASSET_ID]
origin = bpy.data.objects[f"{ASSET_ID}.origin"]
prefix = "Chair refinement."

for obj in list(collection.objects):
    if obj != origin:
        bpy.data.objects.remove(obj, do_unlink=True)


def make_box(name, location, dimensions, material, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=(
        origin.location.x + location[0], origin.location.y + location[1], location[2]
    ))
    obj = bpy.context.object
    obj.name = prefix + name
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(bpy.data.materials[material])
    if bevel:
        edge = obj.modifiers.new("Worn softened edge", "BEVEL")
        edge.width = bevel
        edge.segments = 2
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    for old_collection in tuple(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = origin
    obj.matrix_parent_inverse = origin.matrix_world.inverted()
    return obj


def make_cylinder(name, location, radius, depth, material, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius,
        depth=depth, location=(origin.location.x + location[0],
            origin.location.y + location[1], location[2]))
    obj = bpy.context.object
    obj.name = prefix + name
    obj.data.materials.append(bpy.data.materials[material])
    for old_collection in tuple(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = origin
    obj.matrix_parent_inverse = origin.matrix_world.inverted()
    return obj


# A broad uninterrupted seat reads as a single chair rather than a bench.
# The narrow front edge and two wood-grain seams remain visible at tile scale.
make_box("seat underframe", (0, 0.075, 0.49), (0.65, 0.56, 0.075), "Canteen worn steel", 0.018)
make_box("wooden seat", (0, 0.075, 0.568), (0.59, 0.52, 0.08), "Corridor bench worn wood plank 0", 0.055)
make_box("front seat edge", (0, 0.344, 0.57), (0.56, 0.025, 0.058), "Canteen worn steel", 0.006)

# Put real air between the seat and the raised back. The back's frame and
# broad walnut rail form a separate silhouette in the straight-down render.
for x in (-0.32, 0.32):
    make_cylinder(f"rear post {x}", (x, -0.43, 0.66), 0.039, 1.32, "Canteen worn steel")
    make_cylinder(f"rear foot {x}", (x, -0.43, 0.035), 0.066, 0.07, "shade")
    make_cylinder(f"front leg {x}", (x, 0.405, 0.265), 0.041, 0.53, "Canteen worn steel")
    make_cylinder(f"front foot {x}", (x, 0.405, 0.035), 0.063, 0.07, "shade")
    make_box(f"back bracket {x}", (x, -0.323, 0.79), (0.055, 0.205, 0.055), "Canteen worn steel", 0.012)

make_box("dark back inset", (0, -0.435, 1.02), (0.63, 0.135, 0.10), "shade", 0.026)
make_box("walnut back rail", (0, -0.435, 1.085), (0.61, 0.12, 0.09), "Corridor bench worn wood plank 1", 0.034)
make_box("back edge highlight", (0, -0.488, 1.14), (0.55, 0.012, 0.007), "Canteen worn steel", 0.003)

assert len(collection.objects) == 17, "chair refinement has unexpected geometry"
assert all(obj == origin or obj.name.startswith(prefix) for obj in collection.objects)
bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
