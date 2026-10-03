"""Build the oblique waste-bin module for the angled world renderer.

Run with Blender 5.2:
  blender --background --python tooling/blender/build-waste-bin-oblique.py -- --output <dir>
"""
from __future__ import annotations
import os, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import pipeline_common
pipeline_common.require_blender_version()

repo = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
output = Path(args[args.index("--output") + 1]).resolve() if "--output" in args else repo / "assets/source/blender"
output.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, color, rough=0.55, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.metallic = metallic
    m.roughness = rough
    return m

def cube(name, location, dimensions, material, bevel=0.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    ob = bpy.context.object; ob.name = name; ob.dimensions = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    ob.data.materials.append(material)
    if bevel:
        mod = ob.modifiers.new("soft_edges", "BEVEL"); mod.width = bevel; mod.segments = 2
    return ob

def cylinder(name, location, radius, depth, material, vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    ob = bpy.context.object; ob.name = name; ob.data.materials.append(material); return ob

shell = mat("waste bin enamel", (0.10, 0.34, 0.37), .48)
edge = mat("waste bin edge", (0.38, 0.55, 0.55), .35, .2)
inner = mat("waste bin cavity", (0.018, 0.025, 0.027), .72)
accent = mat("waste bin pedal", (0.68, 0.42, 0.16), .38, .15)
label = mat("waste bin label", (0.78, 0.82, 0.72), .58)
objects = []
# 1x1 tile footprint, silhouette remains readable from every angle.
objects += [cylinder("bin body", (0, 0, .34), .34, .68, shell)]
objects += [cylinder("bin shoulder", (0, 0, .70), .35, .06, edge)]
objects += [cylinder("bin cavity", (0, 0, .735), .24, .018, inner)]
# rectangular lid and hinge bridge for a distinctive top silhouette
objects += [cube("hinge bridge", (0, -.19, .79), (.42, .20, .10), shell, .025)]
objects += [cube("lid", (0, -.29, .87), (.62, .28, .07), edge, .035)]
objects += [cube("lid inset", (0, -.30, .91), (.48, .14, .012), shell, .015)]
objects += [cube("lid front", (0, -.18, .925), (.58, .035, .018), edge, .008)]
# pedal and a front label catch low elevations too
objects += [cube("pedal stem", (0, .39, .11), (.07, .12, .06), shell, .01)]
objects += [cube("pedal", (0, .48, .105), (.28, .13, .05), accent, .018)]
objects += [cube("label", (0, -.345, .40), (.22, .012, .16), label, .008)]
# tiny side handles add visual scale without changing tile footprint
for x in (-.33, .33): objects.append(cube(f"side handle {x}", (x, 0, .45), (.035, .14, .16), edge, .01))
assert len(objects) == 12
for ob in objects: ob.select_set(True)
bpy.context.view_layer.objects.active = objects[0]
bpy.ops.wm.save_as_mainfile(filepath=str(output / "fixture.cell.waste_bin.blend"))
print("saved", output / "fixture.cell.waste_bin.blend")
