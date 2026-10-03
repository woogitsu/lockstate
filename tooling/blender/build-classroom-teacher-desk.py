"""Retain the complete modern desk, adding teaching-book storage and pupil-facing apron.
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
ORIGINAL = ROOT / 'assets/source/blender/furniture.office.desk.generic.angled-detail.blend'
ORIGINAL_SHA = '486b83b5079698faeb1cd58e989d1a1dfe524996813474b04550dd4c82a2fd46'
SOURCE = ROOT / 'assets/source/blender/furniture.classroom.teacher-desk.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
PREFIX = 'Classroom teacher desk.'

spec = importlib.util.spec_from_file_location('classroom_desk_retained_reader', HERE / 'refine-guard-belt-detail.py')
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
        raise ValueError('Classroom teacher desk interior ray did not terminate')
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
            raise ValueError(f'Classroom teacher desk actual contact disconnected: {first} / {second}')
        rows.append({'partA': first, 'partB': second, 'actualTriangleInteriorWitness': list(witness)})
    return rows


def validate_footprint(scene):
    bounds = audit.bounds(scene)
    if not (-1 <= bounds['min'][0] < bounds['max'][0] <= 1 and
            -.5 <= bounds['min'][1] < bounds['max'][1] <= .5 and abs(bounds['min'][2]) < 1e-6):
        raise ValueError(f'Classroom teacher desk outside original grounded 2x1 footprint: {bounds}')
    for turns in range(4):
        halfx,halfy=(1,.5) if turns%2==0 else (.5,1)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x,y=point.x,point.y
                for _ in range(turns): x,y=-y,x
                if not (-halfx<=x<=halfx and -halfy<=y<=halfy and point.z>=-1e-6):
                    raise ValueError(f'Classroom teacher desk escapes occupied quarter-turn {turns}')
    return bounds


def verify_source(scene):
    receipt = json.loads(PROVENANCE.read_text(encoding='utf-8-sig'))
    if receipt['source'] != SOURCE.relative_to(ROOT).as_posix():
        raise ValueError('Classroom teacher desk source dispatch differs from provenance')
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    if names != sorted(receipt['allAuthoredEvaluatedHashes']):
        raise ValueError('Classroom teacher desk retained or authored part omitted')
    # Meaningful physical guard runs before byte/evaluated-position guards.
    contacts = source_contacts(scene, receipt['actualContactPairs'])
    if [audit.raw_record(bpy.data.objects[name]) for name in names] != receipt['allAuthoredRawMeshes']:
        raise ValueError('Classroom teacher desk raw vertices/topology/modifiers/material assignments changed')
    if audit.materials_record() != receipt['retainedStoredMaterialGraphs']:
        raise ValueError('Classroom teacher desk original complete stored material graphs changed')
    rows = audit.capture(scene)
    if {name: rows[name]['evaluatedPositionSha256'] for name in names} != receipt['allAuthoredEvaluatedHashes']:
        raise ValueError('Classroom teacher desk evaluated assembly changed')
    if audit.normal_record(scene) != receipt['authoredEvaluatedNormals']:
        raise ValueError('Classroom teacher desk actual geometric normals changed')
    if validate_footprint(scene) != receipt['sourceEvaluatedBounds']:
        raise ValueError('Classroom teacher desk source bounds changed')
    for path, key in [('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / receipt[path]).read_bytes()).hexdigest() != receipt[key]:
            raise ValueError('Classroom teacher desk source identity changed')
    print(f'CLASSROOM_DESK_SOURCE_GREEN {len(names)} meshes/{len(contacts)} actual contacts/all original materials/four occupied turns', flush=True)
    return receipt



def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA:
        raise ValueError('Original complete authored desk identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    before = audit.capture(scene)
    raw = [audit.raw_record(bpy.data.objects[name]) for name in names]
    materials = audit.materials_record()
    for material in bpy.data.materials:
        if material.users == 0: material.use_fake_user = True
    wood = bpy.data.materials['warm oak laminate']
    steel = bpy.data.materials['powder coated steel']
    teal = bpy.data.materials['teal drawer label']
    paper = bpy.data.materials['paper']
    pairs = []
    def box(name, position, dimensions, material, bevel=.004):
        bpy.ops.mesh.primitive_cube_add(size=1, location=position)
        obj = bpy.context.object
        obj.name = PREFIX + name
        obj.dimensions = dimensions
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        obj.data.materials.append(material)
        mod = obj.modifiers.new('Retained soft laminate-edge style', 'BEVEL')
        mod.width, mod.segments = bevel, 3
        return obj.name
    # Pupil-facing privacy apron reaches the original worktop and rear rail.
    panel=box('pupil-facing oak modesty panel',(-.145,-.275,.443),(1.17,.058,.464),wood,.009)
    pairs += [(panel,'laminate desktop'),(panel,'rear stretcher')]
    # Open teaching-book shelf under the left side; original knee area stays open.
    shelf=box('open coursebook shelf',(-.31,-.055,.31),(.79,.47,.045),wood,.008)
    pairs.append((shelf,panel))
    for x in (-.69,.07):
        side=box(f'coursebook shelf cheek.{x}',(x,-.055,.484),(.035,.47,.39),wood,.006)
        pairs += [(side,shelf),(side,'laminate desktop')]
    for level in range(3):
        z=.336+level*.05
        lower=box(f'stored coursebook.{level}.lower cover',(-.39,.045,z),(.40,.28,.012),teal)
        pages=box(f'stored coursebook.{level}.paper block',(-.39,.045,z+.020),(.385,.266,.035),paper,.003)
        upper=box(f'stored coursebook.{level}.upper cover',(-.39,.045,z+.040),(.40,.28,.012),teal)
        spine=box(f'stored coursebook.{level}.bound spine',(-.39,-.091,z+.020),(.40,.015,.047),teal,.003)
        pairs += [(lower,shelf if level==0 else PREFIX+f'stored coursebook.{level-1}.upper cover'),(pages,lower),(upper,pages),(spine,lower),(spine,upper)]
    # A substantial desktop lesson-book rack fits beside, not through, retained papers.
    base=box('desktop textbook rack base',(.565,-.251,.765),(.52,.26,.044),wood,.006)
    pairs.append((base,'laminate desktop'))
    for x in (.315,.815):
        end=box(f'textbook rack bookend.{x}',(x,-.251,.925),(.026,.26,.35),steel,.004)
        pairs.append((end,base))
    for i in range(5):
        x=.368+i*.086
        h=(.265,.29,.245,.28,.26)[i]
        z=.783+h/2-.003
        color=teal if i%2==0 else wood
        left=box(f'lesson textbook.{i}.left cover',(x-.031,-.251,z),(.009,.22,h),color,.002)
        right=box(f'lesson textbook.{i}.right cover',(x+.031,-.251,z),(.009,.22,h),color,.002)
        pages=box(f'lesson textbook.{i}.paper block',(x,-.248,z),(.059,.207,h-.012),paper,.002)
        spine=box(f'lesson textbook.{i}.bound spine',(x,-.357,z),(.071,.012,h),color,.002)
        pairs += [(left,base),(right,base),(pages,left),(pages,right),(spine,left),(spine,right)]
    rows=audit.capture(scene)
    if [audit.raw_record(bpy.data.objects[n]) for n in names] != raw or audit.materials_record()!=materials:
        raise ValueError('Original complete desk parts/materials changed')
    error=max((rows[n]['points'][i]-p).length for n in names for i,p in enumerate(before[n]['points']))
    if error > 1e-7: raise ValueError('Original authored desk world geometry moved')
    normals=audit.normal_record(scene)
    if any(r['inwardPolygons'] or r['degenerateIndices'] or r['minimumOutwardDistance']<=0 for r in normals if r['name'].startswith(PREFIX)):
        raise ValueError('New teaching geometry has invalid actual normals')
    contacts=source_contacts(scene,pairs)
    bounds=validate_footprint(scene)
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    receipt={'schemaVersion':1,'assetId':'furniture.classroom.teacher-desk',
      'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA,
      'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
      'footprintTiles':[2,1],'retainedOriginalMeshNames':names,'retainedRigidAssemblyTranslation':[0,0,0],
      'maximumRigidVertexError':error,'retainedOriginalRawMeshes':raw,'retainedStoredMaterialGraphs':materials,
      'allAuthoredRawMeshes':[audit.raw_record(bpy.data.objects[n]) for n in sorted(rows)],
      'allAuthoredEvaluatedHashes':{n:r['evaluatedPositionSha256'] for n,r in rows.items()},
      'authoredEvaluatedNormals':normals,'sourceEvaluatedBounds':bounds,'actualContactPairs':pairs,
      'actualTriangleInteriorContacts':contacts,'cameraTargetTiles':[1,.5,(bounds['min'][2]+bounds['max'][2])/2]}
    pipeline_common.write_text(PROVENANCE,json.dumps(receipt,indent=2)+'\n')
    if ORIGINAL.read_bytes()!=original_bytes: raise ValueError('Original source bytes changed')
    print(f'CLASSROOM_DESK_AUTHORED {len(rows)} meshes/{len(names)} original/{len(contacts)} actual contacts {bounds}',flush=True)

if __name__=='__main__': build()

