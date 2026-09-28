"""Author full and cutaway wet-room doorway modules with a ground tile pivot."""
from __future__ import annotations

import hashlib
import json
import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/door.shower.privacy.open.blend"
SOURCE_MANIFEST = ROOT / "assets/source/blender/door.shower.privacy.open.manifest.json"
ASSET_IDS = ("door.shower.privacy.open.full", "door.shower.privacy.open.cutaway")
HINGE = (-0.39, 0.0)
OPEN_DEGREES = -65


def material(name, color, roughness):
    item = bpy.data.materials.new(name)
    item.diffuse_color = color
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    return item


def box(collection, name, center, size, surface, swing=False):
    cx, cy, cz = center
    hx, hy, hz = (axis / 2 for axis in size)
    vertices = [(cx + x * hx, cy + y * hy, cz + z * hz)
                for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
    if swing:
        angle = math.radians(OPEN_DEGREES)
        co, si = math.cos(angle), math.sin(angle)
        vertices = [(HINGE[0] + (x - HINGE[0]) * co - (y - HINGE[1]) * si,
                     HINGE[1] + (x - HINGE[0]) * si + (y - HINGE[1]) * co, z)
                    for x, y, z in vertices]
    faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
             (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6)]
    mesh = bpy.data.meshes.new(name + " mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    mesh.materials.append(surface)
    collection.objects.link(bpy.data.objects.new(name, mesh))


def main() -> None:
    pipeline_common.require_blender_version()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = False
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    pipeline_common.configure_oblique_module_lighting(scene)
    steel = material("wet room blue-grey steel", (0.43, 0.53, 0.57, 1), 0.52)
    enamel = material("pale clean enamel", (0.70, 0.77, 0.78, 1), 0.54)
    frosted = material("frosted aqua privacy panel", (0.39, 0.61, 0.62, 1), 0.82)
    dark = material("sealed charcoal edge", (0.18, 0.28, 0.31, 1), 0.75)
    for asset_id in ASSET_IDS:
        cutaway = asset_id.endswith("cutaway")
        collection = bpy.data.collections.new(asset_id)
        scene.collection.children.link(collection)
        collection["assetId"] = asset_id
        collection["footprintTiles"] = [1.0, 1.0]
        collection["pivotTile"] = [0.5, 0.5]
        height = 0.58 if cutaway else 2.30
        collection["heightTiles"] = height
        box(collection, "recessed anti-slip threshold", (0, 0, 0.035),
            (0.94, 0.19, 0.07), dark)
        for side in (-1, 1):
            box(collection, f"galvanized jamb {side}", (side * 0.45, 0, height / 2),
                (0.10, 0.16, height), steel)
            box(collection, f"pale jamb face {side}", (side * 0.45, -0.084, height / 2),
                (0.058, 0.008, height), enamel)
        if not cutaway:
            box(collection, "sealed top lintel", (0, 0, 2.24),
                (1.0, 0.17, 0.12), steel)
            box(collection, "pale top enamel", (0, -0.088, 2.25),
                (0.92, 0.01, 0.05), enamel)
        else:
            for side in (-1, 1):
                box(collection, f"cutaway cap {side}", (side * 0.45, 0, 0.60),
                    (0.12, 0.18, 0.05), enamel)
        panel_low, panel_high = (0.15, 0.52) if cutaway else (0.30, 1.88)
        panel_height = panel_high - panel_low
        panel_z = (panel_high + panel_low) / 2
        box(collection, "open frosted panel", (-0.39 + 0.37, 0, panel_z),
            (0.70, 0.045, panel_height), frosted, swing=True)
        for x in (-0.39 + 0.025, -0.39 + 0.715):
            box(collection, f"panel upright {x}", (x, 0, panel_z),
                (0.03, 0.062, panel_height + 0.03), steel, swing=True)
        for z in (panel_low, panel_high):
            box(collection, f"panel rail {z}", (-0.39 + 0.37, 0, z),
                (0.72, 0.063, 0.036), steel, swing=True)
        if not cutaway:
            box(collection, "bright privacy grip", (-0.39 + 0.61, -0.05, 1.12),
                (0.10, 0.045, 0.14), enamel, swing=True)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    pipeline_common.write_text(SOURCE_MANIFEST, json.dumps({
        "schemaVersion": 1, "source": SOURCE.name,
        "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "assetIds": list(ASSET_IDS), "footprintTiles": [1, 1],
        "pivotTile": [0.5, 0.5], "openDegrees": OPEN_DEGREES,
        "material": "frosted aqua and galvanized steel",
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
