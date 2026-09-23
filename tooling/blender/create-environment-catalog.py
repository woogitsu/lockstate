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
    "galvanized": ((0.53, 0.57, 0.57, 1), 0.59),
    "galvanized_edge": ((0.72, 0.74, 0.72, 1), 0.47),
    "metal_recess": ((0.075, 0.085, 0.085, 1), 0.82),
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
    ("furniture.dining.table.wooden", (3, 2)),
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


def galvanized_material():
    """Subtle mottling keeps the fixture readable as aged zinc at game scale."""
    item = material("Worn galvanized fixture metal", (0.53, 0.57, 0.57, 1), 0.59)
    nodes = item.node_tree.nodes
    links = item.node_tree.links
    coords = nodes.new("ShaderNodeTexCoord")
    noise = nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = 18
    noise.inputs["Detail"].default_value = 3
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.30, 0.33, 0.33, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.68, 0.70, 0.68, 1)
    links.new(coords.outputs["Generated"], noise.inputs["Vector"])
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
    return item


def canteen_wood_material():
    """Pack the approved concept-derived tabletop texture into the .blend."""
    texture_path = ROOT / "assets/source/textures/dining-table-wood-v1.png"
    if not texture_path.is_file():
        raise FileNotFoundError(f"Canteen wood texture is missing: {texture_path}")
    image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.pack()
    item = material("Canteen textured tabletop", (0.45, 0.27, 0.12, 1), 0.78)
    nodes = item.node_tree.nodes
    links = item.node_tree.links
    shader = nodes.get("Principled BSDF")
    coords = nodes.new("ShaderNodeTexCoord")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.extension = "CLIP"
    links.new(coords.outputs["Generated"], texture.inputs["Vector"])
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    return item


def canteen_steel_material():
    texture_path = ROOT / "assets/source/textures/dining-table-steel-v1.png"
    if not texture_path.is_file():
        raise FileNotFoundError(f"Canteen steel texture is missing: {texture_path}")
    image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.pack()
    item = material("Canteen worn steel", (0.24, 0.26, 0.27, 1), 0.64)
    nodes = item.node_tree.nodes
    coords = nodes.new("ShaderNodeTexCoord")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.extension = "CLIP"
    item.node_tree.links.new(coords.outputs["Generated"], texture.inputs["Vector"])
    shader = nodes.get("Principled BSDF")
    item.node_tree.links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    shader.inputs["Metallic"].default_value = 0.38
    return item


def chair_seat_material():
    texture_path = ROOT / "assets/source/textures/wooden-chair-seat-v1.png"
    if not texture_path.is_file():
        raise FileNotFoundError(f"Wooden chair seat texture is missing: {texture_path}")
    image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.pack()
    item = material("Worn chair seat planks", (0.47, 0.27, 0.10, 1), 0.80)
    nodes = item.node_tree.nodes
    coords = nodes.new("ShaderNodeTexCoord")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.extension = "CLIP"
    item.node_tree.links.new(coords.outputs["Generated"], texture.inputs["Vector"])
    item.node_tree.links.new(texture.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
    return item


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


def torus(collection, root, name, offset, major_radius, minor_radius, surface):
    bpy.ops.mesh.primitive_torus_add(
        major_segments=48, minor_segments=8,
        location=(root.location.x + offset[0], root.location.y + offset[1], offset[2]),
        major_radius=major_radius, minor_radius=minor_radius,
    )
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
        # The multiview concept in assets/source/concepts/ shows open shelf
        # gaps, worn timber and bolted steel corners. From above the shelf
        # boards, different stored goods and dark gaps must stay separate at
        # the game's 1x1-tile size; a closed panel would repeat the old locker
        # failure that sent this object back to a colour slab.
        for x in (-0.43, 0.43):
            for y in (-0.39, 0.39):
                box(collection, root, f"Corner post.{x}.{y}", (x, y, 0.68), (0.08, 0.08, 1.36), "canteen_wood", 0.012)
                box(collection, root, f"Steel corner cap.{x}.{y}", (x, y, 1.36), (0.13, 0.13, 0.07), "canteen_steel", 0.012)
                cylinder(collection, root, f"Corner bolt.{x}.{y}", (x, y, 1.402), 0.018, 0.012, "light", 12)
        box(collection, root, "Rear brace", (0, 0.43, 0.96), (0.83, 0.045, 0.16), "canteen_steel", 0.008)
        # The shelves descend towards the viewer. A straight-down camera can
        # then see all three, while an oblique view still shows plausible
        # distinct tiers instead of three boards floating at one height.
        for index_shelf, (y, height) in enumerate(((-0.29, 1.17), (0, 0.83), (0.29, 0.49))):
            box(collection, root, f"Worn shelf.{index_shelf}", (0, y, height), (0.81, 0.24, 0.085), "canteen_wood", 0.012)
            box(collection, root, f"Shelf lip.{index_shelf}", (0, y + 0.13, height - 0.02), (0.81, 0.025, 0.05), "canteen_steel", 0.006)
        # Unequal crates and folded bundles, with visible openings and bands.
        box(collection, root, "North wooden crate", (-0.19, -0.29, 1.29), (0.27, 0.12, 0.16), "canteen_wood", 0.009)
        box(collection, root, "North crate handle", (-0.19, -0.29, 1.377), (0.10, 0.025, 0.006), "shade", 0)
        for index_fold, y in enumerate((-0.315, -0.265)):
            box(collection, root, f"North folded blanket.{index_fold}", (0.19, y, 1.27 + index_fold * 0.035), (0.25, 0.07, 0.06), "green", 0.013)
        box(collection, root, "North bundle strap", (0.19, -0.29, 1.352), (0.045, 0.14, 0.015), "canteen_steel", 0.003)
        box(collection, root, "Middle steel toolbox", (-0.15, 0, 0.96), (0.29, 0.13, 0.17), "canteen_steel", 0.010)
        box(collection, root, "Toolbox clasp", (-0.15, 0, 1.052), (0.05, 0.03, 0.010), "light", 0.003)
        box(collection, root, "Middle carton", (0.20, 0, 0.94), (0.23, 0.12, 0.13), "linen", 0.008)
        box(collection, root, "South carton", (-0.19, 0.29, 0.59), (0.25, 0.12, 0.13), "linen", 0.008)
        for index_fold, y in enumerate((0.265, 0.315)):
            box(collection, root, f"South folded bundle.{index_fold}", (0.18, y, 0.58 + index_fold * 0.035), (0.26, 0.07, 0.055), "light", 0.012)
        box(collection, root, "South bundle strap", (0.18, 0.29, 0.66), (0.045, 0.15, 0.014), "canteen_steel", 0.003)
    elif asset_id == "furniture.chair.wooden":
        # The four-view concept supplies worn timber seat boards, two open
        # back slats and a steel frame. The silhouette is still assembled for
        # a 1x1 tile: back, seat and front feet must be distinct at 64 px.
        for x in (-0.30, 0.30):
            box(collection, root, f"Steel back post.{x}", (x, -0.34, 0.63), (0.08, 0.09, 1.26), "canteen_steel", 0.012)
            box(collection, root, f"Back foot.{x}", (x, -0.34, 0.02), (0.13, 0.14, 0.04), "steel", 0.009)
        for index_slat, y in enumerate((-0.38, -0.25)):
            box(collection, root, f"Worn back slat.{index_slat}", (0, y, 1.13), (0.67, 0.065, 0.10), "canteen_wood", 0.015)
        box(collection, root, "Seat steel frame", (0, 0.12, 0.50), (0.72, 0.66, 0.12), "canteen_steel", 0.028)
        box(collection, root, "Wooden seat", (0, 0.12, 0.58), (0.63, 0.56, 0.055), "chair_wood", 0.035)
        for x in (-0.34, 0.34):
            box(collection, root, f"Steel front leg.{x}", (x, 0.40, 0.25), (0.09, 0.10, 0.50), "canteen_steel", 0.012)
            box(collection, root, f"Front foot.{x}", (x, 0.40, 0.02), (0.13, 0.14, 0.04), "steel", 0.009)
        for x in (-0.26, 0.26):
            for y in (-0.08, 0.32):
                cylinder(collection, root, f"Seat bolt.{x}.{y}", (x, y, 0.615), 0.018, 0.010, "canteen_steel", 12)
    elif asset_id == "furniture.dining.table.wooden":
        # Modelled from assets/source/concepts/dining-table-multiview-v2.png:
        # a continuous worn timber top, bolted steel rim and three fixed
        # stools on one side. The stool count matches the simulation's three
        # dining places. The orthographic game view must show the separation
        # between the tabletop and the seats even at 192x128 pixels.
        box(collection, root, "Table underframe", (0, -0.27, 0.65), (2.70, 1.04, 0.15), "canteen_steel", 0.025)
        for x in (-1.13, 1.13):
            box(collection, root, f"Trestle.{x}", (x, -0.27, 0.34), (0.16, 0.92, 0.68), "canteen_steel", 0.015)
            box(collection, root, f"Floor plate.{x}", (x, -0.27, 0.04), (0.34, 0.98, 0.08), "steel", 0.012)
        box(collection, root, "Stool support rail", (0, 0.50, 0.38), (2.58, 0.10, 0.14), "canteen_steel", 0.015)
        box(collection, root, "Bolted metal tabletop rim", (0, -0.27, 0.76), (2.84, 1.18, 0.12), "canteen_steel", 0.045)
        box(collection, root, "Worn wooden tabletop", (0, -0.27, 0.83), (2.72, 1.06, 0.055), "canteen_wood", 0.035)
        for index_bolt, x in enumerate((-1.29, 1.29)):
            cylinder(collection, root, f"Rim bolt.{index_bolt}", (x, 0.27, 0.834), 0.024, 0.014, "light", 12)
        for index, x in enumerate((-0.88, 0, 0.88)):
            cylinder(collection, root, f"Stool floor mount.{index}", (x, 0.69, 0.045), 0.14, 0.08, "steel", 16)
            cylinder(collection, root, f"Stool post.{index}", (x, 0.69, 0.30), 0.070, 0.53, "canteen_steel", 16)
            cylinder(collection, root, f"Stool dark rim.{index}", (x, 0.69, 0.59), 0.27, 0.12, "steel", 32)
            cylinder(collection, root, f"Stool brushed seat.{index}", (x, 0.69, 0.655), 0.235, 0.022, "canteen_steel", 32)
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
        # Four-view reference: assets/source/concepts/shower-head-multiview-v2.png.
        # The fixed wall plate, elbow and perforated disc have separate depths,
        # so the silhouette remains clear when projected onto one 64 px tile.
        box(collection, root, "Mounting plate", (0, -0.39, 0.85), (0.50, 0.16, 0.22), "galvanized", 0.035)
        box(collection, root, "Plate inset", (0, -0.39, 0.976), (0.38, 0.12, 0.015), "galvanized_edge", 0.018)
        for x in (-0.19, 0.19):
            cylinder(collection, root, f"Mount bolt.{x}", (x, -0.39, 0.991), 0.025, 0.014, "steel", 12)
        cylinder(collection, root, "Pipe socket", (0, -0.30, 0.95), 0.09, 0.10, "galvanized_edge", 24)
        box(collection, root, "Exposed pipe", (0, -0.15, 0.94), (0.11, 0.40, 0.11), "galvanized", 0.05)
        cylinder(collection, root, "Elbow collar", (0, 0.05, 0.94), 0.105, 0.13, "galvanized_edge", 24)
        cylinder(collection, root, "Shower head body", (0, 0.13, 0.82), 0.29, 0.18, "galvanized", 48)
        torus(collection, root, "Rolled shower rim", (0, 0.13, 0.91), 0.25, 0.035, "galvanized_edge")
        cylinder(collection, root, "Recessed perforated face", (0, 0.13, 0.914), 0.23, 0.02, "metal_recess", 48)
        for x, y in ((0, 0.13), (-0.10, 0.13), (0.10, 0.13),
                     (-0.05, 0.045), (0.05, 0.045), (-0.05, 0.215), (0.05, 0.215),
                     (-0.16, 0.09), (0.16, 0.09), (-0.16, 0.18), (0.16, 0.18)):
            cylinder(collection, root, f"Jet nozzle.{x}.{y}", (x, y, 0.931), 0.018, 0.014, "galvanized_edge", 12)
    elif asset_id == "fixture.cell.waste_bin":
        # Four-view reference: assets/source/concepts/waste-bin-multiview-v2.png.
        # A dark opening, raised lid at the back and pedal at the front make
        # the galvanized bin identifiable from the game's overhead view.
        cylinder(collection, root, "Pedal-bin body", (0, 0.04, 0.34), 0.32, 0.68, "galvanized", 48)
        cylinder(collection, root, "Lower reinforcing band", (0, 0.04, 0.12), 0.335, 0.045, "steel", 48)
        cylinder(collection, root, "Dark bin cavity", (0, 0.04, 0.689), 0.27, 0.02, "metal_recess", 48)
        torus(collection, root, "Rolled bright rim", (0, 0.04, 0.69), 0.29, 0.038, "galvanized_edge")
        cylinder(collection, root, "Recessed inner bottom", (0, 0.04, 0.694), 0.13, 0.008, "shade", 32)
        box(collection, root, "Rear hinge", (0, -0.315, 0.73), (0.29, 0.07, 0.10), "steel", 0.018)
        cylinder(collection, root, "Lid shell", (0, -0.45, 0.79), 0.25, 0.045, "galvanized", 48)
        torus(collection, root, "Lid rolled edge", (0, -0.45, 0.817), 0.22, 0.028, "galvanized_edge")
        cylinder(collection, root, "Lid inset", (0, -0.45, 0.821), 0.17, 0.008, "metal_recess", 32)
        box(collection, root, "Pedal stem", (0, 0.36, 0.05), (0.10, 0.16, 0.055), "steel", 0.013)
        box(collection, root, "Foot pedal", (0, 0.44, 0.072), (0.23, 0.12, 0.045), "galvanized_edge", 0.022)
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
    MATERIALS["galvanized"] = galvanized_material()
    MATERIALS["canteen_wood"] = canteen_wood_material()
    MATERIALS["canteen_steel"] = canteen_steel_material()
    MATERIALS["chair_wood"] = chair_seat_material()
    for index, (asset_id, footprint) in enumerate(MODELS): create_model(asset_id, footprint, index)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))


if __name__ == "__main__": main()
