"""Retain the authored wall-mounted shower and add actual frame connections without altering its source geometry."""
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
ORIGINAL = ROOT / 'assets/source/blender/fixture.shower.head.blend'
SOURCE = ROOT / 'assets/source/blender/fixture.shower.head.angled-detail.blend'
ORIGINAL_SHA256 = 'ac0cbe6a3673dd8db19c76375ddeb3d6f23d0cab6aa2e56b298ad8a8e70806fe'


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
            'polygonMaterialIndicesSha256': hashlib.sha256(b''.join(struct.pack('<I', p.material_index) for p in obj.data.polygons)).hexdigest(), 'modifiers': modifiers}


def materials_record():
    records = []
    for m in sorted(bpy.data.materials, key=lambda material: material.name):
        if m.name not in ('galvanized_edge', 'metal_recess', 'shade', 'Shower blue-grey enamel', 'Shower cold service mark', 'Shower hot service mark', 'Shower pale nozzle jets', 'Shower trim muted teal', 'steel', 'Worn galvanized fixture metal'):
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
                properties = {}
                for prop in node.bl_rna.properties:
                    if prop.is_readonly or prop.type not in ('BOOLEAN', 'INT', 'FLOAT', 'STRING', 'ENUM'): continue
                    value = getattr(node, prop.identifier)
                    properties[prop.identifier] = list(value) if getattr(prop, 'is_array', False) else value
                record = {'name': node.name, 'type': node.bl_idname, 'inputs': inputs, 'properties': properties}
                if hasattr(node, 'color_ramp'):
                    ramp = node.color_ramp
                    record['colorRamp'] = {'interpolation': ramp.interpolation, 'colorMode': ramp.color_mode,
                        'elements': [{'position': e.position, 'color': list(e.color)} for e in ramp.elements]}
                if getattr(node, 'image', None) is not None:
                    image = node.image
                    record['image'] = {'name': image.name, 'size': list(image.size), 'colorspace': image.colorspace_settings.name,
                        'packedSha256': [hashlib.sha256(p.packed_file.data).hexdigest() for p in image.packed_files]}
                data['nodes'].append(record)
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


def convex_normal_audit(scene, require_outward=True):
    """Audit convex solids against their centroid and the retained torus against its medial tube circle."""
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get(); rows = []
    for obj in sorted(scene.objects, key=lambda item: item.name):
        if obj.type != 'MESH':
            continue
        value = obj.evaluated_get(graph); mesh = value.to_mesh()
        try:
            points = [value.matrix_world @ v.co for v in mesh.vertices]
            center = sum(points, Vector()) / len(points)
            # Weighted normal attributes are shading data, not winding evidence.
            # Compute actual world-space geometric area vectors independently.
            dots = []; degenerate_faces = []
            for face in mesh.polygons:
                vertices = [points[index] for index in face.vertices]
                area = Vector()
                for a, b in zip(vertices[1:-1], vertices[2:]): area += (a - vertices[0]).cross(b - vertices[0])
                if area.length_squared <= 1e-20:
                    degenerate_faces.append(face.index); continue
                face_center = sum(vertices, Vector()) / len(vertices)
                reference = center
                if obj.name == 'Teal rolled head ring':
                    # A torus is not convex: its inner wall correctly faces away from the local tube center.
                    local_points = [value.matrix_world.inverted() @ p for p in points]
                    radii = [math.hypot(p.x, p.y) for p in local_points]
                    major_radius = (min(radii) + max(radii)) / 2
                    local_face = value.matrix_world.inverted() @ face_center
                    radius = math.hypot(local_face.x, local_face.y)
                    reference = value.matrix_world @ Vector((major_radius * local_face.x / radius, major_radius * local_face.y / radius, 0))
                dots.append(area.normalized().dot(face_center - reference))
            expected_degenerate = [26,27,30,31,36,37,42,43,49,50,52,53] if obj.name in ('Inset blue-grey face', 'Worn raised plate rim') else []
            if degenerate_faces != expected_degenerate:
                raise ValueError('Shower evaluated degenerate-face count differs from retained modifier audit: ' + obj.name)
            if not dots or (require_outward and min(dots) <= 0):
                raise ValueError('Evaluated wall-mounted shower geometric surfaces face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(mesh.polygons), 'degenerateFaceIndices': degenerate_faces, 'nondegeneratePolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'inwardPolygons': sum(dot < 0 for dot in dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-shower-head.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation={'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis])
    obj = bpy.context.object; obj.name = 'angled-shower-head.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj



def build():
    original = ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original shower source identity changed; audit the retained source again')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL)); scene = bpy.context.scene
    retained = sorted((o for o in scene.objects if o.type == 'MESH'), key=lambda o:o.name)
    prior = json.loads(ORIGINAL.with_suffix('.provenance.json').read_text())
    if len(retained) != 43 or [o.name for o in retained] != sorted(row['name'] for row in prior['meshes']):
        raise ValueError('Original forty-three shower parts changed')
    before = capture(scene); raw_before = [raw_record(o) for o in retained]; materials_before = materials_record()
    if len(materials_before) != 10: raise ValueError('Retained shower ten material graphs changed')
    matrices = {o.name:[list(row) for row in o.matrix_world] for o in retained}; normals_before = convex_normal_audit(scene)
    metal = bpy.data.materials['Worn galvanized fixture metal']; chrome = bpy.data.materials['galvanized_edge']; dark = bpy.data.materials['steel']
    # A real outlet links the existing arm underside to the existing head coupling.
    cylinder('head outlet connecting stem',(0,-.075,.979),.042,.116,metal,.001,axis='Z')
    for z in [.931,1.017]:
        cylinder(f'outlet locking collar {z}',(0,-.075,z),.056,.020,chrome,.001,axis='Z')
        for x in [-.058,.058]:
            cylinder(f'outlet collar retaining bolt {z} {x}',(x,-.075,z),.012,.014,dark,.0008,axis='X')
    # These clips and feet join the original wall-side socket/arm to its mount.
    for x in [-.068,.068]:box(f'wall arm bearing clip {x}',(x,-.29,1.024),(.020,.18,.070),chrome,.002)
    for x in [-.095,.095]:
        box(f'wall arm clip foot {x}',(x,-.347,1.018),(.10,.09,.027),chrome,.001)
        cylinder(f'wall arm foot fixing {x}',(x,-.347,1.04),.017,.024,dark,.0008,axis='Z')
    # Actual service grips retain the visible original hot/cold markings beneath.
    for x in [-.255,.255]:
        cylinder(f'valve retaining collar {x}',(x,-.20,.943),.061,.012,chrome,.0008,axis='Z')
        cylinder(f'valve grip stem {x}',(x,-.20,.968),.017,.022,metal,.0008,axis='Z')
        box(f'service valve physical grip {x}',(x,-.20,.973),(.105,.027,.019),chrome,.002)
        cylinder(f'valve grip fixing {x}',(x,-.20,.987),.012,.010,dark,.0008,axis='Z')
    after = capture(scene); normals = convex_normal_audit(scene)
    if len(after) != 64 or len(set(after)-set(before)) != 21:
        raise ValueError('Expected forty-three retained and twenty-one physical shower fittings')
    raw_after = [raw_record(o) for o in retained]
    if raw_after != raw_before:raise ValueError('Original shower raw vertices/topology/material/modifiers changed')
    if {o.name:[list(row) for row in o.matrix_world] for o in retained} != matrices:
        raise ValueError('Original shower source assembly matrices changed')
    for o in retained:
        if before[o.name]['evaluatedPositionSha256'] != after[o.name]['evaluatedPositionSha256']:
            raise ValueError('Original shower evaluated geometry changed')
    if materials_record() != materials_before:raise ValueError('Original shower ten material graphs changed')
    points = [p for row in after.values() for p in row['points']]; oldpoints = [p for row in before.values() for p in row['points']]
    minimum = [min(p[a] for p in points) for a in range(3)]; maximum = [max(p[a] for p in points) for a in range(3)]
    if any(abs(minimum[a]-min(p[a] for p in oldpoints))>1e-7 or abs(maximum[a]-max(p[a] for p in oldpoints))>1e-7 for a in range(3)):
        raise ValueError('New shower fittings changed accepted full source bounds')
    outlet = after['angled-shower-head.head outlet connecting stem']['points']
    arm = before['Bent brushed-steel arm']['points']; coupling = before['Head coupling bright sleeve']['points']
    if min(p.z for p in outlet)>max(p.z for p in coupling)+1e-6 or max(p.z for p in outlet)<min(p.z for p in arm)-1e-6:
        raise ValueError('Actual outlet stem does not bridge the original arm/head connection gap')
    for q in range(4):
        for p in points:
            x,y=p.x,p.y
            for _ in range(q):x,y=-y,x
            if not(0<=x+.5<=1 and 0<=y+.5<=1 and p.z>0):
                raise ValueError('Shower fitting escapes accepted elevated occupied1x1')
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes()!=original:raise ValueError('Original retained shower source bytes changed')
    receipt={'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA256,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'retainedMeshesCount':43,'retainedMeshesBefore':raw_before,'retainedMeshesAfter':raw_after,'retainedObjectMatrices':matrices,'retainedMaterialValues':materials_before,
        'acceptedExportFit':[1,1,1],'footprintTiles':[1,1],'cameraTargetTiles':[.5,.5,.925],'retainedEvaluatedPointSetMaximumError':0,
        'originalEvaluatedNormalAudit':normals_before,'evaluatedOutwardNormalAudit':normals,'normalMethod':'actual world-space edge cross-sums after modifiers; retained torus uses its medial tube circle; weighted shading normals excluded',
        'sourceEvaluatedBounds':{'min':minimum,'max':maximum},'allAuthoredRawMeshes':[raw_record(o) for o in sorted(scene.objects,key=lambda o:o.name) if o.type=='MESH'],
        'addedMeshNames':sorted(set(after)-set(before)),'meshes':[{'name':name,'evaluatedVertices':len(row['points']),'evaluatedPositionSha256':row['evaluatedPositionSha256']} for name,row in sorted(after.items())],
        'physicalConnection':{'originalArmUndersideZ':min(p.z for p in arm),'originalCouplingTopZ':max(p.z for p in coupling),'originalVerticalGap':min(p.z for p in arm)-max(p.z for p in coupling),'actualOutletMinZ':min(p.z for p in outlet),'actualOutletMaxZ':max(p.z for p in outlet)}}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n')
    print('SHOWER_PHYSICAL_SOURCE',receipt['sourceSha256'],len(after),sum(n['evaluatedPolygons'] for n in normals),minimum,maximum,receipt['physicalConnection'],flush=True)

if __name__=='__main__':build()
