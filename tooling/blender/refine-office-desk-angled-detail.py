"""Retain the authored generic Reception desk and model physical input/service hardware."""
from __future__ import annotations
import hashlib
import json
import math
import struct
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector
sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common
pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = ROOT / 'assets/source/blender/furniture.office.desk.generic.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.office.desk.generic.angled-detail.blend'
ORIGINAL_SHA256 = '87ecf22ec7f4d82e5c2c47bb18870b8ef060a84759cb55d38b131fc34e72e11b'


def raw_record(obj):
    vertices = b''.join(struct.pack('<3f', *v.co) for v in obj.data.vertices)
    topology = b''.join(struct.pack('<I', len(p.vertices)) + struct.pack('<' + 'I' * len(p.vertices), *p.vertices) for p in obj.data.polygons)
    modifiers = []
    for modifier in obj.modifiers:
        values = {}
        for prop in modifier.bl_rna.properties:
            if prop.is_readonly or prop.type not in ('BOOLEAN', 'INT', 'FLOAT', 'STRING', 'ENUM'):
                continue
            value = getattr(modifier, prop.identifier)
            values[prop.identifier] = list(value) if getattr(prop, 'is_array', False) else value
        modifiers.append({'name': modifier.name, 'type': modifier.type, 'values': values})
    return {'name': obj.name, 'rawVertexBytesSha256': hashlib.sha256(vertices).hexdigest(),
            'rawTopologyBytesSha256': hashlib.sha256(topology).hexdigest(),
            'materials': [m.name for m in obj.data.materials], 'modifiers': modifiers}


def materials_record():
    records = []
    for m in sorted(bpy.data.materials, key=lambda material: material.name):
        if m.name not in ('monitor display', 'paper', 'powder coated steel', 'teal drawer label', 'warm oak laminate', 'worktop edging'):
            continue
        data = {'name': m.name, 'diffuse': list(m.diffuse_color), 'metallic': m.metallic,
                'roughness': m.roughness, 'useNodes': m.use_nodes, 'nodes': [], 'links': []}
        if m.use_nodes:
            for node in sorted(m.node_tree.nodes, key=lambda item: item.name):
                inputs = []
                for socket in node.inputs:
                    if not hasattr(socket, 'default_value'): continue
                    value = socket.default_value
                    if not isinstance(value, (float, int, bool, str)):
                        try: value = list(value)
                        except TypeError: value = str(value)
                    inputs.append({'name': socket.name, 'value': value})
                data['nodes'].append({'name': node.name, 'type': node.bl_idname, 'inputs': inputs})
            data['links'] = sorted([link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name] for link in m.node_tree.links)
        data['canonicalMaterialSha256'] = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
        records.append(data)
    return records


def capture(scene):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    rows = {}
    for obj in sorted(scene.objects, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        value = obj.evaluated_get(graph); mesh = value.to_mesh()
        try:
            points = [value.matrix_world @ v.co for v in mesh.vertices]
            rows[obj.name] = {'points': points, 'evaluatedPositionSha256': hashlib.sha256(b''.join(struct.pack('<3f', *p) for p in points)).hexdigest()}
        finally:
            value.to_mesh_clear()
    return rows


def convex_normal_audit(scene):
    """All retained boxes and additions are convex: compare actual faces with their solid centroid."""
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get(); rows = []
    for obj in sorted(scene.objects, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        value = obj.evaluated_get(graph); mesh = value.to_mesh()
        try:
            points = [value.matrix_world @ v.co for v in mesh.vertices]
            center = sum(points, Vector()) / len(points)
            normal_matrix = value.matrix_world.to_3x3().inverted().transposed()
            dots = [(normal_matrix @ p.normal).normalized().dot(value.matrix_world @ p.center - center) for p in mesh.polygons]
            if not dots or min(dots) <= 0:
                raise ValueError('Evaluated office desk convex surface normals face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-desk.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation=(math.pi / 2, 0, 0) if axis == 'Y' else ((0, math.pi / 2, 0) if axis == 'X' else (0, 0, 0)))
    obj = bpy.context.object; obj.name = 'angled-desk.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def build():
    original = ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original authored Reception desk source identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL)); scene = bpy.context.scene
    retained = sorted((o for o in scene.objects if o.type == 'MESH'), key=lambda item: item.name)
    if len(retained) != 21:
        raise ValueError('Expected twenty-one retained authored desk parts')
    raw_before = [raw_record(obj) for obj in retained]; material_before = materials_record()
    matrices_before = {obj.name: [list(row) for row in obj.matrix_world] for obj in retained}
    if len(material_before) != 6:
        raise ValueError('Expected six retained authored desk materials')
    before = capture(scene); original_normals = convex_normal_audit(scene)
    steel = bpy.data.materials['powder coated steel']; dark = bpy.data.materials['monitor display']
    teal = bpy.data.materials['teal drawer label']; edge = bpy.data.materials['worktop edging']
    # Actual separately beveled keycaps fit the retained .53x.18 keyboard slab.
    # Three twelve-key rows and six modifier keys surround one wider spacebar.
    for row in range(4):
        for column in range(12):
            if row == 3 and 3 <= column <= 8: continue
            x = -.4725 + column * .042; y = .110 + row * .040
            box(f'keycap row{row} column{column}', (x, y, .785), (.032, .028, .015), steel, .002)
    box('keyboard spacebar', (-.2415, .230, .785), (.242, .028, .015), steel, .002)
    # Keep the original flat teal pull as the retained backplate. Add a raised
    # bridge with two genuine standoffs in front of each existing drawer.
    for z in (.16, .34, .52):
        for side in (-1, 1):
            box(f'drawer pull standoff {z} {side}', (.59 + side * .053, .251, z), (.014, .036, .020), steel, .002)
        box(f'raised drawer pull bridge {z}', (.59, .272, z), (.122, .018, .023), teal, .003)
    for x in (.397, .783):
        for y in (-.302, .196):
            box(f'pedestal corner seam {x} {y}', (x, y, .33), (.009, .012, .555), edge, .001)
    # Brackets follow actual retained leg-to-worktop joints. No suspended
    # ornaments or invented cupboard hinges are added to a drawer pedestal.
    for x in (-.78, .78):
        for y in (-.24, .29):
            box(f'leg bracket vertical {x} {y}', (x, y + .045, .660), (.068, .010, .073), steel, .001)
            box(f'leg bracket horizontal {x} {y}', (x, y + .063, .696), (.068, .046, .010), steel, .001)
            cylinder(f'foot adjustment collar {x} {y}', (x, y, .035), .057, .022, steel, axis='Z')
    for side in (-1, 1):
        cylinder(f'monitor tilt pivot bolt {side}', (-.30 + side * .037, -.20, 1.010), .014, .017, steel, axis='X')
    # The cable entry has a real raised housing and separately recessed cap,
    # using the existing dark screen material; no texture or new colour.
    cylinder('worktop cable entry housing', (.24, -.30, .754), .039, .010, steel, axis='Z')
    cylinder('worktop cable entry recessed cap', (.24, -.30, .760), .027, .003, dark, .0005, axis='Z')
    box('rear cable clamp', (.24, -.372, .686), (.066, .028, .025), dark)
    after = capture(scene); normals = convex_normal_audit(scene)
    if [raw_record(obj) for obj in retained] != raw_before:
        raise ValueError('Original desk raw vertices/topology/material/modifiers changed')
    if {obj.name: [list(row) for row in obj.matrix_world] for obj in retained} != matrices_before:
        raise ValueError('Original desk assembly transforms changed')
    for obj in retained:
        if after[obj.name]['evaluatedPositionSha256'] != before[obj.name]['evaluatedPositionSha256']:
            raise ValueError('Physical details altered the retained evaluated desk geometry')
    if materials_record() != material_before:
        raise ValueError('Original six desk material graphs changed')
    points = [p for row in after.values() for p in row['points']]
    minimum = [min(p[a] for p in points) for a in range(3)]; maximum = [max(p[a] for p in points) for a in range(3)]
    for turns in range(4):
        width, height = (2, 1) if turns % 2 == 0 else (1, 2)
        for p in points:
            x, y = p.x, p.y
            for _ in range(turns): x, y = -y, x
            if not (-width / 2 <= x <= width / 2 and -height / 2 <= y <= height / 2 and p.z >= -1e-6):
                raise ValueError('Dedicated desk escapes a grounded occupied quarter turn')
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes() != original:
        raise ValueError('Original desk source bytes changed')
    receipt = {'originalSource': str(ORIGINAL.relative_to(ROOT)).replace('\\', '/'), 'originalSourceSha256': ORIGINAL_SHA256,
               'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
               'footprintTiles': [2, 1], 'retainedMeshesCount': 21, 'retainedMeshes': raw_before,
               'retainedMaterialGraphs': material_before, 'retainedObjectMatrices': matrices_before,
               'originalEvaluatedOutwardNormalAudit': original_normals, 'evaluatedOutwardNormalAudit': normals,
               'sourceEvaluatedBounds': {'min': minimum, 'max': maximum}, 'cameraTargetTiles': [1, .5, (minimum[2] + maximum[2]) / 2],
               'addedMeshNames': sorted(set(after) - set(before)),
               'meshes': [{'name': name, 'evaluatedVertices': len(row['points']), 'evaluatedPositionSha256': row['evaluatedPositionSha256']} for name, row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'), json.dumps(receipt, indent=2) + '\n')
    print('DESK_DETAIL_SOURCE', receipt['sourceSha256'], len(retained), len(after) - len(retained), minimum, maximum, flush=True)


if __name__ == '__main__':
    build()
