"""Inventory the full current Cell toilet and replay its original producer without canonical writes."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
def load(name,file):
 spec=importlib.util.spec_from_file_location(name,HERE/file);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
p=load('original_cell_toilet_pipeline','render-oblique-cell-toilet.py');a=load('full_cell_toilet_inventory','refine-guard-belt-detail.py');scratch=ROOT/'assets/intermediate/cell-toilet-contact-audit';scratch.mkdir(parents=True,exist_ok=True)
p.SOURCE=ROOT/'assets/source/blender/fixture.cell.toilet_sink.angled.blend';p.PROVENANCE=p.SOURCE.with_suffix('.provenance.json');source=p.SOURCE;original=source.read_bytes();bpy.ops.wm.open_mainfile(filepath=str(source));scene=bpy.context.scene;raw=a.capture(scene);graphs=a.materials_record();normals=a.normal_record(scene)
receipt={'source':source.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(original).hexdigest(),'allRawMeshes':[a.raw_record(bpy.data.objects[n]) for n in sorted(raw)],'allFullStoredMaterialGraphs':graphs,'allObjectMatrices':{n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in sorted(raw)},'allEvaluatedHashes':{n:raw[n]['evaluatedPositionSha256'] for n in sorted(raw)},'allEvaluatedNormalAudit':normals,'actualRawSourceBounds':a.bounds(scene),'allPartBounds':{n:{'min':[min(v[i] for v in row['points']) for i in range(3)],'max':[max(v[i] for v in row['points']) for i in range(3)]} for n,row in raw.items()},'originalSourceReplays':[]}
scene=p.setup_scene();p.append_collection();receipt['acceptedCamera']={'resolution':[scene.render.resolution_x,scene.render.resolution_y],'orthoScale':scene.camera.data.ortho_scale,'target':list(p.TARGET),'engine':scene.render.engine,'sourceNominalPixelsPerTile':scene.render.resolution_x/scene.camera.data.ortho_scale,'yawDegrees':list(p.YAW),'elevationDegrees':list(p.ELEVATION)}
for yaw in (45,105,-75,-135):
 p.point_camera(scene,yaw,40);q=scratch/f'original-cell-toilet-yaw{yaw:+03d}-elev40.png';scene.render.filepath=str(q);bpy.ops.render.render(write_still=True);p.strip_png_metadata(q);receipt['originalSourceReplays'].append({'yawDegrees':yaw,'elevationDegrees':40,'sha256':hashlib.sha256(q.read_bytes()).hexdigest()})
assert source.read_bytes()==original;p.pipeline_common.write_text(scratch/'actual-original-inventory-and-source-poses.json',json.dumps(receipt,indent=2)+'\n');print('CELL_TOILET_ACTUAL_INVENTORY',len(raw),len(graphs),'ORIGINAL4POSES_SOURCEUNCHANGED',flush=True)
