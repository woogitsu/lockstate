"""Render the authored Common Room bench variant at all angled camera poses."""
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

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "assets/source/blender/furniture.common-room.upholstered-bench.angled-detail.blend"
PROVENANCE = SOURCE.with_suffix('.provenance.json')
OUTPUT = ROOT / "public/assets/environment/oblique"
PREVIEW = ROOT / "assets/intermediate/common-room-bench-preview"
MANIFEST = ROOT / "public/game-content/oblique-furniture.common-room-bench.v1.json"
ASSET_ID = "furniture.common-room.upholstered-bench"
RESOLUTION_PX = 256
ORTHO_SCALE_TILES = 4.0
NOMINAL_PIXELS_PER_TILE = RESOLUTION_PX / ORTHO_SCALE_TILES
if not NOMINAL_PIXELS_PER_TILE.is_integer():
    raise ValueError("The authored camera must render an integral number of pixels per tile")
YAW = tuple(range(0, 360, 30))
ELEVATION = tuple(range(20, 80, 10))
TARGET = Vector((1.0, 0.5, 0.52))
PREVIEW_ONLY = "--preview" in sys.argv


def verify_source(scene: bpy.types.Scene) -> None:
    """Validate the actual saved assembly before the producer changes its scene."""
    spec = importlib.util.spec_from_file_location('common_room_full_source_guard', ROOT / 'tooling/blender/refine-guard-belt-detail.py')
    audit = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(audit)
    receipt = json.loads(PROVENANCE.read_text())
    if SOURCE.relative_to(ROOT).as_posix() != receipt['source']:
        raise ValueError('Common Room producer dispatch source changed')
    for path, digest in [('source', 'sourceSha256'), ('originalSource', 'originalSourceSha256')]:
        if hashlib.sha256((ROOT / receipt[path]).read_bytes()).hexdigest() != receipt[digest]:
            raise ValueError('Common Room original/dedicated source identity changed')
    registry = json.loads((ROOT / 'public/game-content/oblique-module-registry.v1.json').read_text())
    entry = next(row for row in registry['entries'] if row['assetId'] == ASSET_ID)
    if entry['manifest'] != '/game-content/' + MANIFEST.name:
        raise ValueError('Common Room canonical descriptor dispatch changed')
    rows = audit.capture(scene)
    if sorted(rows) != sorted(receipt['allAuthoredEvaluatedHashes']):
        raise ValueError('Common Room actual 35-part set changed')
    audit.actual_triangle_contacts(scene, receipt['actualContactTargets'])
    if [audit.raw_record(bpy.data.objects[name]) for name in sorted(rows)] != receipt['allAuthoredRawMeshes']:
        raise ValueError('Common Room actual raw geometry/material assignments/modifiers changed')
    if {name: rows[name]['evaluatedPositionSha256'] for name in sorted(rows)} != receipt['allAuthoredEvaluatedHashes']:
        raise ValueError('Common Room actual retained or riser placement changed')
    if {name: [list(row) for row in bpy.data.objects[name].matrix_world] for name in receipt['retainedObjectMatrices']} != receipt['retainedObjectMatrices']:
        raise ValueError('Common Room original object matrices changed')
    if audit.materials_record() != receipt['retainedMaterialValues']:
        raise ValueError('Common Room eight complete stored shader graphs changed')
    if audit.animation_record() != receipt['retainedActions']:
        raise ValueError('Common Room retained stored actions changed')
    if audit.normal_record(scene) != receipt['authoredEvaluatedNormals']:
        raise ValueError('Common Room actual evaluated normals changed')
    if audit.bounds(scene) != receipt['sourceEvaluatedBounds']:
        raise ValueError('Common Room full accepted source bounds changed')
    if RESOLUTION_PX != 256 or ORTHO_SCALE_TILES != 4.0 or (TARGET - Vector((1, .5, .52))).length > 1e-6:
        raise ValueError('Common Room accepted camera contract changed')
    for turns in range(4):
        width, height = (2, 1) if turns % 2 == 0 else (1, 2)
        for row in rows.values():
            for point in row['points']:
                x, y = point.x - 1, point.y - .5
                for _ in range(turns):
                    x, y = -y, x
                if not (0 <= x + width / 2 <= width and 0 <= y + height / 2 <= height and point.z >= -1e-6):
                    raise ValueError('Common Room actual occupied quarter-turn escapes')


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)


def normalize_and_check_border(path: Path) -> None:
    """Strip Blender's volatile Date/RenderTime chunks and pin PNG bytes.

    Blender 5.2 emits a fresh timestamp even when every rendered pixel is the
    same. The first two preview reruns had identical RGBA pixels but distinct
    SHA-256 values; a manifest hash would therefore not reproduce. Decode PNG
    filters and re-encode deterministic unfiltered rows after checking alpha.
    """
    blob = path.read_bytes()
    if not blob.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError(f"not a PNG: {path}")
    offset = 8
    header = None
    compressed = b""
    color_chunks = []
    while offset < len(blob):
        size = struct.unpack(">I", blob[offset:offset + 4])[0]
        kind = blob[offset + 4:offset + 8]
        data = blob[offset + 8:offset + 8 + size]
        offset += size + 12
        if kind == b"IHDR":
            header = data
        elif kind == b"IDAT":
            compressed += data
        elif kind in (b"sRGB", b"gAMA", b"cHRM", b"iCCP"):
            color_chunks.append((kind, data))
    if header is None:
        raise ValueError(f"PNG has no IHDR: {path}")
    width, height, depth, color, compression, filter_method, interlace = struct.unpack(">IIBBBBB", header)
    if (width, height, depth, color, compression, filter_method, interlace) != (256, 256, 8, 6, 0, 0, 0):
        raise ValueError(f"unexpected PNG geometry: {path}")
    raw = zlib.decompress(compressed)
    stride = width * 4
    rows = []
    position = 0
    previous = bytearray(stride)
    for _ in range(height):
        filter_type = raw[position]
        position += 1
        row = bytearray(raw[position:position + stride])
        position += stride
        for index in range(stride):
            left = row[index - 4] if index >= 4 else 0
            above = previous[index]
            corner = previous[index - 4] if index >= 4 else 0
            if filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = above
            elif filter_type == 3:
                predictor = (left + above) >> 1
            elif filter_type == 4:
                estimate = left + above - corner
                distances = (abs(estimate - left), abs(estimate - above), abs(estimate - corner))
                predictor = (left, above, corner)[distances.index(min(distances))]
            elif filter_type == 0:
                predictor = 0
            else:
                raise ValueError(f"unsupported PNG filter {filter_type}: {path}")
            row[index] = (row[index] + predictor) & 255
        rows.append(row)
        previous = row
    if any(rows[0][3::4]) or any(rows[-1][3::4]) or any(row[3] or row[-1] for row in rows):
        raise ValueError(f"model touches the transparent image border: {path}")
    encoded = b"".join(b"\x00" + bytes(row) for row in rows)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header)
        + b"".join(png_chunk(kind, data) for kind, data in color_chunks)
        + png_chunk(b"IDAT", zlib.compress(encoded, 9)) + png_chunk(b"IEND", b"")
    )


def configure() -> tuple[bpy.types.Scene, bpy.types.Object]:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Generate the authored .blend first: {SOURCE}")
    bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
    scene = bpy.context.scene
    verify_source(scene)
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = RESOLUTION_PX
    scene.render.resolution_y = RESOLUTION_PX
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    camera_data = bpy.data.cameras.new("CommonRoomModuleCamera")
    camera = bpy.data.objects.new("CommonRoomModuleCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ORTHO_SCALE_TILES
    scene.camera = camera
    if camera_data.type != 'ORTHO' or abs(camera_data.ortho_scale - 4) > 1e-6:
        raise ValueError('Common Room actual accepted camera span changed')
    if (scene.render.resolution_x, scene.render.resolution_y, scene.render.resolution_percentage) != (256, 256, 100):
        raise ValueError('Common Room actual accepted resolution changed')
    return scene, camera


def point_camera(camera: bpy.types.Object, yaw: int, elevation: int) -> None:
    azimuth = math.radians(yaw)
    tilt = math.radians(elevation)
    direction = Vector((
        6 * math.cos(tilt) * math.sin(azimuth),
        -6 * math.cos(tilt) * math.cos(azimuth),
        6 * math.sin(tilt),
    ))
    camera.location = TARGET + direction
    camera.rotation_euler = (TARGET - camera.location).to_track_quat("-Z", "Y").to_euler()


def verify_camera_pose(camera: bpy.types.Object, yaw: int, elevation: int) -> None:
    azimuth, tilt = math.radians(yaw), math.radians(elevation)
    expected = Vector((6 * math.cos(tilt) * math.sin(azimuth), -6 * math.cos(tilt) * math.cos(azimuth), 6 * math.sin(tilt)))
    offset = camera.location - TARGET
    if (offset - expected).length > 1e-5:
        raise ValueError('Common Room actual original camera basis changed')
    if (camera.rotation_euler.to_quaternion() @ Vector((0, 0, -1))).dot((-offset).normalized()) < 1 - 1e-6:
        raise ValueError('Common Room actual camera aim changed')


def main() -> None:
    scene, camera = configure()
    if '--verify' in sys.argv:
        for yaw in YAW:
            for elevation in ELEVATION:
                point_camera(camera, yaw, elevation)
                verify_camera_pose(camera, yaw, elevation)
        print('COMMON_ROOM35/8GRAPHS/4CONTACTS/72CAMERAS/4OCCUPIED_GREEN', flush=True)
        return
    poses = [(45, 45)] if PREVIEW_ONLY else [(yaw, elevation) for yaw in YAW for elevation in ELEVATION]
    target = PREVIEW if PREVIEW_ONLY else OUTPUT
    target.mkdir(parents=True, exist_ok=True)
    frames = []
    for yaw, elevation in poses:
        point_camera(camera, yaw, elevation)
        verify_camera_pose(camera, yaw, elevation)
        temp = target / f"common-room-bench-yaw{yaw:+03d}-elev{elevation}.render.png"
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        normalize_and_check_border(temp)
        digest = hashlib.sha256(temp.read_bytes()).hexdigest()
        if PREVIEW_ONLY:
            print(f"preview {temp} sha256 {digest}")
            continue
        name = f"furniture.common-room.upholstered-bench-yaw{yaw:+03d}-elev{elevation:02d}.{digest[:12]}.png"
        output = OUTPUT / name
        temp.replace(output)
        frames.append({
            "yawDegrees": yaw,
            "elevationDegrees": elevation,
            "image": f"/assets/environment/oblique/{name}",
            "sha256": digest,
        })
    if PREVIEW_ONLY:
        return
    manifest = {
        "schemaVersion": 1,
        "assetId": ASSET_ID,
        "source": SOURCE.relative_to(ROOT).as_posix(),
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "resolutionPx": [RESOLUTION_PX, RESOLUTION_PX],
        "nominalPixelsPerTile": int(NOMINAL_PIXELS_PER_TILE),
        "pivotPx": [128, 128],
        "cameraTargetTiles": [1.0, 0.5, 0.52],
        "projection": "orthographic",
        "yawDegrees": list(YAW),
        "elevationDegrees": list(ELEVATION),
        "frames": frames,
    }
    pipeline_common.write_text(MANIFEST, json.dumps(manifest, indent=2) + "\n")
    print(f"rendered {len(frames)} verified poses: {MANIFEST}")


if __name__ == "__main__":
    CYCLES_PRODUCER = 'render-common-room-cycles.py'
    if CYCLES_PRODUCER != 'render-common-room-cycles.py':
        raise ValueError('Common Room canonical Cycles producer dispatch changed')
    spec = importlib.util.spec_from_file_location('common_room_actual_cycles_producer', Path(__file__).with_name(CYCLES_PRODUCER))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.main()
