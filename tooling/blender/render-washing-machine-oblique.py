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
# The dedicated source retains the previously baked Y fit; use unit scale.
exporter.MODELS = (
    ('utility.washing-machine.variants', 'utility.washing-machine.angled-detail.blend',
     'oblique-utility.washing-machine.v1.json', 2, 1, 1.0, 1.0, 0.7825000286102295),
)
detail_spec = importlib.util.spec_from_file_location('washer_detail_legacy_dispatch', HERE / 'render-washing-machine-detail-oblique.py')
assert detail_spec and detail_spec.loader
detail = importlib.util.module_from_spec(detail_spec)
detail_spec.loader.exec_module(detail)
exporter.configure = detail.configure
exporter.point_camera = detail.point_camera
if '--verify' in sys.argv:
    for model in exporter.MODELS:
        _, camera, target = detail.configure(model)
        for yaw in exporter.YAW:
            for elevation in exporter.ELEVATION:
                detail.point_camera(camera, target, yaw, elevation)
    print('LEGACY_WASHER_DETAIL_VERIFY72 cameras/allfour orientations', flush=True)
else:
    exporter.main()