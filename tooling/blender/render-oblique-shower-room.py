"""Publish the existing shower tile and head for the full-turn cell wing."""
from __future__ import annotations

import importlib.util
import json
import math
from pathlib import Path

import bpy

SCRIPT_DIR = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "oblique_bed_door", SCRIPT_DIR / "render-oblique-bed-door-frames.py")
assert spec and spec.loader
modules = importlib.util.module_from_spec(spec)
spec.loader.exec_module(modules)

ASSETS = (("floor.shower.ceramic", "floor-shower"),
          ("fixture.shower.head", "shower-head"))
REGISTRY = modules.ROOT / "public/game-content/oblique-module-registry.v1.json"


def mount_shower_head(source) -> None:
    """Derive a slim wall shower from the catalog palette and fixture model.

    The catalog's broad horizontal disc reads as a floor basin in oblique
    views. A vertical riser, narrow control panel and overhead arm keep the
    same 1×1 tile pivot while reading as a shower at native scale.
    """
    source.hide_render = True
    collection = bpy.data.collections.new("oblique wall shower")
    bpy.context.scene.collection.children.link(collection)

    def surface(prefix):
        item = next(item for item in source.all_objects if item.name.startswith(prefix))
        return item.data.materials[0]

    silver = surface("Bent brushed-steel arm")
    edge = surface("Head coupling bright sleeve")
    dark = surface("Deep charcoal nozzle face")
    teal = surface("Teal rolled head ring")
    hot = surface("Service valve lens.-0.255")
    cold = surface("Service valve lens.0.255")
    nozzle = surface("Nozzle.0.0")

    def mesh_object(name, vertices, faces, material):
        mesh = bpy.data.meshes.new(name + " mesh")
        # Mount against the north wall of the standard shower room.
        mesh.from_pydata([(-x, -y, z) for x, y, z in vertices], [], faces)
        mesh.update()
        mesh.materials.append(material)
        collection.objects.link(bpy.data.objects.new(name, mesh))

    def box(name, center, size, material):
        cx, cy, cz = center
        hx, hy, hz = (axis / 2 for axis in size)
        vertices = [(cx + x * hx, cy + y * hy, cz + z * hz)
                    for z in (-1, 1) for y in (-1, 1) for x in (-1, 1)]
        faces = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4),
                 (1, 3, 7, 5), (3, 2, 6, 7), (2, 0, 4, 6)]
        mesh_object(name, vertices, faces, material)

    def cylinder(name, center, radius, depth, material, sides=24):
        cx, cy, cz = center
        vertices = [(cx + radius * math.cos(2 * math.pi * i / sides),
                     cy + radius * math.sin(2 * math.pi * i / sides),
                     cz + height * depth / 2)
                    for height in (-1, 1) for i in range(sides)]
        faces = [tuple(reversed(range(sides))), tuple(range(sides, sides * 2))]
        faces.extend((i, (i + 1) % sides, (i + 1) % sides + sides, i + sides)
                     for i in range(sides))
        mesh_object(name, vertices, faces, material)

    box("wall riser", (0, -0.40, 1.10), (0.08, 0.08, 2.12), silver)
    box("control backplate", (0, -0.36, 1.15), (0.34, 0.09, 0.48), edge)
    box("dark control inset", (0, -0.302, 1.15), (0.28, 0.02, 0.40), dark)
    cylinder("hot valve", (-0.085, -0.285, 1.11), 0.047, 0.025, hot)
    cylinder("cold valve", (0.085, -0.285, 1.11), 0.047, 0.025, cold)
    box("overhead arm", (0, -0.16, 2.13), (0.08, 0.56, 0.08), silver)
    cylinder("small rain head", (0, 0.12, 2.075), 0.19, 0.11, edge, 32)
    cylinder("teal rim", (0, 0.12, 2.14), 0.18, 0.018, teal, 32)
    cylinder("dark spray face", (0, 0.12, 2.155), 0.155, 0.014, dark, 32)
    for ring, (radius, count) in enumerate(((0.07, 6), (0.12, 10))):
        for index in range(count):
            angle = 2 * math.pi * index / count
            cylinder(f"spray nozzle {ring}.{index}",
                     (radius * math.cos(angle), 0.12 + radius * math.sin(angle), 2.168),
                     0.012, 0.008, nozzle, 10)


def main() -> None:
    modules.pipeline_common.require_blender_version()
    modules.setup_scene()
    modules.YAW = tuple(range(-180, 180, 15))
    for asset_id, slug in ASSETS:
        collection = modules.append_collection(modules.CATALOG, asset_id)
        origin = next((item for item in collection.all_objects
                       if item.name == asset_id + ".origin"), None)
        if origin is None:
            raise RuntimeError(f"{asset_id} has no tile origin")
        origin.location = (0, 0, 0)
        if asset_id == "fixture.shower.head":
            mount_shower_head(collection)
        bpy.context.view_layer.update()
        modules.render_module(asset_id, slug, modules.CATALOG, [],
                              resolution_px=128 if asset_id == "floor.shower.ceramic" else 512)
        collection.hide_render = True
    registry = json.loads(REGISTRY.read_text(encoding="utf-8"))
    ids = {asset_id for asset_id, _ in ASSETS}
    entries = [entry for entry in registry["entries"] if entry["assetId"] not in ids]
    entries.extend({"assetId": asset_id,
                    "manifest": f"/game-content/oblique-{slug}.v1.json"}
                   for asset_id, slug in ASSETS)
    modules.pipeline_common.write_text(REGISTRY,
        json.dumps({"schemaVersion": 1, "entries": entries}, indent=2) + "\n")


if __name__ == "__main__":
    main()
