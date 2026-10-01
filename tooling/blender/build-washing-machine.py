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
body=mat('warm enamel',(.32,.38,.39),.25,.3); panel=mat('control panel',(.12,.18,.19),.1,.35); accent=mat('washer brass',(.72,.48,.2),.5,.25); glass=mat('door glass',(.16,.28,.30),.05,.2)
objs=[cube('body',(0,0,.48),(.82,.72,.88),body,.06),cube('top',(0,0,.96),(.86,.76,.10),body,.04),cube('front',(0,-.39,.48),(.72,.05,.72),body,.03),cube('round_door',(0,-.43,.48),(.48,.04,.48),glass,.12),cube('control',(0,-.43,.82),(.50,.05,.10),panel,.02),cube('dial',(.22,-.47,.82),(.08,.03,.08),accent,.02)]
for x in (-.30,.30): objs.append(cube('foot',(x,.25,.04),(.10,.10,.08),body,.02))
for o in objs:o.select_set(True)
bpy.context.view_layer.objects.active=objs[0]
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT,'utility.washing-machine.variants.blend'))
