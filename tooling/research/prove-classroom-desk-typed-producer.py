"""One genuine typed build-plan producer control, then exact restoration.

No Blender/source-art mutator, mapping/registry writer, browser or server.
Only the own checkout's actual typed order producer is temporarily changed.
"""
from pathlib import Path
import hashlib
import json
import os
import subprocess

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'assets/intermediate/classroom-desk-native-preparation'
OUT.mkdir(parents=True, exist_ok=True)
PRODUCER = ROOT / 'src/simulation/objects/object-placement-service.ts'
NODE = Path(r'C:\Users\matma\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe')
PNPM = Path(r'C:\Users\matma\AppData\Local\node\corepack\v1\pnpm\11.22.0\bin\pnpm.cjs')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def test(log):
    env = dict(os.environ)
    env['PATH'] = str(NODE.parent) + os.pathsep + env['PATH']
    result = subprocess.run([str(NODE), str(PNPM), '--config.verify-deps-before-run=false', 'test',
                             'tests/integration/native-classroom-desk-preparation.test.ts'],
                            cwd=ROOT, env=env, capture_output=True, text=True, encoding='utf-8', errors='replace')
    (OUT / log).write_text(result.stdout + result.stderr, encoding='utf-8')
    return result


original = PRODUCER.read_bytes()
needle = b'undefined, request.objectOrientation));'
if original.count(needle) != 1:
    raise ValueError('Actual typed producer mutation target is ambiguous')
catalog_path = ROOT / 'public/game-content/oblique-furniture-classroom-teacher-desk.v1.json'
catalog = json.loads(catalog_path.read_text(encoding='utf-8-sig'))
protected_paths = [catalog_path, ROOT / 'assets/source/blender/furniture.classroom.teacher-desk.blend',
                   ROOT / 'assets/source/blender/furniture.classroom.teacher-desk.provenance.json',
                   ROOT / 'src/rendering/assets/oblique-object-mapping.ts', ROOT / 'public/game-content/oblique-module-registry.v1.json']
protected_paths += [ROOT / 'public' / frame['image'].lstrip('/') for frame in catalog['frames']]
protected = {path: sha(path.read_bytes()) for path in protected_paths}
try:
    PRODUCER.write_bytes(original.replace(needle, b"undefined, request.definitionId === 'desk-wooden' ? 1 : request.objectOrientation));"))
    red = test('actual-ordinary-desk-wrong-orientation-RED.log')
    reason = 'actual public desk order is forced to orientation1 although the ordinary command and literal oracle require orientation0'
    output = red.stdout + red.stderr
    if red.returncode == 0 or '2 failed' not in output or not all(value in output for value in
        ('"orientation": 1', '"orientation": 0', 'classroom-individual-desk', 'assertClassroomDesk')):
        raise ValueError('Actual ordinary desk producer mutation did not reach its literal owner/orientation RED')
finally:
    PRODUCER.write_bytes(original)
if PRODUCER.read_bytes() != original:
    raise ValueError('Actual typed producer exact restoration failed')
green = test('exact-restored-typed-q0-q1-V8-GREEN.log')
if green.returncode != 0 or '2 passed' not in green.stdout:
    raise ValueError('Exact restored ordinary typed q0/q1 build and V8 roundtrip did not pass')
for path, digest in protected.items():
    if sha(path.read_bytes()) != digest:
        raise ValueError(f'Art or shared consumer changed during preparation: {path}')
receipt = {'actualProducer': PRODUCER.relative_to(ROOT).as_posix(),
           'actualMutation': 'force actual separately placed desk createBuildOrder to orientation1; public command retains no invented rotation',
           'redReason': reason, 'redExitCode': red.returncode, 'bothCasesReachedRED': True,
           'exactProducerByteRestoration': True, 'producerSHA256': sha(original),
           'restoredGreenExitCode': green.returncode, 'ordinaryTypedCasesPassed': 2,
           'wholeV8RoundtripCheckedForBoth': True, 'artSourceDescriptor72FramesRegistryMappingUnchanged': True,
           'browserOrServerStarted': False, 'BlenderOrSourceArtMutatorStarted': False}
(OUT / 'actual-typed-producer-RED-exact-restore-GREEN.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
print('CLASSROOM_DESK_ACTUAL_PRODUCER_RED_EXACT_RESTORE_Q0_Q1_WHOLE_V8_GREEN; art/registry/mapping untouched')
