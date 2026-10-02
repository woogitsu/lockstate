"""Measure evaluated washing-machine source geometry without changing its source."""
import json
from pathlib import Path
import bpy
ROOT = Path(__file__).resolve().parents[2]
bpy.ops.wm.open_mainfile(filepath=str(ROOT / 'assets/source/blender/utility.washing-machine.variants.blend'))
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
result = {'source': 'utility.washing-machine.variants.blend', 'footprint': [2, 1], 'evaluatedBounds': bounds,
          'fitsMinimumCornerFootprint': bounds[0][0] >= 0 and bounds[0][1] <= 2 and bounds[1][0] >= 0 and bounds[1][1] <= 1}
print('WASHING_MACHINE_FOOTPRINT=' + json.dumps(result))