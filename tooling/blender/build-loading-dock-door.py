import bpy, os, sys
sys.path.insert(0, os.path.dirname(__file__))
import pipeline_common
pipeline_common.require_blender_version()
from mathutils import Vector
OUT=os.path.abspath(sys.argv[sys.argv.index('--')+1]) if '--' in sys.argv else os.path.abspath('assets/source/blender')
os.makedirs(OUT,exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
def mat(name,color,metal=0,rough=.5):
 m=bpy.data.materials.new(name); m.diffuse_color=(*color,1); m.metallic=metal; m.roughness=rough; return m
def cube(name,loc,size,ma,bev=.04):
 x,y,z=(v/2 for v in size); vs=[(-x,-y,-z),(x,-y,-z),(x,y,-z),(-x,y,-z),(-x,-y,z),(x,-y,z),(x,y,z),(-x,y,z)]; fs=[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(4,0,3,7)]; me=bpy.data.meshes.new(name+'Mesh'); me.from_pydata(vs,[],fs); me.update(); o=bpy.data.objects.new(name,me); bpy.context.collection.objects.link(o); o.location=loc; o.data.materials.append(ma); mod=o.modifiers.new('soft_edges','BEVEL'); mod.width=bev; mod.segments=2; return o
body=mat('warm charcoal',(.20,.28,.29),.25,.3); panel=mat('control panel',(.035,.08,.10),.1,.35); accent=mat('amber status',(.95,.52,.08),.5,.25); glass=mat('monitor glass',(.06,.38,.42),.05,.2)
objs=[cube('door',(0,0,.85),(1.82,.18,1.70),body,.04),cube('header',(0,0,1.72),(1.90,.22,.12),body,.03),cube('window',(0,-.12,1.18),(1.35,.04,.65),glass,.03),cube('handle',(0,-.14,.50),(.16,.04,.55),accent,.02),cube('threshold',(0,-.12,.08),(1.70,.20,.12),panel,.02)]
for x in (-.72,.72): objs.append(cube('hinge',(x,.12,.85),(.10,.10,1.20),accent,.02))
for o in objs:o.select_set(True)
bpy.context.view_layer.objects.active=objs[0]
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'utility.loading-dock-door.variants.blend'))
