"""Retain the authored Kitchen stove and add actual frame connections without altering its source geometry."""
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
ORIGINAL = ROOT / 'assets/source/blender/furniture.kitchen.stove.angled.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.kitchen.stove.angled-detail.blend'
ORIGINAL_SHA256 = '540c8b22be73848bb1520fae9ffeabfce7711bb0c629161e529b6d6ae33ca5fc'


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
    """Audit actual convex parts against their centroid and hollow retained collars against their medial ellipse."""
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
            if obj.name.startswith('angled-stove.burner collar '):
                low=Vector([min(p[i] for p in points) for i in range(3)]);high=Vector([max(p[i] for p in points) for i in range(3)]);mid=(low+high)/2
                outer_x=(high.x-low.x)/2;outer_y=(high.y-low.y)/2
                inner_x=min(abs(p.x-mid.x) for p in points if abs(p.y-mid.y)<1e-5)
                inner_y=min(abs(p.y-mid.y) for p in points if abs(p.x-mid.x)<1e-5)
                medial=[mid+Vector(((outer_x+inner_x)/2*math.cos(t*math.tau/256),(outer_y+inner_y)/2*math.sin(t*math.tau/256),0)) for t in range(256)]
                dots=[]
                for face in mesh.polygons:
                    vertices=[points[index] for index in face.vertices];area=Vector()
                    for a,b in zip(vertices[1:-1],vertices[2:]):area+=(a-vertices[0]).cross(b-vertices[0])
                    if area.length_squared<=1e-20:continue
                    face_center=sum(vertices,Vector())/len(vertices);nearest=min(medial,key=lambda p:(p-face_center).length_squared)
                    dots.append(area.normalized().dot(face_center-nearest))
            expected_degenerate = []
            if degenerate_faces != expected_degenerate:
                raise ValueError('Stove evaluated degenerate-face count differs from retained modifier audit: ' + obj.name)
            if not dots or (require_outward and min(dots) <= 0):
                raise ValueError('Evaluated Kitchen stove geometric surfaces face inward: ' + obj.name)
            rows.append({'name': obj.name, 'evaluatedVertices': len(points), 'evaluatedPolygons': len(mesh.polygons), 'degenerateFaceIndices': degenerate_faces, 'nondegeneratePolygons': len(dots),
                         'minimumOutwardNormalDistance': min(dots), 'inwardPolygons': sum(dot < 0 for dot in dots), 'transformDeterminant': value.matrix_world.to_3x3().determinant()})
        finally:
            value.to_mesh_clear()
    return rows


def box(name, center, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object; obj.name = 'physical-kitchen-stove.' + name; obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('small service edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj


def cylinder(name, center, radius, depth, material, bevel=.001, axis='Y'):
    bpy.ops.mesh.primitive_cylinder_add(vertices=32, radius=radius, depth=depth, location=center,
                                      rotation={'X': (0, math.pi / 2, 0), 'Y': (math.pi / 2, 0, 0), 'Z': (0, 0, 0)}[axis])
    obj = bpy.context.object; obj.name = 'physical-kitchen-stove.' + name; obj.data.materials.append(material)
    if bevel:
        modifier = obj.modifiers.new('rounded control edge', 'BEVEL'); modifier.width = bevel; modifier.segments = 2
    return obj



def actual_triangle_contacts(scene, targets):
    from mathutils.bvhtree import BVHTree
    bpy.context.view_layer.update();graph=bpy.context.evaluated_depsgraph_get();trees={};bounds={}
    for name in set(targets)|{n for names in targets.values() for n in names}:
        obj=bpy.data.objects[name];value=obj.evaluated_get(graph);mesh=value.to_mesh()
        try:
            vertices=[value.matrix_world@v.co for v in mesh.vertices];trees[name]=BVHTree.FromPolygons(vertices,[tuple(p.vertices) for p in mesh.polygons],all_triangles=False)
            bounds[name]=([min(v[i] for v in vertices) for i in range(3)],[max(v[i] for v in vertices) for i in range(3)])
        finally:value.to_mesh_clear()
    def inside(name,point):
        direction=Vector((.937,.223,.181)).normalized();origin=point.copy();crossings=0
        for _ in range(100):
            hit,_,_,_=trees[name].ray_cast(origin,direction,100)
            if hit is None:return crossings%2==1
            crossings+=1;origin=hit+direction*1e-5
        raise ValueError('Actual contact ray did not terminate')
    witnesses=[]
    for shoe,names in sorted(targets.items()):
        lo,hi=bounds[shoe]
        for name in names:
            a,b=bounds[name];zlow=max(lo[2],a[2]);zhigh=min(hi[2],b[2]);point=Vector(((lo[0]+hi[0])/2,(lo[1]+hi[1])/2,(zlow+zhigh)/2))
            if zhigh-zlow<=1e-5 or not inside(shoe,point) or not inside(name,point):raise ValueError('Stove mounting shoe lacks real triangle-interior contact: '+shoe+' / '+name)
            witnesses.append({'shoe':shoe,'retainedTarget':name,'actualInteriorWitness':list(point),'overlappingDepth':zhigh-zlow})
    return witnesses


def build():
    original=ORIGINAL.read_bytes()
    if hashlib.sha256(original).hexdigest()!=ORIGINAL_SHA256:raise ValueError('Original refined stove source identity changed')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL));scene=bpy.context.scene
    retained=sorted((o for o in scene.objects if o.type=='MESH'),key=lambda o:o.name)
    if len(retained)!=80:raise ValueError('Expected all eighty original stove parts')
    before=capture(scene);raw_before=[raw_record(o) for o in retained];materials_before=materials_record();matrices={o.name:[list(row) for row in o.matrix_world] for o in retained};normals_before=convex_normal_audit(scene)
    if len(materials_before)!=6:raise ValueError('Original stove six full shader graphs changed')
    iron=bpy.data.materials['cast iron'];targets={}
    for index,(x,y) in enumerate(((-.45,-.165),(-.45,.15),(.45,-.165),(.45,.15))):
        for sign in [-1,1]:
            ew=box(f'east-west grate shoe {index} {sign}',(x+sign*.174,y,1.468),(.020,.024,.032),iron,.001)
            ns=box(f'north-south grate shoe {index} {sign}',(x,y+sign*.137,1.468),(.020,.024,.032),iron,.001)
            targets[ew.name]=[f'angled-stove.burner collar {index}',f'angled-stove.pot support east-west {index}']
            targets[ns.name]=[f'angled-stove.burner collar {index}',f'angled-stove.pot support north-south {index}']
    after=capture(scene);normals=convex_normal_audit(scene)
    if len(after)!=96 or len(set(after)-set(before))!=16:raise ValueError('Expected eighty retained and sixteen real stove mounting shoes')
    if [raw_record(o) for o in retained]!=raw_before:raise ValueError('Original stove raw vertices/topology/material/modifiers changed')
    if {o.name:[list(row) for row in o.matrix_world] for o in retained}!=matrices:raise ValueError('Original stove assembly matrices changed')
    if any(before[o.name]['evaluatedPositionSha256']!=after[o.name]['evaluatedPositionSha256'] for o in retained):raise ValueError('Original stove evaluated surfaces changed')
    if materials_record()!=materials_before:raise ValueError('Original stove full shader graphs changed')
    witnesses=actual_triangle_contacts(scene,targets)
    points=[p for row in after.values() for p in row['points']];oldpoints=[p for row in before.values() for p in row['points']];minimum=[min(p[a] for p in points) for a in range(3)];maximum=[max(p[a] for p in points) for a in range(3)]
    if any(abs(minimum[a]-min(p[a] for p in oldpoints))>1e-7 or abs(maximum[a]-max(p[a] for p in oldpoints))>1e-7 for a in range(3)):raise ValueError('Stove shoes changed accepted full source bounds')
    for turns in range(4):
        width,height=(2,1) if turns%2==0 else(1,2)
        for p in points:
            x,y=p.x,p.y
            for _ in range(turns):x,y=-y,x
            if not(0<=x+width/2<=width and 0<=y+height/2<=height and p.z>=-1e-6):raise ValueError('Stove shoes escape unchanged occupied rectangle')
    bpy.context.preferences.filepaths.save_version=0;bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    if ORIGINAL.read_bytes()!=original:raise ValueError('Original stove file bytes changed')
    receipt={'originalSource':ORIGINAL.relative_to(ROOT).as_posix(),'originalSourceSha256':ORIGINAL_SHA256,'source':SOURCE.relative_to(ROOT).as_posix(),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'retainedMeshesCount':80,'retainedMeshesBefore':raw_before,'retainedMeshesAfter':raw_before,'retainedObjectMatrices':matrices,'retainedMaterialValues':materials_before,'acceptedExportFit':[1,1,1],'footprintTiles':[2,1],'cameraTargetTiles':[1,.5,1.1230000257492065],'retainedEvaluatedPointSetMaximumError':0,'originalEvaluatedNormalAudit':normals_before,'evaluatedOutwardNormalAudit':normals,'normalMethod':'actual world-space polygon edge cross-sums after modifiers; hollow collars use actual medial ellipse rather than solid centroid','sourceEvaluatedBounds':{'min':minimum,'max':maximum},'actualContactTargets':targets,'actualTriangleInteriorContacts':witnesses,'allAuthoredRawMeshes':[raw_record(o) for o in sorted(scene.objects,key=lambda o:o.name) if o.type=='MESH'],'addedMeshNames':sorted(set(after)-set(before)),'meshes':[{'name':name,'evaluatedVertices':len(row['points']),'evaluatedPositionSha256':row['evaluatedPositionSha256']} for name,row in sorted(after.items())]}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'),json.dumps(receipt,indent=2)+'\n');print('STOVE_PHYSICAL_SOURCE',receipt['sourceSha256'],len(after),sum(n['evaluatedPolygons'] for n in normals),minimum,maximum,flush=True)

if __name__=='__main__':build()
