from pathlib import Path
import importlib.util,bpy
r=Path.cwd()
spec=importlib.util.spec_from_file_location('actual_shared_medical',r/'tooling/blender/render-medical-oblique.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
assert m.exporter.MODELS[0][0]=='furniture.medical-bed.variants' and m.exporter.MODELS[0][2:]==('oblique-furniture.medical-bed.v1.json',1,2,1.,1.,.675000011920929)
model=m.exporter.MODELS[1]
assert model==('fixture.medicine-cabinet.variants','fixture.medicine-cabinet.soft-light.blend','oblique-fixture.medicine-cabinet.v1.json',1,1,1.,1.,.5899999737739563)
scene,camera,target=m.exporter.configure(model)
assert Path(bpy.data.filepath)==r/'assets/source/blender/fixture.medicine-cabinet.soft-light.blend'
assert scene.render.engine=='CYCLES' and scene.cycles.samples==128 and scene.cycles.use_denoising
assert list(target)==[.5,.5,.5899999737739563] and camera.data.ortho_scale==4
for yaw in m.exporter.YAW:
 for elevation in m.exporter.ELEVATION:m.exporter.point_camera(camera,target,yaw,elevation)
print('ACTUAL_SHARED_MEDICINE_SAVED_CYCLES_CAMERA72_GREEN',flush=True)
