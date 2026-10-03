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


def box(name: str, center: tuple[float, float, float], size: tuple[float, float, float], surface,
        bevel_width: float = 0.008):
    bpy.ops.mesh.primitive_cube_add(size=1, location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(surface)
    if bevel_width > 0:
        bevel = obj.modifiers.new('soft masonry corners', 'BEVEL')
        bevel.width = bevel_width
        bevel.segments = 2
    obj.modifiers.new('weighted masonry normals', 'WEIGHTED_NORMAL')


def brick_faces(top_z: float, brick_surfaces: list) -> None:
    """Staggered relief stays inside the one-tile footprint and below the cap."""
    lower, upper = 0.105, top_z - 0.045
    courses = 5 if top_z > 0.5 else 2
    course_height = (upper - lower) / courses
    for side_index, side in enumerate(('north', 'south', 'east', 'west')):
        for row in range(courses):
            # Half bricks at alternating ends make coursing visible from any yaw.
            spans = ((-0.49, -0.255), (-0.245, 0.245), (0.255, 0.49)) if row % 2 == 0 else (
                (-0.49, -0.01), (0.01, 0.49))
            z = lower + (row + 0.5) * course_height
            for index, (start, end) in enumerate(spans):
                along = (start + end) / 2
                length = end - start - 0.008
                surface = brick_surfaces[(side_index * 7 + row * 3 + index) % len(brick_surfaces)]
                if side in ('north', 'south'):
                    center = (along, -0.497 if side == 'north' else 0.497, z)
                    size = (length, 0.006, course_height - 0.014)
                else:
                    center = (-0.497 if side == 'west' else 0.497, along, z)
                    size = (0.006, length, course_height - 0.014)
                box(f'{side} brick {row}.{index}', center, size, surface, bevel_width=0.001)


def cap_stones(top_z: float, stones: list, mortar) -> None:
    box('recessed cap joints', (0, 0, top_z - 0.019), (1, 1, 0.022), mortar)
    for row, y in enumerate((-0.245, 0.245)):
        for column, x in enumerate((-0.245, 0.245)):
            box(f'cap stone {row}.{column}', (x, y, top_z - 0.004),
                (0.48, 0.48, 0.008), stones[(row + column) % len(stones)], bevel_width=0.001)


def build(kind: str, top_z: float) -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.filepaths.save_version = 0
    foundation = material('charcoal stone footing', (0.20, 0.22, 0.21))
    plaster = material('warm lime mortar bed', (0.62, 0.58, 0.51))
    bricks = [
        material('warm chalk brick', (0.70, 0.65, 0.56)),
        material('aged chalk brick', (0.65, 0.60, 0.52)),
        material('pale sand brick', (0.72, 0.67, 0.58)),
        material('smoked sand brick', (0.61, 0.57, 0.50)),
    ]
    coping = [material('sandstone cap light', (0.77, 0.72, 0.64)),
              material('sandstone cap shaded', (0.73, 0.68, 0.60))]
    mortar = material('recessed mortar', (0.48, 0.44, 0.39))
    box('charcoal stone footing', (0, 0, 0.045), (1, 1, 0.09), foundation)
    body_height = top_z - 0.12
    box('lime mortar masonry core', (0, 0, 0.09 + body_height / 2), (0.988, 0.988, body_height), plaster)
    brick_faces(top_z, bricks)
    cap_stones(top_z, coping, mortar)
    output = ROOT / f'assets/source/blender/wall.square.brick.{kind}.blend'
    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(output))
    print('saved', output, 'height', top_z)


build('full', 0.75)
build('low', 0.34)
