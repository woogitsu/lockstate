"""Existing full square-wall ID: retained approved-material Cycles production."""
from pathlib import Path
import importlib.util
import json
import sys
import time
import bpy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
spec = importlib.util.spec_from_file_location('approved_square_wall_materials', HERE / 'render-square-wall-approved-material-draft.py')
variant = importlib.util.module_from_spec(spec)
spec.loader.exec_module(variant)
study = variant.study
ASSET_ID = 'wall.square.brick.full'
SOURCE = ROOT / 'assets/source/blender/wall.square.brick.full.soft-light.blend'
SOURCE_SHA = '53c35a0013a93ed662983a2888031c8377ba1965981e3ef98757e20547bd9cd8'
MANIFEST = ROOT / 'public/game-content/oblique-square-brick-full-wall.v1.json'
REPORT = study.REPORT
RECEIPT = json.loads((REPORT / 'actual-approved-material-variant.json').read_text(encoding='utf-8'))
OUTPUT = ROOT / 'public/assets/environment/oblique'


def configure():
    if ASSET_ID != RECEIPT['assetId'] or SOURCE.name != 'wall.square.brick.full.soft-light.blend':
        raise ValueError('Full wall retained-material producer dispatch changed')
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    # Saved source already occupies[0,1]. Applying the historical translation
    # again would corrupt the real whole-tile camera and physical guard.
    variant.verify(scene, RECEIPT)
    if study.digest(SOURCE) != SOURCE_SHA:
        raise ValueError('Full wall retained-material source hash changed')
    print('ACTUAL_FULL_WALL_SOURCE59_MATERIAL9_CONTACT58_DISPATCH_GREEN', flush=True)
    return scene, scene.camera


def verify_exports():
    configure()
    manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
    if manifest['assetId'] != ASSET_ID or manifest['source'] != SOURCE.name or manifest['sourceSha256'] != SOURCE_SHA:
        raise ValueError('Full wall descriptor selected old or incorrect source')
    if (manifest['resolutionPx'], manifest['nominalPixelsPerTile'], manifest['pivotPx'], manifest['cameraTargetTiles']) != ([512, 512], 64, [256, 256], [.5, .5, 0]):
        raise ValueError('Full wall descriptor camera/whole footprint changed')
    if manifest['yawDegrees'] != study.producer.YAWS or manifest['elevationDegrees'] != study.producer.ELEVATIONS or len(manifest['frames']) != 72:
        raise ValueError('Full wall canonical72 grid incomplete')
    pairs = set()
    for frame in manifest['frames']:
        path = ROOT / 'public' / frame['image'].lstrip('/')
        study.producer.normalize(path)
        if study.digest(path) != frame['sha256'] or frame['sha256'][:12] not in path.name:
            raise ValueError('Full wall PNG body/source filename hashes inconsistent')
        pairs.add((frame['yawDegrees'], frame['elevationDegrees']))
    if pairs != {(yaw, elevation) for yaw in study.producer.YAWS for elevation in study.producer.ELEVATIONS}:
        raise ValueError('Full wall canonical pose dispatch incomplete')
    print('ACTUAL_FULL_WALL72_DESCRIPTOR_RGBA_BORDER_HASH_GREEN', flush=True)


def render_frame(scene, camera, yaw, elevation, repeat=False):
    study.producer.pose_camera(camera, yaw, elevation)
    path = (REPORT if repeat else OUTPUT) / f'square-brick-full-wall-yaw{yaw:+04d}-elev{elevation}.render.png'
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    study.producer.normalize(path)
    digest = study.digest(path)
    if repeat:
        target = REPORT / f'production-repeat-yaw{yaw:+d}-elev{elevation}.png'
    else:
        target = OUTPUT / f'square-brick-full-wall-yaw{yaw:+04d}-elev{elevation}.{digest[:12]}.png'
    path.replace(target)
    return {'yawDegrees': yaw, 'elevationDegrees': elevation,
            'image': ('/assets/environment/oblique/' + target.name) if not repeat else target.relative_to(ROOT).as_posix(), 'sha256': digest}


def render_full():
    scene, camera = configure()
    began = time.monotonic()
    frames = [render_frame(scene, camera, yaw, elevation) for yaw in study.producer.YAWS for elevation in study.producer.ELEVATIONS]
    manifest = {'schemaVersion': 1, 'assetId': ASSET_ID, 'source': SOURCE.name, 'sourceSha256': SOURCE_SHA,
                'sourceDependencies': [{'source': 'wall.square.brick.full.blend', 'sha256': study.SOURCE_SHA}],
                'resolutionPx': [512, 512], 'nominalPixelsPerTile': 64, 'pivotPx': [256, 256],
                'cameraTargetTiles': [.5, .5, 0], 'projection': 'orthographic',
                'yawDegrees': study.producer.YAWS, 'elevationDegrees': study.producer.ELEVATIONS, 'frames': frames}
    pipeline_common.write_text(MANIFEST, json.dumps(manifest, indent=2) + '\n')
    pipeline_common.write_text(REPORT / 'actual-production-matrix.json', json.dumps({
        'assetId': ASSET_ID, 'realRenderCount': 72, 'frames': frames, 'sourceSha256': SOURCE_SHA,
        'genuineBlenderVersion': list(bpy.app.version), 'threads': 1, 'samples': 64,
        'renderSeconds': time.monotonic() - began, 'nativeAcceptance': False}, indent=2) + '\n')
    verify_exports()
    print('ACTUAL_FULL_WALL_APPROVED_MATERIAL72_COMPLETE', flush=True)


def main():
    if '--mutate-saved-source' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
        bpy.data.objects['cap stone 0.0'].location.z += 1
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
        print('ACTUAL_FULL_WALL_CAP_MUTANT_SAVED', flush=True)
    elif '--verify-only' in sys.argv:
        configure()
    elif '--verify-exports' in sys.argv:
        verify_exports()
    elif '--repeat-four' in sys.argv:
        scene, camera = configure()
        manifest = json.loads(MANIFEST.read_text(encoding='utf-8'))
        began = time.monotonic()
        frames = []
        for yaw in (-135, -45, 45, 135):
            row = render_frame(scene, camera, yaw, 45, repeat=True)
            expected = next(frame for frame in manifest['frames'] if frame['yawDegrees'] == yaw and frame['elevationDegrees'] == 45)
            if row['sha256'] != expected['sha256']:
                raise ValueError('Actual independently reopened wall render differs from canonical matrix')
            row['byteExact'] = True
            frames.append(row)
        pipeline_common.write_text(REPORT / 'actual-production-four-repeats.json', json.dumps({
            'frames': frames, 'renderSeconds': time.monotonic() - began, 'threads': 1, 'nativeAcceptance': False}, indent=2) + '\n')
        print('ACTUAL_FULL_WALL_FOUR_REPEATS_BYTE_EXACT', flush=True)
    else:
        render_full()


if __name__ == '__main__':
    main()
