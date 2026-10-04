"""Dedicated retained medicine cabinet: measured fixing additions and authored shader input repair."""
from pathlib import Path
import copy
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

source = load('medicine_retained_source', HERE / 'render-medicine-cabinet-detail-oblique.py')
audit = source.audit
profile = load('medicine_readonly_soft_profile', HERE / 'render-modern-retained-material-draft.py')
profile_reader = load('medicine_readonly_profile_reader', HERE / 'prepare-staff-chair-cycles.py')
contact_audit = load('medicine_readonly_triangle_contact', HERE / 'refine-canteen-dining-table-detail.py')
REPORT = ROOT / 'docs/research/2026-10-04-medicine-cabinet-retained-cycles'
SAVED = ROOT / 'assets/source/blender/fixture.medicine-cabinet.soft-light.blend'
PROVENANCE = SAVED.with_suffix('.provenance.json')
HISTORY = ROOT / 'assets/source/blender/fixture.medicine-cabinet.workbench-descriptor.v1.json'
MANIFEST = ROOT / 'public/game-content/oblique-fixture.medicine-cabinet.v1.json'
TARGET = Vector((.5, .5, .5899999737739563))
POSES = (60, 300)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
CONTACTS = {}
for side in ('left', 'right'):
    for level in ('lower', 'upper'):
        prefix = 'angled-medicine-cabinet.' + side + ' ' + level + ' hinge'
        CONTACTS[prefix + ' continuous fixing shaft'] = [prefix + suffix for suffix in
            (' lower fixed knuckle', ' moving knuckle', ' upper fixed knuckle', ' pin head')]
CONTACTS['angled-medicine-cabinet.lower toe service backing support'] = ['cabinet_body', 'angled-medicine-cabinet.lower toe service plate']

def contacts(scene):
    try:
        return contact_audit.actual_triangle_contacts(scene, CONTACTS)
    except (ValueError, KeyError) as error:
        raise ValueError('Medicine cabinet actual fixing lacks triangle-interior contact: ' + str(error)) from error

def components(scene):
    rows = audit.capture(scene)
    boxes = {name: ([min(p[a] for p in row['points']) for a in range(3)],
                    [max(p[a] for p in row['points']) for a in range(3)]) for name, row in rows.items()}
    neighbours = {name: [] for name in boxes}
    for index, name in enumerate(sorted(boxes)):
        for other in sorted(boxes)[index + 1:]:
            lo, hi = boxes[name]; a, b = boxes[other]
            if all(min(hi[axis], b[axis]) - max(lo[axis], a[axis]) >= -1e-6 for axis in range(3)):
                neighbours[name].append(other); neighbours[other].append(name)
    seen = set(); groups = []
    for name in sorted(boxes):
        if name in seen: continue
        stack = [name]; seen.add(name); group = []
        while stack:
            current = stack.pop(); group.append(current)
            for other in neighbours[current]:
                if other not in seen: seen.add(other); stack.append(other)
        groups.append(sorted(group))
    return {'method': 'evaluated mesh-bound connectivity, not triangle contact', 'groups': groups}

def physical(scene, require_contacts=True):
    rows = audit.capture(scene)
    names = sorted(rows)
    return {'meshCount': len(names), 'rawMeshes': [audit.raw_record(bpy.data.objects[name]) for name in names],
            'evaluatedPositions': {name: rows[name]['evaluatedPositionSha256'] for name in names},
            'objectMatrices': {name: [list(row) for row in bpy.data.objects[name].matrix_world] for name in names},
            'completeStoredMaterialGraphs': audit.materials_record(), 'evaluatedNormals': audit.convex_normal_audit(scene),
            'actualTriangleInteriorContacts': contacts(scene) if require_contacts else [],
            'meshBoundConnectivity': components(scene),
            'minCornerBounds': {'min': [min(p[a] for row in rows.values() for p in row['points']) for a in range(3)],
                                'max': [max(p[a] for row in rows.values() for p in row['points']) for a in range(3)]}}

def shader_diff(before, after):
    original = copy.deepcopy(before)
    result = []
    for old, new in zip(original, after):
        if old['name'] != new['name']: raise ValueError('Medicine material assignment/name changed')
        old.pop('canonicalMaterialSha256'); expected = copy.deepcopy(new); expected.pop('canonicalMaterialSha256')
        principled = next(node for node in old['nodes'] if node['type'] == 'ShaderNodeBsdfPrincipled')
        base = next(socket for socket in principled['inputs'] if socket['name'] == 'Base Color')
        rough = next(socket for socket in principled['inputs'] if socket['name'] == 'Roughness')
        result.append({'material': old['name'], 'oldBaseRGBA': base['value'], 'newBaseRGBA': old['diffuse'],
                       'oldShaderRoughness': rough['value'], 'newShaderRoughness': old['roughness'],
                       'preservedShaderMetallic': next(s for s in principled['inputs'] if s['name'] == 'Metallic')['value']})
        base['value'] = old['diffuse']; rough['value'] = old['roughness']
        if old != expected: raise ValueError('Medicine cabinet shader repair changed another socket/node/link/property')
    return result

def lighting(scene):
    return {**profile_reader.lighting(scene, TARGET), 'denoiser': scene.cycles.denoiser,
            'denoisingUseGpu': scene.cycles.denoising_use_gpu}

def verify_scene(scene, camera, expected):
    contacts(scene) # Contact omission fails before source hash/frozen-record comparison.
    current = physical(scene)
    if current != expected['physicalAssembly']: raise ValueError('Medicine cabinet saved mesh/graph/contacts/bounds changed')
    if shader_diff(expected['legacyPhysicalAssembly']['completeStoredMaterialGraphs'], current['completeStoredMaterialGraphs']) != expected['exactAuthoredShaderInputRepair']:
        raise ValueError('Medicine cabinet actual authored shader inputs changed')
    retained = expected['legacyPhysicalAssembly']
    for field in ('rawMeshes', 'evaluatedNormals'):
        actual = [row for row in current[field] if row['name'] in retained['evaluatedPositions']]
        if actual != retained[field]: raise ValueError('Medicine cabinet original66 geometry/assignments changed')
    for name, value in retained['evaluatedPositions'].items():
        if current['evaluatedPositions'][name] != value or current['objectMatrices'][name] != retained['objectMatrices'][name]:
            raise ValueError('Medicine cabinet original66 evaluated geometry/anchor changed')
    if lighting(scene) != expected['lightingProfile']: raise ValueError('Medicine cabinet dedicated bounded soft profile changed')
    if camera.data.type != 'ORTHO' or camera.data.ortho_scale != 4:
        raise ValueError('Medicine cabinet actual64px camera changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Medicine cabinet canonical256 resolution changed')
    for turns in range(4):
        for row in audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x - .5, point.y - .5
                for _ in range(turns): x, y = -y, x
                if not (-.5 <= x <= .5 and -.5 <= y <= .5 and point.z >= -1e-6):
                    raise ValueError('Medicine cabinet escapes actual rotated1x1 footprint')
    return current

def render(scene, camera, yaw, label):
    source.point_camera(camera, TARGET, yaw, 40)
    path = REPORT / f'{label}-yaw{yaw}-elev40.png'
    scene.render.filepath = str(path); began = time.monotonic()
    bpy.ops.render.render(write_still=True); source.exporter.normalize_and_check_border(path)
    return {'stage': label, 'yawDegrees': yaw, 'elevationDegrees': 40,
            'image': path.relative_to(ROOT).as_posix(), 'sha256': sha(path), 'renderSeconds': time.monotonic() - began}

def protected():
    paths = [ROOT / 'assets/source/blender/fixture.medicine-cabinet.angled-detail.blend',
             ROOT / 'assets/source/blender/fixture.medicine-cabinet.angled-detail.provenance.json',
             ROOT / 'assets/source/blender/fixture.medicine-cabinet.variants.blend', MANIFEST,
             ROOT / 'public/game-content/oblique-module-registry.v1.json']
    paths += list((ROOT / 'public/assets/environment/oblique').glob('fixture.medicine-cabinet.variants-*.png'))
    for folder in ('src', 'tests/browser'):
        paths += [path for path in (ROOT / folder).rglob('*') if path.is_file()]
    return {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(set(paths))}

def main():
    REPORT.mkdir(parents=True, exist_ok=True)
    if '--verify-saved' in sys.argv or '--refresh-saved-comparison' in sys.argv:
        expected = json.loads(PROVENANCE.read_text())
        bpy.ops.wm.open_mainfile(filepath=str(SAVED)); scene = bpy.context.scene
        verify_scene(scene, scene.camera, expected)
        if '--refresh-saved-comparison' in sys.argv:
            expected['frames'] = [row for row in expected['frames'] if row['stage'] != 'after-soft-authored-materials']
            expected['frames'] += [render(scene, scene.camera, yaw, 'after-soft-authored-materials') for yaw in POSES]
            expected['afterRenderedFromActualSavedSource'] = True
            pipeline_common.write_text(PROVENANCE, json.dumps(expected, indent=2) + '\n')
            pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps(expected, indent=2) + '\n')
        print('MEDICINE_CABINET_SAVED71_GRAPH3_CONTACT18_SOURCE_GREEN', flush=True); return
    held = protected()
    scene, camera, target = source.configure(source.exporter.MODELS[0])
    legacy = physical(scene, False)
    if legacy['meshCount'] != 66 or len(legacy['completeStoredMaterialGraphs']) != 3:
        raise ValueError('Medicine cabinet actual retained66/3graphs changed')
    frames = [render(scene, camera, yaw, 'before-original66-workbench') for yaw in POSES]
    descriptor = json.loads(MANIFEST.read_text())
    for frame in frames:
        old = next(row for row in descriptor['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (frame['yawDegrees'], 40))
        if frame['sha256'] != old['sha256']: raise ValueError('Medicine cabinet original published source photo mismatch')
        frame['byteExactPublishedWorkbench'] = True
    for side, sign in (('left', -1), ('right', 1)):
        for level, z in (('lower', .25), ('upper', .96)):
            audit.cylinder(side + ' ' + level + ' hinge continuous fixing shaft',
                           (.5 + sign * .376, .5 + .418, z + .004 - .03), .004, .108,
                           bpy.data.materials['brass handle'], .0005, axis='Z')
    audit.box('lower toe service backing support', (.5, .830, .065 - .03), (.66, .075, .024),
              bpy.data.materials['cabinet warm white'], .001)
    # Original detail grounding translates all source objects by -.03; retain it for additions too.
    connected = physical(scene)
    if connected['meshCount'] != 71 or len(connected['meshBoundConnectivity']['groups']) != 1:
        raise ValueError('Medicine cabinet five measured fixings did not join actual assembly')
    frames += [render(scene, camera, yaw, 'before-connected71-workbench') for yaw in POSES]
    for material in bpy.data.materials:
        node = next(node for node in material.node_tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled')
        node.inputs['Base Color'].default_value = material.diffuse_color
        node.inputs['Roughness'].default_value = material.roughness
    repaired = physical(scene)
    diffs = shader_diff(legacy['completeStoredMaterialGraphs'], repaired['completeStoredMaterialGraphs'])
    original_lights = [{'name': obj.name, 'type': obj.data.type} for obj in scene.objects if obj.type == 'LIGHT']
    for obj in list(scene.objects):
        if obj.type == 'LIGHT': bpy.data.objects.remove(obj, do_unlink=True)
    profile.soft_original_materials(scene, TARGET)
    scene.cycles.samples = 128; scene.cycles.use_denoising = True
    scene.cycles.denoiser = 'OPENIMAGEDENOISE'; scene.cycles.denoising_use_gpu = False
    receipt = {'assetId': 'fixture.medicine-cabinet.variants', 'source': SAVED.relative_to(ROOT).as_posix(),
               'retainedSource': 'assets/source/blender/fixture.medicine-cabinet.angled-detail.blend',
               'retainedSourceSha256': sha(ROOT / 'assets/source/blender/fixture.medicine-cabinet.angled-detail.blend'),
               'legacyPhysicalAssembly': legacy, 'physicalAssembly': repaired,
               'exactAuthoredShaderInputRepair': diffs, 'otherGraphInputsChanged': False,
               'lightingProfile': lighting(scene), 'replacedOriginalLights': original_lights,
               'canonicalMinCornerTranslation': [.5, .5, 0], 'footprintTiles': [1, 1],
               'cameraTargetTiles': list(TARGET), 'orthoScaleTiles': 4, 'nominalPixelsPerTile': 64,
               'genuineBlenderVersion': list(bpy.app.version), 'frames': frames,
               'nativeAcceptance': False, 'full72Run': False, 'productionDispatchChanged': False}
    verify_scene(scene, camera, receipt)
    frames += [render(scene, camera, yaw, 'after-soft-authored-materials') for yaw in POSES]
    source.point_camera(camera, TARGET, 60, 40)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SAVED)); receipt['sourceSha256'] = sha(SAVED)
    receipt['protectedBefore'] = held; receipt['protectedAfter'] = protected()
    if held != receipt['protectedAfter']: raise ValueError('Medicine cabinet preparation changed original sources/UI/palette/consumers')
    pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
    pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps(receipt, indent=2) + '\n')
    print('MEDICINE_CABINET_ACTUAL_SAVED_SOURCE', receipt['sourceSha256'], flush=True)

if __name__ == '__main__': main()