"""Export retained wooden bench and two structural crossrails with its proven original camera."""
from pathlib import Path
import sys,json,hashlib,importlib.util,math
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[1];sys.path.insert(0,str(HERE));import pipeline_common
pipeline_common.require_blender_version()
def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
exporter=load('crossrail_shared_square','render-kitchen-fixtures-oblique.py');audit=load('crossrail_source_audit','refine-wooden-bench-crossrails.py')
ASSET_ID='furniture.corridor.bench.variants';exporter.MODELS=((ASSET_ID,'furniture.corridor.bench.angled-detail.blend','oblique-canteen-bench.v1.json',2,1,1.,1.,.44325),);exporter.PREVIEW=ROOT/'assets/intermediate/bench-crossrails-preview';PROVENANCE=audit.SOURCE.with_suffix('.provenance.json')
def prepare_source(scene,model):
 p=json.loads(PROVENANCE.read_text())
 if tuple(model[3:])!=(2,1,1.,1.,.44325):raise ValueError('Bench declared source fit/target changed')
 for name,digest in [('source','sourceSha256'),('originalSource','originalSourceSha256')]:
  if hashlib.sha256((ROOT/p[name]).read_bytes()).hexdigest()!=p[digest]:raise ValueError('Bench original/dedicated source identity changed')
 if model[1]!=Path(p['source']).name:raise ValueError('Bench producer dispatch source changed')
 registry=json.loads((ROOT/'public/game-content/oblique-module-registry.v1.json').read_text());row=next(r for r in registry['entries'] if r['assetId']==ASSET_ID)
 if row['manifest']!='/game-content/'+model[2]:raise ValueError('Bench canonical descriptor dispatch changed')
 rows=audit.capture(scene)
 if sorted(rows)!=sorted(p['allAuthoredEvaluatedHashes']):raise ValueError('Bench actual42part set changed')
 if [audit.raw_record(exporter.bpy.data.objects[n]) for n in sorted(rows)]!=p['allAuthoredRawMeshes']:raise ValueError('Bench actual raw topology/material assignment/modifiers changed')
 if {n:rows[n]['evaluatedPositionSha256'] for n in sorted(rows)}!=p['allAuthoredEvaluatedHashes']:raise ValueError('Bench actual original or rail evaluated placement changed')
 if audit.materials_record()!=p['retainedMaterialValues']:raise ValueError('Bench all nine original stored graphs changed')
 if audit.convex_normal_audit(scene)!=p['authoredEvaluatedNormals']:raise ValueError('Bench actual evaluated normals changed')
 if audit.bounds(scene)!=p['sourceEvaluatedBounds']:raise ValueError('Bench full raw source bounds changed')
 audit.actual_triangle_contacts(scene,p['actualContactTargets'])
configure_shared=exporter.configure

def configure(model):
 scene,camera,target=configure_shared(model,prepare_source);p=json.loads(PROVENANCE.read_text());bounds=audit.bounds(scene)
 for side in ('min','max'):
  if max(abs(x-y-offset) for x,y,offset in zip(bounds[side],p['sourceEvaluatedBounds'][side],(1,.5,0)))>1e-6:raise ValueError('Bench real export fit/anchor changed')
 if camera.data.type!='ORTHO' or abs(camera.data.ortho_scale-4)>1e-6 or (target-exporter.Vector((1,.5,.44325))).length>1e-6:raise ValueError('Bench proven camera/target changed')
 audit.actual_triangle_contacts(scene,p['actualContactTargets']);audit.convex_normal_audit(scene)
 for turns in range(4):
  w,h=(2,1) if turns%2==0 else(1,2)
  for row in audit.capture(scene).values():
   for point in row['points']:
    x,y=point.x-1,point.y-.5
    for _ in range(turns):x,y=-y,x
    if not(0<=x+w/2<=w and 0<=y+h/2<=h and point.z>=-1e-6):raise ValueError('Bench actual occupied quarterturn escapes')
 return scene,camera,target
exporter.configure=configure;point_shared=exporter.point_camera

def point_camera(camera,target,yaw,elevation):
 point_shared(camera,target,yaw,elevation);a=math.radians(yaw);e=math.radians(elevation);expected=exporter.Vector((6*math.cos(e)*math.sin(a),-6*math.cos(e)*math.cos(a),6*math.sin(e)));offset=camera.location-target
 if (offset-expected).length>1e-5:raise ValueError('Bench actual original camera basis changed')
 if (camera.rotation_euler.to_quaternion()@exporter.Vector((0,0,-1))).dot((-offset).normalized())<1-1e-6:raise ValueError('Bench actual camera aim changed')
exporter.point_camera=point_camera
if __name__=='__main__':
 if '--verify' in sys.argv:
  s,c,t=configure(exporter.MODELS[0])
  for yaw in exporter.YAW:
   for elevation in exporter.ELEVATION:point_camera(c,t,yaw,elevation)
  print('BENCH_CROSSRAILS42/9GRAPHS/6CONTACTS/72CAMERAS/4OCCUPIED_GREEN',flush=True)
 else:exporter.main()
