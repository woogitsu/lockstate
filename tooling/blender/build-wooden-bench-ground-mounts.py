"""Retain the complete 42-part bench and connect its four authored floor plates."""
from pathlib import Path
import hashlib
import importlib.util
import json
import math
import sys
import bpy

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()

def load(name, file):
    spec = importlib.util.spec_from_file_location(name, HERE / file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

audit = load('ground_mount_retained_bench', 'refine-wooden-bench-crossrails.py')
contact_reader = load('ground_mount_actual_contact_reader', 'build-staff-room-padded-chair.py')
ORIGINAL = ROOT / 'assets/source/blender/furniture.corridor.bench.angled-detail.blend'
ORIGINAL_SHA = '4b174ad498260ac3c736d2b4d78fb1f566cface5bab81d513fb2e00a4568ab81'
SOURCE = ROOT / 'assets/source/blender/furniture.corridor.bench.grounded-detail.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
PREFIX = 'physical-bench.ground mounting shoe '

def contacts(scene, pairs):
    try:
        return contact_reader.source_contacts(scene, pairs)
    except ValueError as error:
        raise ValueError('Bench floor mounting shoe actual contact disconnected: ' + str(error)) from error

def occupied_bounds(scene):
    value = audit.bounds(scene)
    for turns in range(4):
        width, height = (2, 1) if turns % 2 == 0 else (1, 2)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x, point.y
                for _ in range(turns): x, y = -y, x
                if not (0 <= x + width / 2 <= width and 0 <= y + height / 2 <= height and point.z >= -1e-6):
                    raise ValueError('Bench ground mount escapes actual unchanged occupied footprint')
    return value

def verify_source(scene):
    p = json.loads(PROVENANCE.read_text())
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    if names != sorted(p['allAuthoredEvaluatedHashes']):
        raise ValueError('Bench floor mount complete retained/authored part set changed')
    # Test actual physical contacts before identity/geometry hashes, including
    # the previous lower tie repair rather than hiding it behind new shoes.
    contacts(scene, p['actualContactPairs'])
    audit.actual_triangle_contacts(scene, p['retainedLowerTieContactTargets'])
    if [audit.raw_record(bpy.data.objects[n]) for n in names] != p['allAuthoredRawMeshes']:
        raise ValueError('Bench floor mount original raw topology/modifiers/material assignments changed')
    if audit.materials_record() != p['retainedStoredMaterialGraphs']:
        raise ValueError('Bench floor mount all nine full authored material graphs changed')
    rows = audit.capture(scene)
    if {n: rows[n]['evaluatedPositionSha256'] for n in names} != p['allAuthoredEvaluatedHashes']:
        raise ValueError('Bench floor mount actual evaluated assembly changed')
    if audit.convex_normal_audit(scene) != p['authoredEvaluatedNormals']:
        raise ValueError('Bench floor mount actual geometric normals changed')
    if occupied_bounds(scene) != p['sourceEvaluatedBounds']:
        raise ValueError('Bench floor mount full source bounds changed')
    for path, digest in [('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / p[path]).read_bytes()).hexdigest() != p[digest]:
            raise ValueError('Bench floor mount source identity changed')
    print('BENCH_GROUND_MOUNTS_SOURCE_GREEN 46 parts/42 retained/9 graphs/8 ground +6 retained tie contacts', flush=True)
    return p

def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA:
        raise ValueError('Actual retained 42-part bench identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    before = audit.capture(scene)
    names = sorted(before)
    if len(names) != 42: raise ValueError('Expected every retained bench part and both previous crossrails')
    graphs = audit.materials_record()
    if len(graphs) != 9: raise ValueError('Expected all nine original full stored material graphs')
    raw = [audit.raw_record(bpy.data.objects[n]) for n in names]
    matrices = {n: [list(row) for row in bpy.data.objects[n].matrix_world] for n in names}
    old_bounds = occupied_bounds(scene)
    old_normals = audit.convex_normal_audit(scene)
    previous = json.loads(ORIGINAL.with_suffix('.provenance.json').read_text())
    original_contacts = audit.actual_triangle_contacts(scene, previous['actualContactTargets'])
    gaps, pairs = [], []
    steel = bpy.data.objects['Lower steel tie'].data.materials[0]
    for material in bpy.data.materials:
        if material.users == 0: material.use_fake_user = True
    for x_suffix in ('-0.7', '0.7'):
        for y_suffix in ('-0.41', '0.41'):
            leg_name = 'Angled support.' + x_suffix + '.' + y_suffix
            plate_name = 'Anchor plate.' + x_suffix + '.' + y_suffix
            leg_points, plate_points = before[leg_name]['points'], before[plate_name]['points']
            leg_y = (min(v.y for v in leg_points) + max(v.y for v in leg_points)) / 2
            plate_y = (min(v.y for v in plate_points) + max(v.y for v in plate_points)) / 2
            gap = max(min(v.y for v in leg_points), min(v.y for v in plate_points)) - min(max(v.y for v in leg_points), max(v.y for v in plate_points))
            gaps.append({'leg': leg_name, 'plate': plate_name, 'minimumSurfaceSeparationTiles': gap, 'nominalPixelsAt64': gap * 64})
            if not (.079 < gap < .080): raise ValueError('Measured original disconnected ground assembly changed')
            x = (min(v.x for v in leg_points) + max(v.x for v in leg_points)) / 2
            slope = -.058 / (plate_y - leg_y)
            bpy.ops.mesh.primitive_cube_add(size=1, location=(x, (leg_y + plate_y) / 2, .081))
            shoe = bpy.context.object
            shoe.name = PREFIX + str(len(gaps) - 1)
            shoe.dimensions = (.055, math.hypot(plate_y - leg_y, .058) + .050, .056)
            bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
            shoe.rotation_euler.x = math.atan(slope)
            shoe.data.materials.append(steel)
            modifier = shoe.modifiers.new('Retained steel ground mounting edge', 'BEVEL')
            modifier.width, modifier.segments = .003, 2
            pairs.extend(((shoe.name, leg_name), (shoe.name, plate_name)))
    after = audit.capture(scene)
    if len(after) != 46 or len(set(after) - set(before)) != 4:
        raise ValueError('Exactly four substantial ground mounting shoes required')
    if [audit.raw_record(bpy.data.objects[n]) for n in names] != raw or audit.materials_record() != graphs:
        raise ValueError('Original complete bench raw parts or palette changed')
    if {n: [list(row) for row in bpy.data.objects[n].matrix_world] for n in names} != matrices:
        raise ValueError('Original complete bench placements changed')
    if any(after[n]['evaluatedPositionSha256'] != before[n]['evaluatedPositionSha256'] for n in names):
        raise ValueError('Original evaluated bench geometry changed')
    if occupied_bounds(scene) != old_bounds: raise ValueError('Original exact full source bounds changed')
    normals = audit.convex_normal_audit(scene)
    if [r for r in normals if r['name'] in before] != old_normals:
        raise ValueError('Original geometric normals changed')
    witnesses = contacts(scene, pairs)
    audit.actual_triangle_contacts(scene, previous['actualContactTargets'])
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    p = {'schemaVersion': 1, 'assetId': 'furniture.corridor.bench.variants',
         'originalSource': ORIGINAL.relative_to(ROOT).as_posix(), 'originalSourceSha256': ORIGINAL_SHA,
         'source': SOURCE.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
         'retainedOriginalMeshNames': names, 'retainedOriginalRawMeshes': raw, 'retainedObjectMatrices': matrices,
         'retainedEvaluatedHashes': {n: before[n]['evaluatedPositionSha256'] for n in names},
         'retainedStoredMaterialGraphs': graphs, 'originalEvaluatedNormals': old_normals,
         'allAuthoredRawMeshes': [audit.raw_record(bpy.data.objects[n]) for n in sorted(after)],
         'allAuthoredEvaluatedHashes': {n: after[n]['evaluatedPositionSha256'] for n in sorted(after)},
         'authoredEvaluatedNormals': normals, 'sourceEvaluatedBounds': old_bounds,
         'actualContactPairs': pairs, 'actualTriangleInteriorContacts': witnesses,
         'retainedLowerTieContactTargets': previous['actualContactTargets'], 'retainedLowerTieTriangleContacts': original_contacts,
         'originalGroundGaps': gaps, 'addedMeshNames': sorted(set(after) - set(before)),
         'acceptedCamera': {'resolution': [256, 256], 'orthoScale': 4, 'nominalPixelsPerTile': 64,
                            'target': [1, .5, .44325], 'sourceFit': [1, 1, 1], 'footprint': [2, 1]}}
    pipeline_common.write_text(PROVENANCE, json.dumps(p, indent=2) + '\n')
    if ORIGINAL.read_bytes() != original_bytes: raise ValueError('Retained source bytes changed')
    verify_source(scene)
    print('BENCH_GROUND_MOUNTS_AUTHORED', p['sourceSha256'], old_bounds, flush=True)

if __name__ == '__main__': build()
