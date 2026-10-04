"""Genuine two-pose retained Library bookshelf shader/light source preparation."""
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


source = load('library_bookshelf_retained_canonical_producer', HERE / 'render-library-bookshelf-detail-oblique.py')
audit = load('library_bookshelf_retained_physical_audit', HERE / 'refine-library-bookshelf-angled-detail.py')
contacts = load('bookshelf_actual_triangle_contacts', HERE / 'bookshelf-retained-contacts.py')
profile = load('library_bookshelf_inspected_soft_laundry_profile', HERE / 'render-modern-retained-material-draft.py')
profile_reader = load('library_bookshelf_saved_soft_profile_reader', HERE / 'prepare-staff-chair-cycles.py')
REPORT = ROOT / 'docs/research/2026-10-04-library-bookshelf-retained-cycles'
SAVED = ROOT / 'assets/source/blender/furniture.library.bookshelf.soft-light.blend'
PROVENANCE = SAVED.with_suffix('.provenance.json')
HISTORY = ROOT / 'assets/source/blender/furniture.library.bookshelf.workbench-descriptor.v1.json'
source.SOURCE = ROOT / 'assets/source/blender/furniture.library.bookshelf.angled-detail.blend'
source.MANIFEST = ROOT / 'public/game-content/oblique-furniture.library-bookshelf.v1.json'
source.TARGET = Vector((1, .5, 1.05))
source.normalize_and_check_border = source.exporter.normalize_and_check_border
ORIGINAL_RECEIPT = json.loads(source.SOURCE.with_suffix('.provenance.json').read_text(encoding='utf-8'))
POSES = (60, 300)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def physical(scene):
    names = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
    rows = audit.capture(scene)
    return {'meshCount': len(names), 'rawMeshes': [audit.raw_record(bpy.data.objects[name]) for name in names],
            'evaluatedPositions': {name: rows[name]['evaluatedPositionSha256'] for name in names},
            'completeStoredMaterialGraphs': audit.materials_record(),
            'evaluatedNormals': audit.convex_normal_audit(scene),
            'contactMethod': 'actual evaluated BVH triangle parity; shared interior witnesses',
            'actualInteriorContacts': contacts.verify_contacts(scene),
            'minCornerBounds': {'min': [min(point[axis] for row in rows.values() for point in row['points']) for axis in range(3)],
                                'max': [max(point[axis] for row in rows.values() for point in row['points']) for axis in range(3)]}}


def material_audit():
    rows = []
    for material in sorted(bpy.data.materials, key=lambda item: item.name):
        shader = next((node for node in material.node_tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
        rows.append({'name': material.name, 'users': material.users, 'diffuseRGBA': list(material.diffuse_color),
                     'viewportRoughnessProperty': material.roughness,
                     'shaderBaseColor': list(shader.inputs['Base Color'].default_value) if shader else None,
                     'shaderRoughness': shader.inputs['Roughness'].default_value if shader else None,
                     'shaderMetallic': shader.inputs['Metallic'].default_value if shader else None})
    return rows


def lighting(scene):
    return {**profile_reader.lighting(scene, source.TARGET),
            'denoiser': scene.cycles.denoiser, 'denoisingUseGpu': scene.cycles.denoising_use_gpu}


def verify_scene(scene, camera, expected):
    # Real contact guard runs first, before frozen records/hash checks.
    contacts.verify_contacts(scene)
    if physical(scene) != expected['physicalAssembly']:
        raise ValueError('Library bookshelf retained geometry/full materials/normals/contacts/bounds changed')
    if lighting(scene) != expected['lightingProfile']:
        raise ValueError('Library bookshelf actual bounded saved soft lighting changed')
    if camera.data.type != 'ORTHO' or camera.data.ortho_scale != 4 or list(source.TARGET) != [1, .5, 1.0499999523162842]:
        raise ValueError('Library bookshelf canonical64px camera/target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Library bookshelf canonical256RGBA resolution changed')
    for turns in range(4):
        width, height = (2, 1) if turns % 2 == 0 else (1, 2)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x - 1, point.y - .5
                for _ in range(turns): x, y = -y, x
                if not (-width / 2 <= x <= width / 2 and -height / 2 <= y <= height / 2 and point.z >= -1e-6):
                    raise ValueError('Library bookshelf retained surface escapes rotated2x1 footprint')
    return expected['physicalAssembly']


def render(scene, camera, yaw, label):
    source.point_camera(camera, source.TARGET, yaw, 40)
    path = REPORT / f'{label}-yaw{yaw}-elev40.png'
    scene.render.filepath = str(path)
    began = time.monotonic()
    bpy.ops.render.render(write_still=True)
    source.normalize_and_check_border(path)
    return {'stage': label, 'yawDegrees': yaw, 'elevationDegrees': 40,
            'image': path.relative_to(ROOT).as_posix(), 'sha256': sha(path), 'renderSeconds': time.monotonic() - began}


def protected():
    paths = [source.SOURCE, source.SOURCE.with_suffix('.provenance.json'),
             ROOT / ORIGINAL_RECEIPT['originalSource'], source.MANIFEST,
             ROOT / 'public/game-content/oblique-module-registry.v1.json', ROOT / 'src/content/room-catalog.ts',
             ROOT / 'src/content/room-template-catalog.ts']
    paths += list((ROOT / 'public/assets/environment/oblique').glob('furniture.library.bookshelf-*.png'))
    for folder in ['tests/browser', 'src/rendering', 'src/ui']:
        paths += [path for path in (ROOT / folder).rglob('*') if path.is_file()]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(set(paths))}


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    if '--refine-actual-noise' in sys.argv:
        import shutil
        receipt = json.loads(PROVENANCE.read_text(encoding='utf-8'))
        bpy.ops.wm.open_mainfile(filepath=str(SAVED))
        scene = bpy.context.scene
        verify_scene(scene, scene.camera, receipt)
        if scene.cycles.samples != 64 or scene.cycles.use_denoising:
            raise ValueError('Bookshelf noise correction must start from inspected64 literal-graph draft')
        archive = SAVED.with_name('furniture.library.bookshelf.soft-light-64-draft.blend')
        shutil.copyfile(SAVED, archive)
        shutil.copyfile(PROVENANCE, archive.with_suffix('.provenance.json'))
        receipt['actual64SampleDraft'] = {'source': archive.relative_to(ROOT).as_posix(), 'sourceSha256': sha(archive),
            'lightingProfile': receipt['lightingProfile'], 'frames': [dict(row) for row in receipt['frames'] if row['stage'].startswith('after')]}
        for row in receipt['actual64SampleDraft']['frames']:
            old = ROOT / row['image']
            new = old.with_name(old.name.replace('after-soft-original-materials', 'actual64-noisy-soft-materials'))
            shutil.copyfile(old, new)
            row['image'] = new.relative_to(ROOT).as_posix()
        # Only this saved Bookshelf source/profile changes sampling. Material graphs stay literal.
        scene.cycles.samples = 128
        scene.cycles.use_denoising = True
        scene.cycles.denoiser = 'OPENIMAGEDENOISE'
        scene.cycles.denoising_use_gpu = False
        receipt['lightingProfile'] = lighting(scene)
        source.point_camera(scene.camera, source.TARGET, 60, 40)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(SAVED))
        receipt['sourceSha256'] = sha(SAVED)
        receipt['afterRenderedFromActualSavedSource'] = False
        verify_scene(scene, scene.camera, receipt)
        pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
        print('BOOKSHELF_SCOPED128_CPU_OIDN_SAVED', receipt['sourceSha256'], flush=True)
        return
    if '--refresh-saved-comparison' in sys.argv:
        receipt = json.loads(PROVENANCE.read_text(encoding='utf-8'))
        bpy.ops.wm.open_mainfile(filepath=str(SAVED))
        scene = bpy.context.scene
        verify_scene(scene, scene.camera, receipt)
        receipt['frames'] = [row for row in receipt['frames'] if row['stage'] == 'before-workbench']
        for yaw in POSES:
            receipt['frames'].append(render(scene, scene.camera, yaw, 'after-soft-original-materials'))
        receipt['afterRenderedFromActualSavedSource'] = True
        pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
        pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps(receipt, indent=2) + '\n')
        print('BOOKSHELF_TWO_AFTER_POSES_FROM_ACTUAL_SAVED_SOURCE_GREEN', flush=True)
        return
    if '--verify-saved' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(SAVED))
        verify_scene(bpy.context.scene, bpy.context.scene.camera, json.loads(PROVENANCE.read_text(encoding='utf-8')))
        print('ACTUAL_SAVED_BOOKSHELF63_GRAPH9_CONTACT48_CAMERA64_PROFILE_GREEN', flush=True)
        return
    held = protected()
    scene, camera, target = source.configure(source.exporter.MODELS[0])
    original = physical(scene)
    if original['meshCount'] != 63 or len(original['completeStoredMaterialGraphs']) != 9 or len(original['actualInteriorContacts']) != 48:
        raise ValueError('Library bookshelf complete retained63parts/9graphs/48triangle contacts incomplete')
    materials = material_audit()
    for material in materials:
        if material['users'] and material['shaderBaseColor'] != material['diffuseRGBA']:
            raise ValueError('Library bookshelf used shader color differs from authored approved diffuse: ' + material['name'])
    frames = []
    descriptor = json.loads(source.MANIFEST.read_text(encoding='utf-8'))
    for yaw in POSES:
        frame = render(scene, camera, yaw, 'before-workbench')
        expected = next(row for row in descriptor['frames'] if row['yawDegrees'] == yaw and row['elevationDegrees'] == 40)
        if frame['sha256'] != expected['sha256']:
            raise ValueError('Actual before Library bookshelf render differs from published Workbench body')
        frame['byteExactPublishedWorkbench'] = True
        frames.append(frame)
    original_lights = [{'name': obj.name, 'type': obj.data.type} for obj in scene.objects if obj.type == 'LIGHT']
    for obj in list(scene.objects):
        if obj.type == 'LIGHT': bpy.data.objects.remove(obj, do_unlink=True)
    profile.soft_original_materials(scene, source.TARGET)
    receipt = {'assetId': source.exporter.MODELS[0][0], 'source': SAVED.relative_to(ROOT).as_posix(),
               'retainedSource': source.SOURCE.relative_to(ROOT).as_posix(), 'retainedSourceSha256': sha(source.SOURCE),
               'physicalAssembly': original, 'lightingProfile': lighting(scene),
               'originalMaterialAudit': materials, 'materialGraphsChanged': False, 'replacedOriginalLights': original_lights, 'canonicalMinCornerTranslation': [1,.5,0],
               'footprintTiles': [2, 1], 'cameraTargetTiles': [1, .5, 1.05], 'orthoScaleTiles': 4,
               'nominalPixelsPerTile': 64, 'genuineBlenderVersion': list(bpy.app.version),
               'frames': frames, 'full72Run': False, 'productionDispatchChanged': False, 'nativeAcceptance': False}
    verify_scene(scene, camera, receipt)
    for yaw in POSES:
        frames.append(render(scene, camera, yaw, 'after-soft-original-materials'))
    source.point_camera(camera, source.TARGET, 60, 40)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SAVED))
    receipt['sourceSha256'] = sha(SAVED)
    receipt['protectedBefore'] = held
    receipt['protectedAfter'] = protected()
    if receipt['protectedAfter'] != held:
        raise ValueError('Library bookshelf preparation changed released source/72/context/UI/native fixtures')
    pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
    pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps(receipt, indent=2) + '\n')
    print('ACTUAL_BOOKSHELF_RETAINED_SHADER_TWO_POSES_PREPARED', receipt['sourceSha256'], json.dumps(frames), flush=True)


if __name__ == '__main__':
    main()
