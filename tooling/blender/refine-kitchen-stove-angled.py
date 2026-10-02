"""Refine the existing Kitchen stove assembly in a dedicated authored source."""
from __future__ import annotations
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common
pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = ROOT / 'assets/source/blender/furniture.kitchen.stove.variants.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.kitchen.stove.angled.blend'
ORIGINAL_SHA256 = 'cbf3ed97f84e126ddb309ea55559810ac156d430371dcb9c074e7b7e1c3523d9'


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
    obj.name = 'angled-stove.' + name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('soft machined edge', 'BEVEL')
        modifier.width = bevel
        modifier.segments = 2
    return obj


def collar(name, center, material):
    # Four explicit elliptic loops make a closed cast-iron collar, with a
    # genuine central opening. Original orange burner cores remain visible.
    vertices = []
    for z, radii in ((1.442, (.192, .158)), (1.442, (.125, .103)),
                     (1.468, (.192, .158)), (1.468, (.125, .103))):
        for segment in range(32):
            angle = segment * 2 * math.pi / 32
            vertices.append((center[0] + radii[0] * math.cos(angle),
                             center[1] + radii[1] * math.sin(angle), z))
    faces = []
    for segment in range(32):
        following = (segment + 1) % 32
        faces.extend(((segment, following, 64 + following, 64 + segment),
                      (32 + following, 32 + segment, 96 + segment, 96 + following),
                      (64 + segment, 64 + following, 96 + following, 96 + segment),
                      (following, segment, 32 + segment, 32 + following)))
    mesh = bpy.data.meshes.new('angled-stove.' + name + '.mesh')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new('angled-stove.' + name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)


def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('The retained authored stove source differs from its audited identity')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    before = capture(scene)
    if len(before) != 29:
        raise ValueError('Expected all 29 original stove assembly meshes')
    # Bake the already approved footprint fit into this dedicated source. Its
    # exporter therefore uses unit scales and exactly one anchor translation.
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.matrix_world = Matrix.Diagonal((.9, .75, 1, 1)) @ obj.matrix_world
    fitted = capture(scene)
    iron = bpy.data.materials['cast iron']
    steel = bpy.data.materials['brushed steel']
    for index, (x, y) in enumerate(((-.45, -.165), (-.45, .15), (.45, -.165), (.45, .15))):
        collar(f'burner collar {index}', (x, y), iron)
        box(f'pot support east-west {index}', (x, y, 1.490), (.38, .024, .032), iron)
        box(f'pot support north-south {index}', (x, y, 1.492), (.024, .30, .032), iron)
    for oven, x in enumerate((-.45, .45)):
        for side in (-1, 1):
            box(f'oven seal vertical {oven} {side}', (x + side * .288, -.416, .66), (.012, .009, .49), iron, .001)
        for z in (.415, .905):
            box(f'oven seal horizontal {oven} {z}', (x, -.416, z), (.58, .009, .012), iron, .001)
        for z in (.30, .91):
            box(f'oven hinge {oven} {z}', (x - .36, -.406, z), (.026, .023, .055), steel)
    for side in (-1, 1):
        for row in range(5):
            box(f'side vent recess {side} {row}', (side * .905, -.01, .28 + row * .115), (.008, .48, .036), iron, .001)
            box(f'side vent louvre {side} {row}', (side * .910, -.01, .296 + row * .115), (.012, .48, .008), steel, .001)
    for index, x in enumerate((-.72, -.42, -.12, .18, .48, .78)):
        box(f'control knob index {index}', (x * .9, -.414, 1.176), (.007, .008, .027), iron, .001)
    box('rolled splash lip', (0, .285, 2.231), (1.82, .11, .030), steel, .009)
    after = capture(scene)
    maximum_error = 0.0
    for name, original in before.items():
        actual = after[name]
        if actual['materials'] != original['materials']:
            raise ValueError(f'Original material changed: {name}')
        for old, new in zip(original['vertices'], actual['vertices'], strict=True):
            maximum_error = max(maximum_error, max(abs(new[a] - old[a] * (.9, .75, 1)[a]) for a in range(3)))
        if actual != fitted[name]:
            raise ValueError(f'Added geometry altered the retained assembly: {name}')
    if maximum_error > 1e-6:
        raise ValueError('Retained assembly does not match the previously approved XY fit')
    points = [point for row in after.values() for point in row['vertices']]
    minimum = [min(p[a] for p in points) for a in range(3)]
    maximum = [max(p[a] for p in points) for a in range(3)]
    if not (-1 <= minimum[0] <= maximum[0] <= 1 and -.5 <= minimum[1] <= maximum[1] <= .5 and abs(minimum[2]) < 1e-6):
        raise ValueError(f'Dedicated stove escapes centered 2x1: {minimum} to {maximum}')
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
        'retainedAssemblyFit': [.9, .75, 1], 'retainedMaximumCoordinateError': maximum_error,
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
