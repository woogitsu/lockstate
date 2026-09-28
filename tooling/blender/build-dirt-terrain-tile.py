"""Author a seamless compacted-earth ground module for the default prison terrain."""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/floor.terrain.dirt.blend"
MANIFEST = ROOT / "assets/source/blender/floor.terrain.dirt.manifest.json"
ASSET_ID = "floor.terrain.dirt"


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

    soil = bpy.data.materials.new("matte compacted earth")
    soil.use_nodes = True
    tree = soil.node_tree
    principled = tree.nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.94
    position = tree.nodes.new("ShaderNodeNewGeometry")
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "2D"
    noise.inputs["Scale"].default_value = 13.0
    noise.inputs["Detail"].default_value = 2.0
    noise.inputs["Roughness"].default_value = 0.58
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.18
    ramp.color_ramp.elements[0].color = (0.105, 0.070, 0.043, 1)
    ramp.color_ramp.elements[1].position = 0.82
    ramp.color_ramp.elements[1].color = (0.180, 0.128, 0.083, 1)
    tree.links.new(position.outputs["Position"], noise.inputs["Vector"])
    tree.links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    tree.links.new(ramp.outputs["Color"], principled.inputs["Base Color"])

    collection = bpy.data.collections.new(ASSET_ID)
    scene.collection.children.link(collection)
    collection["assetId"] = ASSET_ID
    collection["footprintTiles"] = [1.0, 1.0]
    collection["pivotTile"] = [0.5, 0.5]
    collection["heightTiles"] = 0.0
    mesh = bpy.data.meshes.new("one tile soil surface")
    mesh.from_pydata([(-0.5, -0.5, 0.0), (0.5, -0.5, 0.0),
                      (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0)],
                     [], [(0, 1, 2, 3)])
    mesh.update()
    mesh.materials.append(soil)
    collection.objects.link(bpy.data.objects.new("flat compacted earth", mesh))
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    pipeline_common.write_text(MANIFEST, json.dumps({
        "schemaVersion": 1, "source": SOURCE.name,
        "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "assetIds": [ASSET_ID], "footprintTiles": [1, 1],
        "pivotTile": [0.5, 0.5], "material": "matte compacted earth",
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
