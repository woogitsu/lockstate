"""Create the complete MVP environment source-model catalog for Lockstate.

Every collection maps one-to-one to an owner-supplied source-art ID. Geometry is
deliberately modular, at one Blender unit per logical tile, so it can later be
replaced or refined without changing IDs, origins, or footprints.

## The refinement that sentence promised (2026-09-06)

The first pass built every model out of boxes and 16-sided cylinders in a
six-colour palette with one 0.03 bevel, which is a placeholder and reads as one:
rendered straight down by `tooling/blender/render-environment-objects.py`, the
bed was three flat rounded rectangles and `fixture.cell.toilet_sink` was a
cylinder hidden underneath a box. This pass replaces the geometry and keeps the
contract: **the `MODELS` tuple, every collection name, every `assetId`, every
`footprintTiles` pair and every origin empty's position are byte-for-byte what
they were.** Only what is inside a collection changed.

What it is refining *for* is a top-down view at 64 to 128 pixels a tile, which
is the only view `tile-layer.ts` can draw. That rules most modelling detail out
before it is attempted -- a locker's door, a fence's rails and a camera's mount
are all elevation and contribute nothing from above -- and it rules three things
in:

- **Silhouette breaks.** A shape is read from above by its outline and by the
  steps in it. The bed's head and foot rails now stand proud of the mattress, so
  the bed has ends; the container's roof carries ribs; the bench is three slats
  with gaps rather than one plank.
- **Tonal separation between adjacent parts.** Every part used to be one of six
  colours at one roughness (0.62), so a steel bowl inside a steel cistern was
  invisible. The palette now carries porcelain, linen, blanket and a near-black
  `shade` used for seams, openings and joints, and each material carries its own
  roughness, so the specular breaks the parts apart even where the albedo is
  close.
- **One recognisable feature per object.** A player identifies a 64px sprite by
  one thing: the pillow at the head of the bed, the dark opening in the toilet
  seat, the folded blanket at the foot. Those are modelled; the rest is mass.

Nothing here is textured, because nothing in this pipeline is: these are flat
materials under two suns. That ceiling is real and is stated in the pull
request rather than implied away.
"""
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common  # noqa: E402  (Blender does not add the script directory to sys.path)

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets/source/blender/environment.mvp.catalog.blend"

# Colour and roughness together, because separating two parts in a top-down view
# is as often a specular difference as an albedo one. `shade` is not a material
# anything is made of: it is the near-black used for a seam, an opening or a
# joint, and it is what makes a hole read as a hole at 64px.
PALETTE = {
    "concrete": ((0.22, 0.23, 0.24, 1), 0.85), "steel": ((0.09, 0.12, 0.15, 1), 0.45),
    "blue": ((0.025, 0.09, 0.24, 1), 0.55), "green": ((0.12, 0.2, 0.14, 1), 0.7),
    "wood": ((0.28, 0.12, 0.035, 1), 0.6), "light": ((0.9, 0.92, 0.82, 1), 0.75),
    "porcelain": ((0.78, 0.8, 0.81, 1), 0.25), "linen": ((0.46, 0.45, 0.41, 1), 0.88),
    "blanket": ((0.1, 0.17, 0.24, 1), 0.92), "shade": ((0.035, 0.04, 0.045, 1), 0.9),
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
    # Append new collections: existing origins are part of the reproducible scene.
    ("fixture.cell.sink", (1, 1)), ("fixture.shower.head", (1, 1)),
    ("fixture.cell.waste_bin", (1, 1)),
    ("furniture.storage.rack.wooden", (1, 1)),
    ("furniture.chair.wooden", (1, 1)),
)


def material(name, color, roughness):
    item = bpy.data.materials.new(name)
    item.diffuse_color = color
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    if shader is not None:
        shader.inputs["Base Color"].default_value = color
        shader.inputs["Roughness"].default_value = roughness
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


def cylinder(collection, root, name, offset, radius, depth, surface, vertices=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=(root.location.x + offset[0], root.location.y + offset[1], offset[2]))
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
        # Head and foot rails stand proud of the mattress so the bed has ends
        # from above; the pillow and the folded blanket are the two features
        # that make it a bed rather than a slab at 64px.
        box(collection, root, "Frame", (0, 0, 0.4), (0.94, 1.96, 0.14), "steel", 0.04)
        box(collection, root, "Head rail", (0, -0.93, 0.6), (0.94, 0.1, 0.26), "steel", 0.05)
        box(collection, root, "Foot rail", (0, 0.93, 0.62), (0.94, 0.1, 0.2), "steel", 0.05)
        box(collection, root, "Mattress", (0, 0, 0.57), (0.82, 1.74, 0.2), "linen", 0.05)
        box(collection, root, "Blanket", (0, 0.56, 0.695), (0.82, 0.56, 0.05), "blanket", 0.03)
        box(collection, root, "Pillow", (0, -0.62, 0.735), (0.64, 0.34, 0.13), "light", 0.06)
    elif asset_id == "furniture.storage.rack.wooden":
        # Open cubbies, not the solid locker once mistaken for this object.
        # Three separate shelves and their contents carry the silhouette at
        # the 64 px in-game scale; the dark gaps are intentional negative space.
        for x in (-0.43, 0.43):
            box(collection, root, f"Side post.{x}", (x, 0, 0.68), (0.07, 0.88, 1.36), "wood", 0.012)
        box(collection, root, "Back rail", (0, 0.43, 1.24), (0.79, 0.06, 0.13), "steel", 0.008)
        for index_shelf, y in enumerate((-0.28, 0, 0.28)):
            box(collection, root, f"Shelf.{index_shelf}", (0, y, 1.19), (0.79, 0.20, 0.09), "wood", 0.01)
        box(collection, root, "North crate", (-0.19, -0.28, 1.30), (0.26, 0.13, 0.14), "green", 0.012)
        box(collection, root, "North bundle", (0.19, -0.28, 1.28), (0.25, 0.13, 0.10), "linen", 0.012)
        box(collection, root, "Middle crate", (0.08, 0, 1.31), (0.36, 0.13, 0.16), "blue", 0.012)
        box(collection, root, "South bundle", (-0.17, 0.28, 1.28), (0.29, 0.13, 0.10), "linen", 0.012)
        box(collection, root, "South crate", (0.20, 0.28, 1.30), (0.20, 0.13, 0.14), "green", 0.012)
    elif asset_id == "furniture.chair.wooden":
        # A chair must keep its back, seat and legs separate at 64 px. The
        # older visitor-chair render was only a cushion-shaped blob when drawn
        # in the game, so this one has a broad slatted back and splayed feet.
        for x in (-0.30, 0.30):
            box(collection, root, f"Back post.{x}", (x, -0.34, 0.63), (0.075, 0.08, 1.22), "wood", 0.01)
        for index_slat, y in enumerate((-0.38, -0.29, -0.20)):
            box(collection, root, f"Back slat.{index_slat}", (0, y, 1.12), (0.63, 0.055, 0.09), "wood", 0.01)
        box(collection, root, "Seat frame", (0, 0.13, 0.50), (0.68, 0.62, 0.12), "wood", 0.025)
        box(collection, root, "Seat cushion", (0, 0.13, 0.57), (0.55, 0.47, 0.035), "linen", 0.035)
        for x in (-0.34, 0.34):
            box(collection, root, f"Front leg.{x}", (x, 0.40, 0.25), (0.085, 0.09, 0.50), "wood", 0.012)
            box(collection, root, f"Foot tip.{x}", (x, 0.40, 0.015), (0.12, 0.14, 0.03), "shade", 0.01)
    elif "locker" in asset_id:
        # A locker is a box from above and there is no honest way round that.
        # What the top can carry is a rim and the seam between two doors, which
        # is enough to tell it from a cabinet.
        box(collection, root, "Locker", (0, 0, 1.0), (0.8, 0.55, 2.0), "steel")
        box(collection, root, "Top rim", (0, 0, 2.02), (0.86, 0.6, 0.04), "concrete", 0.01)
        box(collection, root, "Top seam", (0, 0, 2.045), (0.02, 0.56, 0.02), "shade", 0)
        box(collection, root, "Door seam", (0, -0.281, 1.0), (0.03, 0.01, 1.75), "shade", 0)
        box(collection, root, "Handle", (0.22, -0.3, 1.15), (0.05, 0.06, 0.22), "concrete", 0.02)
    elif "table_stool" in asset_id:
        box(collection, root, "Table edge", (0, 0, 0.7), (1.44, 0.78, 0.06), "shade", 0.01)
        box(collection, root, "Table", (0, 0, 0.76), (1.36, 0.7, 0.1), "concrete", 0.04)
        cylinder(collection, root, "Table leg", (0, 0, 0.34), 0.09, 0.68, "steel")
        for x in (-0.76, 0.76):
            cylinder(collection, root, f"Stool.{x}", (x, 0, 0.5), 0.22, 0.1, "wood")
            cylinder(collection, root, f"Stool base.{x}", (x, 0, 0.23), 0.06, 0.44, "steel")
    elif "bench" in asset_id:
        # Three slats with gaps: the gaps are the only thing that reads from
        # above, and one plank read as a shelf.
        for index, y in enumerate((-0.15, 0.0, 0.15)):
            box(collection, root, f"Slat.{index}", (0, y, 0.54), (1.76, 0.12, 0.06), "wood", 0.02)
        for x in (-0.7, 0.7):
            box(collection, root, f"Leg.{x}", (x, 0, 0.26), (0.08, 0.44, 0.52), "steel", 0.02)
    elif "desk" in asset_id or "reception" in asset_id:
        length = 2.7 if "reception" in asset_id else 1.7
        box(collection, root, "Counter", (0, 0, 0.92), (length, 0.72, 0.1), "wood", 0.03)
        box(collection, root, "Cabinet", (0, 0.2, 0.42), (length * 0.9, 0.46, 0.82), "steel")
        if "reception" in asset_id:
            # A transaction ledge one step above the worktop: from above it is
            # the band that tells a counter from a desk.
            box(collection, root, "Ledge", (0, -0.28, 1.06), (length, 0.22, 0.12), "concrete", 0.03)
        else:
            box(collection, root, "Blotter", (-0.16, -0.04, 0.976), (0.86, 0.46, 0.012), "shade", 0)
            box(collection, root, "Tray", (0.58, -0.06, 1.0), (0.4, 0.3, 0.06), "steel", 0.02)
    else:
        box(collection, root, "Chair seat", (0, 0, 0.46), (0.5, 0.46, 0.08), "blue", 0.04)
        box(collection, root, "Back gap", (0, 0.185, 0.51), (0.54, 0.04, 0.06), "shade", 0)
        box(collection, root, "Chair back", (0, 0.235, 0.72), (0.54, 0.07, 0.44), "blue", 0.04)
        for x in (-0.2, 0.2):
            for y in (-0.2, 0.2):
                cylinder(collection, root, f"Chair leg.{x}.{y}", (x, y, 0.21), 0.025, 0.42, "steel", 8)


def security(collection, root, asset_id):
    if "camera" in asset_id:
        box(collection, root, "Camera body", (0, 0, 1.1), (0.58, 0.34, 0.26), "concrete", 0.04)
        cylinder(collection, root, "Lens", (0.3, -0.02, 1.1), 0.11, 0.08, "shade")
        box(collection, root, "Mount", (-0.2, 0, 0.75), (0.12, 0.12, 0.65), "steel")
    elif "reader" in asset_id:
        box(collection, root, "Reader", (0, 0, 0.55), (0.32, 0.1, 0.62), "steel", 0.02)
        box(collection, root, "Panel", (0, -0.055, 0.6), (0.24, 0.02, 0.4), "shade", 0)
        box(collection, root, "Status", (0, -0.065, 0.78), (0.16, 0.02, 0.05), "green", 0.01)
    elif "turnstile" in asset_id:
        cylinder(collection, root, "Hub", (0, 0, 0.65), 0.16, 1.3, "steel")
        cylinder(collection, root, "Hub cap", (0, 0, 1.32), 0.18, 0.04, "shade")
        for angle in (0, 2.09, 4.18):
            arm = box(collection, root, "Turnstile arm", (0.45 * __import__('math').cos(angle), 0.45 * __import__('math').sin(angle), 0.72), (0.9, 0.08, 0.08), "steel", 0.02)
            arm.rotation_euler.z = angle
    else:
        box(collection, root, "Checkpoint gate", (0, 0, 1.5), (1.5, 0.25, 3.0), "steel")
        box(collection, root, "Gate cap", (0, 0, 3.03), (1.6, 0.32, 0.06), "concrete", 0.02)
        box(collection, root, "Opening", (0, -0.14, 1.4), (0.78, 0.04, 2.4), "shade", 0)


def perimeter(collection, root, asset_id):
    if "fence" in asset_id:
        for x in (-1.3, 0, 1.3):
            cylinder(collection, root, f"Post.{x}", (x, 0, 1.15), 0.05, 2.3, "steel")
            cylinder(collection, root, f"Post cap.{x}", (x, 0, 2.33), 0.06, 0.05, "shade")
        for z in (0.55, 1.1, 1.65):
            box(collection, root, f"Rail.{z}", (0, 0, z), (2.8, 0.05, 0.05), "steel", 0.01)
    elif "gate" in asset_id:
        box(collection, root, "Gate", (0, 0, 1.15), (3.5, 0.1, 2.3), "steel")
        box(collection, root, "Gate rail", (0, 0, 2.33), (3.5, 0.14, 0.08), "concrete", 0.02)
        for x in (-1.7, 1.7):
            cylinder(collection, root, f"Post.{x}", (x, 0, 1.35), 0.12, 2.7, "concrete")
            cylinder(collection, root, f"Post cap.{x}", (x, 0, 2.73), 0.14, 0.06, "shade")
    elif "watchtower" in asset_id:
        box(collection, root, "Tower", (0, 0, 2.0), (1.5, 1.5, 4.0), "concrete")
        box(collection, root, "Cabin", (0, 0, 4.3), (2.1, 2.1, 1.1), "blue")
        box(collection, root, "Roof", (0, 0, 5.0), (2.35, 2.35, 0.18), "steel")
        box(collection, root, "Roof hatch", (0, 0, 5.11), (0.9, 0.9, 0.06), "shade", 0.01)
    else:
        cylinder(collection, root, "Pole", (0, 0, 2.4), 0.08, 4.8, "steel")
        box(collection, root, "Lamp housing", (0, 0, 4.6), (0.7, 0.5, 0.16), "concrete", 0.04)
        box(collection, root, "Lamp", (0, 0, 4.72), (0.58, 0.4, 0.08), "light", 0.02)


def architectural(collection, root, asset_id):
    if asset_id.startswith("floor"):
        # A 2x2 module with the joint between its four tiles cut into the top,
        # so a floor reads as a floor rather than as one flat colour.
        box(collection, root, "Tile", (0, 0, 0.06), (2, 2, 0.12), "concrete" if "concrete" in asset_id else "green", 0)
        box(collection, root, "Joint north-south", (0, 0, 0.121), (0.035, 2, 0.004), "shade", 0)
        box(collection, root, "Joint east-west", (0, 0, 0.121), (2, 0.035, 0.004), "shade", 0)
    elif asset_id.startswith("wall"):
        box(collection, root, "Wall module", (0, 0, 1.25), (2, 0.22, 2.5), "concrete")
        box(collection, root, "Coping", (0, 0, 2.53), (2, 0.26, 0.07), "steel", 0.02)
        box(collection, root, "Panel joint", (0, 0, 1.31), (0.04, 0.24, 2.62), "shade", 0)
        box(collection, root, "Base stripe", (0, -0.12, 0.42), (2, 0.03, 0.45), "green", 0)
    elif asset_id.startswith("door"):
        box(collection, root, "Frame", (0, 0, 1.3), (1.15, 0.28, 2.6), "concrete")
        box(collection, root, "Frame head", (0, 0, 2.62), (1.21, 0.32, 0.06), "steel", 0.02)
        box(collection, root, "Door", (0, -0.2, 1.25), (0.82, 0.09, 2.25), "blue" if "security" in asset_id else "wood")
        box(collection, root, "Reveal", (0, -0.152, 1.25), (0.88, 0.012, 2.31), "shade", 0)
        box(collection, root, "Window", (0, -0.246, 1.6), (0.25, 0.02, 0.42), "steel", 0)
    elif asset_id == "fixture.cell.sink":
        # A separate hand-washing fixture. Its broad oval basin, dark well and
        # paired taps remain distinct at the 64 px world scale; unlike the
        # combined toilet sheet, the model fits its own 1x1 footprint.
        box(collection, root, "Wall rail", (0, -0.35, 0.57), (0.72, 0.13, 0.16), "steel", 0.025)
        box(collection, root, "Basin body", (0, 0.02, 0.48), (0.76, 0.64, 0.22), "porcelain", 0.12)
        box(collection, root, "Basin well", (0, 0.04, 0.603), (0.55, 0.40, 0.018), "shade", 0.12)
        box(collection, root, "Inner porcelain", (0, 0.04, 0.616), (0.43, 0.28, 0.012), "porcelain", 0.12)
        cylinder(collection, root, "Drain", (0, 0.06, 0.63), 0.055, 0.014, "steel", 24)
        for x in (-0.21, 0.21):
            cylinder(collection, root, f"Tap base.{x}", (x, -0.28, 0.64), 0.06, 0.065, "steel", 16)
            box(collection, root, f"Tap lever.{x}", (x, -0.285, 0.69), (0.15, 0.035, 0.035), "steel", 0.012)
        box(collection, root, "Spout", (0, -0.20, 0.69), (0.07, 0.22, 0.07), "steel", 0.025)
    elif asset_id == "fixture.shower.head":
        # The shower is wall-mounted. The broad perforated head and two valves
        # read from above without painting a false floor into this sprite.
        box(collection, root, "Wall bracket", (0, -0.38, 0.88), (0.62, 0.12, 0.16), "steel", 0.025)
        box(collection, root, "Supply arm", (0, -0.21, 0.93), (0.10, 0.30, 0.10), "steel", 0.025)
        cylinder(collection, root, "Shower head", (0, 0.04, 0.89), 0.25, 0.11, "steel", 32)
        cylinder(collection, root, "Face", (0, 0.04, 0.956), 0.21, 0.018, "porcelain", 32)
        for x in (-0.11, 0, 0.11):
            for y in (-0.07, 0.04, 0.15):
                cylinder(collection, root, f"Nozzle.{x}.{y}", (x, y, 0.971), 0.017, 0.012, "shade", 8)
        for x in (-0.23, 0.23):
            cylinder(collection, root, f"Valve.{x}", (x, -0.37, 0.96), 0.065, 0.05, "steel", 16)
            box(collection, root, f"Valve grip.{x}", (x, -0.37, 1.0), (0.15, 0.035, 0.035), "porcelain", 0.01)
    elif asset_id == "fixture.cell.waste_bin":
        # Open top and pale inner liner distinguish this from a locker or a
        # solid storage crate at the in-game 64 px scale.
        cylinder(collection, root, "Outer bin", (0, 0, 0.31), 0.34, 0.62, "steel", 32)
        cylinder(collection, root, "Rim", (0, 0, 0.635), 0.37, 0.055, "light", 32)
        cylinder(collection, root, "Opening", (0, 0, 0.669), 0.28, 0.02, "shade", 32)
        cylinder(collection, root, "Liner", (0, 0, 0.679), 0.19, 0.01, "linen", 32)
        box(collection, root, "Foot pedal", (0, -0.36, 0.08), (0.22, 0.15, 0.07), "steel", 0.02)
    elif "toilet" in asset_id:
        # The one model whose shipped sheet cannot be used at all: the owner's
        # sheet holds a 1:2.5 combined column and the catalogue declares (1, 1).
        # Built to be read from directly above -- a rectangular cistern with a
        # basin sunk into it at the north, a seat with a dark opening at the
        # south, and the two joined by a visible spine.
        box(collection, root, "Cistern", (0, -0.33, 0.31), (0.62, 0.28, 0.62), "porcelain", 0.04)
        cylinder(collection, root, "Basin", (0, -0.33, 0.6), 0.19, 0.06, "porcelain")
        cylinder(collection, root, "Basin well", (0, -0.33, 0.625), 0.13, 0.03, "steel")
        cylinder(collection, root, "Drain", (0, -0.33, 0.641), 0.045, 0.02, "shade", 8)
        box(collection, root, "Tap", (0, -0.45, 0.68), (0.07, 0.1, 0.1), "steel", 0.02)
        box(collection, root, "Spine", (0, -0.11, 0.46), (0.12, 0.2, 0.12), "porcelain", 0.03)
        cylinder(collection, root, "Bowl", (0, 0.12, 0.21), 0.25, 0.42, "porcelain")
        cylinder(collection, root, "Seat", (0, 0.12, 0.445), 0.27, 0.05, "light")
        cylinder(collection, root, "Opening", (0, 0.12, 0.462), 0.155, 0.06, "shade")
    else:
        box(collection, root, "Housing", (0, 0.02, 1.7), (1.4, 0.5, 0.24), "steel")
        box(collection, root, "Ceiling panel", (0, 0, 1.87), (1.2, 0.45, 0.18), "light", 0.01)
        box(collection, root, "Diffuser joint", (0, 0, 1.963), (1.2, 0.03, 0.008), "shade", 0)


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
        box(collection, root, "Container", (0, 0, 0.9), (1.86, 0.92, 1.72), "green")
        box(collection, root, "Container doors", (0, -0.46, 0.9), (1.55, 0.03, 1.5), "steel", 0)
        # Roof ribs. The corrugation on a container's sides is invisible from
        # above; the ribs across its roof are the only part of it that is not.
        for index_rib, y in enumerate((-0.3, -0.15, 0.0, 0.15, 0.3)):
            box(collection, root, f"Roof rib.{index_rib}", (0, y, 1.775), (1.86, 0.05, 0.05), "shade", 0.01)
    else:
        architectural(collection, root, asset_id)


def main():
    pipeline_common.require_blender_version()
    pipeline_common.apply_deterministic_render_settings(bpy.context.scene)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        if collection.name == "Collection": bpy.data.collections.remove(collection)
    for name, (color, roughness) in PALETTE.items(): MATERIALS[name] = material(name, color, roughness)
    for index, (asset_id, footprint) in enumerate(MODELS): create_model(asset_id, footprint, index)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))


if __name__ == "__main__": main()
