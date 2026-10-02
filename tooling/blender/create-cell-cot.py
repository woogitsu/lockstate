"""Author a full-footprint 1x2 bed skin for the existing Cell bed object."""
from __future__ import annotations

import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/furniture.cell.cot.single.blend"


def material(name: str, rgb: tuple[float, float, float], metal=0.0, rough=0.65):
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
    steel = material("powder coated graphite steel", (0.16, 0.23, 0.26), 0.38, 0.50)
    edge = material("dark mattress piped seam", (0.23, 0.30, 0.32))
    mattress = material("washable blue grey mattress", (0.47, 0.56, 0.56))
    mattress_light = material("mattress upper surface", (0.55, 0.62, 0.60))
    blanket = material("folded muted ochre blanket", (0.67, 0.38, 0.19))
    blanket_fold = material("blanket narrow fold", (0.77, 0.47, 0.26))
    pillow = material("pale laundered pillow", (0.80, 0.81, 0.75))
    rubber = material("non marking rubber feet", (0.09, 0.13, 0.15))

    # The shipped object footprint is width 1, height 2, with the anchor at
    # its minimum X/Y corner (src/content/object-catalog.ts). Head is north.
    for x in (0.17, 0.83):
        for y in (0.18, 1.82):
            block("rubber bed foot", (x, y, 0.026), (0.045, 0.045, 0.026), rubber, 0.007)
            block("square steel leg", (x, y, 0.215), (0.031, 0.031, 0.19), steel, 0.006)
        block("full length side rail", (x, 1.0, 0.37), (0.028, 0.83, 0.052), steel, 0.010)
    block("north headboard upper bar", (0.5, 0.18, 0.60), (0.35, 0.026, 0.035), steel, 0.009)
    block("north headboard infill", (0.5, 0.18, 0.50), (0.30, 0.017, 0.085), steel, 0.007)
    block("south footboard bar", (0.5, 1.82, 0.44), (0.35, 0.026, 0.034), steel, 0.009)
    for y in (0.32, 0.87, 1.42, 1.71):
        block("under mattress cross support", (0.5, y, 0.34), (0.31, 0.022, 0.020), steel, 0.004)

    block("piped mattress perimeter", (0.5, 1.0, 0.429), (0.303, 0.795, 0.075), edge, 0.028)
    block("washable mattress main", (0.5, 1.0, 0.466), (0.29, 0.78, 0.071), mattress, 0.042)
    block("mattress top light", (0.5, 0.995, 0.541), (0.264, 0.745, 0.004), mattress_light, 0.003)
    block("north pillow", (0.5, 0.43, 0.58), (0.218, 0.19, 0.039), pillow, 0.035)
    block("folded foot blanket", (0.5, 1.44, 0.576), (0.281, 0.28, 0.036), blanket, 0.019)
    block("blanket turned top edge", (0.5, 1.205, 0.608), (0.278, 0.046, 0.015), blanket_fold, 0.009)

    origin = bpy.data.objects.new("FootprintOrigin (1x2, minimum corner)", None)
    bpy.context.collection.objects.link(origin)
    origin.location = (0.5, 1.0, 0)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    bpy.context.preferences.filepaths.save_version = 0
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    print(f"authored full 1x2 footprint Cell cot: {SOURCE}")


if __name__ == "__main__":
    build()
