"""Export the retained and physically refined Kitchen fridge through the shared square camera."""
from __future__ import annotations
import hashlib
import importlib.util
import json
import math
import sys
from pathlib import Path
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
    return module


exporter = load_module('kitchen_fridge_square_exporter', HERE / 'render-kitchen-fixtures-oblique.py')
audit = load_module('kitchen_fridge_authored_audit', HERE / 'refine-kitchen-fridge-angled-detail.py')
ASSET_ID = 'furniture.kitchen.fridge.variants'
exporter.MODELS = ((ASSET_ID, 'furniture.kitchen.fridge.angled-detail.blend', 'oblique-furniture.kitchen-fridge.v1.json', 1, 1, 1.0, 1.0, 1.1999999284744263),)
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/kitchen-fridge-detail-preview'
PROVENANCE = exporter.ROOT / 'assets/source/blender/furniture.kitchen.fridge.angled-detail.provenance.json'


def prepare_source(scene, model):
    receipt = json.loads(PROVENANCE.read_text())
    if tuple(model[3:]) != (1, 1, 1.0, 1.0, 1.1999999284744263):
        raise ValueError('Kitchen fridge declared occupied rectangle/source fit/accepted target changed')
    for path_key, hash_key in (('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')):
        if hashlib.sha256((exporter.ROOT / receipt[path_key]).read_bytes()).hexdigest() != receipt[hash_key]:
            raise ValueError('Kitchen fridge original/dedicated source bytes changed')
    registry = json.loads((exporter.ROOT / 'public/game-content/oblique-module-registry.v1.json').read_text())
    entry = next(row for row in registry['entries'] if row['assetId'] == ASSET_ID)
    if entry['manifest'] != '/game-content/' + model[2]:
        raise ValueError('Kitchen fridge exporter targets the wrong canonical descriptor')
    rows = audit.capture(scene)
    if sorted(rows) != sorted(row['name'] for row in receipt['meshes']):
        raise ValueError('Kitchen fridge retained/authored mesh set changed')
    audit.contacts(scene, receipt['actualContactTargets'])
    # Actual evaluated normals include the original bevels and object transforms.
    audit.convex_normal_audit(scene)
    raw_meshes = [audit.raw_record(obj) for obj in sorted(scene.objects, key=lambda obj: obj.name) if obj.type == 'MESH']
    if raw_meshes != receipt['allAuthoredRawMeshes']:
        raise ValueError('Kitchen fridge actual authored topology/material assignment/modifier data changed')
    for expected in receipt['meshes']:
        if rows[expected['name']]['evaluatedPositionSha256'] != expected['evaluatedPositionSha256']:
            raise ValueError('Kitchen fridge actual evaluated authored geometry changed')
    retained = [exporter.bpy.data.objects[row['name']] for row in receipt['retainedMeshesAfter']]
    if [audit.raw_record(obj) for obj in retained] != receipt['retainedMeshesAfter']:
        raise ValueError('Kitchen fridge retained vertex/unchanged topology/material/modifier data changed')
    if {obj.name: [list(row) for row in obj.matrix_world] for obj in retained} != receipt['retainedObjectMatrices']:
        raise ValueError('Kitchen fridge original retained assembly matrices changed')
    if audit.materials_record() != receipt['retainedMaterialValues']:
        raise ValueError('Kitchen fridge retained six stored material graphs changed')


configure_shared = exporter.configure


def configure(model):
    scene, camera, target = configure_shared(model, prepare_source)
    receipt = json.loads(PROVENANCE.read_text())
    points = [p for row in audit.capture(scene).values() for p in row['points']]
    minimum = [min(p[a] for p in points) for a in range(3)]; maximum = [max(p[a] for p in points) for a in range(3)]
    for axis in range(3):
        offset = (.5, .5, 0)[axis]
        scale = (1, 1, 1)[axis]
        if abs(minimum[axis] - receipt['sourceEvaluatedBounds']['min'][axis] * scale - offset) > 1e-6 or abs(maximum[axis] - receipt['sourceEvaluatedBounds']['max'][axis] * scale - offset) > 1e-6:
            raise ValueError('Kitchen fridge loaded transform is not accepted-fit anchor translation')
    # Repeat the surface audit after the shared anchor transform too.
    audit.convex_normal_audit(scene)
    for turns in range(4):
        width, height = (1, 1)
        for point in points:
            x, y = point.x - .5, point.y - .5
            for _ in range(turns): x, y = -y, x
            if not (0 <= x + width / 2 <= width and 0 <= y + height / 2 <= height and point.z >= -1e-6):
                raise ValueError('Kitchen fridge evaluated geometry escapes occupied quarter turn')
    if abs(target.z - receipt['cameraTargetTiles'][2]) > 1e-6:
        raise ValueError('Kitchen fridge declared target differs from accepted source/runtime paired target')
    if abs(camera.data.ortho_scale - exporter.RESOLUTION_PX / 64) > 1e-6:
        raise ValueError('Kitchen fridge actual camera pitch differs from64pixels per tile')
    print('FRIDGE_DETAIL_EVALUATED_BOUNDS', minimum, maximum, flush=True)
    return scene, camera, target


exporter.configure = configure
point_shared = exporter.point_camera


def point_camera(camera, target, yaw, elevation):
    point_shared(camera, target, yaw, elevation)
    azimuth, tilt = math.radians(yaw), math.radians(elevation)
    offset = camera.location - target
    expected = exporter.Vector((6 * math.cos(tilt) * math.sin(azimuth), -6 * math.cos(tilt) * math.cos(azimuth), 6 * math.sin(tilt)))
    if (offset - expected).length > 1e-5:
        raise ValueError('Kitchen fridge actual camera ground basis differs from world projection')
    forward = camera.rotation_euler.to_quaternion() @ exporter.Vector((0, 0, -1))
    if forward.dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Kitchen fridge actual camera does not aim at its declared target')


exporter.point_camera = point_camera

if __name__ == '__main__':
    CYCLES_PRODUCER = 'render-kitchen-fridge-cycles.py'
    if CYCLES_PRODUCER != 'render-kitchen-fridge-cycles.py':
        raise ValueError('Kitchen fridge canonical Cycles producer dispatch changed')
    modern_spec = importlib.util.spec_from_file_location('kitchen_fridge_retained_cycles_entry', Path(__file__).with_name(CYCLES_PRODUCER))
    modern = importlib.util.module_from_spec(modern_spec)
    modern_spec.loader.exec_module(modern)
    modern.main()
