"""Exercise the real exporter scene/camera without saving the authored sources."""
import hashlib
import importlib.util
import math
from pathlib import Path

import bpy
from bpy_extras.object_utils import world_to_camera_view
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('wall_export', ROOT / 'tooling/blender/render-square-brick-oblique.py')
export = importlib.util.module_from_spec(spec)
spec.loader.exec_module(export)

for kind, height in [('full', .75), ('low', .34)]:
    source = ROOT / f'assets/source/blender/wall.square.brick.{kind}.blend'
    before = hashlib.sha256(source.read_bytes()).hexdigest()
    scene, camera, _ = export.prepare_scene(kind)
    bpy.context.view_layer.update()
    corners = [obj.matrix_world @ Vector(corner) for obj in scene.objects if obj.type == 'MESH' for corner in obj.bound_box]
    bounds = [(min(p[i] for p in corners), max(p[i] for p in corners)) for i in range(3)]
    for actual, expected in zip(bounds, [(0, 1), (0, 1), (0, height)]):
        assert all(abs(a-b) < 1e-6 for a,b in zip(actual,expected)), (kind, bounds)
    for yaw in range(-180, 180, 15):
        for elevation in (25, 45, 65):
            export.pose_camera(camera, yaw, elevation)
            bpy.context.view_layer.update()
            projected = [world_to_camera_view(scene, camera, Vector((x,y,0))) for x,y in [(0,0),(1,0),(1,1),(0,1)]]
            span = (max(p.x for p in projected)-min(p.x for p in projected))*512
            radians = math.radians(yaw)
            expected_span = 64*(abs(math.cos(radians))+abs(math.sin(radians)))
            assert abs(span-expected_span) < .001, (kind,yaw,elevation,span,expected_span)
            centre = world_to_camera_view(scene,camera,Vector((.5,.5,0)))
            assert abs(centre.x-.5)<1e-6 and abs(centre.y-.5)<1e-6, (kind,yaw,elevation,tuple(centre))
            # Real model bounds, including full height, fit every actual camera.
            for corner in corners:
                point = world_to_camera_view(scene,camera,corner)
                assert 0 < point.x < 1 and 0 < point.y < 1, (kind,yaw,elevation,tuple(point))
    assert hashlib.sha256(source.read_bytes()).hexdigest() == before
    print(f'PASS {kind}: export bounds={bounds}; 72 ground spans/pivots/model borders; unchanged source={before}',flush=True)
