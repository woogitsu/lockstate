"""Two-pose retained square-wall study; never changes runtime source/catalogue art."""
from pathlib import Path
import hashlib
import importlib.util
import json
import math
import sys
import time
import bpy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()


def module(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


producer = module('retained_square_wall_producer', 'render-square-brick-oblique.py')
audit = module('retained_square_wall_audit', 'refine-guard-belt-detail.py')
REPORT = ROOT / 'docs/research/2026-10-03-modern-square-wall-material-study'
DRAFT = REPORT / 'draft.wall.square.brick.full.literal-graphs.blend'
POSES = ((-45, 45), (135, 45))
SOURCE_SHA = 'c73fcc00471682135b53049e0b74f1d71588909b245bfeac0cac6cd93d696ae1'


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def physical(scene):
    names = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
    values = audit.capture(scene)
    return {'meshCount': len(names), 'rawMeshes': [audit.raw_record(bpy.data.objects[name]) for name in names],
            'evaluatedPositions': {name: values[name]['evaluatedPositionSha256'] for name in names},
            'completeStoredMaterialGraphs': audit.materials_record(),
            'geometricNormals': audit.normal_record(scene), 'bounds': audit.bounds(scene)}


def protected():
    paths = [ROOT / 'assets/source/blender/wall.square.brick.full.blend',
             ROOT / 'assets/source/blender/wall.square.brick.low.blend',
             ROOT / 'assets/source/blender/environment.mvp.catalog.blend',
             ROOT / 'src/rendering/assets/environment-sprites.ts',
             ROOT / 'src/rendering/camera/oblique-ground-art.ts',
             ROOT / 'src/rendering/camera/oblique-world-projection.ts',
             ROOT / 'src/rendering/scene/oblique-world-scene.ts',
             ROOT / 'src/content/room-catalog.ts',
             ROOT / 'public/game-content/oblique-module-registry.v1.json']
    paths += list((ROOT / 'public/game-content').glob('oblique-*wall*.json'))
    paths += list((ROOT / 'public/assets/environment/oblique').glob('*wall*.png'))
    paths += list((ROOT / 'public/game-content/source-art').glob('*floor*.png'))
    paths += list((ROOT / 'public/game-content/source-art').glob('*terrain*.png'))
    return {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(set(paths))}


def directional_profile(scene):
    # SUN direction/radiance is independent of tile position. No finite-area
    # emitter or extra shadow plane is baked repeatedly into each module.
    for obj in list(scene.objects):
        if obj.type == 'LIGHT':
            bpy.data.objects.remove(obj, do_unlink=True)
    scene.render.engine = 'CYCLES'
    scene.render.threads_mode = 'FIXED'
    scene.render.threads = 1
    scene.cycles.device = 'CPU'
    scene.cycles.samples = 64
    scene.cycles.seed = 0
    scene.cycles.use_animated_seed = False
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.cycles.max_bounces = 8
    scene.cycles.diffuse_bounces = 4
    scene.cycles.glossy_bounces = 4
    scene.view_settings.view_transform = 'AgX'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0
    scene.view_settings.gamma = 1
    world = bpy.data.worlds.new('Square wall draft neutral ambient')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.8, .8, .8, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .35
    scene.world = world
    data = bpy.data.lights.new('Square wall draft soft directional key', 'SUN')
    data.energy = 2
    data.angle = math.radians(20)
    data.color = (1, 1, 1)
    obj = bpy.data.objects.new(data.name, data)
    scene.collection.objects.link(obj)
    # Retain the real environment producer's key direction; broaden the emitter.
    obj.rotation_euler = (math.radians(90 - 62), 0, math.radians(-40))


def profile_record(scene):
    lights = [{'name': obj.name, 'type': obj.data.type, 'energy': obj.data.energy,
               'angleRadians': obj.data.angle, 'color': list(obj.data.color),
               'rotation': list(obj.rotation_euler)} for obj in sorted(scene.objects, key=lambda item: item.name)
              if obj.type == 'LIGHT']
    background = scene.world.node_tree.nodes['Background']
    return {'engine': scene.render.engine, 'device': scene.cycles.device, 'threadsMode': scene.render.threads_mode,
            'threads': scene.render.threads, 'samples': scene.cycles.samples, 'seed': scene.cycles.seed,
            'adaptiveSampling': scene.cycles.use_adaptive_sampling, 'denoising': scene.cycles.use_denoising,
            'viewTransform': scene.view_settings.view_transform, 'look': scene.view_settings.look,
            'exposure': scene.view_settings.exposure, 'gamma': scene.view_settings.gamma,
            'worldColor': list(background.inputs['Color'].default_value),
            'worldStrength': background.inputs['Strength'].default_value, 'lights': lights,
            'noAdditionalGroundPlane': True}


def verify(scene, receipt):
    value = physical(scene)
    if value != receipt['physicalAssembly'] or value['meshCount'] != 59:
        raise ValueError('Retained wall geometry/material/normals/bounds changed')
    if profile_record(scene) != receipt['directionalProfile']:
        raise ValueError('Saved wall directional illumination profile changed')
    camera = scene.camera
    if camera.data.type != 'ORTHO' or camera.data.ortho_scale != 8:
        raise ValueError('Wall tile camera changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (512, 512, 100):
        raise ValueError('Wall64 pixels per tile resolution changed')
    if not scene.render.film_transparent or scene.render.dither_intensity != 0:
        raise ValueError('Wall alpha/deterministic encoding changed')
    return value


def render(scene, camera, stage, yaw, elevation):
    producer.pose_camera(camera, yaw, elevation)
    path = REPORT / f'{stage}-yaw{yaw:+d}-elev{elevation}.png'
    scene.render.filepath = str(path)
    began = time.monotonic()
    bpy.ops.render.render(write_still=True)
    producer.normalize(path)
    return {'stage': stage, 'yawDegrees': yaw, 'elevationDegrees': elevation,
            'image': path.relative_to(ROOT).as_posix(), 'sha256': digest(path),
            'renderSeconds': time.monotonic() - began}


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    receipt_path = REPORT / 'actual-before-after.json'
    if '--verify-saved' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(DRAFT))
        verify(bpy.context.scene, json.loads(receipt_path.read_text(encoding='utf-8')))
        print('ACTUAL_SAVED_WALL59_GRAPH9_CAMERA64_DIRECTIONAL_GREEN', flush=True)
        return
    if '--mutate-saved-geometry' in sys.argv or '--mutate-saved-light' in sys.argv or '--mutate-saved-camera' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(DRAFT))
        if '--mutate-saved-geometry' in sys.argv:
            bpy.data.objects['cap stone 0.0'].location.z += 1
        elif '--mutate-saved-light' in sys.argv:
            bpy.data.objects.remove(bpy.data.objects['Square wall draft soft directional key'], do_unlink=True)
        else:
            bpy.context.scene.camera.data.ortho_scale = 4
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(DRAFT))
        print('ACTUAL_OWN_WALL_DRAFT_MUTANT_SAVED', flush=True)
        return
    before_protected = protected()
    scene, camera, source = producer.prepare_scene('full')
    if digest(source) != SOURCE_SHA:
        raise ValueError('Retained released square wall source identity changed')
    held = physical(scene)
    if held['meshCount'] != 59 or len(held['completeStoredMaterialGraphs']) != 9:
        raise ValueError('Retained wall59 parts/9 graphs incomplete')
    manifest = json.loads((ROOT / 'public/game-content/oblique-square-brick-full-wall.v1.json').read_text())
    frames = []
    for yaw, elevation in POSES:
        frame = render(scene, camera, 'before-workbench', yaw, elevation)
        published = next(row for row in manifest['frames'] if row['yawDegrees'] == yaw and row['elevationDegrees'] == elevation)
        frame['publishedSha256'] = published['sha256']
        frame['byteExactPublishedWorkbench'] = frame['sha256'] == published['sha256']
        # Historical disagreement is evidence, not permission to reuse old pixels.
        frames.append(frame)
    directional_profile(scene)
    receipt = {'draftOnly': True, 'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': SOURCE_SHA,
               'genuineBlenderVersion': list(bpy.app.version), 'physicalAssembly': held,
               'directionalProfile': profile_record(scene), 'frames': frames,
               'cameraTargetTiles': list(producer.CAMERA_TARGET), 'orthoScaleTiles': 8,
               'nominalPixelsPerTile': 64, 'full72Run': False, 'runtimeDispatchChanged': False,
               'nativeAcceptance': False, 'floorArtProducerChanged': False,
               'originalMaterialGraphsMutated': False, 'tileJoinVisualReviewPending': True}
    verify(scene, receipt)
    for yaw, elevation in POSES:
        frames.append(render(scene, camera, 'after-cycles-literal-graphs', yaw, elevation))
    producer.pose_camera(camera, *POSES[0])
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(DRAFT))
    receipt['draftScene'] = DRAFT.relative_to(ROOT).as_posix()
    receipt['draftSceneSha256'] = digest(DRAFT)
    receipt['protectedBefore'] = before_protected
    receipt['protectedAfter'] = protected()
    if receipt['protectedAfter'] != before_protected:
        raise ValueError('Released world/floor/source/context changed during bounded draft')
    pipeline_common.write_text(receipt_path, json.dumps(receipt, indent=2) + '\n')
    print('ACTUAL_WALL_WORKBENCH_CYCLES_TWO_POSES_COMPLETE', json.dumps(frames), flush=True)


if __name__ == '__main__':
    main()
