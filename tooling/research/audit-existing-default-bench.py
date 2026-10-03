"""Read-only actual existing default wooden bench model inventory and canonical producer replay."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
p=load('existing_wooden_bench_producer','render-wooden-bench-oblique.py');p.exporter.MODELS=(('furniture.corridor.bench.variants','furniture.corridor.bench.blend','oblique-canteen-bench.v1.json',2,1,1.,1.,.44325),);a=load('actual_all_stored_parts','refine-guard-belt-detail.py');source=ROOT/'assets/source/blender'/p.exporter.MODELS[0][1];original=source.read_bytes();scene,camera,target=p.configure(p.exporter.MODELS[0]);rows=a.capture(scene);points=[v for row in rows.values() for v in row['points']];bounds={n:{'min':[min(v[i] for v in row['points']) for i in range(3)],'max':[max(v[i] for v in row['points']) for i in range(3)]} for n,row in rows.items()};scratch=ROOT/'assets/intermediate/bench-contact-audit';scratch.mkdir(parents=True,exist_ok=True)
receipt={'sourceSha256':hashlib.sha256(original).hexdigest(),'allRawMeshes':[a.raw_record(bpy.data.objects[n]) for n in sorted(rows)],'allStoredGraphs':a.materials_record(),'allEvaluatedNormals':a.normal_record(scene),'allPartBounds':bounds,'sourceBounds':a.bounds(scene),'acceptedCamera':{'resolution':p.exporter.RESOLUTION_PX,'ortho':camera.data.ortho_scale,'target':list(target),'engine':scene.render.engine},'canonicalReplays':[]}
for yaw in p.exporter.YAW:
 for elevation in p.exporter.ELEVATION:
  p.point_camera(camera,target,yaw,elevation);q=scratch/f'original-bench-yaw{yaw:+03d}-elev{elevation}.png';scene.render.filepath=str(q);bpy.ops.render.render(write_still=True);p.exporter.normalize_and_check_border(q);receipt['canonicalReplays'].append({'yawDegrees':yaw,'elevationDegrees':elevation,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()})
assert source.read_bytes()==original;p.exporter.pipeline_common.write_text(scratch/'actual-original-inventory.json',json.dumps(receipt,indent=2)+'\n');print('ACTUAL_EXISTING_BENCH_PARTS',len(rows),'GRAPHS',len(receipt['allStoredGraphs']),'CANONICAL72_REPLAY_SOURCEUNCHANGED',flush=True)
