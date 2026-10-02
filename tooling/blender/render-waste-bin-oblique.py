"""Render the retained authored 1x1 indoor waste bin through the shared square pipeline."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve()
spec = importlib.util.spec_from_file_location('default_bin_square_exporter', SCRIPT.with_name('render-kitchen-fixtures-oblique.py'))
assert spec and spec.loader
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
sys.path.insert(0, str(SCRIPT.parent))
import pipeline_common
pipeline_common.require_blender_version()
ASSET_ID = 'fixture.cell.waste_bin'
exporter.MODELS = ((ASSET_ID, 'fixture.cell.waste_bin.angled.blend',
                    'oblique-fixture-cell-waste-bin.v1.json', 1, 1, 1.0, 1.0, 0.46700000762939453),)
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/default-waste-bin-preview'
centered_points = []


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
    global centered_points
    provenance = json.loads((exporter.ROOT / 'assets/source/blender/fixture.cell.waste_bin.angled.provenance.json').read_text())
    source = exporter.ROOT / provenance['source']
    if hashlib.sha256(source.read_bytes()).hexdigest() != provenance['sourceSha256']:
        raise ValueError('Retained indoor bin source bytes differ from its audited provenance')
    registry = json.loads((exporter.ROOT / 'public/game-content/oblique-module-registry.v1.json').read_text())
    entry = next(value for value in registry['entries'] if value['assetId'] == ASSET_ID)
    if model[0] != ASSET_ID or '/game-content/' + model[2] != entry['manifest']:
        raise ValueError('Indoor bin exporter does not target the canonical runtime descriptor')
    # Audit evaluated geometry as well as source bytes; omission and transformed
    # meshes in this loaded source must be caught before rendering.
    import struct
    graph = exporter.bpy.context.evaluated_depsgraph_get()
    records = []
    for obj in sorted((value for value in scene.objects if value.type == 'MESH'), key=lambda value: value.name):
        value = obj.evaluated_get(graph)
        mesh = value.to_mesh()
        try:
            points = [value.matrix_world @ vertex.co for vertex in mesh.vertices]
            records.append({'name': obj.name, 'evaluatedVertices': len(points),
                'evaluatedPositionSha256': hashlib.sha256(b''.join(struct.pack('<3f', *point) for point in points)).hexdigest(),
                'modifiers': [modifier.type for modifier in obj.modifiers],
                'materials': [material.name for material in obj.data.materials]})
        finally:
            value.to_mesh_clear()
    if records != provenance['meshes']:
        raise ValueError('Indoor bin evaluated retained geometry changed')
    actual = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
    if actual != sorted(mesh['name'] for mesh in provenance['meshes']):
        raise ValueError('Retained indoor bin authored mesh set changed')
    centered_points = evaluated_points(scene)


configure_shared = exporter.configure


def configure(model):
    scene, camera, target = configure_shared(model, prepare_source)
    points = evaluated_points(scene)
    expected = [point + exporter.Vector((.5, .5, 0)) for point in centered_points]
    if len(points) != len(expected) or any((point - original).length > 1e-6
                                         for point, original in zip(points, expected)):
        raise ValueError('Indoor bin loaded transform must preserve unit geometry and min-corner anchor')
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    if not (0 <= minimum[0] <= maximum[0] <= 1 and
            0 <= minimum[1] <= maximum[1] <= 1 and abs(minimum[2]) <= 1e-6):
        raise ValueError(f'Evaluated indoor waste bin geometry escapes grounded 1x1: {minimum} to {maximum}')
    if (target - exporter.Vector((.5, .5, (minimum[2] + maximum[2]) / 2))).length > 1e-6:
        raise ValueError('Indoor waste bin target does not match its evaluated source height')
    if abs(camera.data.ortho_scale - exporter.RESOLUTION_PX / 64) > 1e-6:
        raise ValueError('Indoor waste bin actual camera scale is not 64 pixels per tile')
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
            raise ValueError(f'Indoor waste bin evaluated geometry escapes quarter turn {turns}')
    print(f'DEFAULT_BIN_EVALUATED_BOUNDS {minimum} {maximum}; four occupied orientations verified', flush=True)
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
        raise ValueError('Indoor waste bin actual camera target/yaw basis differs from declared square pose')
    forward = camera.rotation_euler.to_quaternion() @ exporter.Vector((0, 0, -1))
    if forward.dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Indoor waste bin actual camera does not aim at its declared target')


exporter.point_camera = point_camera

def render():
    # The canonical legacy asset ID contains an underscore; published frame
    # paths intentionally retain its existing hyphenated, schema-valid stem.
    poses = [(45, 45)] if exporter.PREVIEW_ONLY else [(yaw, elev) for yaw in exporter.YAW for elev in exporter.ELEVATION]
    directory = exporter.PREVIEW if exporter.PREVIEW_ONLY else exporter.OUTPUT
    directory.mkdir(parents=True, exist_ok=True)
    for model in exporter.MODELS:
        scene, camera, target = configure(model)
        frames = []
        for yaw, elevation in poses:
            point_camera(camera, target, yaw, elevation)
            temporary = directory / f'fixture.cell.waste-bin-yaw{yaw:+03d}-elev{elevation:02d}.render.png'
            scene.render.filepath = str(temporary)
            exporter.bpy.ops.render.render(write_still=True)
            exporter.normalize_and_check_border(temporary)
            digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
            if exporter.PREVIEW_ONLY:
                print(f'preview {temporary} sha256 {digest}')
                continue
            name = f'fixture.cell.waste-bin-yaw{yaw:+03d}-elev{elevation:02d}.{digest[:12]}.png'
            temporary.replace(directory / name)
            frames.append({'yawDegrees': yaw, 'elevationDegrees': elevation,
                           'image': '/assets/environment/oblique/' + name, 'sha256': digest})
        if exporter.PREVIEW_ONLY:
            continue
        descriptor = {'schemaVersion': 1, 'assetId': ASSET_ID,
                      'source': 'assets/source/blender/' + model[1],
                      'sourceSha256': hashlib.sha256((exporter.ROOT / 'assets/source/blender' / model[1]).read_bytes()).hexdigest(),
                      'resolutionPx': [256, 256], 'nominalPixelsPerTile': 64,
                      'pivotPx': [128, 128], 'cameraTargetTiles': list(target),
                      'projection': 'orthographic', 'yawDegrees': list(exporter.YAW),
                      'elevationDegrees': list(exporter.ELEVATION), 'frames': frames}
        pipeline_common.write_text(exporter.ROOT / 'public/game-content' / model[2], json.dumps(descriptor, indent=2) + '\n')
        print('DEFAULT_BIN_RENDER72 canonical descriptor and schema-valid paths', flush=True)

if __name__ == '__main__':
    if '--verify' in sys.argv:
        for model in exporter.MODELS:
            _, camera, target = configure(model)
            for yaw in exporter.YAW:
                for elevation in exporter.ELEVATION:
                    point_camera(camera, target, yaw, elevation)
        print('DEFAULT_BIN_VERIFY72 cameras and four occupied orientations', flush=True)
    else:
        render()
