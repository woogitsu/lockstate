"""Retain40 authored wooden-bench parts and physically connect the isolated lower steel tie."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];sys.path.insert(0,str(HERE));import pipeline_common
pipeline_common.require_blender_version()
spec=importlib.util.spec_from_file_location('actual_bench_raw_contact_audit',HERE/'refine-cell-cot-detail.py');a=importlib.util.module_from_spec(spec);spec.loader.exec_module(a)
ORIGINAL=ROOT/'assets/source/blender/furniture.corridor.bench.blend';SOURCE=ROOT/'assets/source/blender/furniture.corridor.bench.angled-detail.blend';ORIGINAL_SHA='3c07ae8916f36090803b05e09addb26458a704a674431ba786ccddee5e78b867'
raw_record=a.raw_record;materials_record=a.materials_record;capture=a.capture;actual_triangle_contacts=a.actual_triangle_contacts;convex_normal_audit=a.convex_normal_audit

def bounds(scene):
 pts=[p for row in capture(scene).values() for p in row['points']];return {'min':[min(p[i] for p in pts) for i in range(3)],'max':[max(p[i] for p in pts) for i in range(3)]}

def build():
 original=ORIGINAL.read_bytes();assert hashlib.sha256(original).hexdigest()==ORIGINAL_SHA,'Original source identity changed'
 bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL));scene=bpy.context.scene;before=capture(scene);names=sorted(before);assert len(names)==40,'Original40part inventory changed'
 raw=[raw_record(bpy.data.objects[n]) for n in names];graphs=materials_record();assert len(graphs)==9,'All nine stored shader graphs must be retained'
 matrices={n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in names};oldnormals=convex_normal_audit(scene);oldbounds=bounds(scene);steel=bpy.data.objects['Lower steel tie'].data.materials[0];targets={}
 for i,suffix in enumerate(('-0.7','0.7')):
  front='Angled support.'+suffix+'.-0.41';back='Angled support.'+suffix+'.0.41';pts=before[front]['points'];x=(min(v.x for v in pts)+max(v.x for v in pts))/2
  bpy.ops.mesh.primitive_cube_add(size=1,location=(x,0,.24));rail=bpy.context.object;rail.name=f'physical-bench.lower transverse rail {i}';rail.dimensions=(.055,.53,.055);bpy.ops.object.transform_apply(location=False,rotation=False,scale=True);rail.data.materials.append(steel);m=rail.modifiers.new('Retained steel tie edge style','BEVEL');m.width=.003;m.segments=2;targets[rail.name]=[front,back,'Lower steel tie']
 after=capture(scene);assert len(after)==42 and len(set(after)-set(before))==2,'Two real rails required'
 assert [raw_record(bpy.data.objects[n]) for n in names]==raw and materials_record()==graphs,'Original raw/graphs changed'
 assert {n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in names}==matrices,'Original placements changed'
 assert all(after[n]['evaluatedPositionSha256']==before[n]['evaluatedPositionSha256'] for n in names),'Original evaluated vertices changed'
 assert bounds(scene)==oldbounds,'Accepted full source bounds changed'
 normals=convex_normal_audit(scene);assert [row for row in normals if row['name'] in before]==oldnormals,'Original actual normals changed'
 contacts=actual_triangle_contacts(scene,targets);assert len(contacts)==6,'Both rails must join two actual legs and original tie'
 for material in bpy.data.materials:
  if material.users==0:material.use_fake_user=True
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE));assert ORIGINAL.read_bytes()==original,'Original blend bytes changed'
 receipt={'assetId':'furniture.corridor.bench.variants','originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'retainedMeshesBefore':raw,'retainedMeshesAfter':raw,'retainedMaterialValues':graphs,'retainedObjectMatrices':matrices,'retainedEvaluatedHashes':{n:before[n]['evaluatedPositionSha256'] for n in names},'sourceEvaluatedBounds':oldbounds,'allAuthoredRawMeshes':[raw_record(bpy.data.objects[n]) for n in sorted(after)],'allAuthoredEvaluatedHashes':{n:after[n]['evaluatedPositionSha256'] for n in sorted(after)},'originalEvaluatedNormals':oldnormals,'authoredEvaluatedNormals':normals,'actualContactTargets':targets,'actualTriangleInteriorContacts':contacts,'addedMeshNames':sorted(set(after)-set(before)),'acceptedCamera':{'resolution':[256,256],'orthoScale':4,'nominalPixelsPerTile':64,'target':[1,.5,.44325],'sourceFit':[1,1,1],'footprint':[2,1]}}
 pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n');print('BENCH40_RETAINED/9_GRAPHS/42_AUTHORED/6_ACTUAL_INTERIOR_CONTACTS',receipt['sourceSha256'],flush=True)
if __name__=='__main__':build()
