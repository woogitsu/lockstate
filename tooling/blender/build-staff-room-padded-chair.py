"""Retain all 52 wooden-chair parts/four graphs; add connected Staff Room rest pads."""
from pathlib import Path
import hashlib
import importlib.util
import itertools
import json
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
ORIGINAL = ROOT / 'assets/source/blender/furniture.chair.wooden.angled-detail.blend'
ORIGINAL_SHA = 'acd0e9decb3bb451b44e8354e797fb5656825f4748bbed832bab61659f06cd88'
SOURCE = ROOT / 'assets/source/blender/furniture.staff-room.padded-chair.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
PREFIX = 'Staff Room padded chair.'

spec = importlib.util.spec_from_file_location('staff_room_chair_retained_reader', HERE / 'refine-guard-belt-detail.py')
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
        raise ValueError('Staff Room padded chair interior ray did not terminate')
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
            raise ValueError(f'Staff Room padded chair actual contact disconnected: {first} / {second}')
        rows.append({'partA': first, 'partB': second, 'actualTriangleInteriorWitness': list(witness)})
    return rows


def validate_footprint(scene):
    bounds = audit.bounds(scene)
    if not (-.5 <= bounds['min'][0] < bounds['max'][0] <= .5 and
            -.5 <= bounds['min'][1] < bounds['max'][1] <= .5 and abs(bounds['min'][2]) < 1e-6):
        raise ValueError(f'Staff Room padded chair outside original grounded 1x1 footprint: {bounds}')
    for turns in range(4):
        halfx,halfy=(.5,.5)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x,y=point.x,point.y
                for _ in range(turns): x,y=-y,x
                if not (-halfx<=x<=halfx and -halfy<=y<=halfy and point.z>=-1e-6):
                    raise ValueError(f'Staff Room padded chair escapes occupied quarter-turn {turns}')
    return bounds


def verify_source(scene):
    receipt = json.loads(PROVENANCE.read_text(encoding='utf-8-sig'))
    if receipt['source'] != SOURCE.relative_to(ROOT).as_posix():
        raise ValueError('Staff Room padded chair source dispatch differs from provenance')
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    if names != sorted(receipt['allAuthoredEvaluatedHashes']):
        raise ValueError('Staff Room padded chair retained or authored part omitted')
    # Meaningful physical guard runs before byte/evaluated-position guards.
    contacts = source_contacts(scene, receipt['actualContactPairs'])
    if [audit.raw_record(bpy.data.objects[name]) for name in names] != receipt['allAuthoredRawMeshes']:
        raise ValueError('Staff Room padded chair raw vertices/topology/modifiers/material assignments changed')
    if audit.materials_record() != receipt['retainedStoredMaterialGraphs']:
        raise ValueError('Staff Room padded chair original complete stored material graphs changed')
    rows = audit.capture(scene)
    if {name: rows[name]['evaluatedPositionSha256'] for name in names} != receipt['allAuthoredEvaluatedHashes']:
        raise ValueError('Staff Room padded chair evaluated assembly changed')
    if audit.normal_record(scene) != receipt['authoredEvaluatedNormals']:
        raise ValueError('Staff Room padded chair actual geometric normals changed')
    if validate_footprint(scene) != receipt['sourceEvaluatedBounds']:
        raise ValueError('Staff Room padded chair source bounds changed')
    for path, key in [('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / receipt[path]).read_bytes()).hexdigest() != receipt[key]:
            raise ValueError('Staff Room padded chair source identity changed')
    print(f'STAFF_ROOM_CHAIR_SOURCE_GREEN {len(names)} meshes/{len(contacts)} actual contacts/all original materials/four occupied turns', flush=True)
    return receipt



def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA:
        raise ValueError('Original complete authored chair identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    before = audit.capture(scene)
    original_bounds = audit.bounds(scene)
    if len(names) != 52: raise ValueError("Expected the actual 52 retained wooden-chair parts")
    raw = [audit.raw_record(bpy.data.objects[name]) for name in names]
    materials = audit.materials_record()
    for material in bpy.data.materials:
        if material.users == 0: material.use_fake_user = True
    padding = bpy.data.materials['shade']
    pairs = []
    def pad(name, position, dimensions):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = bpy.context.object
        obj.name = PREFIX + name
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(padding)
        mod = obj.modifiers.new('Broad institutional pad roundover', 'BEVEL')
        mod.width, mod.segments = .030, 4
        return obj.name
    # The accepted charcoal graph supplies the full-size rest pads; no new
    # cloth graph or palette. Timber edges and all captive fixings remain.
    seat = pad('connected seat pad', (0, .09, .648), (.45, .45, .092))
    back = pad('connected lumbar back pad', (0, -.340, 1.035), (.46, .090, .37))
    pairs = [(seat, 'Chair refinement.wooden seat'),
             (back, 'Chair refinement.walnut back rail'),
             (back, 'Chair refinement.dark back inset')]
    rows=audit.capture(scene)
    if [audit.raw_record(bpy.data.objects[n]) for n in names] != raw or audit.materials_record()!=materials:
        raise ValueError('Original complete chair parts/materials changed')
    error=max((rows[n]['points'][i]-p).length for n in names for i,p in enumerate(before[n]['points']))
    if error > 1e-7: raise ValueError('Original authored chair world geometry moved')
    normals=audit.normal_record(scene)
    if any(r['inwardPolygons'] or r['degenerateIndices'] or r['minimumOutwardDistance']<=0 for r in normals if r['name'].startswith(PREFIX)):
        raise ValueError('New waiting-armchair geometry has invalid actual normals')
    contacts=source_contacts(scene,pairs)
    bounds=validate_footprint(scene)
    if bounds != original_bounds: raise ValueError("Staff Room chair exact original bounds changed")
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    receipt={'schemaVersion':1,'assetId':'furniture.staff-room.padded-chair',
      'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA,
      'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
      'footprintTiles':[1,1],'retainedOriginalMeshNames':names,'retainedRigidAssemblyTranslation':[0,0,0],
      'maximumRigidVertexError':error,'retainedOriginalRawMeshes':raw,'retainedStoredMaterialGraphs':materials,
      'allAuthoredRawMeshes':[audit.raw_record(bpy.data.objects[n]) for n in sorted(rows)],
      'allAuthoredEvaluatedHashes':{n:r['evaluatedPositionSha256'] for n,r in rows.items()},
      'authoredEvaluatedNormals':normals,'sourceEvaluatedBounds':bounds,'actualContactPairs':pairs,
      'actualTriangleInteriorContacts':contacts,'cameraTargetTiles':[.5,.5,(bounds['min'][2]+bounds['max'][2])/2]}
    pipeline_common.write_text(PROVENANCE,json.dumps(receipt,indent=2)+'\n')
    if ORIGINAL.read_bytes()!=original_bytes: raise ValueError('Original source bytes changed')
    print(f'STAFF_ROOM_CHAIR_AUTHORED {len(rows)} meshes/{len(names)} original/{len(contacts)} actual contacts {bounds}',flush=True)

if __name__=='__main__': build()

