"""Verify the authored full and cutaway wall Blender geometry contract."""
from __future__ import annotations

from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]


def verify(kind: str, top_z: float, expected_bricks: int) -> None:
    source = ROOT / f'assets/source/blender/wall.square.brick.{kind}.blend'
    bpy.ops.wm.open_mainfile(filepath=str(source))
    meshes = [obj for obj in bpy.data.objects if obj.type == 'MESH']
    if not meshes:
        raise AssertionError(f'{kind}: no mesh objects')
    coords = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    bounds = [(min(getattr(point, axis) for point in coords),
               max(getattr(point, axis) for point in coords)) for axis in ('x', 'y', 'z')]
    for axis, (minimum, maximum), expected in zip('xyz', bounds,
                                                  ((-0.5, 0.5), (-0.5, 0.5), (0.0, top_z))):
        if abs(minimum - expected[0]) > 1e-6 or abs(maximum - expected[1]) > 1e-6:
            raise AssertionError(f'{kind} {axis} bounds {minimum:.6f}..{maximum:.6f}, expected {expected}')
    brick_count = sum(' brick ' in obj.name for obj in meshes)
    cap_count = sum(obj.name.startswith('cap stone ') for obj in meshes)
    if brick_count != expected_bricks or cap_count != 4:
        raise AssertionError(f'{kind}: expected {expected_bricks} brick faces and 4 cap stones; got {brick_count} and {cap_count}')
    print(f'verified {kind}: bounds={bounds}, brick_faces={brick_count}, cap_stones={cap_count}', flush=True)


verify('full', 0.75, 52)
verify('low', 0.34, 20)
