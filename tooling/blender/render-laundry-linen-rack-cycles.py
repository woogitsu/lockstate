"""Laundry-only production export of the inspected retained-material saved scene.

The accepted asset ID/descriptor URL and all geometry remain unchanged. No
global renderer profile, room palette, ground plane or gameplay is introduced.
"""
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

spec = importlib.util.spec_from_file_location('laundry_cycles_retained_draft', HERE / 'render-modern-retained-material-draft.py')
draft = importlib.util.module_from_spec(spec)
spec.loader.exec_module(draft)
exporter = draft.source.exporter
ASSET_ID = 'furniture.laundry.linen-rack'
SOURCE_NAME = 'furniture.laundry.linen-rack.soft-light.blend'
SOURCE_SHA = '2916717c4dd17d7be39a5725858b2356e53181cb735f2faeb28963d0adafa299'
MANIFEST_NAME = 'oblique-furniture-laundry-linen-rack.v1.json'
TARGET_Z = .7039999961853027
MODEL = (ASSET_ID, SOURCE_NAME, MANIFEST_NAME, 1, 1, 1., 1., TARGET_Z)
REPORT = ROOT / 'docs/research/2026-10-03-laundry-retained-cycles-production'
EXPECTED = json.loads((draft.REPORT / 'actual-before-after.json').read_text(encoding='utf-8'))['physicalAssembly']


def verify_profile(scene, camera, target):
    draft.verify_presentation(scene, camera, target, EXPECTED)
    actual = (scene.cycles.samples, scene.cycles.seed, scene.cycles.use_animated_seed,
              scene.cycles.use_adaptive_sampling, scene.cycles.use_denoising,
              scene.cycles.max_bounces, scene.cycles.diffuse_bounces, scene.cycles.glossy_bounces,
              scene.render.threads_mode, scene.view_settings.view_transform, scene.view_settings.look,
              scene.view_settings.exposure, scene.view_settings.gamma, scene.render.dither_intensity,
              scene.render.image_settings.file_format, scene.render.image_settings.color_mode,
              scene.render.image_settings.color_depth, scene.render.image_settings.compression)
    if actual != (64, 0, False, False, False, 8, 4, 4, 'FIXED', 'AgX', 'None', 0, 1, 0, 'PNG', 'RGBA', '8', 15):
        raise ValueError('Laundry Cycles literal deterministic presentation profile changed')
    background = scene.world.node_tree.nodes['Background']
    if tuple(background.inputs['Color'].default_value) != tuple(Vector((.8, .8, .8, 1))) or background.inputs['Strength'].default_value != .25:
        raise ValueError('Laundry Cycles original neutral indirect world changed')
    lights = (
        ('Modern draft soft warm key', (-3, -4, 6), 450, 4, (1, .94, .85)),
        ('Modern draft soft neutral fill', (4, -1, 3), 180, 5, (1, 1, 1)),
        ('Modern draft broad rear rim', (1, 3, 4.5), 300, 3, (1, .96, .90)),
    )
    for name, offset, energy, size, color in lights:
        obj = bpy.data.objects[name]
        if obj.data.shape != 'DISK' or obj.data.energy != energy or obj.data.size != size or tuple(obj.data.color) != tuple(Vector(color)) or (obj.location - target - Vector(offset)).length > 1e-6:
            raise ValueError('Laundry Cycles actual retained soft-light parameters changed')
        if (obj.rotation_euler.to_quaternion() @ Vector((0, 0, -1))).dot((target - obj.location).normalized()) < 1 - 1e-6:
            raise ValueError('Laundry Cycles actual soft-light aim changed')


def configure(model):
    if model != MODEL or ASSET_ID != draft.source.receipt['assetId'] or SOURCE_NAME != 'furniture.laundry.linen-rack.soft-light.blend' or MANIFEST_NAME != 'oblique-furniture-laundry-linen-rack.v1.json':
        raise ValueError('Laundry Cycles dedicated producer dispatch changed')
    path = ROOT / 'assets/source/blender' / SOURCE_NAME
    bpy.ops.wm.open_mainfile(filepath=str(path))
    scene = bpy.context.scene
    target = Vector((.5, .5, TARGET_Z))
    # The saved scene already has the canonical min-corner rigid translation.
    # Check true triangle contacts before whole-record/source SHA assertions.
    draft.source.builder.source_contacts(scene, draft.source.receipt['actualContactPairs'])
    verify_profile(scene, scene.camera, target)
    if hashlib.sha256(path.read_bytes()).hexdigest() != SOURCE_SHA:
        raise ValueError('Laundry Cycles actual saved source SHA changed')
    return scene, scene.camera, target


def verify_exports():
    catalog = json.loads((ROOT / 'public/game-content' / MANIFEST_NAME).read_text())
    expected = {'assetId': ASSET_ID, 'source': 'assets/source/blender/' + SOURCE_NAME, 'sourceSha256': SOURCE_SHA,
                'resolutionPx': [256, 256], 'nominalPixelsPerTile': 64, 'pivotPx': [128, 128],
                'cameraTargetTiles': [.5, .5, TARGET_Z], 'yawDegrees': list(exporter.YAW), 'elevationDegrees': list(exporter.ELEVATION)}
    if any(catalog.get(key) != value for key, value in expected.items()):
        raise ValueError('Laundry Cycles exported descriptor source/dispatch/camera changed')
    if len(catalog['frames']) != 72 or {(row['yawDegrees'], row['elevationDegrees']) for row in catalog['frames']} != {(yaw, elevation) for yaw in exporter.YAW for elevation in exporter.ELEVATION}:
        raise ValueError('Laundry Cycles real72 pose coverage changed')
    for frame in catalog['frames']:
        body = (ROOT / 'public' / frame['image'].lstrip('/')).read_bytes()
        if hashlib.sha256(body).hexdigest() != frame['sha256'] or not frame['image'].endswith('.' + frame['sha256'][:12] + '.png'):
            raise ValueError('Laundry Cycles PNG body/path SHA changed')
        draft.source.validate_png(body)
    print('LAUNDRY_CYCLES_EXPORT72_DECODED_GREEN', flush=True)
    return catalog


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    exporter.MODELS = (MODEL,)
    exporter.configure = configure
    exporter.point_camera = draft.source.point_camera
    if '--verify' in sys.argv:
        scene, camera, target = configure(MODEL)
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:
                draft.source.point_camera(camera, target, yaw, elevation)
        print('LAUNDRY_CYCLES_SOURCE_111_12_8_CONTACTS_CAMERA72_GREEN', flush=True)
    elif '--verify-exports' in sys.argv:
        configure(MODEL)
        verify_exports()
    elif '--repeat-four' in sys.argv:
        catalog = verify_exports()
        scene, camera, target = configure(MODEL)
        rows = []
        for yaw in (30, 120, 210, 300):
            draft.source.point_camera(camera, target, yaw, 40)
            path = REPORT / f'repeat-yaw{yaw}-elev40.png'
            scene.render.filepath = str(path)
            began = time.monotonic()
            bpy.ops.render.render(write_still=True)
            exporter.normalize_and_check_border(path)
            draft.source.validate_png(path.read_bytes())
            frame = next(row for row in catalog['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (yaw, 40))
            if path.read_bytes() != (ROOT / 'public' / frame['image'].lstrip('/')).read_bytes():
                raise ValueError('Laundry Cycles actual canonical repeat not byte exact')
            rows.append({'yawDegrees': yaw, 'elevationDegrees': 40, 'sha256': frame['sha256'], 'byteExact': True, 'renderSeconds': time.monotonic() - began})
        pipeline_common.write_text(REPORT / 'actual-four-repeats.json', json.dumps(rows, indent=2) + '\n')
        print('LAUNDRY_CYCLES_FOUR_REAL_REPEATS_BYTE_EXACT_GREEN', flush=True)
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
