"""Explicitly synchronize existing wall colors/roughness; bounded genuine samples."""
from pathlib import Path
import copy
import importlib.util
import json
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
spec = importlib.util.spec_from_file_location('square_wall_literal_graph_study', HERE / 'render-modern-square-wall-study.py')
study = importlib.util.module_from_spec(spec)
spec.loader.exec_module(study)
REPORT = study.REPORT
DRAFT = REPORT / 'draft.wall.square.brick.full.approved-materials.blend'


def all_other_graph_fields(graphs):
    held = copy.deepcopy(graphs)
    for material in held:
        material.pop('canonicalMaterialSha256')
        for node in material['nodes']:
            if node['type'] == 'ShaderNodeBsdfPrincipled':
                for socket in node['inputs']:
                    if socket['name'] in ('Base Color', 'Roughness'):
                        socket['value'] = 'EXPLICIT_EXISTING_APPROVED_VALUE_TRANSFER'
    return held


def synchronize():
    rows = []
    for material in sorted(bpy.data.materials, key=lambda value: value.name):
        shader = next(node for node in material.node_tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled')
        old_color = list(shader.inputs['Base Color'].default_value)
        old_roughness = shader.inputs['Roughness'].default_value
        shader.inputs['Base Color'].default_value = material.diffuse_color
        shader.inputs['Roughness'].default_value = material.roughness
        rows.append({'material': material.name, 'originalBaseColor': old_color,
                     'approvedDiffuseRGBA': list(material.diffuse_color),
                     'originalShaderRoughness': old_roughness,
                     'approvedMaterialRoughness': material.roughness})
    return rows


def surface_contacts(scene):
    """Actual evaluated BVH surface witnesses; these authored contacts touch, not overlap."""
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    trees = {}
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        value = obj.evaluated_get(graph)
        mesh = value.to_mesh()
        try:
            trees[obj.name] = BVHTree.FromPolygons([value.matrix_world @ vertex.co for vertex in mesh.vertices],
                                                 [tuple(face.vertices) for face in mesh.polygons], all_triangles=False)
        finally:
            value.to_mesh_clear()
    pairs = []
    for obj in sorted(scene.objects, key=lambda value: value.name):
        if ' brick ' not in obj.name:
            continue
        point = obj.location.copy()
        if obj.name.startswith('north'): point.y = .006
        elif obj.name.startswith('south'): point.y = .994
        elif obj.name.startswith('west'): point.x = .006
        elif obj.name.startswith('east'): point.x = .994
        pairs.append((obj.name, 'lime mortar masonry core', point))
    pairs += [('charcoal stone footing', 'lime mortar masonry core', Vector((.5, .5, .09))),
              ('lime mortar masonry core', 'recessed cap joints', Vector((.5, .5, .72)))]
    for obj in sorted(scene.objects, key=lambda value: value.name):
        if obj.name.startswith('cap stone '):
            pairs.append((obj.name, 'recessed cap joints', Vector((obj.location.x, obj.location.y, .742))))
    result = []
    for a, b, point in pairs:
        distance_a = trees[a].find_nearest(point)[3]
        distance_b = trees[b].find_nearest(point)[3]
        if distance_a is None or distance_b is None or max(distance_a, distance_b) > 1e-6:
            raise ValueError('Retained masonry evaluated surface contact missing: ' + a + '/' + b)
        result.append({'part': a, 'retainedTarget': b, 'surfaceWitness': list(point),
                       'distanceToPartSurface': distance_a, 'distanceToTargetSurface': distance_b})
    if len(result) != 58:
        raise ValueError('Retained masonry58 actual surface contacts incomplete')
    return result


def verify(scene, receipt):
    value = study.physical(scene)
    if value != receipt['synchronizedPhysicalAssembly']:
        raise ValueError('Approved wall draft geometry or synchronized shader fields changed')
    original = receipt['originalPhysicalAssembly']
    for field in value:
        if field != 'completeStoredMaterialGraphs' and value[field] != original[field]:
            raise ValueError('Material transfer changed retained physical field: ' + field)
    if all_other_graph_fields(value['completeStoredMaterialGraphs']) != all_other_graph_fields(original['completeStoredMaterialGraphs']):
        raise ValueError('Material synchronization changed additional shader properties')
    if surface_contacts(scene) != receipt['retainedSurfaceContacts']:
        raise ValueError('Retained masonry contacts changed')
    translated = dict(receipt)
    translated['physicalAssembly'] = value
    study.verify(scene, translated)
    for material in bpy.data.materials:
        shader = next(node for node in material.node_tree.nodes if node.bl_idname == 'ShaderNodeBsdfPrincipled')
        if list(shader.inputs['Base Color'].default_value) != list(material.diffuse_color) or shader.inputs['Roughness'].default_value != material.roughness:
            raise ValueError('Wall shader no longer realizes original approved material values')
    return value


def joined_diagnostic(stage):
    if stage == 'before-workbench':
        scene, camera, _ = study.producer.prepare_scene('full')
    else:
        bpy.ops.wm.open_mainfile(filepath=str(DRAFT))
        scene = bpy.context.scene
        camera = scene.camera
    meshes = [obj for obj in scene.objects if obj.type == 'MESH']
    for offset in (1, 2):
        for original in meshes:
            instance = original.copy()
            # Same actual meshes/materials, only translated diagnostic instances.
            scene.collection.objects.link(instance)
            instance.location.x += offset
    if len([obj for obj in scene.objects if obj.type == 'MESH']) != 177:
        raise ValueError('Joined diagnostic is not three complete retained modules')
    frames = []
    for yaw, elevation in study.POSES:
        study.producer.pose_camera(camera, yaw, elevation)
        camera.location.x += 1
        path = REPORT / f'joined-{stage}-yaw{yaw:+d}-elev{elevation}.png'
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        study.producer.normalize(path)
        frames.append({'stage': stage, 'yawDegrees': yaw, 'elevationDegrees': elevation,
                       'image': path.relative_to(ROOT).as_posix(), 'sha256': study.digest(path),
                       'diagnosticOnly': True, 'completeRetainedModules': 3,
                       'cameraTargetTiles': [1.5, .5, 0], 'orthoScaleTiles': 8, 'nominalPixelsPerTile': 64})
    return frames


def main():
    receipt_path = REPORT / 'actual-approved-material-variant.json'
    if '--verify-saved' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(DRAFT))
        verify(bpy.context.scene, json.loads(receipt_path.read_text(encoding='utf-8')))
        print('ACTUAL_WALL_APPROVED_VALUE_TRANSFER59_GRAPH9_CONTACT58_GREEN', flush=True)
        return
    if '--mutate-saved-shader' in sys.argv:
        bpy.ops.wm.open_mainfile(filepath=str(DRAFT))
        bpy.data.materials['charcoal stone footing'].node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (.8, .8, .8, 1)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(DRAFT))
        print('ACTUAL_WALL_APPROVED_VALUE_TRANSFER_MUTANT_SAVED', flush=True)
        return
    held = study.protected()
    literal_bytes = study.DRAFT.read_bytes()
    bpy.ops.wm.open_mainfile(filepath=str(study.DRAFT))
    scene = bpy.context.scene
    original = study.physical(scene)
    contacts = surface_contacts(scene)
    transfers = synchronize()
    value = study.physical(scene)
    receipt = {'assetId': 'wall.square.brick.full', 'draftOnly': True, 'genuineBlenderVersion': list(bpy.app.version),
               'originalSourceSha256': study.SOURCE_SHA, 'literalDraftSha256': study.digest(study.DRAFT),
               'originalPhysicalAssembly': original, 'synchronizedPhysicalAssembly': value,
               'onlyChangedPrincipledInputs': ['Base Color', 'Roughness'], 'materialTransfers': transfers,
               'retainedSurfaceContacts': contacts, 'directionalProfile': study.profile_record(scene),
               'frames': [], 'full72Run': False, 'productionDispatchChanged': False,
               'nativeAcceptance': False, 'newPaletteColors': False}
    verify(scene, receipt)
    for yaw, elevation in study.POSES:
        receipt['frames'].append(study.render(scene, scene.camera, 'after-cycles-approved-materials', yaw, elevation))
    study.producer.pose_camera(scene.camera, *study.POSES[0])
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(DRAFT))
    receipt['source'] = DRAFT.relative_to(ROOT).as_posix()
    receipt['sourceSha256'] = study.digest(DRAFT)
    receipt['joinedDiagnosticFrames'] = joined_diagnostic('before-workbench') + joined_diagnostic('after-cycles-approved-materials')
    if study.protected() != held or study.DRAFT.read_bytes() != literal_bytes:
        raise ValueError('Approved shader draft changed released sources/palette or literal draft')
    receipt['protectedBefore'] = held
    receipt['protectedAfter'] = study.protected()
    pipeline_common.write_text(receipt_path, json.dumps(receipt, indent=2) + '\n')
    print('ACTUAL_WALL_APPROVED_MATERIAL_TWO_POSES_JOINED_DIAGNOSTIC_GREEN', receipt['sourceSha256'], flush=True)


if __name__ == '__main__':
    main()
