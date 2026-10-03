"""Read actual unrefined Staff Room49-part source and replay its accepted camera without canonical writes."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
def load(name,file):
 s=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(s);s.loader.exec_module(m);return m
p=load('actual_staff_desk_original_camera','render-staff-room-desk-oblique.py');a=load('actual_staff_desk_original_full_audit','refine-guard-belt-detail.py');scratch=ROOT/'assets/intermediate/staff-desk-connection-audit';scratch.mkdir(parents=True,exist_ok=True)
source=p.SOURCE;original=source.read_bytes();bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;raw=a.capture(scene)
receipt={'source':source.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(original).hexdigest(),'allRawMeshes':[a.raw_record(bpy.data.objects[n]) for n in sorted(raw)],'allFullStoredMaterialGraphs':a.materials_record(),'allObjectMatrices':{n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in sorted(raw)},'allEvaluatedHashes':{n:raw[n]['evaluatedPositionSha256'] for n in sorted(raw)},'allEvaluatedNormalAudit':a.normal_record(scene),'actualRawSourceBounds':a.bounds(scene),'allPartBounds':{n:{'min':[min(v[i] for v in row['points']) for i in range(3)],'max':[max(v[i] for v in row['points']) for i in range(3)]} for n,row in raw.items()},'storedActions':a.animation_record(),'originalSourceReplays':[]}
scene,camera=p.configure();receipt['acceptedCamera']={'resolution':[scene.render.resolution_x,scene.render.resolution_y],'orthoScale':camera.data.ortho_scale,'target':list(p.TARGET),'engine':scene.render.engine,'sourceNominalPixelsPerTile':scene.render.resolution_x/camera.data.ortho_scale,'yawDegrees':list(p.YAW),'elevationDegrees':list(p.ELEVATION)}
for yaw in (0,60,180,300):
 p.point_camera(camera,yaw,40);q=scratch/f'original-staff-desk-yaw{yaw:+03d}-elev40.png';scene.render.filepath=str(q);bpy.ops.render.render(write_still=True);p.normalize_and_check_border(q);receipt['originalSourceReplays'].append({'yawDegrees':yaw,'elevationDegrees':40,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()})
assert source.read_bytes()==original;p.pipeline_common.write_text(scratch/'actual-original-inventory-and-source-poses.json',json.dumps(receipt,indent=2)+'\n');print('STAFF_DESK_ACTUAL_INVENTORY',len(raw),len(receipt['allFullStoredMaterialGraphs']),'ORIGINAL4POSES_SOURCEUNCHANGED',flush=True)
