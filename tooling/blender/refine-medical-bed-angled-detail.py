"""Retain the selected authored medical bed and model real service hardware."""
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
ORIGINAL = ROOT / 'assets/source/blender/furniture.medical-bed.variants.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.medical-bed.angled-detail.blend'
ORIGINAL_SHA256 = '1737b03a3ee1342e813e7096e0aef189f05d714d5a69437a8fe490c026d232be'


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
        if m.name not in ('mattress edge', 'medical linen', 'rail accent', 'warm painted steel'):
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
                raise ValueError('Evaluated medical bed convex surface normals face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-medical-bed.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation=(math.pi / 2, 0, 0) if axis == 'Y' else ((0, math.pi / 2, 0) if axis == 'X' else (0, 0, 0)))
    obj = bpy.context.object; obj.name = 'angled-medical-bed.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


RETAINED_NAMES = frozenset(('bed_base', 'mattress', 'rail', 'rail.001', 'leg', 'leg.001', 'leg.002', 'leg.003', 'headboard', 'pillow', 'control'))


def build():
    original = ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original authored medical bed source bytes changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    selected = frozenset(o.name for o in scene.objects if o.type == 'MESH' and o.select_get())
    if selected != RETAINED_NAMES:
        raise ValueError('Original bed selected eleven-part authorship changed')
    if sum(o.type == 'MESH' for o in scene.objects) != 11:
        raise ValueError('Original bed eleven-part scene changed')
    retained = sorted((o for o in scene.objects if o.type == 'MESH'), key=lambda o:o.name)
    before = capture(scene); raw_before = [raw_record(o) for o in retained]
    material_before = materials_record()
    matrices_before = {o.name: [list(row) for row in o.matrix_world] for o in retained}
    original_normals = convex_normal_audit(scene)
    white = bpy.data.materials['warm painted steel']; dark = bpy.data.materials['mattress edge']
    teal = bpy.data.materials['medical linen']; accent = bpy.data.materials['rail accent']
    # Retained legs become the stems of real swivel caster assemblies.
    # Wheels reach the existing ground plane; no taller silhouette is invented.
    for label, sign in [('left', -1), ('right', 1)]:
        for end, y in [('foot', -.78), ('head', .78)]:
            prefix = f'{label} {end} caster'
            cylinder(prefix + ' wheel', (sign*.415, y, .015), .105, .075, dark, .002, axis='X')
            cylinder(prefix + ' hub cap', (sign*.461, y, .015), .040, .013, white, .001, axis='X')
            for side in [-1, 1]:
                box(prefix + f' fork cheek {side}', (sign*.441, y+side*.052, .052), (.024, .024, .125), white)
            box(prefix + ' brake tread', (sign*.438, y + (-.046 if y<0 else .046), .108), (.067, .105, .025), accent)
            box(prefix + ' brake linkage', (sign*.438, y, .093), (.024, .061, .035), white)
        # Real side rails sit outside the unchanged mattress and connect to
        # separate pivot mounts. The existing end panels are retained intact.
        cylinder(label+' side safety rail', (sign*.46, -.02, .755), .018, 1.23, white, .001, axis='Y')
        box(label+' washable hand grip', (sign*.46, -.08, .755), (.040, .56, .041), teal)
        for end, y in [('foot', -.56), ('head', .52)]:
            cylinder(label+' '+end+' rail post', (sign*.46, y, .50), .014, .47, white, .001, axis='Z')
            cylinder(label+' '+end+' rail pivot', (sign*.469, y, .267), .033, .035, accent, .001, axis='X')
            box(label+' '+end+' rail mount', (sign*.458, y, .276), (.049, .081, .054), white)
        # Twin visible scissor links and bearing tracks represent the lifting
        # mechanism outside the existing solid base, within the same 1x2 cell.
        for direction in [-1, 1]:
            start=Vector((sign*.478, -.27, .11-direction*.145))
            finish=Vector((sign*.478, .27, .11+direction*.145))
            beam=box(label+f' adjustment link {direction}', (start+finish)/2, (.017, .027, (finish-start).length), accent)
            beam.rotation_mode='QUATERNION'; beam.rotation_quaternion=(finish-start).to_track_quat('Z','Y')
        for level,z in [('lower',-.035),('upper',.255)]:
            box(label+' '+level+' bearing track', (sign*.478,0,z), (.018,.65,.025), white)
        for level,y,z in [('lower',-.27,-.035),('middle',0,.11),('upper',.27,.255)]:
            cylinder(label+' '+level+' lift pivot', (sign*.481,y,z), .028,.016,white,.001,axis='X')
    for end,y in [('foot',-.27),('head',.27)]:
        cylinder(end+' lift cross shaft',(0,y,.038),.019,.93,white,.001,axis='X')
    cylinder('adjustment actuator barrel',(0,-.36,.033),.044,.30,white,.001,axis='Y')
    cylinder('adjustment actuator rod',(0,-.12,.033),.019,.20,accent,.001,axis='Y')
    # Mounts and real raised controls attach to the retained teal control block.
    box('control backing plate',(.38,.666,.82),(.118,.008,.138),white,.001)
    for x in [.331,.429]:
        for z in [.763,.877]:
            cylinder(f'control fastener {x} {z}',(x,.659,z),.006,.007,accent,.0005,axis='Y')
    for x in [.365,.395]:
        cylinder(f'control raised button {x}',(x,.658,.82),.009,.012,white,.0005,axis='Y')
    points_before = [p for row in before.values() for p in row['points']]
    lift = -min(p.z for p in points_before)
    translation = Matrix.Translation(Vector((0, 0, lift)))
    for obj in scene.objects:
        if obj.type == 'MESH': obj.matrix_world = translation @ obj.matrix_world
    bpy.context.view_layer.update()
    after = capture(scene); normals = convex_normal_audit(scene)
    if len(after) != 76 or len(set(after)-set(before)) != 65:
        raise ValueError('Dedicated bed eleven retained and 65 authored part count changed')
    if [raw_record(obj) for obj in retained] != raw_before:
        raise ValueError('Original bed raw vertex/topology/material/modifier data changed')
    max_error = max((actual - (expected + Vector((0, 0, lift)))).length for name,row in before.items() for actual,expected in zip(after[name]['points'],row['points']))
    if max_error > 1e-6:
        raise ValueError('Cabinet retained evaluated geometry changed beyond accepted rigid grounding')
    if materials_record() != material_before:
        raise ValueError('Original four bed material graphs changed')
    points = [p for row in after.values() for p in row['points']]
    minimum = [min(p[a] for p in points) for a in range(3)];maximum = [max(p[a] for p in points) for a in range(3)]
    for turns in range(4):
        for p in points:
            x,y = p.x,p.y
            for _ in range(turns): x,y = -y,x
            width,height=(1,2) if turns%2==0 else (2,1)
            if not (-width/2<=x<=width/2 and -height/2<=y<=height/2 and p.z>=-1e-6):
                raise ValueError('Dedicated medical bed escapes its grounded 1x2 quarter turn')
    prepared_matrices = {o.name: [list(row) for row in o.matrix_world] for o in retained}
    for o in scene.objects:
        if o.type == 'MESH': o.select_set(True)
    bpy.data.orphans_purge(do_local_ids=True, do_linked_ids=True, do_recursive=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes() != original:
        raise ValueError('Original bed source bytes changed')
    receipt = {'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA256,
               'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
               'footprintTiles':[1,2],'originalSceneMeshCount':11,'retainedMeshesCount':11,
               'retainedSelectedNames':sorted(selected),'retainedMeshes':raw_before,'retainedMaterialGraphs':material_before,
               'originalRetainedObjectMatrices':matrices_before,'preparedRetainedObjectMatrices':prepared_matrices,
               'groundTranslationTiles':[0,0,lift],'retainedEvaluatedRigidTranslationMaximumError':max_error,
               'originalEvaluatedOutwardNormalAudit':original_normals,'evaluatedOutwardNormalAudit':normals,
               'sourceEvaluatedBounds':{'min':minimum,'max':maximum},'cameraTargetTiles':[.5,1,(minimum[2]+maximum[2])/2],
               'addedMeshNames':sorted(set(after)-set(before)),
               'allAuthoredRawMeshes':[raw_record(bpy.data.objects[name]) for name in sorted(after)],
               'meshes':[{'name':name,'evaluatedVertices':len(row['points']),'evaluatedPositionSha256':row['evaluatedPositionSha256']} for name,row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n')
    print('MEDICAL_BED_DETAIL_SOURCE',receipt['sourceSha256'],len(retained),len(after)-len(retained),minimum,maximum,flush=True)


if __name__ == '__main__':
    build()
