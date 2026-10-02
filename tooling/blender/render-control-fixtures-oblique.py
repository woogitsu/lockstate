"""Reuse the verified square-fixture exporter for the existing security and utility models."""
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
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/control-fixtures-preview'
exporter.MODELS = (
    ('utility.security-console.variants', 'utility.security-console.variants.blend',
     'oblique-utility.security-console.v1.json', 2, 1, 1.0, 0.9, 0.65),
    ('utility.utility-panel.variants', 'utility.utility-panel.variants.blend',
     'oblique-utility.utility-panel.v1.json', 1, 1, 0.8, 0.9, 0.65),
)
exporter.main()