"""Read the released Prisoner .blend, guard real body contacts and replay four
canonical angles using the previously recovered historical actor camera.
This diagnostic never publishes a source/descriptor/texture or changes a producer.
Run pinned Blender --background --threads 1 --python this-file -- [--render].
"""
from pathlib import Path
import hashlib
import importlib.util
import itertools
import json
import math
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
HELPERS = ROOT / 'tooling/blender'
sys.path.insert(0, str(HELPERS))
import pipeline_common
pipeline_common.require_blender_version()

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HELPERS / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

mesh_audit = load('prisoner_retained_audit', 'refine-guard-belt-detail.py')
encoder = load('prisoner_diagnostic_encoder', 'render-role-actors-oblique.py')
SOURCE = ROOT / 'assets/source/blender/actor.prisoner.base.blend'
SOURCE_SHA = '48e3457298d9d3a2cc9dcd39725ba263450bffea27df05d42fe90afc6e659c0b'
OUTPUT = ROOT / 'assets/intermediate/prisoner-visible-contact-audit'
OUTPUT.mkdir(parents=True, exist_ok=True)
PAIRS = [('Jumpsuit torso', 'Jumpsuit hips'), ('Jumpsuit torso', 'Neck'),
         ('Neck', 'Head'), ('Head', 'Short textured hair')]
for side in (-1, 1):
    PAIRS += [('Jumpsuit torso', f'Sleeve.{side}'),
              (f'Sleeve.{side}', f'Sleeve cuff.{side}'),
              (f'Sleeve.{side}', f'Forearm.{side}'),
              (f'Forearm.{side}', f'Hand.{side}'),
              ('Jumpsuit hips', f'Trouser leg.{side}'),
              (f'Trouser leg.{side}', f'Rolled hem.{side}'),
              (f'Trouser leg.{side}', f'Work shoe upper.{side}'),
              (f'Work shoe upper.{side}', f'Rubber sole.{side}')]

def actual_contacts(scene):
    witnesses = []
    direction = Vector((.937, .223, .181)).normalized()
    for frame in range(1, 9):
        scene.frame_set(frame)
        bpy.context.view_layer.update()
        graph = bpy.context.evaluated_depsgraph_get()
        trees, bounds = {}, {}
        for name in sorted({name for pair in PAIRS for name in pair}):
            obj = bpy.data.objects[name].evaluated_get(graph)
            mesh = obj.to_mesh()
            try:
                vertices = [obj.matrix_world @ vertex.co for vertex in mesh.vertices]
                trees[name] = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons], all_triangles=False)
                bounds[name] = ([min(point[axis] for point in vertices) for axis in range(3)],
                                [max(point[axis] for point in vertices) for axis in range(3)])
            finally:
                obj.to_mesh_clear()
        def inside(name, point):
            origin = point.copy()
            crossings = 0
            for _ in range(100):
                hit, _, _, _ = trees[name].ray_cast(origin, direction, 100)
                if hit is None:
                    return crossings % 2 == 1
                crossings += 1
                origin = hit + direction * 1e-5
            raise ValueError('Prisoner interior probe failed to terminate')
        for a, b in PAIRS:
            low = [max(bounds[a][0][axis], bounds[b][0][axis]) for axis in range(3)]
            high = [min(bounds[a][1][axis], bounds[b][1][axis]) for axis in range(3)]
            point = None
            if all(high[axis] - low[axis] > 1e-5 for axis in range(3)):
                # Start at the midpoint, then search the interior overlap on a
                # bounded grid. A failed midpoint alone does not prove a gap.
                for fractions in itertools.product((.5, .25, .75, .125, .875, .375, .625), repeat=3):
                    candidate = Vector(tuple(low[axis] + (high[axis] - low[axis]) * fractions[axis] for axis in range(3)))
                    if inside(a, candidate) and inside(b, candidate):
                        point = candidate
                        break
            if point is None:
                raise ValueError(f'Prisoner structural contact disconnected: {a} / {b} at frame {frame}')
            witnesses.append({'frame': frame, 'partA': a, 'partB': b,
                              'actualTriangleInteriorWitness': list(point),
                              'aabbIntersectionDepth': [high[axis] - low[axis] for axis in range(3)]})
    scene.frame_set(1)
    return witnesses

original = SOURCE.read_bytes()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
scene.frame_set(1)
names = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
if len(names) != 48:
    raise ValueError('Released Prisoner must retain all 48 original mesh parts')
# Semantics precede the byte identity: the real separated-head control must
# fail on evaluated geometry, rather than only a changed source digest.
contacts = actual_contacts(scene)
if hashlib.sha256(original).hexdigest() != SOURCE_SHA:
    raise ValueError('Released Prisoner source identity changed')
prior = json.loads((ROOT / 'docs/research/2026-10-03-prisoner-legacy-camera-audit/original-source-and-camera-audit.json').read_text())
raw = [mesh_audit.raw_record(bpy.data.objects[name]) for name in names]
materials = mesh_audit.materials_record()
animation = mesh_audit.animation_record()
poses = mesh_audit.pose_record(scene, names)
normals = mesh_audit.normal_record(scene)
bounds = mesh_audit.bounds(scene)
for key, value in [('rawMeshes', raw), ('materials', materials), ('animationCurves', animation),
                   ('eightAnimationPoses', poses), ('geometricNormalRecord', normals), ('sourceBounds', bounds)]:
    if value != prior[key]:
        raise ValueError('Original Prisoner retained record differs: ' + key)
receipt = {'source': SOURCE.relative_to(ROOT).as_posix(), 'sourceSha256': SOURCE_SHA,
           'meshCount': len(names), 'meshNames': names, 'completeMaterialGraphs': len(materials),
           'originalRawMeshesMaterialsActionsAllEightPosesNormalsBoundsEqualPrior': True,
           'sourceBounds': bounds, 'actualInteriorContacts': contacts,
           'bodyPairsPerPose': len(PAIRS), 'animationPoses': 8,
           'unchangedRuntimeFit': {'resolutionPx': [512, 512], 'nominalPixelsPerTile': 64,
                                  'pivotPx': [256, 256], 'cameraTargetTiles': [0, 0, 0]},
           'historicalReplayFit': {'SpriteRootScale': [.5, .5, .5], 'orthoScale': 8,
                                   'radius': 12, 'historicalProducer': '428cd89e48cdbb30c2b5dfda4476dec3a2e9cad0'}}
if '--render' in sys.argv:
    # Exact settings already recovered/replayed by audit-prisoner-source-camera.py.
    bpy.data.objects['SpriteRoot'].scale = (.5, .5, .5)
    for obj in scene.objects:
        if obj.type == 'LIGHT':
            obj.hide_render = True
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'Medium High Contrast'
    world = bpy.data.worlds.new('Historical Prisoner contact audit studio')
    scene.world = world
    world.use_nodes = True
    background = world.node_tree.nodes.get('Background')
    background.inputs['Color'].default_value = (.72, .77, .82, 1)
    background.inputs['Strength'].default_value = .7
    light_data = bpy.data.lights.new('Historical Prisoner contact audit light', 'AREA')
    light_data.energy = 600
    light_data.shape = 'DISK'
    light_data.size = 5
    light = bpy.data.objects.new('Historical Prisoner contact audit light', light_data)
    scene.collection.objects.link(light)
    light.location = (-3, -4, 7)
    camera_data = bpy.data.cameras.new('Historical Prisoner contact audit camera')
    camera = bpy.data.objects.new('Historical Prisoner contact audit camera', camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = 8
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    replay = []
    for yaw in (-135, -45, 45, 135):
        azimuth, pitch = math.radians(yaw), math.radians(45)
        camera.location = (12 * math.sin(azimuth), -12 * math.cos(azimuth), 12 * math.tan(pitch))
        camera.rotation_euler = (Vector((0, 0, 0)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
        path = OUTPUT / f'prisoner-yaw{yaw:+03d}-elev45.png'
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        encoder.normalize(path)
        replay.append({'yawDegrees': yaw, 'elevationDegrees': 45, 'file': path.name,
                       'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    receipt['fourActualHistoricalReplays'] = replay
if SOURCE.read_bytes() != original:
    raise ValueError('Released Prisoner source bytes changed during audit')
receipt['sourceBytesUnchanged'] = True
pipeline_common.write_text(OUTPUT / 'actual-source-contacts-and-fit.json', json.dumps(receipt, indent=2) + '\n')
print(f'PRISONER_CONTACTS_GREEN {len(names)} meshes/{len(materials)} full graphs/{len(contacts)} real contacts/8 poses/source unchanged', flush=True)
