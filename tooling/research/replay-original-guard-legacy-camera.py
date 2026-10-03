"""Reproduce original published Guard pixels without changing production or either source."""
from pathlib import Path
import sys,importlib.util,json,hashlib
import bpy
ROOT=Path(__file__).resolve().parents[2]
HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
spec=importlib.util.spec_from_file_location('guard_legacy_producer',HERE/'render-guard-belt-detail-oblique.py');pipeline=importlib.util.module_from_spec(spec);spec.loader.exec_module(pipeline)
source=ROOT/'assets/source/blender/actor.guard.base.blend';original=source.read_bytes()
if hashlib.sha256(original).hexdigest()!='4a900b2d61ad2c7386f48176381a08ee6f796da9d57f096b478f7ba7e42501c7':raise ValueError('Original Guard source identity changed')
bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;scene.frame_set(1)
receipt=json.loads(pipeline.PROVENANCE.read_text());rows=pipeline.audit.capture(scene)
if [pipeline.audit.raw_record(bpy.data.objects[name]) for name in sorted(rows)]!=receipt['retainedMeshesBefore']:raise ValueError('Original Guard inventory changed')
if pipeline.audit.pose_record(scene,sorted(rows))!=receipt['retainedEightAnimationPoses']:raise ValueError('Original Guard poses changed')
if pipeline.audit.materials_record()!=receipt['retainedMaterialValues']:raise ValueError('Original Guard graphs changed')
bpy.data.objects['SpriteRoot'].scale=(.5,)*3
scene.render.engine='BLENDER_EEVEE';scene.eevee.taa_render_samples=64;scene.eevee.use_raytracing=False
scene.render.resolution_x=scene.render.resolution_y=512;scene.render.resolution_percentage=100
pipeline.pipeline_common.apply_deterministic_render_settings(scene);pipeline.configure_legacy_lighting(scene)
data=bpy.data.cameras.new('HistoricalGuardCamera');camera=bpy.data.objects.new('HistoricalGuardCamera',data);scene.collection.objects.link(camera);scene.camera=camera;data.type='ORTHO';data.ortho_scale=8
output=ROOT/'assets/intermediate/guard-legacy-render-fit';output.mkdir(parents=True,exist_ok=True)
for yaw in pipeline.YAWS:
 for elevation in pipeline.ELEVATIONS:
  pipeline.point_camera(camera,yaw,elevation);path=output/f'original-replayed-yaw{yaw:+03d}-elev{elevation}.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);pipeline.retained.normalize(path)
if source.read_bytes()!=original:raise ValueError('Original Guard source changed')
print('ORIGINAL_GUARD_HISTORICAL72_RENDER_TERMINAL_SOURCE_UNCHANGED',flush=True)
