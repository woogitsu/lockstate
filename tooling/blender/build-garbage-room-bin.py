"""Retain the complete authored indoor bin on a purpose-built refuse trolley.

All original mesh data, modifiers and stored materials are preserved. The
retained bin assembly receives one rigid +0.16 Z lift onto its carrier deck.
No shared catalogue, palette, mapping or original-source writes.
"""
from pathlib import Path
import hashlib
import importlib.util
import itertools
import json
import math
import sys
import bpy
from mathutils import Matrix, Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
ORIGINAL = ROOT / 'assets/source/blender/fixture.cell.waste_bin.angled.blend'
ORIGINAL_SHA = 'ff8f91f62e67ad69293c0560849664524a5e7cd34824137171f5cb3d740376c3'
SOURCE = ROOT / 'assets/source/blender/fixture.garbage-room.waste-bin.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
PREFIX = 'Refuse trolley.'

spec = importlib.util.spec_from_file_location('garbage_bin_retained_reader', HERE / 'refine-guard-belt-detail.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


def source_contacts(scene, pairs):
    """Evaluated triangle-interior witnesses, not an AABB-only contact claim."""
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    trees, bounds = {}, {}
    for name in sorted({name for pair in pairs for name in pair}):
        value = bpy.data.objects[name].evaluated_get(graph)
        mesh = value.to_mesh()
        try:
            vertices = [value.matrix_world @ vertex.co for vertex in mesh.vertices]
            trees[name] = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons], all_triangles=False)
            bounds[name] = ([min(p[a] for p in vertices) for a in range(3)], [max(p[a] for p in vertices) for a in range(3)])
        finally:
            value.to_mesh_clear()
    direction = Vector((.937, .223, .181)).normalized()
    def inside(name, point):
        origin, crossings = point.copy(), 0
        for _ in range(100):
            hit, _, _, _ = trees[name].ray_cast(origin, direction, 100)
            if hit is None:
                return crossings % 2 == 1
            crossings += 1
            origin = hit + direction * 1e-5
        raise ValueError('Refuse trolley interior ray did not terminate')
    rows = []
    for first, second in pairs:
        low = [max(bounds[first][0][a], bounds[second][0][a]) for a in range(3)]
        high = [min(bounds[first][1][a], bounds[second][1][a]) for a in range(3)]
        witness = None
        if all(high[a] - low[a] > 1e-5 for a in range(3)):
            for fractions in itertools.product((.5, .25, .75, .125, .875, .375, .625), repeat=3):
                point = Vector(tuple(low[a] + (high[a] - low[a]) * fractions[a] for a in range(3)))
                if inside(first, point) and inside(second, point):
                    witness = point
                    break
        if witness is None:
            raise ValueError(f'Refuse trolley actual contact disconnected: {first} / {second}')
        rows.append({'partA': first, 'partB': second, 'actualTriangleInteriorWitness': list(witness)})
    return rows


def validate_footprint(scene):
    bounds = audit.bounds(scene)
    if not (-.5 <= bounds['min'][0] < bounds['max'][0] <= .5 and
            -.5 <= bounds['min'][1] < bounds['max'][1] <= .5 and abs(bounds['min'][2]) < 1e-6):
        raise ValueError(f'Refuse trolley is not grounded inside its original 1x1 footprint: {bounds}')
    for turns in range(4):
        for row in audit.capture(scene).values():
            for point in row['points']:
                x, y = point.x, point.y
                for _ in range(turns):
                    x, y = -y, x
                if not (-.5 <= x <= .5 and -.5 <= y <= .5 and point.z >= -1e-6):
                    raise ValueError(f'Refuse trolley escapes occupied quarter-turn {turns}')
    return bounds


def verify_source(scene):
    receipt = json.loads(PROVENANCE.read_text(encoding='utf-8-sig'))
    if receipt['source'] != SOURCE.relative_to(ROOT).as_posix():
        raise ValueError('Refuse trolley source dispatch differs from provenance')
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    if names != sorted(receipt['allAuthoredEvaluatedHashes']):
        raise ValueError('Refuse trolley retained or authored part omitted')
    # Meaningful physical guard runs before byte/evaluated-position guards.
    contacts = source_contacts(scene, receipt['actualContactPairs'])
    if [audit.raw_record(bpy.data.objects[name]) for name in names] != receipt['allAuthoredRawMeshes']:
        raise ValueError('Refuse trolley raw vertices/topology/modifiers/material assignments changed')
    if audit.materials_record() != receipt['retainedStoredMaterialGraphs']:
        raise ValueError('Refuse trolley original complete stored material graphs changed')
    rows = audit.capture(scene)
    if {name: rows[name]['evaluatedPositionSha256'] for name in names} != receipt['allAuthoredEvaluatedHashes']:
        raise ValueError('Refuse trolley evaluated assembly changed')
    if audit.normal_record(scene) != receipt['authoredEvaluatedNormals']:
        raise ValueError('Refuse trolley actual geometric normals changed')
    if validate_footprint(scene) != receipt['sourceEvaluatedBounds']:
        raise ValueError('Refuse trolley source bounds changed')
    for path, key in [('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / receipt[path]).read_bytes()).hexdigest() != receipt[key]:
            raise ValueError('Refuse trolley source identity changed')
    print(f'GARBAGE_BIN_SOURCE_GREEN {len(names)} meshes/{len(contacts)} actual contacts/all original materials/four occupied turns', flush=True)
    return receipt


def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA:
        raise ValueError('Original complete indoor bin identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    if len(names) != 12:
        raise ValueError('Expected all twelve original authored bin parts')
    before = audit.capture(scene)
    raw = [audit.raw_record(bpy.data.objects[name]) for name in names]
    materials = audit.materials_record()
    for material in bpy.data.materials:
        if material.users == 0:
            material.use_fake_user = True
    transform = Matrix.Translation((0, 0, .16))
    for name in names:
        bpy.data.objects[name].matrix_world = transform @ bpy.data.objects[name].matrix_world
    bpy.context.view_layer.update()
    lifted = audit.capture(scene)
    error = max((lifted[name]['points'][i] - point - Vector((0, 0, .16))).length
                for name in names for i, point in enumerate(before[name]['points']))
    if error > 1e-6:
        raise ValueError('Original bin was not retained under one rigid assembly lift')

    steel = bpy.data.materials['waste bin edge']
    enamel = bpy.data.materials['waste bin enamel']
    rubber = bpy.data.materials['waste bin cavity']
    amber = bpy.data.materials['waste bin pedal']
    pairs = []
    def box(name, position, dimensions, material, bevel=.008):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = bpy.context.object
        obj.name = PREFIX + name
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(material)
        mod = obj.modifiers.new('Retained soft stamped-edge style', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        return obj.name
    def tube(name, position, radius, length, material, axis='z'):
        rotations = {'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0), 'z': (0, 0, 0)}
        bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=length,
                                          location=position, rotation=rotations[axis])
        obj = bpy.context.object
        obj.name = PREFIX + name
        obj.data.materials.append(material)
        return obj.name
    deck = box('pressed steel carrier deck', (0, -.025, .14), (.80, .68, .06), steel, .015)
    pairs.append((deck, 'bin body'))
    for x in (-.35, .35):
        for y in (-.23, .23):
            suffix = f'{x}.{y}'
            mount = box('caster mounting fork.' + suffix, (x, y, .13), (.065, .09, .10), steel)
            axle = tube('solid wheel axle.' + suffix, (x, y, .10), .020, .105, steel, 'x')
            wheel = tube('rubber caster wheel.' + suffix, (x, y, .10), .10, .075, rubber, 'x')
            hub = tube('amber wheel hub.' + suffix, (x + (.035 if x > 0 else -.035), y, .10), .038, .022, amber, 'x')
            pairs += [(mount, deck), (axle, mount), (wheel, axle), (hub, wheel)]
            if y < 0:
                brake = box('rear caster brake lever.' + suffix, (x, y, .188), (.055, .12, .025), enamel, .006)
                pairs.append((brake, wheel))
    uprights = []
    for x in (-.39, .39):
        upright = box(f'rear push upright.{x}', (x, -.27, .67), (.045, .060, 1.03), steel)
        rail = tube(f'bin retention side rail.{x}', ((-.33 if x < 0 else .33), -.02, .45), .027, .50, enamel, 'y')
        arm = box(f'rail to push-frame bracket.{x}', ((-.37 if x < 0 else .37), -.25, .45), (.105, .10, .055), steel)
        pairs += [(upright, deck), (arm, upright), (arm, rail), (rail, 'bin body')]
        uprights.append(upright)
    handle = tube('full-width push handle', (0, -.27, 1.16), .030, .84, steel, 'x')
    pairs += [(handle, upright) for upright in uprights]
    bumper = box('front protective bumper', (0, .30, .18), (.82, .060, .060), enamel)
    pairs.append((bumper, deck))
    for x in (-.20, 0, .20):
        marker = box(f'front amber reflector.{x}', (x, .332, .18), (.10, .010, .035), amber, .003)
        pairs.append((marker, bumper))

    if [audit.raw_record(bpy.data.objects[name]) for name in names] != raw or audit.materials_record() != materials:
        raise ValueError('Original authored bin geometry/modifiers or complete stored palette changed')
    rows = audit.capture(scene)
    normals = audit.normal_record(scene)
    if any(row['inwardPolygons'] or row['degenerateIndices'] or row['minimumOutwardDistance'] <= 0
           for row in normals if row['name'].startswith(PREFIX)):
        raise ValueError('New refuse carrier has inward or degenerate actual geometric surfaces')
    contacts = source_contacts(scene, pairs)
    bounds = validate_footprint(scene)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    receipt = {'schemaVersion': 1, 'assetId': 'fixture.garbage-room.waste-bin',
               'originalSource': ORIGINAL.relative_to(ROOT).as_posix(), 'originalSourceSha256': ORIGINAL_SHA,
               'source': SOURCE.relative_to(ROOT).as_posix(), 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
               'footprintTiles': [1, 1], 'retainedOriginalMeshNames': names,
               'retainedRigidAssemblyTranslation': [0, 0, .16], 'maximumRigidVertexError': error,
               'retainedOriginalRawMeshes': raw, 'retainedStoredMaterialGraphs': materials,
               'allAuthoredRawMeshes': [audit.raw_record(bpy.data.objects[name]) for name in sorted(rows)],
               'allAuthoredEvaluatedHashes': {name: row['evaluatedPositionSha256'] for name, row in rows.items()},
               'authoredEvaluatedNormals': normals, 'sourceEvaluatedBounds': bounds,
               'actualContactPairs': pairs, 'actualTriangleInteriorContacts': contacts,
               'cameraTargetTiles': [.5, .5, (bounds['min'][2] + bounds['max'][2]) / 2]}
    pipeline_common.write_text(PROVENANCE, json.dumps(receipt, indent=2) + '\n')
    if ORIGINAL.read_bytes() != original_bytes:
        raise ValueError('Original source bytes changed')
    print(f'GARBAGE_BIN_AUTHORED {len(rows)} parts, twelve retained, {len(contacts)} actual carrier contacts, {bounds}', flush=True)


if __name__ == '__main__':
    build()
