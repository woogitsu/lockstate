"""Bounded actual saved draft .blend controls and one sample repeat; never builds/opens a browser."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / 'docs/research/2026-10-03-modern-retained-material-lighting'
BLENDER = Path('C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
SOURCE = ROOT / 'assets/source/blender/draft.laundry.linen-rack.soft-light.blend'
PRODUCER = ROOT / 'tooling/blender/render-modern-retained-material-draft.py'
original = SOURCE.read_bytes()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(name, flag):
    result = subprocess.run([str(BLENDER), '--background', '--factory-startup', '--threads', '1', '--python-exit-code', '1', '--python', str(PRODUCER), '--', flag], cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    (REPORT / (name + '.log')).write_text((result.stdout + result.stderr).rstrip() + '\n', encoding='utf-8', newline='\n')
    return {'exitCode': result.returncode, 'log': name + '.log'}


proof = json.loads((REPORT / 'actual-before-after.json').read_text(encoding='utf-8'))
protected = [ROOT / path for path in proof['protectedBefore']]
protected += [SOURCE, PRODUCER, ROOT / 'src/rendering/world/appearance.ts']
protected += [ROOT / frame['image'] for frame in proof['frames']]
before = {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in protected}
controls = []
try:
    for name, flag in [('saved-linen-disconnected', '--mutate-saved-disconnect'), ('saved-key-light-omitted', '--mutate-saved-light-omit'), ('saved-camera-span-halved', '--mutate-saved-camera')]:
        wrote = run(name + '-mutant-written', flag)
        mutant_sha = sha(SOURCE.read_bytes())
        if wrote['exitCode'] != 0 or mutant_sha == sha(original):
            raise RuntimeError('actual owned draft mutation was not saved: ' + name)
        red = run(name + '-RED', '--verify-saved')
        if red['exitCode'] == 0:
            raise RuntimeError('semantic draft guard accepted real saved mutant: ' + name)
        SOURCE.write_bytes(original)
        green = run(name + '-exact-restore-GREEN', '--verify-saved')
        if green['exitCode'] != 0:
            raise RuntimeError('exact draft source restoration did not pass: ' + name)
        controls.append({'name': name, 'mutantWrite': wrote, 'actualSavedMutantSha256': mutant_sha, 'red': red, 'green': green, 'draftSourceRestoredSha256': sha(SOURCE.read_bytes())})
    repeat = run('actual-one-source60-repeat', '--repeat60-only')
    if repeat['exitCode'] != 0:
        raise RuntimeError('bounded genuine Cycles sample repeat failed')
    actual = json.loads((REPORT / 'actual-repeat60.json').read_text(encoding='utf-8'))['frames'][0]
    expected = next(frame for frame in proof['frames'] if frame['stage'] == 'after-soft-original-materials' and frame['yaw'] == 60)
    if actual['sha256'] != expected['sha256']:
        raise RuntimeError('fixed one-thread genuine Cycles sample is not byte-exact reproducible')
finally:
    SOURCE.write_bytes(original)
after = {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in protected}
if before != after:
    raise RuntimeError('protected released source/palette/72frames/draft bytes changed')
(REPORT / 'actual-saved-draft-controls.json').write_text(json.dumps({'controls': controls, 'repeat': repeat, 'repeatPNGByteExact': True, 'protectedCount': len(protected), 'protectedBefore': before, 'protectedAfter': after, 'originalDraftSha256': sha(original), 'exactBytesRestored': True, 'productionDispatchChanged': False, 'full72Run': False, 'nativeRun': False}, indent=2) + '\n', encoding='utf-8', newline='\n')
print(json.dumps({'controls': controls, 'repeatPNGByteExact': True, 'protectedCount': len(protected), 'exactBytesRestored': True}))
