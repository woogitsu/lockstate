"""Align the existing gate model to its three occupied tiles and export 72 poses."""
import importlib.util
from pathlib import Path
import sys

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
spec = importlib.util.spec_from_file_location('square_fixture_export', HERE / 'render-kitchen-fixtures-oblique.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/loading-dock-door-preview'
# The source is centred at zero and 1.90 tiles wide. Preserve its authored
# details while expanding the leaf to 2.85 tiles inside the catalogued 3 x 1.
# Translation, exact 64px/tile scale and yaw convention come from the shared
# exporter; its camera now actually targets the manifest's footprint centre.
exporter.MODELS = (
    ('utility.loading-dock-door.variants', 'utility.loading-dock-door.variants.blend',
     'oblique-utility.loading-dock-door.v1.json', 3, 1, 1.5, 1.0, 0.89),
)

configure_fixture = exporter.configure


def configure(model):
    scene, camera, target = configure_fixture(model)
    # Inspect evaluated mesh vertices, including every bevel/modifier, rather
    # than relying on the unmodified mesh or its object-space bounding box.
    dependency_graph = exporter.bpy.context.evaluated_depsgraph_get()
    points = []
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        evaluated = obj.evaluated_get(dependency_graph)
        mesh = evaluated.to_mesh()
        try:
            points.extend(evaluated.matrix_world @ vertex.co for vertex in mesh.vertices)
        finally:
            evaluated.to_mesh_clear()
    if not points:
        raise ValueError('The loading gate has no evaluated geometry')
    minimum = [min(point[axis] for point in points) for axis in range(3)]
    maximum = [max(point[axis] for point in points) for axis in range(3)]
    width, height = model[3:5]
    if not (0 <= minimum[0] <= maximum[0] <= width and
            0 <= minimum[1] <= maximum[1] <= height and minimum[2] >= -1e-6):
        raise ValueError(f'Loading gate evaluated geometry escapes {width} x {height}: {minimum} to {maximum}')
    print(f'DOCK_EVALUATED_BOUNDS {minimum} {maximum}', flush=True)
    return scene, camera, target


exporter.configure = configure

if __name__ == '__main__':
    if '--verify' in sys.argv:
        configure(exporter.MODELS[0])
    else:
        exporter.main()
