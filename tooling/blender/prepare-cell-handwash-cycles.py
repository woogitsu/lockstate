"""Genuine two-pose retained Cell handwash sink shader/light source preparation."""
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


source = load('handwash_retained_canonical_producer', HERE / 'render-handwash-sink-oblique.py')
audit = load('handwash_retained_full_audit', HERE / 'refine-guard-belt-detail.py')
CONTACTS = {'faucet spout': ['faucet neck'], 'faucet neck': ['faucet stem'], 'porcelain pedestal': ['ceramic washstand', 'pedestal foot']}
def source_contacts(scene):
    return audit.actual_triangle_contacts(scene, CONTACTS)
profile = load('handwash_inspected_soft_laundry_profile', HERE / 'render-modern-retained-material-draft.py')
profile_reader = load('handwash_saved_soft_profile_reader', HERE / 'prepare-staff-chair-cycles.py')
REPORT = ROOT / 'docs/research/2026-10-04-cell-handwash-retained-cycles'
SAVED = ROOT / 'assets/source/blender/fixture.cell.sink.handwash.soft-light.blend'
PROVENANCE = SAVED.with_suffix('.provenance.json')
HISTORY = ROOT / 'assets/source/blender/fixture.cell.sink.handwash.workbench-descriptor.v1.json'
source.SOURCE = ROOT / 'assets/source/blender/fixture.cell.sink.handwash.blend'
source.MANIFEST = ROOT / 'public/game-content/oblique-fixture-cell-sink-handwash.v1.json'
source.TARGET = Vector((.5, .5, .505))
source.normalize_and_check_border = source.exporter.normalize_and_check_border
source.point_camera = source.exporter.point_camera
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
            'actualInteriorContacts': source_contacts(scene),
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
        raise ValueError('Handwash full shader graph changes exceed exact authored RGBA/roughness repair')


def verify_scene(scene, camera, expected):
    verify_exact_graph_repair(expected['literalStoredGraphs'], audit.materials_record())
    # Real contact guard runs before frozen geometry/hash checks.
    source_contacts(scene)
    if physical(scene) != expected['physicalAssembly']:
        raise ValueError('Cell handwash sink retained geometry/full materials/normals/contacts/bounds changed')
    if lighting(scene) != expected['lightingProfile']:
        raise ValueError('Cell handwash sink actual bounded saved soft lighting changed')
    if camera.data.type != 'ORTHO' or camera.data.ortho_scale != 4 or list(source.TARGET) != list(source.TARGET):
        raise ValueError('Cell handwash sink canonical64px camera/target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Cell handwash sink canonical256RGBA resolution changed')
    for turns in range(4):
        width, height = (1, 1)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x - .5, point.y - .5
                for _ in range(turns): x, y = -y, x
                if not (-width / 2 <= x <= width / 2 and -height / 2 <= y <= height / 2 and point.z >= -1e-6):
                    raise ValueError('Cell handwash sink retained surface escapes rotated1x1 footprint')
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
             source.MANIFEST,
             ROOT / 'public/game-content/oblique-module-registry.v1.json', ROOT / 'src/content/room-catalog.ts',
             ROOT / 'src/content/room-template-catalog.ts',
             HERE / 'render-kitchen-fixtures-oblique.py', HERE / 'render-modern-retained-material-draft.py',
             HERE / 'prepare-kitchen-stove-cycles.py', HERE / 'prepare-kitchen-fridge-cycles.py']
    paths += list((ROOT / 'public/assets/environment/oblique').glob('fixture.cell.sink.handwash*.png'))
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
        print('HANDWASH_TWO_AFTER_POSES_FROM_ACTUAL_SAVED_SOURCE_GREEN', flush=True)
        return
    if '--verify-saved' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(SAVED))
        verify_scene(bpy.context.scene, bpy.context.scene.camera, json.loads(PROVENANCE.read_text(encoding='utf-8')))
        print('ACTUAL_SAVED_HANDWASH17_GRAPH5_CONTACTS_CAMERA64_PROFILE_GREEN', flush=True)
        return
    held = protected()
    scene, camera, target = source.configure(source.exporter.MODELS[0])
    original = physical(scene)
    if original['meshCount'] != 17 or len(original['completeStoredMaterialGraphs']) != 5 or len(original['actualInteriorContacts']) != 4:
        raise ValueError('Cell handwash sink complete retained17parts/fivegraphs/physical contacts incomplete')
    materials = material_audit()
    for material in materials:
        if material['shaderBaseColor'] != [.800000011920929]*3+[1.] or material['shaderRoughness'] != .5 or material['baseColorLinked'] or material['roughnessLinked']:
            raise ValueError('Handwash exact default-grey source input contract differs: ' + material['name'])
    frames = []
    descriptor = json.loads(source.MANIFEST.read_text(encoding='utf-8'))
    for yaw in POSES:
        frame = render(scene, camera, yaw, 'before-workbench')
        expected = next(row for row in descriptor['frames'] if row['yawDegrees'] == yaw and row['elevationDegrees'] == 40)
        if frame['sha256'] != expected['sha256']:
            raise ValueError('Actual before Cell handwash sink render differs from published Workbench body')
        frame['byteExactPublishedWorkbench'] = True
        frames.append(frame)
    original_lights = [{'name': obj.name, 'type': obj.data.type} for obj in scene.objects if obj.type == 'LIGHT']
    for obj in list(scene.objects):
        if obj.type == 'LIGHT': bpy.data.objects.remove(obj, do_unlink=True)
    profile.soft_original_materials(scene, source.TARGET)
    # Literal graph response is retained separately before the authorized repair.
    literal_frames = [render(scene, camera, yaw, 'literal-grey-soft-original-graphs') for yaw in POSES]
    literal_path = SAVED.with_name('fixture.cell.sink.handwash.literal-graph-soft-light.blend')
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
               'literalGraphSourceSha256': sha(literal_path), 'literalFrames': literal_frames, 'repairedMaterialAudit': material_audit(), 'replacedOriginalLights': original_lights, 'canonicalMinCornerTranslation': [.5,.5,0],
               'footprintTiles': [1, 1], 'cameraTargetTiles': list(source.TARGET), 'orthoScaleTiles': 4,
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
        raise ValueError('Cell handwash sink preparation changed released source/72/context/UI/native fixtures')
    pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
    pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps(receipt, indent=2) + '\n')
    print('ACTUAL_HANDWASH_REPAIRED_SHADER_TWO_POSES_PREPARED', receipt['sourceSha256'], json.dumps(frames), flush=True)


if __name__ == '__main__':
    main()
