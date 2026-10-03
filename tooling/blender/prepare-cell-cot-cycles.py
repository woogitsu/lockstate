"""Genuine two-pose retained Basic Cell cot shader/light source preparation."""
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


source = load('cot_retained_canonical_producer', HERE / 'render-cell-cot-oblique.py')
audit = load('cot_retained_physical_audit', HERE / 'refine-cell-cot-detail.py')
profile = load('cot_inspected_soft_laundry_profile', HERE / 'render-modern-retained-material-draft.py')
profile_reader = load('cot_saved_soft_profile_reader', HERE / 'prepare-staff-chair-cycles.py')
REPORT = ROOT / 'docs/research/2026-10-03-cell-cot-retained-cycles'
SAVED = ROOT / 'assets/source/blender/furniture.cell.cot.single.soft-light.blend'
PROVENANCE = SAVED.with_suffix('.provenance.json')
HISTORY = ROOT / 'assets/source/blender/furniture.cell.cot.single.workbench-descriptor.v1.json'
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
            'geometricNormals': audit.convex_normal_audit(scene),
            'actualInteriorContacts': audit.actual_triangle_contacts(scene, ORIGINAL_RECEIPT['actualContactTargets']),
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


def verify_scene(scene, camera, expected):
    # Real contact guard runs first, before frozen records/hash checks.
    audit.actual_triangle_contacts(scene, ORIGINAL_RECEIPT['actualContactTargets'])
    if physical(scene) != expected['physicalAssembly']:
        raise ValueError('Cot retained geometry/full materials/normals/contacts/bounds changed')
    if profile_reader.lighting(scene, source.TARGET) != expected['lightingProfile']:
        raise ValueError('Cot actual bounded saved soft lighting changed')
    if camera.data.type != 'ORTHO' or camera.data.ortho_scale != 4 or list(source.TARGET) != [.5, 1, .3499999940395355]:
        raise ValueError('Cot canonical64px camera/target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Cot canonical256RGBA resolution changed')
    for turns in range(4):
        width, height = (1, 2) if turns % 2 == 0 else (2, 1)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x - .5, point.y - 1
                for _ in range(turns): x, y = -y, x
                if not (-width / 2 <= x <= width / 2 and -height / 2 <= y <= height / 2 and point.z >= -1e-6):
                    raise ValueError('Cot retained surface escapes rotated1×2 footprint')
    return expected['physicalAssembly']


def render(scene, camera, yaw, label):
    source.point_camera(camera, yaw, 40)
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
    paths += list((ROOT / 'public/assets/environment/oblique').glob('furniture.cell.cot.single-*.png'))
    for folder in ['tests/browser', 'src/rendering', 'src/ui']:
        paths += [path for path in (ROOT / folder).rglob('*') if path.is_file()]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(set(paths))}


def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    if '--verify-saved' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(SAVED))
        verify_scene(bpy.context.scene, bpy.context.scene.camera, json.loads(PROVENANCE.read_text(encoding='utf-8')))
        print('ACTUAL_SAVED_COT25_GRAPH9_CONTACT6_CAMERA64_PROFILE_GREEN', flush=True)
        return
    held = protected()
    scene, camera = source.configure()
    original = physical(scene)
    if original['meshCount'] != 25 or len(original['completeStoredMaterialGraphs']) != 9 or len(original['actualInteriorContacts']) != 6:
        raise ValueError('Cot complete retained25parts/9graphs/6contacts incomplete')
    materials = material_audit()
    for material in materials:
        if material['users'] and material['shaderBaseColor'] != material['diffuseRGBA']:
            raise ValueError('Cot used shader color differs from authored approved diffuse: ' + material['name'])
    frames = []
    descriptor = json.loads(source.MANIFEST.read_text(encoding='utf-8'))
    for yaw in POSES:
        frame = render(scene, camera, yaw, 'before-workbench')
        expected = next(row for row in descriptor['frames'] if row['yawDegrees'] == yaw and row['elevationDegrees'] == 40)
        if frame['sha256'] != expected['sha256']:
            raise ValueError('Actual before cot render differs from published Workbench body')
        frame['byteExactPublishedWorkbench'] = True
        frames.append(frame)
    profile.soft_original_materials(scene, source.TARGET)
    receipt = {'assetId': source.ASSET_ID, 'source': SAVED.relative_to(ROOT).as_posix(),
               'retainedSource': source.SOURCE.relative_to(ROOT).as_posix(), 'retainedSourceSha256': sha(source.SOURCE),
               'physicalAssembly': original, 'lightingProfile': profile_reader.lighting(scene, source.TARGET),
               'originalMaterialAudit': materials, 'materialGraphsChanged': False,
               'footprintTiles': [1, 2], 'cameraTargetTiles': [.5, 1, .35], 'orthoScaleTiles': 4,
               'nominalPixelsPerTile': 64, 'genuineBlenderVersion': list(bpy.app.version),
               'frames': frames, 'full72Run': False, 'productionDispatchChanged': False, 'nativeAcceptance': False}
    verify_scene(scene, camera, receipt)
    for yaw in POSES:
        frames.append(render(scene, camera, yaw, 'after-soft-original-materials'))
    source.point_camera(camera, 60, 40)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SAVED))
    receipt['sourceSha256'] = sha(SAVED)
    receipt['protectedBefore'] = held
    receipt['protectedAfter'] = protected()
    if receipt['protectedAfter'] != held:
        raise ValueError('Cot preparation changed released source/72/context/UI/native fixtures')
    pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
    pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps(receipt, indent=2) + '\n')
    print('ACTUAL_COT_RETAINED_SHADER_TWO_POSES_PREPARED', receipt['sourceSha256'], json.dumps(frames), flush=True)


if __name__ == '__main__':
    main()
