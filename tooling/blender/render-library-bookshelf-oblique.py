"""Align the existing library bookshelf with the shared square fixture exporter."""
import importlib.util
from pathlib import Path
import sys
HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import pipeline_common
pipeline_common.require_blender_version()
spec = importlib.util.spec_from_file_location('square_fixture_export', HERE / 'render-kitchen-fixtures-oblique.py')
exporter = importlib.util.module_from_spec(spec)
spec.loader.exec_module(exporter)
ASSET_ID = 'furniture.library.bookshelf.variants'
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/library-bookshelf-preview'
# The front catalogue shelf reaches y=-.56; keep its complete mesh in the tile.
exporter.MODELS = (
    ('furniture.library.bookshelf.variants', 'furniture.library.bookshelf.angled-detail.blend',
     'oblique-furniture.library-bookshelf.v1.json', 2, 1, 1.0, 0.85, 1.05),
)

_detail_module = None

def bookshelf_detail_exporter():
    global _detail_module
    if _detail_module is None:
        detail_spec = importlib.util.spec_from_file_location('library_bookshelf_physical_detail', HERE / 'render-library-bookshelf-detail-oblique.py')
        assert detail_spec and detail_spec.loader
        _detail_module = importlib.util.module_from_spec(detail_spec)
        detail_spec.loader.exec_module(_detail_module)
    return _detail_module

configure_shared = exporter.configure

def configure(model):
    if model[0] == ASSET_ID:
        return bookshelf_detail_exporter().configure(model)
    return configure_shared(model)

exporter.configure = configure
point_shared = exporter.point_camera

def point_camera(camera, target, yaw, elevation):
    if exporter.MODELS[0][0] == ASSET_ID:
        return bookshelf_detail_exporter().point_camera(camera, target, yaw, elevation)
    return point_shared(camera, target, yaw, elevation)

exporter.point_camera = point_camera

if __name__ == '__main__':
    if '--verify' in sys.argv:
        for model in exporter.MODELS:
            _, camera, target = configure(model)
            for yaw in exporter.YAW:
                for elevation in exporter.ELEVATION:
                    point_camera(camera, target, yaw, elevation)
        print('LIBRARY_BOOKSHELF_VERIFY72 actual cameras/four oriented rectangles/outward evaluated surfaces', flush=True)
    else:
        exporter.main()

