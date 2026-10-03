"""Export the existing selected medical fixtures at their authoritative tile scale."""
import importlib.util
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pipeline_common

pipeline_common.require_blender_version()
spec = importlib.util.spec_from_file_location('square_fixture_export', HERE / 'render-kitchen-fixtures-oblique.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/infirmary-fixtures-preview'
exporter.MODELS = (
    ('furniture.medical-bed.variants', 'furniture.medical-bed.angled-detail.blend',
     'oblique-furniture.medical-bed.v1.json', 1, 2, 1.0, 1.0, .675000011920929),
    ('fixture.medicine-cabinet.variants', 'fixture.medicine-cabinet.angled-detail.blend',
     'oblique-fixture.medicine-cabinet.v1.json', 1, 1, 1.0, 1.0, .5899999737739563),
)
SOURCE_SHA256 = {
    'furniture.medical-bed.variants': '1737b03a3ee1342e813e7096e0aef189f05d714d5a69437a8fe490c026d232be',
    'fixture.medicine-cabinet.variants': '17670457233caef94855cdaf64b2cf1bd3c8623318941cbd3ce2e5c50224ac75',
}
SOURCE_MESH_NAMES = {
    'furniture.medical-bed.variants': frozenset((
        'bed_base', 'mattress', 'rail', 'rail.001', 'leg', 'leg.001', 'leg.002',
        'leg.003', 'headboard', 'pillow', 'control',
    )),
    'fixture.medicine-cabinet.variants': frozenset((
        'cabinet_body', 'inner', 'shelf', 'shelf.001', 'shelf.002',
        'door', 'door.001', 'handle', 'handle.001',
    )),
}


def evaluated_points(scene):
    dependency_graph = exporter.bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(dependency_graph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    if not points:
        raise ValueError('The selected medical fixture has no evaluated geometry')
    return points


def prepare_source(scene, model):
    if model[0] == 'furniture.medical-bed.variants':
        bed_spec = importlib.util.spec_from_file_location(
            'medical_bed_detail_guard', HERE / 'render-medical-bed-detail-oblique.py')
        bed = importlib.util.module_from_spec(bed_spec)
        bed_spec.loader.exec_module(bed)
        bed.prepare_source(scene, model)
        return
    if model[0] == 'fixture.medicine-cabinet.variants':
        dedicated_spec = importlib.util.spec_from_file_location(
            'medicine_cabinet_detail_guard', HERE / 'render-medicine-cabinet-detail-oblique.py')
        dedicated = importlib.util.module_from_spec(dedicated_spec)
        dedicated_spec.loader.exec_module(dedicated)
        dedicated.prepare_source(scene, model)
        return
    source = exporter.ROOT / 'assets/source/blender' / model[1]
    if exporter.hashlib.sha256(source.read_bytes()).hexdigest() != SOURCE_SHA256[model[0]]:
        raise ValueError(f'{model[0]} original source bytes changed; re-audit the selected authored mesh set')
    # The cabinet source retains the earlier bed, unselected, in the saved
    # scene. The saved selected mesh set records which asset was authored.
    # Verify that set before filtering, so a changed selection cannot silently
    # add foreign geometry or drop an authored part. This is in-memory only;
    # neither original .blend is rewritten.
    source_mesh_count = sum(obj.type == 'MESH' for obj in scene.objects)
    selected = frozenset(obj.name for obj in scene.objects if obj.type == 'MESH' and obj.select_get())
    expected = SOURCE_MESH_NAMES[model[0]]
    if selected != expected:
        raise ValueError(f'{model[0]} selected source meshes changed: {sorted(selected)}')
    for obj in list(scene.objects):
        if obj.type == 'MESH' and obj.name not in selected:
            exporter.bpy.data.objects.remove(obj, do_unlink=True)
    points = evaluated_points(scene)
    lift = -min(point.z for point in points)
    transform = exporter.Matrix.Translation(exporter.Vector((0, 0, lift)))
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.matrix_world = transform @ obj.matrix_world
    exporter.bpy.context.view_layer.update()
    print(f'MEDICAL_SOURCE {model[0]} meshes_before={source_mesh_count} meshes_after={len(selected)} ground_translation={lift}', flush=True)


configure_fixture = exporter.configure


def configure(model):
    scene, camera, target = configure_fixture(model, prepare_source)
    if abs(camera.data.ortho_scale - exporter.RESOLUTION_PX / 64) > 1e-6:
        raise ValueError(f'{model[0]} actual orthographic camera scale is not 64 pixels per tile')
    points = evaluated_points(scene)
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    width, height = model[3:5]
    if not (0 <= minimum[0] <= maximum[0] <= width and
            0 <= minimum[1] <= maximum[1] <= height and abs(minimum[2]) <= 1e-6):
        raise ValueError(f'{model[0]} evaluated geometry escapes grounded {width} x {height}: {minimum} to {maximum}')
    if abs(target.z - (minimum[2] + maximum[2]) / 2) > 1e-6:
        raise ValueError(f'{model[0]} camera target does not match evaluated geometry height')
    print(f'MEDICAL_EVALUATED_BOUNDS {model[0]} {minimum} {maximum}', flush=True)
    return scene, camera, target


exporter.configure = configure
point_camera_source = exporter.point_camera


def point_camera(camera, target, yaw, elevation):
    point_camera_source(camera, target, yaw, elevation)
    azimuth = exporter.math.radians(yaw)
    tilt = exporter.math.radians(elevation)
    expected_offset = exporter.Vector((
        6 * exporter.math.cos(tilt) * exporter.math.sin(azimuth),
        -6 * exporter.math.cos(tilt) * exporter.math.cos(azimuth),
        6 * exporter.math.sin(tilt),
    ))
    if (camera.location - target - expected_offset).length > 1e-5:
        raise ValueError(f'Medical camera {yaw}/{elevation} does not use the declared target and yaw basis')
    forward = camera.rotation_euler.to_quaternion() @ exporter.Vector((0, 0, -1))
    if forward.dot((target - camera.location).normalized()) < 1 - 1e-6:
        raise ValueError(f'Medical camera {yaw}/{elevation} does not aim at its manifest target')


exporter.point_camera = point_camera

if __name__ == '__main__':
    if '--verify' in sys.argv or '--verify-bed' in sys.argv:
        models = tuple(model for model in exporter.MODELS if model[0] == 'furniture.medical-bed.variants') if '--verify-bed' in sys.argv else exporter.MODELS
        for model in models:
            _, camera, target = configure(model)
            for yaw in exporter.YAW:
                for elevation in exporter.ELEVATION:
                    point_camera(camera, target, yaw, elevation)
            print(f'MEDICAL_CAMERA_VERIFY {model[0]} 72 poses at 64 pixels per tile', flush=True)
    else:
        # Retain the old exporter's optional output-directory argument.
        arguments = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
        if arguments and not arguments[0].startswith('--'):
            exporter.OUTPUT = Path(arguments[0]).resolve()
        exporter.main()
