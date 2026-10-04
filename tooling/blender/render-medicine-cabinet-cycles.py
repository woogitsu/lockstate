"""Dedicated actual saved Medicine cabinet Cycles72 producer and canonical target."""
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
spec = importlib.util.spec_from_file_location('medicine_soft_saved_preparation', HERE / 'prepare-medicine-cabinet-cycles.py')
prepare = importlib.util.module_from_spec(spec); spec.loader.exec_module(prepare)
source = prepare.source
exporter = source.exporter
MANIFEST = prepare.MANIFEST
TARGET = prepare.TARGET
ASSET_ID = 'fixture.medicine-cabinet.variants'
SOURCE_NAME = 'fixture.medicine-cabinet.soft-light.blend'
SOURCE_SHA = '1bb3821056d58d39dc51de6788689ad780e3bed59c20a5f3625714f2480e9732'
MANIFEST_NAME = 'oblique-fixture.medicine-cabinet.v1.json'
REPORT = prepare.REPORT
EXPECTED = json.loads(prepare.PROVENANCE.read_text())
png_decoder = prepare.load('medicine_actual_rgba_decoder', HERE / 'render-staff-room-padded-chair-oblique.py')

def configure():
    if ASSET_ID != 'fixture.medicine-cabinet.variants' or SOURCE_NAME != 'fixture.medicine-cabinet.soft-light.blend' or MANIFEST_NAME != 'oblique-fixture.medicine-cabinet.v1.json':
        raise ValueError('Medicine cabinet dedicated Cycles producer dispatch changed')
    path = ROOT / 'assets/source/blender' / SOURCE_NAME
    bpy.ops.wm.open_mainfile(filepath=str(path)); scene = bpy.context.scene
    prepare.verify_scene(scene, scene.camera, EXPECTED)
    if hashlib.sha256(path.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError('Medicine cabinet Cycles actual saved source SHA changed')
    legacy = json.loads((ROOT / 'assets/source/blender/fixture.medicine-cabinet.angled-detail.provenance.json').read_text())
    for receipt, field, digest in ((EXPECTED, 'retainedSource', 'retainedSourceSha256'), (legacy, 'originalSource', 'originalSourceSha256')):
        if hashlib.sha256((ROOT / receipt[field]).read_bytes()).hexdigest() != receipt[digest]:
            raise ValueError('Medicine cabinet immutable historical source changed')
    registry = json.loads((ROOT / 'public/game-content/oblique-module-registry.v1.json').read_text())
    if [row for row in registry['entries'] if row['assetId'] == ASSET_ID] != [{'assetId': ASSET_ID, 'manifest': '/game-content/' + MANIFEST_NAME}]:
        raise ValueError('Medicine cabinet current registry dispatch changed')
    return scene, scene.camera

def verify_exports():
    catalog = json.loads(MANIFEST.read_text())
    expected = {'assetId': ASSET_ID, 'source': 'assets/source/blender/' + SOURCE_NAME, 'sourceSha256': SOURCE_SHA,
                'resolutionPx': [256, 256], 'nominalPixelsPerTile': 64, 'pivotPx': [128, 128],
                'cameraTargetTiles': [.5, .5, .5899999737739563], 'yawDegrees': list(exporter.YAW), 'elevationDegrees': list(exporter.ELEVATION)}
    if any(catalog.get(key) != value for key, value in expected.items()):
        raise ValueError('Medicine cabinet current descriptor source/camera/dispatch changed')
    if len(catalog['frames']) != 72 or {(row['yawDegrees'], row['elevationDegrees']) for row in catalog['frames']} != {(y, e) for y in exporter.YAW for e in exporter.ELEVATION}:
        raise ValueError('Medicine cabinet current real72 pose coverage changed')
    for frame in catalog['frames']:
        body = (ROOT / 'public' / frame['image'].lstrip('/')).read_bytes()
        if hashlib.sha256(body).hexdigest() != frame['sha256'] or not frame['image'].endswith('.' + frame['sha256'][:12] + '.png'):
            raise ValueError('Medicine cabinet current PNG SHA/body/path changed')
        png_decoder.validate_png(body)
    print('MEDICINE_CABINET_CYCLES_EXPORT72_DECODED_GREEN', flush=True)
    return catalog

def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    exporter.configure = lambda model: (*configure(), TARGET)
    exporter.MODELS = ((ASSET_ID, SOURCE_NAME, MANIFEST_NAME, 1, 1, 1.0, 1.0, .5899999737739563),)
    if '--verify-selected' in sys.argv:
        scene, camera, target = exporter.configure(exporter.MODELS[0])
        prepare.verify_scene(scene, camera, EXPECTED)
        if list(target) != list(TARGET): raise ValueError('Medicine cabinet selected producer camera target changed')
        print('MEDICINE_CABINET_ACTUAL_SELECTED_CALLBACK_GREEN', flush=True)
    elif '--verify' in sys.argv:
        scene, camera = configure()
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION: source.point_camera(camera, TARGET, yaw, elevation)
        print('MEDICINE_CABINET_CYCLES_SOURCE71_GRAPH3_CONTACT18_CAMERA72_GREEN', flush=True)
    elif '--verify-exports' in sys.argv:
        configure(); verify_exports()
    elif '--repeat-four' in sys.argv:
        catalog = verify_exports(); scene, camera = configure(); rows = []
        for yaw in (30, 120, 210, 300):
            source.point_camera(camera, TARGET, yaw, 40)
            path = REPORT / f'repeat-yaw{yaw}-elev40.png'; scene.render.filepath = str(path)
            began = time.monotonic(); bpy.ops.render.render(write_still=True)
            exporter.normalize_and_check_border(path); png_decoder.validate_png(path.read_bytes())
            frame = next(row for row in catalog['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (yaw, 40))
            if path.read_bytes() != (ROOT / 'public' / frame['image'].lstrip('/')).read_bytes():
                raise ValueError('Medicine cabinet actual repeat differs from current canonical body')
            rows.append({'yawDegrees': yaw, 'elevationDegrees': 40, 'sha256': frame['sha256'], 'byteExact': True, 'renderSeconds': time.monotonic() - began})
        pipeline_common.write_text(REPORT / 'actual-four-repeats.json', json.dumps(rows, indent=2) + '\n')
        print('MEDICINE_CABINET_FOUR_ACTUAL_REPEATS_BYTE_EXACT_GREEN', flush=True)
    else:
        if not prepare.HISTORY.exists(): prepare.HISTORY.write_bytes(MANIFEST.read_bytes())
        began = time.monotonic(); exporter.main(); catalog = verify_exports()
        pipeline_common.write_text(REPORT / 'actual-matrix.json', json.dumps({
            'genuineBlenderVersion': list(bpy.app.version), 'engine': 'CYCLES', 'device': 'CPU', 'threads': 1,
            'samples': 128, 'seed': 0, 'adaptiveSampling': False, 'denoising': True, 'denoiser': 'OPENIMAGEDENOISE',
            'denoisingUseGpu': False, 'viewTransform': 'AgX', 'realRenderCount': 72, 'actualExportSeconds': time.monotonic() - began,
            'sourceSha256': SOURCE_SHA, 'descriptorSha256': hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
            'frames': catalog['frames'], 'groundPlaneAdded': False, 'nativeAcceptance': False}, indent=2) + '\n')

if __name__ == '__main__': main()
