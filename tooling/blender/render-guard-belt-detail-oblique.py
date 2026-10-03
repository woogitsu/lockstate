"""Export the retained guard rig with one real rear belt segment at its accepted 72 camera poses."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Vector
HERE=Path(__file__).resolve().parent
sys.path.insert(0,str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
ROOT=HERE.parents[1]
def load(name,file):
    spec=importlib.util.spec_from_file_location(name,HERE/file)
    assert spec and spec.loader
    value=importlib.util.module_from_spec(spec);spec.loader.exec_module(value);return value
audit=load('guard_structural_audit','refine-guard-belt-detail.py')
retained=load('retained_role_actor_pipeline','render-role-actors-oblique.py')
SOURCE=ROOT/'assets/source/blender/actor.guard.base.angled-detail.blend'
PROVENANCE=ROOT/'assets/source/blender/actor.guard.base.angled-detail.provenance.json'
MANIFEST=ROOT/'public/game-content/oblique-actor-guard.v1.json'
YAWS=tuple(range(-180,180,15))
ELEVATIONS=(25,45,65)
TARGET=Vector((0,0,0))
ORTHO_SCALE=8.0
MODEL_SCALE=.5
RADIUS=12.0


def verify_source(scene,camera):
    receipt=json.loads(PROVENANCE.read_text())
    for key,digest in [('source','sourceSha256'),('originalSource','originalSourceSha256')]:
        if hashlib.sha256((ROOT/receipt[key]).read_bytes()).hexdigest()!=receipt[digest]:raise ValueError('Guard original/dedicated source identity changed')
    if SOURCE.relative_to(ROOT).as_posix()!=receipt['source']:raise ValueError('Guard exporter dispatch loads wrong source')
    registry=json.loads((ROOT/'public/game-content/oblique-module-registry.v1.json').read_text())
    entry=next(row for row in registry['entries'] if row['assetId']=='actor.guard.base')
    if entry['manifest']!='/game-content/'+MANIFEST.name:raise ValueError('Guard targets wrong canonical descriptor')
    rows=audit.capture(scene)
    if sorted(rows)!=sorted(row['name'] for row in receipt['allAuthoredRawMeshes']):raise ValueError('Guard original or authored mesh set changed')
    audit.actual_triangle_contacts(scene,receipt['actualContactTargets'])
    if [audit.raw_record(bpy.data.objects[name]) for name in sorted(rows)]!=receipt['allAuthoredRawMeshes']:raise ValueError('Guard actual raw geometry/material assignment/modifiers changed')
    names=[row['name'] for row in receipt['retainedMeshesAfter']]
    if audit.pose_record(scene,names)!=receipt['retainedEightAnimationPoses']:raise ValueError('Guard retained evaluated eight poses or parents changed')
    if audit.pose_record(scene,sorted(rows))!=receipt['authoredEightAnimationPoses']:raise ValueError('Guard actual authored assembly or eight-pose placement changed')
    if audit.materials_record()!=receipt['retainedMaterialValues']:raise ValueError('Guard eleven complete stored shader graphs changed')
    if audit.animation_record()!=receipt['retainedAnimations']:raise ValueError('Guard original action keyframes changed')
    if audit.normal_record(scene)!=receipt['evaluatedGeometricNormalAudit']:raise ValueError('Guard actual evaluated topology/winding changed')
    if audit.bounds(scene)!=receipt['sourceEvaluatedBounds']:raise ValueError('Guard accepted full bounds changed')
    if camera.data.type!='ORTHO' or abs(camera.data.ortho_scale-ORTHO_SCALE)>1e-6:raise ValueError('Guard accepted actual camera span changed')
    if TARGET.length>1e-6 or scene.render.resolution_x!=512 or scene.render.resolution_y!=512:raise ValueError('Guard target/resolution changed')
    if bpy.data.objects.get('SpriteRoot') is None or bpy.data.objects.get('SpriteTarget') is None:raise ValueError('Guard existing rig contract missing')
    for image in bpy.data.images:
        if image.source=='FILE' and image.packed_file is None:raise ValueError('Guard texture is unpacked')


def configure_legacy_lighting(scene):
    """Retain exact historical 428cd89e48 Guard/Prisoner studio; not the role-source studio."""
    for obj in scene.objects:
        if obj.type=='LIGHT':obj.hide_render=True
    scene.view_settings.view_transform='Standard';scene.view_settings.look='Medium High Contrast'
    world=bpy.data.worlds.new('neutral oblique studio');scene.world=world;world.use_nodes=True
    background=world.node_tree.nodes.get('Background');background.inputs['Color'].default_value=(.72,.77,.82,1);background.inputs['Strength'].default_value=.7
    data=bpy.data.lights.new('soft north-west light','AREA');data.energy=600;data.shape='DISK';data.size=5
    light=bpy.data.objects.new('soft north-west light',data);scene.collection.objects.link(light);light.location=(-3,-4,7)


def verify_export_contract(scene,camera):
    if tuple(bpy.data.objects['SpriteRoot'].scale)!=(.5,.5,.5):raise ValueError('Guard historical SpriteRoot export scale changed')
    if camera.data.type!='ORTHO' or abs(camera.data.ortho_scale-8)>1e-6:raise ValueError('Guard historical export camera span changed')
    receipt=json.loads(PROVENANCE.read_text());bounds=audit.bounds(scene)
    for side in ('min','max'):
        if max(abs(a-.5*b) for a,b in zip(bounds[side],receipt['sourceEvaluatedBounds'][side]))>1e-6:raise ValueError('Guard historical evaluated export bounds changed')
    audit.actual_triangle_contacts(scene,receipt['actualContactTargets'])
    if scene.view_settings.view_transform!='Standard' or scene.view_settings.look!='Medium High Contrast':raise ValueError('Guard historical studio color grade changed')
    bg=scene.world.node_tree.nodes.get('Background')
    if max(abs(a-b) for a,b in zip(bg.inputs['Color'].default_value,(.72,.77,.82,1)))>1e-6 or abs(bg.inputs['Strength'].default_value-.7)>1e-6:raise ValueError('Guard historical studio world changed')
    lights=[obj for obj in scene.objects if obj.type=='LIGHT' and not obj.hide_render]
    if len(lights)!=1:raise ValueError('Guard historical source lighting not disabled')
    light=lights[0]
    if light.data.type!='AREA' or light.data.shape!='DISK' or abs(light.data.energy-600)>1e-6 or abs(light.data.size-5)>1e-6 or (light.location-Vector((-3,-4,7))).length>1e-6:raise ValueError('Guard historical studio key changed')
    if TARGET.length>1e-6 or (scene.render.resolution_x,scene.render.resolution_y)!=(512,512):raise ValueError('Guard historical target/resolution changed')


def configure():
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE));scene=bpy.context.scene;scene.frame_set(1)
    scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=64;scene.eevee.use_raytracing=False
    scene.render.resolution_x=scene.render.resolution_y=512;scene.render.resolution_percentage=100
    pipeline_common.apply_deterministic_render_settings(scene)
    data=bpy.data.cameras.new('ObliqueActorCamera');camera=bpy.data.objects.new('ObliqueActorCamera',data);scene.collection.objects.link(camera)
    scene.camera=camera;data.type='ORTHO';data.ortho_scale=ORTHO_SCALE
    # Raw source/action/geometry audit occurs before the historical export-only root transform.
    verify_source(scene,camera)
    bpy.data.objects['SpriteRoot'].scale=(MODEL_SCALE,)*3;bpy.context.view_layer.update()
    configure_legacy_lighting(scene);verify_export_contract(scene,camera)
    return scene,camera


def point_camera(camera,yaw,elevation):
    azimuth=math.radians(yaw);tilt=math.radians(elevation)
    camera.location=TARGET+Vector((RADIUS*math.sin(azimuth),-RADIUS*math.cos(azimuth),RADIUS*math.tan(tilt)))
    camera.rotation_euler=(TARGET-camera.location).to_track_quat('-Z','Y').to_euler()
    expected=Vector((12*math.sin(azimuth),-12*math.cos(azimuth),12*math.tan(tilt)))
    offset=camera.location-TARGET
    if (offset-expected).length>1e-5:raise ValueError('Guard historical actual camera front-axis/radius changed')
    if (camera.rotation_euler.to_quaternion()@Vector((0,0,-1))).dot((-offset).normalized())<1-1e-6:raise ValueError('Guard actual camera aim changed')


def main():
    scene,camera=configure()
    if '--verify' in sys.argv:
        for yaw in YAWS:
            for elevation in ELEVATIONS:point_camera(camera,yaw,elevation);verify_export_contract(scene,camera)
        print('GUARD_BELT_DETAIL_VERIFY72 actual cameras/69mesh/all11graphs/eight original animation poses',flush=True);return
    preview='--preview' in sys.argv
    output=ROOT/('assets/intermediate/actor-source-audit' if preview else 'public/assets/environment/oblique');output.mkdir(parents=True,exist_ok=True)
    frames=[]
    for yaw,elevation in ([(yaw,45) for yaw in (0,45,90,180)] if preview else [(yaw,elevation) for yaw in YAWS for elevation in ELEVATIONS]):
        point_camera(camera,yaw,elevation);verify_export_contract(scene,camera);path=output/f'guard-detail-yaw{yaw:+03d}-elev{elevation}.render.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);retained.normalize(path)
        digest=hashlib.sha256(path.read_bytes()).hexdigest();name=f'actor-guard-yaw{yaw:+03d}-elev{elevation}'+('.png' if preview else f'.{digest[:12]}.png');image=output/name;path.replace(image)
        frames.append({'yawDegrees':yaw,'elevationDegrees':elevation,'image':'/assets/environment/oblique/'+name,'sha256':digest})
    if not preview:
        manifest={'schemaVersion':1,'assetId':'actor.guard.base','source':SOURCE.name,'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            'resolutionPx':[512,512],'nominalPixelsPerTile':64,'pivotPx':[256,256],'cameraTargetTiles':[0,0,0],
            'projection':'orthographic','yawDegrees':list(YAWS),'elevationDegrees':list(ELEVATIONS),'frames':frames}
        pipeline_common.write_text(MANIFEST,json.dumps(manifest,indent=2)+'\n')
    print('GUARD_BELT_DETAIL_RENDER',len(frames),'preview' if preview else MANIFEST,flush=True)


if __name__=='__main__':main()
