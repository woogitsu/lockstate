"""Retain the selected authored medicine cabinet and model real service hardware."""
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
ORIGINAL = ROOT / 'assets/source/blender/fixture.medicine-cabinet.variants.blend'
SOURCE = ROOT / 'assets/source/blender/fixture.medicine-cabinet.angled-detail.blend'
ORIGINAL_SHA256 = '17670457233caef94855cdaf64b2cf1bd3c8623318941cbd3ce2e5c50224ac75'


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
            'materials': [m.name for m in obj.data.materials],
            'polygonMaterialIndicesSha256': hashlib.sha256(b''.join(struct.pack('<I', polygon.material_index) for polygon in obj.data.polygons)).hexdigest(),
            'modifiers': modifiers}


def materials_record():
    records = []
    for m in sorted(bpy.data.materials, key=lambda material: material.name):
        if m.name not in ('brass handle', 'cabinet inset', 'cabinet warm white'):
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
                raise ValueError('Evaluated medicine cabinet convex surface normals face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-medicine-cabinet.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation=(math.pi / 2, 0, 0) if axis == 'Y' else ((0, math.pi / 2, 0) if axis == 'X' else (0, 0, 0)))
    obj = bpy.context.object; obj.name = 'angled-medicine-cabinet.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


RETAINED_NAMES = frozenset(('cabinet_body', 'inner', 'shelf', 'shelf.001', 'shelf.002', 'door', 'door.001', 'handle', 'handle.001'))


def build():
    original = ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original authored medicine cabinet source bytes changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    selected = frozenset(o.name for o in scene.objects if o.type == 'MESH' and o.select_get())
    if selected != RETAINED_NAMES:
        raise ValueError('Original cabinet selected nine-part authorship changed')
    foreign = sorted(o.name for o in scene.objects if o.type == 'MESH' and o.name not in selected)
    if len(foreign) != 11:
        raise ValueError('Original cabinet foreign bed content changed; re-audit')
    for obj in list(scene.objects):
        if obj.type == 'MESH' and obj.name not in selected:
            bpy.data.objects.remove(obj, do_unlink=True)
    retained = sorted((o for o in scene.objects if o.type == 'MESH'), key=lambda o:o.name)
    before = capture(scene); raw_before = [raw_record(o) for o in retained]
    material_before = materials_record()
    matrices_before = {o.name: [list(row) for row in o.matrix_world] for o in retained}
    original_normals = convex_normal_audit(scene)
    white = bpy.data.materials['cabinet warm white']; brass = bpy.data.materials['brass handle']; inset = bpy.data.materials['cabinet inset']
    # Hardware is built on the retained closed door/front +Y. Each barrel
    # uses separately joined knuckles, real leaves and a supporting mount.
    for label, sign in [('left', -1), ('right', 1)]:
        for level, z in [('lower', .25), ('upper', .96)]:
            prefix = f'{label} {level} hinge'
            box(prefix + ' door leaf', (sign*.362, .406, z), (.026, .012, .086), brass, .001)
            box(prefix + ' cabinet leaf', (sign*.390, .406, z), (.026, .012, .086), brass, .001)
            box(prefix + ' frame mount', (sign*.390, .380, z), (.024, .044, .055), white, .001)
            cylinder(prefix + ' moving knuckle', (sign*.376, .418, z), .012, .042, brass, .0008, axis='Z')
            cylinder(prefix + ' lower fixed knuckle', (sign*.376, .418, z-.036), .012, .024, brass, .0008, axis='Z')
            cylinder(prefix + ' upper fixed knuckle', (sign*.376, .418, z+.036), .012, .024, brass, .0008, axis='Z')
            cylinder(prefix + ' pin head', (sign*.376, .418, z+.052), .013, .006, brass, .0006, axis='Z')
        # Keep the two original brass pull blocks exactly; model the real
        # mounting plates and exposed fasteners around their ends.
        for level, z in [('lower', .535), ('upper', .705)]:
            prefix = f'{label} handle {level} mount'
            box(prefix + ' plate', (sign*.11, .4015, z), (.068, .008, .038), white, .001)
            for side in [-1, 1]:
                cylinder(prefix + f' bolt {side}', (sign*.11+side*.026, .407, z), .006, .006, brass, .0005, axis='Y')
    # Reuse the retained inset rear panel; model a frame, raised louvers and
    # fasteners on that actual panel, rather than painting a new texture.
    for label, z in [('bottom', .83), ('top', 1.0)]:
        box('rear service '+label+' frame', (0, -.382, z), (.45, .006, .014), white, .001)
    for label, x in [('left', -.218), ('right', .218)]:
        box('rear service '+label+' frame', (x, -.382, .915), (.014, .006, .17), white, .001)
    for index in range(6):
        box(f'rear service louver {index}', (0, -.382, .862+index*.020), (.35, .004, .008), white, .0006)
    for x in [-.215, .215]:
        for z in [.83, 1.0]:
            cylinder(f'rear service fastener {x} {z}', (x, -.382, z), .007, .004, brass, .0005, axis='Y')
    box('lower toe service plate', (0, .365, .065), (.66, .008, .024), inset, .001)
    for x in [-.30, .30]:
        cylinder(f'lower toe service fastener {x}', (x, .371, .065), .006, .004, brass, .0005, axis='Y')
    points_before = [p for row in before.values() for p in row['points']]
    lift = -min(p.z for p in points_before)
    translation = Matrix.Translation(Vector((0, 0, lift)))
    for obj in scene.objects:
        if obj.type == 'MESH': obj.matrix_world = translation @ obj.matrix_world
    bpy.context.view_layer.update()
    after = capture(scene); normals = convex_normal_audit(scene)
    if len(after) != 66 or len(set(after)-set(before)) != 57:
        raise ValueError('Dedicated cabinet nine retained and 57 authored part count changed')
    if [raw_record(obj) for obj in retained] != raw_before:
        raise ValueError('Original cabinet raw vertex/topology/material/modifier data changed')
    max_error = max((actual - (expected + Vector((0, 0, lift)))).length for name,row in before.items() for actual,expected in zip(after[name]['points'],row['points']))
    if max_error > 1e-6:
        raise ValueError('Cabinet retained evaluated geometry changed beyond accepted rigid grounding')
    if materials_record() != material_before:
        raise ValueError('Original three cabinet material graphs changed')
    points = [p for row in after.values() for p in row['points']]
    minimum = [min(p[a] for p in points) for a in range(3)];maximum = [max(p[a] for p in points) for a in range(3)]
    for turns in range(4):
        for p in points:
            x,y = p.x,p.y
            for _ in range(turns): x,y = -y,x
            if not (-.5<=x<=.5 and -.5<=y<=.5 and p.z>=-1e-6):
                raise ValueError('Dedicated medicine cabinet escapes its grounded 1x1 quarter turn')
    prepared_matrices = {o.name: [list(row) for row in o.matrix_world] for o in retained}
    for o in scene.objects:
        if o.type == 'MESH': o.select_set(True)
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes() != original:
        raise ValueError('Original cabinet source bytes changed')
    receipt = {'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA256,
               'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
               'footprintTiles':[1,1],'originalSceneMeshCount':20,'foreignBedMeshNames':foreign,'retainedMeshesCount':9,
               'retainedSelectedNames':sorted(selected),'retainedMeshes':raw_before,'retainedMaterialGraphs':material_before,
               'originalRetainedObjectMatrices':matrices_before,'preparedRetainedObjectMatrices':prepared_matrices,
               'groundTranslationTiles':[0,0,lift],'retainedEvaluatedRigidTranslationMaximumError':max_error,
               'originalEvaluatedOutwardNormalAudit':original_normals,'evaluatedOutwardNormalAudit':normals,
               'sourceEvaluatedBounds':{'min':minimum,'max':maximum},'cameraTargetTiles':[.5,.5,(minimum[2]+maximum[2])/2],
               'addedMeshNames':sorted(set(after)-set(before)),
               'meshes':[{'name':name,'evaluatedVertices':len(row['points']),'evaluatedPositionSha256':row['evaluatedPositionSha256']} for name,row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n')
    print('MEDICINE_CABINET_DETAIL_SOURCE',receipt['sourceSha256'],len(retained),len(after)-len(retained),minimum,maximum,flush=True)


if __name__ == '__main__':
    build()
