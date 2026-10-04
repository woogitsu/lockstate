"""Actual evaluated triangle-interior witnesses in the retained bookshelf assembly."""
from pathlib import Path
import importlib.util
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common
pipeline_common.require_blender_version()

def numbered(base, index):
    return base if index == 0 else f'{base}.{index:03d}'
CONTACT_PAIRS = []
for tier,height in enumerate((.16,1.02,1.90)):
    for x in (-.875,.875):
        prefix = 'angled-library-bookshelf.'
        vertical = prefix + f'shelf end vertical bearing {tier} {x}'
        horizontal = prefix + f'shelf end horizontal bearing {tier} {x}'
        side = 'side-frame' if x < 0 else 'side-frame.001'
        shelf = numbered('shelf',tier)
        CONTACT_PAIRS += [(vertical,side),(horizontal,vertical),(horizontal,shelf)]
        for z in (height-.105,height-.045):
            CONTACT_PAIRS.append((prefix + f'shelf bearing fixing {tier} {x} {z}',vertical))
for x in (-.795,.795):
    sign = -1 if x < 0 else 1
    side = 'side-frame' if x < 0 else 'side-frame.001'
    for z in (.245,1.84):
        plate = 'angled-library-bookshelf.' + f'rear corner joining plate {x} {z}'
        CONTACT_PAIRS += [(plate,'back-panel'),(plate,side)]
        for hole_x in (sign*.742,sign*.855):
            CONTACT_PAIRS.append(('angled-library-bookshelf.' + f'rear corner retaining screw {x} {z} {hole_x}',plate))
CONTACT_PAIRS += [('foot','carcass'),('foot.001','carcass')]

def capture_normals(scene):
    """Literal evaluated baseline, including creator bevel degeneracies; not a stove-specific expectation."""
    import hashlib, json
    graph = bpy.context.evaluated_depsgraph_get()
    rows = []
    for obj in sorted(scene.objects, key=lambda o: o.name):
        if obj.type != 'MESH': continue
        value = obj.evaluated_get(graph)
        mesh = value.to_mesh()
        try:
            normals = [list(p.normal) for p in mesh.polygons]
            rows.append({'name': obj.name, 'faceCount': len(normals), 'zeroAreaFaces': sum(p.area < 1e-12 for p in mesh.polygons),
                         'evaluatedNormalsSha256': hashlib.sha256(json.dumps(normals, separators=(',', ':')).encode()).hexdigest()})
        finally: value.to_mesh_clear()
    return rows

def verify_contacts(scene):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    trees, bounds = {}, {}
    for name in sorted({name for pair in CONTACT_PAIRS for name in pair}):
        obj = bpy.data.objects.get(name)
        if obj is None: raise ValueError('Bookshelf contact retained mesh missing: ' + name)
        value = obj.evaluated_get(graph)
        mesh = value.to_mesh()
        try:
            vertices = [value.matrix_world @ v.co for v in mesh.vertices]
            trees[name] = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons], all_triangles=False)
            bounds[name] = ([min(v[i] for v in vertices) for i in range(3)], [max(v[i] for v in vertices) for i in range(3)])
        finally: value.to_mesh_clear()
    def inside(name, point):
        direction = Vector((.937, .223, .181)).normalized()
        origin, crossings = point.copy(), 0
        for _ in range(100):
            hit, _, _, _ = trees[name].ray_cast(origin, direction, 100)
            if hit is None: return crossings % 2 == 1
            crossings += 1
            origin = hit + direction * 1e-6
        raise ValueError('Bookshelf contact ray did not terminate')
    witnesses = []
    for part, target in CONTACT_PAIRS:
        low = [max(bounds[part][0][i], bounds[target][0][i]) for i in range(3)]
        high = [min(bounds[part][1][i], bounds[target][1][i]) for i in range(3)]
        witness = None
        if min(high[i] - low[i] for i in range(3)) > 1e-5:
            for x in (.5, .25, .75, .1, .9):
                for y in (.5, .25, .75, .1, .9):
                    for z in (.5, .25, .75, .1, .9):
                        point = Vector(tuple(low[i] + (high[i] - low[i]) * f for i, f in enumerate((x, y, z))))
                        if inside(part, point) and inside(target, point):
                            witness = list(point)
                            break
                    if witness is not None: break
                if witness is not None: break
        if witness is None: raise ValueError('Bookshelf retained triangle-interior contact absent: ' + part + ' / ' + target)
        witnesses.append({'part': part, 'retainedTarget': target, 'actualInteriorWitness': witness, 'overlapDepths': [high[i] - low[i] for i in range(3)]})
    return witnesses
