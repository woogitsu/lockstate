"""Retain the authored wooden chair and add actual frame connections without altering its source geometry."""
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
ORIGINAL = ROOT / 'assets/source/blender/furniture.chair.wooden.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.chair.wooden.angled-detail.blend'
ORIGINAL_SHA256 = 'dab33079c7a42b2967950bab72048953270520383adbf3873a65aeb8e1b6687d'


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
        if m.name not in ('Canteen worn steel', 'Corridor bench worn wood plank 0', 'Corridor bench worn wood plank 1', 'shade'):
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
            expected_degenerate = [26, 27, 30, 31, 36, 37, 42, 43, 49, 50, 52, 53] if obj.name == 'Chair refinement.wooden seat' else []
            if degenerate_faces != expected_degenerate:
                raise ValueError('Chair evaluated degenerate-face count differs from retained modifier audit: ' + obj.name)
            if not dots or (require_outward and min(dots) <= 0):
                raise ValueError('Evaluated wooden chair geometric surfaces face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(mesh.polygons), 'degenerateFaceIndices': degenerate_faces, 'nondegeneratePolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'inwardPolygons': sum(dot < 0 for dot in dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'angled-wooden-chair.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation={'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis])
    obj = bpy.context.object; obj.name = 'angled-wooden-chair.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def gusset(name, x, y, material):
    # A real solid triangular joint, extruded across Y; outward new topology.
    sign = 1 if x > 0 else -1
    vertices = [(x, y-.024, .445), (x-sign*.14, y-.024, .445), (x, y-.024, .335),
                (x, y+.024, .445), (x-sign*.14, y+.024, .445), (x, y+.024, .335)]
    faces = [(0,1,2),(3,5,4),(0,3,4,1),(1,4,5,2),(2,5,3,0)]
    center = sum((Vector(v) for v in vertices), Vector()) / len(vertices)
    outward=[]
    for face in faces:
        points=[Vector(vertices[i]) for i in face]
        area=Vector()
        for a,b in zip(points,points[1:]+points[:1]):area+=a.cross(b)
        outward.append(face if area.dot(sum(points,Vector())/len(points)-center)>0 else tuple(reversed(face)))
    mesh=bpy.data.meshes.new(name+' solid');mesh.from_pydata(vertices,[],outward);mesh.update()
    obj=bpy.data.objects.new('angled-wooden-chair.'+name,mesh);bpy.context.collection.objects.link(obj);obj.data.materials.append(material)
    return obj


def build():
    original=ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest()!=ORIGINAL_SHA256:raise ValueError('Retained authored chair original source identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL));scene=bpy.context.scene
    retained=sorted((o for o in scene.objects if o.type=='MESH'),key=lambda o:o.name)
    prior=json.loads((ROOT/'assets/source/blender/furniture.chair.wooden.provenance.json').read_text())
    if [o.name for o in retained]!=sorted(r['name'] for r in prior['meshes']) or len(retained)!=16:raise ValueError('Original sixteen chair parts changed')
    before=capture(scene);raw_before=[raw_record(o) for o in retained];materials_before=materials_record()
    if len(materials_before)!=4:raise ValueError('Retained chair four material graphs changed')
    matrices={o.name:[list(row) for row in o.matrix_world] for o in retained};normals_before=convex_normal_audit(scene)
    steel=bpy.data.materials['Canteen worn steel'];dark=bpy.data.materials['shade']
    shift=.017249390482902527;front=.405+shift;rear=-.43+shift
    # Real side/transverse stretchers connect the four existing legs.
    for x in [-.32,.32]:cylinder(f'side frame stretcher {x}',(x,(front+rear)/2,.255),.018,front-rear,steel,.001,axis='Y')
    cylinder('front transverse stretcher',(0,front,.22),.019,.64,steel,.001,axis='X')
    cylinder('rear transverse stretcher',(0,rear,.31),.019,.64,steel,.001,axis='X')
    # Four real seat saddles/gussets and visible timber fixing heads.
    for x in [-.255,.255]:
        for y in [-.09+shift,.27+shift]:
            box(f'seat saddle {x} {y}',(x,y,.523),(.11,.09,.012),steel,.001)
            cylinder(f'seat fixing head {x} {y}',(x,y,.611),.014,.012,steel,.0008,axis='Z')
    for x in [-.32,.32]:
        for label,y in [('front',front-.040),('rear',rear+.040)]:gusset(f'{label} leg triangular gusset {x}',x,y,steel)
        # Actual split-looking collar assembly and exposed rail attachments.
        cylinder(f'back rail retaining collar {x}',(x,rear,1.075),.048,.10,steel,.001,axis='Z')
        for label,y in [('back',rear-.053),('front',rear+.053)]:
            cylinder(f'back rail {label} fixing {x}',(x,y,1.08),.013,.014,dark,.0008,axis='Y')
        box(f'back bracket mounting plate {x}',(x,-.235+shift,.825),(.11,.09,.012),steel,.001)
        for dx in [-.035,.035]:cylinder(f'back bracket screw {x} {dx}',(x+dx,-.235+shift,.834),.010,.014,dark,.0008,axis='Z')
        for label,y in [('front',front),('rear',rear)]:
            cylinder(f'{label} leg stretcher collar {x}',(x,y,.255),.047,.065,steel,.001,axis='Z')
            cylinder(f'{label} side joint sleeve {x}',(x,y+(.023 if label=='rear' else -.023),.255),.031,.045,steel,.001,axis='Y')
    normals=convex_normal_audit(scene);after=capture(scene)
    if len(after)!=52 or len(set(after)-set(before))!=36:raise ValueError('Expected sixteen retained/thirty-six physical connections')
    if [raw_record(o) for o in retained]!=raw_before:raise ValueError('Chair original raw geometry/topology/material/modifiers changed')
    if {o.name:[list(row) for row in o.matrix_world] for o in retained}!=matrices:raise ValueError('Chair original assembly transforms changed')
    for obj in retained:
        if after[obj.name]['evaluatedPositionSha256']!=before[obj.name]['evaluatedPositionSha256']:raise ValueError('Chair original evaluated surface changed')
    if materials_record()!=materials_before:raise ValueError('Original chair material graphs changed')
    points=[p for row in after.values() for p in row['points']];minimum=[min(p[a] for p in points) for a in range(3)];maximum=[max(p[a] for p in points) for a in range(3)]
    oldpoints=[p for row in before.values() for p in row['points']]
    if any(abs(minimum[a]-min(p[a] for p in oldpoints))>1e-7 or abs(maximum[a]-max(p[a] for p in oldpoints))>1e-7 for a in range(3)):raise ValueError('Physical chair connections changed accepted full bounds')
    for q in range(4):
        for p in points:
            x,y=p.x,p.y
            for _ in range(q):x,y=-y,x
            if not(0<=x+.5<=1 and 0<=y+.5<=1 and p.z>=-1e-6):raise ValueError('Refined chair escapes accepted occupied1x1')
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes()!=original:raise ValueError('Retained original chair file changed')
    receipt={'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA256,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        'retainedMeshesCount':16,'retainedMeshesBefore':raw_before,'retainedMeshesAfter':raw_before,'retainedObjectMatrices':matrices,'retainedMaterialValues':materials_before,
        'acceptedExportFit':[1,1,1],'footprintTiles':[1,1],'cameraTargetTiles':[.5,.5,.6600000262260437],'retainedEvaluatedPointSetMaximumError':0,
        'originalEvaluatedNormalAudit':normals_before,'evaluatedOutwardNormalAudit':normals,'normalMethod':'actual world-space edge cross-sums after modifiers; weighted shading normals not used as topology evidence',
        'sourceEvaluatedBounds':{'min':minimum,'max':maximum},'allAuthoredRawMeshes':[raw_record(o) for o in sorted(scene.objects,key=lambda o:o.name) if o.type=='MESH'],
        'addedMeshNames':sorted(set(after)-set(before)),'meshes':[{'name':name,'evaluatedVertices':len(row['points']),'evaluatedPositionSha256':row['evaluatedPositionSha256']} for name,row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n')
    print('WOODEN_CHAIR_PHYSICAL_SOURCE',receipt['sourceSha256'],len(after),sum(n['evaluatedPolygons'] for n in normals),minimum,maximum,flush=True)

if __name__=='__main__':build()
