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
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/library-bookshelf-preview'
# The front catalogue shelf reaches y=-.56; keep its complete mesh in the tile.
exporter.MODELS = (
    ('furniture.library.bookshelf.variants', 'furniture.library.bookshelf.variants.blend',
     'oblique-furniture.library-bookshelf.v1.json', 2, 1, 1.0, 0.85, 1.05),
)
exporter.main()
