"""Create a procedural Lockstate actor source scene and walk cycle.

Determinism-critical behaviour lives in `pipeline_common`; see that module for
what issue #64 measured and why each control exists.
"""
import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common  # noqa: E402  (Blender does not add the script directory to sys.path)

ACTOR_IDS = (
    "actor.prisoner.base",
    "actor.guard.base",
    "actor.guard.response",
    "actor.guard.search",
    "actor.prisoner.riot",
    "actor.prisoner.assault",
    "actor.medic.base",
    "actor.cook.base",
    "actor.staff.base",
)


def arguments():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", choices=sorted(ACTOR_IDS), required=True)
    # The output path used to be hard-coded relative to this file, which forced
    # anything wanting a scratch build -- the determinism runner in particular --
    # to clone the whole tooling tree at the same directory depth.
    parser.add_argument("--output", type=Path, default=None, help="destination .blend (default: assets/source/blender/<asset-id>.blend)")
    return parser.parse_args(sys.argv[separator + 1:])


def mat(name, color, roughness=0.6):
    material = bpy.data.materials.new(name)
    material.diffuse_color = (*color, 1.0)
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = (*color, 1.0)
        principled.inputs["Roughness"].default_value = roughness
    material.roughness = roughness
    return material


def actor_fabric(texture_name, material_name, color):
    """Pack the role-specific worn cotton swatch for reproducible rendering."""
    texture_path = Path(__file__).resolve().parents[2] / "assets/source/textures" / texture_name
    if not texture_path.is_file():
        raise FileNotFoundError(texture_path)
    image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.pack()
    fabric = mat(material_name, color, 0.85)
    nodes = fabric.node_tree.nodes
    coords = nodes.new("ShaderNodeTexCoord")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.extension = "REPEAT"
    fabric.node_tree.links.new(coords.outputs["Generated"], texture.inputs["Vector"])
    fabric.node_tree.links.new(texture.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])
    return fabric


def cube(name, location, scale, material, parent, bevel=0.06):
    bpy.ops.mesh.primitive_cube_add(location=location)
    item = bpy.context.object
    item.name, item.scale = name, scale
    item.parent = parent
    if parent is not None:
        item.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = item.modifiers.new("Soft edges", "BEVEL")
    modifier.width, modifier.segments = bevel, 3
    item.data.materials.append(material)
    return item


def sphere(name, location, scale, material, parent):
    """Add a sphere whose face and loop order is identical on every run.

    This used `bpy.ops.mesh.primitive_uv_sphere_add`, which re-orders faces and
    loops on each call and was the single cause of run-to-run pixel drift in the
    walk atlas (issue #64). `pipeline_common.uv_sphere_mesh` produces the same
    vertex positions in a fixed order.
    """
    item = pipeline_common.add_mesh_object(name, pipeline_common.uv_sphere_mesh(name, segments=24, ring_count=12), location)
    item.scale = scale
    item.parent = parent
    if parent is not None:
        item.matrix_parent_inverse = parent.matrix_world.inverted()
    item.data.materials.append(material)
    return item


def limb(name, location, radius, length, material, parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=radius, depth=length, location=location)
    item = bpy.context.object
    item.name, item.parent = name, parent
    if parent is not None:
        item.matrix_parent_inverse = parent.matrix_world.inverted()
    item.data.materials.append(material)
    return item


def cylinder(name, location, radius, length, material, parent):
    bpy.ops.mesh.primitive_cylinder_add(vertices=24, radius=radius, depth=length, location=location)
    item = bpy.context.object
    item.name, item.parent = name, parent
    if parent is not None:
        item.matrix_parent_inverse = parent.matrix_world.inverted()
    item.data.materials.append(material)
    return item


def apron_panel(parent, material):
    """A shallow flared cloth panel with a curved fold instead of a box slab."""
    mesh = bpy.data.meshes.new("Cook apron cloth mesh")
    # Three front rows bow forward at the centre, and a thin rear shell gives
    # the cloth a readable edge from the game's high oblique actor camera.
    rows = (
        ((-0.30, -0.34, 1.68), (0.0, -0.375, 1.68), (0.30, -0.34, 1.68)),
        ((-0.35, -0.37, 1.22), (0.0, -0.415, 1.20), (0.35, -0.37, 1.22)),
        ((-0.39, -0.31, 0.78), (0.0, -0.37, 0.75), (0.39, -0.31, 0.78)),
    )
    front = [vertex for row in rows for vertex in row]
    rear = [(x, y + 0.027, z) for x, y, z in front]
    vertices = front + rear
    faces = []
    for base in (0, 9):
        for row in range(2):
            for column in range(2):
                index = base + row * 3 + column
                faces.append((index, index + 1, index + 4, index + 3))
    for column in range(2):
        faces.append((column, column + 1, 10 + column, 9 + column))
        bottom = 6 + column
        faces.append((bottom, bottom + 1, 16 + column, 15 + column))
    for row in range(2):
        left, right = row * 3, row * 3 + 2
        faces.append((left, left + 3, left + 12, left + 9))
        faces.append((right, right + 3, right + 12, right + 9))
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    item = bpy.data.objects.new("Flared apron cloth", mesh)
    bpy.context.collection.objects.link(item)
    item.parent = parent
    item.matrix_parent_inverse = parent.matrix_world.inverted()
    item.data.materials.append(material)
    return item


def pivot(name, location, parent):
    bpy.ops.object.empty_add(type="PLAIN_AXES", location=location)
    item = bpy.context.object
    item.name, item.parent = name, parent
    if parent is not None:
        item.matrix_parent_inverse = parent.matrix_world.inverted()
    return item


def animate(item, phase):
    for frame, degrees in ((1, 0), (2, 24), (3, 36), (4, 22), (5, 0), (6, -22), (7, -36), (8, -24), (9, 0)):
        item.rotation_euler.x = math.radians(degrees * phase)
        item.keyframe_insert(data_path="rotation_euler", index=0, frame=frame)


def animate_response_arm(item):
    """A restrained radio acknowledgement, readable without implying combat."""
    for frame, degrees in ((1, -130), (2, -134), (3, -138), (4, -142),
                           (5, -140), (6, -136), (7, -132), (8, -128), (9, -130)):
        item.rotation_euler.y = math.radians(degrees)
        item.keyframe_insert(data_path="rotation_euler", index=1, frame=frame)


def animate_search_arm(item, phase):
    """A small downward inspection sweep, readable from the overhead camera."""
    for frame, degrees in ((1, -28), (2, -43), (3, -56), (4, -38), (5, -28)):
        item.rotation_euler.x = math.radians(degrees * phase)
        item.keyframe_insert(data_path="rotation_euler", index=0, frame=frame)


def animate_riot_arm(item, side):
    """Alternating raised arms show unrest without implying an actual strike."""
    poses = (-165, -175, -90, -20, -165) if side == -1 else (10, 90, 175, 165, 10)
    for frame, degrees in enumerate(poses, start=1):
        item.rotation_euler.y = math.radians(degrees)
        item.keyframe_insert(data_path="rotation_euler", index=1, frame=frame)


def animate_assault_arm(item, side):
    """Alternating forward reach, with no invented weapon or fixed aggressor."""
    poses = (-95, -115, -35, -45, -95) if side == -1 else (-35, -45, -95, -115, -35)
    item.rotation_euler.y = math.radians(-20 * side)
    for frame, degrees in enumerate(poses, start=1):
        item.rotation_euler.x = math.radians(degrees)
        item.keyframe_insert(data_path="rotation_euler", index=0, frame=frame)


def face(object_, target):
    object_.rotation_euler = (target - object_.location).to_track_quat("-Z", "Y").to_euler()


def build_detailed_actor(root, asset_id):
    """Model each eight-view concept without changing the actor rig contract."""
    guard = asset_id in ("actor.guard.base", "actor.guard.response", "actor.guard.search")
    response = asset_id == "actor.guard.response"
    search = asset_id == "actor.guard.search"
    riot = asset_id == "actor.prisoner.riot"
    assault = asset_id == "actor.prisoner.assault"
    medic = asset_id == "actor.medic.base"
    cook = asset_id == "actor.cook.base"
    staff = asset_id == "actor.staff.base"
    if guard:
        fabric = actor_fabric("guard-uniform-navy-v2.png", "Guard worn navy cotton", (0.025, 0.045, 0.085))
        dark_seam = mat("Navy seam shadow", (0.011, 0.018, 0.035), 0.85)
    elif medic:
        fabric = actor_fabric("medic-scrubs-blue-v2.png", "Medic washed blue scrubs", (0.075, 0.23, 0.31))
        dark_seam = mat("Blue scrub seam shadow", (0.028, 0.09, 0.13), 0.85)
    elif cook:
        fabric = actor_fabric("cook-uniform-canvas-v2.png", "Cook washed canvas", (0.69, 0.66, 0.60))
        dark_seam = mat("Cook jacket seams", (0.24, 0.23, 0.21), 0.87)
    elif staff:
        fabric = actor_fabric("staff-workwear-charcoal-v2.png", "Staff charcoal workwear", (0.13, 0.13, 0.13))
        dark_seam = mat("Staff jacket seams", (0.030, 0.030, 0.033), 0.85)
    else:
        fabric = actor_fabric("prisoner-jumpsuit-orange-v2.png", "Prisoner worn orange cotton", (0.64, 0.23, 0.07))
        dark_seam = mat("Orange seam shadow", (0.31, 0.105, 0.028), 0.85)
    skin = mat("Warm skin", (0.39, 0.22, 0.14), 0.76)
    hair = mat("Short dark hair", (0.014, 0.010, 0.009), 0.88)
    shoe = mat("Worn charcoal shoes", (0.018, 0.020, 0.021), 0.85)
    undershirt = mat("Pale undershirt", (0.76, 0.72, 0.65), 0.91)
    button = mat("Dull steel buttons", (0.20, 0.22, 0.22), 0.52)
    badge = mat("Guard badge and patches", (0.49, 0.55, 0.57), 0.46) if guard else None
    belt = mat("Guard duty belt", (0.017, 0.020, 0.023), 0.82) if guard else None
    epaulette = mat("Guard slate epaulettes", (0.24, 0.35, 0.45), 0.85) if guard else None
    medical_white = mat("Medic patch and ID", (0.78, 0.83, 0.82), 0.76) if medic else None
    cap_blue = mat("Medic pale linen cap", (0.87, 0.86, 0.81), 0.86) if medic else None
    medical_red = mat("Medic cap and kit red", (0.70, 0.065, 0.035), 0.69) if medic else None
    medical_bag = mat("Medic charcoal kit casing", (0.055, 0.065, 0.075), 0.82) if medic else None
    apron = mat("Cook ochre canvas apron", (0.58, 0.29, 0.07), 0.88) if cook else None
    cook_teal = mat("Cook cap teal marking", (0.025, 0.22, 0.23), 0.84) if cook else None
    staff_blue = mat("Staff blue role marking", (0.035, 0.20, 0.55), 0.68) if staff else None
    staff_canvas = mat("Staff utility pouch canvas", (0.34, 0.25, 0.17), 0.91) if staff else None

    # Torso, shoulder and hip volumes remain distinct at the sprite's 64 px
    # displayed scale. The old single bevelled cube made every role a crate.
    sphere("Jumpsuit torso", (0, 0.0, 2.13), (0.45, 0.31, 0.61), fabric, root)
    sphere("Jumpsuit hips", (0, 0.015, 1.62), (0.40, 0.29, 0.29), fabric, root)
    sphere("Shirt collar opening", (0, -0.235, 2.66), (0.15, 0.07, 0.085), undershirt, root)
    for side in (-1, 1):
        lapel = cube(f"Folded lapel.{side}", (side * 0.16, -0.300, 2.60), (0.13, 0.033, 0.10), fabric, root, 0.035)
        lapel.rotation_euler.y = math.radians(18 * side)
        cube(f"Chest pocket.{side}", (side * 0.235, -0.315, 2.31), (0.11, 0.018, 0.12), fabric, root, 0.025)
        cube(f"Pocket flap.{side}", (side * 0.235, -0.335, 2.38), (0.115, 0.012, 0.018), dark_seam, root, 0.004)
        cube(f"Back trouser pocket.{side}", (side * 0.21, 0.289, 1.59), (0.13, 0.015, 0.11), fabric, root, 0.018)
        sphere(f"Ear.{side}", (side * 0.285, 0.0, 3.10), (0.07, 0.055, 0.09), skin, root)
    cube("Front placket seam", (0, -0.323, 2.23), (0.018, 0.01, 0.36), dark_seam, root, 0.004)
    for z in (2.50, 2.36, 2.22, 2.08):
        sphere(f"Button.{z}", (0.03, -0.335, z), (0.020, 0.014, 0.020), button, root)
    cube("Waist seam", (0, -0.289, 1.75), (0.35, 0.014, 0.014), dark_seam, root, 0.002)
    if guard:
        # The high-contrast belt and cap are the guard's defining features at
        # 64 px. Radio pouch and keys also break the silhouette in side views.
        cube("Utility belt front", (0, -0.304, 1.72), (0.41, 0.053, 0.065), belt, root, 0.018)
        cube("Belt buckle", (0, -0.34, 1.73), (0.075, 0.012, 0.055), badge, root, 0.008)
        for side in (-1, 1):
            cube(f"Duty belt side.{side}", (side * 0.38, 0, 1.72), (0.055, 0.27, 0.065), belt, root, 0.012)
            cube(f"Shoulder patch.{side}", (side * 0.38, -0.215, 2.39), (0.075, 0.018, 0.10), badge, root, 0.013)
            # Broad top-facing tabs survive the game's small overhead view;
            # the original sleeve patch was only an elevation detail.
            cube(f"Slate shoulder epaulette.{side}", (side * 0.35, -0.035, 2.635),
                 (0.125, 0.17, 0.021), epaulette, root, 0.012)
            cylinder(f"Epaulette anchor.{side}", (side * 0.35, -0.075, 2.652),
                     0.014, 0.009, belt, root)
            cube(f"Cargo pocket.{side}", (side * 0.387, -0.07, 1.10), (0.022, 0.12, 0.14), fabric, root, 0.012)
        cube("Radio pouch", (-0.395, -0.06, 1.67), (0.075, 0.11, 0.13), belt, root, 0.018)
        cube("Radio antenna", (-0.395, -0.06, 1.795), (0.012, 0.012, 0.13), belt, root, 0.003)
        cylinder("Key ring", (0.36, -0.22, 1.58), 0.035, 0.012, badge, root)
        cube("Chest badge", (0.245, -0.323, 2.47), (0.055, 0.012, 0.07), badge, root, 0.012)
    if medic:
        # A pale cap and white sleeve crosses give the medical role a distinct
        # top-down silhouette while the scrub-pocket and ID read from oblique.
        for side in (-1, 1):
            cube(f"Sleeve cross vertical.{side}", (side * 0.43, -0.23, 2.35), (0.022, 0.012, 0.10), medical_white, root, 0.004)
            cube(f"Sleeve cross horizontal.{side}", (side * 0.43, -0.239, 2.35), (0.09, 0.010, 0.022), medical_white, root, 0.004)
            cube(f"Scrub hip pocket.{side}", (side * 0.245, -0.277, 1.94), (0.13, 0.017, 0.11), fabric, root, 0.014)
        cube("Medical ID clip", (0.19, -0.331, 2.43), (0.025, 0.013, 0.05), button, root, 0.004)
        cube("Medical ID card", (0.19, -0.341, 2.34), (0.055, 0.010, 0.075), medical_white, root, 0.007)
        cube("Scrub hem", (0, -0.287, 1.78), (0.35, 0.015, 0.020), dark_seam, root, 0.003)
        # The small chest crosses disappear from the game's overhead camera.
        # A compact side kit gives the side views the same clear role cue.
        cube("Medical kit case", (0.405, -0.07, 1.78),
             (0.135, 0.22, 0.22), medical_red, root, 0.024)
        cube("Medical kit white cross vertical", (0.477, -0.07, 1.79),
             (0.007, 0.045, 0.125), medical_white, root, 0.002)
        cube("Medical kit white cross horizontal", (0.481, -0.07, 1.79),
             (0.007, 0.125, 0.043), medical_white, root, 0.002)
    if cook:
        # The apron is intentionally one broad, continuous panel. At 64 px it
        # matters more than individual jacket buttons and is visible in motion.
        cube("Apron chest bib", (0, -0.331, 2.30), (0.29, 0.042, 0.38), apron, root, 0.026)
        for side in (-1, 1):
            strap = cube(f"Apron shoulder strap.{side}",
                         (side * 0.19, -0.285, 2.59), (0.055, 0.06, 0.25), apron, root, 0.012)
            strap.rotation_euler.y = math.radians(side * 18)
            cube(f"Apron back strap.{side}",
                 (side * 0.22, 0.279, 2.37), (0.052, 0.029, 0.41), apron, root, 0.012)
        cube("Apron waistband", (0, -0.306, 1.72), (0.40, 0.052, 0.08), apron, root, 0.02)
        apron_panel(root, apron)
        cube("Apron pocket", (0, -0.424, 1.22), (0.19, 0.010, 0.11), apron, root, 0.009)
        for x in (-0.21, 0.21):
            cube(f"Apron fold.{x}", (x, -0.396, 1.16), (0.014, 0.009, 0.30), dark_seam, root, 0.003)
        for side in (-1, 1):
            cube(f"Apron side tie.{side}", (side * 0.375, 0.07, 1.69), (0.055, 0.18, 0.055), apron, root, 0.013)
            cube(f"Double jacket button.{side}", (side * 0.15, -0.34, 2.44), (0.018, 0.012, 0.018), dark_seam, root, 0.005)
            cube(f"Lower jacket button.{side}", (side * 0.15, -0.34, 2.27), (0.018, 0.012, 0.018), dark_seam, root, 0.005)
        cube("Folded kitchen towel", (0.38, -0.16, 1.44), (0.07, 0.025, 0.22), undershirt, root, 0.009)
    if staff:
        # Broad blue shoulder bands survive the downscaled game camera; the
        # ID badge and pockets add depth in side and three-quarter views.
        box_yoke = cube("Blue shoulder yoke", (0, -0.12, 2.63), (0.405, 0.21, 0.045), staff_blue, root, 0.018)
        box_yoke.rotation_euler.x = math.radians(8)
        cube("Blue back yoke", (0, 0.254, 2.58), (0.42, 0.034, 0.14), staff_blue, root, 0.014)
        for side in (-1, 1):
            cube(f"Blue top shoulder panel.{side}",
                 (side * 0.31, 0.025, 2.635), (0.125, 0.26, 0.028), staff_blue, root, 0.016)
        cube("Staff badge clip", (0.22, -0.324, 2.46), (0.020, 0.010, 0.04), button, root, 0.003)
        cube("Staff blue ID", (0.22, -0.339, 2.36), (0.060, 0.012, 0.09), staff_blue, root, 0.006)
        for side in (-1, 1):
            cube(f"Jacket pocket.{side}", (side * 0.27, -0.287, 1.98), (0.12, 0.015, 0.11), fabric, root, 0.016)
        cube("Jacket hem", (0, -0.284, 1.76), (0.35, 0.019, 0.035), dark_seam, root, 0.007)
        cube("Staff canvas tool pouch", (-0.415, -0.04, 1.55),
             (0.08, 0.155, 0.16), staff_canvas, root, 0.018)
        cube("Staff pouch flap", (-0.468, -0.04, 1.65),
             (0.017, 0.16, 0.045), staff_canvas, root, 0.004)
        cube("Staff folded work cloth", (0.405, -0.08, 1.50),
             (0.038, 0.075, 0.20), undershirt, root, 0.008)
    if asset_id in ("actor.prisoner.base", "actor.prisoner.riot", "actor.prisoner.assault"):
        # The existing pocket/button detail disappears at the 64 px game scale.
        # A pale ID patch carries the identity at game scale without changing
        # the shared actor rig or relying on tiny button details.
        cube("Prisoner ID patch", (0.205, -0.345, 2.43),
             (0.115, 0.012, 0.065), undershirt, root, 0.008)

    sphere("Head", (0, 0, 3.08), (0.285, 0.266, 0.315), skin, root)
    sphere("Short textured hair", (0, 0.055, 3.295), (0.292, 0.278, 0.155), hair, root)
    for side in (-1, 1):
        sphere(f"Sideburn.{side}", (side * 0.255, -0.06, 3.205), (0.035, 0.065, 0.075), hair, root)
    sphere("Nose", (0, -0.265, 3.08), (0.060, 0.078, 0.078), skin, root)
    for side in (-1, 1):
        cube(f"Brow.{side}", (side * 0.105, -0.252, 3.19), (0.078, 0.017, 0.020), hair, root, 0.006)
        sphere(f"Eye.{side}", (side * 0.105, -0.260, 3.155), (0.024, 0.015, 0.020), hair, root)
    if guard:
        sphere("Navy cap crown", (0, 0.06, 3.405), (0.325, 0.285, 0.145), fabric, root)
        cylinder("Cap band", (0, 0.035, 3.345), 0.29, 0.055, belt, root)
        cube("Cap visor", (0, -0.295, 3.330), (0.24, 0.12, 0.025), belt, root, 0.025)
        cube("Cap emblem", (0, -0.213, 3.480), (0.045, 0.015, 0.06), badge, root, 0.012)
        # A top-facing shield silhouette reads in every direction, unlike the
        # small frontal emblem. The concept keeps the cap's crown unchanged.
        cap_mark = cube("Silver cap shield", (0, -0.065, 3.555),
                        (0.085, 0.085, 0.013), badge, root, 0.012)
        cap_mark.rotation_euler.z = math.radians(45)
    elif medic:
        cylinder("Medical cap flat crown", (0, 0.045, 3.445), 0.295, 0.105, cap_blue, root)
        box_tie = cube("Medical cap tie", (0, 0.281, 3.29), (0.065, 0.09, 0.025), cap_blue, root, 0.006)
        box_tie.rotation_euler.z = math.radians(8)
        # Large, top-facing mark from the original four-view reference.
        cube("Medical cap red cross vertical", (0, 0.035, 3.504),
             (0.080, 0.245, 0.009), medical_red, root, 0.002)
        cube("Medical cap red cross horizontal", (0, 0.035, 3.506),
             (0.245, 0.080, 0.009), medical_red, root, 0.002)
    elif cook:
        cylinder("Compact chef cap crown", (0, 0.045, 3.431), 0.305, 0.135, fabric, root)
        cylinder("Chef cap folded band", (0, 0.025, 3.355), 0.31, 0.055, apron, root)
        cube("Chef cap top teal stripe", (0, 0.045, 3.499),
             (0.075, 0.37, 0.005), cook_teal, root, 0.003)
        cube("Chef cap top ochre patch", (0, 0.045, 3.503),
             (0.19, 0.16, 0.009), apron, root, 0.012)
    cube("Neck", (0, 0, 2.79), (0.115, 0.112, 0.16), skin, root, 0.05)

    for side in (-1, 1):
        arm = pivot(f"Arm.{side}", (side * 0.445, 0, 2.54), root)
        sphere(f"Sleeve.{side}", (side * 0.445, 0, 2.30), (0.148, 0.16, 0.30), fabric, arm)
        if staff:
            cylinder(f"Blue sleeve band.{side}", (side * 0.445, 0, 2.28), 0.153, 0.08, staff_blue, arm)
        cylinder(f"Sleeve cuff.{side}", (side * 0.445, 0, 2.05), 0.132, 0.045, dark_seam, arm)
        limb(f"Forearm.{side}", (side * 0.445, 0, 1.85), 0.096, 0.35, skin, arm)
        sphere(f"Hand.{side}", (side * 0.445, 0, 1.66), (0.096, 0.090, 0.15), skin, arm)
        if response:
            if side == -1:
                radio = cube("Response radio", (side * 0.445, -0.025, 1.61),
                             (0.105, 0.075, 0.18), dark_seam, arm, 0.018)
                cube("Response radio aerial", (side * 0.445, -0.025, 1.82),
                     (0.018, 0.018, 0.11), dark_seam, arm, 0.004)
                animate_response_arm(arm)
            else:
                arm.rotation_euler.x = math.radians(8)
        elif search:
            if side == -1:
                cube("Search inspection torch", (side * 0.445, -0.025, 1.59),
                     (0.075, 0.075, 0.21), dark_seam, arm, 0.015)
                cube("Search torch lens", (side * 0.445, -0.025, 1.37),
                     (0.07, 0.07, 0.015), badge, arm, 0.006)
            animate_search_arm(arm, 1 if side == -1 else -1)
        elif riot:
            animate_riot_arm(arm, side)
        elif assault:
            animate_assault_arm(arm, side)
        else:
            animate(arm, 1 if side == -1 else -1)

        leg = pivot(f"Leg.{side}", (side * 0.215, 0, 1.50), root)
        sphere(f"Trouser leg.{side}", (side * 0.215, 0, 0.94), (0.185, 0.19, 0.65), fabric, leg)
        cylinder(f"Rolled hem.{side}", (side * 0.215, 0, 0.38), 0.174, 0.09, fabric, leg)
        cube(f"Trouser seam.{side}", (side * 0.215, -0.19, 0.95), (0.014, 0.01, 0.48), dark_seam, leg, 0.002)
        sphere(f"Work shoe upper.{side}", (side * 0.215, -0.12, 0.205), (0.19, 0.27, 0.16), shoe, leg)
        cube(f"Rubber sole.{side}", (side * 0.215, -0.12, 0.085), (0.19, 0.29, 0.06), shoe, leg, 0.038)
        if not response and not search and not riot and not assault:
            animate(leg, -1 if side == -1 else 1)


def main():
    pipeline_common.require_blender_version()
    options = arguments()
    output = options.output or Path(__file__).resolve().parents[2] / f"assets/source/blender/{options.asset_id}.blend"
    output = output.resolve()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    root = pivot("SpriteRoot", (0, 0, 0), None)
    pivot("SpriteTarget", (0, 0, 0), None)
    build_detailed_actor(root, options.asset_id)
    bpy.ops.object.light_add(type="AREA", location=(3.5, -4, 6))
    key = bpy.context.object
    key.name, key.data.energy, key.data.shape, key.data.size = "Key light", 850, "DISK", 5
    face(key, Vector((0, 0, 1.7)))
    bpy.ops.object.light_add(type="AREA", location=(-4, 2, 3))
    fill = bpy.context.object
    fill.name, fill.data.energy, fill.data.size = "Fill light", 350, 4
    face(fill, Vector((0, 0, 1.8)))
    bpy.ops.object.camera_add(location=(6.5, -8, 5.7))
    camera = bpy.context.object
    camera.name, camera.data.type, camera.data.ortho_scale = "Camera", "ORTHO", 4.6
    face(camera, Vector((0, 0, 1.8)))
    scene = bpy.context.scene
    scene.camera, scene.frame_start, scene.frame_end = camera, 1, 8
    scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage = 256, 384, 100
    pipeline_common.apply_deterministic_render_settings(scene)
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))


if __name__ == "__main__":
    main()
