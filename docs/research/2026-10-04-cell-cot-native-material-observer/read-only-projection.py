"""Read-only ray projection of saved authored meshes; no render or source writes."""
from pathlib import Path
import importlib.util, hashlib, json, sys
import bpy
from mathutils import Vector
ROOT = Path.cwd()
HERE = ROOT / 'tooling/blender'
sys.path.insert(0,str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
spec=importlib.util.spec_from_file_location('cot_readonly',HERE/'render-cell-cot-cycles.py')
producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
scene,camera=producer.configure()
path=ROOT/'assets/source/blender/furniture.cell.cot.single.soft-light.blend'
source_before=hashlib.sha256(path.read_bytes()).hexdigest()
producer.exporter.point_camera(camera,300,40)
bpy.context.view_layer.update()
graph=bpy.context.evaluated_depsgraph_get()
quat=camera.matrix_world.to_quaternion()
direction=quat@Vector((0,0,-1))
labels=[]
for y in range(256):
    for x in range(256):
        origin=camera.location+quat@Vector(((x+.5-128)/64,(128-y-.5)/64,0))
        hit,location,normal,face,obj,matrix=scene.ray_cast(graph,origin,direction,distance=20)
        labels.append(obj.name if hit else None)
rows=[]
for obj in sorted((o for o in scene.objects if o.type=='MESH'),key=lambda o:o.name):
    interior=[]
    for y in range(1,255):
        for x in range(1,255):
            if all(labels[(y+dy)*256+x+dx]==obj.name for dx in (-1,0,1) for dy in (-1,0,1)):
                interior.append(y*256+x)
    rows.append({'mesh':obj.name,'materials':[m.name for m in obj.data.materials],
                 'worldBounds':[[float(min((obj.matrix_world@Vector(c))[a] for c in obj.bound_box)) for a in range(3)],
                                [float(max((obj.matrix_world@Vector(c))[a] for c in obj.bound_box)) for a in range(3)]],
                 'rayHitPixels':labels.count(obj.name),'opaqueInsetPixelIndices':interior})
source_after=hashlib.sha256(path.read_bytes()).hexdigest()
assert source_before==source_after==producer.SOURCE_SHA
out={'blenderVersion':list(bpy.app.version),'sourceSha256':source_after,'sourceUnchanged':True,
     'renderPerformed':False,'savedSourceEdited':False,'camera':{'yaw':300,'elevation':40,'resolution':[256,256],'orthoScale':4},
     'method':'Nearest evaluated triangle ray hit at pixel center; 3x3 same-object inset excludes silhouettes/bevel boundaries.',
     'meshes':rows}
(ROOT/'docs/research/2026-10-04-cell-cot-native-material-observer/read-only-projection.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print('COT_READ_ONLY_PROJECTION_SOURCE25_GRAPH9_CONTACT6_UNCHANGED',source_after,flush=True)
