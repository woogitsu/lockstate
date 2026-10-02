"""Preserve the authored wooden bench as a standalone Blender source.

The original catalog stays byte-identical. Geometry, modifiers and packed
materials are reused; only its scene-grid parent transform is removed.
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
SOURCE = ROOT / 'assets/source/blender/furniture.corridor.bench.blend'
AUDIT = ROOT / 'assets/source/blender/furniture.corridor.bench.provenance.json'
LEGACY_SHA256 = '57db9afb7e48996cef9aaedda72b8e874e865eb56862ee4add8b177a9713887d'
COLLECTION = 'furniture.corridor.bench.variants'


def extract() -> None:
    if hashlib.sha256(LEGACY.read_bytes()).hexdigest() != LEGACY_SHA256:
        raise ValueError('Original bench source changed; audit the collection again')
    bpy.ops.wm.read_factory_settings(use_empty=True)
    with bpy.data.libraries.load(str(LEGACY), link=False) as (available, loaded):
        if COLLECTION not in available.collections:
            raise ValueError('The original bench collection is absent')
        loaded.collections = [COLLECTION]
    collection = loaded.collections[0]
    bpy.context.scene.collection.children.link(collection)
    bpy.context.view_layer.update()
    origin = next(obj for obj in collection.all_objects if obj.name == COLLECTION + '.origin')
    inverse = origin.matrix_world.inverted()
    meshes = sorted((obj for obj in collection.all_objects if obj.type == 'MESH'), key=lambda obj: obj.name)
    if len(meshes) != 40:
        raise ValueError(f'Original authored bench mesh count changed: {len(meshes)}')
    # Preserve each actual mesh world transform relative to the source origin.
    # Parent removal must happen after reading that transform.
    for obj in meshes:
        relative = inverse @ obj.matrix_world
        obj.parent = None
        obj.matrix_world = relative
        obj.select_set(True)
    origin.matrix_world = Matrix.Identity(4)
    origin['occupied_tiles'] = [2, 1]
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
    if not (-1 <= minimum[0] <= maximum[0] <= 1 and
            -0.5 <= minimum[1] <= maximum[1] <= 0.5 and abs(minimum[2]) <= 1e-6):
        raise ValueError(f'Authored bench escapes its centered 2x1 footprint: {minimum} to {maximum}')
    bpy.ops.file.pack_all()
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))
    provenance = {'schemaVersion': 1, 'originalSource': str(LEGACY.relative_to(ROOT)).replace('\\', '/'),
                  'originalSourceSha256': LEGACY_SHA256, 'collection': COLLECTION,
                  'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
                  'sourceSha256': hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
                  'footprintTiles': [2, 1], 'minimum': minimum, 'maximum': maximum, 'meshes': records}
    pipeline_common.write_text(AUDIT, json.dumps(provenance, indent=2) + '\n')
    print(f'BENCH_SOURCE40 {minimum} {maximum} {provenance["sourceSha256"]}', flush=True)


if __name__ == '__main__':
    extract()
