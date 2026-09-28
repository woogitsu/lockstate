"""Author a seam-compatible, ground-level olive grass tile for the rotating camera."""
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
SOURCE = ROOT / "assets/source/blender/floor.terrain.grass.blend"
MANIFEST = ROOT / "assets/source/blender/floor.terrain.grass.manifest.json"
ASSET_ID = "floor.terrain.grass"


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

    grass = bpy.data.materials.new("ground-level mown olive turf")
    grass.use_nodes = True
    nodes, links = grass.node_tree.nodes, grass.node_tree.links
    principled = nodes.get("Principled BSDF")
    principled.inputs["Roughness"].default_value = 0.98
    coords = nodes.new("ShaderNodeTexCoord")
    split = nodes.new("ShaderNodeSeparateXYZ")
    links.new(coords.outputs["Generated"], split.inputs["Vector"])

    def periodic(channel, operation):
        angle = nodes.new("ShaderNodeMath")
        angle.operation = "MULTIPLY"
        angle.inputs[1].default_value = 2 * math.pi
        links.new(split.outputs[channel], angle.inputs[0])
        trig = nodes.new("ShaderNodeMath")
        trig.operation = operation
        links.new(angle.outputs[0], trig.inputs[0])
        return trig.outputs[0]

    vector = nodes.new("ShaderNodeCombineXYZ")
    links.new(periodic("X", "SINE"), vector.inputs["X"])
    links.new(periodic("X", "COSINE"), vector.inputs["Y"])
    links.new(periodic("Y", "SINE"), vector.inputs["Z"])
    noise = nodes.new("ShaderNodeTexNoise")
    noise.noise_dimensions = "4D"
    noise.inputs["Scale"].default_value = 5.8
    noise.inputs["Detail"].default_value = 3.5
    links.new(vector.outputs["Vector"], noise.inputs["Vector"])
    links.new(periodic("Y", "COSINE"), noise.inputs["W"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.015, 0.040, 0.008, 1)
    ramp.color_ramp.elements[1].position = 0.75
    ramp.color_ramp.elements[1].color = (0.058, 0.113, 0.026, 1)
    links.new(noise.outputs["Fac"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], principled.inputs["Base Color"])

    collection = bpy.data.collections.new(ASSET_ID)
    scene.collection.children.link(collection)
    collection["assetId"] = ASSET_ID
    collection["footprintTiles"] = [1.0, 1.0]
    collection["pivotTile"] = [0.5, 0.5]
    collection["heightTiles"] = 0.0
    mesh = bpy.data.meshes.new("one tile mown grass")
    mesh.from_pydata([(-0.5, -0.5, 0.0), (0.5, -0.5, 0.0),
                      (0.5, 0.5, 0.0), (-0.5, 0.5, 0.0)],
                     [], [(0, 1, 2, 3)])
    mesh.update()
    mesh.materials.append(grass)
    collection.objects.link(bpy.data.objects.new("flat olive turf", mesh))
    SOURCE.parent.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    pipeline_common.write_text(MANIFEST, json.dumps({
        "schemaVersion": 1, "source": SOURCE.name,
        "sha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "assetIds": [ASSET_ID], "footprintTiles": [1, 1],
        "pivotTile": [0.5, 0.5], "material": "periodic olive turf",
    }, indent=2) + "\n")


if __name__ == "__main__":
    main()
