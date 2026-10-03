"""Retain the authored library bookshelf and add actual frame connections without altering its source geometry."""
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
ORIGINAL = ROOT / 'assets/source/blender/furniture.library.bookshelf.variants.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.library.bookshelf.angled-detail.blend'
ORIGINAL_SHA256 = '64a18ea80a6b3f97d3b3b389f82c3f52b282cd6c29e343d4f971eab9c0b42c02'


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
        if m.name not in ('blue book', 'edge oak', 'green book', 'Material', 'paper', 'red book', 'steel', 'teal book', 'warm oak'):
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
    """All retained solids and added structural joints are convex: compare actual faces with their solid centroid."""
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
                dots.append(area.normalized().dot(face_center - center))
            expected_degenerate = []
            if degenerate_faces != expected_degenerate:
                raise ValueError('Bookshelf evaluated degenerate-face count differs from retained modifier audit: ' + obj.name)
            if not dots or (require_outward and min(dots) <= 0):
                raise ValueError('Evaluated library bookshelf geometric surfaces face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(mesh.polygons), 'degenerateFaceIndices': degenerate_faces, 'nondegeneratePolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'inwardPolygons': sum(dot < 0 for dot in dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-library-bookshelf.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation={'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis])
    obj = bpy.context.object; obj.name = 'angled-library-bookshelf.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj



def build():
    original = ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original library bookshelf source identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL)); scene = bpy.context.scene
    retained = sorted((o for o in scene.objects if o.type == 'MESH'),key=lambda o:o.name)
    if len(retained)!=27 or len([o for o in retained if o.name.startswith('book')])!=14:
        raise ValueError('Original bookshelf twenty-seven authored parts/fourteen books changed')
    before=capture(scene); raw_before=[raw_record(o) for o in retained]; materials_before=materials_record()
    if len(materials_before)!=9:raise ValueError('Original bookshelf nine stored material graphs changed')
    matrices={o.name:[list(row) for row in o.matrix_world] for o in retained}; normals_before=convex_normal_audit(scene)
    steel=bpy.data.materials['steel']
    # Six physical L bearers connect the unchanged front shelf ends and side frames.
    for tier,height in enumerate([.16,1.02,1.90]):
        for x in [-.875,.875]:
            box(f'shelf end vertical bearing {tier} {x}',(x,-.451,height-.090),(.08,.020,.12),steel,.001)
            box(f'shelf end horizontal bearing {tier} {x}',(x,-.411,height-.052),(.08,.12,.020),steel,.001)
            for z in [height-.105,height-.045]:
                cylinder(f'shelf bearing fixing {tier} {x} {z}',(x,-.466,z),.012,.015,steel,.0008,axis='Y')
    # Rear joining plates span each back-panel/side-frame seam, with real fixings.
    for x in [-.795,.795]:
        sign=1 if x>0 else -1
        for z in [.245,1.84]:
            box(f'rear corner joining plate {x} {z}',(x,.400,z),(.17,.016,.20),steel,.001)
            for hole_x,hole_z in [(sign*.742,z-.052),(sign*.855,z+.052)]:
                cylinder(f'rear corner retaining screw {x} {z} {hole_x}',(hole_x,.401,hole_z),.015,.016,steel,.0008,axis='Y')
    after=capture(scene); normals=convex_normal_audit(scene)
    if len(after)!=63 or len(set(after)-set(before))!=36:
        raise ValueError('Expected twenty-seven retained and thirty-six physical bookshelf connections')
    raw_after=[raw_record(o) for o in retained]
    if raw_after!=raw_before:raise ValueError('Original bookshelf raw vertices/topology/material/modifiers changed')
    if {o.name:[list(row) for row in o.matrix_world] for o in retained}!=matrices:
        raise ValueError('Original bookshelf assembly matrices changed')
    for o in retained:
        if before[o.name]['evaluatedPositionSha256']!=after[o.name]['evaluatedPositionSha256']:
            raise ValueError('Original bookshelf evaluated surfaces changed')
    if materials_record()!=materials_before:raise ValueError('Original nine stored bookshelf material graphs changed')
    points=[p for row in after.values() for p in row['points']]; oldpoints=[p for row in before.values() for p in row['points']]
    minimum=[min(p[a] for p in points) for a in range(3)]; maximum=[max(p[a] for p in points) for a in range(3)]
    if any(abs(minimum[a]-min(p[a] for p in oldpoints))>1e-7 or abs(maximum[a]-max(p[a] for p in oldpoints))>1e-7 for a in range(3)):
        raise ValueError('Bookshelf hardware changed accepted full source bounds')
    for turns in range(4):
        width,height=(2,1) if turns%2==0 else (1,2)
        for p in points:
            x,y=p.x,p.y*.85
            for _ in range(turns):x,y=-y,x
            if not(0<=x+width/2<=width and 0<=y+height/2<=height and p.z>=-1e-6):
                raise ValueError('Bookshelf hardware escapes accepted-fit occupied quarter turn')
    # The original file stores an unused default material. Preserve its graph on save,
    # without assigning it to any mesh face or changing the eight visible materials.
    retained_unused_materials = []
    for material in bpy.data.materials:
        if material.users == 0:
            material.use_fake_user = True
            retained_unused_materials.append(material.name)
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes()!=original:raise ValueError('Original bookshelf file bytes changed')
    receipt={'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA256,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'retainedUnusedMaterialFakeUserForPersistence':retained_unused_materials,'retainedMeshesCount':27,'retainedMeshesBefore':raw_before,'retainedMeshesAfter':raw_after,'retainedObjectMatrices':matrices,'retainedMaterialValues':materials_before,
        'acceptedExportFit':[1,.85,1],'footprintTiles':[2,1],'cameraTargetTiles':[1,.5,1.05],'retainedEvaluatedPointSetMaximumError':0,
        'originalEvaluatedNormalAudit':normals_before,'evaluatedOutwardNormalAudit':normals,'normalMethod':'actual world-space polygon edge cross-sums after modifiers; weighted shading normals excluded',
        'sourceEvaluatedBounds':{'min':minimum,'max':maximum},'allAuthoredRawMeshes':[raw_record(o) for o in sorted(scene.objects,key=lambda o:o.name) if o.type=='MESH'],
        'addedMeshNames':sorted(set(after)-set(before)),'meshes':[{'name':name,'evaluatedVertices':len(row['points']),'evaluatedPositionSha256':row['evaluatedPositionSha256']} for name,row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n')
    print('BOOKSHELF_PHYSICAL_SOURCE',receipt['sourceSha256'],len(after),sum(n['evaluatedPolygons'] for n in normals),minimum,maximum,flush=True)

if __name__=='__main__':build()
