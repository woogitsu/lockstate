"""Measure evaluated authored source geometry without changing its source."""
import json
import sys
from pathlib import Path
import bpy
ROOT = Path(__file__).resolve().parents[2]
args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
source = args[0] if args else 'utility.washing-machine.variants.blend'
width, height = (int(args[1]), int(args[2])) if args else (2, 1)
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/source/blender' / source))
graph = bpy.context.evaluated_depsgraph_get()
points = []
for obj in bpy.context.scene.objects:
    if obj.type != 'MESH':
        continue
    evaluated = obj.evaluated_get(graph)
    mesh = evaluated.to_mesh()
    try:
        points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
    finally:
        evaluated.to_mesh_clear()
bounds = [[min(p[axis] for p in points), max(p[axis] for p in points)] for axis in range(3)]
result = {'source': source, 'footprint': [width, height], 'evaluatedBounds': bounds,
          'fitsMinimumCornerFootprint': bounds[0][0] >= 0 and bounds[0][1] <= width and bounds[1][0] >= 0 and bounds[1][1] <= height}
print('SOURCE_FOOTPRINT=' + json.dumps(result))