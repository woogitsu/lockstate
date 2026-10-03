"""Dedicated classroom teacher desk through the existing grounded square exporter.

Own source/descriptor/72 PNGs only. Root owns optional registry/room mapping.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import sys
from mathutils import Vector

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load('classroom_desk_physical_source', HERE / 'build-classroom-teacher-desk.py')
exporter = load('classroom_desk_existing_square_exporter', HERE / 'render-kitchen-fixtures-oblique.py')
ASSET_ID = 'furniture.classroom.teacher-desk'
SOURCE_NAME = 'furniture.classroom.teacher-desk.blend'
MANIFEST_NAME = 'oblique-furniture-classroom-teacher-desk.v1.json'
receipt = json.loads(builder.PROVENANCE.read_text(encoding='utf-8-sig'))
TARGET_Z = .6349999904632568
if receipt['cameraTargetTiles'] != [1., .5, TARGET_Z]:
    raise ValueError('Classroom teacher desk measured original camera target changed')
MODEL = (ASSET_ID, SOURCE_NAME, MANIFEST_NAME, 2, 1, 1., 1., TARGET_Z)
exporter.MODELS = (MODEL,)
exporter.PREVIEW = ROOT / 'assets/intermediate/classroom-teacher-desk-preview'
shared_configure = exporter.configure


def prepare_source(scene, model):
    if model != MODEL or model[0] != ASSET_ID or model[1] != SOURCE_NAME or model[2] != MANIFEST_NAME:
        raise ValueError('Classroom teacher desk dedicated producer dispatch changed')
    builder.verify_source(scene)


def configure(model):
    scene, camera, target = shared_configure(model, prepare_source)
    if (exporter.RESOLUTION_PX, exporter.ORTHO_SCALE_TILES, exporter.NOMINAL_PIXELS_PER_TILE) != (256, 4., 64.):
        raise ValueError('Classroom teacher desk canonical pixel scale changed')
    if camera.data.type != 'ORTHO' or abs(camera.data.ortho_scale - 4) > 1e-6 or target != Vector((1., .5, TARGET_Z)):
        raise ValueError('Classroom teacher desk actual camera/target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Classroom teacher desk actual resolution changed')
    return scene, camera, target


shared_point_camera = exporter.point_camera


def point_camera(camera, target, yaw, elevation):
    shared_point_camera(camera, target, yaw, elevation)
    azimuth, tilt = exporter.math.radians(yaw), exporter.math.radians(elevation)
    expected = Vector((6 * exporter.math.cos(tilt) * exporter.math.sin(azimuth),
                       -6 * exporter.math.cos(tilt) * exporter.math.cos(azimuth), 6 * exporter.math.sin(tilt)))
    offset = camera.location - target
    if (offset - expected).length > 1e-5 or (camera.rotation_euler.to_quaternion() @ Vector((0, 0, -1))).dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Classroom teacher desk actual camera basis/aim changed')


exporter.configure = configure
exporter.point_camera = point_camera
if __name__ == '__main__':
    if exporter.MODELS != (MODEL,):
        raise ValueError('Classroom teacher desk dedicated producer dispatch changed')
    if '--verify' in sys.argv:
        scene, camera, target = configure(MODEL)
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:
                point_camera(camera, target, yaw, elevation)
        print('CLASSROOM_DESK_VERIFY_GREEN source/semantic contacts/72 cameras/four occupied turns', flush=True)
    elif '--repeat-four' in sys.argv:
        catalog = json.loads((ROOT / 'public/game-content' / MANIFEST_NAME).read_text(encoding='utf-8-sig'))
        scene, camera, target = configure(MODEL)
        output = ROOT / 'assets/intermediate/classroom-teacher-desk-proof'
        output.mkdir(parents=True, exist_ok=True)
        repeats = []
        for yaw in (30, 120, 210, 300):
            elevation = 40
            point_camera(camera, target, yaw, elevation)
            path = output / f'repeat-yaw{yaw}-elev40.png'
            scene.render.filepath = str(path)
            exporter.bpy.ops.render.render(write_still=True)
            exporter.normalize_and_check_border(path)
            frame = next(row for row in catalog['frames'] if (row['yawDegrees'], row['elevationDegrees']) == (yaw, elevation))
            canonical = ROOT / 'public' / frame['image'].lstrip('/')
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if digest != frame['sha256'] or path.read_bytes() != canonical.read_bytes():
                raise ValueError('Classroom teacher desk actual canonical repeat differs')
            repeats.append({'yawDegrees': yaw, 'elevationDegrees': elevation, 'sha256': digest, 'byteExactCanonicalRepeat': True})
        exporter.pipeline_common.write_text(output / 'four-real-producer-repeats.json', json.dumps(repeats, indent=2) + '\n')
        print('CLASSROOM_DESK_REPEAT4_BYTE_EXACT_GREEN no canonical files changed', flush=True)
    else:
        exporter.main()
