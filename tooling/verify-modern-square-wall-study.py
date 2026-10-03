"""Actual owned saved wall draft mutations, exact restores and one bounded repeat."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / 'docs/research/2026-10-03-modern-square-wall-material-study'
BLENDER = Path('C:/Program Files/Blender Foundation/Blender 5.2/blender.exe')
SOURCE = REPORT / 'draft.wall.square.brick.full.literal-graphs.blend'
PRODUCER = ROOT / 'tooling/blender/render-modern-square-wall-study.py'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(name, flag):
    result = subprocess.run([str(BLENDER), '--background', '--factory-startup', '--threads', '1',
                             '--python-exit-code', '1', '--python', str(PRODUCER), '--', flag],
                            cwd=ROOT, capture_output=True, text=True, encoding='utf-8', errors='replace')
    (REPORT / (name + '.log')).write_text((result.stdout + result.stderr).rstrip() + '\n', encoding='utf-8', newline='\n')
    return {'exitCode': result.returncode, 'log': name + '.log'}


def main():
    proof = json.loads((REPORT / 'actual-before-after.json').read_text(encoding='utf-8'))
    original = SOURCE.read_bytes()
    paths = {ROOT / path for path in proof['protectedBefore']}
    paths.update([SOURCE, PRODUCER, ROOT / 'src/rendering/world/appearance.ts'])
    paths.update(ROOT / frame['image'] for frame in proof['frames'])
    held = {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in sorted(paths)}
    controls = []
    try:
        for name, flag in [('saved-cap-displaced', '--mutate-saved-geometry'),
                           ('saved-directional-key-omitted', '--mutate-saved-light'),
                           ('saved-camera-span-halved', '--mutate-saved-camera')]:
            wrote = run(name + '-actual-write', flag)
            mutant_sha = sha(SOURCE.read_bytes())
            if wrote['exitCode'] != 0 or mutant_sha == sha(original):
                raise RuntimeError('Owned source mutant was not actually saved: ' + name)
            red = run(name + '-RED', '--verify-saved')
            if red['exitCode'] == 0:
                raise RuntimeError('Real wall producer accepted actual saved mutant: ' + name)
            SOURCE.write_bytes(original)
            green = run(name + '-exact-restore-GREEN', '--verify-saved')
            if green['exitCode'] != 0:
                raise RuntimeError('Exact original wall draft restoration rejected: ' + name)
            controls.append({'name': name, 'actualSavedMutantSha256': mutant_sha,
                             'mutantWrite': wrote, 'red': red, 'green': green,
                             'restoredSourceSha256': sha(SOURCE.read_bytes())})
        repeat = run('actual-saved-first-pose-repeat', '--repeat-saved-first-pose')
        if repeat['exitCode'] != 0:
            raise RuntimeError('Saved source Cycles repeat failed')
    finally:
        SOURCE.write_bytes(original)
    after = {path.relative_to(ROOT).as_posix(): sha(path.read_bytes()) for path in sorted(paths)}
    if held != after:
        raise RuntimeError('Protected released or owned source/frame files changed')
    receipt = {'controls': controls, 'repeat': repeat, 'repeatPNGByteExact': True,
               'protectedCount': len(paths), 'protectedBefore': held, 'protectedAfter': after,
               'sourceSha256': sha(original), 'exactBytesRestored': True,
               'full72Run': False, 'productionDispatchChanged': False, 'nativeRun': False}
    (REPORT / 'actual-saved-draft-controls.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8', newline='\n')
    print(json.dumps({'controls': controls, 'protectedCount': len(paths), 'repeatPNGByteExact': True,
                      'exactBytesRestored': True}))


if __name__ == '__main__':
    main()
