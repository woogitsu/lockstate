"""Audit immutable Prisoner source against current role-camera and historical actor-camera settings.

Run pinned Blender --python this file; -- --render-role renders eighteen diagnostic poses.
-- --render-legacy renders the same eighteen using settings recovered from 428cd89e48.
All outputs are ignored audit intermediates; canonical source/assets are never written.
"""
from pathlib import Path
import sys,json,hashlib,importlib.util,math
import bpy
from mathutils import Vector
from bpy_extras.object_utils import world_to_camera_view
r=Path(__file__).resolve().parents[2];h=r/'tooling/blender';sys.path.insert(0,str(h))
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,h/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
helper=load('guard_mesh_audit','refine-guard-belt-detail.py');pipeline=load('role_pipeline','render-role-actors-oblique.py');pipeline.pipeline_common.require_blender_version();p=r/'assets/intermediate/prisoner-scale-audit';p.mkdir(parents=True,exist_ok=True);source=r/'assets/source/blender/actor.prisoner.base.blend';original=source.read_bytes();bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;scene.frame_set(1);rows=helper.capture(scene);names=sorted(rows);points=[point for row in rows.values() for point in row['points']]
receipt={'originalSource':source.relative_to(r).as_posix(),'sourceSha256':hashlib.sha256(original).hexdigest(),'sourcePoints':[list(point) for point in points],'sourceCentroids':{name:list(sum(row['points'],Vector())/len(row['points'])) for name,row in rows.items()},'meshCount':len(rows),'rawMeshes':[helper.raw_record(bpy.data.objects[name]) for name in names],'materials':helper.materials_record(),'animationCurves':helper.animation_record(),'eightAnimationPoses':helper.pose_record(scene,names),'geometricNormalRecord':helper.normal_record(scene),'sourceBounds':helper.bounds(scene),'sourceRig':{name:{'type':bpy.data.objects[name].type,'matrixWorld':[list(row) for row in bpy.data.objects[name].matrix_world]} for name in ('SpriteRoot','SpriteTarget')},'perPartBounds':{name:{'min':[min(point[i] for point in row['points']) for i in range(3)],'max':[max(point[i] for point in row['points']) for i in range(3)]} for name,row in rows.items()}}
scene.render.engine='BLENDER_EEVEE';scene.render.resolution_x=scene.render.resolution_y=512;scene.render.resolution_percentage=100;pipeline.pipeline_common.apply_deterministic_render_settings(scene);data=bpy.data.cameras.new('CurrentActorScaleAudit');camera=bpy.data.objects.new('CurrentActorScaleAudit',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=15.5
poses=[]
for yaw in range(-180,180,15):
 for elevation in (25,45,65):
  a=math.radians(yaw)-math.pi/2;t=math.radians(elevation);camera.location=(8*math.cos(t)*math.cos(a),8*math.cos(t)*math.sin(a),8*math.sin(t));camera.rotation_euler=(math.pi/2-t,0,a+math.pi/2);bpy.context.view_layer.update();projected=[world_to_camera_view(scene,camera,point) for point in points];bbox=[min(pt.x*512 for pt in projected),min((1-pt.y)*512 for pt in projected),max(pt.x*512 for pt in projected),max((1-pt.y)*512 for pt in projected)]
  poses.append({'yawDegrees':yaw,'elevationDegrees':elevation,'orthoScale':camera.data.ortho_scale,'cameraLocation':list(camera.location),'target':list(Vector((0,0,0))),'geometricProjectedBoundsPx':bbox,'markersPx':{name:[world_to_camera_view(scene,camera,Vector(receipt['sourceCentroids'][name])).x*512,(1-world_to_camera_view(scene,camera,Vector(receipt['sourceCentroids'][name])).y)*512] for name in ('Nose','Prisoner ID patch','Back trouser pocket.-1','Back trouser pocket.1')}})
  if '--render-role' in sys.argv and yaw in (-180,-90,-45,0,45,90):
   path=p/f'original-prisoner-yaw{yaw:+03d}-elev{elevation}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);pipeline.normalize(path)
receipt['actualCameraPoses']=poses;receipt['sourceBytesUnchanged']=source.read_bytes()==original;pipeline.pipeline_common.write_text(p/'original-source-and-camera-audit.json',json.dumps(receipt,indent=2)+'\n');print('PRISONER_ORIGINAL48/8graphs/all8animationposes/actual72camera projections/18actualrenders/sourcebytesunchanged',flush=True)

if '--render-legacy' in sys.argv:
 bpy.data.objects['SpriteRoot'].scale=(.5,.5,.5)
 for obj in scene.objects:
  if obj.type=='LIGHT': obj.hide_render=True
 scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
 world=bpy.data.worlds.new('Historical actor audit studio');scene.world=world;world.use_nodes=True
 background=world.node_tree.nodes.get('Background');background.inputs['Color'].default_value=(.72,.77,.82,1);background.inputs['Strength'].default_value=.7
 light_data=bpy.data.lights.new('Historical soft north-west audit light','AREA');light_data.energy=600;light_data.shape='DISK';light_data.size=5
 light=bpy.data.objects.new('Historical soft north-west audit light',light_data);scene.collection.objects.link(light);light.location=(-3,-4,7)
 data.ortho_scale=8
 for yaw in (-180,-90,-45,0,45,90):
  for elevation in (25,45,65):
   azimuth=math.radians(yaw);pitch=math.radians(elevation)
   camera.location=(12*math.sin(azimuth),-12*math.cos(azimuth),12*math.tan(pitch));camera.rotation_euler=(Vector((0,0,0))-camera.location).to_track_quat('-Z','Y').to_euler()
   scene.render.filepath=str(p/f'historical-prisoner-yaw{yaw:+03d}-elev{elevation}.png');bpy.ops.render.render(write_still=True);pipeline.normalize(Path(scene.render.filepath))
 assert source.read_bytes()==original,'Immutable original source changed'
 print('HISTORICAL18_SOURCE_SCALE0.5_ORTHO8_MODULE_LIGHTING_TERMINAL')
