"""Retain the authored security console, correct inward winding and model service details."""
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
ORIGINAL = ROOT / 'assets/source/blender/utility.security-console.variants.blend'
SOURCE = ROOT / 'assets/source/blender/utility.security-console.angled.blend'
ORIGINAL_SHA256 = '7b7c755e96cc460c6afa42d8a5e4a1f44480a21a6483cea122949290848db5d7'


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


def convex_normal_audit(scene, require_outward=True):
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
            if not dots or (require_outward and min(dots) <= 0):
                raise ValueError('Evaluated security console convex surface normals face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'inwardPolygons': sum(dot < 0 for dot in dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-security.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation=(math.pi / 2, 0, 0) if axis == 'Y' else (0, 0, 0))
    obj = bpy.context.object; obj.name = 'angled-security.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def build():
    original = ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original authored security console source identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL)); scene = bpy.context.scene
    retained = sorted((o for o in scene.objects if o.type == 'MESH'), key=lambda o:o.name)
    expected = ['body','control','dial','foot','foot.001','front','monitor','status','top']
    if [o.name for o in retained] != expected:
        raise ValueError('Original security nine-part assembly changed')
    raw_before = [raw_record(o) for o in retained]; materials_before = materials_record()
    if len(materials_before) != 4: raise ValueError('Security four-material scope changed')
    matrices_before = {o.name:[list(row) for row in o.matrix_world] for o in retained}
    evaluated_before = capture(scene); original_evaluated_normals = convex_normal_audit(scene,False);original_raw_normals=[]
    if sum(row['inwardPolygons'] for row in original_evaluated_normals)!=486:
        raise ValueError('Original security evaluated inward-surface audit changed')
    for obj in retained:
        center = sum((v.co for v in obj.data.vertices),Vector())/len(obj.data.vertices)
        dots = [p.normal.dot(p.center-center) for p in obj.data.polygons]
        if len(dots)!=6 or any(dot>=0 for dot in dots):raise ValueError('Audited security six-face inward cube changed')
        original_raw_normals.append({'name':obj.name,'rawInwardPolygons':len(dots)})
        mesh=bpy.data.meshes.new(obj.data.name+' outward')
        mesh.from_pydata([tuple(v.co) for v in obj.data.vertices],[],[tuple(reversed(p.vertices)) for p in obj.data.polygons]);mesh.update()
        for material in obj.data.materials:mesh.materials.append(material)
        for before,after in zip(obj.data.polygons,mesh.polygons,strict=True):after.material_index=before.material_index
        obj.data=mesh
    bpy.context.view_layer.update();raw_corrected=[raw_record(o) for o in retained];corrected=capture(scene)
    for before,after in zip(raw_before,raw_corrected,strict=True):
        if {k:v for k,v in before.items() if k!='rawTopologyBytesSha256'}!={k:v for k,v in after.items() if k!='rawTopologyBytesSha256'}:raise ValueError('Original security vertex/material/modifier data changed')
        if before['rawTopologyBytesSha256']==after['rawTopologyBytesSha256']:raise ValueError('Security inward topology was not reversed')
    if {o.name:[list(row) for row in o.matrix_world] for o in retained}!=matrices_before:raise ValueError('Original security assembly matrices changed')
    maximum_error=0
    for obj in retained:
        before=evaluated_before[obj.name]['points'];after=corrected[obj.name]['points']
        if len(before)!=len(after):raise ValueError('Security winding correction changed evaluated count')
        for a,b in ((before,after),(after,before)):
            maximum_error=max(maximum_error,max(min((p-q).length for q in b) for p in a))
    if maximum_error>1e-6:raise ValueError('Security winding correction changed retained evaluated shape')
    body=bpy.data.materials['warm charcoal'];dark=bpy.data.materials['control panel'];amber=bpy.data.materials['amber status']
    # Actual raised monitor frame around the retained original glass rectangle.
    for side in [-1,1]:box(f'monitor bezel vertical {side}',(side*.552,-.455,.55),(.028,.022,.358),dark,.003)
    for z in [.373,.727]:box(f'monitor bezel horizontal {z}',(0,-.455,z),(1.13,.022,.028),dark,.003)
    for x in [-.55,.55]:
        for z in [.377,.723]:cylinder(f'monitor bezel fastener {x} {z}',(x,-.470,z),.007,.009,body,.0007)
    # The original narrow controls strip is retained, with twelve real raised
    # keys between its existing amber dial/status blocks, not painted labels.
    for row,z in enumerate([.255,.305]):
        for column,x in enumerate([-.25,-.15,-.05,.05,.15,.25]):
            box(f'control keycap row{row} column{column}',(x,-.470,z),(.067,.022,.028),body,.002)
    for z in [.218,.343]:box(f'control panel stop {z}',(0,-.447,z),(1.21,.022,.012),body,.002)
    # A physical collar/barrel/pointer sits on the retained right dial cube.
    cylinder('rotary dial collar',(.42,-.469,.28),.074,.016,body,.0015)
    cylinder('rotary dial barrel',(.42,-.497,.28),.048,.042,dark,.002)
    box('rotary dial raised amber pointer',(.42,-.520,.296),(.008,.009,.030),amber,.0007)
    cylinder('status indicator collar',(-.42,-.469,.28),.074,.016,body,.0015)
    for x in [-.42,.42]:
        for z in [.218,.342]:cylinder(f'control mount fastener {x} {z}',(x,-.480,z),.006,.008,body,.0007)
    normals=convex_normal_audit(scene);after=capture(scene)
    if len(after)!=39 or len(set(after)-set(corrected))!=30:raise ValueError('Security nine retained and thirty detail part count changed')
    for obj in retained:
        if after[obj.name]['evaluatedPositionSha256']!=corrected[obj.name]['evaluatedPositionSha256']:raise ValueError('Security physical additions changed retained geometry')
    if materials_record()!=materials_before:raise ValueError('Security original four-material graphs changed')
    points=[p for row in after.values() for p in row['points']];minimum=[min(p[a] for p in points) for a in range(3)];maximum=[max(p[a] for p in points) for a in range(3)]
    for q in range(4):
        width,height=(2,1) if q%2==0 else(1,2)
        for point in points:
            x,y=point.x,point.y*.9
            for _ in range(q):x,y=-y,x
            if not(0<=x+width/2<=width and 0<=y+height/2<=height and point.z>=-1e-6):raise ValueError('Security actual fitted geometry escapes oriented2x1')
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes()!=original:raise ValueError('Original security source bytes changed')
    receipt={'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA256,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'retainedMeshesCount':9,'retainedMeshesBefore':raw_before,'retainedMeshesCorrected':raw_corrected,'retainedObjectMatrices':matrices_before,'retainedMaterialValues':materials_before,
        'acceptedExportFit':[1,.9,1],'footprintTiles':[2,1],'cameraTargetTiles':[1,.5,.65],'retainedEvaluatedPointSetMaximumError':maximum_error,
        'originalRawNormalAudit':original_raw_normals,'originalEvaluatedNormalAudit':original_evaluated_normals,'evaluatedOutwardNormalAudit':normals,'sourceEvaluatedBounds':{'min':minimum,'max':maximum},
        'addedMeshNames':sorted(set(after)-set(corrected)),'meshes':[{'name':name,'evaluatedVertices':len(row['points']),'evaluatedPositionSha256':row['evaluatedPositionSha256']} for name,row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n')
    print('SECURITY_CONSOLE_SOURCE',receipt['sourceSha256'],len(after),sum(n['evaluatedPolygons'] for n in normals),minimum,maximum,flush=True)

if __name__=='__main__':build()
