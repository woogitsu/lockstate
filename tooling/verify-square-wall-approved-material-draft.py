"""Real saved shader-value mutation and exact restoration; no extra matrix run."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / 'docs/research/2026-10-03-modern-square-wall-material-study'
BLENDER = Path('C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
PRODUCER = ROOT / 'tooling/blender/render-square-wall-approved-material-draft.py'
SOURCE = REPORT / 'draft.wall.square.brick.full.approved-materials.blend'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(name, flag):
    result = subprocess.run([str(BLENDER), '--background', '--factory-startup', '--threads', '1',
                             '--python-exit-code', '1', '--python', str(PRODUCER), '--', flag],
                            cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    (REPORT / (name + '.log')).write_text((result.stdout + result.stderr).rstrip() + '\n', encoding='utf-8', newline='\n')
    return {'exitCode': result.returncode, 'log': name + '.log'}


def main():
    original = SOURCE.read_bytes()
    receipt = json.loads((REPORT / 'actual-approved-material-variant.json').read_text(encoding='utf-8'))
    paths = {ROOT / path for path in receipt['protectedBefore']}
    paths.update([SOURCE, PRODUCER, REPORT / 'draft.wall.square.brick.full.literal-graphs.blend'])
    paths.update(ROOT / frame['image'] for frame in receipt['frames'] + receipt['joinedDiagnosticFrames'])
    before = {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}
    try:
        wrote = run('actual-approved-shader-mutant-write', '--mutate-saved-shader')
        mutant = sha(SOURCE)
        if wrote['exitCode'] != 0 or mutant == hashlib.sha256(original).hexdigest():
            raise RuntimeError('Actual saved wall shader mutant did not exist')
        red = run('actual-approved-shader-RED', '--verify-saved')
        if red['exitCode'] != 1:
            raise RuntimeError('Real approved wall producer accepted actual grey-footing mutant')
    finally:
        SOURCE.write_bytes(original)
    green = run('actual-approved-shader-exact-restore-GREEN', '--verify-saved')
    if green['exitCode'] != 0:
        raise RuntimeError('Exact original wall shader source restoration rejected')
    after = {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(paths)}
    if before != after:
        raise RuntimeError('Released or draft source/frames changed after exact restoration')
    proof = {'actualSavedMutantSha256': mutant, 'originalSourceSha256': sha(SOURCE), 'mutantWrite': wrote,
             'red': red, 'green': green, 'protectedCount': len(paths),
             'protectedBefore': before, 'protectedAfter': after, 'exactBytesRestored': True,
             'newPaletteColors': False, 'full72Run': False, 'nativeAcceptance': False}
    (REPORT / 'actual-approved-material-controls.json').write_text(json.dumps(proof, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({field: proof[field] for field in ['actualSavedMutantSha256', 'red', 'green', 'protectedCount', 'exactBytesRestored']}))


if __name__ == '__main__':
    main()
