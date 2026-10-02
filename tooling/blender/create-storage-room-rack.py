"""Author a dedicated Storage Room visual for the existing one-square rack."""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/furniture.storage-room.timber-rack.blend"


def material(name: str, rgb: tuple[float, float, float], metal=0.0, rough=0.67):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*rgb, 1.0)
    item.use_nodes = True
    surface = item.node_tree.nodes.get("Principled BSDF")
    surface.inputs["Base Color"].default_value = (*rgb, 1.0)
    surface.inputs["Metallic"].default_value = metal
    surface.inputs["Roughness"].default_value = rough
    return item


def block(name, position, half_size, finish, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(location=position)
    item = bpy.context.object
    item.name = name
    item.scale = half_size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    item.data.materials.append(finish)
    if bevel:
        modifier = item.modifiers.new("softened edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        item.modifiers.new("weighted normals", "WEIGHTED_NORMAL")
    return item


def build() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    timber = material("sealed institutional oak", (0.45, 0.33, 0.21))
    timber_edge = material("dark edge grain", (0.30, 0.23, 0.17))
    frame = material("blue-grey painted rack frame", (0.19, 0.30, 0.32), 0.15)
    rubber = material("charcoal floor pads", (0.11, 0.16, 0.17))
    carton = material("stored kraft cartons", (0.57, 0.44, 0.29))
    carton_light = material("carton label paper", (0.71, 0.69, 0.55))
    bin_blue = material("reusable slate storage bin", (0.28, 0.38, 0.39))

    # Existing construction consumes one wood plank and exactly one 1x1 tile.
    # Art is presentational only; frame, shelves and stocked containers stay
    # strictly inside the same authoritative occupied tile.
    for x in (0.16, 0.84):
        for y in (0.17, 0.83):
            block("rack floor pad", (x, y, 0.027), (0.046, 0.046, 0.027), rubber, 0.008)
            block("upright painted timber post", (x, y, 0.675), (0.033, 0.033, 0.62), frame, 0.008)
    for z in (0.29, 0.66, 1.03):
        block("solid oak storage shelf", (0.5, 0.5, z), (0.35, 0.35, 0.035), timber, 0.012)
        block("front shelf grain", (0.5, 0.146, z), (0.34, 0.009, 0.031), timber_edge, 0.003)
        block("rear shelf support", (0.5, 0.81, z - 0.058), (0.32, 0.018, 0.028), frame, 0.004)
    block("upper back cross rail", (0.5, 0.826, 1.22), (0.32, 0.018, 0.026), frame)
    block("upper side cross rail left", (0.163, 0.5, 1.22), (0.018, 0.31, 0.026), frame)
    block("upper side cross rail right", (0.837, 0.5, 1.22), (0.018, 0.31, 0.026), frame)

    # Distinct silhouettes and paper labels communicate stored supplies at
    # every camera yaw; they do not confer inventory or gameplay effects.
    for x, y, z, size in (
        (0.34, 0.40, 0.415, (0.13, 0.18, 0.086)),
        (0.66, 0.51, 0.43, (0.12, 0.16, 0.10)),
        (0.33, 0.55, 0.80, (0.13, 0.14, 0.095)),
        (0.65, 0.48, 0.805, (0.13, 0.18, 0.09)),
    ):
        block("stored supply carton", (x, y, z), size, carton, 0.008)
        block("carton front paper label", (x, y - size[1] - 0.003, z + 0.018),
              (size[0] * 0.44, 0.003, 0.025), carton_light, 0.002)
    block("upper reusable supply tray", (0.47, 0.53, 1.105), (0.23, 0.20, 0.04), bin_blue, 0.014)
    block("upper tray pale insert", (0.47, 0.53, 1.149), (0.20, 0.17, 0.005), carton_light, 0.003)

    origin = bpy.data.objects.new("FootprintOrigin (1x1 square, minimum corner)", None)
    bpy.context.collection.objects.link(origin)
    origin.location = (0.5, 0.5, 0)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    print(f"authored storage-room rack variant of existing object: {SOURCE}")


if __name__ == "__main__":
    build()
