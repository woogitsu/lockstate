"""Refine the existing Kitchen fridge assembly in a dedicated authored source."""
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
ORIGINAL = ROOT / 'assets/source/blender/furniture.kitchen.fridge.variants.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.kitchen.fridge.angled.blend'
ORIGINAL_SHA256 = '44bf77f85241539e9ada8bd584c850738f467f3fea244877f3eb47a2d0a6df76'


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
    obj.name = 'angled-fridge.' + name
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
        raise ValueError('The retained authored fridge source differs from its audited identity')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    before = capture(scene)
    if len(before) != 9:
        raise ValueError('Expected all 9 original fridge assembly meshes')
    # Bake the already approved footprint fit into this dedicated source. Its
    # exporter therefore uses unit scales and exactly one anchor translation.
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.matrix_world = Matrix.Diagonal((.85, .85, 1, 1)) @ obj.matrix_world
    fitted = capture(scene)
    rubber = bpy.data.materials['rubber']
    steel = bpy.data.materials['steel']
    # Gaskets border the retained closed doors, without replacing their faces.
    for door, low, high in [('freezer', 1.54, 2.26), ('fridge', .27, 1.575)]:
        for side in (-1, 1):
            box(f'{door} gasket vertical {side}', (side * .344, -.438, (low + high) / 2), (.014, .010, high - low), rubber, .002)
        for z in (low, high):
            box(f'{door} gasket horizontal {z}', (0, -.438, z), (.688, .010, .014), rubber, .002)
    for index, z in enumerate((.40, 1.30, 1.65, 2.15)):
        box(f'hinge plate {index}', (-.349, -.440, z), (.040, .023, .055), steel)
        bpy.ops.mesh.primitive_cylinder_add(vertices=16, radius=.009, depth=.068, location=(-.354, -.455, z))
        obj = bpy.context.object
        obj.name = f'angled-fridge.hinge barrel {index}'
        obj.data.materials.append(steel)
    for index, z in enumerate((.57, 1.33, 1.66, 2.14)):
        box(f'handle standoff {index}', (.272, -.456, z), (.056, .022, .026), steel)
    for side in (-1, 1):
        box(f'status bezel vertical {side}', (-.289 + side * .034, -.468, 2.180), (.005, .005, .078), rubber, .001)
    for z in (2.141, 2.219):
        box(f'status bezel horizontal {z}', (-.289, -.468, z), (.073, .005, .005), rubber, .001)
    box('front grille recess', (0, -.392, .158), (.66, .018, .168), rubber, .002)
    for row in range(6):
        box(f'front grille blade {row}', (0, -.405, .089 + row * .027), (.62, .009, .008), steel, .001)
    for side in (-1, 1):
        for row in range(8):
            z = .135 + row * .043
            box(f'side vent recess {side} {row}', (side * .413, -.025, z), (.008, .44, .020), rubber, .001)
            box(f'side vent louvre {side} {row}', (side * .417, -.025, z + .012), (.010, .44, .006), steel, .001)
    box('protective plinth lip', (0, -.412, .035), (.70, .022, .022), steel, .003)
    after = capture(scene)
    maximum_error = 0.0
    for name, original in before.items():
        actual = after[name]
        if actual['materials'] != original['materials']:
            raise ValueError(f'Original material changed: {name}')
        for old, new in zip(original['vertices'], actual['vertices'], strict=True):
            maximum_error = max(maximum_error, max(abs(new[a] - old[a] * (.85, .85, 1)[a]) for a in range(3)))
        if actual != fitted[name]:
            raise ValueError(f'Added geometry altered the retained assembly: {name}')
    if maximum_error > 1e-6:
        raise ValueError('Retained assembly does not match the previously approved XY fit')
    points = [point for row in after.values() for point in row['vertices']]
    minimum = [min(p[a] for p in points) for a in range(3)]
    maximum = [max(p[a] for p in points) for a in range(3)]
    if not (-.5 <= minimum[0] <= maximum[0] <= .5 and -.5 <= minimum[1] <= maximum[1] <= .5 and abs(minimum[2]) < 1e-6):
        raise ValueError(f'Dedicated fridge escapes centered 1x1: {minimum} to {maximum}')
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes() != original_bytes:
        raise ValueError('Original source bytes changed')
    provenance = {
        'originalSource': str(ORIGINAL.relative_to(ROOT)).replace('\\', '/'),
        'originalSourceSha256': ORIGINAL_SHA256,
        'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
        'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'footprintTiles': [1, 1], 'originalMeshCount': len(before),
        'retainedAssemblyFit': [.85, .85, 1], 'retainedMaximumCoordinateError': maximum_error,
        'originalMeshNames': sorted(before),
        'addedMeshNames': sorted(set(after) - set(before)),
        'sourceEvaluatedBounds': {'min': minimum, 'max': maximum},
        'cameraTargetTiles': [.5, .5, (minimum[2] + maximum[2]) / 2],
        'meshes': [{'name': name, 'evaluatedVertices': len(row['vertices']), 'materials': row['materials']} for name, row in sorted(after.items())],
    }
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'), json.dumps(provenance, indent=2) + '\n')
    print(json.dumps({k: v for k, v in provenance.items() if k not in ('meshes', 'originalMeshNames', 'addedMeshNames')}, indent=2))
    print(f'Retained {len(before)} original meshes; authored {len(after) - len(before)} added meshes')


if __name__ == '__main__':
    build()
