from pathlib import Path
import runpy,sys,bpy
r=Path.cwd()
sys.argv=['render-medical-bed-detail-oblique.py','--','--verify']
try:runpy.run_path(str(r/'tooling/blender/render-medical-bed-detail-oblique.py'),run_name='__main__')
except SystemExit as e:
 if e.code not in (None,0):raise
s=bpy.context.scene
assert Path(bpy.data.filepath)==r/'assets/source/blender/furniture.medical-bed.soft-light.blend' and s.render.engine=='CYCLES','Actual canonical Medical bed entry did not select saved Cycles'
assert s.cycles.samples==128 and s.cycles.use_denoising and sum(o.type=='MESH' for o in s.objects)==89
print('ACTUAL_CANONICAL_MEDICAL_BED_SAVED_CYCLES_GREEN',flush=True)
