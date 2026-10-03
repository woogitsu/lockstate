from pathlib import Path
import sys,importlib.util,json,hashlib,time
import bpy
root=Path.cwd();here=root/'tooling/blender';sys.path.insert(0,str(here))
import pipeline_common
pipeline_common.require_blender_version()
spec=importlib.util.spec_from_file_location('kitchen_soft_study',here/'prepare-kitchen-stove-cycles.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
draft=root/'assets/source/blender/furniture.kitchen.stove.soft-light-draft64.blend'
if hashlib.sha256(draft.read_bytes()).hexdigest() != '22feab9bafafbed9bdee8a716f7e32803cd71dd2b2d4cc3c56bb3aa2ae15145d':raise ValueError('Kitchen actual64 draft source changed')
bpy.ops.wm.open_mainfile(filepath=str(draft));scene=bpy.context.scene
expected=json.loads(draft.with_suffix('.provenance.json').read_text())
if p.physical(scene)!=expected['physicalAssembly']:raise ValueError('Kitchen sample study changed actual geometry/materials/contacts')
denoised='--denoised' in sys.argv
scene.cycles.samples=128 if denoised else 512
scene.cycles.use_denoising=denoised
if denoised:
 scene.cycles.denoiser='OPENIMAGEDENOISE';scene.cycles.denoising_use_gpu=False
label='128samples-denoised' if denoised else '512samples'
rows=[]
for yaw in (60,300):
 p.source.point_camera(scene.camera,p.source.TARGET,yaw,40)
 path=p.REPORT/f'after-soft-original-materials-{label}-yaw{yaw}-elev40.png';scene.render.filepath=str(path);t=time.monotonic();bpy.ops.render.render(write_still=True);p.source.normalize_and_check_border(path)
 rows.append({'yaw':yaw,'samples':scene.cycles.samples,'denoising':denoised,'seconds':time.monotonic()-t,'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
pipeline_common.write_text(p.REPORT/('actual-bounded-sample128-denoised-comparison.json' if denoised else 'actual-bounded-sample512-comparison.json'),json.dumps(rows,indent=2)+'\n')
