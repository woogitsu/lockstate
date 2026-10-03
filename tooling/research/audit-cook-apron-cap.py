"""Bounded real-source Cook apron/cap inspection. One original producer preview;
no full catalog matrix, publishing, actor rebuild or runtime changes.
Pinned Blender --background --threads 1 --python this-file -- [--preview]."""
from pathlib import Path
import hashlib
import importlib.util
import itertools
import json
import sys
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / 'tooling/blender'
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()

def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, HERE / filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

audit = load('cook_original_mesh_reader', 'refine-guard-belt-detail.py')
producer = load('cook_existing_role_producer', 'render-role-actors-oblique.py')
SOURCE = ROOT / 'assets/source/blender/actor.cook.base.blend'
SHA = '8ddb0c30fd183ec11574c386b7acfb0e8901307a21ebec357f1a51dcd6fa6a98'
OUTPUT = ROOT / 'assets/intermediate/cook-apron-cap-audit'
OUTPUT.mkdir(parents=True, exist_ok=True)
PAIRS = [('Apron chest bib', 'Jumpsuit torso'), ('Apron waistband', 'Jumpsuit hips'),
         ('Apron waistband', 'Flared apron cloth'),
         ('Chef cap folded band', 'Short textured hair'),
         ('Chef cap folded band', 'Compact chef cap crown'),
         ('Compact chef cap crown', 'Head'),
         ('Compact chef cap crown', 'Chef cap top teal stripe'),
         ('Compact chef cap crown', 'Chef cap top ochre patch')]
for side in (-1, 1):
    PAIRS += [(f'Apron shoulder strap.{side}', 'Apron chest bib'),
              (f'Apron shoulder strap.{side}', 'Jumpsuit torso'),
              (f'Apron back strap.{side}', 'Jumpsuit torso'),
              (f'Apron side tie.{side}', 'Jumpsuit hips')]

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':')).encode()).hexdigest()

def contacts(scene):
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    trees, bounds = {}, {}
    for name in sorted({part for pair in PAIRS for part in pair}):
        value = bpy.data.objects[name].evaluated_get(graph)
        mesh = value.to_mesh()
        try:
            vertices = [value.matrix_world @ vertex.co for vertex in mesh.vertices]
            trees[name] = BVHTree.FromPolygons(vertices, [tuple(p.vertices) for p in mesh.polygons], all_triangles=False)
            bounds[name] = ([min(point[axis] for point in vertices) for axis in range(3)],
                            [max(point[axis] for point in vertices) for axis in range(3)])
        finally:
            value.to_mesh_clear()
    direction = Vector((.937, .223, .181)).normalized()
    def inside(name, point):
        origin, crossings = point.copy(), 0
        for _ in range(100):
            hit, _, _, _ = trees[name].ray_cast(origin, direction, 100)
            if hit is None:
                return crossings % 2 == 1
            crossings += 1
            origin = hit + direction * 1e-5
        raise ValueError('Cook actual interior ray did not terminate')
    rows = []
    for a, b in PAIRS:
        low = [max(bounds[a][0][axis], bounds[b][0][axis]) for axis in range(3)]
        high = [min(bounds[a][1][axis], bounds[b][1][axis]) for axis in range(3)]
        witness = None
        if all(high[axis] - low[axis] > 1e-5 for axis in range(3)):
            for fractions in itertools.product((.5, .25, .75, .125, .875, .375, .625), repeat=3):
                point = Vector(tuple(low[axis] + (high[axis] - low[axis]) * fractions[axis] for axis in range(3)))
                if inside(a, point) and inside(b, point):
                    witness = point
                    break
        if witness is None:
            raise ValueError(f'Cook actual role contact disconnected: {a} / {b}')
        rows.append({'partA': a, 'partB': b, 'actualTriangleInteriorWitness': list(witness),
                     'aabbIntersectionDepth': [high[axis] - low[axis] for axis in range(3)]})
    return rows

original = SOURCE.read_bytes()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
scene.frame_set(1)
# Test evaluated geometry first so the real detached-cap control fails on the
# physical connection, rather than merely the changed .blend byte hash.
witnesses = contacts(scene)
if hashlib.sha256(original).hexdigest() != SHA:
    raise ValueError('Original Cook source identity changed')
names = sorted(obj.name for obj in scene.objects if obj.type == 'MESH')
raw = [audit.raw_record(bpy.data.objects[name]) for name in names]
materials = audit.materials_record()
actions = audit.animation_record()
poses = audit.pose_record(scene, names)
bounds = audit.bounds(scene)
receipt = {'source': SOURCE.relative_to(ROOT).as_posix(), 'sourceSHA256': SHA,
           'meshCount': len(names), 'meshNames': names, 'completeStoredMaterialGraphs': len(materials),
           'fullStoredGraphSHA256': digest(materials), 'rawMeshesModifiersParentsSHA256': digest(raw),
           'actionCurvesSHA256': digest(actions), 'allEightOriginalAnimationPosesSHA256': digest(poses),
           'sourceBounds': bounds, 'actualRoleContactsFrame1': witnesses,
           'unchangedCookProducerFit': {'resolutionPx': [512, 512], 'nominalPixelsPerTile': 64,
                                       'pivotPx': [256, 256], 'cameraTargetTiles': [0, 0, 0],
                                       'SpriteRootScale': list(bpy.data.objects['SpriteRoot'].scale),
                                       'orthoScale': producer.ORTHO_SCALE, 'originalSourceLightsRetained': True}}
if '--preview' in sys.argv:
    producer.PREVIEW_OUTPUT = OUTPUT
    producer.render('cook', True)
    scene = bpy.context.scene
    scene.frame_set(1)
    if [audit.raw_record(bpy.data.objects[name]) for name in names] != raw:
        raise ValueError('Existing Cook preview changed original meshes/modifiers/parents')
    if audit.materials_record() != materials or audit.animation_record() != actions or audit.pose_record(scene, names) != poses or audit.bounds(scene) != bounds:
        raise ValueError('Existing Cook preview changed graphs/actions/eight poses/bounds')
    preview = OUTPUT / 'actor-cook-yaw+45-elev45.png'
    receipt['oneOriginalProducerPreview'] = {'file': preview.name, 'sha256': hashlib.sha256(preview.read_bytes()).hexdigest()}
if SOURCE.read_bytes() != original:
    raise ValueError('Cook source changed during read-only inspection')
receipt['sourceBytesUnchanged'] = True
pipeline_common.write_text(OUTPUT / 'actual-cook-source-apron-cap.json', json.dumps(receipt, indent=2) + '\n')
print(f'COOK_ORIGINAL_GREEN {len(names)} meshes/{len(materials)} full graphs/{len(witnesses)} actual apron-cap contacts/eight poses unchanged', flush=True)
