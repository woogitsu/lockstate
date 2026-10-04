from pathlib import Path
import runpy,sys,bpy
r=Path.cwd()
sys.argv=['render-medicine-cabinet-detail-oblique.py','--','--verify']
try:runpy.run_path(str(r/'tooling/blender/render-medicine-cabinet-detail-oblique.py'),run_name='__main__')
except SystemExit as e:
 if e.code not in (None,0):raise
s=bpy.context.scene
assert Path(bpy.data.filepath)==r/'assets/source/blender/fixture.medicine-cabinet.soft-light.blend' and s.render.engine=='CYCLES','Actual canonical Medicine entry did not select saved Cycles'
assert s.cycles.samples==128 and s.cycles.use_denoising and sum(o.type=='MESH' for o in s.objects)==71
print('ACTUAL_CANONICAL_MEDICINE_SAVED_CYCLES_GREEN',flush=True)
