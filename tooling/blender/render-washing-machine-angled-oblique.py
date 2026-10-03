"""Render the existing authored 2x1 dedicated Laundry washing machine through the shared square pipeline."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve()
spec = importlib.util.spec_from_file_location('dedicated_laundry_washing_machine_square_exporter', SCRIPT.with_name('render-kitchen-fixtures-oblique.py'))
assert spec and spec.loader
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
exporter.pipeline_common.require_blender_version()
ASSET_ID = 'utility.washing-machine.variants'
exporter.MODELS = ((ASSET_ID, 'utility.washing-machine.angled-detail.blend',
                    'oblique-utility.washing-machine.v1.json', 2, 1, 1.0, 1.0, 0.7825000286102295),)
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/dedicated-washing-machine-angled-preview'


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
    provenance = json.loads((exporter.ROOT / 'assets/source/blender/utility.washing-machine.angled.provenance.json').read_text())
    source = exporter.ROOT / provenance['source']
    if hashlib.sha256(source.read_bytes()).hexdigest() != provenance['sourceSha256']:
        raise ValueError('Dedicated washing machine source bytes differ from its audited provenance')
    original = exporter.ROOT / provenance['originalSource']
    if hashlib.sha256(original.read_bytes()).hexdigest() != provenance['originalSourceSha256']:
        raise ValueError('Original washing machine source bytes changed')
    actual = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
    if actual != sorted(mesh['name'] for mesh in provenance['meshes']):
        raise ValueError('Dedicated washing machine authored mesh set changed')
    points = evaluated_points(scene)
    for axis in range(3):
        if abs(min(p[axis] for p in points) - provenance['sourceEvaluatedBounds']['min'][axis]) > 1e-6 or abs(max(p[axis] for p in points) - provenance['sourceEvaluatedBounds']['max'][axis]) > 1e-6:
            raise ValueError('Dedicated washing machine evaluated source bounds changed')


configure_shared = exporter.configure


def configure(model):
    if model[1] == 'utility.washing-machine.angled-detail.blend':
        detail_spec = importlib.util.spec_from_file_location('washer_detail_dispatch', SCRIPT.with_name('render-washing-machine-detail-oblique.py'))
        detail = importlib.util.module_from_spec(detail_spec)
        detail_spec.loader.exec_module(detail)
        return detail.configure(model)
    registry = json.loads((exporter.ROOT / 'public/game-content/oblique-module-registry.v1.json').read_text())
    entries = [entry for entry in registry['entries'] if entry['assetId'] == ASSET_ID]
    if len(entries) != 1 or model[0] != ASSET_ID or entries[0]['manifest'] != '/game-content/' + model[2]:
        raise ValueError('Dedicated washing machine output does not match its existing runtime registry consumer')
    scene, camera, target = configure_shared(model, prepare_source)
    points = evaluated_points(scene)
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    provenance = json.loads((exporter.ROOT / 'assets/source/blender/utility.washing-machine.angled.provenance.json').read_text())
    for axis in range(3):
        offset = (1, .5, 0)[axis]
        if abs(minimum[axis] - provenance['sourceEvaluatedBounds']['min'][axis] - offset) > 1e-6 or abs(maximum[axis] - provenance['sourceEvaluatedBounds']['max'][axis] - offset) > 1e-6:
            raise ValueError('Dedicated washing machine actual loaded transform is not unit-scale anchor translation')
    if not (0 <= minimum[0] <= maximum[0] <= 2 and
            0 <= minimum[1] <= maximum[1] <= 1 and abs(minimum[2]) <= 1e-6):
        raise ValueError(f'Evaluated dedicated Laundry washing machine geometry escapes grounded 2x1: {minimum} to {maximum}')
    if abs(target.x - 1) > 1e-6 or abs(target.y - 0.5) > 1e-6:
        raise ValueError('Dedicated Laundry washing machine target does not match its occupied anchor')
    if abs(target.z - (minimum[2] + maximum[2]) / 2) > 1e-6:
        raise ValueError('Dedicated Laundry washing machine target does not match its evaluated source height')
    if abs(camera.data.ortho_scale - exporter.RESOLUTION_PX / 64) > 1e-6:
        raise ValueError('Dedicated Laundry washing machine actual camera scale is not 64 pixels per tile')
    # Object quarter turns use clockwise +X->+Y. Rotate actual evaluated points
    # about the center, then translate to the rotated occupied min corner.
    for turns in range(4):
        width, height = (2, 1) if turns % 2 == 0 else (1, 2)
        transformed = []
        for point in points:
            x, y = point.x - 1, point.y - 0.5
            for _ in range(turns):
                x, y = -y, x
            transformed.append((x + width / 2, y + height / 2))
        if not all(0 <= x <= width and 0 <= y <= height for x, y in transformed):
            raise ValueError(f'Dedicated Laundry washing machine evaluated geometry escapes quarter turn {turns}')
    print(f'DEDICATED_LAUNDRY_WASHING_MACHINE_EVALUATED_BOUNDS {minimum} {maximum}; four occupied orientations verified', flush=True)
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
        raise ValueError('Dedicated Laundry washing machine actual camera target/yaw basis differs from declared square pose')
    forward = camera.rotation_euler.to_quaternion() @ exporter.Vector((0, 0, -1))
    if forward.dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Dedicated Laundry washing machine actual camera does not aim at its declared target')


exporter.point_camera = point_camera

if __name__ == '__main__':
    if '--verify' in sys.argv:
        for model in exporter.MODELS:
            _, camera, target = configure(model)
            for yaw in exporter.YAW:
                for elevation in exporter.ELEVATION:
                    point_camera(camera, target, yaw, elevation)
        print('DEDICATED_LAUNDRY_WASHING_MACHINE_VERIFY72 cameras and four occupied orientations', flush=True)
    else:
        exporter.main()
