"""Render the existing cook, medic and staff Blender actors for the oblique view.

The source rigs and packed fabrics are shared with the eight-direction atlas.
This exporter changes only the camera; it does not rebuild or duplicate actors.
Run with Blender in background mode. Pass ``-- --preview`` to render only one
pose per role into ignored intermediate files before publishing the catalog.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import bpy

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/environment/oblique"
PREVIEW_OUTPUT = ROOT / "assets/intermediate/actor-oblique-preview"
ROLES = {
    "cook": ("actor.cook.base", ("Apron chest bib", "Compact chef cap crown")),
    "medic": ("actor.medic.base", ("Medical kit case", "Medical cap red cross vertical")),
    "staff": ("actor.staff.base", ("Blue shoulder yoke", "Staff canvas tool pouch")),
}
YAWS = list(range(-180, 180, 15))
ELEVATIONS = [25, 45, 65]
RESOLUTION = 512
ORTHO_SCALE = 15.5


def options():
    separator = sys.argv.index("--") if "--" in sys.argv else len(sys.argv)
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset-id", choices=sorted(ROLES), help="render one role; default: all three")
    parser.add_argument("--preview", action="store_true", help="render only yaw 45/elevation 45")
    return parser.parse_args(sys.argv[separator + 1:])


def chunk(kind: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)


def normalize(path: Path) -> None:
    """Strip volatile Blender PNG metadata and reject every clipped silhouette."""
    blob = path.read_bytes()
    offset = 8
    header = None
    compressed = b""
    metadata = []
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
            metadata.append((kind, data))
    if header is None:
        raise ValueError(f"missing PNG header: {path}")
    width, height, depth, color, compression, filter_method, interlace = struct.unpack(">IIBBBBB", header)
    if (width, height, depth, color, compression, filter_method, interlace) != (RESOLUTION, RESOLUTION, 8, 6, 0, 0, 0):
        raise ValueError(f"unexpected PNG format: {path}")
    raw = zlib.decompress(compressed)
    stride = width * 4
    position = 0
    rows = []
    previous = bytearray(stride)
    for _ in range(height):
        filter_type = raw[position]
        position += 1
        row = bytearray(raw[position:position + stride])
        position += stride
        for i in range(stride):
            left = row[i - 4] if i >= 4 else 0
            above = previous[i]
            corner = previous[i - 4] if i >= 4 else 0
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
            row[i] = (row[i] + predictor) & 255
        rows.append(row)
        previous = row
    if any(rows[0][3::4]) or any(rows[-1][3::4]) or any(row[3] or row[-1] for row in rows):
        raise ValueError(f"actor touches render border: {path}")
    encoded = b"".join(b"\x00" + bytes(row) for row in rows)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header)
                     + b"".join(chunk(kind, data) for kind, data in metadata)
                     + chunk(b"IDAT", zlib.compress(encoded, 9)) + chunk(b"IEND", b""))


def render(role: str, preview: bool) -> None:
    asset_id, role_markers = ROLES[role]
    source = ROOT / "assets/source/blender" / f"{asset_id}.blend"
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    if bpy.data.objects.get("SpriteRoot") is None or bpy.data.objects.get("SpriteTarget") is None:
        raise ValueError(f"source actor rig missing in {source}")
    for marker in role_markers:
        if bpy.data.objects.get(marker) is None:
            raise ValueError(f"role-defining model detail {marker!r} missing in {source}")
    for image in bpy.data.images:
        if image.source == "FILE" and image.packed_file is None:
            raise ValueError(f"unpacked texture {image.name} in {source}")
    scene.frame_set(1)
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    camera_data = bpy.data.cameras.new("ObliqueActorCamera")
    camera = bpy.data.objects.new("ObliqueActorCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    scene.camera = camera
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ORTHO_SCALE
    target = PREVIEW_OUTPUT if preview else OUTPUT
    target.mkdir(parents=True, exist_ok=True)
    poses = [(45, 45)] if preview else [(yaw, elevation) for yaw in YAWS for elevation in ELEVATIONS]
    frames = []
    for yaw, elevation in poses:
        yaw_radians = math.radians(yaw)
        elevation_radians = math.radians(elevation)
        # The existing guard/prisoner actor catalog calls a view down the
        # actor's local -Y front yaw 0. Square-wall export instead starts at
        # +X; reusing that basis made these roles turn 90 degrees in game.
        camera_azimuth = yaw_radians - math.pi / 2
        camera.location = (8 * math.cos(elevation_radians) * math.cos(camera_azimuth),
                           8 * math.cos(elevation_radians) * math.sin(camera_azimuth),
                           8 * math.sin(elevation_radians))
        camera.rotation_euler = (math.pi / 2 - elevation_radians, 0, camera_azimuth + math.pi / 2)
        temporary = target / f"actor-{role}-yaw{yaw:+03d}-elev{elevation}.render.png"
        scene.render.filepath = str(temporary)
        bpy.ops.render.render(write_still=True)
        normalize(temporary)
        if preview:
            image = target / f"actor-{role}-yaw{yaw:+03d}-elev{elevation}.png"
        else:
            digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
            image = target / f"actor-{role}-yaw{yaw:+03d}-elev{elevation}.{digest[:12]}.png"
            frames.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                           "image": "/assets/environment/oblique/" + image.name, "sha256": digest})
        temporary.replace(image)
    if preview:
        print("preview", asset_id, target)
        return
    manifest = {"schemaVersion": 1, "assetId": asset_id, "source": source.name,
                "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
                "resolutionPx": [RESOLUTION, RESOLUTION], "nominalPixelsPerTile": 64,
                "pivotPx": [256, 256], "cameraTargetTiles": [0, 0, 0],
                "projection": "orthographic", "yawDegrees": YAWS,
                "elevationDegrees": ELEVATIONS, "frames": frames}
    manifest_path = ROOT / "public/game-content" / f"oblique-actor-{role}.v1.json"
    pipeline_common.write_text(manifest_path, json.dumps(manifest, indent=2) + "\n")
    print("rendered", asset_id, len(frames), manifest_path)


def main() -> None:
    pipeline_common.require_blender_version()
    args = options()
    for role in ([args.asset_id] if args.asset_id else ROLES):
        render(role, args.preview)


if __name__ == "__main__":
    main()
