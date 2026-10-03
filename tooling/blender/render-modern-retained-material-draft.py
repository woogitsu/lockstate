"""Bounded genuine modern-lighting draft. Never writes a runtime descriptor/72 frames."""
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

spec = importlib.util.spec_from_file_location("modern_laundry_retained_production", HERE / "render-laundry-linen-rack-oblique.py")
source = importlib.util.module_from_spec(spec)
spec.loader.exec_module(source)
REPORT = ROOT / "docs/research/2026-10-03-modern-retained-material-lighting"
DRAFT_SOURCE = ROOT / "assets/source/blender/draft.laundry.linen-rack.soft-light.blend"
POSES = ((60, 40), (300, 40))


def frozen_model(scene):
    names = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
    rows = source.builder.audit.capture(scene)
    return {
        'meshCount': len(names),
        'rawMeshes': [source.builder.audit.raw_record(bpy.data.objects[name]) for name in names],
        'evaluatedPositions': {name: rows[name]['evaluatedPositionSha256'] for name in names},
        'completeStoredMaterialGraphs': source.builder.audit.materials_record(),
        'evaluatedNormals': source.builder.audit.convex_normal_audit(scene),
        'actualContacts': source.builder.source_contacts(scene, source.receipt['actualContactPairs']),
        'sourceMinCornerBounds': source.builder.scene_bounds(scene),
    }


def light(name, target, offset, energy, size, rgb):
    data = bpy.data.lights.new(name, 'AREA')
    data.energy = energy
    data.shape = 'DISK'
    data.size = size
    data.color = rgb
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = target + Vector(offset)
    obj.rotation_euler = (target - obj.location).to_track_quat('-Z', 'Y').to_euler()


def soft_original_materials(scene, target):
    # Original material nodes and packed textures are deliberately not mutated.
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
    world = bpy.data.worlds.new('Modern draft neutral indirect illumination')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (.8, .8, .8, 1)
    world.node_tree.nodes['Background'].inputs['Strength'].default_value = .25
    scene.world = world
    light('Modern draft soft warm key', target, (-3, -4, 6), 450, 4, (1, .94, .85))
    light('Modern draft soft neutral fill', target, (4, -1, 3), 180, 5, (1, 1, 1))
    light('Modern draft broad rear rim', target, (1, 3, 4.5), 300, 3, (1, .96, .90))


def verify_presentation(scene, camera, target, before):
    after = frozen_model(scene)
    if after != before or after['meshCount'] != 111:
        raise ValueError('Modern draft changed retained physical mesh/material/actual contact assembly')
    if camera.data.type != 'ORTHO' or abs(camera.data.ortho_scale - 4) > 1e-6 or list(target) != [.5, .5, source.TARGET_Z]:
        raise ValueError('Modern draft changed actual64px-per-tile camera/footprint target')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Modern draft changed canonical256 resolution')
    if scene.render.engine != 'CYCLES' or scene.cycles.device != 'CPU' or scene.render.threads != 1:
        raise ValueError('Modern draft renderer is not bounded CPU/thread1')
    names = sorted(obj.name for obj in scene.objects if obj.type == 'LIGHT')
    expected = ['Modern draft broad rear rim', 'Modern draft soft neutral fill', 'Modern draft soft warm key']
    if names != expected:
        raise ValueError('Modern draft actual soft area-light assembly omitted')
    if any(bpy.data.objects[name].data.type != 'AREA' or bpy.data.objects[name].data.size < 3 for name in names):
        raise ValueError('Modern draft actual illumination lost its broad soft emitter')
    if not scene.render.film_transparent:
        raise ValueError('Modern draft replaced source transparency')
    return after


def render(scene, camera, target, yaw, elevation, stage):
    source.point_camera(camera, target, yaw, elevation)
    path = REPORT / f'{stage}-yaw{yaw}-elev{elevation}.png'
    scene.render.filepath = str(path)
    began = time.monotonic()
    bpy.ops.render.render(write_still=True)
    source.exporter.normalize_and_check_border(path)
    source.validate_png(path.read_bytes())
    return {'stage': stage, 'yaw': yaw, 'elevation': elevation, 'image': path.relative_to(ROOT).as_posix(),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(), 'renderSeconds': time.monotonic() - began}


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    protected = [source.builder.SOURCE, source.builder.ORIGINAL, source.builder.PROVENANCE,
                 ROOT / 'public/game-content' / source.MANIFEST_NAME,
                 ROOT / 'public/game-content/oblique-module-registry.v1.json',
                 ROOT / 'src/rendering/assets/oblique-object-mapping.ts', ROOT / 'src/content/room-catalog.ts']
    protected += list((ROOT / 'public/assets/environment/oblique').glob(source.ASSET_ID + '-*.png'))
    protected_before = {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
    if '--mutate-saved-disconnect' in sys.argv or '--mutate-saved-light-omit' in sys.argv or '--mutate-saved-camera' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(DRAFT_SOURCE))
        if '--mutate-saved-disconnect' in sys.argv:
            bpy.data.objects['Laundry linen rack.folded linen panel 0'].location.z += 1
        elif '--mutate-saved-light-omit' in sys.argv:
            bpy.data.objects.remove(bpy.data.objects['Modern draft soft warm key'], do_unlink=True)
        else:
            bpy.context.scene.camera.data.ortho_scale = 2
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(DRAFT_SOURCE))
        print('ACTUAL_OWN_DRAFT_BLEND_MUTANT_SAVED', flush=True)
        return
    if '--verify-saved' in sys.argv:
        expected = json.loads((REPORT / 'actual-before-after.json').read_text(encoding='utf-8'))
        bpy.ops.wm.open_mainfile(filepath=str(DRAFT_SOURCE))
        scene = bpy.context.scene
        target = Vector((.5, .5, source.TARGET_Z))
        before = expected['physicalAssembly']
        verify_presentation(scene, scene.camera, target, before)
        print('ACTUAL_SAVED_DRAFT_RETAINED_SOURCE_CAMERA_MATERIALS_RIG_GREEN', flush=True)
        return
    frames = []
    repeat_only = '--repeat60-only' in sys.argv
    verify_only = '--verify-only' in sys.argv
    if not repeat_only and not verify_only:
        scene, camera, target = source.configure(source.MODEL)
        for yaw, elevation in POSES:
            frame = render(scene, camera, target, yaw, elevation, 'before-workbench')
            expected = next(frame for frame in json.loads((ROOT / 'public/game-content' / source.MANIFEST_NAME).read_text())['frames'] if frame['yawDegrees'] == yaw and frame['elevationDegrees'] == elevation)
            if frame['sha256'] != expected['sha256']:
                raise ValueError('Actual before render no longer reproduces published Workbench PNG')
            frame['byteExactPublishedWorkbench'] = True
            frames.append(frame)
    scene, camera, target = source.configure(source.MODEL)
    before = frozen_model(scene)
    soft_original_materials(scene, target)
    if '--omit-key-control' in sys.argv:
        bpy.data.objects.remove(bpy.data.objects['Modern draft soft warm key'], do_unlink=True)
    if '--disconnect-linen-control' in sys.argv:
        bpy.data.objects['Laundry linen rack.folded linen panel 0'].location.z += 1
    if '--camera-span-control' in sys.argv:
        camera.data.ortho_scale = 2
    physical_after = verify_presentation(scene, camera, target, before)
    if '--verify-only' in sys.argv:
        print('MODERN_DRAFT_RETAINED_SOURCE_111_12_8_CONTACTS_CAMERA_RIG_GREEN', flush=True)
        return
    for yaw, elevation in (((60, 40),) if repeat_only else POSES):
        frames.append(render(scene, camera, target, yaw, elevation, 'repeat-soft-original-materials' if repeat_only else 'after-soft-original-materials'))
    if not repeat_only:
        source.point_camera(camera, target, 60, 40)
        bpy.context.preferences.filepaths.save_version = 0
        DRAFT_SOURCE.parent.mkdir(parents=True, exist_ok=True)
        bpy.ops.wm.save_as_mainfile(filepath=str(DRAFT_SOURCE))
    protected_after = {path.relative_to(ROOT).as_posix(): hashlib.sha256(path.read_bytes()).hexdigest() for path in protected}
    if protected_after != protected_before:
        raise ValueError('Modern draft modified released source/render/palette/registry/context')
    receipt = {
        'draftOnly': True, 'genuineBlenderVersion': list(bpy.app.version), 'assetId': source.ASSET_ID,
        'retainedSource': source.receipt['source'], 'retainedSourceSha256': source.receipt['sourceSha256'],
        'draftScene': DRAFT_SOURCE.relative_to(ROOT).as_posix(),
        'draftSceneSha256': hashlib.sha256(DRAFT_SOURCE.read_bytes()).hexdigest(),
        'frames': frames, 'originalMaterialGraphsMutated': False,
        'meshCount': 111, 'materialGraphCount': len(physical_after['completeStoredMaterialGraphs']),
        'contactCount': len(physical_after['actualContacts']), 'beforeAndAfterPhysicalRecordsExactlyEqual': before == physical_after,
        'physicalAssembly': physical_after, 'protectedBefore': protected_before, 'protectedAfter': protected_after,
        'actualNominalPixelsPerTile': 64, 'cameraTargetTiles': list(target), 'orthoScaleTiles': camera.data.ortho_scale,
        'draftProfile': {'engine': scene.render.engine, 'device': scene.cycles.device, 'samples': scene.cycles.samples,
                         'threads': scene.render.threads, 'viewTransform': scene.view_settings.view_transform,
                         'worldIndirectStrength': .25, 'softAreaLightCount': 3, 'groundShadowPlaneAdded': False},
        'full72Run': False, 'productionDispatchChanged': False, 'nativeAcceptance': False, 'ownerVisualReviewPending': True,
    }
    pipeline_common.write_text(REPORT / ('actual-repeat60.json' if repeat_only else 'actual-before-after.json'), json.dumps(receipt, indent=2) + '\n')
    print('MODERN_DRAFT_BOUNDED_GENUINE_COMPARISON_GREEN', flush=True)


if __name__ == '__main__':
    main()
