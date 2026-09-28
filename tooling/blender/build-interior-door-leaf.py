"""Author an open timber cell door leaf for the camera-angle wall kit.

The wall kit owns the jambs and lintel. This collection contains only the
hinged leaf and hardware; its hinge sits inside a one-tile doorway. Run with
Blender 5.2 from the repository root.
"""
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
SOURCE = ROOT / "assets/source/blender/door.interior.leaf.open.blend"
MANIFEST = ROOT / "assets/source/blender/door.interior.leaf.open.manifest.json"
ASSET_ID = "door.interior.leaf.open"
HINGE = (-0.36, 0.0, 0.0)
OPEN_DEGREES = -125  # folds out toward the corridor wall, clear from both oblique views


def material(name: str, color: tuple[float, float, float, float], roughness: float):
    result = bpy.data.materials.new(name)
    result.diffuse_color = color
    result.use_nodes = True
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = roughness
    return result


def box(collection, parent, name, location, dimensions, surface, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1)
    obj = bpy.context.object
    obj.name = name
    for linked in list(obj.users_collection):
        linked.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel:
        modifier = obj.modifiers.new("Soft manufactured edge", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        obj.modifiers.new("Weighted normals", "WEIGHTED_NORMAL")
    return obj


def round_hardware(collection, parent, name, location, radius, surface):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=radius)
    obj = bpy.context.object
    obj.name = name
    for linked in list(obj.users_collection):
        linked.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    obj.data.materials.append(surface)


def main():
    pipeline_common.require_blender_version()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    collection = bpy.data.collections.new(ASSET_ID)
    scene.collection.children.link(collection)
    collection["assetId"] = ASSET_ID
    collection["footprintTiles"] = [1, 1]
    collection["pivotTile"] = [0.5, 0.5]
    pivot = bpy.data.objects.new("Open leaf hinge pivot", None)
    collection.objects.link(pivot)
    pivot.location = HINGE
    pivot.rotation_euler.z = math.radians(OPEN_DEGREES)

    walnut = material("Warm walnut slab", (0.34, 0.17, 0.09, 1), 0.76)
    raised = material("Warm walnut raised panel", (0.42, 0.23, 0.12, 1), 0.73)
    groove = material("Recessed dark panel seam", (0.17, 0.09, 0.06, 1), 0.9)
    end_grain = material("Timber end grain", (0.49, 0.28, 0.16, 1), 0.8)
    steel = material("Brushed galvanized handle and hinges", (0.58, 0.65, 0.67, 1), 0.42)
    shade = material("Hardware shadow", (0.12, 0.15, 0.16, 1), 0.84)

    # Leaf span is x=0..0.76 around its hinge, 2.28 high: it stays inside the
    # 0.76-tile clear opening between the wall kit's two jamb inner faces.
    box(collection, pivot, "Timber door slab", (0.38, 0, 1.14),
        (0.76, 0.072, 2.28), walnut, 0.012)
    box(collection, pivot, "Visible top end grain", (0.38, 0, 2.284),
        (0.72, 0.064, 0.010), end_grain, 0.002)
    for face in (-1, 1):
        y = face * 0.041
        for z in (0.65, 1.62):
            box(collection, pivot, f"Panel dark recess {face} {z}", (0.38, y, z),
                (0.58, 0.010, 0.73), groove, 0.008)
            box(collection, pivot, f"Raised timber panel {face} {z}",
                (0.38, y + face * 0.008, z), (0.53, 0.012, 0.67), raised, 0.014)
        box(collection, pivot, f"Latch plate {face}",
            (0.65, face * 0.052, 1.06), (0.10, 0.017, 0.18), steel, 0.006)
        round_hardware(collection, pivot, f"Round steel grip {face}",
                       (0.65, face * 0.082, 1.06), 0.047, steel)
        round_hardware(collection, pivot, f"Handle socket {face}",
                       (0.65, face * 0.054, 1.06), 0.023, shade)
    for z in (0.38, 1.89):
        box(collection, pivot, f"Hinge barrel {z}", (0.012, 0, z),
            (0.045, 0.13, 0.17), steel, 0.009)
        box(collection, pivot, f"Hinge pin {z}", (0.012, 0, z + 0.091),
            (0.032, 0.032, 0.016), shade, 0.003)

    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    manifest = {"schemaVersion": 1, "source": SOURCE.name, "assetId": ASSET_ID,
                "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                "footprintTiles": [1, 1], "pivotTile": [0.5, 0.5],
                "hingeWorld": list(HINGE), "leafClearWidthTiles": 0.76,
                "leafHeightTiles": 2.28, "openDegrees": OPEN_DEGREES,
                "swingsToward": "corridor (negative Y)",
                "frameAsset": "wall.interior.doorframe.full"}
    pipeline_common.write_text(MANIFEST, json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
