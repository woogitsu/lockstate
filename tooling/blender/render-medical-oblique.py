import sys
from pathlib import Path
import hashlib
import json
import math
import os
import struct
import zlib

sys.path.insert(0, os.path.dirname(__file__))
import bpy
import pipeline_common

pipeline_common.require_blender_version()

REPO_ROOT = Path(__file__).resolve().parents[2]
OUTPUT_ROOT = Path(sys.argv[sys.argv.index("--") + 1]).resolve() if "--" in sys.argv else (REPO_ROOT / "public/assets/environment/oblique")
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

ASSETS = [
    ("furniture.medical-bed.variants", "furniture.medical-bed.variants.blend", (1, 2)),
    ("fixture.medicine-cabinet.variants", "fixture.medicine-cabinet.variants.blend", (1, 1)),
]
YAWS = list(range(0, 360, 30))
ELEVATIONS = list(range(20, 80, 10))


def png_chunk(kind, data):
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)


def normalize(path: Path) -> None:
    blob = path.read_bytes()
    offset = 8
    header = None
    compressed = b""
    metadata = []
    while offset < len(blob):
        length = struct.unpack(">I", blob[offset:offset + 4])[0]
        kind = blob[offset + 4:offset + 8]
        data = blob[offset + 8:offset + 8 + length]
        offset += 12 + length
        if kind == b"IHDR":
            header = data
        elif kind == b"IDAT":
            compressed += data
        elif kind in (b"sRGB", b"gAMA", b"cHRM", b"iCCP"):
            metadata.append((kind, data))
    if header is None:
        raise ValueError(f"missing IHDR in {path}")
    width, height, depth, color_type, compression, filter_method, interlace = struct.unpack(">IIBBBBB", header)
    if (depth, color_type, compression, filter_method, interlace) != (8, 6, 0, 0, 0):
        raise ValueError(f"unsupported PNG format in {path}")
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
        if filter_type == 1:
            for index in range(4, stride):
                row[index] = (row[index] + row[index - 4]) & 255
        elif filter_type == 2:
            for index in range(stride):
                row[index] = (row[index] + previous[index]) & 255
        elif filter_type == 3:
            for index in range(stride):
                left = row[index - 4] if index >= 4 else 0
                row[index] = (row[index] + ((left + previous[index]) >> 1)) & 255
        elif filter_type != 0:
            raise ValueError(f"unsupported PNG filter {filter_type}")
        rows.append(row)
        previous = row
    encoded = b"".join(b"\x00" + bytes(row) for row in rows)
    result = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", header)
    result += b"".join(png_chunk(kind, data) for kind, data in metadata)
    result += png_chunk(b"IDAT", zlib.compress(encoded, 9))
    result += png_chunk(b"IEND", b"")
    path.write_bytes(result)


def render(asset_id: str, source_file: str, footprint) -> list[dict]:
    source_path = REPO_ROOT / "assets/source/blender" / source_file
    bpy.ops.wm.open_mainfile(filepath=str(source_path))
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = 128
    scene.render.resolution_y = 128
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    camera_data = bpy.data.cameras.new("ObliqueCamera")
    camera = bpy.data.objects.new("ObliqueCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = max(footprint) * 1.35
    frames = []
    for yaw in YAWS:
        for elevation in ELEVATIONS:
            yaw_radians = math.radians(yaw)
            elevation_radians = math.radians(elevation)
            camera.location = (
                4 * math.cos(elevation_radians) * math.cos(yaw_radians),
                4 * math.cos(elevation_radians) * math.sin(yaw_radians),
                4 * math.sin(elevation_radians),
            )
            camera.rotation_euler = (math.pi / 2 - elevation_radians, 0, yaw_radians + math.pi / 2)
            output = OUTPUT_ROOT / f"{asset_id}-yaw{yaw:+03d}-elev{elevation:02d}.png"
            scene.render.filepath = str(output)
            bpy.ops.render.render(write_still=True)
            normalize(output)
            frames.append({
                "yawDegrees": yaw,
                "elevationDegrees": elevation,
                "image": "/assets/environment/oblique/" + output.name,
                "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
            })
    return frames


for asset_id, source_file, footprint in ASSETS:
    frames = render(asset_id, source_file, footprint)
    source_path = REPO_ROOT / "assets/source/blender" / source_file
    manifest = {
        "schemaVersion": 1,
        "assetId": asset_id,
        "source": "assets/source/blender/" + source_file,
        "sourceSha256": hashlib.sha256(source_path.read_bytes()).hexdigest(),
        "resolutionPx": [128, 128],
        "nominalPixelsPerTile": 64,
        "pivotPx": [64, 64],
        "cameraTargetTiles": [footprint[0] / 2, footprint[1] / 2, 0.5],
        "projection": "orthographic",
        "yawDegrees": YAWS,
        "elevationDegrees": ELEVATIONS,
        "frames": frames,
    }
    manifest_path = REPO_ROOT / "public/game-content" / f"oblique-{asset_id.replace('.variants', '')}.v1.json"
    pipeline_common.write_text(manifest_path, json.dumps(manifest, indent=2) + "\n")
