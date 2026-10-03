"""Real model/producer/hash-valid PNG controls with exact byte restoration.

One-thread Blender, four bounded replays, no full matrix rerender. Only the own
new source/producer/descriptor/export is temporarily mutated; original bin,
shared exporter, registry and object mapping are never written.
"""
from pathlib import Path
import hashlib
import json
import os
import struct
import subprocess
import tempfile
import zlib

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/intermediate/garbage-room-bin-proof'
OUT.mkdir(parents=True, exist_ok=True)
BLENDER = Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
NODE = Path(r'C:\Users\matma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
PNPM = Path(r'C:\Users\matma\AppData\Local\node\corepack\v1\pnpm\11.22.0\bin\pnpm.cjs')
SOURCE = ROOT / 'assets/source/blender/fixture.garbage-room.waste-bin.blend'
PROVENANCE = SOURCE.with_suffix('.provenance.json')
PRODUCER = ROOT / 'tooling/blender/render-garbage-room-bin-oblique.py'
DESCRIPTOR = ROOT / 'public/game-content/oblique-fixture.garbage-room-waste-bin.v1.json'
TEST = 'tests/unit/oblique-garbage-room-bin-art.test.ts'


def sha(value):
    return hashlib.sha256(value).hexdigest()


def run(arguments, log):
    env = dict(os.environ)
    env['PATH'] = str(NODE.parent) + os.pathsep + env['PATH']
    result = subprocess.run(arguments, cwd=ROOT, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
    (OUT / log).write_text(result.stdout + result.stderr, encoding='utf-8')
    return result


def blender(script, *arguments):
    return [str(BLENDER), '--background', '--factory-startup', '--threads', '1', '--python-exit-code', '1', '--python', str(script), '--', *arguments]


def test():
    return [str(NODE), str(PNPM), '--config.verify-deps-before-run=false', 'test', TEST]


def require_red(result, reason):
    if result.returncode == 0 or reason not in result.stdout + result.stderr:
        raise ValueError(f'Real control did not reach its required RED: {reason}')


original_source = SOURCE.read_bytes()
original_provenance = PROVENANCE.read_bytes()
original_producer = PRODUCER.read_bytes()
original_descriptor = DESCRIPTOR.read_bytes()
catalog = json.loads(original_descriptor)
exports = {ROOT / 'public' / row['image'].lstrip('/'): (row['sha256'], (ROOT / 'public' / row['image'].lstrip('/')).read_bytes()) for row in catalog['frames']}
protected_paths = [ROOT / 'src/rendering/assets/oblique-object-mapping.ts', ROOT / 'public/game-content/oblique-module-registry.v1.json',
                   ROOT / 'tooling/blender/render-kitchen-fixtures-oblique.py', ROOT / 'assets/source/blender/fixture.cell.waste_bin.angled.blend',
                   ROOT / 'public/game-content/oblique-fixture-cell-waste-bin.v1.json']
old_catalog = json.loads(protected_paths[-1].read_text(encoding='utf-8-sig'))
protected_paths += [ROOT / 'public' / frame['image'].lstrip('/') for frame in old_catalog['frames']]
protected = {path: sha(path.read_bytes()) for path in protected_paths}
results = []
repeat = run(blender(PRODUCER, '--repeat-four'), 'four-real-producer-repeats-GREEN.log')
if repeat.returncode != 0 or 'GARBAGE_BIN_REPEAT4_BYTE_EXACT_GREEN' not in repeat.stdout:
    raise ValueError('Actual four-direction producer repeat failed')

with tempfile.TemporaryDirectory(prefix='garbage-bin-actual-wheel-control-') as temporary:
    mutator = Path(temporary) / 'detach_actual_caster.py'
    mutator.write_text('import bpy\n' + f'bpy.ops.wm.open_mainfile(filepath={str(SOURCE)!r})\n' +
                       'bpy.data.objects["Refuse trolley.rubber caster wheel.-0.35.-0.23"].location.x += 0.18\n' +
                       'bpy.context.preferences.filepaths.save_version = 0\n' +
                       f'bpy.ops.wm.save_as_mainfile(filepath={str(SOURCE)!r})\n', encoding='utf-8')
    try:
        mutation = run(blender(mutator), 'actual-detached-wheel-mutation.log')
        if mutation.returncode != 0 or SOURCE.read_bytes() == original_source:
            raise ValueError('Actual Blender wheel mutation did not execute')
        altered = json.loads(original_provenance)
        altered['sourceSha256'] = sha(SOURCE.read_bytes())
        PROVENANCE.write_text(json.dumps(altered, indent=2) + '\n', encoding='utf-8')
        reason = 'Refuse trolley actual contact disconnected: Refuse trolley.rubber caster wheel.-0.35.-0.23 / Refuse trolley.solid wheel axle.-0.35.-0.23'
        red = run(blender(PRODUCER, '--preview'), 'actual-detached-wheel-matching-source-hash-RED.log')
        require_red(red, reason)
        results.append({'control': 'actual .blend caster wheel rigid x+0.18, matched provenance source hash',
                        'mutatedSourceSHA256': altered['sourceSha256'], 'exitCode': red.returncode, 'reason': reason})
    finally:
        SOURCE.write_bytes(original_source)
        PROVENANCE.write_bytes(original_provenance)

try:
    if original_producer.count(b'exporter.MODELS = (MODEL,)') != 1:
        raise ValueError('Actual producer dispatch mutation target is ambiguous')
    PRODUCER.write_bytes(original_producer.replace(b'exporter.MODELS = (MODEL,)', b'exporter.MODELS = ()'))
    red = run(blender(PRODUCER, '--preview'), 'actual-producer-omitted-dispatch-RED.log')
    reason = 'Garbage Room bin dedicated producer dispatch changed'
    require_red(red, reason)
    results.append({'control': 'actual producer omits its own dispatch tuple', 'exitCode': red.returncode, 'reason': reason})
finally:
    PRODUCER.write_bytes(original_producer)

bad_path = None
try:
    frame = catalog['frames'][0]
    blob = exports[ROOT / 'public' / frame['image'].lstrip('/')][1]
    chunks, compressed = [], b''
    offset = 8
    while offset < len(blob):
        length = struct.unpack('>I', blob[offset:offset + 4])[0]
        kind, value = blob[offset + 4:offset + 8], blob[offset + 8:offset + 8 + length]
        if kind == b'IDAT':
            compressed += value
        else:
            chunks.append((kind, value))
        offset += length + 12
    rgba = bytearray(zlib.decompress(compressed))
    if any(rgba[y * 1025] != 0 for y in range(256)):
        raise ValueError('Expected canonical deterministic unfiltered rows')
    rgba[4] = 255  # actual alpha of the top-left border pixel
    def chunk(kind, value):
        return struct.pack('>I', len(value)) + kind + value + struct.pack('>I', zlib.crc32(kind + value) & 0xffffffff)
    bad = b'\x89PNG\r\n\x1a\n' + b''.join(chunk(kind, value) for kind, value in chunks if kind != b'IEND') + chunk(b'IDAT', zlib.compress(rgba, 9)) + chunk(b'IEND', b'')
    digest = sha(bad)
    bad_name = Path(frame['image']).name.replace(frame['sha256'][:12], digest[:12])
    bad_path = ROOT / 'public/assets/environment/oblique' / bad_name
    if bad_path.exists():
        raise ValueError('Control export path already exists')
    bad_path.write_bytes(bad)
    altered = json.loads(original_descriptor)
    altered['frames'][0]['image'] = '/assets/environment/oblique/' + bad_name
    altered['frames'][0]['sha256'] = digest
    DESCRIPTOR.write_text(json.dumps(altered, indent=2) + '\n', encoding='utf-8')
    red = run(test(), 'actual-hash-valid-PNG-border-RED.log')
    require_red(red, 'Garbage Room PNG transparent border:')
    require_red(red, 'AssertionError')
    results.append({'control': 'actual valid RGBA PNG with opaque corner, matched descriptor hash and filename hash',
                    'badPNG_SHA256': digest, 'exitCode': red.returncode, 'reason': 'Garbage Room PNG transparent border'})
finally:
    DESCRIPTOR.write_bytes(original_descriptor)
    if bad_path is not None and bad_path.is_file():
        bad_path.unlink()

green = run(blender(PRODUCER, '--verify'), 'exact-restored-producer-GREEN.log')
if green.returncode != 0 or 'GARBAGE_BIN_VERIFY_GREEN' not in green.stdout:
    raise ValueError('Exact restored production source/producer is not GREEN')
unit = run(test(), 'exact-restored-catalog-unit-GREEN.log')
if unit.returncode != 0 or '2 passed' not in unit.stdout:
    raise ValueError('Exact restored dedicated art tests are not GREEN')
for path, original in [(SOURCE, original_source), (PROVENANCE, original_provenance), (PRODUCER, original_producer), (DESCRIPTOR, original_descriptor)]:
    if path.read_bytes() != original:
        raise ValueError(f'Exact production byte restoration failed: {path}')
for path, (digest, original) in exports.items():
    if path.read_bytes() != original or sha(original) != digest:
        raise ValueError(f'Own canonical export changed: {path}')
for path, digest in protected.items():
    if sha(path.read_bytes()) != digest:
        raise ValueError(f'Original bin or shared consumer changed: {path}')
receipt = {'actualControls': results, 'boundedNewRepeatRenderCount': 4,
           'actualProducerRepeatReceipt': 'four-real-producer-repeats.json',
           'sourceSHA256': sha(original_source), 'provenanceSHA256': sha(original_provenance),
           'descriptorSHA256': sha(original_descriptor), 'exactSourceProvenanceProducerDescriptorRestoration': True,
           'all72OwnExportsExactBytePreservation': True, 'originalBin72ExportsAndSharedFilesUnchanged': True,
           'restoredProducerExitCode': green.returncode, 'restoredUnitExitCode': unit.returncode}
(OUT / 'three-actual-controls-and-exact-restoration.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('GARBAGE_BIN_THREE_ACTUAL_RED_EXACT_RESTORE_GREEN; four byte-exact producer replays; 72 canonical PNGs preserved')
