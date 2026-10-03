"""Replay actual original/new toilet geometry through the identical legacy producer studio."""
from pathlib import Path
import sys,json,hashlib,importlib.util
import bpy
ROOT=Path(__file__).resolve().parents[2];HERE=ROOT/'tooling/blender';sys.path.insert(0,str(HERE))
spec=importlib.util.spec_from_file_location('unchanged_toilet_studio',HERE/'render-oblique-cell-toilet.py');p=importlib.util.module_from_spec(spec);spec.loader.exec_module(p)
scratch=ROOT/'assets/intermediate/cell-toilet-contact-audit';scratch.mkdir(parents=True,exist_ok=True)
if '--original72' in sys.argv:
 p.SOURCE=ROOT/'assets/source/blender/fixture.cell.toilet_sink.angled.blend';p.PROVENANCE=p.SOURCE.with_suffix('.provenance.json');p.OUTPUT=scratch/'original72';scene=p.setup_scene();p.append_collection();frames=p.render_frames(scene)
 original=json.loads((scratch/'original-canonical-manifest.json').read_text());pairs=[]
 for f in frames:
  old=next(v for v in original['frames'] if v['yawDegrees']==f['yawDegrees'] and v['elevationDegrees']==f['elevationDegrees']);assert f['sha256']==old['sha256'],'Original actual canonical producer replay differs';pairs.append({'yawDegrees':f['yawDegrees'],'elevationDegrees':f['elevationDegrees'],'canonicalSha256':old['sha256'],'actualOriginalReplaySha256':f['sha256']})
 p.pipeline_common.write_text(scratch/'original72-canonical-byte-replay.json',json.dumps({'cameraTarget':list(p.TARGET),'originalSourceSha256':original['sourceSha256'],'actualByteExactFrames':pairs},indent=2)+'\n');print('TOILET_ORIGINAL72_CANONICAL_BYTES_EXACT',flush=True)
else:
 rows=[]
 for label,file in [('original','fixture.cell.toilet_sink.angled.blend'),('connected','fixture.cell.toilet_sink.angled-connection.blend')]:
  p.SOURCE=ROOT/'assets/source/blender'/file;p.PROVENANCE=p.SOURCE.with_suffix('.provenance.json');scene=p.setup_scene();p.append_collection()
  for yaw in (45,105,-75,-135):
   p.point_camera(scene,yaw,40);path=scratch/f'{label}-cell-toilet-yaw{yaw:+03d}-elev40.png';scene.render.filepath=str(path);bpy.ops.render.render(write_still=True);p.strip_png_metadata(path);rows.append({'variant':label,'yawDegrees':yaw,'elevationDegrees':40,'sourceSha256':hashlib.sha256(p.SOURCE.read_bytes()).hexdigest(),'image':path.name,'imageSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
 p.pipeline_common.write_text(scratch/'actual-source-comparison.json',json.dumps(rows,indent=2)+'\n');print('TOILET44_VS45_ORIGINALSTUDIO_8RENDERS',flush=True)
