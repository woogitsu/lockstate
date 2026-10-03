"""One serial genuine Cook source mutation; always restore exact source bytes.

Run with host Python after audit-cook-apron-cap.py --preview. No catalog renders
or published export writes. Outputs are ignored audit receipts and logs.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
BLENDER = Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
OUT = ROOT / 'assets/intermediate/cook-apron-cap-audit'
SOURCE = ROOT / 'assets/source/blender/actor.cook.base.blend'
DESCRIPTOR = ROOT / 'public/game-content/oblique-actor-cook.v1.json'
GUARD = ROOT / 'tooling/research/audit-cook-apron-cap.py'


def digest(value):
    return hashlib.sha256(value).hexdigest()


def exported_hashes():
    catalog = json.loads(DESCRIPTOR.read_text(encoding='utf-8-sig'))
    rows = []
    for frame in catalog['frames']:
        path = ROOT / 'public' / frame['image'].lstrip('/')
        actual = digest(path.read_bytes())
        if actual != frame['sha256']:
            raise ValueError(f'Published Cook frame hash mismatch: {path}')
        rows.append({'path': path.relative_to(ROOT).as_posix(), 'sha256': actual})
    return rows


def run(script, log):
    result = subprocess.run([str(BLENDER), '--background', '--factory-startup',
                             '--threads', '1', '--python-exit-code', '1',
                             '--python', str(script)], cwd=ROOT, capture_output=True, text=True)
    (OUT / log).write_text(result.stdout + result.stderr, encoding='utf-8')
    return result


OUT.mkdir(parents=True, exist_ok=True)
original = SOURCE.read_bytes()
descriptor = DESCRIPTOR.read_bytes()
exports = exported_hashes()
receipt_path = OUT / 'actual-cook-source-apron-cap.json'
(OUT / 'one-original-producer-preview-receipt.json').write_bytes(receipt_path.read_bytes())
with tempfile.TemporaryDirectory(prefix='cook-actual-cap-control-') as temporary:
    mutator = Path(temporary) / 'detach_cook_cap.py'
    mutator.write_text(
        'import bpy\n'
        f'bpy.ops.wm.open_mainfile(filepath={str(SOURCE)!r})\n'
        'bpy.context.scene.frame_set(1)\n'
        'bpy.data.objects["Compact chef cap crown"].location.z += 0.6\n'
        'bpy.context.preferences.filepaths.save_version = 0\n'
        f'bpy.ops.wm.save_as_mainfile(filepath={str(SOURCE)!r})\n', encoding='utf-8')
    try:
        mutation = run(mutator, 'actual-detached-cap-mutation.log')
        if mutation.returncode != 0 or SOURCE.read_bytes() == original:
            raise ValueError('Actual Blender Cook source mutation did not execute')
        mutated_sha = digest(SOURCE.read_bytes())
        red = run(GUARD, 'actual-detached-cap-RED.log')
        reason = 'Cook actual role contact disconnected: Chef cap folded band / Compact chef cap crown'
        if red.returncode == 0 or reason not in red.stdout + red.stderr:
            raise ValueError('Cook control did not fail on actual detached-cap geometry')
    finally:
        SOURCE.write_bytes(original)
    if SOURCE.read_bytes() != original or DESCRIPTOR.read_bytes() != descriptor:
        raise ValueError('Cook source/descriptor exact restoration failed')
    green = run(GUARD, 'exact-restored-source-GREEN.log')
    if green.returncode != 0 or 'COOK_ORIGINAL_GREEN 68 meshes/10 full graphs/16 actual apron-cap contacts/eight poses unchanged' not in green.stdout:
        raise ValueError('Exact restored Cook source guard did not pass')
    if exported_hashes() != exports:
        raise ValueError('Published Cook exports changed during source control')
    result = {'actualMutation': 'Compact chef cap crown.location.z += 0.6 in the production .blend',
              'mutatedSourceSHA256': mutated_sha, 'redExitCode': red.returncode,
              'redSemanticReason': reason, 'restoredSourceSHA256': digest(SOURCE.read_bytes()),
              'sourceExactByteRestoration': True, 'descriptorExactBytePreservation': True,
              'descriptorSHA256': digest(descriptor), 'greenExitCode': green.returncode,
              'unchangedPublishedCookFrames': exports, 'newRenderCount': 1,
              'newRender': 'one original producer preview, before the control; no catalog matrix'}
    (OUT / 'actual-cap-control-and-exact-restore.json').write_text(json.dumps(result, indent=2) + '\n', encoding='utf-8')
print('COOK_ACTUAL_CAP_RED_EXACT_RESTORE_GREEN; original source, descriptor and 72 published PNG byte hashes preserved')
