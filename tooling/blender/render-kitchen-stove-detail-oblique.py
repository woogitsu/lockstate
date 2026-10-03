"""Export the retained and physically refined Kitchen stove through the shared square camera."""
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


exporter = load_module('kitchen_stove_square_exporter', HERE / 'render-kitchen-fixtures-oblique.py')
audit = load_module('kitchen_stove_authored_audit', HERE / 'refine-kitchen-stove-angled-detail.py')
ASSET_ID = 'furniture.kitchen.stove.variants'
exporter.MODELS = ((ASSET_ID, 'furniture.kitchen.stove.angled-detail.blend', 'oblique-furniture.kitchen-stove.v1.json', 2, 1, 1.0, 1.0, 1.1230000257492065),)
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/kitchen-stove-detail-preview'
PROVENANCE = exporter.ROOT / 'assets/source/blender/furniture.kitchen.stove.angled-detail.provenance.json'


def prepare_source(scene, model):
    receipt = json.loads(PROVENANCE.read_text())
    if tuple(model[3:]) != (2, 1, 1.0, 1.0, 1.1230000257492065):
        raise ValueError('Kitchen stove declared occupied rectangle/source fit/accepted target changed')
    for path_key, hash_key in (('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')):
        if hashlib.sha256((exporter.ROOT / receipt[path_key]).read_bytes()).hexdigest() != receipt[hash_key]:
            raise ValueError('Kitchen stove original/dedicated source bytes changed')
    registry = json.loads((exporter.ROOT / 'public/game-content/oblique-module-registry.v1.json').read_text())
    entry = next(row for row in registry['entries'] if row['assetId'] == ASSET_ID)
    if entry['manifest'] != '/game-content/' + model[2]:
        raise ValueError('Kitchen stove exporter targets the wrong canonical descriptor')
    rows = audit.capture(scene)
    if sorted(rows) != sorted(row['name'] for row in receipt['meshes']):
        raise ValueError('Kitchen stove retained/authored mesh set changed')
    audit.actual_triangle_contacts(scene, receipt['actualContactTargets'])
    # Actual evaluated normals include the original bevels and object transforms.
    audit.convex_normal_audit(scene)
    raw_meshes = [audit.raw_record(obj) for obj in sorted(scene.objects, key=lambda obj: obj.name) if obj.type == 'MESH']
    if raw_meshes != receipt['allAuthoredRawMeshes']:
        raise ValueError('Kitchen stove actual authored topology/material assignment/modifier data changed')
    for expected in receipt['meshes']:
        if rows[expected['name']]['evaluatedPositionSha256'] != expected['evaluatedPositionSha256']:
            raise ValueError('Kitchen stove actual evaluated authored geometry changed')
    retained = [exporter.bpy.data.objects[row['name']] for row in receipt['retainedMeshesAfter']]
    if [audit.raw_record(obj) for obj in retained] != receipt['retainedMeshesAfter']:
        raise ValueError('Kitchen stove retained vertex/unchanged topology/material/modifier data changed')
    if {obj.name: [list(row) for row in obj.matrix_world] for obj in retained} != receipt['retainedObjectMatrices']:
        raise ValueError('Kitchen stove original retained assembly matrices changed')
    if audit.materials_record() != receipt['retainedMaterialValues']:
        raise ValueError('Kitchen stove retained six stored material graphs changed')


configure_shared = exporter.configure


def configure(model):
    scene, camera, target = configure_shared(model, prepare_source)
    receipt = json.loads(PROVENANCE.read_text())
    points = [p for row in audit.capture(scene).values() for p in row['points']]
    minimum = [min(p[a] for p in points) for a in range(3)]; maximum = [max(p[a] for p in points) for a in range(3)]
    for axis in range(3):
        offset = (1, .5, 0)[axis]
        scale = (1, 1, 1)[axis]
        if abs(minimum[axis] - receipt['sourceEvaluatedBounds']['min'][axis] * scale - offset) > 1e-6 or abs(maximum[axis] - receipt['sourceEvaluatedBounds']['max'][axis] * scale - offset) > 1e-6:
            raise ValueError('Kitchen stove loaded transform is not accepted-fit anchor translation')
    # Repeat the surface audit after the shared anchor transform too.
    audit.convex_normal_audit(scene)
    for turns in range(4):
        width, height = (2, 1) if turns % 2 == 0 else (1, 2)
        for point in points:
            x, y = point.x - 1, point.y - .5
            for _ in range(turns): x, y = -y, x
            if not (0 <= x + width / 2 <= width and 0 <= y + height / 2 <= height and point.z >= -1e-6):
                raise ValueError('Kitchen stove evaluated geometry escapes occupied quarter turn')
    if abs(target.z - receipt['cameraTargetTiles'][2]) > 1e-6:
        raise ValueError('Kitchen stove declared target differs from accepted source/runtime paired target')
    if abs(camera.data.ortho_scale - exporter.RESOLUTION_PX / 64) > 1e-6:
        raise ValueError('Kitchen stove actual camera pitch differs from64pixels per tile')
    print('STOVE_DETAIL_EVALUATED_BOUNDS', minimum, maximum, flush=True)
    return scene, camera, target


exporter.configure = configure
point_shared = exporter.point_camera


def point_camera(camera, target, yaw, elevation):
    point_shared(camera, target, yaw, elevation)
    azimuth, tilt = math.radians(yaw), math.radians(elevation)
    offset = camera.location - target
    expected = exporter.Vector((6 * math.cos(tilt) * math.sin(azimuth), -6 * math.cos(tilt) * math.cos(azimuth), 6 * math.sin(tilt)))
    if (offset - expected).length > 1e-5:
        raise ValueError('Kitchen stove actual camera ground basis differs from world projection')
    forward = camera.rotation_euler.to_quaternion() @ exporter.Vector((0, 0, -1))
    if forward.dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Kitchen stove actual camera does not aim at its declared target')


exporter.point_camera = point_camera

if __name__ == '__main__':
    if '--verify' in sys.argv:
        for model in exporter.MODELS:
            _, camera, target = configure(model)
            for yaw in exporter.YAW:
                for elevation in exporter.ELEVATION:
                    point_camera(camera, target, yaw, elevation)
        print('STOVE_DETAIL_VERIFY72 cameras/allfour orientations/outward evaluated surfaces', flush=True)
    else:
        exporter.main()
