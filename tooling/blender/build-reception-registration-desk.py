"""Retain the complete modern desk, adding visitor handover counter and registration document tray.
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
SOURCE = ROOT / 'assets/source/blender/furniture.reception.registration-desk.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
PREFIX = 'Reception registration desk.'

spec = importlib.util.spec_from_file_location('reception_desk_retained_reader', HERE / 'refine-guard-belt-detail.py')
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
        raise ValueError('Reception registration desk interior ray did not terminate')
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
            raise ValueError(f'Reception registration desk actual contact disconnected: {first} / {second}')
        rows.append({'partA': first, 'partB': second, 'actualTriangleInteriorWitness': list(witness)})
    return rows


def validate_footprint(scene):
    bounds = audit.bounds(scene)
    if not (-1 <= bounds['min'][0] < bounds['max'][0] <= 1 and
            -.5 <= bounds['min'][1] < bounds['max'][1] <= .5 and abs(bounds['min'][2]) < 1e-6):
        raise ValueError(f'Reception registration desk outside original grounded 2x1 footprint: {bounds}')
    for turns in range(4):
        halfx,halfy=(1,.5) if turns%2==0 else (.5,1)
        for row in audit.capture(scene).values():
            for point in row['points']:
                x,y=point.x,point.y
                for _ in range(turns): x,y=-y,x
                if not (-halfx<=x<=halfx and -halfy<=y<=halfy and point.z>=-1e-6):
                    raise ValueError(f'Reception registration desk escapes occupied quarter-turn {turns}')
    return bounds


def verify_source(scene):
    receipt = json.loads(PROVENANCE.read_text(encoding='utf-8-sig'))
    if receipt['source'] != SOURCE.relative_to(ROOT).as_posix():
        raise ValueError('Reception registration desk source dispatch differs from provenance')
    names = sorted(o.name for o in scene.objects if o.type == 'MESH')
    if names != sorted(receipt['allAuthoredEvaluatedHashes']):
        raise ValueError('Reception registration desk retained or authored part omitted')
    # Meaningful physical guard runs before byte/evaluated-position guards.
    contacts = source_contacts(scene, receipt['actualContactPairs'])
    if [audit.raw_record(bpy.data.objects[name]) for name in names] != receipt['allAuthoredRawMeshes']:
        raise ValueError('Reception registration desk raw vertices/topology/modifiers/material assignments changed')
    if audit.materials_record() != receipt['retainedStoredMaterialGraphs']:
        raise ValueError('Reception registration desk original complete stored material graphs changed')
    rows = audit.capture(scene)
    if {name: rows[name]['evaluatedPositionSha256'] for name in names} != receipt['allAuthoredEvaluatedHashes']:
        raise ValueError('Reception registration desk evaluated assembly changed')
    if audit.normal_record(scene) != receipt['authoredEvaluatedNormals']:
        raise ValueError('Reception registration desk actual geometric normals changed')
    if validate_footprint(scene) != receipt['sourceEvaluatedBounds']:
        raise ValueError('Reception registration desk source bounds changed')
    for path, key in [('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / receipt[path]).read_bytes()).hexdigest() != receipt[key]:
            raise ValueError('Reception registration desk source identity changed')
    print(f'RECEPTION_DESK_SOURCE_GREEN {len(names)} meshes/{len(contacts)} actual contacts/all original materials/four occupied turns', flush=True)
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
    # The full visitor counter fits behind the retained monitor/cable opening.
    # Original workstation equipment remains entirely authored and unmoved.
    panel=box('visitor-facing registration panel',(0,-.386,.620),(1.68,.050,.830),wood,.008)
    pairs.append((panel,'laminate desktop'))
    counter=box('raised visitor handover counter',(0,-.360,1.050),(1.76,.112,.045),wood,.005)
    pairs.append((counter,panel))
    for side in (-1,1):
        support=box(f'counter steel upright.{side}',(side*.78,-.350,.880),(.045,.084,.330),steel,.004)
        pairs += [(support,'laminate desktop'),(support,panel),(support,counter)]
    edge=box('handover counter dark front edge',(0,-.409,1.050),(1.80,.014,.045),bpy.data.materials['worktop edging'],.002)
    pairs.append((edge,counter))
    label=box('visitor panel teal inset',(.54,-.410,.840),(.34,.012,.090),teal,.003)
    pairs.append((label,panel))
    # A supported open document tray uses the actual clear left desktop area.
    tray=box('registration document tray base',(-.715,.026,.765),(.310,.280,.044),steel,.004)
    pairs.append((tray,'laminate desktop'))
    for side in (-1,1):
        rim=box(f'document tray side rim.{side}',(-.715+side*.147,.026,.828),(.018,.268,.090),steel,.003)
        pairs.append((rim,tray))
        rim=box(f'document tray end rim.{side}',(-.715,.026+side*.131,.828),(.294,.018,.090),steel,.003)
        pairs.append((rim,tray))
    pages=box('registration forms paper block',(-.715,.026,.812),(.246,.224,.058),paper,.003)
    form=box('registration top form',(-.715,.026,.8413),(.236,.214,.006),paper,.001)
    pairs += [(pages,tray),(form,pages)]
    # Visitors have an actual counter clipboard without introducing words/copy.
    board=box('visitor clipboard',(.55,-.354,1.084),(.320,.094,.026),teal,.003)
    page=box('visitor clipboard form',(.55,-.354,1.101),(.292,.077,.014),paper,.002)
    clip=box('visitor clipboard steel clip',(.55,-.382,1.110),(.065,.022,.014),steel,.002)
    pairs += [(board,counter),(page,board),(clip,page)]
    rows=audit.capture(scene)
    if [audit.raw_record(bpy.data.objects[n]) for n in names] != raw or audit.materials_record()!=materials:
        raise ValueError('Original complete desk parts/materials changed')
    error=max((rows[n]['points'][i]-p).length for n in names for i,p in enumerate(before[n]['points']))
    if error > 1e-7: raise ValueError('Original authored desk world geometry moved')
    normals=audit.normal_record(scene)
    if any(r['inwardPolygons'] or r['degenerateIndices'] or r['minimumOutwardDistance']<=0 for r in normals if r['name'].startswith(PREFIX)):
        raise ValueError('New registration geometry has invalid actual normals')
    contacts=source_contacts(scene,pairs)
    bounds=validate_footprint(scene)
    original_bounds=json.loads((ROOT/'docs/research/2026-10-03-reception-registration-desk/actual-original-inventory.json').read_text())['bounds']
    if bounds!=original_bounds: raise ValueError('Reception original exact physical bounds changed')
    bpy.context.preferences.filepaths.save_version=0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    receipt={'schemaVersion':1,'assetId':'furniture.reception.registration-desk',
      'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA,
      'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
      'footprintTiles':[2,1],'retainedOriginalMeshNames':names,'retainedRigidAssemblyTranslation':[0,0,0],
      'maximumRigidVertexError':error,'originalEvaluatedBounds':original_bounds,'retainedObjectMatrices':{n:[list(r) for r in bpy.data.objects[n].matrix_world] for n in names},'retainedOriginalRawMeshes':raw,'retainedStoredMaterialGraphs':materials,
      'allAuthoredRawMeshes':[audit.raw_record(bpy.data.objects[n]) for n in sorted(rows)],
      'allAuthoredEvaluatedHashes':{n:r['evaluatedPositionSha256'] for n,r in rows.items()},
      'authoredEvaluatedNormals':normals,'sourceEvaluatedBounds':bounds,'actualContactPairs':pairs,
      'actualTriangleInteriorContacts':contacts,'cameraTargetTiles':[1,.5,(bounds['min'][2]+bounds['max'][2])/2]}
    pipeline_common.write_text(PROVENANCE,json.dumps(receipt,indent=2)+'\n')
    if ORIGINAL.read_bytes()!=original_bytes: raise ValueError('Original source bytes changed')
    print(f'RECEPTION_DESK_AUTHORED {len(rows)} meshes/{len(names)} original/{len(contacts)} actual contacts {bounds}',flush=True)

if __name__=='__main__': build()
