"""Read-only actual64-part Shower source, contact and canonical producer replay audit."""
from pathlib import Path
import sys,importlib.util,json,hashlib
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
pipeline=load('actual_shower_entrypoint','render-shower-head-oblique.py');detail=pipeline.shower_detail_exporter();audit=detail.audit;full=load('complete_stored_shader_audit','refine-cell-cot-detail.py')
scratch=ROOT/'assets/intermediate/shower-connection-audit';scratch.mkdir(parents=True,exist_ok=True)
source=ROOT/'assets/source/blender/fixture.shower.head.angled-detail.blend';original=ROOT/'assets/source/blender/fixture.shower.head.blend';manifest=ROOT/'public/game-content/oblique-shower-head.v1.json';immutable={p:p.read_bytes() for p in (source,original,manifest,detail.PROVENANCE)}
bpy.ops.wm.open_mainfile(filepath=str(original));original_scene=bpy.context.scene;old=audit.capture(original_scene);oldraw=[audit.raw_record(bpy.data.objects[n]) for n in sorted(old)];oldgraphs=full.materials_record();oldnormals=audit.convex_normal_audit(original_scene)
bpy.ops.wm.open_mainfile(filepath=str(source));s=bpy.context.scene;before=audit.capture(s);raw=[audit.raw_record(bpy.data.objects[n]) for n in sorted(before)];graphs=full.materials_record();normals=audit.convex_normal_audit(s)
if len(before)!=64 or len(old)!=43 or len(graphs)!=10 or graphs!=oldgraphs:raise ValueError('Actual original/dedicated full inventory or stored graphs differ')
if [row for row in raw if row['name'] in old]!=oldraw or any(before[n]['evaluatedPositionSha256']!=old[n]['evaluatedPositionSha256'] for n in old):raise ValueError('Actual retained original geometry changed')
partbounds={n:{'min':[min(v[i] for v in row['points']) for i in range(3)],'max':[max(v[i] for v in row['points']) for i in range(3)]} for n,row in before.items()}
# Actual evaluated surface closest-point witnesses are distinguished from volume overlaps.
graph=bpy.context.evaluated_depsgraph_get();trees={}
for name in ['angled-shower-head.head outlet connecting stem','Bent brushed-steel arm','Head coupling bright sleeve']:
 value=bpy.data.objects[name].evaluated_get(graph);mesh=value.to_mesh()
 try:trees[name]=BVHTree.FromPolygons([value.matrix_world@v.co for v in mesh.vertices],[tuple(p.vertices) for p in mesh.polygons],all_triangles=False)
 finally:value.to_mesh_clear()
contacts=[];stem='angled-shower-head.head outlet connecting stem'
for name in ['Bent brushed-steel arm','Head coupling bright sleeve']:
 lo,hi=partbounds[stem]['min'],partbounds[stem]['max'];a,b=partbounds[name]['min'],partbounds[name]['max'];candidate=Vector([(max(lo[i],a[i])+min(hi[i],b[i]))/2 for i in range(3)])
 surface,normal,index,distance=trees[name].find_nearest(candidate);on_stem,stemnormal,stemindex,stemdistance=trees[stem].find_nearest(surface)
 contacts.append({'retainedTarget':name,'sourceCandidate':list(candidate),'actualRetainedSurfacePoint':list(surface),'actualRetainedFaceIndex':index,'actualStemClosestSurfacePoint':list(on_stem),'actualStemFaceIndex':stemindex,'actualSurfaceSeparation':stemdistance,'aabbZOverlapForContextOnly':min(hi[2],b[2])-max(lo[2],a[2])})
model=detail.exporter.MODELS[0];scene,camera,target=pipeline.configure(model);poses=[]
for yaw in detail.exporter.YAW:
 for elevation in detail.exporter.ELEVATION:
  pipeline.point_camera(camera,target,yaw,elevation);path=scratch/f'actual-shower-yaw{yaw:+03d}-elev{elevation}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);detail.exporter.normalize_and_check_border(path)
  poses.append({'yawDegrees':yaw,'elevationDegrees':elevation,'replaySha256':hashlib.sha256(path.read_bytes()).hexdigest(),'cameraLocation':list(camera.location),'cameraOrthoScale':camera.data.ortho_scale,'target':list(target)})
for path,data in immutable.items():
 if path.read_bytes()!=data:raise ValueError('Immutable source/provenance/manifest bytes changed')
receipt={'sourceSha256':hashlib.sha256(immutable[source]).hexdigest(),'originalSourceSha256':hashlib.sha256(immutable[original]).hexdigest(),'canonicalDescriptorSha256':hashlib.sha256(immutable[manifest]).hexdigest(),'originalRawMeshes':oldraw,'allCurrentRawMeshes':raw,'allStoredFullMaterialGraphs':graphs,'all64EvaluatedNormals':normals,'perPartSourceBounds':partbounds,'actualExistingConnectionSurfaceWitnesses':contacts,'actualCanonical72Replay':poses,'acceptedProducer':{'engine':scene.render.engine,'resolution':[scene.render.resolution_x,scene.render.resolution_y],'orthoScale':camera.data.ortho_scale,'target':list(target),'shaderStudio':scene.display.shading.studio_light,'sourceFit':[1,1,1],'nominalPixelsPerTile':64},'sourceAndCanonicalBytesUnchanged':True,'newPhysicalModelAuthored':False,'browserStarted':False,'serverStarted':False}
pipeline.pipeline_common.write_text(scratch/'actual-source-and-replay-audit.json',json.dumps(receipt,indent=2)+'\n');print('SHOWER64/43_RETAINED/10_FULLGRAPHS/72ACTUAL_REPLAY_IMMUTABLE',flush=True)
