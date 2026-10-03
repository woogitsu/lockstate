"""Square-align the three existing Kitchen Blender fixtures and render 72 poses each."""
from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
import zlib
from pathlib import Path

import bpy
from mathutils import Matrix, Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "public/assets/environment/oblique"
PREVIEW = ROOT / "assets/intermediate/kitchen-fixtures-preview"
RESOLUTION_PX = 256
ORTHO_SCALE_TILES = 4.0
NOMINAL_PIXELS_PER_TILE = RESOLUTION_PX / ORTHO_SCALE_TILES
if not NOMINAL_PIXELS_PER_TILE.is_integer():
    raise ValueError("The authored camera must render an integral number of pixels per tile")
YAW = tuple(range(0, 360, 30))
ELEVATION = tuple(range(20, 80, 10))
PREVIEW_ONLY = "--preview" in sys.argv
MODELS = (
    # id, source basename, manifest basename, width, height, x scale, y scale, camera target height
    ("furniture.kitchen.stove.variants", "furniture.kitchen.stove.soft-light.blend", "oblique-furniture.kitchen-stove.v1.json", 2, 1, 1.0, 1.0, 1.1230000257492065),
    ("furniture.kitchen.prep-counter.variants", "furniture.kitchen.prep-counter.angled.blend", "oblique-furniture.kitchen-prep-counter.v1.json", 2, 1, 1.0, 1.0, 0.8100000619888306),
    ("furniture.kitchen.fridge.variants", "furniture.kitchen.fridge.soft-light.blend", "oblique-furniture.kitchen-fridge.v1.json", 1, 1, 1.0, 1.0, 1.1999999284744263),
)


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


def configure(model: tuple, prepare_source=None) -> tuple[bpy.types.Scene, bpy.types.Object, Vector]:
    if prepare_source is None and model[0] == "furniture.kitchen.stove.variants" and model[1] == "furniture.kitchen.stove.soft-light.blend":
        import importlib.util
        soft_spec = importlib.util.spec_from_file_location("stove_retained_soft_dispatch", Path(__file__).with_name("render-kitchen-stove-cycles.py"))
        soft = importlib.util.module_from_spec(soft_spec); soft_spec.loader.exec_module(soft)
        scene, camera = soft.configure()
        return scene, camera, soft.TARGET
    if prepare_source is None and model[0] == "furniture.kitchen.stove.variants" and model[1] == "furniture.kitchen.stove.angled-detail.blend":
        import importlib.util
        detail_spec = importlib.util.spec_from_file_location("stove_physical_detail_dispatch", Path(__file__).with_name("render-kitchen-stove-detail-oblique.py"))
        detail = importlib.util.module_from_spec(detail_spec); detail_spec.loader.exec_module(detail)
        return detail.configure(model)
    if prepare_source is None and model[0] == "furniture.kitchen.fridge.variants" and model[1] == "furniture.kitchen.fridge.soft-light.blend":
        import importlib.util
        soft_spec = importlib.util.spec_from_file_location("fridge_retained_soft_dispatch", Path(__file__).with_name("render-kitchen-fridge-cycles.py"))
        soft = importlib.util.module_from_spec(soft_spec); soft_spec.loader.exec_module(soft)
        scene, camera = soft.configure()
        return scene, camera, soft.TARGET
    if prepare_source is None and model[0] == "furniture.kitchen.fridge.variants" and model[1] == "furniture.kitchen.fridge.angled-detail.blend":
        import importlib.util
        detail_spec = importlib.util.spec_from_file_location("fridge_physical_detail_dispatch", Path(__file__).with_name("render-kitchen-fridge-detail-oblique.py"))
        detail = importlib.util.module_from_spec(detail_spec); detail_spec.loader.exec_module(detail)
        return detail.configure(model)
    asset_id, source_name, _, width, height, scale_x, scale_y, target_z = model
    source = ROOT / "assets/source/blender" / source_name
    if not source.is_file():
        raise FileNotFoundError(f"Existing authored .blend is absent: {source}")
    bpy.ops.wm.open_mainfile(filepath=str(source))
    scene = bpy.context.scene
    if prepare_source is not None:
        prepare_source(scene, model)
    # The saved source is centred around (0,0); production world placement
    # uses the minimum corner of the authoritative 2x1 or 1x1 footprint.
    # Apply ONE world transform to positions and meshes, then verify every
    # evaluated bound. Camera target changes alone cancel during projection.
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    transform = Matrix.Translation(Vector((width / 2, height / 2, 0))) @ Matrix.Diagonal((scale_x, scale_y, 1, 1))
    for obj in meshes:
        obj.matrix_world = transform @ obj.matrix_world
    bpy.context.view_layer.update()
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    if not (0 <= minimum[0] <= maximum[0] <= width and 0 <= minimum[1] <= maximum[1] <= height):
        raise ValueError(f"{asset_id} escapes its {width} x {height} occupied footprint: {minimum} to {maximum}")
    print(f"KITCHEN_BOUNDS {asset_id} {minimum} {maximum}")
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.render.resolution_x = RESOLUTION_PX
    scene.render.resolution_y = RESOLUTION_PX
    scene.render.resolution_percentage = 100
    pipeline_common.apply_deterministic_render_settings(scene)
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    camera_data = bpy.data.cameras.new("KitchenFixtureCamera")
    camera = bpy.data.objects.new("KitchenFixtureCamera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = ORTHO_SCALE_TILES
    scene.camera = camera
    return scene, camera, Vector((width / 2, height / 2, target_z))


def point_camera(camera: bpy.types.Object, target: Vector, yaw: int, elevation: int) -> None:
    azimuth = math.radians(yaw)
    tilt = math.radians(elevation)
    direction = Vector((
        6 * math.cos(tilt) * math.sin(azimuth),
        -6 * math.cos(tilt) * math.cos(azimuth),
        6 * math.sin(tilt),
    ))
    camera.location = target + direction
    camera.rotation_euler = (target - camera.location).to_track_quat("-Z", "Y").to_euler()


def main() -> None:
    poses = [(45, 45)] if PREVIEW_ONLY else [(yaw, elevation) for yaw in YAW for elevation in ELEVATION]
    image_dir = PREVIEW if PREVIEW_ONLY else OUTPUT
    image_dir.mkdir(parents=True, exist_ok=True)
    for model in MODELS:
        asset_id, source_name, manifest_name, width, height, _, _, target_z = model
        scene, camera, target = configure(model)
        frames = []
        for yaw, elevation in poses:
            point_camera(camera, target, yaw, elevation)
            temp = image_dir / f"{asset_id}-yaw{yaw:+03d}-elev{elevation}.render.png"
            scene.render.filepath = str(temp)
            bpy.ops.render.render(write_still=True)
            normalize_and_check_border(temp)
            digest = hashlib.sha256(temp.read_bytes()).hexdigest()
            if PREVIEW_ONLY:
                print(f"preview {temp} sha256 {digest}")
                continue
            name = f"{asset_id}-yaw{yaw:+03d}-elev{elevation:02d}.{digest[:12]}.png"
            output = OUTPUT / name
            temp.replace(output)
            frames.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                           "image": f"/assets/environment/oblique/{name}", "sha256": digest})
        if PREVIEW_ONLY:
            continue
        manifest = {
            "schemaVersion": 1, "assetId": asset_id,
            "source": f"assets/source/blender/{source_name}",
            "sourceSha256": hashlib.sha256((ROOT / "assets/source/blender" / source_name).read_bytes()).hexdigest(),
            "resolutionPx": [RESOLUTION_PX, RESOLUTION_PX],
            "nominalPixelsPerTile": int(NOMINAL_PIXELS_PER_TILE),
            "pivotPx": [RESOLUTION_PX // 2, RESOLUTION_PX // 2],
            "cameraTargetTiles": [width / 2, height / 2, target_z],
            "projection": "orthographic", "yawDegrees": list(YAW),
            "elevationDegrees": list(ELEVATION), "frames": frames,
        }
        manifest_path = ROOT / "public/game-content" / manifest_name
        pipeline_common.write_text(manifest_path, json.dumps(manifest, indent=2) + "\n")
        print(f"rendered {len(frames)} verified poses: {manifest_path}")


if __name__ == "__main__":
    main()
