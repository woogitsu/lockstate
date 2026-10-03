"""Refine the existing Kitchen prep-counter assembly in a dedicated authored source."""
from __future__ import annotations
import hashlib
import json
import sys
from pathlib import Path
import bpy
from mathutils import Matrix
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common
pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = ROOT / 'assets/source/blender/furniture.kitchen.prep-counter.variants.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.kitchen.prep-counter.angled.blend'
ORIGINAL_SHA256 = 'a82cc835b2225a9a4ef6c113d2d887365e5f6b6d92933f0f0b234e5f28e47d00'


def capture(scene):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    rows = {}
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        try:
            rows[obj.name] = {
                'vertices': [list(evaluated.matrix_world @ v.co) for v in mesh.vertices],
                'materials': [(m.name, list(m.diffuse_color)) for m in obj.data.materials],
            }
        finally:
            evaluated.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=0.003):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = 'angled-prep.' + name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('soft machined edge', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
    return obj


def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('The retained authored prep-counter source differs from its audited identity')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    before = capture(scene)
    if len(before) != 24:
        raise ValueError('Expected all 24 original prep-counter assembly meshes')
    # Bake the already approved footprint fit into this dedicated source. Its
    # exporter therefore uses unit scales and exactly one anchor translation.
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.matrix_world = Matrix.Diagonal((.90, .90, 1, 1)) @ obj.matrix_world
    fitted = capture(scene)
    steel = bpy.data.materials['brushed stainless']
    dark = bpy.data.materials['recess shadow']
    # Keep the solid authored carcass; the narrow service shelf projects only
    # into its existing front clearance, with physical bracket supports.
    box('service shelf', (0, -.441, .245), (1.56, .074, .026), steel)
    box('shelf raised front lip', (0, -.477, .267), (1.56, .009, .035), steel, .002)
    for side in (-1, 1):
        box(f'shelf bracket vertical {side}', (side*.64, -.410, .180), (.024, .025, .145), steel)
        box(f'shelf bracket horizontal {side}', (side*.64, -.438, .235), (.024, .073, .020), steel)
    # Joinery follows the actual retained four drawer faces; their existing
    # dark recesses and original handle geometry remain untouched.
    for index, x in enumerate((-.594, -.198, .198, .594)):
        for side in (-1, 1):
            box(f'drawer edge vertical {index} {side}', (x+side*.146, -.444, .55), (.009, .010, .265), steel, .001)
        for z in (.422, .678):
            box(f'drawer edge horizontal {index} {z}', (x, -.444, z), (.292, .010, .009), steel, .001)
        for side in (-1, 1):
            box(f'handle standoff {index} {side}', (x+side*.063, -.448, .64), (.014, .031, .023), steel, .002)
    for side in (-1, 1):
        box(f'worktop end joint {side}', (side*.922, 0, 1.035), (.009, .834, .071), dark, .001)
    for x in (-.88, .88):
        box(f'worktop front end cap {x}', (x, -.422, 1.033), (.018, .009, .075), steel, .001)
    # Metal rim strips sit on existing trays; orange contents stay authored.
    for index, x in enumerate((-.045, .270, .585)):
        for side in (-1, 1):
            box(f'pan rim long {index} {side}', (x+side*.112, -.018, 1.163), (.009, .369, .011), steel, .001)
        for y in (-.202, .166):
            box(f'pan rim end {index} {y}', (x, y, 1.163), (.224, .009, .011), steel, .001)
    # Four fitted basin seams surround the existing dark bowl.
    for side in (-1, 1):
        box(f'basin rim long {side}', (-.522+side*.264, -.027, 1.177), (.014, .486, .011), steel, .001)
    for y in (-.270, .216):
        box(f'basin rim end {y}', (-.522, y, 1.177), (.528, .014, .011), steel, .001)
    # A real polygonal curved tube connects a stem to a downward spout.
    import math
    centers = [(-.522, .251, 1.125+i*.032) for i in range(9)]
    centers += [(-.522, .141+.110*math.cos(t), 1.381+.110*math.sin(t)) for t in [math.pi*i/16 for i in range(1,17)]]
    centers += [(-.522, .031, 1.381-i*.028) for i in range(1,4)]
    from mathutils import Vector
    vertices=[];faces=[]
    for ring, center in enumerate(centers):
        tangent=Vector(centers[min(ring+1,len(centers)-1)])-Vector(centers[max(0,ring-1)])
        tangent.normalize();axis=Vector((1,0,0));cross=tangent.cross(axis).normalized()
        for segment in range(12):
            angle=math.tau*segment/12;vertices.append(Vector(center)+.014*(math.cos(angle)*axis+math.sin(angle)*cross))
    for ring in range(len(centers)-1):
        for segment in range(12):
            nxt=(segment+1)%12;faces.append((ring*12+segment,ring*12+nxt,(ring+1)*12+nxt,(ring+1)*12+segment))
    faces += [tuple(range(11,-1,-1)),tuple((len(centers)-1)*12+i for i in range(12))]
    mesh=bpy.data.meshes.new('continuous curved faucet');mesh.from_pydata(vertices,[],faces);mesh.update()
    faucet=bpy.data.objects.new('angled-prep.curved faucet',mesh);scene.collection.objects.link(faucet);mesh.materials.append(steel)
    box('faucet mounting plate', (-.522, .251, 1.137), (.063,.058,.022), steel)
    for side in (-1,1):
        box(f'faucet valve {side}', (-.522+side*.069,.251,1.163), (.043,.038,.041), steel)
    after = capture(scene)
    maximum_error = 0.0
    for name, original in before.items():
        actual = after[name]
        if actual['materials'] != original['materials']:
            raise ValueError(f'Original material changed: {name}')
        for old, new in zip(original['vertices'], actual['vertices'], strict=True):
            maximum_error = max(maximum_error, max(abs(new[a] - old[a] * (.90, .90, 1)[a]) for a in range(3)))
        if actual != fitted[name]:
            raise ValueError(f'Added geometry altered the retained assembly: {name}')
    if maximum_error > 1e-6:
        raise ValueError('Retained assembly does not match the previously approved XY fit')
    points = [point for row in after.values() for point in row['vertices']]
    minimum = [min(p[a] for p in points) for a in range(3)]
    maximum = [max(p[a] for p in points) for a in range(3)]
    if not (-1 <= minimum[0] <= maximum[0] <= 1 and -.5 <= minimum[1] <= maximum[1] <= .5 and abs(minimum[2]) < 1e-6):
        raise ValueError(f'Dedicated prep-counter escapes centered 2x1: {minimum} to {maximum}')
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes() != original_bytes:
        raise ValueError('Original source bytes changed')
    provenance = {
        'originalSource': str(ORIGINAL.relative_to(ROOT)).replace('\\', '/'),
        'originalSourceSha256': ORIGINAL_SHA256,
        'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
        'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'footprintTiles': [2, 1], 'originalMeshCount': len(before),
        'retainedAssemblyFit': [.90, .90, 1], 'retainedMaximumCoordinateError': maximum_error,
        'originalMeshNames': sorted(before),
        'addedMeshNames': sorted(set(after) - set(before)),
        'sourceEvaluatedBounds': {'min': minimum, 'max': maximum},
        'cameraTargetTiles': [1, .5, (minimum[2] + maximum[2]) / 2],
        'meshes': [{'name': name, 'evaluatedVertices': len(row['vertices']), 'materials': row['materials']} for name, row in sorted(after.items())],
    }
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'), json.dumps(provenance, indent=2) + '\n')
    print(json.dumps({k: v for k, v in provenance.items() if k not in ('meshes', 'originalMeshNames', 'addedMeshNames')}, indent=2))
    print(f'Retained {len(before)} original meshes; authored {len(after) - len(before)} added meshes')


if __name__ == '__main__':
    build()
