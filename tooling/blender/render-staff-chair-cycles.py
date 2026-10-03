"""Staff-only genuine retained-material production72; no browser/palette changes."""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
import time
import bpy
from mathutils import Vector
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
spec = importlib.util.spec_from_file_location('staff_soft_source_preparation', HERE / 'prepare-staff-chair-cycles.py')
prepare = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare)
exporter = prepare.source.exporter
ASSET_ID = 'furniture.staff-room.padded-chair'
SOURCE_NAME = 'furniture.staff-room.padded-chair.soft-light.blend'
SOURCE_SHA = '2dde0a33689685fd067c124c82b7b88b31c606d6c950a0789903e1b0b4b0e934'
MANIFEST_NAME = 'oblique-furniture-staff-room-padded-chair.v1.json'
TARGET_Z = .6600000262260437
MODEL = (ASSET_ID, SOURCE_NAME, MANIFEST_NAME, 1, 1, 1., 1., TARGET_Z)
REPORT = ROOT / 'docs/research/2026-10-03-staff-chair-retained-cycles'
EXPECTED = json.loads((ROOT / 'assets/source/blender/furniture.staff-room.padded-chair.soft-light.provenance.json').read_text(encoding='utf-8'))


def configure(model):
    if model != MODEL or ASSET_ID != 'furniture.staff-room.padded-chair' or SOURCE_NAME != 'furniture.staff-room.padded-chair.soft-light.blend' or MANIFEST_NAME != 'oblique-furniture-staff-room-padded-chair.v1.json':
        raise ValueError('Staff Cycles dedicated producer dispatch changed')
    path = ROOT / 'assets/source/blender' / SOURCE_NAME
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    target = Vector((.5, .5, TARGET_Z))
    prepare.verify_scene(scene, scene.camera, target, EXPECTED)
    if hashlib.sha256(path.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError('Staff Cycles actual saved source SHA changed')
    for field, sha_field in [('retainedSource', 'retainedSourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / EXPECTED[field]).read_bytes()).hexdigest() != EXPECTED[sha_field]:
            raise ValueError('Staff Cycles full historical source bytes changed')
    return scene, scene.camera, target


def verify_exports():
    catalog = json.loads((ROOT / 'public/game-content' / MANIFEST_NAME).read_text())
    expected = {'assetId': ASSET_ID, 'source': 'assets/source/blender/' + SOURCE_NAME, 'sourceSha256': SOURCE_SHA,
                'resolutionPx': [256, 256], 'nominalPixelsPerTile': 64, 'pivotPx': [128, 128],
                'cameraTargetTiles': [.5, .5, TARGET_Z], 'yawDegrees': list(exporter.YAW), 'elevationDegrees': list(exporter.ELEVATION)}
    if any(catalog.get(key) != value for key, value in expected.items()):
        raise ValueError('Staff Cycles exported descriptor source/dispatch/camera changed')
    if len(catalog['frames']) != 72 or {(row['yawDegrees'], row['elevationDegrees']) for row in catalog['frames']} != {(yaw, elevation) for yaw in exporter.YAW for elevation in exporter.ELEVATION}:
        raise ValueError('Staff Cycles real72 pose coverage changed')
    for frame in catalog['frames']:
        body = (ROOT / 'public' / frame['image'].lstrip('/')).read_bytes()
        if hashlib.sha256(body).hexdigest() != frame['sha256'] or not frame['image'].endswith('.' + frame['sha256'][:12] + '.png'):
            raise ValueError('Staff Cycles PNG body/path SHA changed')
        prepare.source.validate_png(body)
    print('STAFF_CYCLES_EXPORT72_DECODED_GREEN', flush=True)
    return catalog


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    exporter.MODELS = (MODEL,)
    exporter.configure = configure
    exporter.point_camera = prepare.source.point_camera
    if '--verify' in sys.argv:
        scene, camera, target = configure(MODEL)
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:
                prepare.source.point_camera(camera, target, yaw, elevation)
        print('STAFF_CYCLES_SOURCE_54_4_3_CONTACTS_CAMERA72_GREEN', flush=True)
    elif '--verify-exports' in sys.argv:
        configure(MODEL)
        verify_exports()
    elif '--repeat-four' in sys.argv:
        catalog = verify_exports()
        scene, camera, target = configure(MODEL)
        rows = []
        for yaw in (30, 120, 210, 300):
            prepare.source.point_camera(camera, target, yaw, 40)
            path = REPORT / f'repeat-yaw{yaw}-elev40.png'
            scene.render.filepath = str(path)
            began = time.monotonic()
            bpy.ops.render.render(write_still=True)
            exporter.normalize_and_check_border(path)
            prepare.source.validate_png(path.read_bytes())
            frame = next(row for row in catalog['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (yaw, 40))
            if path.read_bytes() != (ROOT / 'public' / frame['image'].lstrip('/')).read_bytes():
                raise ValueError('Staff Cycles actual canonical repeat not byte exact')
            rows.append({'yawDegrees': yaw, 'elevationDegrees': 40, 'sha256': frame['sha256'], 'byteExact': True, 'renderSeconds': time.monotonic() - began})
        pipeline_common.write_text(REPORT / 'actual-four-repeats.json', json.dumps(rows, indent=2) + '\n')
        print('STAFF_CYCLES_FOUR_REAL_REPEATS_BYTE_EXACT_GREEN', flush=True)
    else:
        began = time.monotonic()
        exporter.main()
        catalog = verify_exports()
        pipeline_common.write_text(REPORT / 'actual-matrix.json', json.dumps({
            'genuineBlenderVersion': list(bpy.app.version), 'engine': 'CYCLES', 'device': 'CPU', 'threads': 1,
            'samples': 64, 'seed': 0, 'adaptiveSampling': False, 'denoising': False, 'viewTransform': 'AgX',
            'actualExportSeconds': time.monotonic() - began, 'realRenderCount': 72, 'sourceSha256': SOURCE_SHA,
            'descriptorSha256': hashlib.sha256((ROOT / 'public/game-content' / MANIFEST_NAME).read_bytes()).hexdigest(),
            'frames': catalog['frames'], 'groundPlaneAdded': False, 'nativeAcceptance': False,
        }, indent=2) + '\n')


if __name__ == '__main__':
    main()
