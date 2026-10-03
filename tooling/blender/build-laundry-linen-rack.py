"""Retain all 104 rack parts/full stored graphs; add connected Laundry linen storage."""
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
ORIGINAL = ROOT / 'assets/source/blender/furniture.storage.rack.wooden.angled-detail.blend'
ORIGINAL_SHA = '600d62b3b5708081445b6ba84b5f38fc8534922f6a128b448e1585c97e95c212'
SOURCE = ROOT / 'assets/source/blender/furniture.laundry.linen-rack.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
PREFIX = 'Laundry linen rack.'

spec = importlib.util.spec_from_file_location('laundry_linen_rack_retained_reader', HERE / 'refine-generic-rack-angled-detail.py')
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


# Read every stored graph, including unused graphs; the original rack reader
# filters a historical name list, so use the established complete reader.
spec = importlib.util.spec_from_file_location('laundry_all_stored_graphs', HERE / 'refine-washing-machine-detail.py')
graph_reader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(graph_reader)
audit.materials_record = graph_reader.materials_record

def scene_bounds(scene):
    pts = [p for row in audit.capture(scene).values() for p in row['points']]
    return {'min': [min(p[a] for p in pts) for a in range(3)], 'max': [max(p[a] for p in pts) for a in range(3)]}


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
        raise ValueError('Laundry linen rack interior ray did not terminate')
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
            raise ValueError(f'Laundry linen rack actual contact disconnected: {first} / {second}')
        rows.append({'partA': first, 'partB': second, 'actualTriangleInteriorWitness': list(witness)})
    return rows


def validate_footprint(scene):
    bounds = scene_bounds(scene)
    if not (-.5 <= bounds['min'][0] < bounds['max'][0] <= .5 and
            -.5 <= bounds['min'][1] < bounds['max'][1] <= .5 and abs(bounds['min'][2]) < 1e-6):
        raise ValueError(f'Laundry linen rack outside original grounded 1x1 footprint: {bounds}')
    for turns in range(4):
        halfx,halfy=(.5,.5)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x,y=point.x,point.y
                for _ in range(turns): x,y=-y,x
                if not (-halfx<=x<=halfx and -halfy<=y<=halfy and point.z>=-1e-6):
                    raise ValueError(f'Laundry linen rack escapes occupied quarter-turn {turns}')
    return bounds


def verify_source(scene):
    receipt = json.loads(PROVENANCE.read_text(encoding='utf-8-sig'))
    if receipt['source'] != SOURCE.relative_to(ROOT).as_posix():
        raise ValueError('Laundry linen rack source dispatch differs from provenance')
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    if names != sorted(receipt['allAuthoredEvaluatedHashes']):
        raise ValueError('Laundry linen rack retained or authored part omitted')
    # Meaningful physical guard runs before byte/evaluated-position guards.
    contacts = source_contacts(scene, receipt['actualContactPairs'])
    if [audit.raw_record(bpy.data.objects[name]) for name in names] != receipt['allAuthoredRawMeshes']:
        raise ValueError('Laundry linen rack raw vertices/topology/modifiers/material assignments changed')
    if audit.materials_record() != receipt['retainedStoredMaterialGraphs']:
        raise ValueError('Laundry linen rack original complete stored material graphs changed')
    rows = audit.capture(scene)
    if {name: rows[name]['evaluatedPositionSha256'] for name in names} != receipt['allAuthoredEvaluatedHashes']:
        raise ValueError('Laundry linen rack evaluated assembly changed')
    if audit.convex_normal_audit(scene) != receipt['authoredEvaluatedNormals']:
        raise ValueError('Laundry linen rack actual geometric normals changed')
    if validate_footprint(scene) != receipt['sourceEvaluatedBounds']:
        raise ValueError('Laundry linen rack source bounds changed')
    for path, key in [('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / receipt[path]).read_bytes()).hexdigest() != receipt[key]:
            raise ValueError('Laundry linen rack source identity changed')
    print(f'LAUNDRY_LINEN_RACK_SOURCE_GREEN {len(names)} meshes/{len(contacts)} actual contacts/all original materials/four occupied turns', flush=True)
    return receipt



def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA:
        raise ValueError('Original complete authored rack identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    before = audit.capture(scene)
    original_bounds = scene_bounds(scene)
    if len(names) != 104: raise ValueError("Expected all 104 actual refined generic rack parts")
    raw = [audit.raw_record(bpy.data.objects[name]) for name in names]
    materials = audit.materials_record()
    for material in bpy.data.materials:
        if material.users == 0: material.use_fake_user = True
    if len(materials) != 12: raise ValueError('Expected all twelve full stored rack material graphs')
    pairs = []
    def part(name, position, dimensions, material, bevel):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = bpy.context.object
        obj.name = PREFIX + name
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(material)
        mod = obj.modifiers.new('Retained institutional linen roundover', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        return obj.name
    rail = part('connected linen storage rail', (0, -.405, 1.10), (.86, .050, .046), bpy.data.materials['Canteen worn steel'], .003)
    pairs = [(rail, 'Corner post.-0.43.-0.39'), (rail, 'Corner post.0.43.-0.39')]
    for index, (x, material_name) in enumerate(((-.18, 'Rack ivory inventory label'), (.18, 'Rack muted blue canvas'))):
        material = bpy.data.materials[material_name]
        cloth = part(f'folded linen panel {index}', (x, -.430, .875), (.225, .028, .435), material, .006)
        return_fold = part(f'linen rail return fold {index}', (x, -.411, 1.092), (.225, .058, .082), material, .012)
        hem = part(f'linen lower folded hem {index}', (x, -.441, .666), (.225, .022, .032), material, .006)
        pairs.extend(((cloth, return_fold), (return_fold, rail), (hem, cloth)))
    rows=audit.capture(scene)
    if len(rows) != 111: raise ValueError('Expected 104 retained and seven substantive linen assembly parts')
    if [audit.raw_record(bpy.data.objects[n]) for n in names] != raw or audit.materials_record()!=materials:
        raise ValueError('Original complete rack parts/materials changed')
    error=max((rows[n]['points'][i]-p).length for n in names for i,p in enumerate(before[n]['points']))
    if error > 1e-7: raise ValueError('Original authored rack world geometry moved')
    normals=audit.convex_normal_audit(scene)
    if any(r['inwardPolygons'] or r['degenerateFaceIndices'] or r['minimumOutwardNormalDistance']<=0 for r in normals if r['name'].startswith(PREFIX)):
        raise ValueError('New linen storage geometry has invalid actual normals')
    contacts=source_contacts(scene,pairs)
    bounds=validate_footprint(scene)
    if bounds != original_bounds: raise ValueError("Laundry linen rack exact original bounds changed")
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    receipt={'schemaVersion':1,'assetId':'furniture.laundry.linen-rack',
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
    print(f'LAUNDRY_LINEN_RACK_AUTHORED {len(rows)} meshes/{len(names)} original/{len(contacts)} actual contacts {bounds}',flush=True)

if __name__=='__main__': build()
