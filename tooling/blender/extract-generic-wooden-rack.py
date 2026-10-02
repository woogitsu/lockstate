"""Preserve the authored generic wooden rack as a standalone Blender source.

The original catalog stays byte-identical. Geometry, modifiers and packed
materials are reused. Remove the scene-grid parent and preserve its centered assembly
while keeping every relative mesh spacing unchanged.
"""
from __future__ import annotations

import hashlib
import json
import sys
from pathlib import Path

import bpy
from mathutils import Matrix

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
LEGACY = ROOT / 'assets/source/blender/environment.mvp.catalog.blend'
SOURCE = ROOT / 'assets/source/blender/furniture.storage.rack.wooden.blend'
AUDIT = ROOT / 'assets/source/blender/furniture.storage.rack.wooden.provenance.json'
LEGACY_SHA256 = '57db9afb7e48996cef9aaedda72b8e874e865eb56862ee4add8b177a9713887d'
COLLECTION = 'furniture.storage.rack.wooden'


def extract() -> None:
    if hashlib.sha256(LEGACY.read_bytes()).hexdigest() != LEGACY_SHA256:
        raise ValueError('Original rack source changed; audit the collection again')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(LEGACY), link=False) as (available, loaded):
        if COLLECTION not in available.collections:
            raise ValueError('The original rack collection is absent')
        loaded.collections = [COLLECTION]
    collection = loaded.collections[0]
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.update()
    origin = next(obj for obj in collection.all_objects if obj.name == COLLECTION + '.origin')
    inverse = origin.matrix_world.inverted()
    meshes = sorted((obj for obj in collection.all_objects if obj.type == 'MESH'), key=lambda obj: obj.name)
    if len(meshes) != 48:
        raise ValueError(f'Original authored rack mesh count changed: {len(meshes)}')
    # Preserve every mesh shape/material/modifier and relative assembly spacing.
    # Parent removal must happen after reading that transform.
    for obj in meshes:
        relative = inverse @ obj.matrix_world
        obj.parent = None
        obj.matrix_world = relative
        obj.select_set(True)
    origin.matrix_world = Matrix.Identity(4)
    origin['occupied_tiles'] = [1, 1]
    origin['source_convention'] = 'centered; square exporter supplies min-corner translation'
    bpy.context.view_layer.update()
    depsgraph = bpy.context.evaluated_depsgraph_get()
    points = []
    records = []
    for obj in meshes:
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
            records.append({'name': obj.name, 'evaluatedVertices': len(mesh.vertices),
                            'modifiers': [modifier.type for modifier in obj.modifiers]})
        finally:
            evaluated.to_mesh_clear()
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    if not (-0.5 <= minimum[0] <= maximum[0] <= 0.5 and
            -0.5 <= minimum[1] <= maximum[1] <= 0.5 and abs(minimum[2]) <= 1e-6):
        raise ValueError(f'Authored rack escapes its centered1x1 footprint: {minimum} to {maximum}')
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    provenance = {'schemaVersion': 1, 'originalSource': str(LEGACY.relative_to(ROOT)).replace('\\', '/'),
                  'originalSourceSha256': LEGACY_SHA256, 'collection': COLLECTION,
                  'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
                  'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                  'footprintTiles': [1, 1], 'sourceAlignmentTranslation': [0, 0, 0], 'minimum': minimum, 'maximum': maximum, 'meshes': records,
                  'materials': [{'name': name, 'diffuseRGBA': list(bpy.data.materials[name].diffuse_color)}
                                for name in sorted({mat.name for obj in meshes for mat in obj.data.materials})]}
    pipeline_common.write_text(AUDIT, json.dumps(provenance, indent=2) + '\n')
    print(f'GENERIC_RACK_SOURCE48 {minimum} {maximum} {provenance["sourceSha256"]}', flush=True)


if __name__ == '__main__':
    extract()
