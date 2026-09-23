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

PROFILES = {
    "actor.prisoner.base": {"uniform": (0.75, 0.12, 0.015), "patch": (0.55, 0.57, 0.58), "headwear": None},
    "actor.guard.base": {"uniform": (0.018, 0.06, 0.2), "patch": (0.82, 0.7, 0.22), "headwear": "cap"},
    "actor.medic.base": {"uniform": (0.08, 0.38, 0.72), "patch": (0.9, 0.92, 0.94), "headwear": "medical"},
    "actor.cook.base": {"uniform": (0.72, 0.72, 0.68), "patch": (0.95, 0.95, 0.92), "headwear": "chef"},
    "actor.staff.base": {"uniform": (0.22, 0.24, 0.29), "patch": (0.35, 0.58, 0.9), "headwear": None},
}


def arguments():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", choices=sorted(PROFILES), required=True)
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


def prisoner_fabric():
    """Use the approved concept's worn cotton swatch, packed for reproducibility."""
    texture_path = Path(__file__).resolve().parents[2] / "assets/source/textures/prisoner-jumpsuit-orange-v2.png"
    if not texture_path.is_file():
        raise FileNotFoundError(texture_path)
    image = bpy.data.images.load(str(texture_path), check_existing=True)
    image.pack()
    fabric = mat("Prisoner worn orange cotton", (0.64, 0.23, 0.07), 0.85)
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


def face(object_, target):
    object_.rotation_euler = (target - object_.location).to_track_quat("-Z", "Y").to_euler()


def build_prisoner(root):
    """Model the eight-view concept without changing the actor rig contract."""
    fabric = prisoner_fabric()
    dark_seam = mat("Orange seam shadow", (0.31, 0.105, 0.028), 0.85)
    skin = mat("Warm skin", (0.39, 0.22, 0.14), 0.76)
    hair = mat("Short dark hair", (0.014, 0.010, 0.009), 0.88)
    shoe = mat("Worn charcoal shoes", (0.018, 0.020, 0.021), 0.85)
    undershirt = mat("Pale undershirt", (0.76, 0.72, 0.65), 0.91)
    button = mat("Dull steel buttons", (0.20, 0.22, 0.22), 0.52)

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

    sphere("Head", (0, 0, 3.08), (0.285, 0.266, 0.315), skin, root)
    sphere("Short textured hair", (0, 0.055, 3.295), (0.292, 0.278, 0.155), hair, root)
    for side in (-1, 1):
        sphere(f"Sideburn.{side}", (side * 0.255, -0.06, 3.205), (0.035, 0.065, 0.075), hair, root)
    sphere("Nose", (0, -0.265, 3.08), (0.060, 0.078, 0.078), skin, root)
    for side in (-1, 1):
        cube(f"Brow.{side}", (side * 0.105, -0.252, 3.19), (0.078, 0.017, 0.020), hair, root, 0.006)
        sphere(f"Eye.{side}", (side * 0.105, -0.260, 3.155), (0.024, 0.015, 0.020), hair, root)
    cube("Neck", (0, 0, 2.79), (0.115, 0.112, 0.16), skin, root, 0.05)

    for side in (-1, 1):
        arm = pivot(f"Arm.{side}", (side * 0.445, 0, 2.54), root)
        sphere(f"Sleeve.{side}", (side * 0.445, 0, 2.30), (0.148, 0.16, 0.30), fabric, arm)
        cylinder(f"Sleeve cuff.{side}", (side * 0.445, 0, 2.05), 0.132, 0.045, dark_seam, arm)
        limb(f"Forearm.{side}", (side * 0.445, 0, 1.85), 0.096, 0.35, skin, arm)
        sphere(f"Hand.{side}", (side * 0.445, 0, 1.66), (0.096, 0.090, 0.15), skin, arm)
        animate(arm, 1 if side == -1 else -1)

        leg = pivot(f"Leg.{side}", (side * 0.215, 0, 1.50), root)
        sphere(f"Trouser leg.{side}", (side * 0.215, 0, 0.94), (0.185, 0.19, 0.65), fabric, leg)
        cylinder(f"Rolled hem.{side}", (side * 0.215, 0, 0.38), 0.174, 0.09, fabric, leg)
        cube(f"Trouser seam.{side}", (side * 0.215, -0.19, 0.95), (0.014, 0.01, 0.48), dark_seam, leg, 0.002)
        sphere(f"Work shoe upper.{side}", (side * 0.215, -0.12, 0.205), (0.19, 0.27, 0.16), shoe, leg)
        cube(f"Rubber sole.{side}", (side * 0.215, -0.12, 0.085), (0.19, 0.29, 0.06), shoe, leg, 0.038)
        animate(leg, -1 if side == -1 else 1)


def main():
    pipeline_common.require_blender_version()
    options = arguments()
    profile = PROFILES[options.asset_id]
    output = options.output or Path(__file__).resolve().parents[2] / f"assets/source/blender/{options.asset_id}.blend"
    output = output.resolve()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    uniform = mat("Uniform", profile["uniform"], 0.72)
    skin = mat("Skin", (0.42, 0.16, 0.07), 0.65)
    black = mat("Rubber black", (0.012, 0.014, 0.018), 0.4)
    patch = mat("Role patch", profile["patch"], 0.8)
    root = pivot("SpriteRoot", (0, 0, 0), None)
    pivot("SpriteTarget", (0, 0, 0), None)
    if options.asset_id == "actor.prisoner.base":
        build_prisoner(root)
    else:
        cube("Torso", (0, 0, 2.15), (0.46, 0.27, 0.64), uniform, root, 0.14)
        cube("Chest patch", (0, -0.281, 2.38), (0.13, 0.01, 0.07), patch, root, 0.01)
        sphere("Head", (0, 0, 3.12), (0.28, 0.27, 0.33), skin, root)
        if profile["headwear"] is None:
            sphere("Hair", (0, 0.02, 3.35), (0.285, 0.275, 0.13), black, root)
        elif profile["headwear"] == "cap":
            cylinder("Cap", (0, 0, 3.39), 0.3, 0.12, uniform, root)
            cube("Cap visor", (0, -0.27, 3.34), (0.24, 0.13, 0.03), uniform, root, 0.03)
        else:
            sphere("Headwear", (0, 0, 3.39), (0.31, 0.3, 0.18), patch, root)
        cube("Neck", (0, 0, 2.82), (0.11, 0.11, 0.18), skin, root, 0.04)
        for side in (-1, 1):
            arm = pivot(f"Arm.{side}", (side * 0.54, 0, 2.55), root)
            limb(f"UpperArm.{side}", (side * 0.54, 0, 2.15), 0.13, 0.62, uniform, arm)
            sphere(f"Hand.{side}", (side * 0.54, 0, 1.78), (0.14, 0.13, 0.18), skin, arm)
            animate(arm, 1 if side == -1 else -1)
            leg = pivot(f"Leg.{side}", (side * 0.23, 0, 1.57), root)
            limb(f"LegMesh.{side}", (side * 0.23, 0, 0.9), 0.17, 1.15, uniform, leg)
            cube(f"Boot.{side}", (side * 0.23, -0.09, 0.28), (0.19, 0.31, 0.12), black, leg, 0.07)
            animate(leg, -1 if side == -1 else 1)
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
