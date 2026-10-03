"""Retain the authored Cell toilet and add physical service/hinge details.

Original catalog, nineteen raw mesh vertex/topology arrays and eight material
graphs stay unchanged. Bake the previously accepted .8XY fit into the assembly.
"""
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
ORIGINAL = ROOT / 'assets/source/blender/environment.mvp.catalog.blend'
SOURCE = ROOT / 'assets/source/blender/fixture.cell.toilet_sink.angled.blend'
ASSET_ID = 'fixture.cell.toilet_sink'
ORIGINAL_SHA256 = '57db9afb7e48996cef9aaedda72b8e874e865eb56862ee4add8b177a9713887d'


def material_record(material):
    data = {'name': material.name, 'diffuseRGBA': list(material.diffuse_color),
            'metallic': material.metallic, 'roughness': material.roughness,
            'useNodes': material.use_nodes, 'nodes': [], 'links': []}
    if material.use_nodes:
        for node in sorted(material.node_tree.nodes, key=lambda value: value.name):
            inputs = []
            for socket in node.inputs:
                if not hasattr(socket, 'default_value'):
                    continue
                value = socket.default_value
                if not isinstance(value, (float, int, bool, str)):
                    try:
                        value = list(value)
                    except TypeError:
                        value = str(value)
                inputs.append({'name': socket.name, 'value': value})
            record = {'name': node.name, 'type': node.bl_idname, 'inputs': inputs}
            if hasattr(node, 'color_ramp'):
                record['colourRamp'] = [{'position': part.position, 'rgba': list(part.color)} for part in node.color_ramp.elements]
            data['nodes'].append(record)
        data['links'] = sorted([link.from_node.name, link.from_socket.name, link.to_node.name, link.to_socket.name]
                               for link in material.node_tree.links)
    data['canonicalMaterialSha256'] = hashlib.sha256(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
    return data


def raw_record(obj):
    vertices = b''.join(struct.pack('<3f', *vertex.co) for vertex in obj.data.vertices)
    topology = b''.join(struct.pack('<I', len(face.vertices)) + struct.pack('<' + 'I' * len(face.vertices), *face.vertices)
                        for face in obj.data.polygons)
    return {'name': obj.name, 'rawVertices': len(obj.data.vertices),
            'rawVertexBytesSha256': hashlib.sha256(vertices).hexdigest(),
            'rawTopologyBytesSha256': hashlib.sha256(topology).hexdigest(),
            'materials': [material.name for material in obj.data.materials],
            'modifiers': [modifier.type for modifier in obj.modifiers]}


def evaluated(scene):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    rows = {}
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        value = obj.evaluated_get(graph); mesh = value.to_mesh()
        try:
            rows[obj.name] = [value.matrix_world @ vertex.co for vertex in mesh.vertices]
        finally:
            value.to_mesh_clear()
    return rows


def box(name, centre, size, material, bevel=.002):
    bpy.ops.mesh.primitive_cube_add(size=1, location=centre)
    obj = bpy.context.object; obj.name = 'angled-toilet.' + name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(material)
    if bevel:
        edge = obj.modifiers.new('rounded machined edges', 'BEVEL'); edge.width = bevel; edge.segments = 2
    return obj


def cylinder(name, centre, radius, depth, material, axis='Z', vertices=32):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=centre)
    obj = bpy.context.object; obj.name = 'angled-toilet.' + name
    if axis == 'X': obj.rotation_euler.y = math.pi / 2
    if axis == 'Y': obj.rotation_euler.x = math.pi / 2
    obj.data.materials.append(material)
    return obj


def torus(name, centre, radius, thickness, material):
    # The physical valve wheel is a torus with explicit deterministic topology.
    vertices = []; faces = []; major = 48; minor = 10
    for ring in range(major):
        angle = math.tau * ring / major
        for segment in range(minor):
            tilt = math.tau * segment / minor
            vertices.append((centre[0] + (radius + thickness * math.cos(tilt)) * math.cos(angle),
                             centre[1] + thickness * math.sin(tilt),
                             centre[2] + (radius + thickness * math.cos(tilt)) * math.sin(angle)))
    for ring in range(major):
        for segment in range(minor):
            faces.append((ring * minor + segment, ring * minor + (segment + 1) % minor,
                          ((ring + 1) % major) * minor + (segment + 1) % minor,
                          ((ring + 1) % major) * minor + segment))
    mesh = bpy.data.meshes.new(name); mesh.from_pydata(vertices, [], faces); mesh.update()
    # Check the actual polygon normals against the analytic outer tube surface,
    # independently of the face index construction above.
    normal_dots = []
    for polygon in mesh.polygons:
        dx = polygon.center.x - centre[0]; dz = polygon.center.z - centre[2]
        radial = math.hypot(dx, dz)
        outer = Vector((dx - radius * dx / radial, polygon.center.y - centre[1], dz - radius * dz / radial))
        if polygon.normal.dot(outer) <= 0:
            raise ValueError('Physical valve wheel surface normals face inward')
        normal_dots.append(polygon.normal.dot(outer.normalized()))
    obj = bpy.data.objects.new('angled-toilet.' + name, mesh); bpy.context.scene.collection.objects.link(obj)
    obj['minimum_outward_normal_dot'] = min(normal_dots)
    mesh.materials.append(material)
    return obj


def build():
    original_bytes = ORIGINAL.read_bytes()
    if hashlib.sha256(original_bytes).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original Cell toilet catalog changed; repeat its source audit')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(ORIGINAL), link=False) as (available, loaded):
        if ASSET_ID not in available.collections:
            raise ValueError('Original Cell toilet collection is absent')
        loaded.collections = [ASSET_ID]
    collection = loaded.collections[0]; bpy.context.scene.collection.children.link(collection)
    meshes = sorted((obj for obj in collection.all_objects if obj.type == 'MESH'), key=lambda value: value.name)
    if len(meshes) != 19:
        raise ValueError('Expected all nineteen original toilet meshes')
    raw_before = [raw_record(obj) for obj in meshes]
    materials = [bpy.data.materials[name] for name in sorted({material.name for obj in meshes for material in obj.data.materials})]
    material_before = [material_record(material) for material in materials]
    if len(materials) != 8:
        raise ValueError('Expected the eight original toilet materials')
    origin = next(obj for obj in collection.all_objects if obj.name == ASSET_ID + '.origin')
    # Remove the catalog's 21-tile layout offset at its parent before evaluating
    # geometry, matching the existing exporter's native parent adaptation.
    # Subtracting that large float32 offset from already evaluated vertices
    # unnecessarily loses precision; mesh-local bytes remain exact throughout.
    origin.location = (0, 0, 0)
    bpy.context.view_layer.update()
    inverse = origin.matrix_world.inverted()
    original = evaluated(bpy.context.scene)
    expected = {name: [Matrix.Diagonal((.8, .8, 1, 1)) @ inverse @ point for point in points]
                for name, points in original.items()}
    # Preserve raw mesh arrays and modifiers; bake only the accepted world fit
    # into their object transforms after reading every parent-relative matrix.
    transforms = [(obj, Matrix.Diagonal((.8, .8, 1, 1)) @ inverse @ obj.matrix_world) for obj in meshes]
    for obj, transform in transforms:
        obj.parent = None; obj.matrix_world = transform
    bpy.data.objects.remove(origin, do_unlink=True)
    fitted = evaluated(bpy.context.scene)
    steel = bpy.data.materials['galvanized_edge']; dark = bpy.data.materials['steel']
    shade = bpy.data.materials['shade']
    # The original supply pipe's centre is (.344,-.304), already fitted.
    # A real coupling reaches the cistern side instead of ending disconnected.
    cylinder('cistern side coupling', (.321, -.304, .81), .025, .082, steel, 'X')
    cylinder('supply compression collar upper', (.344, -.304, .79), .038, .040, steel)
    cylinder('supply compression collar lower', (.344, -.304, .31), .038, .035, steel)
    cylinder('shutoff valve body', (.344, -.304, .405), .040, .087, steel)
    cylinder('valve stem', (.344, -.342, .405), .017, .057, steel, 'Y')
    torus('shutoff valve wheel', (.344, -.372, .405), .058, .009, dark)
    cylinder('valve hub', (.344, -.372, .405), .024, .018, steel, 'Y')
    for index in range(4):
        angle = math.pi * index / 2
        spoke = box(f'valve wheel spoke {index}', (.344 + .027 * math.cos(angle), -.372, .405 + .027 * math.sin(angle)), (.054, .013, .011), steel, .001)
        spoke.rotation_euler.y = -angle
    # Separate metal barrels, pins, mounts and fasteners surround the retained
    # seat-hinge block. They do not cover the authored bowl/seat/water.
    for x in (-.096, .096):
        cylinder(f'seat hinge barrel {x}', (x, -.195, .776), .021, .108, steel, 'X')
        cylinder(f'seat hinge pin {x}', (x, -.195, .776), .009, .124, dark, 'X')
        box(f'seat hinge mounting plate {x}', (x, -.230, .763), (.063, .092, .010), steel)
        for y in (-.259, -.206):
            cylinder(f'seat hinge fixing bolt {x} {y}', (x, y, .774), .012, .008, dark, vertices=12)
    # Raised narrow joint rails follow the retained cistern lip perimeter.
    # This is physical seam geometry, not a painted surface or new palette.
    for x in (-.312, .312):
        box(f'cistern lid end joint {x}', (x, -.300, 1.020), (.006, .204, .014), shade, .001)
    for y in (-.402, -.198):
        box(f'cistern lid long joint {y}', (0, y, 1.020), (.624, .006, .014), shade, .001)
    after = evaluated(bpy.context.scene)
    maximum_error = max((after[name][index] - point).length for name, points in expected.items() for index, point in enumerate(points))
    if maximum_error > 2e-6 or raw_before != [raw_record(obj) for obj in meshes]:
        raise ValueError(f'Retained nineteen raw meshes or accepted fit changed: fitError={maximum_error}; rawEqual={raw_before == [raw_record(obj) for obj in meshes]}')
    if material_before != [material_record(material) for material in materials]:
        raise ValueError('Retained eight material graph bytes changed')
    points = [point for values in after.values() for point in values]
    minimum = [min(point[a] for point in points) for a in range(3)]
    maximum = [max(point[a] for point in points) for a in range(3)]
    if not (-.5 <= minimum[0] <= maximum[0] <= .5 and -.5 <= minimum[1] <= maximum[1] <= .5):
        raise ValueError(f'Authored toilet details escape centered1x1: {minimum} to {maximum}')
    if ORIGINAL.read_bytes() != original_bytes:
        raise ValueError('Original authored catalog bytes changed')
    bpy.ops.file.pack_all(); bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    receipt = {'schemaVersion': 1, 'assetId': ASSET_ID, 'originalSource': ORIGINAL.relative_to(ROOT).as_posix(),
               'originalSourceSha256': ORIGINAL_SHA256, 'source': SOURCE.relative_to(ROOT).as_posix(),
               'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(), 'footprintTiles': [1, 1],
               'acceptedFitBaked': [.8, .8, 1], 'maximumRetainedVertexFitError': maximum_error,
               'retainedMeshes': raw_before, 'retainedMaterialGraphs': material_before,
               'minimum': minimum, 'maximum': maximum, 'cameraTargetTiles': [.5, .5, (minimum[2] + maximum[2]) / 2],
               'meshes': [{'name': name, 'evaluatedVertices': len(values),
                           'evaluatedPositionSha256': hashlib.sha256(b''.join(struct.pack('<3f', *point) for point in values)).hexdigest()}
                          for name, values in sorted(after.items())],
               'addedMeshNames': sorted(set(after) - set(fitted)), 'retainedMeshesCount': 19,
               'physicalValveMinimumOutwardNormalDot': bpy.data.objects['angled-toilet.shutoff valve wheel']['minimum_outward_normal_dot'],
               'addedMeshesCount': len(after) - len(fitted), 'totalMeshesCount': len(after)}
    pipeline_common.write_text(SOURCE.with_suffix('.provenance.json'), json.dumps(receipt, indent=2) + '\n')
    print('CELL_TOILET_PHYSICAL_SOURCE', len(fitted), len(after) - len(fitted), json.dumps(minimum), json.dumps(maximum), receipt['sourceSha256'], flush=True)


if __name__ == '__main__':
    build()
