"""Inventory the saved upholstered bench and replay its real standalone producer."""
from pathlib import Path
import sys, json, hashlib, importlib.util
import bpy
ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'tooling/blender'
sys.path.insert(0, str(HERE))
def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module); return module
p = load('original_common_room_bench_producer', 'render-common-room-bench-oblique.py')
a = load('common_room_full_raw_audit', 'refine-guard-belt-detail.py')
scratch = ROOT / 'assets/intermediate/common-room-arm-support-audit'
scratch.mkdir(parents=True, exist_ok=True)
source = ROOT / 'assets/source/blender/furniture.common-room.upholstered-bench.blend'
original = source.read_bytes()
bpy.ops.wm.open_mainfile(filepath=str(source)); scene = bpy.context.scene; rows = a.capture(scene)
receipt = {'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(original).hexdigest(),
    'allRawMeshes': [a.raw_record(bpy.data.objects[n]) for n in sorted(rows)],
    'allStoredGraphs': a.materials_record(), 'allObjectMatrices': {n:[list(row) for row in bpy.data.objects[n].matrix_world] for n in sorted(rows)},
    'allEvaluatedHashes': {n:rows[n]['evaluatedPositionSha256'] for n in sorted(rows)}, 'allEvaluatedNormals': a.normal_record(scene),
    'sourceEvaluatedBounds': a.bounds(scene), 'storedActions': a.animation_record(),
    'allPartBounds': {n:{'min':[min(v[i] for v in row['points']) for i in range(3)],'max':[max(v[i] for v in row['points']) for i in range(3)]} for n,row in rows.items()}, 'actualOriginal72Replay': []}
# Replay the retained historical camera against its original source, before the
# dedicated-source production guard. The canonical original manifest is retained
# separately once the detailed model replaces the player's existing descriptor.
p.SOURCE = source
p.verify_source = lambda scene: None
scene, camera = p.configure()
receipt['acceptedCamera'] = {'resolution':[256,256], 'orthoScale':camera.data.ortho_scale, 'target':list(p.TARGET),
    'engine':scene.render.engine, 'light':scene.display.shading.light, 'studioLight':scene.display.shading.studio_light,
    'viewTransform':scene.view_settings.view_transform, 'look':scene.view_settings.look, 'exposure':scene.view_settings.exposure,
    'gamma':scene.view_settings.gamma, 'nominalPixelsPerTile':64, 'sourceFit':[1,1,1], 'footprint':[2,1]}
historical = ROOT / 'docs/research/2026-10-03-common-room-bench-front-arm-supports/original-canonical-manifest.json'
manifest = json.loads((historical if historical.is_file() else p.MANIFEST).read_text())
for frame in manifest['frames']:
    yaw = frame['yawDegrees']; elevation = frame['elevationDegrees']; p.point_camera(camera, yaw, elevation)
    path = scratch / f'original-yaw{yaw:+03d}-elev{elevation}.png'
    scene.render.filepath = str(path); bpy.ops.render.render(write_still=True); p.normalize_and_check_border(path)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    receipt['actualOriginal72Replay'].append({'yawDegrees':yaw,'elevationDegrees':elevation,'sha256':digest,'canonicalSha256':frame['sha256'],'byteEqual':digest==frame['sha256']})
assert all(row['byteEqual'] for row in receipt['actualOriginal72Replay']), 'Original canonical camera/studio is not reproduced'
assert source.read_bytes() == original
p.pipeline_common.write_text(scratch / 'actual-original-inventory-and72-replay.json', json.dumps(receipt,indent=2)+'\n')
print('COMMON_ROOM_ORIGINAL',len(rows),len(receipt['allStoredGraphs']),'72_CANONICAL_BYTE_EQUAL',receipt['sourceSha256'],flush=True)
