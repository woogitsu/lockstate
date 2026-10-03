"""Exercise real loaded Bench geometry and saved-source canonical dispatch, restoring exact bytes."""
from pathlib import Path
import sys,importlib.util,json,hashlib
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))

def load(name,file):
 spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=load('actual_crossrail_controls','render-wooden-bench-crossrails-oblique.py');model=p.exporter.MODELS[0];source=p.audit.SOURCE;canonical=HERE/'render-wooden-bench-oblique.py';manifest=ROOT/'public/game-content/oblique-canteen-bench.v1.json';catalog=json.loads(manifest.read_text())
tracked=[source,p.audit.ORIGINAL,p.PROVENANCE,canonical,HERE/'render-wooden-bench-crossrails-oblique.py',manifest]+[ROOT/'public'/row['image'].lstrip('/') for row in catalog['frames']];original={x:x.read_bytes() for x in tracked};results=[];rail='physical-bench.lower transverse rail 0';targets=json.loads(p.PROVENANCE.read_text())['actualContactTargets'];scratch=ROOT/'assets/intermediate/bench-contact-audit';scratch.mkdir(parents=True,exist_ok=True)

def open_raw():bpy.ops.wm.open_mainfile(filepath=str(source));return bpy.context.scene

def red(label,fn):
 try:fn()
 except (ValueError,AssertionError) as error:results.append({'name':label,'actualSemanticRed':str(error)})
 else:raise AssertionError('Actual producer did not reject '+label)

def shorten():
 for vertex in bpy.data.objects[rail].data.vertices:vertex.co.y*=.4
 bpy.context.view_layer.update()

def graph_change():
 material=bpy.data.objects['Lower steel tie'].data.materials[0];material.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value=.123

try:
 for label,mutate in [
  ('loaded real new rail omitted',lambda:bpy.data.objects.remove(bpy.data.objects[rail],do_unlink=True)),
  ('loaded original leg displaced',lambda:setattr(bpy.data.objects['Angled support.-0.7.-0.41'],'location',bpy.data.objects['Angled support.-0.7.-0.41'].location+Vector((.03,0,0)))),
  ('loaded new rail reversed winding',lambda:bpy.data.objects[rail].data.flip_normals()),
  ('loaded full original shader graph altered',graph_change),
  ('loaded new rail bevel altered',lambda:setattr(bpy.data.objects[rail].modifiers[0],'width',.009)),
  ('loaded new rail structural contact shortened',shorten)]:
  scene=open_raw();mutate();red(label,lambda:p.prepare_source(scene,model))
 scene=open_raw();shorten();red('independent evaluated triangle-interior rejects shortened rail',lambda:p.audit.actual_triangle_contacts(scene,targets))
 scene=open_raw();bpy.data.objects[rail].data.flip_normals();red('independent evaluated world geometric normals reject reversed rail',lambda:p.audit.convex_normal_audit(scene))
 span=p.exporter.ORTHO_SCALE_TILES
 try:
  p.exporter.ORTHO_SCALE_TILES=4.125;red('actual camera span changed',lambda:p.configure(model))
 finally:p.exporter.ORTHO_SCALE_TILES=span
 red('actual declared footprint scale changed',lambda:p.configure(tuple(list(model[:5])+[.95]+list(model[6:]))))
 scene,camera,target=p.configure(model);old=p.point_shared
 try:
  p.point_shared=lambda c,t,y,e:setattr(c,'location',t+Vector((6,0,0)));red('actual camera direction changed',lambda:p.point_camera(camera,target,60,40))
 finally:p.point_shared=old
 # Persist a physically invalid shortened rail and its truthful raw/evaluated provenance.
 # Hash and declared topology now agree: only the real contact check can reject it.
 scene=open_raw();shorten();receipt=json.loads(original[p.PROVENANCE]);rows=p.audit.capture(scene)
 receipt['allAuthoredRawMeshes']=[p.audit.raw_record(bpy.data.objects[n]) for n in sorted(rows)]
 receipt['allAuthoredEvaluatedHashes']={n:rows[n]['evaluatedPositionSha256'] for n in sorted(rows)}
 receipt['authoredEvaluatedNormals']=p.audit.convex_normal_audit(scene)
 assert p.audit.bounds(scene)==receipt['sourceEvaluatedBounds']
 bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(source));receipt['sourceSha256']=hashlib.sha256(source.read_bytes()).hexdigest();p.pipeline_common.write_text(p.PROVENANCE,json.dumps(receipt,indent=2)+'\n')
 consumer=load('canonical_contact_intact',canonical.name);red('actual canonical saved-source contact producer',lambda:consumer.configure(consumer.exporter.MODELS[0]))
 text=original[canonical].decode('utf-8');needle='return bench_crossrail_exporter().configure(model)';assert text.count(needle)==1
 p.pipeline_common.write_text(canonical,text.replace(needle,'return configure_shared(model)'))
 bypass=load('canonical_actual_dispatch_removed',canonical.name);scene,camera,target=bypass.configure(bypass.exporter.MODELS[0]);assert len([o for o in scene.objects if o.type=='MESH'])==42
 red('independent contacts still invalid after real canonical dispatch removal',lambda:p.audit.actual_triangle_contacts(scene,targets))
 bypass.point_camera(camera,target,60,40);scene.render.filepath=str(scratch/'actual-invalid-contact-dispatch-consumer-removed.png');bpy.ops.render.render(write_still=True);bypass.exporter.normalize_and_check_border(Path(scene.render.filepath))
 results.append({'name':'actual canonical physical dispatch removed','expectedLostRejection':True,'invalidSavedSourceAccepted':True,'actualSavedSourceSha256':receipt['sourceSha256'],'actualInvalidSourceRendered':True})
finally:
 for x,data in original.items():
  if x.read_bytes()!=data:x.write_bytes(data)
assert all(x.read_bytes()==data for x,data in original.items()),'Tracked bytes failed exact restoration'
final=load('actual_canonical_exact_restored',canonical.name);scene,camera,target=final.configure(final.exporter.MODELS[0])
for yaw in final.exporter.YAW:
 for elevation in final.exporter.ELEVATION:final.point_camera(camera,target,yaw,elevation)
out=ROOT/'docs/research/2026-10-03-wooden-bench-lower-tie-connections/actual-producer-controls.json';p.pipeline_common.write_text(out,json.dumps({'controls':results,'realSavedSourceAndCanonicalDispatchMutation':True,'allTrackedExactRestoredHashes':{x.relative_to(ROOT).as_posix():hashlib.sha256(data).hexdigest() for x,data in original.items()},'finalCanonicalActual72CamerasGreen':True,'browserStarted':False,'serverStarted':False,'nativeAcceptanceClaimed':False},indent=2)+'\n');print('BENCH_ACTUAL_PRODUCER_CONTROLS',len(results),'EXACT_RESTORE_FINAL72_GREEN',flush=True)
