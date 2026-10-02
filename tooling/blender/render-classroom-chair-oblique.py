"""Render the authored classroom chair variant at all angled camera poses."""
from __future__ import annotations

import hashlib
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
SOURCE = ROOT / "assets/source/blender/furniture.classroom.school-chair.blend"
OUTPUT = ROOT / "public/assets/environment/oblique"
PREVIEW = ROOT / "assets/intermediate/classroom-chair-preview"
MANIFEST = ROOT / "public/game-content/oblique-furniture.classroom-chair.v1.json"
ASSET_ID = "furniture.classroom.school-chair"
RESOLUTION_PX = 256
ORTHO_SCALE_TILES = 4.0
NOMINAL_PIXELS_PER_TILE = RESOLUTION_PX / ORTHO_SCALE_TILES
if not NOMINAL_PIXELS_PER_TILE.is_integer():
    raise ValueError("The authored camera must render an integral number of pixels per tile")
YAW = tuple(range(0, 360, 30))
ELEVATION = tuple(range(20, 80, 10))
TARGET = Vector((0.5, 0.5, 0.58))
PREVIEW_ONLY = "--preview" in sys.argv


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
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = RESOLUTION_PX
    scene.render.resolution_y = RESOLUTION_PX
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    camera_data = bpy.data.cameras.new("ClassroomChairCamera")
    camera = bpy.data.objects.new("ClassroomChairCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ORTHO_SCALE_TILES
    scene.camera = camera
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


def main() -> None:
    scene, camera = configure()
    poses = [(45, 45)] if PREVIEW_ONLY else [(yaw, elevation) for yaw in YAW for elevation in ELEVATION]
    target = PREVIEW if PREVIEW_ONLY else OUTPUT
    target.mkdir(parents=True, exist_ok=True)
    frames = []
    for yaw, elevation in poses:
        point_camera(camera, yaw, elevation)
        temp = target / f"classroom-chair-yaw{yaw:+03d}-elev{elevation}.render.png"
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        normalize_and_check_border(temp)
        digest = hashlib.sha256(temp.read_bytes()).hexdigest()
        if PREVIEW_ONLY:
            print(f"preview {temp} sha256 {digest}")
            continue
        name = f"furniture.classroom.school-chair-yaw{yaw:+03d}-elev{elevation:02d}.{digest[:12]}.png"
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
        "source": "assets/source/blender/furniture.classroom.school-chair.blend",
        "sourceSha256": hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
        "resolutionPx": [RESOLUTION_PX, RESOLUTION_PX],
        "nominalPixelsPerTile": int(NOMINAL_PIXELS_PER_TILE),
        "pivotPx": [128, 128],
        "cameraTargetTiles": [0.5, 0.5, 0.58],
        "projection": "orthographic",
        "yawDegrees": list(YAW),
        "elevationDegrees": list(ELEVATION),
        "frames": frames,
    }
    pipeline_common.write_text(MANIFEST, json.dumps(manifest, indent=2) + "\n")
    print(f"rendered {len(frames)} verified poses: {MANIFEST}")


if __name__ == "__main__":
    main()
