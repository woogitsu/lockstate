"""Read-only actual existing buildable Yard model inventory and canonical producer replay."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
p=load('existing_yard_producer','render-yard-exercise-station-oblique.py');a=load('actual_all_stored_parts','refine-guard-belt-detail.py');source=p.SOURCE;original=source.read_bytes();scene,camera=p.configure();rows=a.capture(scene);points=[v for row in rows.values() for v in row['points']];bounds={n:{'min':[min(v[i] for v in row['points']) for i in range(3)],'max':[max(v[i] for v in row['points']) for i in range(3)]} for n,row in rows.items()};scratch=ROOT/'assets/intermediate/exercise-contact-audit';scratch.mkdir(parents=True,exist_ok=True)
receipt={'sourceSha256':hashlib.sha256(original).hexdigest(),'allRawMeshes':[a.raw_record(bpy.data.objects[n]) for n in sorted(rows)],'allStoredGraphs':a.materials_record(),'allEvaluatedNormals':a.normal_record(scene),'allPartBounds':bounds,'sourceBounds':a.bounds(scene),'acceptedCamera':{'resolution':p.RESOLUTION_PX,'ortho':camera.data.ortho_scale,'target':list(p.TARGET),'engine':scene.render.engine},'canonicalReplays':[]}
for yaw in p.YAW:
 for elevation in p.ELEVATION:
  p.point_camera(camera,yaw,elevation);q=scratch/f'original-exercise-yaw{yaw:+03d}-elev{elevation}.png';scene.render.filepath=str(q);bpy.ops.render.render(write_still=True);p.normalize_and_check_border(q);receipt['canonicalReplays'].append({'yawDegrees':yaw,'elevationDegrees':elevation,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()})
assert source.read_bytes()==original;p.pipeline_common.write_text(scratch/'actual-original-inventory.json',json.dumps(receipt,indent=2)+'\n');print('ACTUAL_EXISTING_EXERCISE_PARTS',len(rows),'GRAPHS',len(receipt['allStoredGraphs']),'CANONICAL72_REPLAY_SOURCEUNCHANGED',flush=True)
