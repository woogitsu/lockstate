"""Author full and cutaway one-tile brick walls for the oblique view."""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import bpy
import pipeline_common

pipeline_common.require_blender_version()
ROOT = Path(__file__).resolve().parents[2]


def material(name: str, color: tuple[float, float, float]):
    result = bpy.data.materials.new(name)
    result.diffuse_color = (*color, 1)
    result.roughness = 0.87
    return result


def box(name: str, center: tuple[float, float, float], size: tuple[float, float, float], surface):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    bevel = obj.modifiers.new('soft masonry corners', 'BEVEL')
    bevel.width = 0.008
    bevel.segments = 2
    obj.modifiers.new('weighted masonry normals', 'WEIGHTED_NORMAL')


def build(kind: str, top_z: float) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    foundation = material('charcoal stone footing', (0.20, 0.22, 0.21))
    plaster = material('warm lime brick', (0.67, 0.62, 0.53))
    coping = material('sandstone cap', (0.77, 0.72, 0.64))
    mortar = material('recessed mortar', (0.48, 0.44, 0.39))
    box('charcoal stone footing', (0, 0, 0.045), (1, 1, 0.09), foundation)
    body_height = top_z - 0.12
    box('lime plaster masonry', (0, 0, 0.09 + body_height / 2), (1, 1, body_height), plaster)
    box('sandstone top', (0, 0, top_z - 0.015), (1, 1, 0.03), coping)
    # Thin recessed courses make the wall's real height legible at game scale.
    for index, z in enumerate((0.29, 0.51) if kind == 'full' else (0.22,)):
        if z >= top_z - 0.04:
            continue
        box(f'north mortar course {index}', (0, -0.501, z), (0.97, 0.006, 0.012), mortar)
        box(f'south mortar course {index}', (0, 0.501, z), (0.97, 0.006, 0.012), mortar)
        box(f'east mortar course {index}', (0.501, 0, z), (0.006, 0.97, 0.012), mortar)
        box(f'west mortar course {index}', (-0.501, 0, z), (0.006, 0.97, 0.012), mortar)
    output = ROOT / f'assets/source/blender/wall.square.brick.{kind}.blend'
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    print('saved', output, 'height', top_z)


build('full', 0.75)
build('low', 0.34)
