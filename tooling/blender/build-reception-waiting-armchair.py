"""Retain the complete wooden chair, adding broad timber arms and structural side panels.
No original geometry/transform/material, shared catalogue or mapping edits.
"""
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
SOURCE = ROOT / 'assets/source/blender/furniture.reception.waiting-armchair.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
PREFIX = 'Reception waiting armchair.'

spec = importlib.util.spec_from_file_location('reception_armchair_retained_reader', HERE / 'refine-guard-belt-detail.py')
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
        raise ValueError('Reception waiting armchair interior ray did not terminate')
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
            raise ValueError(f'Reception waiting armchair actual contact disconnected: {first} / {second}')
        rows.append({'partA': first, 'partB': second, 'actualTriangleInteriorWitness': list(witness)})
    return rows


def validate_footprint(scene):
    bounds = audit.bounds(scene)
    if not (-.5 <= bounds['min'][0] < bounds['max'][0] <= .5 and
            -.5 <= bounds['min'][1] < bounds['max'][1] <= .5 and abs(bounds['min'][2]) < 1e-6):
        raise ValueError(f'Reception waiting armchair outside original grounded 1x1 footprint: {bounds}')
    for turns in range(4):
        halfx,halfy=(.5,.5)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x,y=point.x,point.y
                for _ in range(turns): x,y=-y,x
                if not (-halfx<=x<=halfx and -halfy<=y<=halfy and point.z>=-1e-6):
                    raise ValueError(f'Reception waiting armchair escapes occupied quarter-turn {turns}')
    return bounds


def verify_source(scene):
    receipt = json.loads(PROVENANCE.read_text(encoding='utf-8-sig'))
    if receipt['source'] != SOURCE.relative_to(ROOT).as_posix():
        raise ValueError('Reception waiting armchair source dispatch differs from provenance')
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    if names != sorted(receipt['allAuthoredEvaluatedHashes']):
        raise ValueError('Reception waiting armchair retained or authored part omitted')
    # Meaningful physical guard runs before byte/evaluated-position guards.
    contacts = source_contacts(scene, receipt['actualContactPairs'])
    if [audit.raw_record(bpy.data.objects[name]) for name in names] != receipt['allAuthoredRawMeshes']:
        raise ValueError('Reception waiting armchair raw vertices/topology/modifiers/material assignments changed')
    if audit.materials_record() != receipt['retainedStoredMaterialGraphs']:
        raise ValueError('Reception waiting armchair original complete stored material graphs changed')
    rows = audit.capture(scene)
    if {name: rows[name]['evaluatedPositionSha256'] for name in names} != receipt['allAuthoredEvaluatedHashes']:
        raise ValueError('Reception waiting armchair evaluated assembly changed')
    if audit.normal_record(scene) != receipt['authoredEvaluatedNormals']:
        raise ValueError('Reception waiting armchair actual geometric normals changed')
    if validate_footprint(scene) != receipt['sourceEvaluatedBounds']:
        raise ValueError('Reception waiting armchair source bounds changed')
    for path, key in [('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / receipt[path]).read_bytes()).hexdigest() != receipt[key]:
            raise ValueError('Reception waiting armchair source identity changed')
    print(f'RECEPTION_ARMCHAIR_SOURCE_GREEN {len(names)} meshes/{len(contacts)} actual contacts/all original materials/four occupied turns', flush=True)
    return receipt



def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA:
        raise ValueError('Original complete authored chair identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    before = audit.capture(scene)
    raw = [audit.raw_record(bpy.data.objects[name]) for name in names]
    materials = audit.materials_record()
    for material in bpy.data.materials:
        if material.users == 0: material.use_fake_user = True
    wood = bpy.data.materials['Corridor bench worn wood plank 0']
    second_wood = bpy.data.materials['Corridor bench worn wood plank 1']
    steel = bpy.data.materials['Canteen worn steel']
    pairs = []
    def box(name, position, dimensions, material, bevel=.004):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = bpy.context.object
        obj.name = PREFIX + name
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(material)
        mod = obj.modifiers.new('Retained soft timber-edge style', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        return obj.name
    # Broad arms distinguish a waiting armchair without removing the original
    # chair seat/back/fixings or inventing a cloth graph in the retained palette.
    for x in (-.32,.32):
        side=str(x)
        cap=box('broad timber armcap.'+side,(x,.005,.875),(.12,.90,.065),wood,.012)
        rail=box('continuous steel arm bearer.'+side,(x,.005,.835),(.036,.84,.035),steel,.004)
        upright=box('front steel arm upright.'+side,(x,.42225,.685),(.056,.070,.36),steel,.005)
        panel=box('timber arm side panel.'+side,(x,.03,.72),(.090,.61,.29),second_wood,.008)
        rear='Chair refinement.rear post '+side
        front='Chair refinement.front leg '+side
        pairs += [(cap,rail),(cap,rear),(rail,rear),(rail,upright),(upright,front),
                  (panel,'Chair refinement.wooden seat'),(panel,cap),(panel,rail)]
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
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    receipt={'schemaVersion':1,'assetId':'furniture.reception.waiting-armchair',
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
    print(f'RECEPTION_ARMCHAIR_AUTHORED {len(rows)} meshes/{len(names)} original/{len(contacts)} actual contacts {bounds}',flush=True)

if __name__=='__main__': build()

