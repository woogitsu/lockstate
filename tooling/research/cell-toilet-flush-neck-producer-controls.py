"""Actual loaded geometry/saved-source/canonical dispatch controls; finally restore every tracked byte."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=load('actual_toilet_neck_controls','render-cell-toilet-flush-neck-oblique.py');source=p.audit.SOURCE;provenance=source.with_suffix('.provenance.json');canonical=HERE/'render-oblique-cell-toilet.py';manifest=ROOT/'public/game-content/oblique-cell-toilet.v1.json';catalog=json.loads(manifest.read_text());scratch=ROOT/'assets/intermediate/cell-toilet-contact-audit';scratch.mkdir(parents=True,exist_ok=True)
tracked=[source,p.audit.ORIGINAL,provenance,canonical,HERE/'render-cell-toilet-flush-neck-oblique.py',manifest]+[ROOT/'public'/row['image'].lstrip('/') for row in catalog['frames']];original={x:x.read_bytes() for x in tracked};results=[]
def open_raw():bpy.ops.wm.open_mainfile(filepath=str(source));return bpy.context.scene
def red(label,fn):
 try:fn()
 except (ValueError,AssertionError) as error:results.append({'name':label,'actualSemanticRed':str(error)})
 else:raise AssertionError('Actual producer failed to reject '+label)
def shorten():
 for v in bpy.data.objects[p.audit.NAME].data.vertices:v.co.z*=.02
 bpy.context.view_layer.update()
def graph_change():bpy.data.materials['Cell toilet warm glazed porcelain'].node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.123
try:
 for label,mutate in [
  ('loaded physical neck omitted',lambda:bpy.data.objects.remove(bpy.data.objects[p.audit.NAME],do_unlink=True)),
  ('loaded retained hinge displaced',lambda:setattr(bpy.data.objects['Seat rear hinge'],'location',bpy.data.objects['Seat rear hinge'].location+Vector((.03,0,0)))),
  ('loaded physical neck reversed winding',lambda:bpy.data.objects[p.audit.NAME].data.flip_normals()),
  ('loaded original full graph roughness altered',graph_change),
  ('loaded physical neck bevel altered',lambda:setattr(bpy.data.objects[p.audit.NAME].modifiers[0],'width',.009)),
  ('loaded physical neck shortened to lose bowl contact',shorten)]:
  scene=open_raw();mutate();red(label,lambda:p.verify_loaded(scene))
 scene=open_raw();shorten();red('independent actual triangle-solid contact rejects shortened neck',lambda:p.audit.actual_contacts(scene))
 scene=open_raw();bpy.data.objects[p.audit.NAME].data.flip_normals()
 def independent_normals():
  row=next(n for n in p.audit.normal_record(scene) if n['name']==p.audit.NAME)
  if row['inwardPolygons'] or row['minimumOutwardDistance']<=0:raise ValueError('Actual evaluated neck geometric winding is inward')
 red('independent evaluated geometric normals reject reversed neck',independent_normals)
 for label,needle,replacement in [
  ('actual canonical camera span changed','camera_data.ortho_scale = 8.0','camera_data.ortho_scale = 8.25'),
  ('actual canonical camera direction changed',"camera.rotation_euler = (TARGET - camera.location).to_track_quat('-Z', 'Y').to_euler()","camera.rotation_euler = (0, 0, 0)"),
  ('actual canonical min-corner translation changed','Matrix.Translation((.5, .5, 0))','Matrix.Translation((.49, .5, 0))')]:
  text=original[canonical].decode('utf8');assert text.count(needle)==1;p.pipeline_common.write_text(canonical,text.replace(needle,replacement));consumer=load('canonical_camera_control_'+str(len(results)),canonical.name)
  def verify_camera():
   scene=consumer.setup_scene();consumer.append_collection();consumer.point_camera(scene,105,40)
  red(label,verify_camera);canonical.write_bytes(original[canonical])
 # Persist the real shortened mesh and truthful topology/evaluated provenance.
 # Identity guards agree; only actual bowl contact rejects the invalid producer.
 scene=open_raw();shorten();receipt=json.loads(original[provenance]);rows=p.audit.capture(scene)
 receipt['allAuthoredRawMeshes']=[p.audit.raw_record(bpy.data.objects[n]) for n in sorted(rows)];receipt['allAuthoredEvaluatedHashes']={n:rows[n]['evaluatedPositionSha256'] for n in sorted(rows)};receipt['authoredEvaluatedNormals']=p.audit.normal_record(scene);receipt['meshes']=[{'name':n,'evaluatedVertices':len(rows[n]['points']),'evaluatedPositionSha256':rows[n]['evaluatedPositionSha256']} for n in sorted(rows)]
 assert p.audit.bounds(scene)==receipt['sourceEvaluatedBounds'];bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(source));receipt['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest();p.pipeline_common.write_text(provenance,json.dumps(receipt,indent=2)+'\n')
 consumer=load('canonical_saved_invalid_neck',canonical.name)
 def import_actual():
  scene=consumer.setup_scene();consumer.append_collection();return scene
 red('actual canonical truthful saved-source contact producer',import_actual)
 text=original[canonical].decode('utf8');needle='guard.verify_loaded(bpy.context.scene)';assert text.count(needle)==1;p.pipeline_common.write_text(canonical,text.replace(needle,'pass  # deliberate physical guard control'))
 bypass=load('canonical_actual_neck_guard_removed',canonical.name);scene=bypass.setup_scene();bypass.append_collection();assert len([o for o in scene.objects if o.type=='MESH'])==45
 red('independent contact remains invalid with canonical guard removed',lambda:p.audit.actual_contacts(scene))
 bypass.point_camera(scene,105,40);scene.render.filepath=str(scratch/'actual-invalid-neck-guard-removed.png');bpy.ops.render.render(write_still=True);bypass.strip_png_metadata(Path(scene.render.filepath));results.append({'name':'actual canonical contact guard dispatch removed','expectedLostRejection':True,'truthfulInvalidSavedSourceAccepted':True,'actualSavedSourceSha256':receipt['sourceSha256'],'actualInvalidSourceRendered':True})
finally:
 for x,data in original.items():
  if x.read_bytes()!=data:x.write_bytes(data)
assert all(x.read_bytes()==data for x,data in original.items()),'Tracked bytes failed restoration'
final=load('canonical_actual_neck_byte_restored',canonical.name);scene=final.setup_scene();final.append_collection()
for yaw in final.YAW:
 for elevation in final.ELEVATION:final.point_camera(scene,yaw,elevation)
p.pipeline_common.write_text(ROOT/'docs/research/2026-10-03-cell-toilet-flush-neck/actual-producer-controls.json',json.dumps({'controls':results,'realSavedSourceAndCanonicalDispatchMutation':True,'allTrackedExactRestoredHashes':{x.relative_to(ROOT).as_posix():hashlib.sha256(data).hexdigest() for x,data in original.items()},'finalCanonicalActual72CamerasGreen':True,'browserStarted':False,'serverStarted':False,'nativeAcceptanceClaimed':False},indent=2)+'\n');print('TOILET_ACTUAL_PRODUCER_CONTROLS',len(results),'EXACT_RESTORE_FINAL72_GREEN',flush=True)
