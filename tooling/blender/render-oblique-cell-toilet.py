"""Render the authored toilet and sink fixture for the adjustable oblique camera.

The retained collection and physical additions are in the dedicated angled source. This script is
standalone so a render job can rebuild the 12-yaw by 6-angle grid without
importing a wall or door authoring script. The canonical registry is checked without rewriting it.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import bpy
from mathutils import Vector

SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import pipeline_common  # noqa: E402

ROOT = SCRIPT_DIR.parents[1]
CATALOG = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
SOURCE = ROOT / "assets/source/blender/fixture.cell.toilet_sink.angled-connection.blend"
PROVENANCE = SOURCE.with_suffix(".provenance.json")
OUTPUT = ROOT / "public/assets/environment/oblique"
PREVIEW_ONLY = '--preview' in sys.argv
if PREVIEW_ONLY:
    OUTPUT = ROOT / 'assets/intermediate/cell-toilet-angled-preview'
REGISTRY = ROOT / "public/game-content/oblique-module-registry.v1.json"
MANIFEST = ROOT / "public/game-content/oblique-cell-toilet.v1.json"
ASSET_ID = "fixture.cell.toilet_sink"
TARGET = Vector((.5, .5, .553750041872263))
YAW = tuple(-165 + index * 30 for index in range(12))
ELEVATION = (20, 30, 40, 50, 60, 70)


def strip_png_metadata(path: Path) -> None:
    """Keep only deterministic PNG chunks emitted by Blender."""
    source = path.read_bytes()
    if source[:8] != b"\x89PNG\r\n\x1a\n":
        raise RuntimeError(f"{path} is not a PNG")
    result = bytearray(source[:8])
    offset = 8
    while offset < len(source):
        size = struct.unpack(">I", source[offset:offset + 4])[0]
        kind = source[offset + 4:offset + 8]
        data = source[offset + 8:offset + 8 + size]
        if kind in (b"IHDR", b"sRGB", b"gAMA", b"cHRM", b"IDAT", b"IEND"):
            result += struct.pack(">I", size) + kind + data
            result += struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
        offset += 12 + size
    path.write_bytes(result)


def append_collection() -> bpy.types.Collection:
    provenance = json.loads(PROVENANCE.read_text())
    if hashlib.sha256(SOURCE.read_bytes()).hexdigest() != provenance['sourceSha256']:
        raise ValueError('Dedicated Cell toilet source bytes differ from provenance')
    registry = json.loads(REGISTRY.read_text())
    entry = next(row for row in registry['entries'] if row['assetId'] == ASSET_ID)
    if entry['manifest'] != '/game-content/' + MANIFEST.name:
        raise ValueError('Dedicated toilet exporter targets the wrong runtime descriptor')
    expected_names = [row['name'] for row in provenance['meshes']]
    with bpy.data.libraries.load(str(SOURCE), link=False) as (available, loaded):
        if sorted(available.objects) != sorted(expected_names):
            raise ValueError('Dedicated Cell toilet source object set changed')
        # Blender replaces this list's string items with Object references on
        # exit; keep the independent provenance names for post-load checks.
        loaded.objects = list(expected_names)
    collection = bpy.data.collections.new('Dedicated Cell toilet')
    bpy.context.scene.collection.children.link(collection)
    for obj in loaded.objects:
        collection.objects.link(obj)
    bpy.context.view_layer.update()
    if sorted(obj.name for obj in collection.objects if obj.type == 'MESH') != sorted(expected_names):
        raise ValueError('Dedicated Cell toilet loaded authored mesh set changed')
    if SOURCE.name == 'fixture.cell.toilet_sink.angled-connection.blend':
        spec = importlib.util.spec_from_file_location('cell_toilet_transfer_guard', SCRIPT_DIR / 'render-cell-toilet-flush-neck-oblique.py')
        guard = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(guard)
        guard.verify_loaded(bpy.context.scene)
    wheel = collection.objects['angled-toilet.shutoff valve wheel']
    normal_matrix = wheel.matrix_world.to_3x3().inverted().transposed()
    for polygon in wheel.data.polygons:
        point = wheel.matrix_world @ polygon.center
        dx, dz = point.x - .344, point.z - .405
        radius = math.hypot(dx, dz)
        expected_outer = Vector((dx - .058 * dx / radius, point.y + .372, dz - .058 * dz / radius))
        if (normal_matrix @ polygon.normal).dot(expected_outer) <= 0:
            raise ValueError('Loaded physical valve wheel surface normals face inward')
    helper_spec = importlib.util.spec_from_file_location('toilet_retained_audit', SCRIPT_DIR / 'refine-cell-toilet-angled.py')
    helper = importlib.util.module_from_spec(helper_spec)
    helper_spec.loader.exec_module(helper)
    graph = bpy.context.evaluated_depsgraph_get()
    centered = []
    for obj in sorted(collection.objects, key=lambda value: value.name):
        value = obj.evaluated_get(graph); mesh = value.to_mesh()
        try:
            vertices = [value.matrix_world @ vertex.co for vertex in mesh.vertices]
            row = {'name': obj.name, 'evaluatedVertices': len(vertices),
                   'evaluatedPositionSha256': hashlib.sha256(b''.join(struct.pack('<3f', *point) for point in vertices)).hexdigest()}
            if row != next(record for record in provenance['meshes'] if record['name'] == obj.name):
                raise ValueError('Dedicated Cell toilet evaluated mesh geometry changed')
            centered.extend(vertices)
        finally:
            value.to_mesh_clear()
    retained = [bpy.data.objects[row['name']] for row in provenance['retainedMeshes']]
    if [helper.raw_record(obj) for obj in retained] != provenance['retainedMeshes']:
        raise ValueError('Original nineteen toilet vertex/topology/material assignments changed')
    if [helper.material_record(bpy.data.materials[row['name']]) for row in provenance['retainedMaterialGraphs']] != provenance['retainedMaterialGraphs']:
        raise ValueError('Original eight toilet material graph bytes changed')
    # Dedicated source already bakes the accepted .8XY fit. Supply exactly one
    # min-corner translation; do not fit/scale the original assembly again.
    from mathutils import Matrix
    for obj in collection.objects:
        obj.matrix_world = Matrix.Translation((.5, .5, 0)) @ obj.matrix_world
    bpy.context.view_layer.update()
    points = [point for vertices in helper.evaluated(bpy.context.scene).values() for point in vertices]
    if len(points) != len(centered):
        raise ValueError('Dedicated loaded Cell toilet vertex set changed')
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    for axis in range(3):
        anchor = .5 if axis < 2 else 0
        if abs(minimum[axis] - provenance['minimum'][axis] - anchor) > 1e-6 or abs(maximum[axis] - provenance['maximum'][axis] - anchor) > 1e-6:
            raise ValueError('Dedicated loaded Cell toilet geometry or min-corner transform changed')
    for turns in range(4):
        for point in points:
            x, y = point.x - .5, point.y - .5
            for _ in range(turns): x, y = -y, x
            if not (0 <= x + .5 <= 1 and 0 <= y + .5 <= 1):
                raise ValueError('Dedicated Cell toilet escapes an occupied quarter turn')
    if abs(TARGET.z - (minimum[2] + maximum[2]) / 2) > 1e-6:
        raise ValueError('Dedicated Cell toilet target differs from measured height')
    print('CELL_TOILET_EVALUATED', len(expected_names), minimum, maximum, flush=True)
    return collection


def configure_lighting(scene: bpy.types.Scene) -> None:
    """Reuse the authored environment catalog's key, fill and ambient scheme."""
    world = bpy.data.worlds.new("Lockstate oblique toilet ambient")
    world.use_nodes = True
    background = world.node_tree.nodes.get("Background")
    if background is None:
        raise RuntimeError("world node tree has no Background node")
    background.inputs["Color"].default_value = (0.34, 0.37, 0.42, 1.0)
    background.inputs["Strength"].default_value = 0.55
    scene.world = world
    for name, energy, elevation, azimuth, angle in (
        ("Key", 3.6, 62.0, -40.0, 3.0),
        ("Fill", 1.15, 34.0, 150.0, 12.0),
    ):
        light = bpy.data.lights.new(name, "SUN")
        light.energy = energy
        light.angle = math.radians(angle)
        item = bpy.data.objects.new(name, light)
        item.rotation_euler = (math.radians(90.0 - elevation), 0.0, math.radians(azimuth))
        scene.collection.objects.link(item)


def setup_scene() -> bpy.types.Scene:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_raytracing = False
    scene.render.resolution_x = scene.render.resolution_y = 512
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.view_settings.view_transform = "AgX"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = 0.0
    scene.view_settings.gamma = 1.0
    configure_lighting(scene)
    camera_data = bpy.data.cameras.new("oblique toilet camera")
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 8.0
    camera = bpy.data.objects.new("oblique toilet camera", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene


def render_frames(scene: bpy.types.Scene) -> list[dict[str, object]]:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    frames: list[dict[str, object]] = []
    for yaw in ((45,) if PREVIEW_ONLY else YAW):
        for elevation in ((40,) if PREVIEW_ONLY else ELEVATION):
            point_camera(scene, yaw, elevation)
            stem = f"cell-toilet-yaw{yaw:+03d}-elev{elevation:02d}"
            staging = OUTPUT / f"{stem}.staging.png"
            scene.render.filepath = str(staging)
            bpy.ops.render.render(write_still=True)
            strip_png_metadata(staging)
            digest = hashlib.sha256(staging.read_bytes()).hexdigest()
            final = OUTPUT / f"{stem}.{digest[:12]}.png"
            staging.replace(final)
            frames.append({
                "yawDegrees": yaw,
                "elevationDegrees": elevation,
                "image": f"/assets/environment/oblique/{final.name}",
                "sha256": digest,
            })
    return frames


def point_camera(scene, yaw, elevation):
    camera = scene.camera
    azimuth = math.radians(yaw); tilt = math.radians(elevation)
    camera.location = TARGET + Vector((12 * math.sin(azimuth), -12 * math.cos(azimuth), 12 * math.tan(tilt)))
    camera.rotation_euler = (TARGET - camera.location).to_track_quat('-Z', 'Y').to_euler()
    # Read the actual camera transforms. Scale and basis are established from
    # world projection, not from a declared nominal descriptor value.
    if abs(scene.render.resolution_x / camera.data.ortho_scale - 64) > 1e-6:
        raise ValueError('Dedicated Cell toilet actual camera pitch differs from64ppt')
    offset = camera.location - TARGET
    expected = Vector((12 * math.sin(azimuth), -12 * math.cos(azimuth), 12 * math.tan(tilt)))
    if (offset - expected).length > 1e-5:
        raise ValueError('Dedicated Cell toilet camera ground basis differs from world projection')
    forward = camera.rotation_euler.to_quaternion() @ Vector((0, 0, -1))
    if forward.dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Dedicated Cell toilet camera does not face its declared target')


def main() -> None:
    pipeline_common.require_blender_version()
    CYCLES_PRODUCER = 'render-cell-toilet-cycles.py'
    if CYCLES_PRODUCER != 'render-cell-toilet-cycles.py':
        raise ValueError('Toilet canonical Cycles producer dispatch changed')
    spec = importlib.util.spec_from_file_location('toilet_actual_cycles_producer', SCRIPT_DIR / CYCLES_PRODUCER)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.main()
    return
    scene = setup_scene()
    collection = append_collection()
    if '--verify' in sys.argv:
        for yaw in YAW:
            for elevation in ELEVATION:
                point_camera(scene, yaw, elevation)
        print('CELL_TOILET_VERIFY72 actual cameras and four occupied orientations', flush=True)
        return
    frames = render_frames(scene)
    if PREVIEW_ONLY:
        print('CELL_TOILET_PREVIEW', frames[0]['image'], flush=True)
        return
    collection.hide_render = True
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    manifest = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "source": SOURCE.relative_to(ROOT).as_posix(),
        "sourceSha256": source_hash,
        "sourceDependencies": [],
        "resolutionPx": [512, 512],
        "nominalPixelsPerTile": 64,
        "pivotPx": [256, 256],
        "cameraTargetTiles": [.5, .5, .5537500381469727],
        "projection": "orthographic",
        "yawDegrees": list(YAW),
        "elevationDegrees": list(ELEVATION),
        "frames": frames,
    }
    pipeline_common.write_text(MANIFEST, json.dumps(manifest, indent=2) + "\n")




if __name__ == "__main__":
    main()
