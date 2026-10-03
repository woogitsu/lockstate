"""Dedicated Garbage Room bin through the existing grounded square exporter.

Own source/descriptor/72 PNGs only. Root owns optional registry/room mapping.
"""
from pathlib import Path
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


builder = load('garbage_bin_physical_source', HERE / 'build-garbage-room-bin.py')
exporter = load('garbage_bin_existing_square_exporter', HERE / 'render-kitchen-fixtures-oblique.py')
ASSET_ID = 'fixture.garbage-room.waste-bin'
SOURCE_NAME = 'fixture.garbage-room.waste-bin.blend'
MANIFEST_NAME = 'oblique-fixture.garbage-room-waste-bin.v1.json'
receipt = json.loads(builder.PROVENANCE.read_text(encoding='utf-8-sig'))
TARGET_Z = receipt['cameraTargetTiles'][2]
MODEL = (ASSET_ID, SOURCE_NAME, MANIFEST_NAME, 1, 1, 1., 1., TARGET_Z)
exporter.MODELS = (MODEL,)
exporter.PREVIEW = ROOT / 'assets/intermediate/garbage-room-bin-preview'
shared_configure = exporter.configure


def prepare_source(scene, model):
    if model != MODEL or model[0] != ASSET_ID or model[1] != SOURCE_NAME or model[2] != MANIFEST_NAME:
        raise ValueError('Garbage Room bin dedicated producer dispatch changed')
    builder.verify_source(scene)


def configure(model):
    scene, camera, target = shared_configure(model, prepare_source)
    if (exporter.RESOLUTION_PX, exporter.ORTHO_SCALE_TILES, exporter.NOMINAL_PIXELS_PER_TILE) != (256, 4., 64.):
        raise ValueError('Garbage Room bin canonical pixel scale changed')
    if camera.data.type != 'ORTHO' or abs(camera.data.ortho_scale - 4) > 1e-6 or target != Vector((.5, .5, TARGET_Z)):
        raise ValueError('Garbage Room bin actual camera/target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Garbage Room bin actual resolution changed')
    return scene, camera, target


shared_point_camera = exporter.point_camera


def point_camera(camera, target, yaw, elevation):
    shared_point_camera(camera, target, yaw, elevation)
    azimuth, tilt = exporter.math.radians(yaw), exporter.math.radians(elevation)
    expected = Vector((6 * exporter.math.cos(tilt) * exporter.math.sin(azimuth),
                       -6 * exporter.math.cos(tilt) * exporter.math.cos(azimuth), 6 * exporter.math.sin(tilt)))
    offset = camera.location - target
    if (offset - expected).length > 1e-5 or (camera.rotation_euler.to_quaternion() @ Vector((0, 0, -1))).dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Garbage Room bin actual camera basis/aim changed')


exporter.configure = configure
exporter.point_camera = point_camera
if __name__ == '__main__':
    if exporter.MODELS != (MODEL,):
        raise ValueError('Garbage Room bin dedicated producer dispatch changed')
    if '--verify' in sys.argv:
        scene, camera, target = configure(MODEL)
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:
                point_camera(camera, target, yaw, elevation)
        print('GARBAGE_BIN_VERIFY_GREEN source/semantic contacts/72 cameras/four occupied turns', flush=True)
    else:
        exporter.main()
