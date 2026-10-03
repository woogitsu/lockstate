"""Align the existing authored wall-mounted shower head through the shared square exporter."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve()
sys.path.insert(0, str(SCRIPT.parent))
import pipeline_common

pipeline_common.require_blender_version()
spec = importlib.util.spec_from_file_location('shower_square_exporter', SCRIPT.with_name('render-kitchen-fixtures-oblique.py'))
assert spec and spec.loader
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
ASSET_ID = 'fixture.shower.head'
SOURCE_HASH = 'ac0cbe6a3673dd8db19c76375ddeb3d6f23d0cab6aa2e56b298ad8a8e70806fe'
exporter.MODELS = ((ASSET_ID, 'fixture.shower.head.angled-detail.blend',
                    'oblique-shower-head.v1.json', 1, 1, 1.0, 1.0, 0.925),)
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/shower-head-preview'


_detail_module = None

def shower_detail_exporter():
    global _detail_module
    if _detail_module is None:
        detail_spec = importlib.util.spec_from_file_location('shower_physical_detail', SCRIPT.with_name('render-shower-head-detail-oblique.py'))
        assert detail_spec and detail_spec.loader
        _detail_module = importlib.util.module_from_spec(detail_spec)
        detail_spec.loader.exec_module(_detail_module)
    return _detail_module


def evaluated_points(scene):
    exporter.bpy.context.view_layer.update()
    graph = exporter.bpy.context.evaluated_depsgraph_get()
    points, meshes = [], []
    for obj in sorted(scene.objects, key=lambda value: value.name):
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
            meshes.append({'name': obj.name, 'evaluatedVertices': len(mesh.vertices),
                           'modifiers': [mod.type for mod in obj.modifiers]})
        finally:
            evaluated.to_mesh_clear()
    return points, meshes


def prepare_source(scene, model):
    source = exporter.ROOT / 'assets/source/blender' / model[1]
    if hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_HASH:
        raise ValueError('Shower authored source bytes changed')
    provenance = json.loads((source.with_suffix('.provenance.json')).read_text())
    _, meshes = evaluated_points(scene)
    if meshes != provenance['meshes']:
        raise ValueError('Shower authored mesh set changed')


configure_shared = exporter.configure


def configure(model):
    if model[0] == ASSET_ID:
        return shower_detail_exporter().configure(model)
    scene, camera, target = configure_shared(model, prepare_source)
    points, _ = evaluated_points(scene)
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    if not (0 <= minimum[0] <= maximum[0] <= 1 and
            0 <= minimum[1] <= maximum[1] <= 1 and abs(minimum[2] - 0.71) <= 1e-6):
        raise ValueError(f'Shower evaluated geometry escapes mounted 1x1: {minimum} to {maximum}')
    if abs(target.z - (minimum[2] + maximum[2]) / 2) > 1e-6:
        raise ValueError('Shower actual target does not match evaluated height')
    if abs(camera.data.ortho_scale - exporter.RESOLUTION_PX / 64) > 1e-6:
        raise ValueError('Shower actual camera scale is not 64 pixels per tile')
    for turns in range(4):
        for point in points:
            x, y = point.x - 0.5, point.y - 0.5
            for _ in range(turns):
                x, y = -y, x
            if not (0 <= x + 0.5 <= 1 and 0 <= y + 0.5 <= 1):
                raise ValueError(f'Shower evaluated geometry escapes clockwise quarter turn {turns}')
    print(f'SHOWER_EVALUATED_BOUNDS {minimum} {maximum}; 43 meshes, four occupied orientations', flush=True)
    return scene, camera, target


exporter.configure = configure
point_camera_shared = exporter.point_camera


def point_camera(camera, target, yaw, elevation):
    if exporter.MODELS[0][0] == ASSET_ID:
        return shower_detail_exporter().point_camera(camera, target, yaw, elevation)
    point_camera_shared(camera, target, yaw, elevation)
    azimuth, tilt = exporter.math.radians(yaw), exporter.math.radians(elevation)
    offset = camera.location - target
    expected = exporter.Vector((6 * exporter.math.cos(tilt) * exporter.math.sin(azimuth),
                                -6 * exporter.math.cos(tilt) * exporter.math.cos(azimuth),
                                6 * exporter.math.sin(tilt)))
    if (offset - expected).length > 1e-5:
        raise ValueError('Shower actual camera target/yaw basis differs from declared square pose')
    forward = camera.rotation_euler.to_quaternion() @ exporter.Vector((0, 0, -1))
    if forward.dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Shower actual camera does not aim at its declared target')


exporter.point_camera = point_camera

if __name__ == '__main__':
    if '--verify' in sys.argv:
        for model in exporter.MODELS:
            _, camera, target = configure(model)
            for yaw in exporter.YAW:
                for elevation in exporter.ELEVATION:
                    point_camera(camera, target, yaw, elevation)
        print('SHOWER_VERIFY 72 cameras and four occupied orientations', flush=True)
    else:
        exporter.main()
