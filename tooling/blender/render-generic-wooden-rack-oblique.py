"""Render the retained authored 1x1 generic wooden rack through the shared square pipeline."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve()
spec = importlib.util.spec_from_file_location('generic_rack_square_exporter', SCRIPT.with_name('render-kitchen-fixtures-oblique.py'))
assert spec and spec.loader
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
exporter.pipeline_common.require_blender_version()
ASSET_ID = 'furniture.storage.rack.wooden'
exporter.MODELS = ((ASSET_ID, 'furniture.storage.rack.wooden.blend',
                    'oblique-cell-storage-rack.v1.json', 1, 1, 1.0, 1.0, 0.7039999961853027),)
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/generic-rack-preview'


def evaluated_points(scene):
    exporter.bpy.context.view_layer.update()
    graph = exporter.bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    return points


def prepare_source(scene, model):
    provenance = json.loads((exporter.ROOT / 'assets/source/blender/furniture.storage.rack.wooden.provenance.json').read_text())
    source = exporter.ROOT / provenance['source']
    if hashlib.sha256(source.read_bytes()).hexdigest() != provenance['sourceSha256']:
        raise ValueError('Retained generic rack source bytes differ from its audited provenance')
    actual = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
    if actual != sorted(mesh['name'] for mesh in provenance['meshes']):
        raise ValueError('Retained generic rack authored mesh set changed')


configure_shared = exporter.configure


def configure(model):
    scene, camera, target = configure_shared(model, prepare_source)
    points = evaluated_points(scene)
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    if not (0 <= minimum[0] <= maximum[0] <= 1 and
            0 <= minimum[1] <= maximum[1] <= 1 and abs(minimum[2]) <= 1e-6):
        raise ValueError(f'Evaluated generic wooden rack geometry escapes grounded 1x1: {minimum} to {maximum}')
    if abs(target.z - (minimum[2] + maximum[2]) / 2) > 1e-6:
        raise ValueError('Generic wooden rack target does not match its evaluated source height')
    if abs(camera.data.ortho_scale - exporter.RESOLUTION_PX / 64) > 1e-6:
        raise ValueError('Generic wooden rack actual camera scale is not 64 pixels per tile')
    # Object quarter turns use clockwise +X->+Y. Rotate actual evaluated points
    # about the center, then translate to the rotated occupied min corner.
    for turns in range(4):
        width, height = (1, 1)
        transformed = []
        for point in points:
            x, y = point.x - 0.5, point.y - 0.5
            for _ in range(turns):
                x, y = -y, x
            transformed.append((x + width / 2, y + height / 2))
        if not all(0 <= x <= width and 0 <= y <= height for x, y in transformed):
            raise ValueError(f'Generic wooden rack evaluated geometry escapes quarter turn {turns}')
    print(f'GENERIC_RACK_EVALUATED_BOUNDS {minimum} {maximum}; four occupied orientations verified', flush=True)
    return scene, camera, target


exporter.configure = configure
point_camera_shared = exporter.point_camera


def point_camera(camera, target, yaw, elevation):
    point_camera_shared(camera, target, yaw, elevation)
    # Independent world projection basis: yaw0 camera looks north from -Y;
    # positive yaw moves its ground position toward +X. Read actual transforms.
    azimuth, tilt = exporter.math.radians(yaw), exporter.math.radians(elevation)
    offset = camera.location - target
    expected = exporter.Vector((6 * exporter.math.cos(tilt) * exporter.math.sin(azimuth),
                                -6 * exporter.math.cos(tilt) * exporter.math.cos(azimuth),
                                6 * exporter.math.sin(tilt)))
    if (offset - expected).length > 1e-5:
        raise ValueError('Generic wooden rack actual camera target/yaw basis differs from declared square pose')
    forward = camera.rotation_euler.to_quaternion() @ exporter.Vector((0, 0, -1))
    if forward.dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Generic wooden rack actual camera does not aim at its declared target')


exporter.point_camera = point_camera

if __name__ == '__main__':
    if '--verify' in sys.argv:
        for model in exporter.MODELS:
            _, camera, target = configure(model)
            for yaw in exporter.YAW:
                for elevation in exporter.ELEVATION:
                    point_camera(camera, target, yaw, elevation)
        print('GENERIC_RACK_VERIFY72 cameras and four occupied orientations', flush=True)
    else:
        exporter.main()
