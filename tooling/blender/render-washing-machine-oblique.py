"""Reuse the verified square-fixture exporter for the existing laundry model."""
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
exporter.PREVIEW = exporter.ROOT / 'assets/intermediate/washing-machine-preview'
# Y needs slight contraction: the evaluated front handle extends past -0.5.
exporter.MODELS = (
    ('utility.washing-machine.variants', 'utility.washing-machine.angled.blend',
     'oblique-utility.washing-machine.v1.json', 2, 1, 1.0, 1.0, 0.7825000286102295),
)
exporter.main()