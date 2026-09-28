"""Author four transparent ground-level edges between compacted dirt and turf."""
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
SOURCE = ROOT / "assets/source/blender/floor.terrain.dirt-grass.edge.blend"
MANIFEST = ROOT / "assets/source/blender/floor.terrain.dirt-grass.edge.manifest.json"
DIRECTIONS = (("north", 0), ("east", 90), ("south", 180), ("west", 270))
ASSET_IDS = tuple(f"floor.terrain.dirt-grass.edge.{name}" for name, _ in DIRECTIONS)


def material(name, color):
    item = bpy.data.materials.new(name)
    item.diffuse_color = color
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = color
    shader.inputs["Roughness"].default_value = 0.98
    return item


def mesh(collection, name, vertices, faces, surface, degrees):
    angle = math.radians(degrees)
    co, si = math.cos(angle), math.sin(angle)
    rotated = [(x * co - y * si, x * si + y * co, z) for x, y, z in vertices]
    item = bpy.data.meshes.new(name + " mesh")
    item.from_pydata(rotated, [], faces)
    item.update()
    item.materials.append(surface)
    collection.objects.link(bpy.data.objects.new(name, item))


def main() -> None:
    pipeline_common.require_blender_version()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = False
    scene.render.resolution_x = scene.render.resolution_y = 512
    pipeline_common.apply_deterministic_render_settings(scene)
    pipeline_common.configure_oblique_module_lighting(scene)
    soil = material("soil olive transition", (0.100, 0.110, 0.060, 1))
    turf = material("short turf tips", (0.055, 0.105, 0.025, 1))
    straw = material("dry grass thatch", (0.145, 0.130, 0.067, 1))
    for direction, degrees in DIRECTIONS:
        asset_id = f"floor.terrain.dirt-grass.edge.{direction}"
        collection = bpy.data.collections.new(asset_id)
        scene.collection.children.link(collection)
        collection["assetId"] = asset_id
        collection["footprintTiles"] = [1.0, 1.0]
        collection["pivotTile"] = [0.5, 0.5]
        collection["heightTiles"] = 0.0

        # A ragged band straddles the grass tile's north edge. Its two ends
        # meet at the same width when repeated on adjacent tiles.
        vertices = []
        for index in range(13):
            x = -0.5 + index / 12
            jitter = 0.0 if index in (0, 12) else 0.016 * math.sin(index * 2.37)
            vertices.extend(((x, -0.548 + jitter, 0.003),
                             (x, -0.442 + jitter * 0.7, 0.003)))
        faces = [(index * 2, index * 2 + 2, index * 2 + 3, index * 2 + 1)
                 for index in range(12)]
        mesh(collection, "ragged soil and thatch seam", vertices, faces, soil, degrees)

        for index in range(20):
            x = -0.46 + index * 0.048
            offset = 0.016 * math.sin(index * 2.9)
            tip = -0.575 - (index % 4) * 0.010
            vertices = [(x - 0.014, -0.475 + offset, 0.006),
                        (x + 0.015, -0.475 + offset, 0.006),
                        (x + 0.003 * (index % 3 - 1), tip, 0.006)]
            mesh(collection, f"turf tuft {index}", vertices, [(0, 2, 1)],
                 turf if index % 4 else straw, degrees)
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    pipeline_common.write_text(MANIFEST, json.dumps({
        "schemaVersion": 1, "source": SOURCE.name,
        "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "assetIds": list(ASSET_IDS), "footprintTiles": [1, 1],
        "pivotTile": [0.5, 0.5], "placement": "overlay on grass tile facing dirt",
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
