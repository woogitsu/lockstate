"""Save the entire authored Staff chair with the inspected bounded soft profile."""
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


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


source = load('staff_cycles_retained_source', HERE / 'render-staff-room-padded-chair-oblique.py')
profile = load('staff_cycles_inspected_laundry_profile', HERE / 'render-modern-retained-material-draft.py')
REPORT = ROOT / 'docs/research/2026-10-03-staff-chair-retained-cycles'
SAVED = ROOT / 'assets/source/blender/furniture.staff-room.padded-chair.soft-light.blend'
HISTORY = ROOT / 'assets/source/blender/furniture.staff-room.padded-chair.workbench-descriptor.v1.json'


def physical(scene):
    names = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
    rows = source.builder.audit.capture(scene)
    return {'meshCount': len(names), 'rawMeshes': [source.builder.audit.raw_record(bpy.data.objects[name]) for name in names],
            'evaluatedPositions': {name: rows[name]['evaluatedPositionSha256'] for name in names},
            'completeStoredMaterialGraphs': source.builder.audit.materials_record(),
            'evaluatedNormals': source.builder.audit.normal_record(scene),
            'actualContacts': source.builder.source_contacts(scene, source.receipt['actualContactPairs']),
            'minCornerBounds': source.builder.audit.bounds(scene)}


def lighting(scene, target):
    names = sorted(obj.name for obj in scene.objects if obj.type == 'LIGHT')
    return {'engine': scene.render.engine, 'device': scene.cycles.device,
            'threadsMode': scene.render.threads_mode, 'threads': scene.render.threads,
            'samples': scene.cycles.samples, 'seed': scene.cycles.seed, 'animatedSeed': scene.cycles.use_animated_seed,
            'adaptiveSampling': scene.cycles.use_adaptive_sampling, 'denoising': scene.cycles.use_denoising,
            'maxBounces': scene.cycles.max_bounces, 'diffuseBounces': scene.cycles.diffuse_bounces, 'glossyBounces': scene.cycles.glossy_bounces,
            'viewTransform': scene.view_settings.view_transform, 'look': scene.view_settings.look,
            'exposure': scene.view_settings.exposure, 'gamma': scene.view_settings.gamma,
            'filmTransparent': scene.render.film_transparent, 'dither': scene.render.dither_intensity,
            'imageSettings': [scene.render.image_settings.file_format, scene.render.image_settings.color_mode, scene.render.image_settings.color_depth, scene.render.image_settings.compression],
            'worldRGBA': list(scene.world.node_tree.nodes['Background'].inputs['Color'].default_value),
            'worldStrength': scene.world.node_tree.nodes['Background'].inputs['Strength'].default_value,
            'lights': [{'name': name, 'type': bpy.data.objects[name].data.type, 'shape': bpy.data.objects[name].data.shape,
                        'energy': bpy.data.objects[name].data.energy, 'size': bpy.data.objects[name].data.size,
                        'rgb': list(bpy.data.objects[name].data.color), 'offset': list(bpy.data.objects[name].location - target),
                        'rotation': list(bpy.data.objects[name].rotation_euler)} for name in names]}


def verify_scene(scene, camera, target, expected):
    # Physical contacts are checked before byte/hash checks.
    source.builder.source_contacts(scene, source.receipt['actualContactPairs'])
    if physical(scene) != expected['physicalAssembly']:
        raise ValueError('Staff Cycles retained geometry/material graphs/normals/bounds changed')
    if lighting(scene, target) != expected['lightingProfile']:
        raise ValueError('Staff Cycles actual saved soft-light/profile changed')
    if camera.data.type != 'ORTHO' or camera.data.ortho_scale != 4 or list(target) != [.5, .5, source.TARGET_Z]:
        raise ValueError('Staff Cycles actual camera64px/tile target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Staff Cycles actual canonical256 resolution changed')
    bounds = expected['physicalAssembly']['minCornerBounds']
    if not (0 <= bounds['min'][0] < bounds['max'][0] <= 1 and 0 <= bounds['min'][1] < bounds['max'][1] <= 1 and abs(bounds['min'][2]) < 1e-6):
        raise ValueError('Staff Cycles actual grounded1x1 footprint changed')
    for turns in range(4):
        for row in source.builder.audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x - .5, point.y - .5
                for _ in range(turns):
                    x, y = -y, x
                if not (-.5 <= x <= .5 and -.5 <= y <= .5 and point.z >= -1e-6):
                    raise ValueError('Staff Cycles complete rotated occupied footprint escaped')


def render(scene, camera, target, yaw, label):
    source.point_camera(camera, target, yaw, 40)
    path = REPORT / f'{label}-yaw{yaw}-elev40.png'
    scene.render.filepath = str(path)
    began = time.monotonic()
    bpy.ops.render.render(write_still=True)
    source.exporter.normalize_and_check_border(path)
    source.validate_png(path.read_bytes())
    return {'yawDegrees': yaw, 'elevationDegrees': 40, 'stage': label, 'image': path.relative_to(ROOT).as_posix(),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'renderSeconds': time.monotonic() - began}


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    if HISTORY.exists():
        old = HISTORY.read_bytes()
    else:
        old = (ROOT / 'public/game-content' / source.MANIFEST_NAME).read_bytes()
        HISTORY.write_bytes(old)
    catalog = json.loads(old)
    protected = [source.builder.SOURCE, source.builder.ORIGINAL, source.builder.PROVENANCE, HISTORY,
                 ROOT / 'public/game-content' / source.MANIFEST_NAME, ROOT / 'public/game-content/oblique-module-registry.v1.json',
                 ROOT / 'src/rendering/assets/oblique-object-mapping.ts', ROOT / 'src/rendering/world/appearance.ts']
    protected += [ROOT / 'public' / frame['image'].lstrip('/') for frame in catalog['frames']]
    before_hashes = {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
    scene, camera, target = source.configure(source.MODEL)
    frames = []
    for yaw in (60, 300):
        frame = render(scene, camera, target, yaw, 'before-workbench')
        published = next(row for row in catalog['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (yaw, 40))
        if frame['sha256'] != published['sha256']:
            raise ValueError('Actual Staff before render differs from historical published frame')
        frame['byteExactHistoricalBody'] = True
        frames.append(frame)
    before = physical(scene)
    profile.soft_original_materials(scene, target)
    after = physical(scene)
    if before != after or after['meshCount'] != 54 or len(after['completeStoredMaterialGraphs']) != 4 or len(after['actualContacts']) != 3:
        raise ValueError('Staff soft light changed actual54parts/fourgraphs/threecontacts')
    expected = {'physicalAssembly': after, 'lightingProfile': lighting(scene, target)}
    verify_scene(scene, camera, target, expected)
    for yaw in (60, 300):
        frames.append(render(scene, camera, target, yaw, 'after-soft-materials'))
    source.point_camera(camera, target, 60, 40)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SAVED))
    after_hashes = {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
    if before_hashes != after_hashes:
        raise ValueError('Staff source preparation altered released source72/context/palette')
    receipt = {'assetId': source.ASSET_ID, 'source': SAVED.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(SAVED.read_bytes()).hexdigest(),
               'retainedSource': source.receipt['source'], 'retainedSourceSha256': source.receipt['sourceSha256'],
               'originalSource': source.receipt['originalSource'], 'originalSourceSha256': source.receipt['originalSourceSha256'],
               'footprintTiles': [1, 1], 'cameraTargetTiles': list(target), 'canonicalMinCornerTranslation': [.5, .5, 0],
               **expected, 'sourceLightingChangesGeometryOrMaterials': False, 'groundPlaneAdded': False, 'nativeAcceptance': False}
    pipeline_common.write_text(SAVED.with_suffix('.provenance.json'), json.dumps(receipt, indent=2) + '\n')
    pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps({'genuineBlenderVersion': list(bpy.app.version), 'frames': frames,
        'physicalBeforeExactlyEqualsAfter': True, 'protectedBefore': before_hashes, 'protectedAfter': after_hashes,
        'sourceSha256': receipt['sourceSha256'], 'full72Run': False, 'nativeAcceptance': False}, indent=2) + '\n')
    print('STAFF_CYCLES_GENUINE_SAVED_SOURCE_COMPARE_GREEN', receipt['sourceSha256'], flush=True)


if __name__ == '__main__':
    main()
