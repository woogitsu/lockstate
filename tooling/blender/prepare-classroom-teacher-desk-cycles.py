"""Genuine two-pose retained Classroom teacher desk shader/light source preparation."""
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


source = load('classroom_teacher_desk_retained_canonical_producer', HERE / 'render-classroom-teacher-desk-oblique.py')
audit = source.builder.audit
ORIGINAL_PAIRS = source.receipt['actualContactPairs']
profile = load('classroom_teacher_desk_inspected_soft_laundry_profile', HERE / 'render-modern-retained-material-draft.py')
profile_reader = load('classroom_teacher_desk_saved_soft_profile_reader', HERE / 'prepare-staff-chair-cycles.py')
REPORT = ROOT / 'docs/research/2026-10-04-classroom-teacher-desk-retained-cycles'
SAVED = ROOT / 'assets/source/blender/furniture.classroom.teacher-desk.soft-light.blend'
PROVENANCE = SAVED.with_suffix('.provenance.json')
HISTORY = ROOT / 'assets/source/blender/furniture.classroom.teacher-desk.workbench-descriptor.v1.json'
source.SOURCE = ROOT / 'assets/source/blender/furniture.classroom.teacher-desk.blend'
source.MANIFEST = ROOT / 'public/game-content/oblique-furniture-classroom-teacher-desk.v1.json'
source.TARGET = Vector((1, .5, 0.6349999904632568))
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
            'evaluatedNormals': audit.normal_record(scene),
            'actualInteriorContacts': source.builder.source_contacts(scene, ORIGINAL_PAIRS),
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
                     'shaderMetallic': shader.inputs['Metallic'].default_value if shader else None,
                     'baseColorLinked': shader.inputs['Base Color'].is_linked if shader else None,
                     'roughnessLinked': shader.inputs['Roughness'].is_linked if shader else None})
    return rows


def lighting(scene):
    return {**profile_reader.lighting(scene, source.TARGET),
            'denoiser': scene.cycles.denoiser, 'denoisingUseGpu': scene.cycles.denoising_use_gpu}


def verify_exact_graph_repair(before, after):
    import copy
    expected = copy.deepcopy(before)
    for material in expected:
        material.pop('canonicalMaterialSha256', None)
        for node in material['nodes']:
            if node['type'] != 'ShaderNodeBsdfPrincipled': continue
            for socket in node['inputs']:
                if socket['name'] == 'Base Color': socket['value'] = material['diffuse']
                if socket['name'] == 'Roughness': socket['value'] = material['roughness']
    actual = copy.deepcopy(after)
    for material in actual: material.pop('canonicalMaterialSha256', None)
    if actual != expected:
        raise ValueError('Teacher full shader graph changes exceed exact authored RGBA/roughness repair')


def verify_scene(scene, camera, expected):
    verify_exact_graph_repair(expected['literalStoredGraphs'], audit.materials_record())
    # Real contact guard runs before frozen geometry/hash checks.
    source.builder.source_contacts(scene, ORIGINAL_PAIRS)
    if physical(scene) != expected['physicalAssembly']:
        raise ValueError('Classroom teacher desk retained geometry/full materials/normals/contacts/bounds changed')
    if lighting(scene) != expected['lightingProfile']:
        raise ValueError('Classroom teacher desk actual bounded saved soft lighting changed')
    if camera.data.type != 'ORTHO' or camera.data.ortho_scale != 4 or list(source.TARGET) != [1, .5, 0.6349999904632568]:
        raise ValueError('Classroom teacher desk canonical64px camera/target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Classroom teacher desk canonical256RGBA resolution changed')
    for turns in range(4):
        width, height = (2, 1) if turns % 2 == 0 else (1, 2)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x - 1, point.y - .5
                for _ in range(turns): x, y = -y, x
                if not (-width / 2 <= x <= width / 2 and -height / 2 <= y <= height / 2 and point.z >= -1e-6):
                    raise ValueError('Classroom teacher desk retained surface escapes rotated2x1 footprint')
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
             ROOT / 'src/content/room-template-catalog.ts',
             HERE / 'render-kitchen-fixtures-oblique.py', HERE / 'render-modern-retained-material-draft.py',
             HERE / 'prepare-kitchen-stove-cycles.py', HERE / 'prepare-kitchen-fridge-cycles.py']
    paths += list((ROOT / 'public/assets/environment/oblique').glob('furniture.classroom.teacher-desk*.png'))
    for folder in ['tests/browser', 'src/rendering', 'src/ui']:
        paths += [path for path in (ROOT / folder).rglob('*') if path.is_file()]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(set(paths))}


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
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
        print('CLASSROOM_DESK_TWO_AFTER_POSES_FROM_ACTUAL_SAVED_SOURCE_GREEN', flush=True)
        return
    if '--verify-saved' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(SAVED))
        verify_scene(bpy.context.scene, bpy.context.scene.camera, json.loads(PROVENANCE.read_text(encoding='utf-8')))
        print('ACTUAL_SAVED_CLASSROOM_DESK133_GRAPH6_CONTACTS_CAMERA64_PROFILE_GREEN', flush=True)
        return
    held = protected()
    scene, camera, target = source.configure(source.MODEL)
    original = physical(scene)
    if original['meshCount'] != 133 or len(original['completeStoredMaterialGraphs']) != 6 or len(original['actualInteriorContacts']) != len(ORIGINAL_PAIRS):
        raise ValueError('Classroom teacher desk complete retained133parts/sixgraphs/physical contacts incomplete')
    materials = material_audit()
    for material in materials:
        if material['shaderBaseColor'] != [.800000011920929]*3+[1.] or material['shaderRoughness'] != .5 or material['baseColorLinked'] or material['roughnessLinked']:
            raise ValueError('Teacher exact default-grey source input contract differs: ' + material['name'])
    frames = []
    descriptor = json.loads(source.MANIFEST.read_text(encoding='utf-8'))
    for yaw in POSES:
        frame = render(scene, camera, yaw, 'before-workbench')
        expected = next(row for row in descriptor['frames'] if row['yawDegrees'] == yaw and row['elevationDegrees'] == 40)
        if frame['sha256'] != expected['sha256']:
            raise ValueError('Actual before Classroom teacher desk render differs from published Workbench body')
        frame['byteExactPublishedWorkbench'] = True
        frames.append(frame)
    original_lights = [{'name': obj.name, 'type': obj.data.type} for obj in scene.objects if obj.type == 'LIGHT']
    for obj in list(scene.objects):
        if obj.type == 'LIGHT': bpy.data.objects.remove(obj, do_unlink=True)
    profile.soft_original_materials(scene, source.TARGET)
    # Literal graph response is retained separately before the authorized repair.
    literal_frames = [render(scene, camera, yaw, 'literal-grey-soft-original-graphs') for yaw in POSES]
    literal_path = SAVED.with_name('furniture.classroom.teacher-desk.literal-graph-soft-light.blend')
    source.point_camera(camera, source.TARGET, 60, 40)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(literal_path))
    # Synchronize exactly the existing approved diffuse RGBA/roughness, no Metallic transfer.
    for material in bpy.data.materials:
        shader = next(node for node in material.node_tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled')
        shader.inputs['Base Color'].default_value = material.diffuse_color
        shader.inputs['Roughness'].default_value = material.roughness
    repaired_graphs = audit.materials_record()
    verify_exact_graph_repair(original['completeStoredMaterialGraphs'], repaired_graphs)
    literal_assembly = original
    original = {**original, 'completeStoredMaterialGraphs': repaired_graphs}
    receipt = {'assetId': source.ASSET_ID, 'source': SAVED.relative_to(ROOT).as_posix(),
               'retainedSource': source.SOURCE.relative_to(ROOT).as_posix(), 'retainedSourceSha256': sha(source.SOURCE),
               'physicalAssembly': original, 'lightingProfile': lighting(scene),
               'originalMaterialAudit': materials, 'materialGraphsChanged': True, 'literalStoredGraphs': literal_assembly['completeStoredMaterialGraphs'],
               'exactRepairSockets': ['Base Color','Roughness'], 'literalGraphSource': literal_path.relative_to(ROOT).as_posix(),
               'literalGraphSourceSha256': sha(literal_path), 'literalFrames': literal_frames, 'repairedMaterialAudit': material_audit(), 'replacedOriginalLights': original_lights, 'canonicalMinCornerTranslation': [1,.5,0],
               'footprintTiles': [2, 1], 'cameraTargetTiles': [1, .5, 0.6349999904632568], 'orthoScaleTiles': 4,
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
        raise ValueError('Classroom teacher desk preparation changed released source/72/context/UI/native fixtures')
    pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
    pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps(receipt, indent=2) + '\n')
    print('ACTUAL_CLASSROOM_DESK_REPAIRED_SHADER_TWO_POSES_PREPARED', receipt['sourceSha256'], json.dumps(frames), flush=True)


if __name__ == '__main__':
    main()
