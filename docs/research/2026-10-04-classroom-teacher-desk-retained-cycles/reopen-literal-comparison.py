from pathlib import Path
import importlib.util,json,bpy
spec=importlib.util.spec_from_file_location('actual_teacher_preparation',Path.cwd()/'tooling/blender/prepare-classroom-teacher-desk-cycles.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
r=json.loads(p.PROVENANCE.read_text());bpy.ops.wm.open_mainfile(filepath=str(p.ROOT/r['literalGraphSource']));scene=bpy.context.scene
expected={**r['physicalAssembly'],'completeStoredMaterialGraphs':r['literalStoredGraphs']}
if p.physical(scene)!=expected or p.lighting(scene)!=r['lightingProfile']:raise ValueError('Actual literal saved-source assembly/graphs/lighting differs')
r['literalFrames']=[p.render(scene,scene.camera,yaw,'literal-grey-soft-original-graphs') for yaw in p.POSES]
r['literalAfterRenderedFromActualSavedSource']=True
p.pipeline_common.write_text(p.PROVENANCE,json.dumps(r,indent=2)+'\n');p.pipeline_common.write_text(p.REPORT/'actual-before-after.json',json.dumps(r,indent=2)+'\n')
print('ACTUAL_LITERAL_SAVED_TEACHER_GRAPH_TWO_POSES_GREEN',flush=True)
