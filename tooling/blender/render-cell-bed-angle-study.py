"""Study the shipped Blender cell bed in the canonical 3x3 cell camera grid.

The source cell, camera target, light and angle grid come from the canonical
scene. Blender's orthographic scale is the horizontal world span, so 1920px
at scale 30 gives the game's nominal 64 px per tile. Run using Blender 5.2.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[2]
SCRIPT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPT_DIR))
import pipeline_common

spec = importlib.util.spec_from_file_location("cell_angle_study", SCRIPT_DIR / "render-interior-cell-angle-study.py")
angle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(angle)

CELL_SOURCE = ROOT / "assets/source/blender/interior-cell-angle-study.blend"
CATALOG_SOURCE = ROOT / "assets/source/blender/environment.mvp.catalog.blend"
BED_ID = "furniture.cell.bed.single.variants"
SOURCE = ROOT / "assets/source/blender/cell-bed-angle-study.blend"
OUTPUT = ROOT / "assets/rendered/cell-bed-angle-study"
RESOLUTION = (1920, 1080)
ORTHO_SCALE = 30.0


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def silhouette(pixels: bytes, width: int, height: int) -> dict:
    xs, ys = [], []
    for index in range(3, len(pixels), 4):
        if pixels[index] > 0:
            pixel_index = index // 4
            xs.append(pixel_index % width)
            ys.append(pixel_index // width)
    if not xs:
        raise RuntimeError("Bed has no visible silhouette pixels")
    return {"opaquePixelCount": len(xs),
            "boundsPx": [min(xs), min(ys), max(xs) + 1, max(ys) + 1],
            "widthPx": max(xs) - min(xs) + 1,
            "heightPx": max(ys) - min(ys) + 1}


def visible_blanket_pixels(scene_pixels: bytes, silhouette_pixels: bytes) -> int:
    """Count the orange bed blanket only within the bed's projected footprint."""
    count = 0
    for index in range(0, len(scene_pixels), 4):
        red, green, blue = scene_pixels[index:index + 3]
        if (silhouette_pixels[index + 3] > 0 and red > 105 and
                red > green * 1.45 and green > 35 and blue < green * 0.9):
            count += 1
    return count


def main():
    pipeline_common.require_blender_version()
    if not CELL_SOURCE.is_file() or not CATALOG_SOURCE.is_file():
        raise FileNotFoundError("Canonical cell and environment catalog .blend sources are required")
    bpy.ops.wm.open_mainfile(filepath=str(CELL_SOURCE))
    scene = bpy.context.scene
    for name in ("bed steel frame", "bed blanket", "bed pillow"):
        obj = bpy.data.objects.get(name)
        if obj is None:
            raise RuntimeError(f"Canonical scene lacks stand-in {name}")
        bpy.data.objects.remove(obj, do_unlink=True)

    with bpy.data.libraries.load(str(CATALOG_SOURCE), link=False) as (available, loaded):
        if BED_ID not in available.collections:
            raise RuntimeError(f"Catalog lacks {BED_ID}")
        loaded.collections = [BED_ID]
    bed = loaded.collections[0]
    scene.collection.children.link(bed)
    origin = next((obj for obj in bed.all_objects if obj.name == BED_ID + ".origin"), None)
    if origin is None:
        raise RuntimeError("Cell bed lacks bottom-center origin")
    origin.location = (1.0, 2.1, 0.0)
    bpy.context.view_layer.update()

    scene.render.resolution_x, scene.render.resolution_y = RESOLUTION
    scene.render.resolution_percentage = 100
    scene.camera.data.ortho_scale = ORTHO_SCALE
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = True  # same alpha backdrop as the canonical scene
    angle.set_camera(scene.camera, 0, 45)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE))

    bed_objects = set(bed.all_objects)
    entries = []
    low_east_pixels = None
    low_east_mask_pixels = None
    for yaw in angle.YAW_DEGREES:
        for elevation in angle.ELEVATION_DEGREES:
            angle.set_camera(scene.camera, yaw, elevation)
            stem = f"bed-yaw{yaw:+03d}-elev{elevation:02d}"
            furnished_path = OUTPUT / f"{stem}.png"
            scene.render.filepath = str(furnished_path)
            bpy.ops.render.render(write_still=True)
            furnished_pixels = angle.stable_png(furnished_path)

            # The second pass measures the actual rendered bed silhouette,
            # without the walls/floor/actor contributing any opaque pixels.
            hidden = {obj: obj.hide_render for obj in scene.objects
                      if obj not in bed_objects and obj.type in {"MESH", "EMPTY"}}
            for obj in hidden:
                obj.hide_render = True
            mask_path = OUTPUT / f"{stem}-silhouette.png"
            scene.render.filepath = str(mask_path)
            bpy.ops.render.render(write_still=True)
            pixels = angle.stable_png(mask_path)
            if (yaw, elevation) == (45, 25):
                low_east_pixels = furnished_pixels
                low_east_mask_pixels = pixels
            for obj, original in hidden.items():
                obj.hide_render = original

            entries.append({"yawDegrees": yaw, "elevationDegrees": elevation,
                            "furnishedImage": furnished_path.name,
                            "furnishedSha256": digest(furnished_path),
                            "silhouetteImage": mask_path.name,
                            "silhouetteSha256": digest(mask_path),
                            "silhouette": silhouette(pixels, *RESOLUTION),
                            "cameraLocation": [round(value, 6) for value in scene.camera.location]})

    # The east wall, rather than the bed geometry, hides most of the mattress
    # at the sampled low eastern view. Keep the nine fixed-geometry images as
    # the control and render one authored cutaway alternative at the same pose.
    outer_cutaway_id = "wall.interior.corner.outer.cutaway"
    with bpy.data.libraries.load(str(angle.WALL_SOURCE), link=False) as (available, loaded):
        if outer_cutaway_id not in available.collections:
            raise RuntimeError(f"Wall kit lacks {outer_cutaway_id}")
        loaded.collections = [outer_cutaway_id]
    outer_cutaway = loaded.collections[0]
    straight_cutaway = bpy.data.collections["wall.interior.module.cutaway"]
    changed = []
    for obj in scene.objects:
        if obj.name.startswith("east wall "):
            obj.instance_collection = straight_cutaway
            changed.append({"name": obj.name, "assetId": straight_cutaway.name})
        elif obj.name == "north-east corner":
            obj.instance_collection = outer_cutaway
            changed.append({"name": obj.name, "assetId": outer_cutaway.name})
    if len(changed) != 4:
        raise RuntimeError(f"Expected four east-side cutaway instances, got {changed}")
    angle.set_camera(scene.camera, 45, 25)
    candidate_path = OUTPUT / "bed-yaw+45-elev25-east-cutaway.png"
    scene.render.filepath = str(candidate_path)
    bpy.ops.render.render(write_still=True)
    candidate_pixels = angle.stable_png(candidate_path)
    if low_east_pixels is None or low_east_mask_pixels is None:
        raise RuntimeError("Missing +45/25 reference for bed visibility comparison")
    candidate = {"selectionRule": {"yawDegreesAtLeast": 30, "elevationDegreesAtMost": 30},
                 "referenceImage": "bed-yaw+45-elev25.png", "image": candidate_path.name,
                 "sha256": digest(candidate_path), "yawDegrees": 45,
                 "elevationDegrees": 25, "changedInstances": changed,
                 "visibleBlanketPixelsBefore": visible_blanket_pixels(low_east_pixels, low_east_mask_pixels),
                 "visibleBlanketPixelsAfter": visible_blanket_pixels(candidate_pixels, low_east_mask_pixels)}
    manifest = {"schemaVersion": 1, "source": SOURCE.name,
                "cellSource": CELL_SOURCE.name, "cellSourceSha256": digest(CELL_SOURCE),
                "bedCatalogSource": CATALOG_SOURCE.name, "bedCatalogSha256": digest(CATALOG_SOURCE),
                "bedCollection": BED_ID, "bedOriginTile": [1.0, 2.1, 0.0],
                "resolution": list(RESOLUTION), "projection": "orthographic",
                "orthoScale": ORTHO_SCALE,
                "nominalPixelsPerTile": round(RESOLUTION[0] / ORTHO_SCALE, 3),
                "target": list(angle.TARGET),
                "lighting": {"type": "one area light", "location": [-4, -5, 9],
                             "energy": 900, "size": 5},
                "yawDegrees": list(angle.YAW_DEGREES),
                "elevationDegrees": list(angle.ELEVATION_DEGREES),
                "entries": entries, "cutawayCandidate": candidate}
    pipeline_common.write_text(OUTPUT / "manifest.json", json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
