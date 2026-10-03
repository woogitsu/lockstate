"""Build a one-tile institutional hand-washing sink for oblique rendering."""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import pipeline_common
pipeline_common.require_blender_version()

repo = Path(__file__).resolve().parents[2]
output = repo / "assets/source/blender/fixture.cell.sink.handwash.blend"
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def material(name, rgb, rough=.55, metal=0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*rgb, 1)
    value.roughness = rough
    value.metallic = metal
    return value

def box(name, center, size, mat, bevel=.012):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    if bevel:
        mod = obj.modifiers.new('soft edges', 'BEVEL')
        mod.width = bevel
        mod.segments = 2
    return obj

def cylinder(name, center, radius, depth, mat):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj

ceramic = material('warm white porcelain', (.72, .78, .75), .21)
inside = material('basin interior shadow', (.24, .43, .44), .39)
chrome = material('brushed steel fittings', (.44, .58, .60), .24, .72)
tile = material('clean backsplash', (.57, .69, .67), .34)
accent = material('service blue handle', (.10, .37, .45), .40)

# One tile footprint, front toward +Y; the open basin reads from high angles.
box('wall backsplash', (0, -.35, .68), (.72, .08, .66), tile, .015)
box('ceramic washstand', (0, 0, .53), (.76, .63, .17), ceramic, .045)
box('basin inset', (0, .035, .628), (.48, .39, .014), inside, .04)
box('rear rim', (0, -.28, .65), (.73, .055, .055), ceramic)
box('front lip', (0, .30, .65), (.70, .06, .05), ceramic)
for x in (-.35, .35):
    box(f'side lip {x}', (x, .02, .65), (.06, .57, .05), ceramic)
box('porcelain pedestal', (0, -.15, .27), (.25, .25, .43), ceramic, .03)
box('pedestal foot', (0, -.16, .045), (.35, .30, .09), ceramic, .03)
box('plumbing drain', (0, .04, .637), (.10, .09, .006), chrome, .005)
cylinder('faucet stem', (0, -.20, .77), .035, .24, chrome)
box('faucet neck', (0, -.12, .89), (.07, .18, .05), chrome, .018)
box('faucet spout', (0, -.03, .85), (.07, .05, .11), chrome, .012)
for x in (-.20, .20):
    cylinder(f'valve {x}', (x, -.22, .72), .045, .04, chrome)
    box(f'blue handle {x}', (x, -.22, .75), (.11, .035, .02), accent, .006)

bpy.ops.wm.save_as_mainfile(filepath=str(output))
print('saved', output)
