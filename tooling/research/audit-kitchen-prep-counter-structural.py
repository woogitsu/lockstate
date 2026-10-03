"""Read the current complete prep counter and replay four canonical native poses."""
from pathlib import Path
import hashlib
import importlib.util
import json
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
PROOF = ROOT / 'docs/research/2026-10-03-kitchen-prep-counter-structural-audit'
PROOF.mkdir(parents=True, exist_ok=True)

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, ROOT / 'tooling/blender' / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

producer = load('current_prep_counter_producer', 'render-kitchen-prep-counter-oblique.py')
audit = load('current_prep_counter_raw_audit', 'refine-guard-belt-detail.py')
model = producer.exporter.MODELS[0]
source = ROOT / 'assets/source/blender' / model[1]
original = source.read_bytes()
bpy.ops.wm.open_mainfile(filepath=str(source))
scene = bpy.context.scene
parts = audit.capture(scene)
part_bounds = {name: {'min': [min(v[i] for v in row['points']) for i in range(3)],
                      'max': [max(v[i] for v in row['points']) for i in range(3)]}
               for name, row in sorted(parts.items())}
receipt = {'source': source.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(original).hexdigest(),
    'rawMeshes': [audit.raw_record(bpy.data.objects[n]) for n in sorted(parts)],
    'allStoredGraphs': audit.materials_record(), 'evaluatedSourceBounds': audit.bounds(scene),
    'allPartBounds': part_bounds, 'originalRelations': [], 'actualFourCanonicalReplay': []}
# The worktop rests on the carcass with face contact, not interpenetration.
# Confirm the two actual evaluated polygon surfaces independently at their
# shared central plane; a strictly-interior overlap test must reject tangency.
contact_point = Vector((0, 0, part_bounds['counter-body']['max'][2]))
surface_contacts = []
graph = bpy.context.evaluated_depsgraph_get()
for name in ('counter-body', 'worktop'):
    evaluated = bpy.data.objects[name].evaluated_get(graph)
    mesh = evaluated.to_mesh()
    try:
        points = [evaluated.matrix_world @ v.co for v in mesh.vertices]
        tree = BVHTree.FromPolygons(points, [list(face.vertices) for face in mesh.polygons])
        point, normal, face, distance = tree.find_nearest(contact_point)
        surface_contacts.append({'part': name, 'point': list(point), 'geometricNormal': list(normal), 'evaluatedFaceIndex': face, 'distance': distance})
    finally:
        evaluated.to_mesh_clear()
assert all(row['distance'] < 1e-6 for row in surface_contacts)
assert Vector(surface_contacts[0]['geometricNormal']).dot(Vector(surface_contacts[1]['geometricNormal'])) < -1 + 1e-6
receipt['actualCarcassWorktopFaceContact'] = surface_contacts
receipt['shelfBracketCarcassClearanceTiles'] = part_bounds['counter-body']['min'][1] - part_bounds['angled-prep.shelf bracket vertical -1']['max'][1]
pairs = [('counter-body', 'worktop')]
pairs += [(f'foot{suffix}', 'counter-body') for suffix in ('', '.001', '.002', '.003')]
for side in (-1, 1):
    pairs += [(f'angled-prep.shelf bracket vertical {side}', 'counter-body'),
              (f'angled-prep.shelf bracket horizontal {side}', f'angled-prep.shelf bracket vertical {side}'),
              (f'angled-prep.shelf bracket horizontal {side}', 'angled-prep.service shelf')]
for one, two in pairs:
    try:
        contacts = audit.actual_triangle_contacts(scene, {one: [two]})
        receipt['originalRelations'].append({'parts': [one, two], 'actualInteriorContacts': contacts})
    except ValueError as error:
        receipt['originalRelations'].append({'parts': [one, two], 'actualInteriorContacts': [], 'observation': str(error)})

scene, camera, target = producer.configure(model)
receipt['acceptedCamera'] = {'resolution': [scene.render.resolution_x, scene.render.resolution_y],
    'orthoScale': camera.data.ortho_scale, 'target': list(target), 'footprint': list(model[3:5]), 'sourceFit': list(model[5:7])}
manifest = json.loads((ROOT / 'public/game-content' / model[2]).read_text())
for yaw in (30, 120, 210, 300):
    elevation = 40
    producer.point_camera(camera, target, yaw, elevation)
    image = PROOF / f'current-yaw{yaw:+03d}-elev{elevation}.png'
    scene.render.filepath = str(image)
    bpy.ops.render.render(write_still=True)
    producer.exporter.normalize_and_check_border(image)
    frame = next(r for r in manifest['frames'] if r['yawDegrees'] == yaw and r['elevationDegrees'] == elevation)
    digest = hashlib.sha256(image.read_bytes()).hexdigest()
    receipt['actualFourCanonicalReplay'].append({'yawDegrees': yaw, 'elevationDegrees': elevation,
        'sha256': digest, 'canonicalSha256': frame['sha256'], 'byteEqual': digest == frame['sha256']})
assert all(row['byteEqual'] for row in receipt['actualFourCanonicalReplay'])
assert source.read_bytes() == original
(PROOF / 'actual-current-inventory-contacts-and-four-replay.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('PREP_COUNTER_READONLY', len(parts), len(receipt['allStoredGraphs']), 'FOUR_CANONICAL_BYTE_EQUAL', receipt['sourceSha256'], flush=True)
print('ACTUAL_WORKTOP_CARCASS_FACE_CONTACT', json.dumps(surface_contacts), flush=True)
print('SHELF_BRACKET_CLEARANCE_TILES', receipt['shelfBracketCarcassClearanceTiles'], 'NOMINAL_PIXELS', receipt['shelfBracketCarcassClearanceTiles'] * 64, flush=True)
for name in ('counter-body', 'worktop', 'foot', 'foot.001', 'foot.002', 'foot.003', 'angled-prep.service shelf', 'angled-prep.shelf bracket vertical -1', 'angled-prep.shelf bracket horizontal -1'):
    print(name, json.dumps(part_bounds[name]), flush=True)
for row in receipt['originalRelations']:
    print(json.dumps(row), flush=True)
