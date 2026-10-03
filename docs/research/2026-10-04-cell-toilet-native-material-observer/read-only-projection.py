"""Read-only projection of retained saved Toilet material/mesh regions; no render/save."""
from pathlib import Path
import importlib.util,hashlib,json,sys
import bpy
from mathutils import Vector
ROOT=Path.cwd();HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
spec=importlib.util.spec_from_file_location('toilet_readonly',HERE/'render-cell-toilet-cycles.py')
producer=importlib.util.module_from_spec(spec);spec.loader.exec_module(producer)
scene=producer.configure();camera=scene.camera
path=ROOT/'assets/source/blender/fixture.cell.toilet_sink.soft-light.blend'
before=hashlib.sha256(path.read_bytes()).hexdigest();poses=[]
for yaw in (15,-15):
    producer.exporter.point_camera(scene,yaw,40);bpy.context.view_layer.update()
    graph=bpy.context.evaluated_depsgraph_get();quat=camera.matrix_world.to_quaternion();direction=quat@Vector((0,0,-1))
    labels=[]
    for y in range(512):
        for x in range(512):
            origin=camera.location+quat@Vector(((x+.5-256)/64,(256-y-.5)/64,0))
            hit,location,normal,face,obj,matrix=scene.ray_cast(graph,origin,direction,distance=20)
            labels.append(obj.name if hit else None)
    rows=[]
    for obj in sorted((o for o in scene.objects if o.type=='MESH'),key=lambda o:o.name):
        hits=[i for i,label in enumerate(labels) if label==obj.name];interior=[]
        for i in hits:
            y,x=divmod(i,512)
            if 1<=x<=510 and 1<=y<=510 and all(labels[(y+dy)*512+x+dx]==obj.name for dx in (-1,0,1) for dy in (-1,0,1)):interior.append(i)
        rows.append({'mesh':obj.name,'materials':[m.name for m in obj.data.materials],'rayHitPixelIndices':hits,'opaqueInsetPixelIndices':interior})
    poses.append({'yawDegrees':yaw,'elevationDegrees':40,'meshes':rows})
after=hashlib.sha256(path.read_bytes()).hexdigest();assert before==after==producer.SOURCE_SHA
out={'blenderVersion':list(bpy.app.version),'sourceSha256':after,'sourceUnchanged':True,'renderPerformed':False,'savedSourceEdited':False,
     'resolution':[512,512],'orthoScale':8,'method':'Nearest evaluated triangle ray hit at pixel center, plus3x3 same-object interior inset. Thin wheel evidence uses actual opaque ray-hit pixels, not invented inset.', 'poses':poses}
(ROOT/'docs/research/2026-10-04-cell-toilet-native-material-observer/read-only-projection.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print('TOILET_READ_ONLY_PROJECTION_SOURCE45_GRAPH8_CONTACT2_UNCHANGED',after,flush=True)
