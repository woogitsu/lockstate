"""Retain the authored utility panel, correct inward winding and model service details."""
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
ORIGINAL = ROOT / 'assets/source/blender/utility.utility-panel.variants.blend'
SOURCE = ROOT / 'assets/source/blender/utility.utility-panel.angled.blend'
ORIGINAL_SHA256 = '05281b06512f7dabab247b183568b249aa8df04e912c7ea89a209e918f9775ea'


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
        if m.name not in ('warm charcoal', 'control panel', 'monitor glass', 'amber status'):
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
                raise ValueError('Evaluated utility panel convex surface normals face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-utility.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation=(math.pi / 2, 0, 0) if axis == 'Y' else (0, 0, 0))
    obj = bpy.context.object; obj.name = 'angled-utility.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def build():
    original = ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original authored utility panel source identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL)); scene = bpy.context.scene
    retained = sorted((o for o in scene.objects if o.type == 'MESH'), key=lambda item: item.name)
    if len(retained) != 9:
        raise ValueError('Expected nine retained utility panel parts')
    raw_before = [raw_record(obj) for obj in retained]; material_before = materials_record()
    if len(material_before) != 4:
        raise ValueError('Expected four retained utility panel materials')
    evaluated_before = capture(scene)
    original_normals = []
    for obj in retained:
        center = sum((v.co for v in obj.data.vertices), Vector()) / len(obj.data.vertices)
        dots = [p.normal.dot(p.center - center) for p in obj.data.polygons]
        if len(dots) != 6 or any(dot >= 0 for dot in dots):
            raise ValueError('Audited inward six-face retained cube geometry changed')
        original_normals.append({'name': obj.name, 'rawInwardPolygons': len(dots)})
        # Preserve vertex order/coordinates, materials and modifiers. Reversing
        # each polygon is an intentional, documented topology correction.
        mesh = bpy.data.meshes.new(obj.data.name + ' outward')
        mesh.from_pydata([tuple(v.co) for v in obj.data.vertices], [], [tuple(reversed(p.vertices)) for p in obj.data.polygons])
        mesh.update()
        for material in obj.data.materials: mesh.materials.append(material)
        obj.data = mesh
        obj.matrix_world = Matrix.Diagonal((.8, .9, 1, 1)) @ obj.matrix_world
    bpy.context.view_layer.update()
    raw_corrected = [raw_record(obj) for obj in retained]
    for before, after in zip(raw_before, raw_corrected, strict=True):
        if {k: v for k, v in before.items() if k != 'rawTopologyBytesSha256'} != {k: v for k, v in after.items() if k != 'rawTopologyBytesSha256'}:
            raise ValueError('Retained utility vertex/material/modifier data changed')
        if before['rawTopologyBytesSha256'] == after['rawTopologyBytesSha256']:
            raise ValueError('Retained inward utility topology was not corrected')
    fitted = capture(scene)
    maximum_retained_error = 0.0
    for obj in retained:
        # Reversing winding changes evaluated vertex order. Compare the actual
        # geometric point sets in both directions, rather than matching indices.
        expected = [Vector((p.x * .8, p.y * .9, p.z)) for p in evaluated_before[obj.name]['points']]
        actual = fitted[obj.name]['points']
        if len(expected) != len(actual):
            raise ValueError('Corrected utility winding changed retained evaluated vertex count')
        for first, second in ((expected, actual), (actual, expected)):
            maximum_retained_error = max(maximum_retained_error, max(min((p - q).length for q in second) for p in first))
    if maximum_retained_error > 1e-6:
        raise ValueError('Corrected utility winding changed the fitted retained geometry')
    body = bpy.data.materials['warm charcoal']; dark = bpy.data.materials['control panel']; amber = bpy.data.materials['amber status']
    # Bridge the authored front panel to the retained cabinet, without moving it.
    for side in (-1, 1):
        box(f'cabinet side cheek {side}', (side * .385, -.281, .48), (.012, .17, .60), body)
        box(f'monitor bezel vertical {side}', (side * .425, -.410, .55), (.012, .012, .322), dark)
        cylinder(f'cabinet hinge pin {side}', (side * .371, -.367, .735), .009, .056, body, axis='Z')
        box(f'cabinet hinge leaf {side}', (side * .362, -.371, .735), (.027, .010, .057), body)
    for z in (.384, .716):
        box(f'monitor bezel horizontal {z}', (0, -.410, z), (.856, .012, .012), dark)
    for index, x in enumerate((-.18, .065)):
        cylinder(f'control knob shoulder {index}', (x, -.417, .28), .030, .016, body)
        cylinder(f'round control knob {index}', (x, -.435, .28), .024, .022, dark)
        box(f'raised amber pointer {index}', (x, -.4475, .292), (.004, .003, .020), amber, .0005)
    box('service hatch inset', (0, -.373, .175), (.58, .009, .104), dark)
    for side in (-1, 1):
        box(f'service hatch frame vertical {side}', (side * .297, -.379, .175), (.008, .011, .114), body)
    for z in (.122, .228):
        box(f'service hatch frame horizontal {z}', (0, -.379, z), (.602, .011, .008), body)
    cylinder('service hatch latch spindle', (.238, -.390, .175), .010, .016, body)
    box('service hatch latch lever', (.238, -.402, .175), (.037, .012, .009), body)
    for side in (-1, 1):
        cylinder(f'rear cable gland nut {side}', (side * .24, .211, .22), .027, .022, body)
        cylinder(f'rear cable gland sleeve {side}', (side * .24, .238, .22), .015, .031, dark)
    normals = convex_normal_audit(scene); after = capture(scene)
    for obj in retained:
        if after[obj.name]['evaluatedPositionSha256'] != fitted[obj.name]['evaluatedPositionSha256']:
            raise ValueError('Physical additions altered the corrected retained assembly')
    if materials_record() != material_before:
        raise ValueError('Retained utility material data changed')
    points = [p for row in after.values() for p in row['points']]
    minimum = [min(p[a] for p in points) for a in range(3)]; maximum = [max(p[a] for p in points) for a in range(3)]
    for turns in range(4):
        for p in points:
            x, y = p.x, p.y
            for _ in range(turns): x, y = -y, x
            if not (-.5 <= x <= .5 and -.5 <= y <= .5 and p.z >= -1e-6):
                raise ValueError('Dedicated utility panel escapes grounded occupied quarter turn')
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes() != original:
        raise ValueError('Original utility source bytes changed')
    receipt = {'originalSource': str(ORIGINAL.relative_to(ROOT)).replace('\\', '/'), 'originalSourceSha256': ORIGINAL_SHA256,
               'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'), 'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
               'acceptedFitBaked': [.8, .9, 1], 'footprintTiles': [1, 1], 'retainedMeshesCount': 9,
               'retainedEvaluatedPointSetMaximumError': maximum_retained_error,
               'retainedMeshesBefore': raw_before, 'retainedMeshesCorrected': raw_corrected, 'retainedMaterialValues': material_before,
               'originalRawNormalAudit': original_normals, 'evaluatedOutwardNormalAudit': normals,
               'sourceEvaluatedBounds': {'min': minimum, 'max': maximum}, 'cameraTargetTiles': [.5, .5, (minimum[2] + maximum[2]) / 2],
               'addedMeshNames': sorted(set(after) - set(fitted)),
               'meshes': [{'name': name, 'evaluatedVertices': len(row['points']), 'evaluatedPositionSha256': row['evaluatedPositionSha256']} for name, row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'), json.dumps(receipt, indent=2) + '\n')
    print('UTILITY_SOURCE', receipt['sourceSha256'], len(retained), len(after) - len(retained), minimum, maximum, flush=True)


if __name__ == '__main__':
    build()
