"""Add an edge-complete water tile to the canonical environment scene.

Run with Blender 5.2 on environment.mvp.catalog.blend. Re-running replaces only
the water collection, leaving every reviewed object and terrain mesh untouched.
"""

import math
import sys
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()

ASSET_ID = "terrain.water.still"
old = bpy.data.collections.get(ASSET_ID)
if old is not None:
    for item in list(old.objects):
        bpy.data.objects.remove(item, do_unlink=True)
    bpy.data.collections.remove(old)

collection = bpy.data.collections.new(ASSET_ID)
bpy.context.scene.collection.children.link(collection)
collection["assetId"] = ASSET_ID
collection["footprintTiles"] = [1.0, 1.0]

origin = bpy.data.objects.new(f"{ASSET_ID}.origin", None)
collection.objects.link(origin)


def material(name, color, roughness):
    result = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.use_nodes = True
    for node in tuple(result.node_tree.nodes):
        if node.type not in {"BSDF_PRINCIPLED", "OUTPUT_MATERIAL"}:
            result.node_tree.nodes.remove(node)
    shader = result.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    return result


deep = material("Water deep blue-green", (0.025, 0.115, 0.155), 0.52)
mid = material("Water muted turquoise current", (0.040, 0.155, 0.195), 0.60)
glint = material("Water soft sky reflection", (0.115, 0.265, 0.285), 0.45)

# Two integral-frequency waves give the top face subdued depth. Their sine
# values and first derivatives agree at opposite tile edges, so copies meet
# without a texture seam. Geometry below supplies the few readable highlights.
nodes = deep.node_tree.nodes
links = deep.node_tree.links
coordinates = nodes.new("ShaderNodeTexCoord")
separate = nodes.new("ShaderNodeSeparateXYZ")
links.new(coordinates.outputs["Generated"], separate.inputs["Vector"])


def wave(input_socket, cycles):
    frequency = nodes.new("ShaderNodeMath")
    frequency.operation = "MULTIPLY"
    frequency.inputs[1].default_value = 2 * math.pi * cycles
    links.new(input_socket, frequency.inputs[0])
    sine = nodes.new("ShaderNodeMath")
    sine.operation = "SINE"
    links.new(frequency.outputs[0], sine.inputs[0])
    return sine.outputs[0]


add = nodes.new("ShaderNodeMath")
add.operation = "ADD"
links.new(wave(separate.outputs["X"], 2), add.inputs[0])
links.new(wave(separate.outputs["Y"], 3), add.inputs[1])
range_node = nodes.new("ShaderNodeMapRange")
range_node.inputs["From Min"].default_value = -2
range_node.inputs["From Max"].default_value = 2
links.new(add.outputs[0], range_node.inputs["Value"])
ramp = nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.019, 0.083, 0.119, 1)
ramp.color_ramp.elements[1].color = (0.046, 0.173, 0.205, 1)
links.new(range_node.outputs[0], ramp.inputs["Fac"])
links.new(ramp.outputs["Color"], nodes.get("Principled BSDF").inputs["Base Color"])


def link(obj, name, surface):
    obj.name = name
    for parent in tuple(obj.users_collection):
        parent.objects.unlink(obj)
    collection.objects.link(obj)
    obj.parent = origin
    obj.data.materials.append(surface)
    return obj


bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.04))
base = bpy.context.object
base.dimensions = (1, 1, 0.08)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
link(base, "Continuous still-water surface", deep)


def ribbon(name, y, length, width, phase, surface, z):
    """A shallow irregular reflection kept inside the tile's seamless rim."""
    count = 20
    points = []
    faces = []
    for index in range(count + 1):
        x = (index / count - 0.5) * length
        ripple = 0.018 * math.sin(x * 9 + phase) + 0.006 * math.sin(x * 21 - phase)
        taper = 0.45 + 0.55 * math.sin(math.pi * index / count)
        half = width * taper / 2
        points.extend(((x, y + ripple - half, z), (x, y + ripple + half, z)))
        if index:
            low = 2 * (index - 1)
            faces.append((low, low + 1, low + 3, low + 2))
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(points, [], faces)
    mesh.materials.append(surface)
    reflection = bpy.data.objects.new(name, mesh)
    collection.objects.link(reflection)
    reflection.parent = origin


for index, (y, length, width, phase) in enumerate((
    (-0.35, 0.42, 0.011, 0.4),
    (-0.15, 0.66, 0.014, 1.2),
    (0.10, 0.37, 0.010, 2.1),
    (0.32, 0.57, 0.012, 0.7),
)):
    ribbon(f"Muted ripple.{index}", y, length, width * 2.1, phase, mid, 0.0805)
    ribbon(f"Sky glint.{index}", y + 0.009, length * 0.39, width, phase + 0.3, glint, 0.0810)

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
