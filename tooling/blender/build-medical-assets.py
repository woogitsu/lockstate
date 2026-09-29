import bpy, math, os, sys
from mathutils import Vector
OUT = os.path.abspath(sys.argv[sys.argv.index("--")+1]) if "--" in sys.argv else os.path.abspath("assets/source/blender")
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,color,metal=0.0,rough=.5):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.metallic=metal; m.roughness=rough; return m
def cube(name,loc,scale,ma,bev=.04):
 bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o=bpy.context.object; o.name=name; o.dimensions=scale; bpy.ops.object.transform_apply(location=False,rotation=False,scale=True); o.data.materials.append(ma)
 if bev: mod=o.modifiers.new("soft_edges","BEVEL"); mod.width=bev; mod.segments=2
 return o
def save(asset, objects):
 bpy.ops.object.select_all(action="DESELECT")
 for o in objects:o.select_set(True)
 bpy.context.view_layer.objects.active=objects[0]; bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,asset+".blend"))
# medical bed 1x2, rails, mattress, headboard
steel=mat("warm painted steel",(.42,.48,.50),.35,.32); white=mat("medical linen",(.78,.82,.78),0,.7); blue=mat("mattress edge",(.25,.42,.48),0,.55); accent=mat("rail accent",(.75,.55,.28),.15,.4)
objs=[]; objs += [cube("bed_base",(0,0,0.18),(0.92,1.82,.20),steel,.06),cube("mattress",(0,0,.42),(.82,1.64,.25),white,.08)]
for y in (-.82,.82): objs.append(cube("rail",(0,y,.72),(.82,.07,.42),steel,.035))
for x in (-.40,.40):
 for y in (-.78,.78): objs.append(cube("leg",(x,y,.05),(.1,.1,.28),steel,.025))
objs += [cube("headboard",(0,.78,.9),(.88,.10,.72),blue,.05),cube("pillow",(0,.48,.60),(.68,.30,.12),white,.04),cube("control",(.38,.70,.82),(.10,.06,.12),accent,.02)]
save("furniture.medical-bed.variants",objs)
# medicine cabinet 1x1: body, shelves, doors, handles
body=mat("cabinet warm white",(.70,.72,.66),.05,.45); dark=mat("cabinet inset",(.18,.25,.25),.1,.35); handle=mat("brass handle",(.72,.48,.20),.65,.25)
objs=[]; objs += [cube("cabinet_body",(0,0,.62),(.82,.72,1.18),body,.06),cube("inner",(0,-.37,.62),(.68,.03,1.02),dark,.01)]
for z in (.28,.62,.96): objs.append(cube("shelf",(0,-.02,z),(.68,.62,.04),body,.015))
for x in (-.20,.20): objs += [cube("door",(x,.38,.62),(.37,.04,1.02),body,.03),cube("handle",(x*.55,.415,.62),(.035,.035,.20),handle,.012)]
save("fixture.medicine-cabinet.variants",objs)
