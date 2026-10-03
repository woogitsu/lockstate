"""Cot-only genuine retained-material production72; unchanged accepted consumer ID."""
from pathlib import Path
import hashlib
import json
import sys
import time
import bpy
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
import importlib.util
spec = importlib.util.spec_from_file_location('cot_soft_source_preparation', HERE / 'prepare-cell-cot-cycles.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
exporter = prepare.source
ASSET_ID = 'furniture.cell.cot.single'
SOURCE_NAME = 'furniture.cell.cot.single.soft-light.blend'
SOURCE_SHA = '1e3710b77601d6864f1de30d7b37a6220357320ae832354d3920b9fa95b17eba'
MANIFEST_NAME = 'oblique-furniture.cell-cot.v1.json'
REPORT = prepare.REPORT
EXPECTED = json.loads(prepare.PROVENANCE.read_text(encoding='utf-8'))
# Read-only actual RGBA/CRC/decoded alpha decoder already used by Staff pipeline.
png_decoder = prepare.load('cot_shared_actual_rgba_decoder', HERE / 'render-staff-room-padded-chair-oblique.py')


def configure():
    if ASSET_ID != 'furniture.cell.cot.single' or SOURCE_NAME != 'furniture.cell.cot.single.soft-light.blend' or MANIFEST_NAME != 'oblique-furniture.cell-cot.v1.json':
        raise ValueError('Cot Cycles dedicated producer dispatch changed')
    path = ROOT / 'assets/source/blender' / SOURCE_NAME
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    prepare.verify_scene(scene, scene.camera, EXPECTED)
    if hashlib.sha256(path.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError('Cot Cycles actual saved source SHA changed')
    old = json.loads((ROOT / 'assets/source/blender/furniture.cell.cot.single.angled-detail.provenance.json').read_text())
    for receipt, field, sha_field in [(EXPECTED,'retainedSource','retainedSourceSha256'),(old,'originalSource','originalSourceSha256')]:
        if hashlib.sha256((ROOT / receipt[field]).read_bytes()).hexdigest() != receipt[sha_field]:
            raise ValueError('Cot Cycles full historical source bytes changed')
    registry = json.loads((ROOT / 'public/game-content/oblique-module-registry.v1.json').read_text())
    if [row for row in registry['entries'] if row['assetId'] == ASSET_ID] != [{'assetId': ASSET_ID, 'manifest': '/game-content/' + MANIFEST_NAME}]:
        raise ValueError('Cot Cycles actual registry dispatch missing or changed')
    return scene, scene.camera


def verify_exports():
    catalog = json.loads(exporter.MANIFEST.read_text())
    expected = {'assetId': ASSET_ID, 'source': 'assets/source/blender/' + SOURCE_NAME, 'sourceSha256': SOURCE_SHA,
                'resolutionPx': [256,256], 'nominalPixelsPerTile': 64, 'pivotPx': [128,128],
                'cameraTargetTiles': [.5,1,.35], 'yawDegrees': list(exporter.YAW), 'elevationDegrees': list(exporter.ELEVATION)}
    if any(catalog.get(key) != value for key,value in expected.items()):
        raise ValueError('Cot Cycles descriptor source/dispatch/camera changed')
    if len(catalog['frames']) != 72 or {(row['yawDegrees'],row['elevationDegrees']) for row in catalog['frames']} != {(yaw,elevation) for yaw in exporter.YAW for elevation in exporter.ELEVATION}:
        raise ValueError('Cot Cycles real72 pose coverage changed')
    for frame in catalog['frames']:
        body = (ROOT / 'public' / frame['image'].lstrip('/')).read_bytes()
        if hashlib.sha256(body).hexdigest() != frame['sha256'] or not frame['image'].endswith('.'+frame['sha256'][:12]+'.png'):
            raise ValueError('Cot Cycles PNG body/path SHA changed')
        png_decoder.validate_png(body)
    print('COT_CYCLES_EXPORT72_DECODED_GREEN', flush=True)
    return catalog


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    exporter.configure = configure
    exporter.SOURCE = ROOT / 'assets/source/blender' / SOURCE_NAME
    if '--verify' in sys.argv:
        scene,camera = configure()
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:
                exporter.point_camera(camera,yaw,elevation)
                exporter.load_detail_guard().verify_camera(camera,yaw,elevation)
        print('COT_CYCLES_SOURCE25_GRAPH9_CONTACT6_CAMERA72_GREEN', flush=True)
    elif '--verify-exports' in sys.argv:
        configure()
        verify_exports()
    elif '--repeat-four' in sys.argv:
        catalog = verify_exports()
        scene,camera = configure()
        rows = []
        for yaw in (30,120,210,300):
            exporter.point_camera(camera,yaw,40)
            exporter.load_detail_guard().verify_camera(camera,yaw,40)
            path = REPORT / f'repeat-yaw{yaw}-elev40.png'
            scene.render.filepath = str(path)
            began = time.monotonic()
            bpy.ops.render.render(write_still=True)
            exporter.normalize_and_check_border(path)
            png_decoder.validate_png(path.read_bytes())
            frame = next(row for row in catalog['frames'] if (row['yawDegrees'],row['elevationDegrees']) == (yaw,40))
            if path.read_bytes() != (ROOT / 'public' / frame['image'].lstrip('/')).read_bytes():
                raise ValueError('Cot Cycles actual canonical repeat not byte exact')
            rows.append({'yawDegrees':yaw,'elevationDegrees':40,'sha256':frame['sha256'],'byteExact':True,'renderSeconds':time.monotonic()-began})
        pipeline_common.write_text(REPORT / 'actual-four-repeats.json',json.dumps(rows,indent=2)+'\n')
        print('COT_CYCLES_FOUR_REAL_REPEATS_BYTE_EXACT_GREEN', flush=True)
    else:
        if not prepare.HISTORY.exists():
            prepare.HISTORY.write_bytes(exporter.MANIFEST.read_bytes())
        began = time.monotonic()
        exporter.main()
        catalog = verify_exports()
        pipeline_common.write_text(REPORT / 'actual-matrix.json',json.dumps({
            'genuineBlenderVersion':list(bpy.app.version),'engine':'CYCLES','device':'CPU','threads':1,'samples':64,'seed':0,
            'adaptiveSampling':False,'denoising':False,'viewTransform':'AgX','actualExportSeconds':time.monotonic()-began,
            'realRenderCount':72,'sourceSha256':SOURCE_SHA,'descriptorSha256':hashlib.sha256(exporter.MANIFEST.read_bytes()).hexdigest(),
            'frames':catalog['frames'],'groundPlaneAdded':False,'nativeAcceptance':False},indent=2)+'\n')


if __name__ == '__main__':
    main()
