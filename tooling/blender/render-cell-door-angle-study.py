"""Render an authored open cell door through the canonical nine camera poses."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import pipeline_common

spec = importlib.util.spec_from_file_location("cell_angle_study", SCRIPT_DIR / "render-interior-cell-angle-study.py")
angle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(angle)

CELL_SOURCE = ROOT / "assets/source/blender/interior-cell-angle-study.blend"
LEAF_SOURCE = ROOT / "assets/source/blender/door.interior.leaf.open.blend"
LEAF_ID = "door.interior.leaf.open"
SOURCE = ROOT / "assets/source/blender/cell-door-angle-study.blend"
OUTPUT = ROOT / "assets/rendered/cell-door-angle-study"
RESOLUTION = (1920, 1080)
ORTHO_SCALE = 30.0  # Blender scale is horizontal span: 1920 / 30 = 64 px/tile


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def aperture_samples(scene, pixels: bytes) -> dict:
    """Sample clear alpha through the middle of the 0.76-tile frame opening."""
    width, height = RESOLUTION
    positions = set()
    for sample in range(65):
        x = -0.32 + sample * 0.01  # exclude the ±0.38 jamb inner edges
        projected = world_to_camera_view(scene, scene.camera, Vector((x, 0, 1.20)))
        px = round(projected.x * width)
        py = round((1 - projected.y) * height)
        if projected.z <= 0 or not (0 <= px < width and 0 <= py < height):
            raise RuntimeError(f"Aperture point outside camera at {x}")
        positions.add((px, py))
    clear = sum(pixels[(py * width + px) * 4 + 3] < 16 for px, py in positions)
    return {"uniqueSamplePixels": len(positions), "clearSamplePixels": clear,
            "samplePositionsPx": [list(position) for position in sorted(positions)],
            "sampleHeightTiles": 1.20, "sampleXRangeTiles": [-0.32, 0.32]}


def render(scene, stem: str, leaf_objects: set, keep_frame: bool) -> dict:
    furnished_path = OUTPUT / f"{stem}.png"
    scene.render.filepath = str(furnished_path)
    bpy.ops.render.render(write_still=True)
    angle.stable_png(furnished_path)
    keep = set(leaf_objects)
    if keep_frame:
        keep.add(bpy.data.objects["south door frame"])
    hidden = {obj: obj.hide_render for obj in scene.objects
              if obj not in keep and obj.type in {"MESH", "EMPTY"}}
    for obj in hidden:
        obj.hide_render = True
    mask_path = OUTPUT / f"{stem}-aperture.png"
    scene.render.filepath = str(mask_path)
    bpy.ops.render.render(write_still=True)
    pixels = angle.stable_png(mask_path)
    for obj, original in hidden.items():
        obj.hide_render = original
    return {"furnishedImage": furnished_path.name,
            "furnishedSha256": digest(furnished_path),
            "apertureImage": mask_path.name,
            "apertureSha256": digest(mask_path),
            "aperture": aperture_samples(scene, pixels)}


def main():
    pipeline_common.require_blender_version()
    bpy.ops.wm.open_mainfile(filepath=str(CELL_SOURCE))
    scene = bpy.context.scene
    stand_in = bpy.data.objects.get("open door leaf stand-in")
    if stand_in is None:
        raise RuntimeError("Canonical cell scene lacks its removable door stand-in")
    bpy.data.objects.remove(stand_in, do_unlink=True)
    with bpy.data.libraries.load(str(LEAF_SOURCE), link=False) as (available, loaded):
        if LEAF_ID not in available.collections:
            raise RuntimeError(f"Authored door source lacks {LEAF_ID}")
        loaded.collections = [LEAF_ID]
    leaf = loaded.collections[0]
    scene.collection.children.link(leaf)
    scene.render.resolution_x, scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True
    scene.camera.data.ortho_scale = ORTHO_SCALE
    angle.set_camera(scene.camera, 0, 45)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))

    leaf_objects = set(leaf.all_objects)
    entries = []
    for yaw in angle.YAW_DEGREES:
        for elevation in angle.ELEVATION_DEGREES:
            angle.set_camera(scene.camera, yaw, elevation)
            stem = f"door-yaw{yaw:+03d}-elev{elevation:02d}"
            entry = {"yawDegrees": yaw, "elevationDegrees": elevation,
                     "cameraLocation": [round(value, 6) for value in scene.camera.location]}
            entry.update(render(scene, stem, leaf_objects, True))
            entries.append(entry)

    # One controlled comparison distinguishes an open doorway from a solid
    # wall and from the same doorway with its upper lintel cut away.
    angle.set_camera(scene.camera, 0, 45)
    frame = bpy.data.objects["south door frame"]
    full_frame = frame.instance_collection
    # Unused appended collections are purged when the canonical .blend is
    # saved, so fetch the cutaway frame from the authored wall source here.
    cutaway_id = "wall.interior.doorframe.cutaway"
    with bpy.data.libraries.load(str(angle.WALL_SOURCE), link=False) as (available, loaded):
        if cutaway_id not in available.collections:
            raise RuntimeError(f"Wall kit lacks {cutaway_id}")
        loaded.collections = [cutaway_id]
    frame.instance_collection = loaded.collections[0]
    # A high leaf beside a low cutaway frame reads as a floating plank. Hide
    # the open leaf together with the removed upper frame in this art option.
    hidden_leaf = {obj: obj.hide_render for obj in leaf_objects}
    for obj in hidden_leaf:
        obj.hide_render = True
    cutaway = render(scene, "door-yaw+00-elev45-frame-cutaway", set(), True)
    frame.instance_collection = bpy.data.collections["wall.interior.module.full"]
    solid = render(scene, "door-yaw+00-elev45-solid-wall", set(), True)
    for obj, original in hidden_leaf.items():
        obj.hide_render = original
    frame.instance_collection = full_frame

    manifest = {"schemaVersion": 1, "source": SOURCE.name,
                "cellSource": CELL_SOURCE.name, "cellSourceSha256": digest(CELL_SOURCE),
                "leafSource": LEAF_SOURCE.name, "leafSourceSha256": digest(LEAF_SOURCE),
                "wallSource": angle.WALL_SOURCE.name, "wallSourceSha256": digest(angle.WALL_SOURCE),
                "leafCollection": LEAF_ID, "frameCollection": full_frame.name,
                "resolution": list(RESOLUTION), "projection": "orthographic",
                "orthoScale": ORTHO_SCALE,
                "nominalPixelsPerTile": round(RESOLUTION[0] / ORTHO_SCALE, 3),
                "target": list(angle.TARGET),
                "lighting": {"type": "one area light", "location": [-4, -5, 9],
                             "energy": 900, "size": 5},
                "yawDegrees": list(angle.YAW_DEGREES),
                "elevationDegrees": list(angle.ELEVATION_DEGREES),
                "entries": entries,
                "comparison": {"yawDegrees": 0, "elevationDegrees": 45,
                               "fullFrameReference": "door-yaw+00-elev45.png",
                               "cutawayLeafHidden": True,
                               "cutawayFrame": cutaway, "solidWall": solid}}
    pipeline_common.write_text(OUTPUT / "manifest.json", json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
