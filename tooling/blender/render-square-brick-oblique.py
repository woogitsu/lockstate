"""Render deterministic 72-pose full/cutaway square brick wall catalogs."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import pipeline_common
from mathutils import Vector

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'public/assets/environment/oblique'
OUTPUT.mkdir(parents=True, exist_ok=True)
YAWS = list(range(-180, 180, 15))
ELEVATIONS = [25, 45, 65]
RESOLUTION_PX = 512
PIXELS_PER_TILE = 64
CAMERA_TARGET = (0.5, 0.5, 0.0)


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)


def normalize(path: Path) -> None:
    """Remove Blender metadata and encode stable unfiltered rows, rejecting clipped silhouettes."""
    blob = path.read_bytes()
    offset = 8
    header = None
    compressed = b''
    metadata = []
    while offset < len(blob):
        size = struct.unpack('>I', blob[offset:offset + 4])[0]
        kind = blob[offset + 4:offset + 8]
        data = blob[offset + 8:offset + 8 + size]
        offset += size + 12
        if kind == b'IHDR':
            header = data
        elif kind == b'IDAT':
            compressed += data
        elif kind in (b'sRGB', b'gAMA', b'cHRM', b'iCCP'):
            metadata.append((kind, data))
    if header is None:
        raise ValueError(f'no PNG header: {path}')
    width, height, depth, color, compression, filter_method, interlace = struct.unpack('>IIBBBBB', header)
    if (depth, color, compression, filter_method, interlace) != (8, 6, 0, 0, 0):
        raise ValueError(f'unsupported PNG format: {path}')
    raw = zlib.decompress(compressed)
    stride = width * 4
    rows = []
    previous = bytearray(stride)
    position = 0
    for _ in range(height):
        filter_type = raw[position]
        position += 1
        row = bytearray(raw[position:position + stride])
        position += stride
        if filter_type == 1:
            for i in range(4, stride): row[i] = (row[i] + row[i - 4]) & 255
        elif filter_type == 2:
            for i in range(stride): row[i] = (row[i] + previous[i]) & 255
        elif filter_type == 3:
            for i in range(stride): row[i] = (row[i] + (((row[i - 4] if i >= 4 else 0) + previous[i]) >> 1)) & 255
        elif filter_type == 4:
            for i in range(stride):
                a = row[i - 4] if i >= 4 else 0
                b = previous[i]
                c = previous[i - 4] if i >= 4 else 0
                predictor = a + b - c
                pa, pb, pc = abs(predictor - a), abs(predictor - b), abs(predictor - c)
                row[i] = (row[i] + (a if pa <= pb and pa <= pc else (b if pb <= pc else c))) & 255
        elif filter_type != 0:
            raise ValueError(f'unsupported PNG filter {filter_type}: {path}')
        rows.append(row)
        previous = row
    if any(rows[0][3::4]) or any(rows[-1][3::4]) or any(row[3] or row[-1] for row in rows):
        raise ValueError(f'wall touches render border: {path}')
    encoded = b''.join(b'\x00' + bytes(row) for row in rows)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
                     + b''.join(chunk(kind, data) for kind, data in metadata)
                     + chunk(b'IDAT', zlib.compress(encoded, 9)) + chunk(b'IEND', b''))


def prepare_scene(kind: str):
    """Convert centred authoring to the logical occupied tile in memory only."""
    asset_id = f'wall.square.brick.{kind}'
    source = ROOT / f'assets/source/blender/{asset_id}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    # Original sources occupy [-.5,.5] on both ground axes. Placement addresses
    # the tile's minimum corner, so export geometry occupies [0,1] instead.
    # The camera translates equally; its pixel pivot remains the ground centre.
    for obj in scene.objects:
        if obj.type == 'MESH':
            obj.location += Vector((0.5, 0.5, 0.0))
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.render.resolution_x = scene.render.resolution_y = RESOLUTION_PX
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.studio_light = 'paint.sl'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = True
    camera_data = bpy.data.cameras.new('ObliqueCamera')
    camera = bpy.data.objects.new('ObliqueCamera', camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = 'ORTHO'
    camera_data.ortho_scale = RESOLUTION_PX / PIXELS_PER_TILE
    return scene, camera, source


def pose_camera(camera, yaw: int, elevation: int) -> None:
    yaw_radians = math.radians(yaw)
    elevation_radians = math.radians(elevation)
    camera.location = (CAMERA_TARGET[0] + 4 * math.cos(elevation_radians) * math.cos(yaw_radians),
                       CAMERA_TARGET[1] + 4 * math.cos(elevation_radians) * math.sin(yaw_radians),
                       CAMERA_TARGET[2] + 4 * math.sin(elevation_radians))
    camera.rotation_euler = (math.pi / 2 - elevation_radians, 0, yaw_radians + math.pi / 2)


def render(kind: str) -> None:
    # The accepted full ID consumes its retained approved-material shader scene.
    # Keep the historical prepare_scene available for genuine before evidence;
    # cutaway continues through its existing untouched Workbench producer.
    if kind == 'full':
        spec = importlib.util.spec_from_file_location('square_wall_retained_cycles', Path(__file__).resolve().parent / 'render-square-wall-retained-cycles.py')
        modern = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(modern)
        if '--verify-only' in sys.argv:
            modern.configure()
        else:
            modern.render_full()
        return
    if '--verify-only' in sys.argv:
        prepare_scene(kind)
        print('retained low wall historical producer source opened')
        return
    asset_id = f'wall.square.brick.{kind}'
    scene, camera, source = prepare_scene(kind)
    frames = []
    for yaw in YAWS:
        for elevation in ELEVATIONS:
            pose_camera(camera, yaw, elevation)
            temporary = OUTPUT / f'square-brick-{kind}-wall-yaw{yaw:+04d}-elev{elevation}.render.png'
            scene.render.filepath = str(temporary)
            bpy.ops.render.render(write_still=True)
            normalize(temporary)
            digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
            image = OUTPUT / f'square-brick-{kind}-wall-yaw{yaw:+04d}-elev{elevation}.{digest[:12]}.png'
            temporary.replace(image)
            frames.append({'yawDegrees': yaw, 'elevationDegrees': elevation,
                           'image': '/assets/environment/oblique/' + image.name, 'sha256': digest})
    manifest = {'schemaVersion': 1, 'assetId': asset_id, 'source': source.name,
                'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                'sourceDependencies': [], 'resolutionPx': [RESOLUTION_PX, RESOLUTION_PX],
                'nominalPixelsPerTile': PIXELS_PER_TILE, 'pivotPx': [RESOLUTION_PX / 2, RESOLUTION_PX / 2],
                'cameraTargetTiles': list(CAMERA_TARGET), 'projection': 'orthographic',
                'yawDegrees': YAWS, 'elevationDegrees': ELEVATIONS, 'frames': frames}
    path = ROOT / f'public/game-content/oblique-square-brick-{kind}-wall.v1.json'
    pipeline_common.write_text(path, json.dumps(manifest, indent=2) + '\n')
    print('rendered', asset_id, len(frames), path)


if __name__ == '__main__':
    render('full')
    render('low')
