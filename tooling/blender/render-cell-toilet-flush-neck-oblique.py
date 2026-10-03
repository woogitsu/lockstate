"""Guard the physical transfer neck, then reuse the unchanged proven Cell toilet producer."""
from pathlib import Path
import sys,json,hashlib,importlib.util
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];sys.path.insert(0,str(HERE));import pipeline_common
pipeline_common.require_blender_version()
def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
audit=load('toilet_transfer_source_audit','refine-cell-toilet-flush-neck.py')
def verify_loaded(scene):
 p=json.loads(audit.SOURCE.with_suffix('.provenance.json').read_text())
 if p['originalSourceSha256']!=audit.ORIGINAL_SHA or p['originalSource']!=audit.ORIGINAL.relative_to(ROOT).as_posix():raise ValueError('Toilet current44-part original identity changed')
 for path,digest in [('source','sourceSha256'),('originalSource','originalSourceSha256')]:
  if hashlib.sha256((ROOT/p[path]).read_bytes()).hexdigest()!=p[digest]:raise ValueError('Toilet transfer original/dedicated source identity changed')
 rows=audit.capture(scene)
 if len(rows)!=45 or sorted(rows)!=sorted(p['allAuthoredEvaluatedHashes']) or p['addedMeshNames']!=[audit.NAME]:raise ValueError('Toilet transfer requires retained44 parts and one physical neck')
 if [audit.raw_record(audit.bpy.data.objects[n]) for n in sorted(rows)]!=p['allAuthoredRawMeshes']:raise ValueError('Toilet transfer actual raw geometry/modifiers/materials changed')
 retained=sorted(p['retainedEvaluatedHashes'])
 if len(retained)!=44 or [audit.raw_record(audit.bpy.data.objects[n]) for n in retained]!=p['retainedMeshesBefore']:raise ValueError('Toilet all44 retained raw parts changed')
 if any(rows[n]['evaluatedPositionSha256']!=p['retainedEvaluatedHashes'][n] for n in retained):raise ValueError('Toilet all44 retained evaluated placements changed')
 if {n:[list(row) for row in audit.bpy.data.objects[n].matrix_world] for n in retained}!=p['retainedObjectMatrices']:raise ValueError('Toilet all44 retained source matrices changed')
 if {n:rows[n]['evaluatedPositionSha256'] for n in sorted(rows)}!=p['allAuthoredEvaluatedHashes']:raise ValueError('Toilet transfer actual evaluated placements changed')
 if audit.materials_record()!=p['retainedMaterialValues']:raise ValueError('Toilet transfer full stored graphs changed')
 if audit.a.animation_record()!=p['retainedActions']:raise ValueError('Toilet retained actions changed')
 if audit.bounds(scene)!=p['sourceEvaluatedBounds']:raise ValueError('Toilet transfer full accepted source bounds changed')
 normals=audit.normal_record(scene);new=next(n for n in normals if n['name']==audit.NAME)
 if new['inwardPolygons'] or new['degenerateIndices'] or new['minimumOutwardDistance']<=0:raise ValueError('Toilet transfer actual geometric topology invalid')
 if normals!=p['authoredEvaluatedNormals']:raise ValueError('Toilet retained or new evaluated normals changed')
 audit.actual_contacts(scene)
 if p['acceptedCamera']!={'resolution':[512,512],'orthoScale':8,'nominalPixelsPerTile':64,'target':[.5,.5,.553750041872263],'sourceFit':[1,1,1],'footprint':[1,1]}:raise ValueError('Toilet proven camera/fit changed')
 print('TOILET_TRANSFER45/8GRAPHS/2TRIANGLE_INTERIOR_CONTACTS',flush=True)
if __name__=='__main__':
 exporter=load('toilet_transfer_original_studio','render-oblique-cell-toilet.py');exporter.main()
