"""Render the retained student writing chair through the original Classroom camera.

Own source/descriptor/72PNG only. No runtime registry/context decisions.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import math
import sys
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


builder = load('student_chair_retained_source', HERE / 'build-classroom-student-chair.py')
exporter = load('student_chair_original_classroom_exporter', HERE / 'render-classroom-chair-oblique.py')
ASSET_ID = 'furniture.classroom.student-chair'
SOURCE_NAME = 'furniture.classroom.student-chair.blend'
MANIFEST_NAME = 'oblique-furniture-classroom-student-chair.v1.json'
MODEL = (ASSET_ID, SOURCE_NAME, MANIFEST_NAME)
MODELS = (MODEL,)
OUTPUT = ROOT / 'public/assets/environment/oblique'
PREVIEW = ROOT / 'assets/intermediate/classroom-student-chair-preview'
TARGET = Vector((.5, .5, .58))
exporter.SOURCE = ROOT / 'assets/source/blender' / SOURCE_NAME


def configure(model):
    if model != MODEL or model != ('furniture.classroom.student-chair', 'furniture.classroom.student-chair.blend',
                                   'oblique-furniture-classroom-student-chair.v1.json'):
        raise ValueError('Classroom student chair dedicated producer dispatch changed')
    scene, camera = exporter.configure()
    builder.verify_source(scene)
    if (exporter.RESOLUTION_PX, exporter.ORTHO_SCALE_TILES, exporter.NOMINAL_PIXELS_PER_TILE) != (256, 4., 64.):
        raise ValueError('Classroom student chair original canonical pixel scale changed')
    if camera.data.type != 'ORTHO' or abs(camera.data.ortho_scale - 4) > 1e-6 or exporter.TARGET != TARGET:
        raise ValueError('Classroom student chair original actual camera/target changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Classroom student chair original actual resolution changed')
    if tuple(exporter.YAW) != tuple(range(0, 360, 30)) or tuple(exporter.ELEVATION) != tuple(range(20, 80, 10)):
        raise ValueError('Classroom student chair original canonical pose matrix changed')
    return scene, camera


def point_camera(camera, yaw, elevation):
    exporter.point_camera(camera, yaw, elevation)
    azimuth, tilt = math.radians(yaw), math.radians(elevation)
    expected = Vector((6 * math.cos(tilt) * math.sin(azimuth),
                       -6 * math.cos(tilt) * math.cos(azimuth), 6 * math.sin(tilt)))
    offset = camera.location - TARGET
    if (offset - expected).length > 1e-5 or (camera.rotation_euler.to_quaternion() @ Vector((0, 0, -1))).dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Classroom student chair actual original camera basis/aim changed')


def main():
    if MODELS != (MODEL,):
        raise ValueError('Classroom student chair dedicated producer dispatch changed')
    for model in MODELS:
        scene, camera = configure(model)
        if '--verify' in sys.argv:
            for yaw in exporter.YAW:
                for elevation in exporter.ELEVATION:
                    point_camera(camera, yaw, elevation)
            print('CLASSROOM_STUDENT_CHAIR_VERIFY_GREEN source/13 physical contacts/72 original cameras/four occupied turns', flush=True)
            continue
        preview = '--preview' in sys.argv
        poses = [(45, 45)] if preview else [(yaw, elevation) for yaw in exporter.YAW for elevation in exporter.ELEVATION]
        directory = PREVIEW if preview else OUTPUT
        directory.mkdir(parents=True, exist_ok=True)
        frames = []
        for yaw, elevation in poses:
            point_camera(camera, yaw, elevation)
            path = directory / f'{ASSET_ID}-yaw{yaw:+03d}-elev{elevation:02d}.render.png'
            scene.render.filepath = str(path)
            exporter.bpy.ops.render.render(write_still=True)
            exporter.normalize_and_check_border(path)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if preview:
                print(f'CLASSROOM_STUDENT_CHAIR_ACTUAL_PREVIEW {path} sha256 {digest}', flush=True)
                continue
            name = f'{ASSET_ID}-yaw{yaw:+03d}-elev{elevation:02d}.{digest[:12]}.png'
            path.replace(OUTPUT / name)
            frames.append({'yawDegrees': yaw, 'elevationDegrees': elevation,
                           'image': f'/assets/environment/oblique/{name}', 'sha256': digest})
        if not preview:
            descriptor = {'schemaVersion': 1, 'assetId': ASSET_ID,
                          'source': f'assets/source/blender/{SOURCE_NAME}',
                          'sourceSha256': hashlib.sha256(exporter.SOURCE.read_bytes()).hexdigest(),
                          'resolutionPx': [256, 256], 'nominalPixelsPerTile': 64, 'pivotPx': [128, 128],
                          'cameraTargetTiles': [.5, .5, .58], 'projection': 'orthographic',
                          'yawDegrees': list(exporter.YAW), 'elevationDegrees': list(exporter.ELEVATION), 'frames': frames}
            pipeline_common.write_text(ROOT / 'public/game-content' / MANIFEST_NAME, json.dumps(descriptor, indent=2) + '\n')
            print('CLASSROOM_STUDENT_CHAIR_CANONICAL_72_GREEN original camera/palette/settings unchanged', flush=True)


if __name__ == '__main__':
    modern = load('student_chair_current_saved_cycles_dispatch', HERE / 'render-classroom-student-chair-cycles.py')
    modern.main()
