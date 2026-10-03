"""Actual loaded Guard source/export contract controls; no browser/server/source saves."""
from pathlib import Path
import importlib.util,sys,json,hashlib
import bpy
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
spec=importlib.util.spec_from_file_location('guard_export_controls',HERE/'render-guard-belt-detail-oblique.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
tracked=[p.SOURCE,ROOT/'assets/source/blender/actor.guard.base.blend',p.PROVENANCE,Path(p.__file__),p.MANIFEST]
original={path:path.read_bytes() for path in tracked};results=[]
def control(name,change,check):
 scene,camera=p.configure();change(scene,camera)
 try:check(scene,camera)
 except (ValueError,RuntimeError) as error:results.append({'name':name,'expectedRed':True,'actualReason':str(error)})
 else:raise AssertionError('Actual producer mutation unexpectedly passed: '+name)
control('wrong real export root scale',lambda s,c:setattr(bpy.data.objects['SpriteRoot'],'scale',(1,1,1)),p.verify_export_contract)
control('wrong real orthographic span',lambda s,c:setattr(c.data,'ortho_scale',15.5),p.verify_export_contract)
control('wrong actual studio world strength',lambda s,c:setattr(s.world.node_tree.nodes['Background'].inputs['Strength'],'default_value',.9),p.verify_export_contract)
control('retained source key incorrectly re-enabled',lambda s,c:setattr(next(o for o in s.objects if o.type=='LIGHT' and o.hide_render),'hide_render',False),p.verify_export_contract)
control('wrong actual studio key energy',lambda s,c:setattr(next(o for o in s.objects if o.type=='LIGHT' and not o.hide_render).data,'energy',700),p.verify_export_contract)
control('wrong actual studio color grade',lambda s,c:setattr(s.view_settings,'view_transform','AgX'),p.verify_export_contract)
oldradius=p.RADIUS
try:
 p.RADIUS=8
 control('wrong historical actual camera radius',lambda s,c:None,lambda s,c:p.point_camera(c,45,45))
finally:p.RADIUS=oldradius
oldtarget=p.TARGET
try:
 p.TARGET=Vector((.1,0,0))
 try:p.configure()
 except ValueError as e:results.append({'name':'wrong actual camera target','expectedRed':True,'actualReason':str(e)})
 else:raise AssertionError('Changed target passed')
finally:p.TARGET=oldtarget
for name,change in [('actual saved assembly band omission',lambda:bpy.data.objects.remove(bpy.data.objects[p.audit.NAME],do_unlink=True)),('actual retained material graph change',lambda:setattr(bpy.data.materials['Guard duty belt'].node_tree.nodes['Principled BSDF'].inputs['Roughness'],'default_value',.1))]:
 bpy.ops.wm.open_mainfile(filepath=str(p.SOURCE));s=bpy.context.scene;s.frame_set(1);s.render.resolution_x=s.render.resolution_y=512;d=bpy.data.cameras.new('SourceGuardProbe');c=bpy.data.objects.new('SourceGuardProbe',d);s.collection.objects.link(c);d.type='ORTHO';d.ortho_scale=8;change()
 try:p.verify_source(s,c)
 except ValueError as e:results.append({'name':name,'expectedRed':True,'actualReason':str(e)})
 else:raise AssertionError('Actual source mutation passed '+name)
# Remove exactly the real export contract consumer in memory: the identical wrong
# root-scale producer now passes configure(). This exposes dependence on that guard.
script=Path(p.__file__).read_text();bad=script.replace("bpy.data.objects['SpriteRoot'].scale=(MODEL_SCALE,)*3","bpy.data.objects['SpriteRoot'].scale=(1,)*3")
namespace={'__file__':p.__file__,'__name__':'actual_wrong_fit_producer'}
try:exec(compile(bad,p.__file__,'exec'),namespace);namespace['configure']()
except ValueError as e:results.append({'name':'real wrong-fit wrapper producer with consumer present','expectedRed':True,'actualReason':str(e)})
else:raise AssertionError('Wrong producer passed real contract')
namespace={'__file__':p.__file__,'__name__':'actual_removed_fit_consumer'}
exec(compile(bad,p.__file__,'exec'),namespace)
namespace['verify_export_contract']=lambda scene,camera:None
s,c=namespace['configure']()
if tuple(bpy.data.objects['SpriteRoot'].scale)!=(1,1,1):raise AssertionError('Consumer negative did not expose actual invalid scale')
results.append({'name':'export-contract consumer removed only; same invalid producer accepted','expectedRed':True,'actualInvalidScale':[1,1,1],'rejectionLost':True})
for path,bytes_ in original.items():
 if path.read_bytes()!=bytes_:raise AssertionError('Exact immutable source/wrapper/descriptor bytes changed: '+str(path))
s,c=p.configure()
for yaw in p.YAWS:
 for elev in p.ELEVATIONS:p.point_camera(c,yaw,elev);p.verify_export_contract(s,c)
receipt={'controls':results,'exactTrackedBytesRestored':{path.relative_to(ROOT).as_posix():hashlib.sha256(bytes_).hexdigest() for path,bytes_ in original.items()},'finalActualSourceAndExport72Green':True,'browserStarted':False,'serverStarted':False}
out=ROOT/'assets/intermediate/guard-legacy-render-fit/actual-fit-controls.json';p.pipeline_common.write_text(out,json.dumps(receipt,indent=2)+'\n');print('GUARD_ACTUAL_SOURCE/FIT_CONTROLS',len(results),'EXPECTED_RED/CONSUMER_REJECTION_LOST/EXACT_BYTES_FINAL72_GREEN',flush=True)
