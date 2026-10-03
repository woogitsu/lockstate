"""Repeat genuine Reception selector/registry negatives in this own checkout.

No browser/server or art/render mutator. Restore production bytes in finally.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/intermediate/reception-chair-context-controls'
OUT.mkdir(parents=True, exist_ok=True)
NODE = Path(r'C:\Users\matma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
PNPM = Path(r'C:\Users\matma\AppData\Local\node\corepack\v1\pnpm\11.22.0\bin\pnpm.cjs')
MAPPING = ROOT / 'src/rendering/assets/oblique-object-mapping.ts'
REGISTRY = ROOT / 'public/game-content/oblique-module-registry.v1.json'
ASSET = 'furniture.reception.waiting-armchair'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def run(log):
    env = dict(os.environ)
    env['PATH'] = str(NODE.parent) + os.pathsep + env['PATH']
    result = subprocess.run([str(NODE), str(PNPM), '--config.verify-deps-before-run=false', 'test',
                             'tests/unit/oblique-reception-chair-context.test.ts'], cwd=ROOT, env=env,
                            capture_output=True, text=True, encoding='utf-8', errors='replace')
    (OUT / log).write_text(result.stdout + result.stderr, encoding='utf-8', newline='\n')
    return result


original_mapping = MAPPING.read_bytes()
original_registry = REGISTRY.read_bytes()
newline = b'\r\n' if b'\r\n' in original_mapping else b'\n'
block = newline.join([b"  { roomCatalogId: 'room.reception', objectAssets: Object.freeze({",
                      b"    'object.chair': 'furniture.reception.waiting-armchair',", b'  }) },', b''])
if original_mapping.count(block) != 1:
    raise ValueError('Actual Reception context block is absent or ambiguous')

protected_paths = []
for manifest in ['oblique-furniture-classroom-teacher-desk.v1.json',
                 'oblique-fixture.garbage-room-waste-bin.v1.json',
                 'oblique-furniture-reception-waiting-armchair.v1.json']:
    descriptor = ROOT / 'public/game-content' / manifest
    catalog = json.loads(descriptor.read_text(encoding='utf-8-sig'))
    source = ROOT / catalog['source']
    protected_paths.extend([descriptor, source, source.with_suffix('.provenance.json')])
    protected_paths.extend(ROOT / 'public' / frame['image'].lstrip('/') for frame in catalog['frames'])
protected = {path: sha(path.read_bytes()) for path in protected_paths}
receipts = []
try:
    MAPPING.write_bytes(original_mapping.replace(block, b''))
    red = run('actual-Reception-context-omission-RED.log')
    output = red.stdout + red.stderr
    if red.returncode == 0 or '2 failed | 5 passed' not in output or 'actual Reception chair context selector' not in output:
        raise ValueError('Actual context omission did not fail both literal chair projections')
    receipts.append({'mutation': 'omit actual Reception-only ROOM_VISUAL_VARIANTS block',
                     'exitCode': red.returncode, 'failed': 2, 'preservedControlsPassed': 5})
finally:
    MAPPING.write_bytes(original_mapping)
try:
    registry = json.loads(original_registry)
    registry['entries'] = [entry for entry in registry['entries'] if entry['assetId'] != ASSET]
    REGISTRY.write_bytes((json.dumps(registry, indent=2) + '\n').encode('utf-8'))
    red = run('actual-Reception-registry-omission-RED.log')
    output = red.stdout + red.stderr
    if red.returncode == 0 or '1 failed | 6 passed' not in output or 'actual runtime Reception registry entry' not in output:
        raise ValueError('Actual registry omission did not fail the real descriptor registration')
    receipts.append({'mutation': 'omit actual Reception armchair registry entry',
                     'exitCode': red.returncode, 'failed': 1, 'preservedControlsPassed': 6})
finally:
    REGISTRY.write_bytes(original_registry)
if MAPPING.read_bytes() != original_mapping or REGISTRY.read_bytes() != original_registry:
    raise ValueError('Context or registry exact-byte restoration failed')
green = run('exact-restored-Reception-context-GREEN.log')
if green.returncode != 0 or '7 passed' not in green.stdout:
    raise ValueError('Exact restored source context suite did not pass')
for path, digest in protected.items():
    if sha(path.read_bytes()) != digest:
        raise ValueError(f'Art source/export bytes changed: {path.relative_to(ROOT)}')
receipt = {'actualProductionControls': receipts, 'mappingSHA256': sha(original_mapping),
           'registrySHA256': sha(original_registry), 'exactMappingRegistryByteRestoration': True,
           'restoredGreenExitCode': green.returncode, 'restoredContextTestsPassed': 7,
           'protectedArtFileCount': len(protected), 'sourceProvenanceDescriptor216PNGByteExactUnchanged': True,
           'protectedArtHashes': {path.relative_to(ROOT).as_posix(): digest for path, digest in protected.items()},
           'ClassroomDefaultAndReceptionDeskControlsPreserved': True, 'nativeBrowserRun': False,
           'serverStarted': False, 'BlenderRenderStarted': False, 'nativeVisualCalibrationPending': True}
(OUT / 'two-actual-Reception-consumer-negatives-exact-restore-GREEN.json').write_text(
    json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
print('RECEPTION_CONTEXT_2_RED_REGISTRY_1_RED_EXACT_RESTORE_7_GREEN; all art bytes unchanged')
