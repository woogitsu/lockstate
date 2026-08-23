"""Create the complete MVP environment source-model catalog for Lockstate.

Every collection maps one-to-one to an owner-supplied source-art ID. Geometry is
deliberately modular, at one Blender unit per logical tile, so it can later be
replaced or refined without changing IDs, origins, or footprints.
"""
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common  # noqa: E402  (Blender does not add the script directory to sys.path)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets/source/blender/environment.mvp.catalog.blend"

PALETTE = {
    "concrete": (0.22, 0.23, 0.24, 1), "steel": (0.09, 0.12, 0.15, 1),
    "blue": (0.025, 0.09, 0.24, 1), "green": (0.12, 0.2, 0.14, 1),
    "wood": (0.28, 0.12, 0.035, 1), "light": (0.9, 0.92, 0.82, 1),
}

MODELS = (
    ("door.interior.variants", (1, 0.25)), ("door.security.variants", (1, 0.25)),
    ("fixture.ceiling_light.panel.variants", (1, 0.4)), ("fixture.cell.toilet_sink", (1, 1)),
    ("floor.concrete.variants", (2, 2)), ("floor.linoleum.institutional", (2, 2)),
    ("furniture.cell.bed.single.variants", (1, 2)), ("furniture.cell.locker.variants", (1, 1)),
    ("furniture.cell.table_stool", (2, 1)), ("furniture.corridor.bench.variants", (2, 1)),
    ("furniture.office.desk.employee.variants", (2, 1)), ("furniture.reception.counter.variants", (3, 1)),
    ("furniture.visitor.chair.variants", (1, 1)), ("perimeter.fence.modules", (3, 0.2)),
    ("perimeter.light.pole.variants", (1, 1)), ("perimeter.vehicle_gate.sliding.variants", (4, 0.3)),
    ("perimeter.watchtower.variants", (2, 2)), ("security.access_reader.variants", (0.4, 0.2)),
    ("security.camera.wall.variants", (0.6, 0.4)), ("security.checkpoint.turnstile.variants", (2, 1)),
    ("storage.container.variants", (2, 1)), ("wall.exterior.modules", (2, 0.25)),
    ("wall.interior.modules", (2, 0.2)),
)


def material(name, color):
    item = bpy.data.materials.new(name)
    item.diffuse_color = color
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    if shader is not None:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Roughness"].default_value = 0.62
    return item


MATERIALS = {}


def move_to_collection(item, collection):
    for current in list(item.users_collection):
        current.objects.unlink(item)
    collection.objects.link(item)


def box(collection, root, name, offset, size, surface, bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(location=(root.location.x + offset[0], root.location.y + offset[1], offset[2]))
    item = bpy.context.object
    item.name, item.scale = name, (size[0] / 2, size[1] / 2, size[2] / 2)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    item.data.materials.append(MATERIALS[surface])
    if bevel:
        modifier = item.modifiers.new("Soft edges", "BEVEL")
        modifier.width, modifier.segments = bevel, 2
    item.parent = root
    item.matrix_parent_inverse = root.matrix_world.inverted()
    move_to_collection(item, collection)
    return item


def cylinder(collection, root, name, offset, radius, depth, surface):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=depth, location=(root.location.x + offset[0], root.location.y + offset[1], offset[2]))
    item = bpy.context.object
    item.name, item.parent = name, root
    item.matrix_parent_inverse = root.matrix_world.inverted()
    item.data.materials.append(MATERIALS[surface])
    move_to_collection(item, collection)
    return item


def empty(collection, name, location):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
    item = bpy.context.object
    item.name = name
    move_to_collection(item, collection)
    return item


def furniture(collection, root, asset_id):
    if "bed" in asset_id:
        box(collection, root, "Frame", (0, 0, 0.42), (0.9, 1.9, 0.15), "steel")
        box(collection, root, "Mattress", (0, 0, 0.56), (0.82, 1.72, 0.18), "green")
        box(collection, root, "Pillow", (0, -0.6, 0.69), (0.62, 0.34, 0.1), "light")
    elif "locker" in asset_id:
        box(collection, root, "Locker", (0, 0, 1.0), (0.8, 0.55, 2.0), "steel")
        box(collection, root, "Door seam", (0, -0.281, 1.0), (0.03, 0.01, 1.75), "light", 0)
    elif "table_stool" in asset_id:
        box(collection, root, "Table", (0, 0, 0.72), (1.4, 0.72, 0.12), "steel")
        cylinder(collection, root, "Table leg", (0, 0, 0.35), 0.08, 0.65, "steel")
        for x in (-0.8, 0.8):
            cylinder(collection, root, f"Stool.{x}", (x, 0, 0.32), 0.22, 0.12, "steel")
            cylinder(collection, root, f"Stool base.{x}", (x, 0, 0.16), 0.06, 0.32, "steel")
    elif "bench" in asset_id:
        box(collection, root, "Seat", (0, 0, 0.55), (1.8, 0.45, 0.12), "wood")
        for x in (-0.65, 0.65): cylinder(collection, root, f"Leg.{x}", (x, 0, 0.25), 0.06, 0.5, "steel")
    elif "desk" in asset_id or "reception" in asset_id:
        length = 2.7 if "reception" in asset_id else 1.7
        box(collection, root, "Counter", (0, 0, 0.9), (length, 0.7, 0.15), "wood")
        box(collection, root, "Cabinet", (0, 0.18, 0.4), (length * 0.9, 0.48, 0.8), "steel")
    else:
        box(collection, root, "Chair seat", (0, 0, 0.5), (0.55, 0.55, 0.12), "steel")
        box(collection, root, "Chair back", (0, 0.22, 0.92), (0.55, 0.1, 0.78), "steel")
        cylinder(collection, root, "Chair base", (0, 0, 0.22), 0.06, 0.46, "steel")


def security(collection, root, asset_id):
    if "camera" in asset_id:
        box(collection, root, "Camera body", (0, 0, 1.1), (0.62, 0.36, 0.28), "concrete")
        cylinder(collection, root, "Lens", (0.32, -0.02, 1.1), 0.11, 0.08, "steel")
        box(collection, root, "Mount", (-0.2, 0, 0.75), (0.12, 0.12, 0.65), "steel")
    elif "reader" in asset_id:
        box(collection, root, "Reader", (0, 0, 0.55), (0.32, 0.1, 0.62), "steel")
        box(collection, root, "Status", (0, -0.06, 0.71), (0.18, 0.02, 0.05), "green", 0.01)
    elif "turnstile" in asset_id:
        cylinder(collection, root, "Hub", (0, 0, 0.65), 0.16, 1.3, "steel")
        for angle in (0, 2.09, 4.18):
            arm = box(collection, root, "Turnstile arm", (0.45 * __import__('math').cos(angle), 0.45 * __import__('math').sin(angle), 0.72), (0.9, 0.08, 0.08), "steel")
            arm.rotation_euler.z = angle
    else:
        box(collection, root, "Checkpoint gate", (0, 0, 1.5), (1.5, 0.25, 3.0), "steel")
        box(collection, root, "Opening", (0, -0.14, 1.4), (0.78, 0.04, 2.4), "light", 0)


def perimeter(collection, root, asset_id):
    if "fence" in asset_id:
        for x in (-1.3, 0, 1.3): cylinder(collection, root, f"Post.{x}", (x, 0, 1.15), 0.05, 2.3, "steel")
        for z in (0.55, 1.1, 1.65): box(collection, root, f"Rail.{z}", (0, 0, z), (2.8, 0.05, 0.05), "steel")
    elif "gate" in asset_id:
        box(collection, root, "Gate", (0, 0, 1.15), (3.5, 0.1, 2.3), "steel")
        for x in (-1.7, 1.7): cylinder(collection, root, f"Post.{x}", (x, 0, 1.35), 0.12, 2.7, "concrete")
    elif "watchtower" in asset_id:
        box(collection, root, "Tower", (0, 0, 2.0), (1.5, 1.5, 4.0), "concrete")
        box(collection, root, "Cabin", (0, 0, 4.3), (2.1, 2.1, 1.1), "blue")
        box(collection, root, "Roof", (0, 0, 5.0), (2.35, 2.35, 0.18), "steel")
    else:
        cylinder(collection, root, "Pole", (0, 0, 2.4), 0.08, 4.8, "steel")
        box(collection, root, "Lamp", (0, 0, 4.7), (0.65, 0.45, 0.22), "light")


def architectural(collection, root, asset_id):
    if asset_id.startswith("floor"):
        box(collection, root, "Tile", (0, 0, 0.06), (2, 2, 0.12), "concrete" if "concrete" in asset_id else "green", 0)
    elif asset_id.startswith("wall"):
        box(collection, root, "Wall module", (0, 0, 1.25), (2, 0.22, 2.5), "concrete")
        box(collection, root, "Base stripe", (0, -0.12, 0.42), (2, 0.03, 0.45), "green", 0)
    elif asset_id.startswith("door"):
        box(collection, root, "Frame", (0, 0, 1.3), (1.15, 0.28, 2.6), "concrete")
        box(collection, root, "Door", (0, -0.17, 1.25), (0.82, 0.06, 2.25), "blue" if "security" in asset_id else "wood")
        box(collection, root, "Window", (0, -0.205, 1.6), (0.25, 0.02, 0.42), "steel", 0)
    elif "toilet" in asset_id:
        cylinder(collection, root, "Toilet bowl", (0, 0, 0.42), 0.32, 0.5, "steel")
        box(collection, root, "Sink tank", (0, 0.2, 0.95), (0.55, 0.38, 0.7), "steel")
    else:
        box(collection, root, "Ceiling panel", (0, 0, 1.75), (1.2, 0.45, 0.18), "light")
        box(collection, root, "Housing", (0, 0.02, 1.88), (1.4, 0.5, 0.1), "steel")


def create_model(asset_id, footprint, index):
    collection = bpy.data.collections.new(asset_id)
    bpy.context.scene.collection.children.link(collection)
    collection["assetId"], collection["footprintTiles"] = asset_id, list(footprint)
    root = empty(collection, f"{asset_id}.origin", ((index % 6) * 7, (index // 6) * 7, 0))
    root["pivot"] = "bottom-center"
    if asset_id.startswith("furniture"):
        furniture(collection, root, asset_id)
    elif asset_id.startswith("security"):
        security(collection, root, asset_id)
    elif asset_id.startswith("perimeter"):
        perimeter(collection, root, asset_id)
    elif asset_id.startswith("storage"):
        box(collection, root, "Container", (0, 0, 0.9), (1.8, 0.9, 1.8), "green")
        box(collection, root, "Container doors", (0, -0.46, 0.9), (1.55, 0.03, 1.5), "steel", 0)
    else:
        architectural(collection, root, asset_id)


def main():
    pipeline_common.require_blender_version()
    pipeline_common.apply_deterministic_render_settings(bpy.context.scene)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name == "Collection": bpy.data.collections.remove(collection)
    for name, color in PALETTE.items(): MATERIALS[name] = material(name, color)
    for index, (asset_id, footprint) in enumerate(MODELS): create_model(asset_id, footprint, index)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))


if __name__ == "__main__": main()
