"""Reject hidden hardware using actual legacy-camera rasters; never save source or canonical outputs."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
s=importlib.util.spec_from_file_location('staff_hidden_hardware_visibility',HERE/'render-staff-room-desk-oblique.py');p=importlib.util.module_from_spec(s);s.loader.exec_module(p)
original=p.SOURCE.read_bytes();scene,camera=p.configure();material=bpy.data.objects['Lamp articulated arm'].data.materials[0]
bpy.ops.mesh.primitive_cylinder_add(vertices=24,radius=.014,depth=.072,location=(1-.4267256,.5-.27,1.222));obj=bpy.context.object;obj.name='Rejected prototype internal lamp joint';obj.data.materials.append(material)
scratch=ROOT/'assets/intermediate/staff-desk-connection-audit';rows=[]
for yaw in (0,60,180,300):
 p.point_camera(camera,yaw,40);path=scratch/f'candidate-internal-joint-yaw{yaw:+03d}-elev40.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);p.normalize_and_check_border(path);old=scratch/f'original-staff-desk-yaw{yaw:+03d}-elev40.png';rows.append({'yawDegrees':yaw,'elevationDegrees':40,'originalSha256':hashlib.sha256(old.read_bytes()).hexdigest(),'actualCandidateSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'byteIdentical':old.read_bytes()==path.read_bytes()})
assert p.SOURCE.read_bytes()==original;p.pipeline_common.write_text(scratch/'internal-joint-actual-visibility-rejection.json',json.dumps({'savedSourceModified':False,'canonicalExportsModified':False,'prototypePartOnlyInMemory':True,'actualBeforeAfterPoses':rows,'allFourActualRastersUnchanged':all(r['byteIdentical'] for r in rows)},indent=2)+'\n');print('STAFF_LAMP_PROTOTYPE_ACTUAL_SOURCE_VISIBILITY',json.dumps(rows),flush=True)
