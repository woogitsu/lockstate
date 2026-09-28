"""Author the low square-grid masonry used by built four-cell room plans.

This is a visual replacement for the existing 1 x 1 x 0.75 wall-brick proxy.
Its footprint and pivot deliberately match the simulation's square structure.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

_wall_spec = importlib.util.spec_from_file_location(
    "build_interior_wall_module", Path(__file__).with_name("build-interior-wall-module.py"))
assert _wall_spec and _wall_spec.loader
_wall = importlib.util.module_from_spec(_wall_spec)
_wall_spec.loader.exec_module(_wall)

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/wall.square.brick.low.blend"
ASSET_ID = "wall.square.brick.low"


def main() -> None:
    pipeline_common.require_blender_version()
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    pipeline_common.apply_deterministic_render_settings(scene)
    collection = bpy.data.collections.new(ASSET_ID)
    scene.collection.children.link(collection)
    collection["assetId"] = ASSET_ID
    collection["footprintTiles"] = [1.0, 1.0]
    collection["pivotTile"] = [0.5, 0.5]
    collection["heightTiles"] = 0.75

    plaster = _wall.material("warm mineral plaster", (0.62, 0.53, 0.42, 1), 0.93)
    skirting = _wall.material("warm charcoal footing", (0.31, 0.29, 0.26, 1), 0.88)
    cap = _wall.material("muted sandstone coping", (0.48, 0.44, 0.37, 1), 0.84)
    # Match the authored edge-wall kit's restrained mineral variation. The
    # top is a different stone, so each square reads as solid construction.
    nodes = plaster.node_tree.nodes
    links = plaster.node_tree.links
    texture = nodes.new("ShaderNodeTexNoise")
    texture.noise_dimensions = "3D"
    texture.inputs["Scale"].default_value = 18.0
    texture.inputs["Detail"].default_value = 2.0
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.57, 0.48, 0.38, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.66, 0.57, 0.45, 1)
    links.new(texture.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])

    _wall.box(collection, "charcoal stone footing", (0, 0, 0.045),
              (1, 1, 0.09), skirting)
    _wall.box(collection, "lime plaster masonry", (0, 0, 0.405),
              (1, 1, 0.63), plaster, 0.008)
    _wall.box(collection, "sandstone top", (0, 0, 0.735),
              (1, 1, 0.03), cap, 0.004)

    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))


if __name__ == "__main__":
    main()
