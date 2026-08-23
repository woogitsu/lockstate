"""Create a procedural Lockstate actor source scene and walk cycle."""
import argparse
import math
from pathlib import Path
import sys

import bpy
from mathutils import Vector

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
    bpy.ops.mesh.primitive_uv_sphere_add(segments=24, ring_count=12, location=location)
    item = bpy.context.object
    item.name, item.scale = name, scale
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


def main():
    options = arguments()
    profile = PROFILES[options.asset_id]
    output = Path(__file__).resolve().parents[2] / f"assets/source/blender/{options.asset_id}.blend"
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    uniform = mat("Uniform", profile["uniform"], 0.72)
    skin = mat("Skin", (0.42, 0.16, 0.07), 0.65)
    black = mat("Rubber black", (0.012, 0.014, 0.018), 0.4)
    patch = mat("Role patch", profile["patch"], 0.8)
    root = pivot("SpriteRoot", (0, 0, 0), None)
    pivot("SpriteTarget", (0, 0, 0), None)
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
    scene.render.image_settings.file_format, scene.render.image_settings.color_mode = "PNG", "RGBA"
    scene.render.film_transparent = True
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))


if __name__ == "__main__":
    main()
