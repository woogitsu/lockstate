"""Retain the authored generic wooden rack and add actual frame connections without altering its source geometry."""
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
ORIGINAL = ROOT / 'assets/source/blender/furniture.storage.rack.wooden.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.storage.rack.wooden.angled-detail.blend'
ORIGINAL_SHA256 = '3806d996ce473e166aaa00bef379655aac2c41ef4d45f7f32b48a893ff4b4eed'


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
        if m.name not in ('Canteen textured tabletop', 'Canteen worn steel', 'Rack canvas fold shadow', 'Rack cardboard edge', 'Rack ivory inventory label', 'Rack kraft cardboard', 'Rack muted blue canvas', 'Rack red stock mark', 'Rack under-shelf shadow', 'green', 'light', 'shade'):
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
                raise ValueError('Rack evaluated degenerate-face count differs from retained modifier audit: ' + obj.name)
            if not dots or (require_outward and min(dots) <= 0):
                raise ValueError('Evaluated generic wooden rack geometric surfaces face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(mesh.polygons), 'degenerateFaceIndices': degenerate_faces, 'nondegeneratePolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'inwardPolygons': sum(dot < 0 for dot in dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-generic-rack.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation={'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis])
    obj = bpy.context.object; obj.name = 'angled-generic-rack.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def shelf_gusset(name, x, anchor_y, tip_y, height, material):
    # Convex YZ triangular bearing beneath a real shelf, extruded across X.
    vertices=[(x-.016,anchor_y,height-.048),(x-.016,tip_y,height-.048),(x-.016,anchor_y,height-.235),
              (x+.016,anchor_y,height-.048),(x+.016,tip_y,height-.048),(x+.016,anchor_y,height-.235)]
    faces=[(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)]
    center=sum((Vector(p) for p in vertices),Vector())/len(vertices);outward=[]
    for face in faces:
        points=[Vector(vertices[i]) for i in face];area=Vector()
        for a,b in zip(points[1:-1],points[2:]):area+=(a-points[0]).cross(b-points[0])
        outward.append(face if area.dot(sum(points,Vector())/len(points)-center)>0 else tuple(reversed(face)))
    mesh=bpy.data.meshes.new(name+' solid');mesh.from_pydata(vertices,[],outward);mesh.update()
    obj=bpy.data.objects.new('angled-generic-rack.'+name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(material)
    return obj


def diagonal(name, start, end, material):
    a,b=Vector(start),Vector(end);axis=b-a
    # Tracking Z with Y as up puts the local X across the rear plane: thin depth on X.
    obj=box(name,(a+b)/2,(.012,.042,axis.length),material,.001)
    obj.rotation_euler=axis.to_track_quat('Z','Y').to_euler()
    return obj


def build():
    original=ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest()!=ORIGINAL_SHA256:raise ValueError('Retained generic rack original source identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL));scene=bpy.context.scene
    retained=sorted((o for o in scene.objects if o.type=='MESH'),key=lambda o:o.name)
    prior=json.loads((ROOT/'assets/source/blender/furniture.storage.rack.wooden.provenance.json').read_text())
    if [o.name for o in retained]!=sorted(r['name'] for r in prior['meshes']) or len(retained)!=48:raise ValueError('Original forty-eight rack parts changed')
    before=capture(scene);raw_before=[raw_record(o) for o in retained];materials_before=materials_record()
    if len(materials_before)!=12:raise ValueError('Retained rack twelve material graphs changed')
    matrices={o.name:[list(row) for row in o.matrix_world] for o in retained};normals_before=convex_normal_audit(scene)
    steel=bpy.data.materials['Canteen worn steel'];dark=bpy.data.materials['shade'];light=bpy.data.materials['light']
    # Actual side bearers connect each staggered shelf to the four unchanged posts.
    for tier,(y,height) in enumerate([(-.29,1.17),(0,.83),(.29,.49)]):
        for x in [-.405,.405]:
            box(f'shelf side bearer {tier} {x}',(x,0,height-.060),(.058,.78,.042),steel,.002)
        for x in [-.43,.43]:
            sign=1 if x>0 else -1
            for end in [-.39,.39]:
                box(f'shelf bearer end plate {tier} {x} {end}',(sign*.476,end,height-.06),(.014,.10,.108),steel,.001)
                cylinder(f'shelf bearer end bolt {tier} {x} {end}',(sign*.486,end,height-.06),.013,.010,light,.0008,axis='X')
        anchor,tip=(-.39,-.17) if tier==0 else ((-.39,.11) if tier==1 else (.39,.17))
        for x in [-.399,.399]:shelf_gusset(f'shelf triangular support {tier} {x}',x,anchor,tip,height,steel)
    # Rear X straps prevent racking, with actual end plates and retaining bolts.
    diagonal('rear descending brace',(-.43,.437,1.25),(.43,.437,.20),steel)
    diagonal('rear ascending brace',(-.43,.441,.20),(.43,.441,1.25),steel)
    for x in [-.43,.43]:
        for z in [.20,1.25]:
            box(f'rear strap anchor plate {x} {z}',(x,.438,z),(.10,.020,.10),steel,.001)
            cylinder(f'rear strap anchor bolt {x} {z}',(x,.447,z),.013,.010,light,.0008,axis='Y')
    box('rear brace intersection plate',(0,.443,.725),(.11,.012,.11),steel,.001)
    cylinder('rear brace intersection bolt',(0,.451,.725),.014,.006,dark,.0008,axis='Y')
    # Steel post shoes support the original grounded timber with real fixings.
    for x in [-.43,.43]:
        sign=1 if x>0 else -1
        for y in [-.39,.39]:
            box(f'base post shoe {x} {y}',(x,y,.0275),(.11,.11,.055),steel,.002)
            cylinder(f'base post retaining bolt {x} {y}',(sign*.486,y,.034),.012,.014,light,.0008,axis='X')
    normals=convex_normal_audit(scene);after=capture(scene)
    if len(after)!=104 or len(set(after)-set(before))!=56:raise ValueError('Expected forty-eight retained/fifty-six structural rack parts')
    if [raw_record(o) for o in retained]!=raw_before:raise ValueError('Rack original raw geometry/topology/material/modifiers changed')
    if {o.name:[list(row) for row in o.matrix_world] for o in retained}!=matrices:raise ValueError('Rack original assembly transforms changed')
    for obj in retained:
        if after[obj.name]['evaluatedPositionSha256']!=before[obj.name]['evaluatedPositionSha256']:raise ValueError('Rack original evaluated surface changed')
    if materials_record()!=materials_before:raise ValueError('Original twelve rack material graphs changed')
    points=[p for row in after.values() for p in row['points']];minimum=[min(p[a] for p in points) for a in range(3)];maximum=[max(p[a] for p in points) for a in range(3)]
    oldpoints=[p for row in before.values() for p in row['points']]
    if any(abs(minimum[a]-min(p[a] for p in oldpoints))>1e-7 or abs(maximum[a]-max(p[a] for p in oldpoints))>1e-7 for a in range(3)):raise ValueError('Rack hardware changed accepted full bounds')
    for q in range(4):
        for p in points:
            x,y=p.x,p.y
            for _ in range(q):x,y=-y,x
            if not(0<=x+.5<=1 and 0<=y+.5<=1 and p.z>=-1e-6):raise ValueError('Rack hardware escapes accepted occupied1x1')
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes()!=original:raise ValueError('Retained original rack file changed')
    receipt={'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA256,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'retainedMeshesCount':48,'retainedMeshesBefore':raw_before,'retainedMeshesAfter':raw_before,'retainedObjectMatrices':matrices,'retainedMaterialValues':materials_before,
        'acceptedExportFit':[1,1,1],'footprintTiles':[1,1],'cameraTargetTiles':[.5,.5,.7039999961853027],'retainedEvaluatedPointSetMaximumError':0,
        'originalEvaluatedNormalAudit':normals_before,'evaluatedOutwardNormalAudit':normals,'normalMethod':'actual world-space edge cross-sums after modifiers; weighted shading normals not topology evidence',
        'sourceEvaluatedBounds':{'min':minimum,'max':maximum},'allAuthoredRawMeshes':[raw_record(o) for o in sorted(scene.objects,key=lambda o:o.name) if o.type=='MESH'],
        'addedMeshNames':sorted(set(after)-set(before)),'meshes':[{'name':name,'evaluatedVertices':len(row['points']),'evaluatedPositionSha256':row['evaluatedPositionSha256']} for name,row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n')
    print('GENERIC_RACK_PHYSICAL_SOURCE',receipt['sourceSha256'],len(after),sum(n['evaluatedPolygons'] for n in normals),minimum,maximum,flush=True)

if __name__=='__main__':build()
