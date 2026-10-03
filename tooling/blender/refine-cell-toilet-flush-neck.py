"""Retain the complete44-part toilet and model its missing rear ceramic transfer neck."""
from pathlib import Path
import sys,json,hashlib,importlib.util,math
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];sys.path.insert(0,str(HERE));import pipeline_common
pipeline_common.require_blender_version()
spec=importlib.util.spec_from_file_location('toilet_complete_preservation',HERE/'refine-guard-belt-detail.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
ORIGINAL=ROOT/'assets/source/blender/fixture.cell.toilet_sink.angled.blend'
SOURCE=ROOT/'assets/source/blender/fixture.cell.toilet_sink.angled-connection.blend'
ORIGINAL_SHA='335544282e27ff01608f7f10987c054012d38ec3905340c24c142b7b794b1b2a'
NAME='physical-toilet.rear ceramic flush neck'
TARGETS={NAME:['Cistern teal ceramic band','Sculpted ceramic bowl']}
raw_record=a.raw_record;materials_record=a.materials_record;capture=a.capture;normal_record=a.normal_record;bounds=a.bounds

def actual_contacts(scene):
 """Find positive-depth points inside BOTH actual evaluated triangle solids; boxes only seed candidates."""
 bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();trees={};boxes={}
 for name in [NAME]+TARGETS[NAME]:
  obj=bpy.data.objects[name];value=obj.evaluated_get(graph);mesh=value.to_mesh()
  try:
   pts=[value.matrix_world@v.co for v in mesh.vertices];mesh.calc_loop_triangles()
   trees[name]=BVHTree.FromPolygons(pts,[tuple(t.vertices) for t in mesh.loop_triangles],all_triangles=True)
   boxes[name]=([min(v[i] for v in pts) for i in range(3)],[max(v[i] for v in pts) for i in range(3)])
  finally:value.to_mesh_clear()
 def inside(name,point):
  direction=Vector((.937,.223,.181)).normalized();origin=point.copy();count=0
  for _ in range(200):
   hit,_,_,_=trees[name].ray_cast(origin,direction,100)
   if hit is None:return count%2==1
   count+=1;origin=hit+direction*1e-6
  raise ValueError('Flush neck contact ray failed to terminate')
 rows=[]
 for target in TARGETS[NAME]:
  lo=[max(boxes[NAME][0][i],boxes[target][0][i]) for i in range(3)];hi=[min(boxes[NAME][1][i],boxes[target][1][i]) for i in range(3)];witness=None
  if min(hi[i]-lo[i] for i in range(3))<=1e-5:raise ValueError('Flush neck lacks actual connection: '+target)
  # An independent fixed grid avoids assuming the bowl is a filled cuboid.
  for ix in range(1,10):
   for iy in range(1,10):
    for iz in range(1,10):
     p=Vector([lo[i]+(hi[i]-lo[i])*n/10 for i,n in enumerate((ix,iy,iz))])
     if inside(NAME,p) and inside(target,p):
      margins=[trees[n].find_nearest(p)[3] for n in (NAME,target)]
      if min(margins)>1e-4:witness=(p,margins);break
    if witness:break
   if witness:break
  if witness is None:raise ValueError('Flush neck lacks triangle-interior connection: '+target)
  p,margins=witness;rows.append({'addedPart':NAME,'retainedTarget':target,'actualInteriorWitness':list(p),'distanceToActualSurfaces':margins})
 return rows

def build():
 original=ORIGINAL.read_bytes();assert hashlib.sha256(original).hexdigest()==ORIGINAL_SHA,'Existing complete toilet source changed'
 bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL));scene=bpy.context.scene;before=capture(scene);names=sorted(before)
 assert len(names)==44,'Retain all44 current parts'
 raw=[raw_record(bpy.data.objects[n]) for n in names];graphs=materials_record();assert len(graphs)==8,'Retain all8 stored graphs'
 matrices={n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in names};oldnormals=normal_record(scene);oldbounds=bounds(scene);actions=a.animation_record()
 # The existing hinge supports the cistern/seat assembly. It is not a flush
 # passage: the cistern band and bowl are separated by actual Y planes.
 bandmax=max(v.y for v in before['Cistern teal ceramic band']['points']);bowlmin=min(v.y for v in before['Sculpted ceramic bowl']['points']);assert bowlmin-bandmax>0
 bpy.ops.mesh.primitive_cylinder_add(vertices=32,radius=.07,depth=.23,location=(0,-.225,.555),rotation=(math.pi/2,0,0))
 obj=bpy.context.object;obj.name=NAME;obj.data.materials.append(bpy.data.materials['Cell toilet warm glazed porcelain'])
 modifier=obj.modifiers.new('Rounded glazed transfer neck edges','BEVEL');modifier.width=.004;modifier.segments=3
 after=capture(scene);assert len(after)==45 and sorted(set(after)-set(before))==[NAME]
 assert [raw_record(bpy.data.objects[n]) for n in names]==raw,'Current raw meshes/modifiers/material indices changed'
 assert materials_record()==graphs and a.animation_record()==actions,'Stored graphs/actions changed'
 assert {n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in names}==matrices,'Current matrices changed'
 assert all(before[n]['evaluatedPositionSha256']==after[n]['evaluatedPositionSha256'] for n in names),'Current evaluated meshes changed'
 assert bounds(scene)==oldbounds,'Existing full source bounds changed'
 normals=normal_record(scene);assert [n for n in normals if n['name'] in before]==oldnormals,'Retained evaluated normals changed'
 added=next(n for n in normals if n['name']==NAME);assert added['inwardPolygons']==0 and not added['degenerateIndices'] and added['minimumOutwardDistance']>0,'New actual convex topology invalid'
 contacts=actual_contacts(scene)
 for material in bpy.data.materials:
  if material.users==0:material.use_fake_user=True
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE));assert ORIGINAL.read_bytes()==original
 receipt={'assetId':'fixture.cell.toilet_sink','originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'retainedMeshesBefore':raw,'retainedMeshesAfter':raw,'retainedMaterialValues':graphs,'retainedObjectMatrices':matrices,'retainedEvaluatedHashes':{n:before[n]['evaluatedPositionSha256'] for n in names},'retainedActions':actions,'sourceEvaluatedBounds':oldbounds,'originalEvaluatedNormals':oldnormals,'authoredEvaluatedNormals':normals,'allAuthoredRawMeshes':[raw_record(bpy.data.objects[n]) for n in sorted(after)],'allAuthoredEvaluatedHashes':{n:after[n]['evaluatedPositionSha256'] for n in sorted(after)},'addedMeshNames':[NAME],'actualContactTargets':TARGETS,'actualTriangleInteriorContacts':contacts,'originalCisternBandToBowlSeparatingYPlanes':{'bandMaximumY':bandmax,'bowlMinimumY':bowlmin,'gapTiles':bowlmin-bandmax},'acceptedCamera':{'resolution':[512,512],'orthoScale':8,'nominalPixelsPerTile':64,'target':[.5,.5,.553750041872263],'sourceFit':[1,1,1],'footprint':[1,1]}}
 prior=json.loads(ORIGINAL.with_suffix('.provenance.json').read_text())
 receipt.update({'retainedMeshes':prior['retainedMeshes'],'retainedMaterialGraphs':prior['retainedMaterialGraphs'],'minimum':oldbounds['min'],'maximum':oldbounds['max'],'meshes':[{'name':n,'evaluatedVertices':len(after[n]['points']),'evaluatedPositionSha256':after[n]['evaluatedPositionSha256']} for n in sorted(after)]})
 pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n');print('TOILET44_RETAINED/8GRAPHS/45AUTHORED/2ACTUAL_CONTACTS',receipt['sourceSha256'],json.dumps(contacts),flush=True)
if __name__=='__main__':build()
