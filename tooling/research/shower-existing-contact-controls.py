"""Independent real shared-face/interior contacts and actual existing Shower producer sensitivity."""
from pathlib import Path
import sys,importlib.util,json,hashlib
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=load('actual_shower_controls','render-shower-head-detail-oblique.py');cot=load('actual_triangle_interiors','refine-cell-cot-detail.py');model=p.exporter.MODELS[0];source=ROOT/'assets/source/blender'/model[1]
tracked=[source,ROOT/'assets/source/blender/fixture.shower.head.blend',p.PROVENANCE,ROOT/'public/game-content/oblique-shower-head.v1.json',HERE/'render-shower-head-oblique.py',HERE/'render-shower-head-detail-oblique.py'];original={x:x.read_bytes() for x in tracked}
def open_raw():bpy.ops.wm.open_mainfile(filepath=str(source));return bpy.context.scene
scene=open_raw();stem='angled-shower-head.head outlet connecting stem';arm='Bent brushed-steel arm';coupling='Head coupling bright sleeve';interior=cot.actual_triangle_contacts(scene,{stem:[arm]})
graph=bpy.context.evaluated_depsgraph_get();triangles={};trees={}
for name in (stem,coupling):
 value=bpy.data.objects[name].evaluated_get(graph);mesh=value.to_mesh()
 try:
  mesh.calc_loop_triangles();vertices=[value.matrix_world@v.co for v in mesh.vertices];indices=[tuple(tri.vertices) for tri in mesh.loop_triangles];triangles[name]=[[vertices[i] for i in ids] for ids in indices];trees[name]=BVHTree.FromPolygons(vertices,indices,all_triangles=True)
 finally:value.to_mesh_clear()
def barycentric(point,tri):
 a,b,c=tri;v0=b-a;v1=c-a;v2=point-a;d00=v0.dot(v0);d01=v0.dot(v1);d11=v1.dot(v1);d20=v2.dot(v0);d21=v2.dot(v1);den=d00*d11-d01*d01;v=(d11*d20-d01*d21)/den;w=(d00*d21-d01*d20)/den;return [1-v-w,v,w]
point=Vector((.007,-.070,.9210000038146973));shared=[]
for name in (stem,coupling):
 position,normal,index,distance=trees[name].find_nearest(point);weights=barycentric(position,triangles[name][index]);assert distance<1e-7 and min(weights)>1e-4,'No real interior shared-face witness';shared.append({'part':name,'actualTriangle':index,'surfacePoint':list(position),'surfaceDistance':distance,'barycentricWeights':weights,'geometricNormal':list(normal)})
assert Vector(shared[0]['geometricNormal']).dot(Vector(shared[1]['geometricNormal']))<-.99999,'Butt-joint faces do not oppose'
results=[]
for name,mutate in [('actual connecting stem omitted',lambda:bpy.data.objects.remove(bpy.data.objects[stem],do_unlink=True)),('actual original arm displaced',lambda:setattr(bpy.data.objects[arm],'location',bpy.data.objects[arm].location+Vector((.03,0,0)))),('actual stem winding reversed',lambda:bpy.data.objects[stem].data.flip_normals()),('actual full original shader graph changed',lambda:setattr(bpy.data.materials['Worn galvanized fixture metal'].node_tree.nodes['Principled BSDF'].inputs['Roughness'],'default_value',.1))]:
 s=open_raw();mutate()
 try:p.prepare_source(s,model)
 except ValueError as error:results.append({'name':name,'semanticRed':str(error)})
 else:raise AssertionError('Actual existing source mutation not rejected: '+name)
span=p.exporter.ORTHO_SCALE_TILES
try:
 p.exporter.ORTHO_SCALE_TILES=4.125
 try:p.configure(model)
 except ValueError as error:results.append({'name':'actual camera span altered','semanticRed':str(error)})
 else:raise AssertionError('Actual camera span passed')
finally:p.exporter.ORTHO_SCALE_TILES=span
s,c,t=p.configure(model);old=p.point_shared
try:
 p.point_shared=lambda camera,target,yaw,elevation:setattr(camera,'location',target+Vector((6,0,0)))
 try:p.point_camera(c,t,60,40)
 except ValueError as error:results.append({'name':'actual production camera direction wrong','semanticRed':str(error)})
 else:raise AssertionError('Actual bad camera direction passed')
finally:p.point_shared=old
for x,data in original.items():assert x.read_bytes()==data,'Immutable bytes changed'
s,c,t=p.configure(model)
for yaw in p.exporter.YAW:
 for elevation in p.exporter.ELEVATION:p.point_camera(c,t,yaw,elevation)
out=ROOT/'assets/intermediate/shower-connection-audit/actual-contact-controls.json';p.pipeline_common.write_text(out,json.dumps({'actualSolidInteriorWitnesses':interior,'actualSharedButtJointTriangleInteriors':shared,'controls':results,'allTrackedBytesExact':{x.relative_to(ROOT).as_posix():hashlib.sha256(data).hexdigest() for x,data in original.items()},'finalExistingSourceCamera72Green':True,'newMissingConnectionEstablished':False,'browserStarted':False,'serverStarted':False},indent=2)+'\n');print('SHOWER_EXISTING_INTERIOR/SHARED_FACE_WITNESSES/',len(results),'REAL_RED/EXACT_BYTES_FINAL72_GREEN',flush=True)
