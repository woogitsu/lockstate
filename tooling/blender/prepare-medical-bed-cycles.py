"""Dedicated retained medical bed: measured connections and authored shader input repair."""
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

source = load('medical_bed_retained_source', HERE / 'render-medical-bed-detail-oblique.py')
audit = source.audit
profile = load('medical_bed_readonly_soft_profile', HERE / 'render-modern-retained-material-draft.py')
profile_reader = load('medical_bed_readonly_profile_reader', HERE / 'prepare-staff-chair-cycles.py')
contact_audit = load('medical_bed_readonly_triangle_contact', HERE / 'refine-canteen-dining-table-detail.py')
REPORT = ROOT / 'docs/research/2026-10-04-medical-bed-retained-cycles'
SAVED = ROOT / 'assets/source/blender/furniture.medical-bed.soft-light.blend'
PROVENANCE = SAVED.with_suffix('.provenance.json')
HISTORY = ROOT / 'assets/source/blender/furniture.medical-bed.workbench-descriptor.v1.json'
MANIFEST = ROOT / 'public/game-content/oblique-furniture.medical-bed.v1.json'
TARGET = Vector((.5, 1, .675000011920929))
POSES = (60, 300)
sha = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()
CONTACTS = {'angled-medical-bed.mattress deck support': ['bed_base', 'mattress']}
for side in ('left', 'right'):
    CONTACTS['angled-medical-bed.' + side + ' lower bearing attachment'] = ['bed_base', 'angled-medical-bed.' + side + ' lower bearing track']
    for end in ('foot', 'head'):
        CONTACTS['angled-medical-bed.' + side + ' ' + end + ' caster continuous axle'] = ['angled-medical-bed.' + side + ' ' + end + ' caster hub cap', 'angled-medical-bed.' + side + ' ' + end + ' caster wheel']
        CONTACTS['angled-medical-bed.' + side + ' ' + end + ' rail coupling socket'] = ['angled-medical-bed.' + side + ' ' + end + ' rail post', 'angled-medical-bed.' + side + ' side safety rail']
for end in ('foot', 'head'):
    CONTACTS['angled-medical-bed.' + end + ' lift cross shaft bearing'] = ['bed_base', 'angled-medical-bed.' + end + ' lift cross shaft']

def contacts(scene):
    try:
        return contact_audit.actual_triangle_contacts(scene, CONTACTS)
    except (ValueError, KeyError) as error:
        raise ValueError('Medical bed actual fixing lacks triangle-interior contact: ' + str(error)) from error

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
        if old['name'] != new['name']: raise ValueError('Medical bed material assignment/name changed')
        old.pop('canonicalMaterialSha256'); expected = copy.deepcopy(new); expected.pop('canonicalMaterialSha256')
        principled = next(node for node in old['nodes'] if node['type'] == 'ShaderNodeBsdfPrincipled')
        base = next(socket for socket in principled['inputs'] if socket['name'] == 'Base Color')
        rough = next(socket for socket in principled['inputs'] if socket['name'] == 'Roughness')
        result.append({'material': old['name'], 'oldBaseRGBA': base['value'], 'newBaseRGBA': old['diffuse'],
                       'oldShaderRoughness': rough['value'], 'newShaderRoughness': old['roughness'],
                       'preservedShaderMetallic': next(s for s in principled['inputs'] if s['name'] == 'Metallic')['value']})
        base['value'] = old['diffuse']; rough['value'] = old['roughness']
        if old != expected: raise ValueError('Medical bed shader repair changed another socket/node/link/property')
    return result

def lighting(scene):
    return {**profile_reader.lighting(scene, TARGET), 'denoiser': scene.cycles.denoiser,
            'denoisingUseGpu': scene.cycles.denoising_use_gpu}

def verify_scene(scene, camera, expected):
    contacts(scene) # Contact omission fails before source hash/frozen-record comparison.
    current = physical(scene)
    if current != expected['physicalAssembly']: raise ValueError('Medical bed saved mesh/graph/contacts/bounds changed')
    if shader_diff(expected['legacyPhysicalAssembly']['completeStoredMaterialGraphs'], current['completeStoredMaterialGraphs']) != expected['exactAuthoredShaderInputRepair']:
        raise ValueError('Medical bed actual authored shader inputs changed')
    retained = expected['legacyPhysicalAssembly']
    for field in ('rawMeshes', 'evaluatedNormals'):
        actual = [row for row in current[field] if row['name'] in retained['evaluatedPositions']]
        if actual != retained[field]: raise ValueError('Medical bed original76 geometry/assignments changed')
    for name, value in retained['evaluatedPositions'].items():
        if current['evaluatedPositions'][name] != value or current['objectMatrices'][name] != retained['objectMatrices'][name]:
            raise ValueError('Medical bed original76 evaluated geometry/anchor changed')
    if lighting(scene) != expected['lightingProfile']: raise ValueError('Medical bed dedicated bounded soft profile changed')
    if camera.data.type != 'ORTHO' or camera.data.ortho_scale != 4:
        raise ValueError('Medical bed actual64px camera changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Medical bed canonical256 resolution changed')
    for turns in range(4):
        for row in audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x - .5, point.y - 1
                for _ in range(turns): x, y = -y, x
                width, height = (1, 2) if turns % 2 == 0 else (2, 1)
                if not (-width/2 <= x <= width/2 and -height/2 <= y <= height/2 and point.z >= -1e-6):
                    raise ValueError('Medical bed escapes actual rotated1x2 footprint')
    return current

def render(scene, camera, yaw, label):
    source.point_camera(camera, TARGET, yaw, 40)
    path = REPORT / f'{label}-yaw{yaw}-elev40.png'
    scene.render.filepath = str(path); began = time.monotonic()
    bpy.ops.render.render(write_still=True); source.exporter.normalize_and_check_border(path)
    return {'stage': label, 'yawDegrees': yaw, 'elevationDegrees': 40,
            'image': path.relative_to(ROOT).as_posix(), 'sha256': sha(path), 'renderSeconds': time.monotonic() - began}

def protected():
    paths = [ROOT / 'assets/source/blender/furniture.medical-bed.angled-detail.blend',
             ROOT / 'assets/source/blender/furniture.medical-bed.angled-detail.provenance.json',
             ROOT / 'assets/source/blender/furniture.medical-bed.variants.blend', MANIFEST,
             ROOT / 'public/game-content/oblique-module-registry.v1.json']
    paths += list((ROOT / 'public/assets/environment/oblique').glob('furniture.medical-bed.variants-*.png'))
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
        print('MEDICAL_BED_SAVED89_GRAPH4_CONTACT26_SOURCE_GREEN', flush=True); return
    held = protected()
    scene, camera, target = source.configure(source.exporter.MODELS[0])
    legacy = physical(scene, False)
    if legacy['meshCount'] != 76 or len(legacy['completeStoredMaterialGraphs']) != 4:
        raise ValueError('Medical bed actual retained76/4graphs changed')
    frames = [render(scene, camera, yaw, 'before-original76-workbench') for yaw in POSES]
    descriptor = json.loads(MANIFEST.read_text())
    for frame in frames:
        old = next(row for row in descriptor['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (frame['yawDegrees'], 40))
        if frame['sha256'] != old['sha256']: raise ValueError('Medical bed original published source photo mismatch')
        frame['byteExactPublishedWorkbench'] = True
    white = bpy.data.materials['warm painted steel']
    accent = bpy.data.materials['rail accent']
    audit.box('mattress deck support', (.5, 1, .379), (.80, 1.60, .035), white, .001)
    for side, x in (('left', .04), ('right', .96)):
        audit.box(side + ' lower bearing attachment', (.08 if side == 'left' else .92, 1, .14), (.13, .40, .20), white, .001)
        for end, y, caster_y in (('foot', .44, .22), ('head', 1.52, 1.78)):
            audit.cylinder(side + ' ' + end + ' caster continuous axle', (.08 if side == 'left' else .92, caster_y, .105), .012, .095, accent, .0005, axis='X')
            audit.cylinder(side + ' ' + end + ' rail coupling socket', (x, y, .831), .018, .055, white, .0005, axis='Z')
    for end, y in (('foot', .73), ('head', 1.27)):
        audit.box(end + ' lift cross shaft bearing', (.5, y, .156), (.11, .07, .08), white, .001)
    # Additions use the already-grounded min-corner coordinates; no second transform.
    connected = physical(scene)
    if connected['meshCount'] != 89 or len(connected['meshBoundConnectivity']['groups']) != 1:
        raise ValueError('Medical bed thirteen measured connections did not join actual assembly')
    frames += [render(scene, camera, yaw, 'before-connected89-workbench') for yaw in POSES]
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
    receipt = {'assetId': 'furniture.medical-bed.variants', 'source': SAVED.relative_to(ROOT).as_posix(),
               'retainedSource': 'assets/source/blender/furniture.medical-bed.angled-detail.blend',
               'retainedSourceSha256': sha(ROOT / 'assets/source/blender/furniture.medical-bed.angled-detail.blend'),
               'legacyPhysicalAssembly': legacy, 'physicalAssembly': repaired,
               'exactAuthoredShaderInputRepair': diffs, 'otherGraphInputsChanged': False,
               'lightingProfile': lighting(scene), 'replacedOriginalLights': original_lights,
               'canonicalMinCornerTranslation': [.5, 1, 0], 'footprintTiles': [1, 2],
               'cameraTargetTiles': list(TARGET), 'orthoScaleTiles': 4, 'nominalPixelsPerTile': 64,
               'genuineBlenderVersion': list(bpy.app.version), 'frames': frames,
               'nativeAcceptance': False, 'full72Run': False, 'productionDispatchChanged': False}
    verify_scene(scene, camera, receipt)
    frames += [render(scene, camera, yaw, 'after-soft-authored-materials') for yaw in POSES]
    source.point_camera(camera, TARGET, 60, 40)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SAVED)); receipt['sourceSha256'] = sha(SAVED)
    receipt['protectedBefore'] = held; receipt['protectedAfter'] = protected()
    if held != receipt['protectedAfter']: raise ValueError('Medical bed preparation changed original sources/UI/palette/consumers')
    pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
    pipeline_common.write_text(REPORT / 'actual-before-after.json', json.dumps(receipt, indent=2) + '\n')
    print('MEDICAL_BED_ACTUAL_SAVED_SOURCE', receipt['sourceSha256'], flush=True)

if __name__ == '__main__': main()
