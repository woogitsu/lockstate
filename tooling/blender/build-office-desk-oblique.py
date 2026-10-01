"""Build a 2x1 office workstation for the angled game view."""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import pipeline_common
pipeline_common.require_blender_version()

repo = Path(__file__).resolve().parents[2]
output = repo / "assets/source/blender/furniture.office.desk.generic.blend"
output.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)

def mat(name, rgb, rough=.57, metal=0):
    value = bpy.data.materials.new(name)
    value.diffuse_color = (*rgb, 1)
    value.roughness = rough
    value.metallic = metal
    return value

def box(name, center, size, material, bevel=.015):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new("soft corners", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
    return obj

wood = mat("warm oak laminate", (.42, .27, .14))
edge = mat("worktop edging", (.18, .12, .08))
steel = mat("powder coated steel", (.23, .30, .32), .48, .22)
screen = mat("monitor display", (.05, .13, .17), .25)
paper = mat("paper", (.80, .76, .62), .78)
accent = mat("teal drawer label", (.12, .47, .48))

# All geometry remains inside a 2x1 footprint, with the front toward +Y.
box("laminate desktop", (0, 0, .70), (1.82, .84, .10), wood, .035)
box("dark desktop edge", (0, .405, .69), (1.82, .035, .055), edge, .012)
for x in (-.78, .78):
    box(f"steel leg {x}", (x, -.24, .35), (.08, .08, .70), steel)
    box(f"front leg {x}", (x, .29, .35), (.08, .08, .70), steel)
box("rear stretcher", (0, -.27, .20), (1.54, .05, .07), steel)
box("three-drawer pedestal", (.59, -.05, .33), (.39, .53, .62), steel, .025)
for z in (.16, .34, .52):
    box(f"drawer face {z}", (.59, .224, z), (.34, .02, .16), wood, .01)
    box(f"drawer pull {z}", (.59, .239, z), (.12, .012, .018), accent, .004)
box("monitor base", (-.30, -.16, .77), (.26, .20, .04), steel)
box("monitor neck", (-.30, -.18, .91), (.05, .05, .27), steel)
box("monitor casing", (-.30, -.20, 1.10), (.54, .055, .34), steel, .01)
box("monitor screen", (-.30, -.167, 1.10), (.48, .012, .28), screen, .002)
box("keyboard", (-.24, .17, .765), (.53, .18, .025), steel, .008)
box("document stack", (.43, .12, .766), (.28, .31, .025), paper, .005)
box("document top", (.43, .12, .785), (.25, .28, .006), accent, .001)

bpy.ops.wm.save_as_mainfile(filepath=str(output))
print("saved", output)
