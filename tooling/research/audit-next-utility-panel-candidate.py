"""Inspect the next existing catalog fixture through its actual current producer."""
from pathlib import Path
import hashlib
import importlib.util
import json
import bpy

ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / 'docs/research/2026-10-03-kitchen-prep-counter-structural-audit'
PROOF.mkdir(parents=True, exist_ok=True)

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tooling/blender' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

producer = load('next_existing_utility_panel_producer', 'render-utility-panel-angled.py')
audit = load('next_existing_utility_complete_audit', 'refine-guard-belt-detail.py')
model = producer.exporter.MODELS[0]
source = ROOT / 'assets/source/blender' / model[1]
original = source.read_bytes()
bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.context.scene
parts = audit.capture(scene)
receipt = {'objectId': 'object.utility-panel', 'assetId': model[0],
    'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(original).hexdigest(),
    'rawMeshes': [audit.raw_record(bpy.data.objects[n]) for n in sorted(parts)],
    'allStoredGraphs': audit.materials_record(), 'sourceBounds': audit.bounds(scene),
    'evaluatedNormals': producer.audit.convex_normal_audit(scene),
    'allPartBounds': {name: {'min': [min(v[i] for v in row['points']) for i in range(3)],
                           'max': [max(v[i] for v in row['points']) for i in range(3)]}
                      for name, row in sorted(parts.items())},
    'actualContacts': [], 'actualFourCanonicalReplay': []}
pairs = [('foot', 'body'), ('foot.001', 'body')]
for side in (-1, 1):
    pairs += [(f'angled-utility.cabinet side cheek {side}', 'body'),
              (f'angled-utility.cabinet side cheek {side}', 'front')]
for one, two in pairs:
    try:
        contacts = audit.actual_triangle_contacts(scene, {one: [two]})
        receipt['actualContacts'].append({'parts': [one, two], 'actualTriangleInterior': contacts})
    except ValueError as error:
        receipt['actualContacts'].append({'parts': [one, two], 'actualTriangleInterior': [], 'observation': str(error)})
scene, camera, target = producer.configure(model)
receipt['acceptedCamera'] = {'resolution': [scene.render.resolution_x, scene.render.resolution_y],
    'orthoScale': camera.data.ortho_scale, 'target': list(target), 'footprint': list(model[3:5]), 'sourceFit': list(model[5:7])}
manifest = json.loads((ROOT / 'public/game-content' / model[2]).read_text())
for yaw in (30, 120, 210, 300):
    elevation = 40
    producer.point_camera(camera, target, yaw, elevation)
    path = PROOF / f'next-utility-panel-yaw{yaw:+03d}-elev{elevation}.png'
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    producer.exporter.normalize_and_check_border(path)
    frame = next(r for r in manifest['frames'] if r['yawDegrees'] == yaw and r['elevationDegrees'] == elevation)
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    receipt['actualFourCanonicalReplay'].append({'yawDegrees': yaw, 'elevationDegrees': elevation,
        'sha256': digest, 'canonicalSha256': frame['sha256'], 'byteEqual': digest == frame['sha256']})
assert all(r['byteEqual'] for r in receipt['actualFourCanonicalReplay'])
assert source.read_bytes() == original
(PROOF / 'next-existing-utility-panel-inventory-and-four-replay.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('NEXT_EXISTING_UTILITY_PANEL', len(parts), len(receipt['allStoredGraphs']), 'FOUR_CANONICAL_BYTE_EQUAL', receipt['sourceSha256'], flush=True)
for name in ('body', 'top', 'front', 'foot', 'foot.001', 'angled-utility.cabinet side cheek -1'):
    print(name, json.dumps(receipt['allPartBounds'][name]), flush=True)
for row in receipt['actualContacts']:
    print(json.dumps(row), flush=True)
