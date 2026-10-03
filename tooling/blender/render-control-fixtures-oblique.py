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
    ('utility.security-console.variants', 'utility.security-console.angled.blend',
     'oblique-utility.security-console.v1.json', 2, 1, 1.0, 0.9, 0.65),
    ('utility.utility-panel.variants', 'utility.utility-panel.angled.blend',
     'oblique-utility.utility-panel.v1.json', 1, 1, 1.0, 1.0, .5049999952316284),
)
configure_existing = exporter.configure


def configure(model):
    if model[0] == 'utility.security-console.variants':
        dedicated_spec = importlib.util.spec_from_file_location(
            'security_console_authored_guard', HERE / 'render-security-console-angled.py')
        dedicated = importlib.util.module_from_spec(dedicated_spec)
        dedicated_spec.loader.exec_module(dedicated)
        return dedicated.configure(model)
    return configure_existing(model)


exporter.configure = configure
if '--verify-security' in sys.argv:
    # Inspect only this authored model; the normal default still exports both.
    dedicated_spec = importlib.util.spec_from_file_location(
        'security_console_camera_guard', HERE / 'render-security-console-angled.py')
    dedicated = importlib.util.module_from_spec(dedicated_spec)
    dedicated_spec.loader.exec_module(dedicated)
    _, camera, target = configure(exporter.MODELS[0])
    for yaw in exporter.YAW:
        for elevation in exporter.ELEVATION:
            dedicated.point_camera(camera, target, yaw, elevation)
    print('CONTROL_SECURITY_VERIFY72 authored source/allfour footprints/camera vectors', flush=True)
else:
    exporter.main()
