"""Author a seamless compacted-earth ground module for the default prison terrain."""
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

    soil = bpy.data.materials.new("matte warm compacted earth")
    soil.diffuse_color = (0.22, 0.16, 0.10, 1)
    soil.use_nodes = True
    tree = soil.node_tree
    principled = tree.nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.94
    coordinates = tree.nodes.new("ShaderNodeTexCoord")
    split = tree.nodes.new("ShaderNodeSeparateXYZ")
    tree.links.new(coordinates.outputs["Generated"], split.inputs["Vector"])

    def periodic(channel: str, operation: str):
        angle = tree.nodes.new("ShaderNodeMath")
        angle.operation = "MULTIPLY"
        angle.inputs[1].default_value = 2 * math.pi
        tree.links.new(split.outputs[channel], angle.inputs[0])
        trig = tree.nodes.new("ShaderNodeMath")
        trig.operation = operation
        tree.links.new(angle.outputs[0], trig.inputs[0])
        return trig.outputs[0]

    torus = tree.nodes.new("ShaderNodeCombineXYZ")
    tree.links.new(periodic("X", "SINE"), torus.inputs["X"])
    tree.links.new(periodic("X", "COSINE"), torus.inputs["Y"])
    tree.links.new(periodic("Y", "SINE"), torus.inputs["Z"])
    noise = tree.nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 3.8
    noise.inputs["Detail"].default_value = 2.5
    tree.links.new(torus.outputs["Vector"], noise.inputs["Vector"])
    tree.links.new(periodic("Y", "COSINE"), noise.inputs["W"])
    ramp = tree.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.32
    ramp.color_ramp.elements[0].color = (0.16, 0.115, 0.070, 1)
    ramp.color_ramp.elements[1].position = 0.68
    ramp.color_ramp.elements[1].color = (0.28, 0.205, 0.13, 1)
    ramp.color_ramp.elements.new(0.5).color = (0.22, 0.16, 0.10, 1)
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
        "pivotTile": [0.5, 0.5], "material": "matte warm compacted earth",
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
