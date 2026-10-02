"""Refine the existing Laundry washing machine assembly in a dedicated authored source."""
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
ORIGINAL = ROOT / 'assets/source/blender/utility.washing-machine.variants.blend'
SOURCE = ROOT / 'assets/source/blender/utility.washing-machine.angled.blend'
ORIGINAL_SHA256 = 'fb4eccefc3809342b57e4b15822e68ee1a1d0060bc8d75acda288d07284f7e0b'


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
    obj.name = 'angled-washer.' + name
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
        raise ValueError('The retained authored washing machine source differs from its audited identity')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    before = capture(scene)
    if len(before) != 14:
        raise ValueError('Expected all 14 original washing machine assembly meshes')
    # Bake the already approved footprint fit into this dedicated source. Its
    # exporter therefore uses unit scales and exactly one anchor translation.
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.matrix_world = Matrix.Diagonal((1, .8, 1, 1)) @ obj.matrix_world
    fitted = capture(scene)
    import math
    rubber = bpy.data.materials['rubber']
    steel = bpy.data.materials['steel']
    def ring(name, center, major, minor, material):
        bpy.ops.mesh.primitive_torus_add(major_segments=64, minor_segments=12, location=center,
            rotation=(math.pi/2,0,0), major_radius=major, minor_radius=minor)
        obj=bpy.context.object;obj.name='angled-washer.'+name;obj.data.materials.append(material)
        return obj
    ring('door machined rim', (0,-.422,.76), .421,.012,steel)
    ring('door glass gasket', (0,-.435,.76), .382,.007,rubber)
    for index in range(8):
        angle=math.tau*index/8
        bpy.ops.mesh.primitive_cylinder_add(vertices=12,radius=.012,depth=.008,
            location=(.450*math.cos(angle),-.425,.76+.450*math.sin(angle)),rotation=(math.pi/2,0,0))
        obj=bpy.context.object;obj.name=f'angled-washer.door fastener {index}';obj.data.materials.append(steel)
    box('door hinge plate',(-.454,-.411,.76),(.049,.031,.120),steel)
    bpy.ops.mesh.primitive_cylinder_add(vertices=16,radius=.013,depth=.15,location=(-.46,-.432,.76))
    obj=bpy.context.object;obj.name='angled-washer.door hinge barrel';obj.data.materials.append(steel)
    # Physical service panel uses existing clearance below the closed door.
    box('service recess',(0,-.345,.16),(.75,.018,.16),rubber)
    for side in (-1,1):
        box(f'service frame vertical {side}',(side*.379,-.360,.16),(.012,.009,.172),steel,.001)
    for z in (.079,.241):
        box(f'service frame horizontal {z}',(0,-.360,z),(.770,.009,.012),steel,.001)
    box('service grip',(0,-.368,.211),(.15,.016,.016),steel,.002)
    for side in (-1,1):
        for row in range(7):
            box(f'side vent recess {side} {row}',(side*.854,0,.42+row*.055),(.008,.39,.025),rubber,.001)
            box(f'side vent louvre {side} {row}',(side*.858,0,.433+row*.055),(.006,.39,.009),steel,.001)
    # Detergent drawer occupies the authored strip's unused left end.
    box('detergent drawer recess',(-.665,-.405,1.39),(.21,.015,.155),rubber,.002)
    for side in (-1,1):
        box(f'detergent drawer side {side}',(-.665+side*.106,-.416,1.39),(.010,.010,.165),steel,.001)
    for z in (1.312,1.468):
        box(f'detergent drawer edge {z}',(-.665,-.416,z),(.212,.010,.010),steel,.001)
    box('detergent drawer grip',(-.665,-.429,1.445),(.12,.020,.019),steel,.002)
    for index,x in enumerate((-.45,-.17,.14)):
        ring(f'control bezel {index}',(x,-.410,1.39),.079,.004,steel)
        box(f'control pointer {index}',(x,-.428,1.427),(.009,.008,.037),steel,.001)
    for side in (-1,1):
        box(f'display bezel vertical {side}',(.38+side*.164,-.428,1.39),(.008,.008,.15),rubber,.001)
    for z in (1.314,1.466):
        box(f'display bezel horizontal {z}',(.38,-.428,z),(.336,.008,.008),rubber,.001)
    # Raised seam strips describe a physical inspection hatch on the plain lid.
    for side in (-1,1):
        box(f'top hatch long seam {side}',(side*.650,0,1.562),( .008,.45,.006),rubber,.001)
        box(f'top hatch end seam {side}',(0,side*.225,1.562),(1.30,.008,.006),rubber,.001)
    after = capture(scene)
    maximum_error = 0.0
    for name, original in before.items():
        actual = after[name]
        if actual['materials'] != original['materials']:
            raise ValueError(f'Original material changed: {name}')
        for old, new in zip(original['vertices'], actual['vertices'], strict=True):
            maximum_error = max(maximum_error, max(abs(new[a] - old[a] * (1, .8, 1)[a]) for a in range(3)))
        if actual != fitted[name]:
            raise ValueError(f'Added geometry altered the retained assembly: {name}')
    if maximum_error > 1e-6:
        raise ValueError('Retained assembly does not match the previously approved XY fit')
    points = [point for row in after.values() for point in row['vertices']]
    minimum = [min(p[a] for p in points) for a in range(3)]
    maximum = [max(p[a] for p in points) for a in range(3)]
    if not (-1 <= minimum[0] <= maximum[0] <= 1 and -.5 <= minimum[1] <= maximum[1] <= .5 and abs(minimum[2]) < 1e-6):
        raise ValueError(f'Dedicated washing machine escapes centered 2x1: {minimum} to {maximum}')
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
        'retainedAssemblyFit': [1, .8, 1], 'retainedMaximumCoordinateError': maximum_error,
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
