"""Rigidly recenter the original indoor waste bin without changing its assembly.

This reuses all twelve authored meshes, modifiers and five materials. The
original source remains byte-identical; the exporter supplies the min corner.
"""
from __future__ import annotations

import hashlib
import json
import struct
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = ROOT / 'assets/source/blender/fixture.cell.waste_bin.blend'
SOURCE = ROOT / 'assets/source/blender/fixture.cell.waste_bin.angled.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
ORIGINAL_SHA256 = 'acac99dd51895f561f0b25b1e7453c0290141ed6c7953f123575b2cb8bb95963'
MESH_NAMES = ('bin body', 'bin cavity', 'bin shoulder', 'hinge bridge', 'label',
              'lid', 'lid front', 'lid inset', 'pedal', 'pedal stem',
              'side handle -0.33', 'side handle 0.33')


def evaluated(scene):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    points, records = [], []
    for obj in sorted((value for value in scene.objects if value.type == 'MESH'), key=lambda value: value.name):
        value = obj.evaluated_get(graph)
        mesh = value.to_mesh()
        try:
            vertices = [value.matrix_world @ vertex.co for vertex in mesh.vertices]
            points.extend(vertices)
            packed = b''.join(struct.pack('<3f', *point) for point in vertices)
            records.append({'name': obj.name, 'evaluatedVertices': len(vertices),
                            'evaluatedPositionSha256': hashlib.sha256(packed).hexdigest(),
                            'modifiers': [modifier.type for modifier in obj.modifiers],
                            'materials': [material.name for material in obj.data.materials]})
        finally:
            value.to_mesh_clear()
    return points, records


def bounds(points):
    return {'minimum': [min(point[axis] for point in points) for axis in range(3)],
            'maximum': [max(point[axis] for point in points) for axis in range(3)]}


def extract():
    if hashlib.sha256(ORIGINAL.read_bytes()).hexdigest() != ORIGINAL_SHA256:
        raise ValueError('Original indoor waste-bin source changed; repeat the source audit')
    bpy.ops.wm.open_mainfile(filepath=str(ORIGINAL))
    scene = bpy.context.scene
    meshes = sorted((obj for obj in scene.objects if obj.type == 'MESH'), key=lambda obj: obj.name)
    if tuple(obj.name for obj in meshes) != MESH_NAMES:
        raise ValueError('Original twelve-mesh waste-bin assembly changed')
    before, original_records = evaluated(scene)
    original_bounds = bounds(before)
    offset_y = -(original_bounds['minimum'][1] + original_bounds['maximum'][1]) / 2
    translation = Matrix.Translation((0, offset_y, 0))
    # Read all world transforms before parent removal, preserving relative spacing.
    transforms = [(obj, translation @ obj.matrix_world) for obj in meshes]
    for obj, transform in transforms:
        obj.parent = None
        obj.matrix_world = transform
    # Preserve only the authored mesh assembly in this dedicated scene.
    for obj in list(scene.objects):
        if obj.type != 'MESH':
            bpy.data.objects.remove(obj, do_unlink=True)
    after, records = evaluated(scene)
    maximum_error = max(abs(after[index][axis] - before[index][axis] - (offset_y if axis == 1 else 0))
                        for index in range(len(before)) for axis in range(3))
    if maximum_error > 1e-6:
        raise ValueError(f'Rigid source recenter changed mesh geometry: {maximum_error}')
    aligned = bounds(after)
    if not (-.5 <= aligned['minimum'][0] <= aligned['maximum'][0] <= .5 and
            -.5 <= aligned['minimum'][1] <= aligned['maximum'][1] <= .5 and
            abs(aligned['minimum'][2]) <= 1e-6):
        raise ValueError(f'Retained indoor bin escapes centered 1x1: {aligned}')
    materials = [{'name': name, 'diffuseRGBA': list(bpy.data.materials[name].diffuse_color)}
                 for name in sorted({material.name for obj in meshes for material in obj.data.materials})]
    if len(materials) != 5:
        raise ValueError('Original waste-bin material set changed')
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    data = {'schemaVersion': 1, 'originalSource': ORIGINAL.relative_to(ROOT).as_posix(),
            'originalSourceSha256': ORIGINAL_SHA256, 'source': SOURCE.relative_to(ROOT).as_posix(),
            'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
            'footprintTiles': [1, 1], 'sourceAlignmentTranslation': [0, offset_y, 0],
            'originalBounds': original_bounds, **aligned,
            'cameraTargetTiles': [.5, .5, (aligned['minimum'][2] + aligned['maximum'][2]) / 2],
            'maximumRigidVertexError': maximum_error, 'originalMeshes': original_records,
            'meshes': records, 'materials': materials}
    pipeline_common.write_text(PROVENANCE, json.dumps(data, indent=2) + '\n')
    print('DEFAULT_BIN_SOURCE12', json.dumps(aligned), data['sourceSha256'], flush=True)


if __name__ == '__main__':
    extract()
